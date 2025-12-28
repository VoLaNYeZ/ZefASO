import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Info, Loader2, OctagonAlert, RefreshCw, Settings } from 'lucide-react';
import type { CompetitorDetection, CompetitorTarget, FilterState } from '../../types';
import type { AsoRow, ComputeOutput } from './computeWarnings';
import { computeWarnings } from './computeWarnings';
import { addDays, formatDate } from './date';
import type { Severity, WarningItem, WarningsSettings } from './types';
import { saveWarningsSettings } from '../../lib/supabaseService';
import { WarnSettingsModal } from './WarnSettingsModal';

type Page = 'dashboard' | 'overview' | 'lab' | 'warnings';

interface WarningsPageProps {
  rows: AsoRow[];
  categories: string[];
  appCategoryMap: Record<string, string>;
  hiddenApps: string[];
  appIcons: Record<string, string>;
  getCountryFlag: (geo: string) => string;
  lang: 'en' | 'ru';
  t: any;
  warningsSettings: WarningsSettings;
  setWarningsSettings: React.Dispatch<React.SetStateAction<WarningsSettings>>;
  setCurrentPage: (page: Page) => void;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  competitorDetections: CompetitorDetection[];
  onToggleCompetitorIgnored: (id: string, ignored: boolean) => void;
  competitorTargets: CompetitorTarget[];
  onTrackCompetitors: (appKey: string, maxPairs?: number, enablePotential?: boolean) => void;
  onTrackCompetitorsFolder: (appKeys: string[], maxPairs?: number, enablePotential?: boolean, folderKey?: string) => void;
  onToggleCompetitorTracking: (appKey: string, isActive: boolean) => void;
  onToggleCompetitorTrackingFolder: (appKeys: string[], isActive: boolean) => void;
  onRefreshCompetitors: () => void;
  competitorRefreshing?: boolean;
  onDeleteCompetitors: (appKey: string) => void;
  competitorTrackingByApp?: Record<string, boolean>;
  competitorTrackingByFolder?: Record<string, boolean>;
  competitorTrackerEnabled?: boolean;
}

const stripGeoKeywordPrefix = (message: string, geo: string, keyword: string): string => {
  const prefix = `${geo} - ${keyword} - `;
  if (message.startsWith(prefix)) return message.slice(prefix.length);
  return message;
};

const folderOf = (appKey: string, appCategoryMap: Record<string, string>): string => {
  const mapped = appCategoryMap?.[appKey];
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();
  return 'Uncategorized';
};

const getMonitorEnabled = (settings: WarningsSettings, folder: string): boolean => {
  const value = settings.folders?.[folder]?.monitorEnabled;
  if (typeof value === 'boolean') return value;
  if (settings?.initialized === false) return false;
  return true;
};

const safeInt = (value: unknown): number => (Number.isFinite(value as any) ? Math.max(0, Math.trunc(value as any)) : 0);

const labelForAll = (lang: 'en' | 'ru'): string => (lang === 'ru' ? 'ВСЕ' : 'ALL');

export const WarningsPage: React.FC<WarningsPageProps> = ({
  rows,
  categories,
  appCategoryMap,
  hiddenApps,
  appIcons,
  getCountryFlag,
  lang,
  t,
  warningsSettings,
  setWarningsSettings,
  setCurrentPage,
  setFilters,
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
  competitorTrackerEnabled,
}) => {
  const today = formatDate(new Date());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingFolders, setSavingFolders] = useState<Record<string, boolean>>({});
  const mountedRef = useRef(true);

  const computed = useMemo<ComputeOutput>(() => {
    return computeWarnings({
      rows,
      settings: warningsSettings,
      categories,
      appCategoryMap,
      hiddenApps,
      today,
      lang,
    });
  }, [rows, warningsSettings, categories, appCategoryMap, hiddenApps, today, lang]);

  const pluralWarnings = (count: number): string => {
    const n = Math.abs(count);
    if (lang !== 'ru') return n === 1 ? 'warning' : 'warnings';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'предупреждение';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'предупреждения';
    return 'предупреждений';
  };

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
    Object.keys(warningsSettings.folders || {}).forEach((f) => {
      if (!f || f === 'Uncategorized' || baseSet.has(f)) return;
      extra.add(f);
    });
    Object.values(appCategoryMap || {}).forEach((f) => {
      if (typeof f !== 'string') return;
      const trimmed = f.trim();
      if (!trimmed || trimmed === 'Uncategorized' || baseSet.has(trimmed)) return;
      extra.add(trimmed);
    });

    const extraList = Array.from(extra).sort((a, b) => a.localeCompare(b));
    return [...base, ...extraList, 'Uncategorized'];
  }, [categories, warningsSettings.folders, appCategoryMap]);

  const appsByFolder = useMemo(() => {
    const hiddenSet = new Set(Array.isArray(hiddenApps) ? hiddenApps : []);
    const folderToApps: Record<string, Set<string>> = {};
    folderOrder.forEach((f) => (folderToApps[f] = new Set()));

    for (const row of rows) {
      const appKey = (row?.appGroup || row?.appName || '').trim();
      if (!appKey || hiddenSet.has(appKey)) continue;
      const folder = folderOf(appKey, appCategoryMap);
      if (!folderToApps[folder]) folderToApps[folder] = new Set();
      folderToApps[folder].add(appKey);
    }

    const out: Record<string, string[]> = {};
    Object.keys(folderToApps).forEach((folder) => {
      out[folder] = Array.from(folderToApps[folder]).sort((a, b) => a.localeCompare(b));
    });
    return out;
  }, [rows, hiddenApps, appCategoryMap, folderOrder]);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});
  const [settingsAppKey, setSettingsAppKey] = useState<string | null>(null);
  const [showCompetitors, setShowCompetitors] = useState(true);
  const [trackerExpandedFolders, setTrackerExpandedFolders] = useState<Record<string, boolean>>({});
  const [trackerExpandedApps, setTrackerExpandedApps] = useState<Record<string, boolean>>({});
  const [trackPopoverKey, setTrackPopoverKey] = useState<string | null>(null);
  const [trackMode, setTrackMode] = useState<'all' | 'top5'>('all');
  const [trackSymbols, setTrackSymbols] = useState(false);
  const trackPopoverRef = useRef<HTMLDivElement | null>(null);
  const [showIgnoredByApp, setShowIgnoredByApp] = useState<Record<string, boolean>>({});
  const [showPotentialByApp, setShowPotentialByApp] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = { ...prev };
      folderOrder.forEach((folder) => {
        if (typeof next[folder] !== 'boolean') {
          next[folder] = getMonitorEnabled(warningsSettings, folder);
        }
      });
      return next;
    });
  }, [folderOrder, warningsSettings]);

  useEffect(() => {
    setExpandedApps((prev) => {
      const next = { ...prev };
      folderOrder.forEach((folder) => {
        const apps = appsByFolder[folder] || [];
        apps.forEach((appKey) => {
          if (typeof next[appKey] === 'boolean') return;
          const w = computed.byFolder?.[folder]?.[appKey] || [];
          next[appKey] = w.length > 0;
        });
      });
      return next;
    });
  }, [folderOrder, appsByFolder, computed.byFolder]);

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

  const saveTimeoutByFolderRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const saveHardTimeoutByFolderRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const saveOpIdByFolderRef = useRef<Record<string, number>>({});
  const saveErrorHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
      Object.values(saveTimeoutByFolderRef.current).forEach((t) => t && clearTimeout(t));
      Object.values(saveHardTimeoutByFolderRef.current).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  const clearFolderSaving = (folder: string) => {
    setSavingFolders((prev) => {
      if (!prev?.[folder]) return prev;
      const next = { ...prev };
      delete next[folder];
      return next;
    });
  };

  const scheduleSave = (next: WarningsSettings, folderKey: string) => {
    if (!folderKey) return;

    const prevTimeout = saveTimeoutByFolderRef.current[folderKey];
    if (prevTimeout) clearTimeout(prevTimeout);

    const prevHardTimeout = saveHardTimeoutByFolderRef.current[folderKey];
    if (prevHardTimeout) clearTimeout(prevHardTimeout);

    const opId = (saveOpIdByFolderRef.current[folderKey] || 0) + 1;
    saveOpIdByFolderRef.current[folderKey] = opId;

    saveHardTimeoutByFolderRef.current[folderKey] = setTimeout(() => {
      if (!mountedRef.current) return;
      if ((saveOpIdByFolderRef.current[folderKey] || 0) !== opId) return;
      clearFolderSaving(folderKey);
      const msg = lang === 'ru' ? 'Сохранение занимает слишком долго' : 'Saving is taking too long';
      setSaveError(msg);
      if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
      saveErrorHideTimeoutRef.current = setTimeout(() => setSaveError(null), 6000);
    }, 12000);

    saveTimeoutByFolderRef.current[folderKey] = setTimeout(() => {
      saveWarningsSettings(next)
        .then(() => {
          if (!mountedRef.current) return;
          if ((saveOpIdByFolderRef.current[folderKey] || 0) !== opId) return;
          const hard = saveHardTimeoutByFolderRef.current[folderKey];
          if (hard) clearTimeout(hard);
          clearFolderSaving(folderKey);
          setSaveError(null);
        })
        .catch((err) => {
          console.warn('Failed to save warnings settings:', err);
          if (!mountedRef.current) return;
          if ((saveOpIdByFolderRef.current[folderKey] || 0) !== opId) return;
          const hard = saveHardTimeoutByFolderRef.current[folderKey];
          if (hard) clearTimeout(hard);
          clearFolderSaving(folderKey);
          const msg = lang === 'ru' ? 'Не удалось сохранить настройки' : 'Failed to save settings';
          setSaveError(msg);
          if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
          saveErrorHideTimeoutRef.current = setTimeout(() => setSaveError(null), 6000);
        });
    }, 650);
  };

  const toggleFolderMonitor = (folder: string, enabled: boolean) => {
    setSavingFolders((prev) => ({ ...prev, [folder]: true }));
    const next: WarningsSettings = {
      ...warningsSettings,
      initialized: true,
      folders: {
        ...(warningsSettings.folders || {}),
        [folder]: { monitorEnabled: enabled },
      },
    };
    setWarningsSettings(next);
    scheduleSave(next, folder);
    if (!enabled) setExpandedFolders((prev) => ({ ...prev, [folder]: false }));
  };

  const onClickWarning = (warning: WarningItem) => {
    setCurrentPage('dashboard');
    setFilters((prev) => ({
      ...prev,
      appName: warning.appKey,
      appId: 'All',
      geo: warning.geo === 'ALL' ? 'All' : warning.geo,
      keyword: warning.keyword === 'ALL' ? 'All' : warning.keyword,
      startDate: addDays(today, -6),
      endDate: today,
    }));
  };

  const getAppWarningCounts = (folder: string, appKey: string) => {
    const w = computed.byFolder?.[folder]?.[appKey] || [];
    const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
    w.forEach((item) => {
      counts[item.severity] = (counts[item.severity] || 0) + 1;
    });
    return { warnings: w, counts, total: w.length };
  };

  const appSortKey = (folder: string, appKey: string) => {
    const { counts, total } = getAppWarningCounts(folder, appKey);
    const severityRank =
      counts.critical > 0 ? 0 : counts.warning > 0 ? 1 : counts.info > 0 ? 2 : 3;
    return { severityRank, total };
  };

  const sortedAppsInFolder = (folder: string): string[] => {
    const apps = appsByFolder[folder] || [];
    return [...apps].sort((a, b) => {
      const ka = appSortKey(folder, a);
      const kb = appSortKey(folder, b);
      if (ka.severityRank !== kb.severityRank) return ka.severityRank - kb.severityRank;
      if (ka.total !== kb.total) return kb.total - ka.total;
      return a.localeCompare(b);
    });
  };

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
      if (item?.isIgnored || item?.isPotential) return;
      const appKey = (item?.targetAppName || '').trim();
      if (!appKey) return;
      byApp[appKey] = (byApp[appKey] || 0) + 1;
      const folder = folderOf(appKey, appCategoryMap);
      byFolder[folder] = (byFolder[folder] || 0) + 1;
      total += 1;
    });
    return { byApp, byFolder, total };
  }, [competitorDetections, appCategoryMap]);

  const competitorCount = competitorCounts.total;
  const trackingByApp = competitorTrackingByApp || {};
  const trackingByFolder = competitorTrackingByFolder || {};
  const trackingLabel = t.competitorTrackingNow || (lang === 'ru' ? 'Трекинг...' : 'Tracking...');
  const showCompetitorTracker = typeof competitorTrackerEnabled === 'boolean' ? competitorTrackerEnabled : true;

  const competitorPairCountsByApp = useMemo(() => {
    const startDate = addDays(today, -29);
    const map: Record<string, Set<string>> = {};
    rows.forEach((row) => {
      const appKey = (row?.appGroup || row?.appName || '').trim();
      if (!appKey) return;
      if (!row.date || row.date < startDate || row.date > today) return;
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

  const openTrackPopover = (key: string, symbolsDefault = false) => {
    setTrackMode('all');
    setTrackSymbols(symbolsDefault);
    setTrackPopoverKey((prev) => (prev === key ? null : key));
  };

  const confirmTrackApp = (appKey: string) => {
    if (trackingByApp[appKey] || competitorRefreshing) return;
    onTrackCompetitors(appKey, trackMode === 'top5' ? 5 : undefined, trackSymbols);
    setTrackPopoverKey(null);
  };

  const confirmTrackFolder = (folder: string, appKeys: string[]) => {
    if (trackingByFolder[folder] || competitorRefreshing) return;
    onTrackCompetitorsFolder(appKeys, trackMode === 'top5' ? 5 : undefined, trackSymbols, folder);
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 truncate">{t.warnings || 'Warnings'}</h1>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-500/30">
              (beta)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200">
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
              {safeInt(computed.counts.total)} {pluralWarnings(safeInt(computed.counts.total))}
            </span>
          </div>
          <button
            onClick={() => setCurrentPage('dashboard')}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">{t.warningsBack || t.back || 'Back'}</span>
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-4 rounded-xl border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          {saveError}
        </div>
      )}

      <div className="space-y-4">
        {folderOrder.map((folder) => {
          const monitorEnabled = getMonitorEnabled(warningsSettings, folder);
          const expanded = expandedFolders[folder] ?? monitorEnabled;
          const folderCount = safeInt(computed.counts.byFolder?.[folder] || 0);
          const apps = sortedAppsInFolder(folder);

          return (
            <div key={folder} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setExpandedFolders((prev) => ({ ...prev, [folder]: !expanded }))}
                    className="flex items-center gap-2 min-w-0 text-left"
                  title={expanded ? (lang === 'ru' ? 'Свернуть' : 'Collapse') : (lang === 'ru' ? 'Развернуть' : 'Expand')}
                >
                  {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{folder}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{folderCount} {pluralWarnings(folderCount)}</div>
                    </div>
                  </button>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 shrink-0">
                  <input
                    type="checkbox"
                    checked={monitorEnabled}
                    disabled={!!savingFolders[folder]}
                    onChange={(e) => toggleFolderMonitor(folder, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 accent-indigo-600 dark:accent-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <span className="hidden sm:inline">{t.warningsMonitorFolder || 'Monitor folder'}</span>
                    <span className="sm:hidden text-[11px] font-semibold">
                      {lang === 'ru' ? 'Монитор' : 'Monitor'}
                    </span>
                    {savingFolders[folder] && (
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 text-slate-500 dark:text-slate-300"
                        title={lang === 'ru' ? 'Сохраняем' : 'Saving'}
                      >
                        <Loader2 size={14} className="animate-spin" />
                      </span>
                    )}
                  </label>
                </div>

                {expanded && (
                  <div className="p-4 space-y-2">
                  {apps.length === 0 ? (
                    <div className="text-sm text-slate-500 dark:text-slate-400">{t.warningsNoAppsInFolder || 'No apps in this folder.'}</div>
                  ) : (
                    apps.map((appKey) => {
                      const { warnings, counts, total } = getAppWarningCounts(folder, appKey);
                      const isExpanded = expandedApps[appKey] ?? (total > 0);
                      const icon = appIcons?.[appKey];

                      return (
                        <div key={appKey} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <div className="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-3 bg-slate-50 dark:bg-slate-950/40">
                            <button
                              onClick={() => setExpandedApps((prev) => ({ ...prev, [appKey]: !isExpanded }))}
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
                                  {!monitorEnabled
                                    ? (t.warningsMonitoringOff || 'Monitoring off')
                                    : total === 0
                                      ? (t.warningsNoWarnings || 'No warnings')
                                      : `${total} ${pluralWarnings(total)}`}
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center justify-end gap-1.5 min-w-[72px] w-auto sm:w-[168px]">
                                {!monitorEnabled ? (
                                  <span
                                    className="px-2 py-1 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 text-[11px] font-bold"
                                    title={t.warningsMonitoringOff || 'Monitoring off'}
                                  >
                                    {t.warningsOff || 'Off'}
                                  </span>
                                ) : total === 0 ? (
                                  <span
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shadow-[0_6px_16px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/30"
                                    title={t.warningsNoWarnings || 'No warnings'}
                                  >
                                    <Check size={18} className="text-white drop-shadow" />
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className="sm:hidden inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/5 dark:bg-white/5 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 text-[11px] font-bold tabular-nums"
                                      title={`critical ${counts.critical}, warning ${counts.warning}, info ${counts.info}`}
                                    >
                                      {counts.critical > 0 ? (
                                        <OctagonAlert size={18} className="text-rose-600 dark:text-rose-300" />
                                      ) : counts.warning > 0 ? (
                                        <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300" />
                                      ) : (
                                        <Info size={18} className="text-sky-600 dark:text-sky-300" />
                                      )}
                                      {total}
                                    </span>

                                    <span className="hidden sm:flex items-center gap-1.5">
                                      {counts.critical > 0 && (
                                        <span
                                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-500/10 text-rose-700 dark:text-rose-200 border border-rose-500/30 text-[11px] font-bold tabular-nums"
                                          title={lang === 'ru' ? 'Критично' : 'Critical'}
                                        >
                                          <OctagonAlert size={18} />
                                          {counts.critical}
                                        </span>
                                      )}
                                      {counts.warning > 0 && (
                                        <span
                                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-200 border border-amber-500/30 text-[11px] font-bold tabular-nums"
                                          title={t.warnings || 'Warnings'}
                                        >
                                          <AlertTriangle size={18} />
                                          {counts.warning}
                                        </span>
                                      )}
                                      {counts.info > 0 && (
                                        <span
                                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-200 border border-sky-500/30 text-[11px] font-bold tabular-nums"
                                          title={lang === 'ru' ? 'Инфо' : 'Info'}
                                        >
                                          <Info size={18} />
                                          {counts.info}
                                        </span>
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                              <button
                                onClick={() => setSettingsAppKey(appKey)}
                                className="p-1.5 sm:p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 transition-colors"
                                title={t.settings || 'Settings'}
                              >
                                <Settings size={18} />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-200 dark:border-slate-800">
                              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                {warnings.length === 0 ? (
                                  <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                    {t.warningsNoWarnings || 'No warnings'}
                                  </div>
                                ) : (
                                  warnings.map((w) => {
                                    const suffix = stripGeoKeywordPrefix(w.message, w.geo, w.keyword);
                                    const messageText = suffix || w.message;
                                    const showGeoAll = w.geo === 'ALL';
                                    const showKeywordAll = w.keyword === 'ALL';
                                    const flagSrc = showGeoAll ? '' : getCountryFlag(w.geo);
                                    return (
                                      <button
                                        key={w.id}
                                        onClick={() => onClickWarning(w)}
                                        className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                        title={`${w.ruleId} - ${w.createdFromDate}`}
                                      >
                                        <div className="flex items-start gap-2 min-w-0">
                                          <div className="flex items-center gap-2 shrink-0">
                                            <span className="w-5 h-5 flex items-center justify-center">
                                              {w.severity === 'critical' ? (
                                                <OctagonAlert size={18} className="text-rose-600 dark:text-rose-300" />
                                              ) : w.severity === 'warning' ? (
                                                <AlertTriangle size={18} className="text-amber-600 dark:text-amber-300" />
                                              ) : (
                                                <Info size={18} className="text-sky-600 dark:text-sky-300" />
                                              )}
                                            </span>

                                            {showGeoAll ? (
                                              <span className="px-2 py-1 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                                {labelForAll(lang)}
                                              </span>
                                            ) : (
                                              <span className="w-6 h-5 flex items-center justify-center">
                                                <img
                                                  src={flagSrc}
                                                  alt={w.geo}
                                                  className="w-5 h-3.5 object-contain shadow-sm rounded-[2px]"
                                                />
                                              </span>
                                            )}

                                            <span
                                              className={
                                                'inline-flex items-center flex-none max-w-[140px] sm:max-w-[200px] px-2 py-1 rounded-md text-[11px] font-bold border truncate ' +
                                                (showKeywordAll
                                                  ? 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700')
                                              }
                                            >
                                              {showKeywordAll ? labelForAll(lang) : w.keyword}
                                            </span>
                                          </div>

                                          <div className="min-w-0 flex-1">
                                            <div
                                              className="text-sm text-slate-900 dark:text-slate-100 leading-snug overflow-hidden"
                                              style={{
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                              }}
                                              title={messageText}
                                            >
                                              {messageText}
                                            </div>
                                            <div className="sm:hidden mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                                              {w.createdFromDate}
                                            </div>
                                          </div>

                                          <div className="hidden sm:block shrink-0 w-[96px] text-right text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                                            {w.createdFromDate}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>

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

      {showCompetitorTracker && (
        <>
          <div className="mt-6 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
            <button
              onClick={() => setShowCompetitors((prev) => !prev)}
              className={`inline-flex items-center justify-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                showCompetitors
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={t.competitorTracker || 'Competitors'}
            >
              {t.competitorTracker || 'Competitors'}
              {competitorCount > 0 && (
                <span className="ml-1 text-[10px] font-bold">{competitorCount}</span>
              )}
            </button>
          </div>

          {showCompetitors && (
            <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.competitorTracker || 'Competitor tracker'}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {competitorCount} {pluralCompetitors(competitorCount)}
              </div>
              <button
                onClick={onRefreshCompetitors}
                disabled={competitorRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title={t.competitorRefreshNow || 'Refresh now'}
              >
                {competitorRefreshing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                <span className="hidden sm:inline">
                  {competitorRefreshing ? trackingLabel : (t.competitorRefreshNow || 'Refresh now')}
                </span>
              </button>
            </div>
          </div>

          {folderOrder.map((folder) => {
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
                        onClick={() => openTrackPopover(folderTrackKey, folderSymbolsDefault)}
                        disabled={folderIsTracking}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {folderIsTracking && <Loader2 size={12} className="animate-spin" />}
                          <span>{folderIsTracking ? trackingLabel : (t.competitorTrackFolder || 'Track folder')}</span>
                        </span>
                      </button>

                      {trackPopoverKey === folderTrackKey && (
                        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 z-50">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-2">
                            {t.competitorTrackMode || 'Track mode'}
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <input
                              type="radio"
                              name={`track-folder-mode-${folder}`}
                              checked={trackMode === 'all'}
                              onChange={() => setTrackMode('all')}
                              className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                            />
                            <span>{t.competitorTrackAll || 'All'} ({folderPairCount})</span>
                          </label>
                          {folderHasTop5 && (
                            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                              <input
                                type="radio"
                                name={`track-folder-mode-${folder}`}
                                checked={trackMode === 'top5'}
                                onChange={() => setTrackMode('top5')}
                                className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                              />
                              <span>{t.competitorTrackTop5 || 'Top 5'}</span>
                            </label>
                          )}
                          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={trackSymbols}
                              onChange={(e) => setTrackSymbols(e.target.checked)}
                              className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                            />
                            <span>{t.competitorTrackSymbols || 'Symbol hunt'}</span>
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
                        const potentialCompetitors = competitors.filter((item) => item.isPotential);
                        const ignoredCompetitors = competitors.filter((item) => !item.isPotential && item.isIgnored);
                        const visibleCompetitors = competitors.filter((item) => !item.isPotential && !item.isIgnored);
                        const ignoredCount = ignoredCompetitors.length;
                        const potentialCount = potentialCompetitors.length;
                        const showIgnored = !!showIgnoredByApp[appKey];
                        const showPotential = !!showPotentialByApp[appKey];
                        const isExpanded = trackerExpandedApps[appKey] ?? competitorTotal > 0;
                        const target = competitorTargetsByApp[appKey];
                        const isTracked = target?.isActive ?? false;
                        const canToggleTracking = !!target;
                        const icon = appIcons?.[appKey];
                        const appIsTracking = !!trackingByApp[appKey] || competitorRefreshing;
                        const appPairCount = safeInt(competitorPairCountsByApp[appKey] || 0);

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
                                  ref={trackPopoverKey === `app:${appKey}` ? trackPopoverRef : null}
                                >
                                  <button
                                    onClick={() => openTrackPopover(`app:${appKey}`, !!target?.enablePotential)}
                                    disabled={appIsTracking}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                      isTracked
                                        ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-200'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      {appIsTracking && <Loader2 size={12} className="animate-spin" />}
                                      <span>
                                        {appIsTracking
                                          ? trackingLabel
                                          : (isTracked ? (t.competitorUpdateTargets || 'Update') : (t.competitorTrack || 'Track'))}
                                      </span>
                                    </span>
                                  </button>

                                  {trackPopoverKey === `app:${appKey}` && (
                                    <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3 z-50">
                                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-2">
                                        {t.competitorTrackMode || 'Track mode'}
                                      </div>
                                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <input
                                          type="radio"
                                          name={`track-mode-${appKey}`}
                                          checked={trackMode === 'all'}
                                          onChange={() => setTrackMode('all')}
                                          className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                        />
                                        <span>{t.competitorTrackAll || 'All'} ({appPairCount})</span>
                                      </label>
                                    {appPairCount > 5 && (
                                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
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
                                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                      <input
                                        type="checkbox"
                                        checked={trackSymbols}
                                        onChange={(e) => setTrackSymbols(e.target.checked)}
                                        className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                                      />
                                      <span>{t.competitorTrackSymbols || 'Symbol hunt'}</span>
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
                                  </div>
                                ) : (
                                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {visibleCompetitors.map((item) => renderCompetitorRow(item))}
                                  </div>
                                )}

                                {visibleCompetitors.length > 0 && (ignoredCount > 0 || potentialCount > 0) && (
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
                                  </div>
                                )}

                                {visibleCompetitors.length === 0 && ignoredCount > 0 && showIgnored && (
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
          )}
        </>
      )}

      {settingsAppKey && (
        <WarnSettingsModal
          appKey={settingsAppKey}
          settings={warningsSettings}
          setSettings={setWarningsSettings}
          lang={lang}
          t={t}
          onClose={() => setSettingsAppKey(null)}
        />
      )}
    </div>
  );
};
