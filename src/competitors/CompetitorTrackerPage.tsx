import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Info, Loader2, RefreshCw } from 'lucide-react';
import type { CompetitorDetection, CompetitorTarget } from '../../types';
import type { AsoRow } from '../warnings/computeWarnings';
import { formatDate } from '../warnings/date';
import { normalizeAppCategoryMap, normalizeAppKeyList } from '../warnings/normalize';

type Page = 'dashboard' | 'overview' | 'lab' | 'warnings' | 'competitors';

interface CompetitorTrackerPageProps {
  rows: AsoRow[];
  categories: string[];
  appCategoryMap: Record<string, string>;
  hiddenApps: string[];
  appIcons: Record<string, string>;
  getCountryFlag: (geo: string) => string;
  lang: 'en' | 'ru';
  t: any;
  setCurrentPage: (page: Page) => void;
  competitorDetections: CompetitorDetection[];
  onToggleCompetitorIgnored: (id: string, ignored: boolean) => void;
  competitorTargets: CompetitorTarget[];
  onTrackCompetitors: (appKey: string, maxPairs?: number, enablePotential?: boolean, enableKeywordMatch?: boolean) => void;
  onTrackCompetitorsFolder: (appKeys: string[], maxPairs?: number, enablePotential?: boolean, enableKeywordMatch?: boolean, folderKey?: string) => void;
  onToggleCompetitorTracking: (appKey: string, isActive: boolean) => void;
  onToggleCompetitorTrackingFolder: (appKeys: string[], isActive: boolean) => void;
  onRefreshCompetitors: () => void;
  competitorRefreshing?: boolean;
  onDeleteCompetitors: (appKey: string) => void;
  competitorTrackingByApp?: Record<string, boolean>;
  competitorTrackingByFolder?: Record<string, boolean>;
}

const folderOf = (appKey: string, appCategoryMap: Record<string, string>): string => {
  const mapped = appCategoryMap?.[appKey];
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();
  return 'Uncategorized';
};

const safeInt = (value: unknown): number =>
  (Number.isFinite(value as any) ? Math.max(0, Math.trunc(value as any)) : 0);

export const CompetitorTrackerPage: React.FC<CompetitorTrackerPageProps> = ({
  rows,
  categories,
  appCategoryMap,
  hiddenApps,
  appIcons,
  getCountryFlag,
  lang,
  t,
  setCurrentPage,
  competitorDetections,
  onToggleCompetitorIgnored,
  competitorTargets,
  onTrackCompetitors,
  onTrackCompetitorsFolder,
  onToggleCompetitorTracking,
  onToggleCompetitorTrackingFolder,
  onRefreshCompetitors,
  competitorRefreshing = false,
  onDeleteCompetitors,
  competitorTrackingByApp,
  competitorTrackingByFolder,
}) => {
  const today = formatDate(new Date());
  const normalizedAppCategoryMap = useMemo(() => normalizeAppCategoryMap(appCategoryMap), [appCategoryMap]);
  const normalizedHiddenApps = useMemo(() => normalizeAppKeyList(hiddenApps), [hiddenApps]);

  const pluralCompetitors = (count: number): string => {
    const n = Math.abs(count);
    if (lang !== 'ru') return n === 1 ? 'competitor' : 'competitors';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'конкурент';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'конкурента';
    return 'конкурентов';
  };

  const folderOrder = useMemo(() => {
    const base = (Array.isArray(categories) ? categories : [])
      .filter((c) => typeof c === 'string' && c.trim() && c.trim() !== 'Uncategorized')
      .map((c) => c.trim());
    const baseSet = new Set(base);

    const extra = new Set<string>();
    Object.values(normalizedAppCategoryMap || {}).forEach((f) => {
      if (typeof f !== 'string') return;
      const trimmed = f.trim();
      if (!trimmed || trimmed === 'Uncategorized' || baseSet.has(trimmed)) return;
      extra.add(trimmed);
    });

    const extraList = Array.from(extra).sort((a, b) => a.localeCompare(b));
    return [...base, ...extraList, 'Uncategorized'];
  }, [categories, normalizedAppCategoryMap]);

  const appsByFolder = useMemo(() => {
    const hiddenSet = new Set(normalizedHiddenApps);
    const folderToApps: Record<string, Set<string>> = {};
    folderOrder.forEach((f) => (folderToApps[f] = new Set()));

    for (const row of rows) {
      const appKey = (row?.appGroup || row?.appName || '').trim();
      if (!appKey || hiddenSet.has(appKey)) continue;
      const folder = folderOf(appKey, normalizedAppCategoryMap);
      if (!folderToApps[folder]) folderToApps[folder] = new Set();
      folderToApps[folder].add(appKey);
    }

    const out: Record<string, string[]> = {};
    Object.keys(folderToApps).forEach((folder) => {
      out[folder] = Array.from(folderToApps[folder]).sort((a, b) => a.localeCompare(b));
    });
    return out;
  }, [rows, normalizedHiddenApps, normalizedAppCategoryMap, folderOrder]);

  const foldersWithApps = useMemo(() => {
    return folderOrder.filter((folder) => (appsByFolder[folder] || []).length > 0);
  }, [folderOrder, appsByFolder]);

  const [trackerExpandedFolders, setTrackerExpandedFolders] = useState<Record<string, boolean>>({});
  const [trackerExpandedApps, setTrackerExpandedApps] = useState<Record<string, boolean>>({});
  const [trackPopoverKey, setTrackPopoverKey] = useState<string | null>(null);
  const [trackMode, setTrackMode] = useState<'all' | 'top5'>('all');
  const [trackSymbols, setTrackSymbols] = useState(false);
  const [trackKeywords, setTrackKeywords] = useState(false);
  const trackPopoverRef = useRef<HTMLDivElement | null>(null);
  const [showIgnoredByApp, setShowIgnoredByApp] = useState<Record<string, boolean>>({});
  const [showPotentialByApp, setShowPotentialByApp] = useState<Record<string, boolean>>({});
  const [showBannedByApp, setShowBannedByApp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!trackPopoverKey) return;
      if (trackPopoverRef.current && trackPopoverRef.current.contains(event.target as Node)) {
        return;
      }
      setTrackPopoverKey(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [trackPopoverKey]);

  const competitorsByApp = useMemo(() => {
    const map: Record<string, CompetitorDetection[]> = {};
    (Array.isArray(competitorDetections) ? competitorDetections : []).forEach((item) => {
      const key = (item?.targetAppName || '').trim();
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });

    Object.keys(map).forEach((key) => {
      map[key].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || ''));
      });
    });

    return map;
  }, [competitorDetections]);

  const competitorCounts = useMemo(() => {
    const byApp: Record<string, number> = {};
    const byFolder: Record<string, number> = {};
    let total = 0;
    (Array.isArray(competitorDetections) ? competitorDetections : []).forEach((item) => {
      if (item?.isIgnored || item?.isPotential || item?.isBanned) return;
      const appKey = (item?.targetAppName || '').trim();
      if (!appKey) return;
      byApp[appKey] = (byApp[appKey] || 0) + 1;
      const folder = folderOf(appKey, normalizedAppCategoryMap);
      byFolder[folder] = (byFolder[folder] || 0) + 1;
      total += 1;
    });
    return { byApp, byFolder, total };
  }, [competitorDetections, normalizedAppCategoryMap]);

  const competitorCount = competitorCounts.total;
  const trackingByApp = competitorTrackingByApp || {};
  const trackingByFolder = competitorTrackingByFolder || {};
  const trackingLabel = t.competitorTrackingNow || (lang === 'ru' ? 'Трекинг...' : 'Tracking...');

  const competitorPairCountsByApp = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    rows.forEach((row) => {
      const appKey = (row?.appGroup || row?.appName || '').trim();
      if (!appKey) return;
      const keyword = (row.keyword || '').trim();
      const geo = (row.geo || '').trim();
      if (!keyword || !geo) return;
      if (keyword.toLowerCase() === 'all' || geo.toLowerCase() === 'all') return;
      if (!map[appKey]) map[appKey] = new Set();
      map[appKey].add(`${keyword}::${geo}`);
    });
    const out: Record<string, number> = {};
    Object.entries(map).forEach(([key, set]) => {
      out[key] = set.size;
    });
    return out;
  }, [rows, today]);

  const competitorPairCountsByFolder = useMemo(() => {
    const out: Record<string, number> = {};
    folderOrder.forEach((folder) => {
      const apps = appsByFolder[folder] || [];
      let total = 0;
      apps.forEach((appKey) => {
        total += competitorPairCountsByApp[appKey] || 0;
      });
      out[folder] = total;
    });
    return out;
  }, [folderOrder, appsByFolder, competitorPairCountsByApp]);

  const competitorTargetsByApp = useMemo(() => {
    const map: Record<string, CompetitorTarget> = {};
    (Array.isArray(competitorTargets) ? competitorTargets : []).forEach((target) => {
      const key = target?.appName?.trim();
      if (!key) return;
      map[key] = target;
    });
    return map;
  }, [competitorTargets]);

  const trackedAppNames = useMemo(() => {
    const set = new Set<string>();
    (Array.isArray(competitorTargets) ? competitorTargets : []).forEach((target) => {
      if (target?.isActive && target.appName) set.add(target.appName);
    });
    return set;
  }, [competitorTargets]);

  const sortedTrackerAppsInFolder = (folder: string): string[] => {
    const apps = appsByFolder[folder] || [];
    return [...apps].sort((a, b) => {
      const ca = competitorCounts.byApp[a] || 0;
      const cb = competitorCounts.byApp[b] || 0;
      if (ca !== cb) return cb - ca;
      return a.localeCompare(b);
    });
  };

  useEffect(() => {
    setTrackerExpandedFolders((prev) => {
      const next = { ...prev };
      folderOrder.forEach((folder) => {
        if (typeof next[folder] !== 'boolean') {
          const apps = appsByFolder[folder] || [];
          const hasTracked = apps.some((appKey) => trackedAppNames.has(appKey));
          next[folder] = hasTracked ? (competitorCounts.byFolder[folder] || 0) > 0 : false;
        }
      });
      return next;
    });
  }, [folderOrder, appsByFolder, competitorCounts.byFolder, trackedAppNames]);

  useEffect(() => {
    setTrackerExpandedApps((prev) => {
      const next = { ...prev };
      folderOrder.forEach((folder) => {
        const apps = appsByFolder[folder] || [];
        apps.forEach((appKey) => {
          if (typeof next[appKey] === 'boolean') return;
          const isTracked = trackedAppNames.has(appKey);
          next[appKey] = isTracked ? (competitorCounts.byApp[appKey] || 0) > 0 : false;
        });
      });
      return next;
    });
  }, [folderOrder, appsByFolder, competitorCounts.byApp, trackedAppNames]);

  const formatIsoDate = (value?: string | null): string => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return formatDate(d);
  };

  const openTrackPopover = (key: string, symbolsDefault = false, keywordsDefault = false) => {
    setTrackMode('all');
    setTrackSymbols(symbolsDefault);
    setTrackKeywords(keywordsDefault);
    setTrackPopoverKey((prev) => (prev === key ? null : key));
  };

  const confirmTrackApp = (appKey: string) => {
    if (trackingByApp[appKey] || competitorRefreshing) return;
    onTrackCompetitors(appKey, trackMode === 'top5' ? 5 : undefined, trackSymbols, trackKeywords);
    setTrackPopoverKey(null);
  };

  const confirmTrackFolder = (folder: string, appKeys: string[]) => {
    if (trackingByFolder[folder] || competitorRefreshing) return;
    onTrackCompetitorsFolder(appKeys, trackMode === 'top5' ? 5 : undefined, trackSymbols, trackKeywords, folder);
    setTrackPopoverKey(null);
  };

  const renderCompetitorRow = (item: CompetitorDetection) => {
    const releaseDate = formatIsoDate(item.candidateReleaseDate);
    const updateDate = formatIsoDate(item.candidateUpdateDate);
    const lastSeen = formatIsoDate(item.lastSeenAt);
    const foundInList = Array.isArray(item.foundIn) ? item.foundIn : [];
    const bestRank = foundInList.reduce<number | null>((best, entry) => {
      const rank = Number.isFinite(entry.rank) ? entry.rank : null;
      if (!rank || rank <= 0) return best;
      if (best === null || rank < best) return rank;
      return best;
    }, null);
    const previewFoundIn = foundInList.slice(0, 3);
    const extraFoundIn = Math.max(0, foundInList.length - previewFoundIn.length);
    const scorePct = Math.round(item.score * 100);
    const iconNode = item.candidateArtworkUrl ? (
      <img
        src={item.candidateArtworkUrl}
        alt={item.candidateName}
        className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0"
      />
    ) : (
      <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-300 shrink-0">
        {item.candidateName.slice(0, 1).toUpperCase()}
      </div>
    );

    return (
      <div key={item.id} className={`px-4 py-3 ${item.isIgnored ? 'opacity-60' : ''}`}>
        <div className="flex items-start gap-3">
          {item.candidateUrl ? (
            <a href={item.candidateUrl} target="_blank" rel="noreferrer">
              {iconNode}
            </a>
          ) : (
            iconNode
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {item.candidateUrl ? (
                <a
                  href={item.candidateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-slate-900 dark:text-slate-100 hover:underline"
                >
                  {item.candidateName}
                </a>
              ) : (
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {item.candidateName}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-500/30">
                {scorePct}%
              </span>
              {item.isIgnored && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {t.competitorIgnored || 'Ignored'}
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {[item.candidateSeller, item.candidateGenre].filter(Boolean).join(' - ')}
            </div>

            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {[releaseDate && `${t.competitorRelease || 'Release'}: ${releaseDate}`,
                updateDate && `${t.competitorUpdate || 'Update'}: ${updateDate}`,
                lastSeen && `${t.competitorLastSeen || 'Last seen'}: ${lastSeen}`,
              ].filter(Boolean).join(' - ')}
            </div>

            {(bestRank || previewFoundIn.length > 0) && (
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                {bestRank ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-900/5 dark:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700">
                    {t.competitorTopRank || 'Top rank'}: #{bestRank}
                  </span>
                ) : null}
                {previewFoundIn.length > 0 && (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">{t.competitorIn || 'In'}:</span>
                    {previewFoundIn.map((entry, idx) => {
                      const flagSrc = getCountryFlag(entry.geo);
                      const entryKey = `${entry.geo}-${entry.keyword}-${entry.rank}-${idx}`;
                      return (
                        <span key={entryKey} className="inline-flex items-center gap-1.5">
                          {flagSrc ? (
                            <img
                              src={flagSrc}
                              alt={entry.geo}
                              className="w-4 h-3 object-contain shadow-sm rounded-[2px]"
                            />
                          ) : (
                            <span className="text-[10px] font-bold">{entry.geo}</span>
                          )}
                          <span className="text-slate-600 dark:text-slate-300">{entry.keyword}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-500/30">
                            #{entry.rank}
                          </span>
                        </span>
                      );
                    })}
                    {extraFoundIn > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        +{extraFoundIn}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => onToggleCompetitorIgnored(item.id, !item.isIgnored)}
            className="px-2 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {item.isIgnored ? (t.competitorUnignore || 'Unignore') : (t.competitorIgnore || 'Ignore')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 pt-16 md:p-6 md:pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">
              {t.competitorTracker || 'Competitor tracker'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {competitorCount} {pluralCompetitors(competitorCount)}
            </span>
          </div>
          <button
            onClick={onRefreshCompetitors}
            disabled={competitorRefreshing}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title={t.competitorRefreshNow || 'Refresh now'}
          >
            {competitorRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">{competitorRefreshing ? trackingLabel : (t.competitorRefreshNow || 'Refresh now')}</span>
          </button>
          <button
            onClick={() => setCurrentPage('dashboard')}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{t.back || 'Back'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {foldersWithApps.map((folder) => {
          const expanded = trackerExpandedFolders[folder] ?? (competitorCounts.byFolder[folder] || 0) > 0;
          const folderCount = safeInt(competitorCounts.byFolder?.[folder] || 0);
          const folderPairCount = safeInt(competitorPairCountsByFolder[folder] || 0);
          const apps = sortedTrackerAppsInFolder(folder);
          const folderHasTop5 = apps.some((appKey) => (competitorPairCountsByApp[appKey] || 0) > 5);
          const folderTargets = apps
            .map((appKey) => competitorTargetsByApp[appKey])
            .filter(Boolean) as CompetitorTarget[];
          const folderTargetNames = folderTargets.map((target) => target.appName);
          const folderActiveCount = folderTargets.filter((target) => target.isActive).length;
          const folderTrackingEnabled = folderTargets.length > 0 && folderActiveCount === folderTargets.length;
          const folderTrackKey = `folder:${folder}`;
          const folderIsTracking = !!trackingByFolder[folder] || competitorRefreshing;
          const folderSymbolsDefault = folderTargets.length > 0 && folderTargets.every((target) => target.enablePotential);
          const folderKeywordsDefault = folderTargets.length > 0 && folderTargets.every((target) => target.enableKeywordMatch);

          return (
            <div key={folder} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setTrackerExpandedFolders((prev) => ({ ...prev, [folder]: !expanded }))}
                  className="flex items-center gap-2 min-w-0 text-left"
                  title={expanded ? (lang === 'ru' ? 'Свернуть' : 'Collapse') : (lang === 'ru' ? 'Развернуть' : 'Expand')}
                >
                  {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{folder}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {folderCount} {pluralCompetitors(folderCount)}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <label
                    className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                    title={
                      folderTargets.length > 0
                        ? (t.competitorTracking || 'Tracking')
                        : (lang === 'ru' ? 'Сначала запусти трекинг' : 'Track first')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={folderTrackingEnabled}
                      disabled={folderTargets.length === 0 || folderIsTracking}
                      onChange={(e) => onToggleCompetitorTrackingFolder(folderTargetNames, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-indigo-600 dark:accent-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="hidden sm:inline">{t.competitorTracking || 'Tracking'}</span>
                  </label>

                  <div
                    className="relative"
                    ref={trackPopoverKey === folderTrackKey ? trackPopoverRef : null}
                  >
                    <button
                      onClick={() => openTrackPopover(folderTrackKey, folderSymbolsDefault, folderKeywordsDefault)}
                      disabled={folderIsTracking}
                      className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {folderIsTracking && <Loader2 size={12} className="animate-spin" />}
                        <span>{folderIsTracking ? trackingLabel : (t.competitorTrackFolder || 'Track folder')}</span>
                      </span>
                    </button>

                    {trackPopoverKey === folderTrackKey && (
                      <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3 text-xs text-slate-700 dark:text-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                          {t.competitorTrackMode || 'Track mode'}
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="track-mode-folder"
                              checked={trackMode === 'all'}
                              onChange={() => setTrackMode('all')}
                              className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                            />
                            <span>
                              {t.competitorTrackAll || 'All'}
                              {folderPairCount > 0 ? ` (${folderPairCount})` : ''}
                            </span>
                          </label>

                          {folderHasTop5 && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="track-mode-folder"
                                checked={trackMode === 'top5'}
                                onChange={() => setTrackMode('top5')}
                                className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                              />
                              <span>{t.competitorTrackTop5 || 'Top 5'}</span>
                            </label>
                          )}

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={trackKeywords}
                              onChange={(e) => setTrackKeywords(e.target.checked)}
                              className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                            />
                            <span className="inline-flex items-center gap-1">
                              {t.competitorTrackKeywords || 'Keyword hunt'}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                title={t.competitorTrackKeywordsTip || 'Also scans for apps that include the keyword in the title.'}
                                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                              >
                                <Info size={12} />
                              </span>
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={trackSymbols}
                              onChange={(e) => setTrackSymbols(e.target.checked)}
                              className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                            />
                            <span className="inline-flex items-center gap-1">
                              {t.competitorTrackSymbols || 'Symbol hunt'}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onKeyDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                title={t.competitorTrackSymbolsTip || 'Finds apps using unusual non‑Latin symbols in the name.'}
                                className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                              >
                                <Info size={12} />
                              </span>
                            </span>
                          </label>

                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              onClick={() => setTrackPopoverKey(null)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                            >
                              {t.cancel || 'Cancel'}
                            </button>
                            <button
                              onClick={() => confirmTrackFolder(folder, apps)}
                              disabled={folderIsTracking}
                              className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {folderIsTracking && <Loader2 size={12} className="animate-spin" />}
                                <span>{folderIsTracking ? trackingLabel : (t.competitorRun || 'Run')}</span>
                              </span>
                            </button>
                          </div>

                          <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-700 rotate-45" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {expanded && (
                <div className="p-4 space-y-2">
                  {apps.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {t.warningsNoAppsInFolder || 'No apps in this folder.'}
                    </div>
                  ) : (
                    apps.map((appKey) => {
                      const competitors = competitorsByApp[appKey] || [];
                      const competitorTotal = competitors.length;
                      const bannedCompetitors = competitors.filter((item) => item.isBanned);
                      const potentialCompetitors = competitors.filter((item) => !item.isBanned && item.isPotential);
                      const ignoredCompetitors = competitors.filter((item) => !item.isBanned && !item.isPotential && item.isIgnored);
                      const visibleCompetitors = competitors.filter((item) => !item.isBanned && !item.isPotential && !item.isIgnored);
                      const ignoredCount = ignoredCompetitors.length;
                      const potentialCount = potentialCompetitors.length;
                      const bannedCount = bannedCompetitors.length;
                      const showIgnored = !!showIgnoredByApp[appKey];
                      const showPotential = !!showPotentialByApp[appKey];
                      const showBanned = !!showBannedByApp[appKey];
                      const isExpanded = trackerExpandedApps[appKey] ?? competitorTotal > 0;
                      const target = competitorTargetsByApp[appKey];
                      const isTracked = target?.isActive ?? false;
                      const canToggleTracking = !!target;
                      const icon = appIcons?.[appKey];
                      const appIsTracking = !!trackingByApp[appKey] || competitorRefreshing;
                      const appPairCount = safeInt(competitorPairCountsByApp[appKey] || 0);
                      const appTrackKey = `app:${appKey}`;

                      return (
                        <div key={appKey} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-visible">
                          <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-slate-50 dark:bg-slate-950/40">
                            <button
                              onClick={() => setTrackerExpandedApps((prev) => ({ ...prev, [appKey]: !isExpanded }))}
                              className="flex flex-1 items-center gap-2 sm:gap-3 min-w-0 text-left"
                              title={isExpanded ? (lang === 'ru' ? 'Свернуть' : 'Collapse') : (lang === 'ru' ? 'Развернуть' : 'Expand')}
                            >
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                              {icon ? (
                                <img
                                  src={icon}
                                  alt={`${appKey} icon`}
                                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-300 shrink-0">
                                  {appKey.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div
                                  className="font-semibold text-slate-900 dark:text-slate-100 leading-snug sm:truncate overflow-hidden"
                                  style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                  }}
                                >
                                  {appKey}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {visibleCompetitors.length > 0
                                    ? `${visibleCompetitors.length} ${pluralCompetitors(visibleCompetitors.length)}`
                                    : (t.competitorNone || 'No competitors yet')}
                                  {visibleCompetitors.length === 0 && ignoredCount > 0
                                    ? ` (${ignoredCount} ${t.competitorIgnoredCount || t.competitorIgnored || 'ignored'})`
                                    : ''}
                                  {visibleCompetitors.length === 0 && potentialCount > 0
                                    ? ` (${potentialCount} ${t.competitorPotential || 'potential'})`
                                    : ''}
                                  {visibleCompetitors.length === 0 && bannedCount > 0
                                    ? ` (${bannedCount} ${t.competitorBanned || 'banned'})`
                                    : ''}
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-3 shrink-0">
                              <label
                                className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                                title={
                                  canToggleTracking
                                    ? (t.competitorTracking || 'Tracking')
                                    : (lang === 'ru' ? 'Сначала запусти трекинг' : 'Track first')
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isTracked}
                                  disabled={!canToggleTracking || appIsTracking}
                                  onChange={(e) => onToggleCompetitorTracking(appKey, e.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-indigo-600 dark:accent-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <span className="hidden sm:inline">{t.competitorTracking || 'Tracking'}</span>
                              </label>

                              <div
                                className="relative"
                                ref={trackPopoverKey === appTrackKey ? trackPopoverRef : null}
                              >
                                <button
                                  onClick={() => openTrackPopover(appTrackKey, target?.enablePotential ?? false, target?.enableKeywordMatch ?? false)}
                                  disabled={appIsTracking}
                                  className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  <span className="inline-flex items-center gap-1.5">
                                    {appIsTracking && <Loader2 size={12} className="animate-spin" />}
                                    <span>{appIsTracking ? trackingLabel : (t.competitorTrack || 'Track')}</span>
                                  </span>
                                </button>

                                {trackPopoverKey === appTrackKey && (
                                  <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-3 text-xs text-slate-700 dark:text-slate-200">
                                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                                      {t.competitorTrackMode || 'Track mode'}
                                    </div>

                                    <div className="space-y-2">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`track-mode-${appKey}`}
                                          checked={trackMode === 'all'}
                                          onChange={() => setTrackMode('all')}
                                          className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                        />
                                        <span>
                                          {t.competitorTrackAll || 'All'}
                                          {appPairCount > 0 ? ` (${appPairCount})` : ''}
                                        </span>
                                      </label>

                                      {appPairCount > 5 && (
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="radio"
                                            name={`track-mode-${appKey}`}
                                            checked={trackMode === 'top5'}
                                            onChange={() => setTrackMode('top5')}
                                            className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                          />
                                          <span>{t.competitorTrackTop5 || 'Top 5'}</span>
                                        </label>
                                      )}

                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={trackKeywords}
                                          onChange={(e) => setTrackKeywords(e.target.checked)}
                                          className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                        />
                                        <span className="inline-flex items-center gap-1">
                                          {t.competitorTrackKeywords || 'Keyword hunt'}
                                          <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                            onKeyDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                            title={t.competitorTrackKeywordsTip || 'Also scans for apps that include the keyword in the title.'}
                                            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                                          >
                                            <Info size={12} />
                                          </span>
                                        </span>
                                      </label>

                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={trackSymbols}
                                          onChange={(e) => setTrackSymbols(e.target.checked)}
                                          className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                        />
                                        <span className="inline-flex items-center gap-1">
                                          {t.competitorTrackSymbols || 'Symbol hunt'}
                                          <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                            onKeyDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                            title={t.competitorTrackSymbolsTip || 'Finds apps using unusual non‑Latin symbols in the name.'}
                                            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                                          >
                                            <Info size={12} />
                                          </span>
                                        </span>
                                      </label>

                                      <div className="mt-3 flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => setTrackPopoverKey(null)}
                                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                                        >
                                          {t.cancel || 'Cancel'}
                                        </button>
                                        <button
                                          onClick={() => confirmTrackApp(appKey)}
                                          disabled={appIsTracking}
                                          className="px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                          <span className="inline-flex items-center gap-1.5">
                                            {appIsTracking && <Loader2 size={12} className="animate-spin" />}
                                            <span>{appIsTracking ? trackingLabel : (t.competitorRun || 'Run')}</span>
                                          </span>
                                        </button>
                                      </div>

                                      <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-700 rotate-45" />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => {
                                  onDeleteCompetitors(appKey);
                                }}
                                disabled={appIsTracking}
                                className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-rose-500/30 text-rose-600 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              >
                                {t.competitorDelete || 'Clear'}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-200 dark:border-slate-800">
                              {visibleCompetitors.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                  {t.competitorNone || 'No competitors yet'}
                                  {ignoredCount > 0 && (
                                    <>
                                      {' '}
                                      <button
                                        type="button"
                                        onClick={() => setShowIgnoredByApp((prev) => ({ ...prev, [appKey]: !showIgnored }))}
                                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                                      >
                                        ({ignoredCount} {t.competitorIgnoredCount || t.competitorIgnored || 'ignored'})
                                      </button>
                                    </>
                                  )}
                                  {potentialCount > 0 && (
                                    <>
                                      {' '}
                                      <button
                                        type="button"
                                        onClick={() => setShowPotentialByApp((prev) => ({ ...prev, [appKey]: !showPotential }))}
                                        className="text-xs font-semibold text-amber-600 dark:text-amber-300 hover:underline"
                                      >
                                        ({potentialCount} {t.competitorPotential || 'potential'})
                                      </button>
                                    </>
                                  )}
                                  {bannedCount > 0 && (
                                    <>
                                      {' '}
                                      <button
                                        type="button"
                                        onClick={() => setShowBannedByApp((prev) => ({ ...prev, [appKey]: !showBanned }))}
                                        className="text-xs font-semibold text-rose-600 dark:text-rose-300 hover:underline"
                                      >
                                        ({bannedCount} {t.competitorBanned || 'banned'})
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                  {visibleCompetitors.map((item) => renderCompetitorRow(item))}
                                </div>
                              )}

                              {visibleCompetitors.length > 0 && (ignoredCount > 0 || potentialCount > 0 || bannedCount > 0) && (
                                <div className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                  {ignoredCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setShowIgnoredByApp((prev) => ({ ...prev, [appKey]: !showIgnored }))}
                                      className="font-semibold text-indigo-600 dark:text-indigo-300 hover:underline"
                                    >
                                      {t.competitorIgnored || 'Ignored'} ({ignoredCount})
                                    </button>
                                  )}
                                  {potentialCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setShowPotentialByApp((prev) => ({ ...prev, [appKey]: !showPotential }))}
                                      className="font-semibold text-amber-600 dark:text-amber-300 hover:underline"
                                    >
                                      {t.competitorPotential || 'Potential'} ({potentialCount})
                                    </button>
                                  )}
                                  {bannedCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setShowBannedByApp((prev) => ({ ...prev, [appKey]: !showBanned }))}
                                      className="font-semibold text-rose-600 dark:text-rose-300 hover:underline"
                                    >
                                      {t.competitorBanned || 'Banned'} ({bannedCount})
                                    </button>
                                  )}
                                </div>
                              )}

                              {ignoredCount > 0 && showIgnored && (
                                <div className="border-t border-slate-200 dark:border-slate-800">
                                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {ignoredCompetitors.map((item) => renderCompetitorRow(item))}
                                  </div>
                                </div>
                              )}

                              {potentialCount > 0 && showPotential && (
                                <div className="border-t border-slate-200 dark:border-slate-800">
                                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {potentialCompetitors.map((item) => renderCompetitorRow(item))}
                                  </div>
                                </div>
                              )}

                              {bannedCount > 0 && showBanned && (
                                <div className="border-t border-slate-200 dark:border-slate-800">
                                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {bannedCompetitors.map((item) => renderCompetitorRow(item))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
