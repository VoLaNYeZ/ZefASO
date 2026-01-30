
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
    LayoutDashboard,
    BarChart2,
    Plus,
    TrendingUp,
    DollarSign,
    Menu,
    BrainCircuit,
    Settings,
    Archive,
    RefreshCw,
    Hash,
    ChevronDown,
    ChevronUp,
    Trash2,
    CalendarClock,
    Globe,
    Search,
    AlertTriangle,
    X,
    ExternalLink,
    Maximize2,
    Minimize2,
    Layout,
    LayoutList,
    FilterX,
    FolderPlus,
    Folder,
    FolderOpen,
    MoreVertical,
    Edit2,
    FolderPen,
    Check,
    ChevronRight,
    ArrowUp,
    ArrowDown,
    LayoutGrid,
    Trophy,
    Flame,
    Award,
    Star,
    Wheat,
    GitCompare,
    FlaskConical,
    Sun,
    Moon,
    Languages,
    LogOut,
    Bell,
    Loader2
} from 'lucide-react';
import { INITIAL_DATA } from './constants';
import { AsoEntry, AppAlias, CompetitorDetection, CompetitorTarget, FilterState, Granularity } from './types';
import { translations } from './i18n';
import { DashboardCharts } from './components/DashboardCharts';
import { DataUploadModal } from './components/DataUploadModal';
import { DateRangePicker } from './components/DateRangePicker';
import { analyzeASOTrends } from './services/openaiService';
import { OverviewDashboard } from './components/OverviewDashboard';
import { RealtimeStandings } from './components/RealtimeStandings';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { KeywordSuggester } from './components/KeywordSuggester';
import { supabase } from './lib/supabase';
import { LoginPage } from './components/LoginPage';
import { Session } from '@supabase/supabase-js';
import { loadAsoData, saveAsoData, loadAppSettings, saveAppSettings, loadUserPreferences, saveUserPreferences, checkGoogleSheetsSyncExists, checkIsExistingUser, loadAppAliases, saveAppAliasesForApp, deleteAsoEntriesForAppGroup, loadWarningsSettings, loadCompetitorDetections, setCompetitorDetectionIgnored, loadCompetitorTargets, upsertCompetitorTarget, setCompetitorTargetActive, setCompetitorTargetsActive, deleteCompetitorDetectionsForApp, loadAppFolderMap, upsertAppFolderMapEntries, deleteAppFolderMapEntries } from './lib/supabaseService';
import { fetchSheetData, fetchSheetTabs, processSheetData } from './services/googleSheets';
import { ALL_TABS_SENTINEL, buildStoredTabsAllExcept, resolveTabsToSync } from './utils/googleSheetsSync';
import { BalancePanel } from './components/BalancePanel';
import { AppAliasManager } from './components/AppAliasManager';
import { WarningsPage } from './src/warnings/WarningsPage';
import { computeWarnings } from './src/warnings/computeWarnings';
import { addDays, formatDate } from './src/warnings/date';
import { cloneDefaultWarningsRules } from './src/warnings/defaults';
import type { WarningRuleId, WarningRuleSetting, WarningsSettings } from './src/warnings/types';
import { extractNumericId, useAppStoreBanCheck } from './src/appstore/useAppStoreBanCheck';
import { toIsoCountryCode } from './utils/geo';

const VIEW_MODE_COOKIE = 'zeyf_view_mode';
const TRACK_STOPWORDS = new Set([
    'app',
    'apps',
    'pro',
    'lite',
    'free',
    'the',
    'and',
    'for',
    'mobile',
    'official',
    'studio',
    'vpn',
    'ai',
    'tool',
    'tools',
    'editor',
    'photo',
    'video',
    'music',
    'game',
    'games',
    'plus'
]);

const readViewModeCookie = (): 'full' | 'mini' | 'combined' => {
    if (typeof document === 'undefined') return 'mini';
    const match = document.cookie.match(new RegExp(`${VIEW_MODE_COOKIE}=([^;]+)`));
    const value = match ? decodeURIComponent(match[1]) : null;
    if (value === 'full' || value === 'mini' || value === 'combined') {
        return value;
    }
    return 'mini';
};

const persistViewModeCookie = (mode: 'full' | 'mini' | 'combined') => {
    if (typeof document === 'undefined') return;
    const maxAge = 60 * 60 * 24 * 180; // 180 days
    document.cookie = `${VIEW_MODE_COOKIE}=${encodeURIComponent(mode)}; path=/; max-age=${maxAge}`;
};

const buildDefaultWarningsSettings = (
    categories: string[],
    appKeys: string[],
    opts?: { monitorEnabledDefault?: boolean; initialized?: boolean }
): WarningsSettings => {
    const monitorEnabledDefault = typeof opts?.monitorEnabledDefault === 'boolean' ? opts.monitorEnabledDefault : true;
    const initialized = typeof opts?.initialized === 'boolean' ? opts.initialized : false;

    const safeCats = (Array.isArray(categories) ? categories : [])
        .filter(c => typeof c === 'string' && c.trim() && c.trim() !== 'Uncategorized')
        .map(c => c.trim());

    const folderNames = Array.from(new Set([...safeCats, 'Uncategorized']));

    const folders: Record<string, { monitorEnabled: boolean }> = {};
    folderNames.forEach(name => {
        folders[name] = { monitorEnabled: monitorEnabledDefault };
    });

    const apps: Record<string, { rules: Record<WarningRuleId, WarningRuleSetting> }> = {};
    (Array.isArray(appKeys) ? appKeys : [])
        .map(k => (typeof k === 'string' ? k.trim() : ''))
        .filter(Boolean)
        .forEach(appKey => {
            apps[appKey] = { rules: cloneDefaultWarningsRules() };
        });

    return { initialized, folders, apps };
};

const mergeWarningsSettings = (saved: WarningsSettings | null | undefined, defaults: WarningsSettings): WarningsSettings => {
    const mergedFolders: Record<string, { monitorEnabled: boolean }> = { ...(defaults.folders || {}) };
    Object.keys(saved?.folders || {}).forEach(folder => {
        const savedEnabled = saved?.folders?.[folder]?.monitorEnabled;
        const fallback = mergedFolders[folder]?.monitorEnabled ?? true;
        mergedFolders[folder] = { monitorEnabled: typeof savedEnabled === 'boolean' ? savedEnabled : fallback };
    });

    const allAppKeys = new Set<string>([
        ...Object.keys(defaults.apps || {}),
        ...Object.keys(saved?.apps || {})
    ]);

    const mergedApps: Record<string, { rules: Record<WarningRuleId, WarningRuleSetting> }> = {};

    allAppKeys.forEach(appKey => {
        if (!appKey) return;

        const baseRules: Record<string, any> = cloneDefaultWarningsRules();
        const defaultRules: Record<string, any> = (defaults.apps?.[appKey]?.rules as any) || {};
        const savedRules: Record<string, any> = (saved?.apps?.[appKey]?.rules as any) || {};

        Object.keys(defaultRules).forEach(ruleId => {
            const cur = baseRules[ruleId] || {};
            const incoming = defaultRules[ruleId] || {};
            baseRules[ruleId] = {
                ...cur,
                ...incoming,
                params: { ...(cur.params || {}), ...(incoming.params || {}) }
            };
        });

        Object.keys(savedRules).forEach(ruleId => {
            const cur = baseRules[ruleId] || { enabled: true };
            const incoming = savedRules[ruleId] || {};
            baseRules[ruleId] = {
                ...cur,
                ...incoming,
                enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : cur.enabled,
                params: { ...(cur.params || {}), ...(incoming.params || {}) }
            };
        });

        mergedApps[appKey] = {
            ...(defaults.apps?.[appKey] || {}),
            ...(saved?.apps?.[appKey] || {}),
            rules: baseRules as any
        };
    });

    const out: WarningsSettings = {
        initialized: typeof saved?.initialized === 'boolean' ? saved.initialized : defaults.initialized,
        folders: mergedFolders,
        apps: mergedApps
    };
    if (saved?.ignored) out.ignored = saved.ignored;
    return out;
};

const App = () => {
    const mainContentRef = useRef<HTMLDivElement>(null);
    // -- Auth State --
    const [session, setSession] = useState<Session | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const sessionUserId = session?.user?.id ?? null;

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // -- State: Data Persistence --
    const [dataLoading, setDataLoading] = useState(true);
    const [data, setData] = useState<AsoEntry[]>([]);
    const [hiddenApps, setHiddenApps] = useState<string[]>([]);
    const [appIcons, setAppIcons] = useState<Record<string, string>>({});
    const [categories, setCategories] = useState<string[]>(['General']);
    const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
    const [appCategoryMap, setAppCategoryMap] = useState<Record<string, string>>({});
    const [warningsSettings, setWarningsSettings] = useState<WarningsSettings>(() =>
        buildDefaultWarningsSettings(['General'], [], { monitorEnabledDefault: false, initialized: false })
    );
    const [competitorDetections, setCompetitorDetections] = useState<CompetitorDetection[]>([]);
    const [competitorTargets, setCompetitorTargets] = useState<CompetitorTarget[]>([]);
    const [competitorRefreshing, setCompetitorRefreshing] = useState(false);
    const [competitorTrackingByApp, setCompetitorTrackingByApp] = useState<Record<string, boolean>>({});
    const [competitorTrackingByFolder, setCompetitorTrackingByFolder] = useState<Record<string, boolean>>({});
    const [lang, setLang] = useState<'en' | 'ru'>('en');
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [isSyncConfigured, setIsSyncConfigured] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
    const [showSyncSuccess, setShowSyncSuccess] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);

    // Ref to track appIcons for background fetcher to avoid stale closures
    const appIconsRef = useRef(appIcons);
    useEffect(() => {
        appIconsRef.current = appIcons;
    }, [appIcons]);

    // Track data ref so async loaders don't overwrite fresh imports
    const dataRef = useRef<AsoEntry[]>([]);
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    // Track if we've already loaded data to prevent reloading on tab switch
    const hasLoadedData = useRef(false);
    const currentUserId = useRef<string | null>(null);
    const hasUserAddedData = useRef(false);
    const hasRunAutoSync = useRef(false);
    const asoRefreshTtlMs = 12 * 60 * 60 * 1000;
    const lastAsoRefreshRef = useRef(0);
    const asoRefreshIdRef = useRef(0);

    // Load initial data from Supabase when authenticated
    useEffect(() => {
        if (!session) {
            setDataLoading(false);
            setData([]);
            hasLoadedData.current = false;
            currentUserId.current = null;
            hasUserAddedData.current = false;
            lastAsoRefreshRef.current = 0;
            asoRefreshIdRef.current += 1;
            setWarningsSettings(buildDefaultWarningsSettings(['General'], [], { monitorEnabledDefault: false, initialized: false }));
            setCompetitorDetections([]);
            setCompetitorTargets([]);
            return;
        }

        const userId = session.user.id;

        // Only load data if we haven't loaded for this user yet
        if (hasLoadedData.current && currentUserId.current === userId) {
            return;
        }

        const loadInitialData = async () => {
            setDataLoading(true);
            try {
                const [asoDataRaw, appSettings, userPrefs, hasSyncConfig, isExistingUser, syncResult, aliases, savedWarningsSettings, loadedCompetitors, loadedCompetitorTargets, folderMap] = await Promise.all([
                    loadAsoData(),
                    loadAppSettings(),
                    loadUserPreferences(),
                    checkGoogleSheetsSyncExists(),
                    checkIsExistingUser(),
                    supabase.from('google_sheets_sync').select('last_synced_at').eq('user_id', userId).maybeSingle(),
                    loadAppAliases(),
                    loadWarningsSettings(),
                    loadCompetitorDetections(),
                    loadCompetitorTargets(),
                    loadAppFolderMap()
                ]);

                const testAppNames = new Set(['SecretBen', 'FitnessPro']);
                const asoData = asoDataRaw.filter(d => !testAppNames.has(d.appName));

                // Update sync state
                if (syncResult.data) {
                    setLastSyncedAt(syncResult.data.last_synced_at);
                }

                const shouldHydrateData = !hasUserAddedData.current && dataRef.current.length === 0;

                const dataForWarningsDefaults = (() => {
                    if (!shouldHydrateData) return dataRef.current;
                    if (asoData.length > 0) return asoData;
                    if (!hasSyncConfig && !isExistingUser) return INITIAL_DATA;
                    return [];
                })();

                const appKeysForWarnings = Array.from(new Set<string>(
                    dataForWarningsDefaults
                        .map(d => (d.appGroup || d.appName))
                        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
                ));

                const hasSavedWarnings = !!savedWarningsSettings;
                const defaultWarnings = buildDefaultWarningsSettings(appSettings.categories, appKeysForWarnings, {
                    monitorEnabledDefault: hasSavedWarnings,
                    initialized: hasSavedWarnings
                });
                const mergedWarnings = mergeWarningsSettings(savedWarningsSettings, defaultWarnings);
                setWarningsSettings(mergedWarnings);
                setCompetitorDetections(Array.isArray(loadedCompetitors) ? loadedCompetitors : []);
                setCompetitorTargets(Array.isArray(loadedCompetitorTargets) ? loadedCompetitorTargets : []);

                // Only show INITIAL_DATA if this is a brand new user:
                // 1. No data loaded AND
                // 2. No Google Sheets sync configured AND
                // 3. User has never saved any settings (truly new user)
                // If user has used the app before but deleted all data → show empty state
                if (shouldHydrateData) {
                    if (asoData.length > 0) {
                        setData(asoData);
                    } else if (!hasSyncConfig && !isExistingUser) {
                        // Brand new user - show demo data
                        setData(INITIAL_DATA);
                    } else {
                        // Either sync configured OR user has used the app before - show empty state
                        setData([]);
                    }
                }

                setAppIcons(appSettings.appIcons);
                setCategories(appSettings.categories);
                const resolvedFolderMap = {
                    ...(appSettings.appCategoryMap || {}),
                    ...(folderMap || {})
                };
                setAppCategoryMap(resolvedFolderMap);
                setCollapsedCategories(appSettings.collapsedCategories);
                setHiddenApps(userPrefs.hiddenApps);
                setLang(userPrefs.lang);
                setTheme(userPrefs.theme);
                setIsSyncConfigured(hasSyncConfig);
                const groupedAliases = aliases.reduce<Record<string, AppAlias[]>>((acc, alias) => {
                    if (!acc[alias.appName]) acc[alias.appName] = [];
                    acc[alias.appName].push(alias);
                    return acc;
                }, {});
                setAppAliases(groupedAliases);

                lastAsoRefreshRef.current = Date.now();
                if (appSettings.appCategoryMap && Object.keys(appSettings.appCategoryMap).length > 0) {
                    const existing = folderMap || {};
                    const entries = Object.entries(appSettings.appCategoryMap)
                        .filter(([appKey, folder]) => appKey && folder && !existing[appKey])
                        .map(([appKey, folder]) => ({ appKey, folder }));
                    if (entries.length > 0) {
                        upsertAppFolderMapEntries(entries).catch((error) => {
                            console.warn('Failed to backfill app folder map:', error);
                        });
                    }
                }

                hasLoadedData.current = true;
                currentUserId.current = userId;
            } catch (error) {
                console.error('Error loading data from Supabase:', error);
                setLoadFailed(true);
                // On error, show empty state instead of potentially confusing demo data
                setData([]);
            } finally {
                setDataLoading(false);
            }
        };

        loadInitialData();
    }, [session]);

    const refreshAsoData = useCallback(async () => {
        if (!session) return;
        const refreshId = ++asoRefreshIdRef.current;
        try {
            const asoDataRaw = await loadAsoData();
            if (refreshId !== asoRefreshIdRef.current) return;
            const testAppNames = new Set(['SecretBen', 'FitnessPro']);
            const asoData = asoDataRaw.filter(d => !testAppNames.has(d.appName));
            setData(asoData);
            lastAsoRefreshRef.current = Date.now();
        } catch (error) {
            console.error('Error refreshing ASO data:', error);
        }
    }, [session]);

    useEffect(() => {
        if (!session) return;

        const maybeRefresh = () => {
            if (dataLoading || isSyncing) return;
            const now = Date.now();
            const last = lastAsoRefreshRef.current;
            if (last && now - last < asoRefreshTtlMs) return;
            refreshAsoData();
        };

        const onFocus = () => maybeRefresh();
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') maybeRefresh();
        };

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [session, dataLoading, isSyncing, refreshAsoData, asoRefreshTtlMs]);



    // Save to Supabase (debounced, separated to avoid stale settings overwrites)
    const saveDataTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const saveSettingsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
    const savePrefsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        if (!session || dataLoading || loadFailed) return;
        clearTimeout(saveDataTimeoutRef.current);
        saveDataTimeoutRef.current = setTimeout(async () => {
            try {
                await saveAsoData(data);
            } catch (error) {
                console.error('Failed to save data:', error);
            }
        }, 1000);
        return () => clearTimeout(saveDataTimeoutRef.current);
    }, [data, session, dataLoading, loadFailed]);

    useEffect(() => {
        if (!session || dataLoading || loadFailed) return;
        clearTimeout(saveSettingsTimeoutRef.current);
        saveSettingsTimeoutRef.current = setTimeout(async () => {
            try {
                await saveAppSettings({
                    appIcons,
                    categories,
                    appCategoryMap,
                    collapsedCategories
                });
            } catch (error) {
                console.error('Failed to save app settings:', error);
            }
        }, 1000);
        return () => clearTimeout(saveSettingsTimeoutRef.current);
    }, [appIcons, categories, appCategoryMap, collapsedCategories, session, dataLoading, loadFailed]);

    useEffect(() => {
        if (!session || dataLoading || loadFailed) return;
        clearTimeout(savePrefsTimeoutRef.current);
        savePrefsTimeoutRef.current = setTimeout(async () => {
            try {
                await saveUserPreferences({ lang, theme, hiddenApps });
            } catch (error) {
                console.error('Failed to save user preferences:', error);
            }
        }, 1000);
        return () => clearTimeout(savePrefsTimeoutRef.current);
    }, [lang, theme, hiddenApps, session, dataLoading, loadFailed]);

    // -- Cross-Tab Synchronization --
    const isRemoteUpdate = useRef(false);
    const broadcastChannel = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        return () => {
            if (tickleTimeoutRef.current) clearTimeout(tickleTimeoutRef.current);
        };
    }, []);

    // Initialize channel once and handle incoming messages
    useEffect(() => {
        broadcastChannel.current = new BroadcastChannel('zeyfaso_sync');

        broadcastChannel.current.onmessage = (event) => {
            if (event.data.type === 'SYNC_UPDATE') {
                const { payload } = event.data;

                // Mark as remote update to prevent re-broadcasting
                isRemoteUpdate.current = true;

                // Apply updates
                if (payload.theme) setTheme(payload.theme);
                if (payload.lang) setLang(payload.lang);
                if (payload.categories) setCategories(payload.categories);
                if (payload.appIcons) setAppIcons(payload.appIcons);
                if (payload.appCategoryMap) setAppCategoryMap(payload.appCategoryMap);
                if (payload.collapsedCategories) setCollapsedCategories(payload.collapsedCategories);
                if (payload.hiddenApps) setHiddenApps(payload.hiddenApps);

                // Reset flag after React processes the updates
                requestAnimationFrame(() => {
                    isRemoteUpdate.current = false;
                });
            }
        };

        return () => {
            broadcastChannel.current?.close();
        };
    }, []); // Empty deps - only run once

    // Realtime sync for per-app folder map
    useEffect(() => {
        if (!sessionUserId) return;
        const channel = supabase.channel(`app_folder_map:${sessionUserId}`);

        channel.on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'app_folder_map',
            filter: `user_id=eq.${sessionUserId}`
        }, (payload) => {
            const next = payload.new as any;
            const old = payload.old as any;
            if (payload.eventType === 'DELETE') {
                const appKey = typeof old?.app_key === 'string' ? old.app_key : '';
                if (!appKey) return;
                setAppCategoryMap((prev) => {
                    if (!prev?.[appKey]) return prev;
                    const updated = { ...prev };
                    delete updated[appKey];
                    return updated;
                });
                return;
            }

            const appKey = typeof next?.app_key === 'string' ? next.app_key : '';
            const folder = typeof next?.folder === 'string' ? next.folder : '';
            if (!appKey || !folder) return;
            setAppCategoryMap((prev) => {
                if (prev?.[appKey] === folder) return prev;
                return { ...prev, [appKey]: folder };
            });
        });

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, sessionUserId]);

    // Broadcast local changes to other tabs
    useEffect(() => {
        // Skip if this change came from another tab
        if (isRemoteUpdate.current || !broadcastChannel.current) return;

        broadcastChannel.current.postMessage({
            type: 'SYNC_UPDATE',
            payload: {
                theme,
                lang,
                categories,
                appIcons,
                appCategoryMap,
                collapsedCategories,
                hiddenApps
            }
        });
    }, [theme, lang, categories, appIcons, appCategoryMap, collapsedCategories, hiddenApps]);

    // Theme Effects
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme, session]);

    // -- Localization Dictionary --
    const t = useMemo(() => {
        return translations[lang];
    }, [lang]);

    // -- UI State --
    const [currentPage, setCurrentPage] = useState<'dashboard' | 'overview' | 'lab' | 'warnings'>('overview');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [aiAnalysisMeta, setAiAnalysisMeta] = useState<{ start: string; end: string; rows: number; days: number } | null>(null);
    const aiAnalysisRef = useRef<HTMLDivElement | null>(null);
    const aiAnalysisScrollKeyRef = useRef<string>('');
    const aiAnalysisCacheRef = useRef<Record<string, { analysis: string; meta: { start: string; end: string; rows: number; days: number } | null; updatedAt: number }>>({});
    const aiAnalysisCacheKeyRef = useRef<string>('');
    const aiAnalysisReqIdRef = useRef(0);
    const aiAnalysisShouldScrollRef = useRef(false);
    const [isHiddenSectionOpen, setIsHiddenSectionOpen] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
    const [deleteAllConfirmation, setDeleteAllConfirmation] = useState(false);
    const [viewMode, setViewMode] = useState<'full' | 'mini' | 'combined'>(() => readViewModeCookie());
    const [appAliases, setAppAliases] = useState<Record<string, AppAlias[]>>({});
    const defaultAliasPrefix = useMemo(() => {
        const counts: Record<string, number> = {};
        (Object.values(appAliases) as AppAlias[][]).forEach(list => {
            list.forEach(alias => {
                if (alias.prefix) {
                    counts[alias.prefix] = (counts[alias.prefix] || 0) + 1;
                }
            });
        });
        let best: string | null = null;
        let bestCount = 0;
        Object.entries(counts).forEach(([prefix, count]) => {
            if (count > bestCount) {
                best = prefix;
                bestCount = count;
            }
        });
        return best;
    }, [appAliases]);
    const [tickleCount, setTickleCount] = useState(0);
    const [isTickling, setIsTickling] = useState(false);
    const [tickleMsg, setTickleMsg] = useState<string | null>(null);
    const tickleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{
        message: string;
        subMessage?: string;
        confirmText?: string;
        cancelText?: string;
        resolve: (value: boolean) => void;
    } | null>(null);

    const formatAliasLabel = (alias?: AppAlias | null) => {
        if (!alias || (!alias.prefix && !alias.number)) return null;
        if (alias.prefix && alias.number) return `${alias.prefix}-${alias.number}`;
        return alias.prefix || alias.number;
    };

    const requestConfirmation = (opts: {
        message: string;
        subMessage?: string;
        confirmText?: string;
        cancelText?: string;
    }) => {
        return new Promise<boolean>((resolve) => {
            setConfirmDialog({ ...opts, resolve });
        });
    };

    const closeConfirmDialog = (value: boolean) => {
        setConfirmDialog((prev) => {
            if (prev) prev.resolve(value);
            return null;
        });
    };

    useEffect(() => {
        persistViewModeCookie(viewMode);
    }, [viewMode]);


    const handleSaveAliases = async (appName: string, rows: { appId: string; prefix: string; number: string; isPrimary: boolean }[]) => {
        const cleaned = rows.map(r => ({
            appId: r.appId,
            prefix: (r.prefix || '').toUpperCase().slice(0, 2),
            number: (r.number || '').slice(0, 6),
            isPrimary: r.isPrimary
        }));
        const saved = await saveAppAliasesForApp(appName, cleaned);
        setAppAliases(prev => ({ ...prev, [appName]: saved }));
    };

    const normalizeTrackName = (value: string) => {
        if (!value) return '';
        return value
            .normalize('NFKD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    };

    const getTrackTokens = (value: string) => {
        const normalized = normalizeTrackName(value);
        if (!normalized) return [];
        return normalized
            .split(/\s+/)
            .filter(token => token && !TRACK_STOPWORDS.has(token));
    };

    const isShortTrackName = (value: string) => {
        const tokens = getTrackTokens(value);
        const joined = tokens.join('');
        return joined.length > 0 && joined.length <= 3;
    };

    const computeKeywordGeoPairs = (appKey: string, maxPairs?: number) => {
        const pairsMap = new Map<string, { keyword: string; geo: string; installs: number }>();
        const appIdInstalls = new Map<string, number>();
        let rangeStart = '';
        let rangeEnd = '';

        data.forEach((row) => {
            const group = (row.appGroup || row.appName || '').trim();
            if (!group || group !== appKey) return;
            if (row.date) {
                if (!rangeStart || row.date < rangeStart) rangeStart = row.date;
                if (!rangeEnd || row.date > rangeEnd) rangeEnd = row.date;
            }

            const keyword = (row.keyword || '').trim();
            const geo = (row.geo || '').trim();
            if (!keyword || !geo) return;
            if (keyword.toLowerCase() === 'all' || geo.toLowerCase() === 'all') return;

            const installs = Number(row.installs) || 0;
            const pairKey = `${keyword}::${geo}`;
            const current = pairsMap.get(pairKey) || { keyword, geo, installs: 0 };
            current.installs += installs;
            pairsMap.set(pairKey, current);

            const appId = (row.appId || '').trim();
            if (appId) {
                appIdInstalls.set(appId, (appIdInstalls.get(appId) || 0) + installs);
            }
        });

        let pairs = Array.from(pairsMap.values())
            .sort((a, b) => b.installs - a.installs)
            .map((pair) => ({ keyword: pair.keyword, geo: pair.geo }));

        if (typeof maxPairs === 'number' && maxPairs > 0) {
            pairs = pairs.slice(0, maxPairs);
        }

        const topAppId = Array.from(appIdInstalls.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        return { pairs, topAppId, rangeStart, rangeEnd };
    };

    const setTrackingByApp = (appKey: string, isTracking: boolean) => {
        if (!appKey) return;
        setCompetitorTrackingByApp(prev => {
            if (isTracking) {
                if (prev[appKey]) return prev;
                return { ...prev, [appKey]: true };
            }
            if (!prev[appKey]) return prev;
            const next = { ...prev };
            delete next[appKey];
            return next;
        });
    };

    const setTrackingByApps = (appKeys: string[], isTracking: boolean) => {
        if (!Array.isArray(appKeys) || appKeys.length === 0) return;
        setCompetitorTrackingByApp(prev => {
            let changed = false;
            const next = { ...prev };
            appKeys.forEach((appKey) => {
                if (!appKey) return;
                if (isTracking) {
                    if (!next[appKey]) {
                        next[appKey] = true;
                        changed = true;
                    }
                } else if (next[appKey]) {
                    delete next[appKey];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    };

    const setTrackingByFolder = (folderKey: string | undefined, isTracking: boolean) => {
        if (!folderKey) return;
        setCompetitorTrackingByFolder(prev => {
            if (isTracking) {
                if (prev[folderKey]) return prev;
                return { ...prev, [folderKey]: true };
            }
            if (!prev[folderKey]) return prev;
            const next = { ...prev };
            delete next[folderKey];
            return next;
        });
    };

    const handleToggleCompetitorIgnored = async (id: string, ignored: boolean) => {
        setCompetitorDetections(prev => prev.map(item => (
            item.id === id
                ? { ...item, isIgnored: ignored, ignoredAt: ignored ? new Date().toISOString() : null }
                : item
        )));
        try {
            await setCompetitorDetectionIgnored(id, ignored);
        } catch (error) {
            console.error('Failed to update competitor ignore state:', error);
            try {
                const refreshed = await loadCompetitorDetections();
                setCompetitorDetections(refreshed);
            } catch (refreshError) {
                console.error('Failed to reload competitor detections:', refreshError);
            }
        }
    };

    const handleToggleCompetitorTracking = async (appKey: string, isActive: boolean) => {
        setCompetitorTargets(prev => prev.map(target => (
            target.appName === appKey
                ? { ...target, isActive }
                : target
        )));
        try {
            await setCompetitorTargetActive(appKey, isActive);
        } catch (error) {
            console.error('Failed to update competitor tracking state:', error);
            try {
                const refreshedTargets = await loadCompetitorTargets();
                setCompetitorTargets(refreshedTargets);
            } catch (refreshError) {
                console.error('Failed to reload competitor targets:', refreshError);
            }
        }
    };

    const handleToggleCompetitorTrackingFolder = async (appKeys: string[], isActive: boolean) => {
        if (!Array.isArray(appKeys) || appKeys.length === 0) return;
        const appSet = new Set(appKeys);
        setCompetitorTargets(prev => prev.map(target => (
            appSet.has(target.appName)
                ? { ...target, isActive }
                : target
        )));
        try {
            await setCompetitorTargetsActive(appKeys, isActive);
        } catch (error) {
            console.error('Failed to update competitor folder tracking state:', error);
            try {
                const refreshedTargets = await loadCompetitorTargets();
                setCompetitorTargets(refreshedTargets);
            } catch (refreshError) {
                console.error('Failed to reload competitor targets:', refreshError);
            }
        }
    };

    const handleDeleteCompetitors = async (appKey: string) => {
        const confirmed = await requestConfirmation({
            message: lang === 'ru'
                ? `Очистить конкурентов для "${appKey}"?`
                : `Clear competitors for "${appKey}"?`,
            subMessage: lang === 'ru' ? 'Это действие нельзя отменить.' : 'This action cannot be undone.',
            confirmText: lang === 'ru' ? 'Очистить' : 'Clear',
            cancelText: lang === 'ru' ? 'Отмена' : 'Cancel'
        });
        if (!confirmed) return;
        setCompetitorDetections(prev => prev.filter(item => item.targetAppName !== appKey));
        try {
            await deleteCompetitorDetectionsForApp(appKey);
        } catch (error) {
            console.error('Failed to delete competitors:', error);
            try {
                const refreshed = await loadCompetitorDetections();
                setCompetitorDetections(refreshed);
            } catch (refreshError) {
                console.error('Failed to reload competitor detections:', refreshError);
            }
        }
    };

    const handleRefreshCompetitors = async () => {
        if (!sessionUserId) {
            console.warn('Not authenticated');
            return;
        }

        const activeTargets = competitorTargets.filter(target => target.isActive);
        if (activeTargets.length === 0) {
            const msg = lang === 'ru'
                ? 'Нет активных приложений для трекинга'
                : 'No active apps to track';
            alert(msg);
            return;
        }

        setCompetitorRefreshing(true);
        try {
            const apps = activeTargets.map(target => ({
                appName: target.appName,
                appId: target.appId ?? undefined,
                bundleId: target.bundleId ?? undefined,
                keywords: target.keywords || [],
                geos: target.geos || [],
                keywordGeoPairs: target.keywordGeoPairs || [],
                enablePotential: !!target.enablePotential
            }));

            const maxPairs = apps.reduce((max, app) => {
                const directPairs = Array.isArray(app.keywordGeoPairs) ? app.keywordGeoPairs.length : 0;
                const fallbackPairs = (app.keywords?.length || 0) * (app.geos?.length || 0);
                return Math.max(max, directPairs || fallbackPairs);
            }, 0);

            const { error } = await supabase.functions.invoke('competitor-tracker', {
                body: {
                    apps,
                    storeResults: true,
                    maxKeywordGeos: Math.min(500, maxPairs || 1),
                    enablePotential: false
                }
            });

            if (error) throw error;

            const [refreshedDetections, refreshedTargets] = await Promise.all([
                loadCompetitorDetections(),
                loadCompetitorTargets()
            ]);
            setCompetitorDetections(refreshedDetections);
            setCompetitorTargets(refreshedTargets);
        } catch (error) {
            console.error('Failed to refresh competitors:', error);
        } finally {
            setCompetitorRefreshing(false);
        }
    };

    const handleTrackCompetitors = async (appKey: string, maxPairs?: number, enablePotential?: boolean) => {
        if (!sessionUserId) {
            console.warn('Not authenticated');
            return;
        }

        if (isShortTrackName(appKey)) {
            const message = lang === 'ru'
                ? `Название "${appKey}" слишком короткое и может дать много ложных совпадений.`
                : `The name "${appKey}" is very short and may produce many false matches.`;
            const confirmed = await requestConfirmation({
                message,
                confirmText: lang === 'ru' ? 'Продолжить' : 'Continue',
                cancelText: lang === 'ru' ? 'Отмена' : 'Cancel'
            });
            if (!confirmed) return;
        }

        const { pairs, topAppId, rangeStart, rangeEnd } = computeKeywordGeoPairs(appKey, maxPairs);
        if (pairs.length === 0) {
            const rangeLabel = rangeStart && rangeEnd ? `${rangeStart} - ${rangeEnd}` : '';
            const msg = lang === 'ru'
                ? (rangeLabel ? `Нет данных по ключам/гео за ${rangeLabel}` : 'Нет данных по ключам/гео для этого приложения')
                : (rangeLabel ? `No keyword/geo data for ${rangeLabel}` : 'No keyword/geo data for this app');
            alert(msg);
            return;
        }

        const keywordGeoPairs = pairs.map((pair) => `${pair.keyword}::${pair.geo}`);
        const keywords = Array.from(new Set(pairs.map((pair) => pair.keyword)));
        const geos = Array.from(new Set(pairs.map((pair) => pair.geo)));

        setTrackingByApp(appKey, true);
        try {
            await upsertCompetitorTarget({
                appName: appKey,
                appId: topAppId,
                keywords,
                geos,
                keywordGeoPairs,
                isActive: true,
                enablePotential: !!enablePotential
            });

            const { error } = await supabase.functions.invoke('competitor-tracker', {
                body: {
                    apps: [{
                        appName: appKey,
                        appId: topAppId ?? undefined,
                        keywords,
                        geos,
                        keywordGeoPairs: pairs,
                        enablePotential: !!enablePotential
                    }],
                    storeResults: true,
                    maxKeywordGeos: Math.min(500, keywordGeoPairs.length || 1),
                    enablePotential: !!enablePotential
                }
            });

            if (error) throw error;

            const [refreshedDetections, refreshedTargets] = await Promise.all([
                loadCompetitorDetections(),
                loadCompetitorTargets()
            ]);
            setCompetitorDetections(refreshedDetections);
            setCompetitorTargets(refreshedTargets);
        } catch (error) {
            console.error('Failed to save competitor target:', error);
        } finally {
            setTrackingByApp(appKey, false);
        }
    };

    const handleTrackCompetitorsFolder = async (appKeys: string[], maxPairs?: number, enablePotential?: boolean, folderKey?: string) => {
        if (!sessionUserId) {
            console.warn('Not authenticated');
            return;
        }
        if (!Array.isArray(appKeys) || appKeys.length === 0) return;

        const shortApps = appKeys.filter((name) => isShortTrackName(name));
        if (shortApps.length > 0) {
            const preview = shortApps.slice(0, 3).join(', ');
            const suffix = shortApps.length > 3 ? ` +${shortApps.length - 3}` : '';
            const message = lang === 'ru'
                ? `В папке есть короткие названия (${preview}${suffix}). Это может дать много ложных совпадений.`
                : `This folder contains very short names (${preview}${suffix}), which may produce many false matches.`;
            const confirmed = await requestConfirmation({
                message,
                confirmText: lang === 'ru' ? 'Продолжить' : 'Continue',
                cancelText: lang === 'ru' ? 'Отмена' : 'Cancel'
            });
            if (!confirmed) return;
        }

        const payloadApps: {
            appName: string;
            appId?: string;
            keywords: string[];
            geos: string[];
            keywordGeoPairs: { keyword: string; geo: string }[];
        }[] = [];
        const upserts: Promise<void>[] = [];
        const missingApps: string[] = [];
        let totalPairs = 0;
        let rangeStart = '';
        let rangeEnd = '';

        appKeys.forEach((appKey) => {
            const result = computeKeywordGeoPairs(appKey, maxPairs);
            rangeStart = result.rangeStart || rangeStart;
            rangeEnd = result.rangeEnd || rangeEnd;
            if (result.pairs.length === 0) {
                missingApps.push(appKey);
                return;
            }

            const keywordGeoPairs = result.pairs.map((pair) => `${pair.keyword}::${pair.geo}`);
            const keywords = Array.from(new Set(result.pairs.map((pair) => pair.keyword)));
            const geos = Array.from(new Set(result.pairs.map((pair) => pair.geo)));

            upserts.push(upsertCompetitorTarget({
                appName: appKey,
                appId: result.topAppId,
                keywords,
                geos,
                keywordGeoPairs,
                isActive: true,
                enablePotential: !!enablePotential
            }));

            payloadApps.push({
                appName: appKey,
                appId: result.topAppId ?? undefined,
                keywords,
                geos,
                keywordGeoPairs: result.pairs,
                enablePotential: !!enablePotential
            });
            totalPairs += keywordGeoPairs.length;
        });

        if (payloadApps.length === 0) {
            const rangeLabel = rangeStart && rangeEnd ? `${rangeStart} - ${rangeEnd}` : '';
            const msg = lang === 'ru'
                ? (rangeLabel ? `Нет данных по ключам/гео за ${rangeLabel}` : 'Нет данных по ключам/гео для этих приложений')
                : (rangeLabel ? `No keyword/geo data for ${rangeLabel}` : 'No keyword/geo data for these apps');
            alert(msg);
            return;
        }

        setTrackingByApps(appKeys, true);
        setTrackingByFolder(folderKey, true);
        try {
            await Promise.all(upserts);

            const { error } = await supabase.functions.invoke('competitor-tracker', {
                body: {
                    apps: payloadApps,
                    storeResults: true,
                    maxKeywordGeos: Math.min(500, totalPairs || 1),
                    enablePotential: !!enablePotential
                }
            });

            if (error) throw error;

            const [refreshedDetections, refreshedTargets] = await Promise.all([
                loadCompetitorDetections(),
                loadCompetitorTargets()
            ]);
            setCompetitorDetections(refreshedDetections);
            setCompetitorTargets(refreshedTargets);
        } catch (error) {
            console.error('Failed to track competitor folder:', error);
        } finally {
            setTrackingByApps(appKeys, false);
            setTrackingByFolder(folderKey, false);
        }

        if (missingApps.length > 0) {
            console.warn('Skipped apps without data:', missingApps);
        }
    };

    // UI State for Moving Apps
    const [movingApp, setMovingApp] = useState<string | null>(null); // The app currently being moved

    // CPI Management State
    const [cpiInput, setCpiInput] = useState<string>('0.09');
    const [cpiConfirmation, setCpiConfirmation] = useState<number | null>(null);
    const [showCpiSuccess, setShowCpiSuccess] = useState(false);

    // -- Category Modal State --
    const [categoryModal, setCategoryModal] = useState<{
        isOpen: boolean;
        mode: 'create' | 'rename' | 'delete';
        targetName: string;
        inputValue: string;
    }>({
        isOpen: false,
        mode: 'create',
        targetName: '',
        inputValue: ''
    });

    // -- Granularity State --
    const [granularity, setGranularity] = useState<Granularity>('Daily');

    // -- App Resolution Logic (Merge by ID) --
    const appIdLabelsByGroup: Record<string, Record<string, { name: string; date: string }>> = useMemo(() => {
        const map: Record<string, Record<string, { name: string; date: string }>> = {};
        data.forEach(item => {
            const group = item.appGroup || item.appName;
            if (!map[group]) map[group] = {};
            const existing = map[group][item.appId];
            if (!existing || item.date > existing.date) {
                map[group][item.appId] = { name: item.appName, date: item.date };
            }
        });
        return map;
    }, [data]);

    const latestIdByGroup = useMemo(() => {
        const map: Record<string, string> = {};
        Object.entries(appIdLabelsByGroup).forEach(([group, ids]) => {
            let latestId: string | null = null;
            let latestDate = '';
            Object.entries(ids).forEach(([id, info]) => {
                if (!latestId || info.date > latestDate) {
                    latestId = id;
                    latestDate = info.date;
                }
            });
            if (latestId) map[group] = latestId;
        });
        return map;
    }, [appIdLabelsByGroup]);

    // -- Derived Data --
    const uniqueApps = useMemo(() => {
        return Array.from(new Set(data.map(d => d.appGroup || d.appName))).sort();
    }, [data]);

    const activeApps = useMemo(() => uniqueApps.filter(app => !hiddenApps.includes(app)), [uniqueApps, hiddenApps]);
    const archivedAppsList = useMemo(() => uniqueApps.filter(app => hiddenApps.includes(app)), [uniqueApps, hiddenApps]);

    const { bannedAppIds } = useAppStoreBanCheck({
        supabase,
        sessionUserId,
        dataLoading,
        activeApps,
        latestIdByGroup,
        data
    });

    useEffect(() => {
        const defaults = buildDefaultWarningsSettings(categories, uniqueApps, {
            monitorEnabledDefault: !!warningsSettings.initialized,
            initialized: !!warningsSettings.initialized
        });
        setWarningsSettings(prev => mergeWarningsSettings(prev, defaults));
    }, [categories, uniqueApps, warningsSettings.initialized]);

    // Create a Set of existing composite keys for quick duplicate checking
    const existingDataKeys = useMemo(() => {
        return new Set(data.map(item => `${item.date}-${item.appId}-${item.geo}-${item.keyword}`));
    }, [data]);

    const totalInstallCost = useMemo(() => data.reduce((sum, entry) => sum + (entry.installs * (entry.cpi || 0)), 0), [data]);

    const todayLocal = formatDate(new Date());
    const recentInstallSpend7d = useMemo(() => {
        const end = todayLocal;
        const start = addDays(end, -6);
        let sum = 0;
        const spendDates = new Set<string>();
        for (const entry of data) {
            const dateStr = typeof entry?.date === 'string' ? entry.date : '';
            if (!dateStr || dateStr < start || dateStr > end) continue;
            const installs = typeof entry.installs === 'number' && Number.isFinite(entry.installs) ? entry.installs : 0;
            const cpi = typeof entry.cpi === 'number' && Number.isFinite(entry.cpi) ? entry.cpi : 0;
            const cost = installs * cpi;
            if (Number.isFinite(cost) && cost > 0) {
                sum += cost;
                spendDates.add(dateStr);
            }
        }
        if (!Number.isFinite(sum)) return 0;
        return {
            sum: Math.max(0, sum),
            dates: Array.from(spendDates).sort()
        };
    }, [data, todayLocal]);

    const warningsSummary = useMemo(() => {
        return computeWarnings({
            rows: data,
            settings: warningsSettings,
            categories,
            appCategoryMap,
            hiddenApps,
            today: todayLocal,
            lang
        });
    }, [data, warningsSettings, categories, appCategoryMap, hiddenApps, todayLocal, lang]);

    const warningsCount = useMemo(() => {
        const raw = warningsSummary?.counts?.total ?? 0;
        if (!Number.isFinite(raw)) return 0;
        return Math.max(0, Math.trunc(raw));
    }, [warningsSummary]);

    // Group Active Apps by Category
    const groupedApps = useMemo(() => {
        const groups: Record<string, string[]> = {};
        categories.forEach(c => groups[c] = []);
        groups['Uncategorized'] = [];

        activeApps.forEach(app => {
            const cat = appCategoryMap[app];
            if (cat && categories.includes(cat)) {
                groups[cat].push(app);
            } else {
                groups['Uncategorized'].push(app);
            }
        });
        return groups;
    }, [activeApps, categories, appCategoryMap]);


    // Global Filter State
    const [filters, setFilters] = useState<FilterState>({
        appName: null,
        appId: 'All',
        geo: 'All',
        keyword: 'All',
        startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default last 30 days
        endDate: new Date().toISOString().split('T')[0]
    });

    // Ensure a valid app is selected on load or after archiving
    useEffect(() => {
        if (!filters.appName || !activeApps.includes(filters.appName)) {
            if (activeApps.length > 0) {
                setFilters(prev => ({
                    ...prev,
                    appName: activeApps[0],
                    appId: 'All',
                    geo: 'All',
                    keyword: 'All'
                }));
            } else if (archivedAppsList.length > 0 && !filters.appName) {
                // Fallback to viewing an archived app if no active ones exist
                setFilters(prev => ({ ...prev, appName: archivedAppsList[0] }));
            }
        }
    }, [activeApps, archivedAppsList, filters.appName]);

    // Calculate Latest CPI for selected app
    const latestCPI = useMemo(() => {
        if (!filters.appName) return '0.09';

        const appEntries = data.filter(d =>
            d.appGroup === filters.appName &&
            (filters.appId === 'All' || d.appId === filters.appId)
        );

        if (appEntries.length === 0) return '0.09';
        const latest = appEntries.reduce((prev, current) => (prev.date > current.date) ? prev : current);
        return latest.cpi.toString();
    }, [data, filters.appName, filters.appId]);

    // Sync input with latest CPI
    useEffect(() => {
        setCpiInput(latestCPI);
    }, [latestCPI]);


    // Reset AI Analysis when filters change to avoid showing stale data
    const aiAnalysisCacheKey = useMemo(() => {
        const appName = filters.appName || '';
        const appId = filters.appId || '';
        const geo = filters.geo || '';
        const keyword = filters.keyword || '';
        const startDate = filters.startDate || '';
        const endDate = filters.endDate || '';
        const g = granularity || '';
        return [lang, appName, appId, geo, keyword, startDate, endDate, g].join('|');
    }, [filters.appName, filters.appId, filters.geo, filters.keyword, filters.startDate, filters.endDate, granularity, lang]);

    useEffect(() => {
        aiAnalysisCacheKeyRef.current = aiAnalysisCacheKey;
        const cached = aiAnalysisCacheRef.current[aiAnalysisCacheKey];
        setAiAnalysis(cached?.analysis || null);
        setAiAnalysisMeta(cached?.meta || null);
        setIsAnalyzing(false);
    }, [aiAnalysisCacheKey]);

    useEffect(() => {
        if (!aiAnalysisShouldScrollRef.current) return;
        if (!isAnalyzing && !aiAnalysis) return;

        const scrollKey = `${isAnalyzing ? '1' : '0'}|${aiAnalysis ? aiAnalysis.length : 0}`;
        if (aiAnalysisScrollKeyRef.current === scrollKey) return;
        aiAnalysisScrollKeyRef.current = scrollKey;

        requestAnimationFrame(() => {
            aiAnalysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }, [isAnalyzing, aiAnalysis]);

    // Secondary Filters Options
    const availableAppIds = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(
            new Set(
                data
                    .filter(d => d.appGroup === filters.appName)
                    .map(d => d.appId)
            )
        ).filter(Boolean);
    }, [data, filters.appName]);

    const availableGeos = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => d.appGroup === filters.appName)
            .map(d => d.geo)));
    }, [data, filters.appName]);

    const availableKeywords = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => d.appGroup === filters.appName && (filters.geo === 'All' || d.geo === filters.geo))
            .map(d => d.keyword)));
    }, [data, filters.appName, filters.geo]);

    const idLabelsForSelected: Record<string, { name: string; date: string }> | undefined = filters.appName ? appIdLabelsByGroup[filters.appName] : undefined;

    // -- Preview Geo State --
    // This controls the GEO for the App Store link independently of the dashboard filter
    const [previewGeo, setPreviewGeo] = useState('US');

    // Sync previewGeo with filter geo if specific
    useEffect(() => {
        if (filters.geo !== 'All') {
            setPreviewGeo(filters.geo);
        } else if (availableGeos.length > 0 && !availableGeos.includes(previewGeo)) {
            // If switching to All, default to the first available geo if the current preview isn't valid
            setPreviewGeo(availableGeos[0]);
        } else if (availableGeos.length === 0) {
            setPreviewGeo('US');
        }
    }, [filters.geo, availableGeos]);

    // Extract Numeric ID from the composite "Name ID" string
    const currentNumericId = useMemo(() => {
        let rawId = '';
        if (filters.appId !== 'All') {
            rawId = filters.appId;
        } else if (filters.appName) {
            const appEntries = data.filter(d => d.appGroup === filters.appName);
            if (appEntries.length > 0) {
                const latestEntry = appEntries.reduce((prev, current) =>
                    (prev.date > current.date) ? prev : current
                );
                rawId = latestEntry.appId;
            }
        }
        return extractNumericId(rawId);
    }, [filters.appId, filters.appName, data]);

    // -- Fetch App Icon Effect --
    useEffect(() => {
        let isMounted = true;

        const fetchIcon = async () => {
            // Skip if no app selected or no ID found
            if (!filters.appName || !currentNumericId) return;

            // 1. Collect countries to try based on data
            const countriesToTry = new Set<string>();
            // Always try US first as it's the biggest store
            countriesToTry.add('US');

            availableGeos.forEach(g => {
                // Map common codes to ISO
                const code = toIsoCountryCode(g);
                if (code.length === 2) countriesToTry.add(code);
            });

            // 2. Iterate and try to fetch
            for (const country of Array.from(countriesToTry)) {
                if (!isMounted) return;
                try {
                    // iTunes Lookup API
                    const targetUrl = `https://itunes.apple.com/lookup?id=${currentNumericId}&country=${country}`;
                    // Use allorigins.win as a more reliable CORS proxy
                    // Use Supabase Edge Function to proxy the request
                    const { data: itunesData, error } = await supabase.functions.invoke('itunes-proxy', {
                        body: { url: targetUrl }
                    });

                    if (!isMounted) return;

                    if (!error && itunesData && itunesData.resultCount > 0) {
                        const result = itunesData.results[0];
                        const iconUrl = result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60;

                        // Only update if the icon is different to avoid loops/unnecessary saves
                        if (isMounted && iconUrl && iconUrl !== appIcons[filters.appName]) {
                            setAppIcons(prev => ({ ...prev, [filters.appName!]: iconUrl }));
                        }
                        return; // Stop once found
                    }
                } catch (e) {
                    console.warn(`Icon fetch failed for ${country}`, e);
                }
            }
        };

        fetchIcon();

        return () => {
            isMounted = false;
        };
    }, [filters.appName, currentNumericId, availableGeos, appIcons]);

    // -- Background Icon Fetcher for ALL Active Apps --
    // This runs automatically to ensure we have icons for apps even before they are selected
    const attemptedBackgroundFetches = useRef<Set<string>>(new Set());

    useEffect(() => {
        let isMounted = true;

        const runBackgroundFetch = async () => {
            // Identify apps that:
            // 1. Are active (visible in sidebar)
            // 2. Do not have an icon yet
            // 3. Have not been attempted in this session (to avoid infinite retries on failures)
            const appsNeedingIcons = activeApps.filter(appName =>
                !appIconsRef.current[appName] && !attemptedBackgroundFetches.current.has(appName)
            );

            if (appsNeedingIcons.length === 0) return;

            console.log(`[IconFetcher] Found ${appsNeedingIcons.length} apps needing icons. Starting background fetch...`);

            // Process one by one to be gentle on the proxy/API
            for (const appName of appsNeedingIcons) {
                if (!isMounted) return;

                // Mark as attempted immediately
                attemptedBackgroundFetches.current.add(appName);

                // Find the ID for this app
                const appId =
                    latestIdByGroup[appName] ||
                    data
                        .filter(d => (d.appGroup || d.appName) === appName)
                        .sort((a, b) => b.date.localeCompare(a.date))[0]?.appId;
                // Resolve numeric ID from string ID if needed
                const numericId = extractNumericId(appId);

                if (!numericId) {
                    console.log(`[IconFetcher] Skipping ${appName} - no numeric ID found.`);
                    continue;
                }

                try {
                    // Try US store first (highest probability)
                    const targetUrl = `https://itunes.apple.com/lookup?id=${numericId}&country=US`;

                    const { data: itunesData, error } = await supabase.functions.invoke('itunes-proxy', {
                        body: { url: targetUrl }
                    });

                    if (!isMounted) return;

                    if (!error && itunesData && itunesData.resultCount > 0) {
                        const result = itunesData.results[0];
                        const iconUrl = result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60;

                        if (iconUrl) {
                            console.log(`[IconFetcher] Found icon for ${appName}`);
                            setAppIcons(prev => ({ ...prev, [appName]: iconUrl }));
                        }
                    } else {
                        // If US failed, try a fallback from available data for this app
                        const appGeos = data.filter(d => (d.appGroup || d.appName) === appName).map(d => d.geo);
                        const uniqueGeos = Array.from(new Set(appGeos)).filter(g => g !== 'US');

                        if (uniqueGeos.length > 0) {
                            const fallbackGeo = uniqueGeos[0]; // Just try the first one
                            const fallbackCountry = toIsoCountryCode(fallbackGeo);
                            if (fallbackCountry.length !== 2) continue;
                            const fallbackUrl = `https://itunes.apple.com/lookup?id=${numericId}&country=${fallbackCountry}`;

                            const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke('itunes-proxy', {
                                body: { url: fallbackUrl }
                            });

                            if (!isMounted) return;

                            if (!fallbackError && fallbackData && fallbackData.resultCount > 0) {
                                const result = fallbackData.results[0];
                                const iconUrl = result.artworkUrl512 || result.artworkUrl100 || result.artworkUrl60;
                                if (iconUrl) {
                                    setAppIcons(prev => ({ ...prev, [appName]: iconUrl }));
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[IconFetcher] Failed background fetch for ${appName}`, e);
                }

                // Small delay between requests to be polite
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        };

        // Run with a small delay after mount/updates to let critical UI render first
        const timer = setTimeout(runBackgroundFetch, 2000);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [activeApps, latestIdByGroup, data]); // Intentionally omitting appIcons to avoid re-running on every update. 
    // We rely on the initial filter + attempted set.



    const getStoreUrl = (geo: string, id: string) => {
        const code = toIsoCountryCode(geo);
        const target = code && code !== 'ALL' ? code.toLowerCase() : geo.toLowerCase();
        return `https://apps.apple.com/${target}/app/id${id}`;
    };

    // -- Filter Data Logic --
    const filteredData = useMemo(() => {
        if (!filters.appName) return [];

        let res = data.filter(item => {
            const group = item.appGroup || item.appName;
            if (group !== filters.appName) return false;
            if (filters.appId !== 'All' && item.appId !== filters.appId) return false;
            if (filters.geo !== 'All' && item.geo !== filters.geo) return false;
            if (filters.keyword !== 'All' && item.keyword !== filters.keyword) return false;
            return true;
        });

        // Date Filtering
        if (filters.startDate && filters.endDate) {
            // String comparison works for YYYY-MM-DD format
            res = res.filter(item => item.date >= filters.startDate! && item.date <= filters.endDate!);
        }

        // Explicitly sort correctly by date
        return res.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data, filters]);

    // Get all unique keywords for the current app to pass to suggester
    const allAppKeywords = useMemo(() => {
        if (!filters.appName) return [];
        return Array.from(new Set(data
            .filter(d => (d.appGroup || d.appName) === filters.appName)
            .map(d => d.keyword)));
    }, [data, filters.appName]);

    // Summary Logic
    const summary = useMemo(() => {
        if (filteredData.length === 0) return { installs: 0, rank: 0, cost: 0, keywordCount: 0, geoCount: 0 };

        const totalInstalls = filteredData.reduce((acc, curr) => acc + curr.installs, 0);
        const totalCost = filteredData.reduce((acc, curr) => acc + (curr.installs * curr.cpi), 0);

        // Snapshot Average Rank Calculation
        // We want the average of the "latest available" rank for each keyword/geo pair within the filtered period.
        const latestRanksMap = new Map<string, number>();
        const uniqueKWs = new Set<string>();
        const uniqueGeos = new Set<string>();

        filteredData.forEach(item => {
            if (item.ranking > 0) {
                // Composite key for unique tracking entity
                // Using a separator that is unlikely to be in keyword or geo
                const key = `${item.geo}__||__${item.keyword}`;
                // Since filteredData is sorted by date ascending, this will overwrite older entries
                // leaving us with the rank on the latest date present in the data
                latestRanksMap.set(key, item.ranking);
            }
        });

        // Determine unique counts from the valid ranked items
        for (const key of latestRanksMap.keys()) {
            const [geo, ...kwParts] = key.split('__||__');
            const kw = kwParts.join('__||__');
            if (geo) uniqueGeos.add(geo);
            if (kw) uniqueKWs.add(kw);
        }

        const validLatestRanks = Array.from(latestRanksMap.values());
        const avgRank = validLatestRanks.length > 0
            ? Math.round(validLatestRanks.reduce((acc, curr) => acc + curr, 0) / validLatestRanks.length)
            : 0;

        return {
            installs: totalInstalls,
            rank: avgRank,
            cost: totalCost,
            keywordCount: uniqueKWs.size,
            geoCount: uniqueGeos.size
        };
    }, [filteredData]);

    // -- Helpers --

    const getCountryFlag = (geoCode: string) => {
        const target = toIsoCountryCode(geoCode);

        if (target === 'ALL') return 'https://flagcdn.com/w20/un.png'; // Use UN flag for World/All
        if (target.length !== 2) return 'https://flagcdn.com/w20/un.png';

        return `https://flagcdn.com/w20/${target.toLowerCase()}.png`;
    };

    const mergeEntries = (existing: AsoEntry[], incoming: AsoEntry[]) => {
        const dataMap = new Map();

        existing.forEach(item => {
            const key = `${item.date}-${item.appId}-${item.geo}-${item.keyword}`;
            dataMap.set(key, item);
        });

        incoming.forEach(item => {
            const key = `${item.date}-${item.appId}-${item.geo}-${item.keyword}`;
            dataMap.set(key, item);
        });

        return Array.from(dataMap.values());
    };

    const handleAddData = async (newEntries: AsoEntry[]) => {
        hasUserAddedData.current = true;
        const merged = mergeEntries(dataRef.current, newEntries);
        dataRef.current = merged;
        setData(merged);

        // Persist immediately to Supabase in addition to the debounced saver
        if (session) {
            try {
                await saveAsoData(merged);
            } catch (err) {
                console.error('Immediate save failed:', err);
            }
        }
    };

    // -- Automatic Google Sheets Sync --
    useEffect(() => {
        if (!session) {
            hasRunAutoSync.current = false;
            return;
        }
        if (dataLoading || loadFailed) return;
        if (hasRunAutoSync.current) return;
        hasRunAutoSync.current = true;

        const runSync = async () => {
            try {
                const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

                const { data: syncSettings, error } = await supabase
                    .from('google_sheets_sync')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .maybeSingle();

                if (error || !syncSettings || !syncSettings.is_sync_enabled) return;

                const lastSyncedAt = syncSettings.last_synced_at as string | undefined;
                if (lastSyncedAt) setLastSyncedAt(lastSyncedAt);

                const shouldSync = (() => {
                    if (!lastSyncedAt) return true;
                    const lastMs = Date.parse(lastSyncedAt);
                    if (!Number.isFinite(lastMs)) return true;
                    return Date.now() - lastMs >= AUTO_SYNC_INTERVAL_MS;
                })();

                if (!shouldSync) return;

                console.log("Running automatic Google Sheets sync...");

                let tabsToSync: string[] = [];
                let shouldMigrateTabSelection = false;

                try {
                    const allTabs = await fetchSheetTabs(syncSettings.web_app_url);
                    const resolved = resolveTabsToSync(allTabs, syncSettings.selected_tabs);
                    if (resolved.mode === 'all_except') {
                        tabsToSync = resolved.tabsToSync;
                    } else {
                        tabsToSync = allTabs;
                        shouldMigrateTabSelection = true; // Move existing configs to "all tabs except excluded" mode
                    }
                } catch (e) {
                    console.error("Failed to fetch tabs list for auto-sync; falling back to saved selection.", e);
                    const stored = Array.isArray(syncSettings.selected_tabs)
                        ? (syncSettings.selected_tabs as unknown[]).filter((t): t is string => typeof t === 'string')
                        : [];

                    if (!stored.includes(ALL_TABS_SENTINEL)) {
                        tabsToSync = stored;
                    } else {
                        return;
                    }
                }

                let newEntries: AsoEntry[] = [];

                for (const tab of tabsToSync) {
                    try {
                        const sheetData = await fetchSheetData(syncSettings.web_app_url, tab);
                        const entries = processSheetData(sheetData, tab);
                        newEntries = [...newEntries, ...entries];
                    } catch (e) {
                        console.error(`Failed to sync tab ${tab}:`, e);
                    }
                }

                if (newEntries.length > 0) {
                    await handleAddData(newEntries); // Merge into state and persist
                }

                // Update last_synced_at even if no new entries (to reflect the check)
                const now = new Date().toISOString();
                await supabase
                    .from('google_sheets_sync')
                    .update({
                        last_synced_at: now,
                        ...(shouldMigrateTabSelection ? { selected_tabs: buildStoredTabsAllExcept([]) } : {})
                    })
                    .eq('user_id', session.user.id);

                setLastSyncedAt(now);

                console.log(`Auto-sync done. Imported ${newEntries.length} entries from Google Sheets.`);

            } catch (err) {
                console.error("Auto-sync failed:", err);
            }
        };

        // Run sync shortly after load to avoid blocking initial render
        const timer = setTimeout(runSync, 3000);
        return () => clearTimeout(timer);
    }, [session, dataLoading, loadFailed]);

    const handleManualRefresh = async () => {
        if (!session || isSyncing) return;
        setIsSyncing(true);
        try {
            const { data: syncSettings, error } = await supabase
                .from('google_sheets_sync')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle();

            if (error || !syncSettings || !syncSettings.is_sync_enabled) {
                console.warn('Sync not configured or disabled');
                setIsSyncConfigured(false);
                return;
            }

            console.log("Running manual Google Sheets sync...");

            let tabsToSync: string[] = [];
            let shouldMigrateTabSelection = false;

            try {
                const allTabs = await fetchSheetTabs(syncSettings.web_app_url);
                const resolved = resolveTabsToSync(allTabs, syncSettings.selected_tabs);
                if (resolved.mode === 'all_except') {
                    tabsToSync = resolved.tabsToSync;
                } else {
                    tabsToSync = allTabs;
                    shouldMigrateTabSelection = true;
                }
            } catch (e) {
                console.error("Failed to fetch tabs list for manual sync; falling back to saved selection.", e);
                const stored = Array.isArray(syncSettings.selected_tabs)
                    ? (syncSettings.selected_tabs as unknown[]).filter((t): t is string => typeof t === 'string')
                    : [];

                if (!stored.includes(ALL_TABS_SENTINEL)) {
                    tabsToSync = stored;
                } else {
                    return;
                }
            }

            let newEntries: AsoEntry[] = [];
            let errorCount = 0;

            for (const tab of tabsToSync) {
                try {
                    const sheetData = await fetchSheetData(syncSettings.web_app_url, tab);
                    const entries = processSheetData(sheetData, tab);
                    newEntries = [...newEntries, ...entries];
                } catch (e) {
                    console.error(`Failed to sync tab ${tab}:`, e);
                    errorCount++;
                }
            }

            if (newEntries.length > 0) {
                await handleAddData(newEntries); // Merge into state and persist

                // Update last_synced_at
                const now = new Date().toISOString();
                await supabase
                    .from('google_sheets_sync')
                    .update({
                        last_synced_at: now,
                        ...(shouldMigrateTabSelection ? { selected_tabs: buildStoredTabsAllExcept([]) } : {})
                    })
                    .eq('user_id', session.user.id);

                setLastSyncedAt(now);
                setShowSyncSuccess(true);
                setTimeout(() => setShowSyncSuccess(false), 3000);

                console.log(`Synced ${newEntries.length} entries from Google Sheets.`);
            } else if (errorCount === 0) {
                // Even if no new entries, update timestamp to show we checked
                const now = new Date().toISOString();
                await supabase
                    .from('google_sheets_sync')
                    .update({
                        last_synced_at: now,
                        ...(shouldMigrateTabSelection ? { selected_tabs: buildStoredTabsAllExcept([]) } : {})
                    })
                    .eq('user_id', session.user.id);

                setLastSyncedAt(now);
                setShowSyncSuccess(true);
                setTimeout(() => setShowSyncSuccess(false), 3000);
            }

            if (errorCount > 0 && newEntries.length === 0) {
                alert("Failed to sync one or more tabs. Please check your connection and sheet settings.");
            }

        } catch (err) {
            console.error("Manual sync failed:", err);
            alert("Sync failed. See console for details.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleRequestCPIUpdate = () => {
        if (!filters.appName) return;
        const newCPI = parseFloat(cpiInput);
        if (isNaN(newCPI) || newCPI < 0) {
            alert("Please enter a valid price.");
            return;
        }
        setCpiConfirmation(newCPI);
    };

    const confirmUpdateCPI = () => {
        if (cpiConfirmation === null || !filters.appName) return;

        setData(prev => prev.map(item =>
            (item.appGroup || item.appName) === filters.appName
                ? { ...item, cpi: cpiConfirmation }
                : item
        ));

        setCpiConfirmation(null);
        setShowCpiSuccess(true);
        setTimeout(() => setShowCpiSuccess(false), 3000);
    };

    // -- Brand Tickler --
    const handleTickle = () => {
        if (tickleCount >= 3) return;

        const nextCount = tickleCount + 1;
        setTickleCount(nextCount);

        const isRu = lang === 'ru';
        let baseMsg = '';
        if (nextCount === 1) baseMsg = isRu ? 'эй, щекотно!' : 'hey, that tickles!';
        else if (nextCount === 2) baseMsg = isRu ? 'хватит уже!' : 'stop that!';
        else baseMsg = isRu ? 'позвони мне <3' : 'call me <3';

        const repeated = Array(8).fill(` ${baseMsg}`).join('');

        setTickleMsg(repeated);
        setIsTickling(true);

        if (tickleTimeoutRef.current) clearTimeout(tickleTimeoutRef.current);
        tickleTimeoutRef.current = setTimeout(() => {
            setIsTickling(false);
        }, 5000);
    };

    const requestDeleteApp = () => {
        if (filters.appName) {
            setDeleteConfirmation(filters.appName);
        }
    };

    const confirmDeleteApp = async () => {
        if (!deleteConfirmation) return;

        const appName = deleteConfirmation;

        await deleteAsoEntriesForAppGroup(appName);

        // Filter out all entries for this app group
        const newData = data.filter(d => d.appGroup !== appName);
        setData(newData);

        // Remove from hidden list if present
        setHiddenApps(prev => prev.filter(app => app !== appName));

        // Remove icon
        const newIcons = { ...appIcons };
        delete newIcons[appName];
        setAppIcons(newIcons);

        // Remove from category map
        const newCatMap = { ...appCategoryMap };
        delete newCatMap[appName];
        setAppCategoryMap(newCatMap);
        deleteAppFolderMapEntries([appName]).catch((error) => {
            console.warn('Failed to delete folder map entry:', error);
        });

        // Switch filter to another app if possible
        const remainingApps = Array.from(new Set(newData.map(d => d.appGroup || d.appName)));

        setDeleteConfirmation(null); // Close modal

        // Reset filters for remaining apps
        if (remainingApps.length > 0) {
            setFilters(prev => ({
                ...prev,
                appName: remainingApps[0],
                appId: 'All',
                geo: 'All',
                keyword: 'All'
            }));
        } else {
            setFilters(prev => ({
                ...prev,
                appName: null,
                appId: 'All',
                geo: 'All',
                keyword: 'All'
            }));
            // Bounce back to overview if no apps remain to avoid empty dashboard state
            setCurrentPage('overview');
        }
    };

    const requestDeleteAllApps = () => {
        setDeleteAllConfirmation(true);
    };

    const confirmDeleteAllApps = async () => {
        if (!filters.appName) return;

        const appNameToDelete = filters.appName;

        try {
            // Delete from Supabase first
            await deleteAsoEntriesForAppGroup(appNameToDelete);
        } catch (error) {
            console.error('Failed to delete from database:', error);
            // Continue with local cleanup even if DB delete fails
        }

        // Wipe ALL data for this specific app name (regardless of ID)
        const newData = data.filter(d => (d.appGroup || d.appName) !== appNameToDelete);
        setData(newData);

        // Remove icon
        const newIcons = { ...appIcons };
        delete newIcons[appNameToDelete];
        setAppIcons(newIcons);

        // Remove from categories
        setCategories(prev => prev); // Categories themselves don't need changing, just the map
        const newCatMap = { ...appCategoryMap };
        delete newCatMap[appNameToDelete];
        setAppCategoryMap(newCatMap);
        deleteAppFolderMapEntries([appNameToDelete]).catch((error) => {
            console.warn('Failed to delete folder map entry:', error);
        });

        // Remove from hidden apps
        setHiddenApps(prev => prev.filter(app => app !== appNameToDelete));

        // Reset filters but keep date range
        setFilters(prev => ({
            appName: null,
            appId: 'All',
            geo: 'All',
            keyword: 'All',
            startDate: prev.startDate,
            endDate: prev.endDate
        }));

        // If nothing remains, return user to overview to avoid empty dashboard state
        if (newData.length === 0) {
            setCurrentPage('overview');
        }

        setDeleteAllConfirmation(false);
    };

    const handleToggleArchive = (e: React.MouseEvent, appToToggle: string) => {
        e.stopPropagation();
        setHiddenApps(prev => {
            if (prev.includes(appToToggle)) {
                // Restore
                return prev.filter(app => app !== appToToggle);
            } else {
                // Archive
                return [...prev, appToToggle];
            }
        });
    };

    const resetAllFilters = () => {
        setFilters(prev => ({
            ...prev,
            appId: 'All',
            geo: 'All',
            keyword: 'All',
            startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        }));
        setGranularity('Daily');
    };

    const runAnalysis = async () => {
        const reqId = aiAnalysisReqIdRef.current + 1;
        aiAnalysisReqIdRef.current = reqId;
        aiAnalysisShouldScrollRef.current = true;
        const keyAtStart = aiAnalysisCacheKeyRef.current;

        setIsAnalyzing(true);
        setAiAnalysis(null);
        setAiAnalysisMeta(() => {
            const dates = filteredData.map(d => d.date).filter(Boolean).sort();
            const start = dates[0] || '';
            const end = dates.length > 0 ? dates[dates.length - 1] : '';
            const days = new Set(dates).size;
            return { start, end, rows: filteredData.length, days };
        });

        const result = await analyzeASOTrends(
            filteredData,
            filters.appName || 'Unknown',
            filters.geo,
            filters.keyword,
            lang
        );
        if (aiAnalysisReqIdRef.current !== reqId) return;
        if (aiAnalysisCacheKeyRef.current !== keyAtStart) return;

        setAiAnalysis(result);
        setIsAnalyzing(false);
        aiAnalysisCacheRef.current[keyAtStart] = {
            analysis: result,
            meta: (() => {
                const dates = filteredData.map(d => d.date).filter(Boolean).sort();
                const start = dates[0] || '';
                const end = dates.length > 0 ? dates[dates.length - 1] : '';
                const days = new Set(dates).size;
                return { start, end, rows: filteredData.length, days };
            })(),
            updatedAt: Date.now()
        };
    };

    // -- Category Management Handlers (Using Modal) --
    const openCreateCategory = () => {
        setCategoryModal({ isOpen: true, mode: 'create', targetName: '', inputValue: '' });
    };

    const openRenameCategory = (name: string) => {
        setCategoryModal({ isOpen: true, mode: 'rename', targetName: name, inputValue: name });
    };

    const openDeleteCategory = (name: string) => {
        setCategoryModal({ isOpen: true, mode: 'delete', targetName: name, inputValue: '' });
    };

    const toggleCategoryCollapse = (category: string) => {
        setCollapsedCategories(prev =>
            prev.includes(category)
                ? prev.filter(c => c !== category)
                : [...prev, category]
        );
    };

    const moveCategory = (index: number, direction: 'up' | 'down') => {
        const newCategories = [...categories];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Boundary checks
        if (targetIndex < 0 || targetIndex >= newCategories.length) return;

        // Swap
        [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
        setCategories(newCategories);
    };

    const handleCategoryModalSubmit = () => {
        const { mode, inputValue, targetName } = categoryModal;
        const cleanValue = inputValue.trim();

        if (mode === 'create') {
            if (!cleanValue) return;
            if (categories.includes(cleanValue)) {
                alert("Folder already exists.");
                return;
            }
            setCategories(prev => [...prev, cleanValue]);
        }

        if (mode === 'rename') {
            if (!cleanValue) return;
            if (cleanValue !== targetName && categories.includes(cleanValue)) {
                alert("Folder name already taken.");
                return;
            }
            setCategories(prev => prev.map(c => c === targetName ? cleanValue : c));
            // Update mappings
            const newMap = { ...appCategoryMap };
            const folderUpdates: Array<{ appKey: string; folder: string }> = [];
            Object.keys(newMap).forEach(app => {
                if (newMap[app] === targetName) {
                    newMap[app] = cleanValue;
                    folderUpdates.push({ appKey: app, folder: cleanValue });
                }
            });
            setAppCategoryMap(newMap);
            if (folderUpdates.length > 0) {
                upsertAppFolderMapEntries(folderUpdates).catch((error) => {
                    console.warn('Failed to rename folder map entries:', error);
                });
            }
        }

        if (mode === 'delete') {
            setCategories(prev => prev.filter(c => c !== targetName));
            // Move apps to uncategorized
            const newMap = { ...appCategoryMap };
            const deletedApps: string[] = [];
            Object.keys(newMap).forEach(app => {
                if (newMap[app] === targetName) {
                    delete newMap[app];
                    deletedApps.push(app);
                }
            });
            setAppCategoryMap(newMap);
            if (deletedApps.length > 0) {
                deleteAppFolderMapEntries(deletedApps).catch((error) => {
                    console.warn('Failed to delete folder map entries:', error);
                });
            }
        }

        setCategoryModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleMoveApp = (app: string, category: string) => {
        setAppCategoryMap(prev => {
            const next = { ...prev };
            if (category) {
                next[app] = category;
            } else {
                delete next[app];
            }
            return next;
        });
        if (category) {
            upsertAppFolderMapEntries([{ appKey: app, folder: category }]).catch((error) => {
                console.warn('Failed to update folder map entry:', error);
            });
        } else {
            deleteAppFolderMapEntries([app]).catch((error) => {
                console.warn('Failed to delete folder map entry:', error);
            });
        }
        setMovingApp(null);
    };

    const handleAppSelect = (app: string) => {
        setCurrentPage('dashboard');
        setFilters(prev => ({
            ...prev,
            appName: app,
            appId: 'All',
            geo: 'All',
            keyword: 'All'
        }));
        // On mobile close sidebar
        if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut({ scope: 'local' });
    };

    if (authLoading || dataLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-slate-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!session) {
        return <LoginPage />;
    }

    return (
        <div className={`flex h-screen overflow-hidden font-sans transition-colors duration-200 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <style>{`
                @keyframes tickleWiggle {
                    0%,100% { transform: rotate(0deg); }
                    25% { transform: rotate(-10deg); }
                    50% { transform: rotate(8deg); }
                    75% { transform: rotate(-6deg); }
                }
                @keyframes tickerMarquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>
            {/* Mobile Sidebar Toggle */}
            {!isSidebarOpen && (
                <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 rounded-md shadow-md md:hidden text-slate-700 dark:text-slate-200"
                >
                    <Menu size={20} />
                </button>
            )}

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed top-0 left-0 h-[100dvh] z-50 w-64 bg-slate-900 text-slate-300 transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl m-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:h-screen md:z-40
      `}>
                {/* Header */}
            <div className="p-6 pr-8 border-b border-slate-800 flex items-center justify-between shrink-0 gap-3">
                <div
                    className="flex items-center gap-2 text-white font-bold text-xl tracking-tight cursor-pointer shrink-0"
                    onClick={() => {
                        handleTickle();
                    }}
                >
                    <LayoutDashboard
                        className="text-indigo-500"
                        style={isTickling ? { animation: 'tickleWiggle 0.6s ease-in-out' } : undefined}
                    />
                    <span className="relative hidden md:inline-block" style={{ width: '6ch' }}>
                        <span className="block w-full overflow-hidden whitespace-nowrap">
                            <span
                                className="inline-block pl-2"
                                style={
                                    isTickling
                                        ? { animation: 'tickerMarquee 10s linear infinite' }
                                        : undefined
                                }
                            >
                                {isTickling && tickleMsg ? `${tickleMsg}   ` : 'ZefASO'}
                            </span>
                        </span>
                    </span>
                </div>
                <div className="flex items-center gap-2 pr-3">
                    <div className="shrink-0">
                        <BalancePanel
                            session={session}
                            totalInstallCost={totalInstallCost}
                            recentInstallSpend7d={recentInstallSpend7d.sum}
                            recentInstallSpendDates7d={recentInstallSpend7d.dates}
                            lang={lang}
                        />
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="shrink-0 md:hidden">
                        <Menu size={20} />
                    </button>
                </div>
            </div>

                <div className="p-4 shrink-0 space-y-2">
                    {/* Global Overview Button */}
                    <button
                        onClick={() => setCurrentPage('overview')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left ${currentPage === 'overview'
                            ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-lg'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                    >
                        <LayoutGrid size={20} className="shrink-0" />
                        <div className="flex flex-col">
                            <span className="font-bold leading-none">{t.overview}</span>
                            <span className={`text-[10px] mt-1 ${currentPage === 'overview' ? 'text-fuchsia-100' : 'text-slate-500'}`}>{t.overviewSub}</span>
                        </div>
                    </button>

                    {/* The Lab Button + Warnings */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage('lab')}
                            className={`flex-1 min-w-0 min-h-[2.75rem] flex items-center gap-2.5 px-4 py-2.5 rounded-lg transition-all text-left ${currentPage === 'lab'
                                ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                }`}
                        >
                            <FlaskConical size={20} className="shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <span className={`font-bold leading-none truncate ${lang === 'ru' ? 'text-[13px]' : ''}`}>{t.theLab}</span>
                                <span className={`text-[10px] mt-1 truncate ${currentPage === 'lab' ? 'text-indigo-100' : 'text-slate-500'}`}>{t.labSub}</span>
                            </div>
                        </button>

                        <button
                            onClick={() => {
                                setCurrentPage('warnings');
                                if (window.innerWidth < 768) {
                                    setIsSidebarOpen(false);
                                }
                            }}
                            className={`relative shrink-0 w-12 min-h-[3rem] flex items-center justify-center rounded-xl border transition-all active:scale-95 ${currentPage === 'warnings'
                                ? 'bg-rose-600 text-white border-rose-500/40 shadow-lg shadow-rose-900/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700'
                                }`}
                            title={t.warnings || 'Warnings'}
                        >
                            <Bell size={22} />
                            {warningsCount > 0 && (
                                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                                    {warningsCount > 99 ? '99+' : warningsCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center gap-3 px-3 mt-4 mb-1">
                        <div className="h-px bg-slate-800 flex-1"></div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{t.activeApps}</span>
                        <div className="h-px bg-slate-800 flex-1"></div>
                    </div>
                </div>

                {/* Active Apps List - Scrollable with Categories */}
                <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin scrollbar-thumb-slate-700">
                    {activeApps.length === 0 && (
                        <div className="px-3 py-4 text-sm text-slate-600 italic">{t.noActiveApps}</div>
                    )}

                    {/* Render Defined Categories */}
                    {categories.map((category, index) => {
                        const apps = groupedApps[category] || [];
                        const isCollapsed = collapsedCategories.includes(category);
                        const isFirst = index === 0;
                        const isLast = index === categories.length - 1;

                        return (
                            <div key={category} className="mb-4">
                                {/* Folder Header - Buttons visible on hover (group) */}
                                <div
                                    className="group flex items-center justify-between px-3 mb-1 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors cursor-pointer"
                                    onClick={() => toggleCategoryCollapse(category)}
                                >
                                    <div className="flex items-center gap-1.5 truncate">
                                        {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                        {/* <FolderOpen size={12} className="shrink-0" /> */}
                                        <span className="truncate">{category}</span>
                                    </div>
                                    {/* Folder Actions - always keep visible to prevent click issues, style as subtle */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveCategory(index, 'up'); }}
                                            disabled={isFirst}
                                            className={`p-1 rounded transition-colors ${isFirst ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                            title="Move Up"
                                        >
                                            <ArrowUp size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); moveCategory(index, 'down'); }}
                                            disabled={isLast}
                                            className={`p-1 rounded transition-colors ${isLast ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                            title="Move Down"
                                        >
                                            <ArrowDown size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openRenameCategory(category); }}
                                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"
                                            title="Rename Folder"
                                        >
                                            <Edit2 size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openDeleteCategory(category); }}
                                            className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400"
                                            title="Delete Folder"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                </div>

                                {!isCollapsed && (
                                    <div className="space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                        {apps.length === 0 && (
                                            <div className="px-3 py-1.5 text-xs text-slate-700 italic opacity-50 border-l border-slate-800 ml-2 pl-2">
                                                {t.empty}
                                            </div>
                                        )}
                                        {apps.map(app => {
                                            const primaryAlias = appAliases[app]?.find(a => a.isPrimary && (a.prefix || a.number));
                                            const aliasLabel = formatAliasLabel(primaryAlias);
                                            const numericId = extractNumericId(latestIdByGroup[app]);
                                            const isBanned = !!(numericId && bannedAppIds[numericId]);
                                            return (
                                                <div
                                                    key={app}
                                                    onClick={() => handleAppSelect(app)}
                                                    className={`group relative w-full flex items-center justify-between pl-2 pr-1 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filters.appName === app && currentPage === 'dashboard'
                                                        ? 'bg-slate-800 text-white shadow-md'
                                                        : 'hover:bg-slate-800/50 hover:text-white'
                                                        }`}
                                                >
                                                <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                                                    {/* Icon or Dot */}
                                                    {appIcons[app] ? (
                                                        <img src={appIcons[app]} alt="" loading="eager" className="w-5 h-5 rounded-md object-cover shrink-0 bg-white" />
                                                    ) : (
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-indigo-500' : 'bg-slate-600'}`} />
                                                    )}
                                                    <div className="flex items-center gap-1 min-w-0">
                                                        {isBanned && (
                                                            <span
                                                                className="shrink-0 text-[10px] font-bold text-rose-200 bg-rose-500/20 border border-rose-500/30 rounded-md px-1 py-[2px] leading-none"
                                                                title={t.banBadgeTooltip}
                                                            >
                                                                BAN
                                                            </span>
                                                        )}
                                                        {aliasLabel && (
                                                            <span className="shrink-0 text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-md px-1 py-[2px] leading-none">
                                                                [{aliasLabel}]
                                                            </span>
                                                        )}
                                                        <span className="truncate font-medium">{app}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pr-0.5">
                                                    {/* Move Folder Dropdown Trigger */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setMovingApp(movingApp === app ? null : app); }}
                                                            className={`p-1 rounded-md transition-colors ${movingApp === app ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                                                            title="Move to Folder"
                                                        >
                                                            <Folder size={14} />
                                                        </button>

                                                        {movingApp === app && (
                                                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl z-50 py-1 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 dark:bg-slate-800 dark:border-slate-700">
                                                                <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700">Move to...</div>
                                                                {categories.filter(c => c !== category).map(c => (
                                                                    <button
                                                                        key={c}
                                                                        onClick={(e) => { e.stopPropagation(); handleMoveApp(app, c); }}
                                                                        className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                                    >
                                                                        <Folder size={12} /> {c}
                                                                    </button>
                                                                ))}
                                                                {/* Allow moving to Uncategorized explicitly if currently categorized */}
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleMoveApp(app, ''); }}
                                                                    className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                                >
                                                                    <Layout size={12} /> {t.uncategorized}
                                                                </button>
                                                                <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleToggleArchive(e, app); }}
                                                                        className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-2"
                                                                    >
                                                                        <Archive size={12} /> Archive App
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Overlay to close dropdown if clicking outside */}
                                                        {movingApp === app && (
                                                            <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMovingApp(null); }} />
                                                        )}
                                                    </div>

                                        </div>
                                    </div>
                                );
                            })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Uncategorized Apps */}
                {groupedApps['Uncategorized'].length > 0 && (
                    <div className="mb-4">
                        <div
                            className="px-3 mb-1 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:text-slate-300 transition-colors"
                            onClick={() => toggleCategoryCollapse('Uncategorized')}
                        >
                            {collapsedCategories.includes('Uncategorized') ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                            <span className="truncate">{t.uncategorized}</span>
                        </div>

                        {!collapsedCategories.includes('Uncategorized') && (
                            <div className="space-y-1 animate-in slide-in-from-top-1 fade-in duration-200">
                                {groupedApps['Uncategorized'].map(app => (
                                    (() => {
                                        const primaryAlias = appAliases[app]?.find(a => a.isPrimary && (a.prefix || a.number));
                                        const aliasLabel = formatAliasLabel(primaryAlias);
                                        const numericId = extractNumericId(latestIdByGroup[app]);
                                        const isBanned = !!(numericId && bannedAppIds[numericId]);
                                        return (
                                    <div
                                        key={app}
                                        onClick={() => handleAppSelect(app)}
                                        className={`group w-full flex items-center justify-between pl-2 pr-1 py-2 rounded-lg text-sm transition-colors cursor-pointer ${filters.appName === app && currentPage === 'dashboard'
                                            ? 'bg-slate-800 text-white shadow-md'
                                            : 'hover:bg-slate-800/50 hover:text-white'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                                            {appIcons[app] ? (
                                                <img src={appIcons[app]} alt="" loading="eager" className="w-5 h-5 rounded-md object-cover shrink-0 bg-white" />
                                            ) : (
                                                <div className={`w-2 h-2 rounded-full shrink-0 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-indigo-500' : 'bg-slate-600'}`} />
                                            )}
                                            <div className="flex items-center gap-1 min-w-0">
                                                {isBanned && (
                                                    <span
                                                        className="shrink-0 text-[10px] font-bold text-rose-200 bg-rose-500/20 border border-rose-500/30 rounded-md px-1 py-[2px] leading-none"
                                                        title={t.banBadgeTooltip}
                                                    >
                                                        BAN
                                                    </span>
                                                )}
                                                {aliasLabel && (
                                                    <span className="shrink-0 text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-md px-1 py-[2px] leading-none">
                                                        [{aliasLabel}]
                                                    </span>
                                                )}
                                                <span className="truncate font-medium">{app}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pr-0.5">
                                            {/* Move Logic for Uncategorized */}
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setMovingApp(movingApp === app ? null : app); }}
                                                    className={`p-1 rounded-md transition-colors ${movingApp === app ? 'bg-indigo-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                                                    title="Move to Folder"
                                                >
                                                    <FolderPlus size={14} />
                                                </button>

                                                {movingApp === app && (
                                                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl z-50 py-1 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 dark:bg-slate-800 dark:border-slate-700">
                                                        <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase border-b border-slate-100 dark:border-slate-700">Move to...</div>
                                                        {categories.map(c => (
                                                            <button
                                                                key={c}
                                                                onClick={(e) => { e.stopPropagation(); handleMoveApp(app, c); }}
                                                                className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 flex items-center gap-2"
                                                            >
                                                                <Folder size={12} /> {c}
                                                            </button>
                                                        ))}
                                                        <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleToggleArchive(e, app); }}
                                                                className="w-full text-left px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md flex items-center gap-2"
                                                            >
                                                                <Archive size={12} /> Archive App
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {movingApp === app && (
                                                    <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMovingApp(null); }} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                        );
                                    })()
                                ))}
                            </div>
                        )}
                    </div>
                )}

                </div>

                {/* Bottom Actions Area */}
                <div className="shrink-0 bg-slate-900 border-t border-slate-800 p-2 space-y-1 z-10">

                    {/* Hidden / Archived Section */}
                    {archivedAppsList.length > 0 && (
                        <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 overflow-hidden">
                            <button
                                onClick={() => setIsHiddenSectionOpen(!isHiddenSectionOpen)}
                                className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider px-3 py-2 hover:bg-slate-800 transition-colors"
                            >
                                <span>{t.hiddenArchived} ({archivedAppsList.length})</span>
                                {isHiddenSectionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isHiddenSectionOpen && (
                                <nav className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 p-2 space-y-1 bg-slate-900/50">
                                    {archivedAppsList.map(app => (
                                        <div
                                            key={app}
                                            onClick={() => handleAppSelect(app)}
                                            className={`group w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer opacity-70 hover:opacity-100 ${filters.appName === app && currentPage === 'dashboard' ? 'bg-slate-800/50 text-white' : 'text-slate-400 hover:bg-slate-800/30'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                {appIcons[app] ? (
                                                    <img src={appIcons[app]} alt="" className="w-4 h-4 rounded object-cover shrink-0 grayscale group-hover:grayscale-0 transition-all" />
                                                ) : (
                                                    <Archive size={12} className="shrink-0" />
                                                )}
                                                <div className="flex items-center gap-1 min-w-0">
                                                    {appAliases[app]?.find(a => a.isPrimary && (a.prefix || a.number)) && (
                                                        <span className="shrink-0 text-[11px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 rounded-md px-1.5 py-0.5 leading-none">
                                                            [{`${appAliases[app].find(a => a.isPrimary && (a.prefix || a.number))!.prefix || 'AA'}-${appAliases[app].find(a => a.isPrimary && (a.prefix || a.number))!.number || '000'}`}]
                                                        </span>
                                                    )}
                                                    <span className="truncate">{app}</span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => handleToggleArchive(e, app)}
                                                className="p-1.5 hover:bg-indigo-900/50 text-indigo-400 hover:text-indigo-300 rounded-md transition-colors"
                                                title="Restore App"
                                            >
                                                <RefreshCw size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </nav>
                            )}
                        </div>
                    )}

                    {/* Add Data & Folder Buttons */}
                    <div className="flex items-center gap-2">
                        {/* New Folder Button */}
                        <button
                            onClick={() => setCategoryModal({ isOpen: true, mode: 'create', targetName: '', inputValue: '' })}
                            className="shrink-0 w-12 min-h-[3rem] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all active:scale-95"
                            title={t.createCategory}
                        >
                            <FolderPlus size={20} />
                        </button>

                        {/* Add Data Button */}
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex-1 min-h-[3rem] flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-2 py-1 rounded-xl font-bold text-xs leading-tight text-center whitespace-normal transition-all shadow-lg shadow-indigo-900/20 active:scale-95 border border-indigo-500/20"
                        >
                            <Plus size={16} className="shrink-0" />
                            <span>{t.addNewData}</span>
                        </button>
                        {isSyncConfigured && (
                            <div className="relative">
                                <button
                                    onClick={handleManualRefresh}
                                    disabled={isSyncing}
                                    className="shrink-0 w-12 min-h-[3rem] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                                    title="Refresh Google Sheet Data"
                                >
                                    <RefreshCw size={20} className={`transition-all duration-700 ${isSyncing ? 'animate-spin text-indigo-500' : 'group-hover:rotate-180'}`} />
                                </button>
                                {showSyncSuccess && (
                                    <div className="absolute top-full right-0 mt-2 px-2 py-1 bg-emerald-500 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap animate-in fade-in slide-in-from-top-1 z-20 pointer-events-none">
                                        Sync Done!
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Last Synced */}
                    {isSyncConfigured && lastSyncedAt && (
                        <div className="mt-1 flex items-center justify-center">
                            {(() => {
                                const d = new Date(lastSyncedAt);
                                const label = lang === 'ru' ? 'Синхронизировано' : 'Synced';
                                const value = Number.isFinite(d.getTime())
                                    ? `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                    : lastSyncedAt;
                                return (
                                    <span className="text-[10px] font-medium text-slate-500/90 dark:text-slate-500/90 leading-tight tabular-nums">
                                        {label} {value}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                </div>

                {/* Footer Area */}
                <div className="px-4 py-3 bg-slate-950 text-xs text-slate-600 shrink-0 border-t border-slate-900 flex items-center justify-between">
                    <div className="flex flex-1 items-center gap-2 min-w-0 pr-2">
                        <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
                            <button
                                onClick={() => setLang('en')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${lang === 'en' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLang('ru')}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${lang === 'ru' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                RU
                            </button>
                        </div>

                        <button
                            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                            className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 ml-auto"
                            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                        >
                            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        </button>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-1 hover:bg-slate-800 text-slate-600 hover:text-red-400 rounded transition-colors"
                        title="Sign Out"
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-slate-50 dark:bg-slate-950 transition-colors duration-200">

                {currentPage === 'overview' ? (
                    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                        <OverviewDashboard
                            data={data}
                            appIcons={appIcons}
                            categories={categories}
                            appCategoryMap={appCategoryMap}
                            getCountryFlag={getCountryFlag}
                            getStoreUrl={getStoreUrl}
                            theme={theme}
                             t={t}
                         />
                     </div>
                 ) : currentPage === 'lab' ? (
                     <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                         <ComparisonDashboard
                             data={data}
                             activeApps={activeApps}
                             appIdLabelsByGroup={appIdLabelsByGroup}
                             getCountryFlag={getCountryFlag}
                             theme={theme}
                             t={t}
                         />
                     </div>
                 ) : currentPage === 'warnings' ? (
                     <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                         <WarningsPage
                             rows={data}
                             categories={categories}
                             appCategoryMap={appCategoryMap}
                             hiddenApps={hiddenApps}
                             appIcons={appIcons}
                             getCountryFlag={getCountryFlag}
                             lang={lang}
                             t={t}
                             warningsSettings={warningsSettings}
                             setWarningsSettings={setWarningsSettings}
                             setCurrentPage={setCurrentPage}
                             setFilters={setFilters}
                             competitorDetections={competitorDetections}
                             onToggleCompetitorIgnored={handleToggleCompetitorIgnored}
                             competitorTargets={competitorTargets}
                             onTrackCompetitors={handleTrackCompetitors}
                             onTrackCompetitorsFolder={handleTrackCompetitorsFolder}
                             onToggleCompetitorTracking={handleToggleCompetitorTracking}
                             onToggleCompetitorTrackingFolder={handleToggleCompetitorTrackingFolder}
                             onRefreshCompetitors={handleRefreshCompetitors}
                             competitorRefreshing={competitorRefreshing}
                             onDeleteCompetitors={handleDeleteCompetitors}
                             competitorTrackingByApp={competitorTrackingByApp}
                             competitorTrackingByFolder={competitorTrackingByFolder}
                         />
                     </div>
                 ) : (
                     <>
                         {/* Dashboard Header */}
                         <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20 transition-colors duration-200">
                             <div className="px-4 py-3 pt-16 md:pt-4">
                                <div className="flex flex-row items-center justify-between gap-2 mb-3">
                                    <div className="min-w-0 flex-1">
                                        <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 md:gap-3 truncate">
                                            {/* Main Header Icon */}
                                            {filters.appName && appIcons[filters.appName] && (
                                                <img
                                                    src={appIcons[filters.appName]}
                                                    alt={`${filters.appName} icon`}
                                                    loading="eager"
                                                    className="w-8 h-8 md:w-10 md:h-10 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm object-cover shrink-0"
                                                />
                                            )}
                                            <div className="flex items-center gap-2 min-w-0">
                                                {(() => {
                                                    const primaryAlias = filters.appName ? appAliases[filters.appName]?.find(a => a.isPrimary && (a.prefix || a.number)) : null;
                                                    const aliasLabel = formatAliasLabel(primaryAlias);
                                                    if (!aliasLabel) return null;
                                                    return (
                                                        <span className="shrink-0 inline-flex items-center justify-center h-6 px-2 rounded-md text-xs font-semibold text-indigo-200 bg-indigo-500/20 border border-indigo-500/30">
                                                            [{aliasLabel}]
                                                        </span>
                                                    );
                                                })()}
                                                <span className="truncate">{filters.appName || t.dashboard}</span>
                                            </div>
                                        </h1>

                                        {/* App Store Link Section - Hidden on very small screens if needed, or kept compact */}
                                        {filters.appName && currentNumericId && (
                                            <div className="hidden sm:flex items-center gap-3 mt-1 text-sm ml-[2.75rem] md:ml-[3.25rem]">
                                                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t.store}:</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {availableGeos.map(geo => (
                                                        <a
                                                            key={geo}
                                                            href={getStoreUrl(geo, currentNumericId)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="opacity-70 hover:opacity-100 hover:scale-110 transition-all"
                                                            title={`Open in ${geo} App Store`}
                                                        >
                                                            <img
                                                                src={getCountryFlag(geo)}
                                                                alt={geo}
                                                                className="w-5 h-3.5 object-contain shadow-sm rounded-[2px]"
                                                            />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* View Toggle */}
                                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                            <button
                                                onClick={() => setViewMode('mini')}
                                                className={`p-1.5 rounded-md transition-all ${viewMode === 'mini' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                title="Mini View"
                                            >
                                                <Layout size={16} />
                                            </button>
                                            <button
                                                onClick={() => setViewMode('full')}
                                                className={`p-1.5 rounded-md transition-all ${viewMode === 'full' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                title="Full View"
                                            >
                                                <LayoutList size={16} />
                                            </button>
                                            <button
                                                onClick={() => setViewMode('combined')}
                                                className={`p-1.5 rounded-md transition-all ${viewMode === 'combined' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                                title="Combined View"
                                            >
                                                <BarChart2 size={16} />
                                            </button>
                                        </div>

                                        <button
                                            onClick={runAnalysis}
                                            disabled={isAnalyzing || filteredData.length === 0}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:shadow-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                        >
                                            <BrainCircuit size={16} />
                                            <span className="hidden sm:inline">{isAnalyzing ? t.analyzing : t.aiAnalysis}</span>
                                            <span className="sm:hidden">{t.aiAnalysis.split(' ')[0]}</span> {/* Show shorter text on mobile */}
                                        </button>
                                    </div>
                                </div>

                                {/* Filters Bar - Adaptive Layout */}
                                <div className="grid grid-cols-2 lg:flex lg:flex-row gap-2 items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">

                                    {/* App ID Select */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <Hash size={14} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm truncate"
                                            value={filters.appId}
                                            onChange={(e) => setFilters(prev => ({ ...prev, appId: e.target.value }))}
                                            style={{ minWidth: '0' }}
                                        >
                                            <option value="All">{t.allIds}</option>
                                            {availableAppIds.map(id => (
                                                <option key={id} value={id}>
                                                    {(idLabelsForSelected?.[id]?.name || filters.appName || id) + ` (${id})`}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* GEO Select (With Flags) */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none z-10">
                                            <Globe size={14} />
                                        </div>

                                        {/* Custom Visual Display for Selected Value */}
                                        <div className="w-full lg:w-auto min-w-0 pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 shadow-sm flex items-center gap-1.5 truncate">
                                            {filters.geo === 'All' ? (
                                                <span className="truncate">🌍 All GEOs</span>
                                            ) : (
                                                <>
                                                    <img
                                                        src={getCountryFlag(filters.geo)}
                                                        alt={filters.geo}
                                                        className="w-4 h-3 object-contain rounded-[2px] shrink-0"
                                                    />
                                                    <span className="truncate">{filters.geo}</span>
                                                </>
                                            )}
                                        </div>

                                        <select
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                            value={filters.geo}
                                            onChange={(e) => setFilters(prev => ({ ...prev, geo: e.target.value }))}
                                        >
                                            <option value="All" className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">All GEOs</option>
                                            {availableGeos.map(geo => (
                                                <option key={geo} value={geo} className="bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200">{geo}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                                    </div>

                                    {/* Granularity Selector */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <CalendarClock size={14} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-8 pr-6 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm"
                                            value={granularity}
                                            onChange={(e) => setGranularity(e.target.value as Granularity)}
                                        >
                                            <option value="Daily">{t.daily}</option>
                                            <option value="Weekly">{t.weekly}</option>
                                            <option value="Monthly">{t.monthly}</option>
                                            <option value="Yearly">{t.yearly}</option>
                                        </select>
                                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Keywords */}
                                    <div className="relative group w-full lg:w-auto col-span-1">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none">
                                            <Search size={16} />
                                        </div>
                                        <select
                                            className="w-full appearance-none pl-10 pr-8 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm"
                                            value={filters.keyword}
                                            onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
                                        >
                                            <option value="All">{t.allKeywords}</option>
                                            {availableKeywords.map(k => (
                                                <option key={k} value={k}>{k}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Date Picker & Reset Wrapper */}
                                    <div className="col-span-2 lg:col-span-1 lg:ml-auto flex items-center gap-2 w-full lg:w-auto min-w-0">
                                        {/* Date Range Picker */}
                                        <div className="flex-1 lg:w-auto min-w-0">
                                            <DateRangePicker
                                                startDate={filters.startDate}
                                                endDate={filters.endDate}
                                                onChange={(s, e) => setFilters(prev => ({ ...prev, startDate: s, endDate: e }))}
                                                theme={theme}
                                                t={t}
                                            />
                                        </div>

                                        {/* Reset Filters Button */}
                                        <button
                                            onClick={resetAllFilters}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 bg-white dark:bg-slate-700 shadow-sm shrink-0"
                                            title="Reset Filters"
                                        >
                                            <FilterX size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </header>

                        {/* Dashboard Main Scrollable Area */}
                        <div ref={mainContentRef} className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 pb-20">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                                            <TrendingUp size={24} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Total Installs</p>
                                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate" title={summary.installs.toLocaleString()}>{summary.installs.toLocaleString()}</h3>
                                        </div>
                                    </div>
                                </div>

                                {/* Ranking Card - Dynamic Styling */}
                                <div className={`p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group ${summary.rank === 1
                                    ? "bg-gradient-to-br from-slate-900 via-slate-800 to-black border-slate-700 shadow-xl shadow-slate-800/50 text-white" // Black Platinum
                                    : summary.rank > 0 && summary.rank <= 3
                                        ? "bg-gradient-to-br from-amber-50 to-orange-100 border-amber-200 shadow-md text-amber-900 dark:from-red-900/40 dark:to-red-800/40 dark:border-red-800 dark:text-red-100"
                                        : summary.rank > 3 && summary.rank <= 10
                                            ? "bg-gradient-to-br from-emerald-50 to-green-100 border-emerald-200 shadow-sm text-emerald-900 dark:from-blue-900/40 dark:to-blue-800/40 dark:border-blue-800 dark:text-blue-100"
                                            : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md text-slate-800 dark:text-slate-100"
                                    }`}>
                                    {/* Diagonal Silver Lining for Rank 1 */}
                                    {summary.rank === 1 && (
                                        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent pointer-events-none -translate-x-1/4 skew-x-12" />
                                    )}

                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center gap-4">
                                            {/* Icon Container */}
                                            <div className={`flex items-center justify-center ${summary.rank === 1 ? "" : // Custom container for Rank 1
                                                "p-3 rounded-xl border"
                                                } ${summary.rank > 0 && summary.rank <= 3 && summary.rank !== 1 ? "bg-amber-100 text-amber-600 border-amber-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700" :
                                                    summary.rank > 3 && summary.rank <= 10 ? "bg-emerald-100 text-emerald-600 border border-emerald-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700" :
                                                        summary.rank !== 1 ? "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-700" : ""
                                                }`}>
                                                {summary.rank === 1 ? (
                                                    <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-600 to-red-700 shadow-[0_0_20px_rgba(234,88,12,0.6)] ring-2 ring-slate-800">
                                                        {/* Center Fire */}
                                                        <Flame size={28} className="text-white fill-white animate-pulse drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                                    </div>
                                                ) :
                                                    summary.rank > 0 && summary.rank <= 3 ? <Trophy size={24} fill="currentColor" className="opacity-90" /> :
                                                        summary.rank > 3 && summary.rank <= 10 ? <Award size={24} /> :
                                                            <Hash size={24} />
                                                }
                                            </div>
                                            <div>
                                                <p className={`text-sm font-medium ${summary.rank === 1 ? "text-slate-400" : "opacity-70"}`}>
                                                    {summary.keywordCount === 1 && summary.geoCount === 1 ? 'Latest Ranking' : 'Avg. Ranking'}
                                                </p>
                                                <h3 className="text-2xl font-bold">
                                                    {summary.rank > 0 ? `#${summary.rank}` : '-'}
                                                </h3>
                                            </div>
                                        </div>

                                        <div className={`text-right pl-4 border-l ${summary.rank === 1 ? 'border-slate-700' :
                                            summary.rank > 0 && summary.rank <= 3 ? 'border-amber-200/50 dark:border-red-700/50' :
                                                summary.rank > 3 && summary.rank <= 10 ? 'border-emerald-200/50 dark:border-blue-700/50' :
                                                    'border-slate-100 dark:border-slate-800'
                                            }`}>
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-xs font-semibold ${summary.rank === 1 ? 'text-slate-400' : 'opacity-60'}`}>
                                                    across {summary.keywordCount} Keywords
                                                </span>
                                                <span className={`text-xs font-semibold ${summary.rank === 1 ? 'text-slate-400' : 'opacity-60'}`}>
                                                    across {summary.geoCount} Geos
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                            <DollarSign size={24} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">Total Cost</p>
                                            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 truncate" title={`$${summary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}>${summary.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Charts Section */}
                            <DashboardCharts
                                data={filteredData}
                                granularity={granularity}
                                viewMode={viewMode}
                                theme={theme}
                                translations={t}
                            />

                            {/* Real-Time Standings Section */}
                            {filters.appName && (() => {
                                // Find ALL entries for this app group (ignoring filters) to get the truly latest one
                                const allAppEntries = data.filter(d => (d.appGroup || d.appName) === filters.appName);
                                if (allAppEntries.length === 0) return null;

                                // Get the latest entry by date
                                const latestEntry = allAppEntries.reduce((latest, current) => {
                                    return new Date(current.date) > new Date(latest.date) ? current : latest;
                                }, allAppEntries[0]);

                                // Get all unique keyword/geo pairs for this specific app+id combination
                                const itemsForLatestApp = data
                                    .filter(d => (d.appGroup || d.appName) === filters.appName && d.appId === latestEntry.appId)
                                    .map(d => ({ keyword: d.keyword, geo: d.geo }))
                                    .filter((item, index, self) =>
                                        index === self.findIndex(t => t.keyword === item.keyword && t.geo === item.geo)
                                    );

                                const displayName = latestEntry.appName || filters.appName;

                                return (
                                    <div className="mt-8">
                                        <RealtimeStandings
                                            appId={latestEntry.appId}
                                            appName={displayName}
                                            appIcon={appIcons[filters.appName]}
                                            items={itemsForLatestApp}
                                            getCountryFlag={getCountryFlag}
                                            theme={theme}
                                            translations={t}
                                        />
                                    </div>
                                );
                            })()}

                            {/* AI Analysis Section */}
                            {(aiAnalysis || isAnalyzing) && (
                                <div
                                    ref={aiAnalysisRef}
                                    className="mt-8 bg-white dark:bg-slate-900 rounded-2xl border border-indigo-100 dark:border-indigo-900 shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
                                >
                                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center gap-3">
                                        <BrainCircuit className="text-white animate-pulse" size={24} />
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-bold text-white">{t.aiAnalysis}</h3>
                                            {aiAnalysisMeta?.start && aiAnalysisMeta?.end && (
                                                <div className="text-[11px] text-white/75 font-medium">
                                                    {aiAnalysisMeta.start} - {aiAnalysisMeta.end} - {aiAnalysisMeta.rows} {lang === 'ru' ? 'строк' : 'rows'}
                                                </div>
                                            )}
                                        </div>
                                        {isAnalyzing && (
                                            <div className="ml-auto flex items-center gap-2 text-white/80 text-xs font-semibold">
                                                <Loader2 size={14} className="animate-spin" />
                                                <span>{t.analyzing}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-6">
                                        {isAnalyzing && !aiAnalysis ? (
                                            <div className="flex flex-col items-center justify-center py-8 text-slate-400 animate-in fade-in zoom-in duration-300">
                                                <Loader2 size={24} className="animate-spin mb-2 text-purple-500" />
                                                <p className="text-sm font-medium">{t.analyzing}</p>
                                            </div>
                                        ) : aiAnalysis && (aiAnalysis.startsWith('Failed') || aiAnalysis.startsWith('API Key is missing')) ? (
                                            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
                                                <p className="text-sm text-red-600 dark:text-red-400 text-center">{t.aiAnalysisError}</p>
                                            </div>
                                        ) : (
                                            <div className="prose prose-slate dark:prose-invert max-w-none">
                                                <div dangerouslySetInnerHTML={{
                                                    __html: DOMPurify.sanitize(
                                                        aiAnalysis
                                                            .replace(/\r\n/g, '\n')
                                                            .replace(/\n{2,}/g, '\n')
                                                            .replace(/^####\s+(.*)$/gm, '<div class="mt-2 mb-1 text-[13px] font-bold text-slate-800 dark:text-slate-200">$1</div>')
                                                            .replace(/^###\s+(.*)$/gm, '<div class="mt-3 mb-1 text-[15px] font-extrabold text-slate-900 dark:text-white">$1</div>')
                                                            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-200 font-bold">$1</strong>')
                                                            .replace(/\* (.*?)\n/g, '<li class="ml-4 list-disc text-slate-700 dark:text-slate-300">$1</li>')
                                                            .replace(/\n/g, '<br />'),
                                                        { ALLOWED_TAGS: ['strong', 'li', 'br', 'ul', 'p', 'div', 'span'], ALLOWED_ATTR: ['class'] }
                                                    )
                                                }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Keyword Suggester Section */}
                            {filters.appName && (
                                <KeywordSuggester
                                    appName={filters.appName}
                                    geo={filters.geo}
                                    existingKeywords={allAppKeywords}
                                    theme={theme}
                                    t={t}
                                />
                            )}

                            {/* Data Management Section */}
                            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
                                <div className="flex flex-col gap-6">
                                    {/* Header */}
                                    <div>
                                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.dataManagement}</h4>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">{t.manageSettings} <span className="font-medium text-slate-800 dark:text-slate-200">{filters.appName || 'current selection'}</span>.</p>
                                    </div>

                                    {/* Controls Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* CPI Management */}
                                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                            <div className="flex justify-between items-center mb-2">
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t.defaultCpi}</label>
                                                {showCpiSuccess && (
                                                    <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold animate-in fade-in">
                                                        <Check size={12} /> {t.update}d!
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="w-full pl-6 pr-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
                                                        value={cpiInput}
                                                        onChange={(e) => setCpiInput(e.target.value)}
                                                        placeholder="0.09"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleRequestCPIUpdate}
                                                    className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                                                >
                                                    {t.update}
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">
                                                Updates historical cost data for all entries of this app.
                                            </p>
                                        </div>

                                        {/* Danger Zone */}
                                        <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100 dark:border-red-900/30 flex flex-col justify-center items-start">
                                            <h5 className="text-sm font-bold text-red-800 dark:text-red-400 mb-1">{t.dangerZone}</h5>
                                            <p className="text-xs text-red-600 dark:text-red-300 mb-3">{t.permanentlyRemove}</p>
                                            <div className="flex flex-col gap-2 w-full">
                                                <button
                                                    onClick={requestDeleteApp}
                                                    disabled={filters.appId === 'All' || !filters.appId}
                                                    className={`flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border rounded-lg transition-colors text-sm font-medium shadow-sm w-full ${
                                                        filters.appId === 'All' || !filters.appId
                                                            ? 'border-red-100 dark:border-red-900/30 text-red-300 dark:text-red-500 cursor-not-allowed opacity-70'
                                                            : 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300'
                                                    }`}
                                                >
                                                    <Trash2 size={16} />
                                                    {filters.appId === 'All' || !filters.appId
                                                        ? `${t.deleteApp} (Choose the app)`
                                                        : `${t.deleteApp} (${filters.appId})`}
                                                </button>
                                                <button
                                                    onClick={requestDeleteAllApps}
                                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-red-800 border border-red-800 text-white rounded-lg hover:bg-red-700 hover:border-red-700 transition-colors text-sm font-medium shadow-sm w-full"
                                                >
                                                    <AlertTriangle size={16} />
                                                    Delete All {filters.appName} Data
                                                </button>
                                            </div>
                                        </div>
                                        {filters.appName && availableAppIds.length > 0 && (
                                            <div className="col-span-1">
                                                <AppAliasManager
                                                    appName={filters.appName}
                                                    appIds={availableAppIds}
                                                    aliases={appAliases[filters.appName] || []}
                                                    onSave={(rows) => handleSaveAliases(filters.appName!, rows)}
                                                    suggestedPrefix={defaultAliasPrefix}
                                                    idLabelMap={idLabelsForSelected ? Object.fromEntries(Object.entries(idLabelsForSelected).map(([id, info]) => [id, info.name ? `${info.name} (${id})` : `${filters.appName} (${id})`])) : undefined}
                                                    t={t}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Upload Modal */}
            <DataUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onAddData={handleAddData}
                selectedApp={filters.appName}
                activeApps={activeApps}
                existingDataKeys={existingDataKeys}
                theme={theme}
                t={t}
                onRequestConfirm={requestConfirmation}
            />

            {/* Delete Confirmation Modal */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Delete Application?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-200">{deleteConfirmation}</strong>?<br />
                                This action cannot be undone and all associated data will be permanently removed.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setDeleteConfirmation(null)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteApp}
                                    className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-lg shadow-red-500/30 transition-colors"
                                >
                                    Yes, Delete it
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete ALL Confirmation Modal */}
            {deleteAllConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30 animate-pulse">
                                <AlertTriangle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Delete All {filters.appName} Data?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-4">
                                Are you sure you want to delete <strong className="text-red-600 dark:text-red-400">ALL DATA</strong> for <span className="font-bold">{filters.appName}</span>?<br />
                                <span className="font-bold text-red-600 dark:text-red-400">This will remove all versions and IDs for this app.</span>
                            </p>
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6 text-left">
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    <strong>⚠️ Note:</strong> If this app is synced from Google Sheets, you'll also need to remove it from your spreadsheet to prevent it from reappearing on the next sync.
                                </p>
                            </div>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setDeleteAllConfirmation(false)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteAllApps}
                                    className="px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-lg shadow-red-500/30 transition-colors"
                                >
                                    Yes, Delete All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CPI Confirmation Modal */}
            {cpiConfirmation !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <DollarSign size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Update Cost Per Install?</h3>
                            <p className="text-slate-600 dark:text-slate-400 mb-6">
                                Update CPI to <strong className="text-slate-900 dark:text-slate-200">${cpiConfirmation.toFixed(2)}</strong> for all records of <strong className="text-slate-900 dark:text-slate-200">{filters.appName}</strong>?<br />
                                This will recalculate historical costs.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setCpiConfirmation(null)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmUpdateCPI}
                                    className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-colors"
                                >
                                    Yes, Update
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Generic Confirmation Modal */}
            {confirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-6 text-center">
                            <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle size={28} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                                {confirmDialog.message}
                            </h3>
                            {confirmDialog.subMessage && (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                    {confirmDialog.subMessage}
                                </p>
                            )}
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => closeConfirmDialog(false)}
                                    className="px-5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    {confirmDialog.cancelText || (lang === 'ru' ? 'Отмена' : 'Cancel')}
                                </button>
                                <button
                                    onClick={() => closeConfirmDialog(true)}
                                    className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-colors"
                                >
                                    {confirmDialog.confirmText || (lang === 'ru' ? 'Подтвердить' : 'Confirm')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Management Modal */}
            {categoryModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-sm shadow-xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200 border dark:border-slate-800">
                        <div className="p-5">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                    {categoryModal.mode === 'create' && t.newFolder}
                                    {categoryModal.mode === 'rename' && 'Rename Folder'}
                                    {categoryModal.mode === 'delete' && 'Delete Folder'}
                                </h3>
                                <button
                                    onClick={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {categoryModal.mode === 'delete' ? (
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                                    Are you sure you want to delete <strong className="text-slate-900 dark:text-slate-200">{categoryModal.targetName}</strong>?
                                    Any apps inside will be moved to "{t.uncategorized}".
                                </p>
                            ) : (
                                <div className="mb-6">
                                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Folder Name</label>
                                    <input
                                        className="w-full p-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 dark:text-slate-100"
                                        value={categoryModal.inputValue}
                                        onChange={(e) => setCategoryModal(prev => ({ ...prev, inputValue: e.target.value }))}
                                        placeholder="My Folder"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCategoryModalSubmit();
                                        }}
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setCategoryModal(prev => ({ ...prev, isOpen: false }))}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCategoryModalSubmit}
                                    disabled={categoryModal.mode !== 'delete' && !categoryModal.inputValue.trim()}
                                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${categoryModal.mode === 'delete'
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
                                        }`}
                                >
                                    {categoryModal.mode === 'delete' ? 'Delete' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default App;
