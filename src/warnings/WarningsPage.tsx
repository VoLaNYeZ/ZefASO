import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Info, Loader2, OctagonAlert, Settings } from 'lucide-react';
import type { FilterState } from '../../types';
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

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveOpIdRef = useRef(0);
  const saveErrorHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveHardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
      if (saveHardTimeoutRef.current) clearTimeout(saveHardTimeoutRef.current);
    };
  }, []);

  const scheduleSave = (next: WarningsSettings, folderKey?: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (saveHardTimeoutRef.current) clearTimeout(saveHardTimeoutRef.current);
    const opId = ++saveOpIdRef.current;

    saveHardTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (saveOpIdRef.current !== opId) return;
      setSavingFolders({});
      const msg = lang === 'ru' ? 'Сохранение занимает слишком долго' : 'Saving is taking too long';
      setSaveError(msg);
      if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
      saveErrorHideTimeoutRef.current = setTimeout(() => setSaveError(null), 6000);
    }, 12000);

    saveTimeoutRef.current = setTimeout(() => {
      saveWarningsSettings(next)
        .then(() => {
          if (!mountedRef.current) return;
          if (saveHardTimeoutRef.current) clearTimeout(saveHardTimeoutRef.current);
          if (saveOpIdRef.current === opId) setSaveError(null);
          if (saveOpIdRef.current === opId) setSavingFolders({});
          else if (folderKey) setSavingFolders((prev) => ({ ...prev, [folderKey]: false }));
        })
        .catch((err) => {
          console.warn('Failed to save warnings settings:', err);
          if (!mountedRef.current) return;
          if (saveHardTimeoutRef.current) clearTimeout(saveHardTimeoutRef.current);
          if (saveOpIdRef.current !== opId) return;
          const msg = lang === 'ru' ? 'Не удалось сохранить настройки' : 'Failed to save settings';
          setSaveError(msg);
          setSavingFolders({});
          if (saveErrorHideTimeoutRef.current) clearTimeout(saveErrorHideTimeoutRef.current);
          saveErrorHideTimeoutRef.current = setTimeout(() => setSaveError(null), 6000);
        });
    }, 650);
  };

  const toggleFolderMonitor = (folder: string, enabled: boolean) => {
    setSavingFolders((prev) => ({ ...prev, [folder]: true }));
    setWarningsSettings((prev) => {
      const next: WarningsSettings = {
        ...prev,
        initialized: true,
        folders: {
          ...(prev.folders || {}),
          [folder]: { monitorEnabled: enabled },
        },
      };
      scheduleSave(next, folder);
      return next;
    });
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
