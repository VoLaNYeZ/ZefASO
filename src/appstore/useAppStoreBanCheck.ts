import { useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const APPSTORE_STATUS_CACHE_PREFIX = 'zeyfaso_appstore_status_v1';
const LEGACY_BANNED_APPIDS_CACHE_PREFIX = 'zeyfaso_banned_appids_v1';
const APPSTORE_OK_TTL_MS = 1000 * 60 * 60 * 24; // 24h

type AppStoreStatusCacheEntry = { status: 'banned' | 'ok'; checkedAt?: number };
type AppStoreStatusCache = Record<string, AppStoreStatusCacheEntry>;

export const extractNumericId = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const match = raw.match(/(\d+)/);
    return match ? match[0] : null;
};

const normalizeItunesCountryCode = (geo: unknown): string | null => {
    if (typeof geo !== 'string') return null;
    const code = geo.trim().toUpperCase();
    if (!code) return null;

    const isoMap: Record<string, string> = {
        'UK': 'GB',
        'EN': 'GB',
        'SW': 'SE',
        'PO': 'PL',
        'UAE': 'AE',
        'DUBAI': 'AE',
        'BALI': 'ID',
        'INDONESIA': 'ID',
        'CANADA': 'CA',
    };

    const out = isoMap[code] || code;
    if (!/^[A-Z]{2}$/.test(out)) return null;
    return out;
};

const getAppStoreStatusStorageKey = (userId: string) => `${APPSTORE_STATUS_CACHE_PREFIX}_${userId}`;
const getLegacyBannedAppIdsStorageKey = (userId: string) => `${LEGACY_BANNED_APPIDS_CACHE_PREFIX}_${userId}`;

const readAppStoreStatusCache = (userId: string): AppStoreStatusCache => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(getAppStoreStatusStorageKey(userId));
        if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const obj = parsed as Record<string, any>;
                const out: AppStoreStatusCache = {};
                Object.entries(obj).forEach(([id, entry]) => {
                    const numericId = typeof id === 'string' && /^\d+$/.test(id) ? id : null;
                    const status = entry?.status === 'banned' || entry?.status === 'ok' ? entry.status : null;
                    if (!numericId || !status) return;
                    const checkedAt = typeof entry?.checkedAt === 'number' && Number.isFinite(entry.checkedAt) ? entry.checkedAt : undefined;
                    out[numericId] = { status, checkedAt };
                });
                return out;
            }
        }

        const legacyRaw = window.localStorage.getItem(getLegacyBannedAppIdsStorageKey(userId));
        if (!legacyRaw) return {};
        const legacyParsed: unknown = JSON.parse(legacyRaw);
        if (!Array.isArray(legacyParsed)) return {};
        const out: AppStoreStatusCache = {};
        legacyParsed
            .filter((v): v is string => typeof v === 'string' && /^\d+$/.test(v.trim()))
            .forEach(v => {
                out[v.trim()] = { status: 'banned' };
            });
        return out;
    } catch {
        return {};
    }
};

const writeAppStoreStatusCache = (userId: string, cache: AppStoreStatusCache) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getAppStoreStatusStorageKey(userId), JSON.stringify(cache || {}));
    } catch {
        // Ignore storage errors
    }
};

const isOkFresh = (entry: AppStoreStatusCacheEntry | undefined) => {
    if (!entry || entry.status !== 'ok') return false;
    if (typeof entry.checkedAt !== 'number' || !Number.isFinite(entry.checkedAt)) return false;
    return (Date.now() - entry.checkedAt) < APPSTORE_OK_TTL_MS;
};

export type UseAppStoreBanCheckInput = {
    supabase: SupabaseClient;
    sessionUserId: string | null;
    dataLoading: boolean;
    activeApps: string[];
    latestIdByGroup: Record<string, string>;
    data: Array<{ appName: string; appGroup?: string; geo: string; date: string }>;
};

export const useAppStoreBanCheck = (input: UseAppStoreBanCheckInput) => {
    const { supabase, sessionUserId, dataLoading, activeApps, latestIdByGroup, data } = input;

    const latestGeoByGroup = useMemo(() => {
        const map: Record<string, { geo: string; date: string }> = {};
        data.forEach(item => {
            const group = item.appGroup || item.appName;
            const geo = typeof item.geo === 'string' ? item.geo : '';
            const date = typeof item.date === 'string' ? item.date : '';
            if (!group || !geo || !date) return;
            const existing = map[group];
            if (!existing || date > existing.date) map[group] = { geo, date };
        });
        const out: Record<string, string> = {};
        Object.entries(map).forEach(([group, v]) => {
            out[group] = v.geo;
        });
        return out;
    }, [data]);

    const [bannedAppIds, setBannedAppIds] = useState<Record<string, true>>({});
    const bannedAppIdsRef = useRef(bannedAppIds);
    useEffect(() => {
        bannedAppIdsRef.current = bannedAppIds;
    }, [bannedAppIds]);

    const appStoreStatusCacheRef = useRef<AppStoreStatusCache>({});
    const banCheckAttemptedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        banCheckAttemptedRef.current = new Set();
        if (!sessionUserId) {
            appStoreStatusCacheRef.current = {};
            setBannedAppIds({});
            return;
        }

        const cache = readAppStoreStatusCache(sessionUserId);
        appStoreStatusCacheRef.current = cache;

        const record: Record<string, true> = {};
        Object.entries(cache).forEach(([id, entry]) => {
            if (entry?.status !== 'banned') return;
            record[id] = true;
            banCheckAttemptedRef.current.add(id);
        });
        setBannedAppIds(record);
    }, [sessionUserId]);

    useEffect(() => {
        if (!sessionUserId || dataLoading) return;
        let isMounted = true;

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const run = async () => {
            await sleep(1800);

            for (const appKey of activeApps) {
                if (!isMounted) return;

                const numericId = extractNumericId(latestIdByGroup[appKey]);
                if (!numericId) continue;

                const cached = appStoreStatusCacheRef.current[numericId];
                if (cached?.status === 'banned') continue;
                if (bannedAppIdsRef.current[numericId]) continue;
                if (isOkFresh(cached)) continue;
                if (banCheckAttemptedRef.current.has(numericId)) continue;
                banCheckAttemptedRef.current.add(numericId);

                const geoCandidate = latestGeoByGroup[appKey] || 'US';
                const country = normalizeItunesCountryCode(geoCandidate) || 'US';

                try {
                    const targetUrl = `https://itunes.apple.com/lookup?id=${numericId}&country=${country}`;
                    const { data: itunesData, error } = await supabase.functions.invoke('itunes-proxy', {
                        body: { url: targetUrl }
                    });

                    if (!isMounted) return;
                    if (error) continue;

                    const resultCount = (itunesData as any)?.resultCount;
                    if (typeof resultCount !== 'number') continue;

                    if (resultCount === 0) {
                        setBannedAppIds(prev => (prev[numericId] ? prev : { ...prev, [numericId]: true }));
                        const nextCache: AppStoreStatusCache = {
                            ...appStoreStatusCacheRef.current,
                            [numericId]: { status: 'banned' }
                        };
                        appStoreStatusCacheRef.current = nextCache;
                        writeAppStoreStatusCache(sessionUserId, nextCache);
                    } else if (resultCount > 0) {
                        const nextCache: AppStoreStatusCache = {
                            ...appStoreStatusCacheRef.current,
                            [numericId]: { status: 'ok', checkedAt: Date.now() }
                        };
                        appStoreStatusCacheRef.current = nextCache;
                        writeAppStoreStatusCache(sessionUserId, nextCache);
                    }
                } catch {
                    // Unknown - do not show ban status
                }

                await sleep(500);
            }
        };

        run();

        return () => {
            isMounted = false;
        };
    }, [supabase, sessionUserId, dataLoading, activeApps, latestIdByGroup, latestGeoByGroup]);

    return { bannedAppIds };
};

