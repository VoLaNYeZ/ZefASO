import { addDays, diffDays, formatDate, parseDate } from './date';
import { normalizeAppCategoryMap, normalizeAppKey, normalizeAppKeyList } from './normalize';
import { DEFAULT_WARNING_RULE_SETTINGS } from './defaults';
import type { Severity, WarningItem, WarningRuleId, WarningRuleSetting, WarningsSettings } from './types';

export type AsoRow = {
  date: string; // YYYY-MM-DD
  appName: string;
  appGroup?: string;
  geo: string;
  keyword: string;
  ranking: number;
  installs: number;
  cpi: number;
};

export type ComputeInput = {
  rows: AsoRow[];
  settings: WarningsSettings;
  categories: string[];
  appCategoryMap: Record<string, string>;
  hiddenApps: string[];
  today: string; // local YYYY-MM-DD from client
  lang?: 'en' | 'ru';
};

export type ComputeOutput = {
  allWarnings: WarningItem[];
  byFolder: Record<string, Record<string, WarningItem[]>>; // folder -> appKey -> list
  counts: {
    total: number;
    bySeverity: Record<Severity, number>;
    byFolder: Record<string, number>;
    byApp: Record<string, number>;
  };
};

type Series = {
  appKey: string;
  geo: string;
  keyword: string;
  dates: string[];
  byDate: Record<string, AsoRow>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

const clampNonNegativeInt = (value: unknown, fallback: number): number => {
  if (!isFiniteNumber(value)) return fallback;
  return Math.max(0, Math.trunc(value));
};

const isRankValid = (r: unknown): r is number => isFiniteNumber(r) && r > 0;

const isValidDateString = (dateStr: string): boolean => {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  const d = parseDate(dateStr);
  return !Number.isNaN(d.getTime()) && formatDate(d) === dateStr;
};

const getAppKey = (row: AsoRow): string | null => {
  const raw = (row.appGroup || row.appName) ?? '';
  const trimmed = normalizeAppKey(raw);
  return trimmed ? trimmed : null;
};

const folderOf = (appKey: string, appCategoryMap: Record<string, string>): string => {
  const mapped = appCategoryMap?.[appKey];
  if (typeof mapped === 'string' && mapped.trim()) return mapped.trim();
  return 'Uncategorized';
};

const isFolderMonitored = (settings: WarningsSettings, folder: string): boolean => {
  const value = settings?.folders?.[folder]?.monitorEnabled;
  if (typeof value === 'boolean') return value;
  if (settings?.initialized === false) return false;
  return true;
};

const getRuleSetting = (settings: WarningsSettings, appKey: string, ruleId: WarningRuleId): WarningRuleSetting => {
  const defaults = DEFAULT_WARNING_RULE_SETTINGS[ruleId];
  const saved = settings?.apps?.[appKey]?.rules?.[ruleId];

  const enabled = typeof saved?.enabled === 'boolean' ? saved.enabled : defaults.enabled;
  const mergedParams: Record<string, number> = {
    ...(defaults.params || {}),
    ...(saved?.params || {}),
  };

  const hasParams = Object.keys(mergedParams).length > 0;
  return hasParams ? { enabled, params: mergedParams } : { enabled };
};

const isIgnored = (settings: WarningsSettings, id: string, today: string): boolean => {
  const until = settings?.ignored?.[id]?.until;
  if (typeof until !== 'string' || !until) return false;
  if (!isValidDateString(until) || !isValidDateString(today)) return false;
  return until >= today;
};

const getEntry = (seriesMap: Record<string, AsoRow>, dateStr: string): AsoRow | null => {
  const entry = seriesMap[dateStr];
  return entry || null;
};

const getLatestDate = (series: Series): string => {
  if (series.dates.length === 0) return '';
  return series.dates[series.dates.length - 1];
};

const getLatestValidRankDate = (series: Series): string | null => {
  for (let i = series.dates.length - 1; i >= 0; i--) {
    const date = series.dates[i];
    const entry = series.byDate[date];
    if (entry && isRankValid(entry.ranking)) return date;
  }
  return null;
};

const getNearestEarlierValidRank = (
  series: Series,
  targetDate: string,
  toleranceDays: number,
): { date: string; rank: number } | null => {
  if (!isValidDateString(targetDate)) return null;
  const tolerance = clampNonNegativeInt(toleranceDays, 0);
  let idx = series.dates.length - 1;
  while (idx >= 0 && series.dates[idx] > targetDate) idx--;

  for (let i = idx; i >= 0; i--) {
    const date = series.dates[i];
    const delta = diffDays(targetDate, date);
    if (delta < 0) continue;
    if (delta > tolerance) break;
    const entry = series.byDate[date];
    if (entry && isRankValid(entry.ranking)) return { date, rank: entry.ranking };
  }

  return null;
};

const getWindowDates = (endDate: string, days: number): string[] => {
  const windowDays = clampNonNegativeInt(days, 0);
  if (!isValidDateString(endDate) || windowDays <= 0) return [];
  const out: string[] = [];
  const start = addDays(endDate, -(windowDays - 1));
  for (let i = 0; i < windowDays; i++) {
    out.push(addDays(start, i));
  }
  return out;
};

const getEntriesInWindow = (seriesMap: Record<string, AsoRow>, endDate: string, days: number): AsoRow[] => {
  const dates = getWindowDates(endDate, days);
  const out: AsoRow[] = [];
  for (const date of dates) {
    const entry = seriesMap[date];
    if (entry) out.push(entry);
  }
  return out;
};

const sumInstalls = (entries: AsoRow[]): number => {
  let sum = 0;
  for (const entry of entries) {
    const value = entry?.installs;
    if (isFiniteNumber(value)) sum += value;
  }
  return sum;
};

const earliestValidRankInEntries = (entries: AsoRow[]): { date: string; rank: number } | null => {
  for (const entry of entries) {
    if (!entry) continue;
    if (isValidDateString(entry.date) && isRankValid(entry.ranking)) {
      return { date: entry.date, rank: entry.ranking };
    }
  }
  return null;
};

const latestValidRankInEntries = (entries: AsoRow[]): { date: string; rank: number } | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    if (isValidDateString(entry.date) && isRankValid(entry.ranking)) {
      return { date: entry.date, rank: entry.ranking };
    }
  }
  return null;
};

const ranksFromEntries = (entries: AsoRow[]): number[] => {
  const ranks: number[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (isRankValid(entry.ranking)) ranks.push(entry.ranking);
  }
  return ranks;
};

const compareWarningItems = (a: WarningItem, b: WarningItem): number => {
  const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (s !== 0) return s;
  if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
  if (a.geo !== b.geo) return a.geo.localeCompare(b.geo);
  return a.keyword.localeCompare(b.keyword);
};

const buildMessage = (
  lang: 'en' | 'ru',
  geo: string,
  keyword: string,
  suffix: string,
): string => {
  const safeSuffix = suffix || '';
  return `${geo} - ${keyword} - ${safeSuffix}`;
};

export function computeWarnings(input: ComputeInput): ComputeOutput {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const settings = input.settings;
  const appCategoryMap = normalizeAppCategoryMap(input.appCategoryMap);
  const hiddenSet = new Set(normalizeAppKeyList(input.hiddenApps));
  const today = isValidDateString(input.today) ? input.today : formatDate(new Date());
  const lang: 'en' | 'ru' = input.lang === 'ru' ? 'ru' : 'en';

  const seriesMap = new Map<string, Series>();
  const seriesDatesSet = new Map<string, Set<string>>();
  const maxDateByApp = new Map<string, string>();

  for (const row of rows) {
    if (!row) continue;
    const appKey = getAppKey(row);
    if (!appKey || hiddenSet.has(appKey)) continue;

    const dateStr = typeof row.date === 'string' ? row.date : '';
    if (!isValidDateString(dateStr)) continue;

    const geo = typeof row.geo === 'string' ? row.geo.trim() : '';
    const keyword = typeof row.keyword === 'string' ? row.keyword.trim() : '';
    if (!geo || !keyword) continue;

    const folder = folderOf(appKey, appCategoryMap);
    if (!isFolderMonitored(settings, folder)) continue;

    const seriesKey = `${appKey}|${geo}|${keyword}`;

    let series = seriesMap.get(seriesKey);
    if (!series) {
      series = { appKey, geo, keyword, dates: [], byDate: {} };
      seriesMap.set(seriesKey, series);
      seriesDatesSet.set(seriesKey, new Set());
    }

    if (!series.byDate[dateStr]) {
      series.byDate[dateStr] = row;
      const dateSet = seriesDatesSet.get(seriesKey)!;
      if (!dateSet.has(dateStr)) {
        dateSet.add(dateStr);
        series.dates.push(dateStr);
      }
    }

    const prevMax = maxDateByApp.get(appKey);
    if (!prevMax || dateStr > prevMax) {
      maxDateByApp.set(appKey, dateStr);
    }
  }

  for (const series of seriesMap.values()) {
    series.dates.sort();
  }

  const warnings: WarningItem[] = [];

  const pushWarning = (item: WarningItem) => {
    if (!item || !item.id) return;
    if (isIgnored(settings, item.id, today)) return;
    warnings.push(item);
  };

  for (const series of seriesMap.values()) {
    const appKey = series.appKey;
    const geo = series.geo;
    const keyword = series.keyword;

    const ruleA = getRuleSetting(settings, appKey, 'ineffective_keyword_stuck');
    if (ruleA.enabled) {
      const params = ruleA.params || {};
      const stuckDays = clampNonNegativeInt(params.stuckDays, 3);
      const maxRankDeltaInPeriod = clampNonNegativeInt(params.maxRankDeltaInPeriod, 1);
      const minInstallsInPeriod = clampNonNegativeInt(params.minInstallsInPeriod, 1);

      const endDate = getLatestDate(series);
      const entryEnd = getEntry(series.byDate, endDate);
      const rankToday = entryEnd?.ranking;

      if (endDate && entryEnd && isRankValid(rankToday) && rankToday !== 1 && stuckDays > 0) {
        const windowEntries = getEntriesInWindow(series.byDate, endDate, stuckDays);
        const installsSum = sumInstalls(windowEntries);
        const validRanks = ranksFromEntries(windowEntries);
        if (installsSum >= minInstallsInPeriod && validRanks.length >= 2) {
          const maxRank = Math.max(...validRanks);
          const minRank = Math.min(...validRanks);
          const rankRange = maxRank - minRank;
          if (rankRange <= maxRankDeltaInPeriod) {
            const suffix =
              lang === 'ru'
                ? `позиция не меняется ${stuckDays} дней`
                : `rank is stuck for ${stuckDays} days`;
            pushWarning({
              id: `ineffective_keyword_stuck|${appKey}|${geo}|${keyword}`,
              ruleId: 'ineffective_keyword_stuck',
              severity: 'critical',
              appKey,
              geo,
              keyword,
              message: buildMessage(lang, geo, keyword, suffix),
              evidence: { endDate, stuckDays, installsSum, validRanks, rankRange, rankToday },
              createdFromDate: endDate,
            });
          }
        }
      }
    }

    const ruleB = getRuleSetting(settings, appKey, 'rank_improvement_too_small');
    if (ruleB.enabled) {
      const endDate = getLatestValidRankDate(series);
      if (endDate) {
        const entryEnd = getEntry(series.byDate, endDate);
        const todayRank = entryEnd?.ranking;
        if (entryEnd && isRankValid(todayRank)) {
          const dayTolerance = 1;
          const weekTolerance = 10;
          const prevTarget = addDays(endDate, -1);
          const weekTarget = addDays(endDate, -7);
          const rankPrevObj = getNearestEarlierValidRank(series, prevTarget, dayTolerance);
          const rankWeekObj = getNearestEarlierValidRank(series, weekTarget, weekTolerance);

          if (rankPrevObj && rankWeekObj) {
            const deltaDay = todayRank - rankPrevObj.rank;
            const deltaWeek = todayRank - rankWeekObj.rank;
            const thresholds =
              todayRank > 30
                ? { dailyMinImprovement: -10, weeklyMinImprovement: -30 }
                : { dailyMinImprovement: -1, weeklyMinImprovement: -5 };

            const dailyFail = deltaDay > thresholds.dailyMinImprovement;
            const weeklyFail = deltaWeek > thresholds.weeklyMinImprovement;

            if (dailyFail && weeklyFail) {
              const suffix =
                lang === 'ru'
                  ? 'улучшение позиции слишком маленькое (день и неделя)'
                  : 'rank improvement too small (day and week)';
              pushWarning({
                id: `rank_improvement_too_small|${appKey}|${geo}|${keyword}`,
                ruleId: 'rank_improvement_too_small',
                severity: 'critical',
                appKey,
                geo,
                keyword,
                message: buildMessage(lang, geo, keyword, suffix),
                evidence: { endDate, todayRank, prev: rankPrevObj, week: rankWeekObj, deltaDay, deltaWeek, thresholds },
                createdFromDate: endDate,
              });
            }
          }
        }
      }
    }

    const ruleC = getRuleSetting(settings, appKey, 'rank1_reached_but_push_continues');
    if (ruleC.enabled) {
      const endDate = getLatestDate(series);
      const yesterdayDate = addDays(endDate, -1);
      const todayEntry = getEntry(series.byDate, endDate);
      const yEntry = getEntry(series.byDate, yesterdayDate);

      if (todayEntry && yEntry && isRankValid(todayEntry.ranking) && isRankValid(yEntry.ranking)) {
        const rankYesterday = yEntry.ranking;
        const rankToday = todayEntry.ranking;
        const installsYesterday = isFiniteNumber(yEntry.installs) ? yEntry.installs : 0;
        const installsToday = isFiniteNumber(todayEntry.installs) ? todayEntry.installs : 0;

        if (rankYesterday === 1 && installsToday > 0 && installsToday >= installsYesterday) {
          const suffix =
            lang === 'ru'
              ? 'вчера была позиция 1, но установки продолжают расти'
              : 'rank 1 reached yesterday but installs still growing';
          pushWarning({
            id: `rank1_reached_but_push_continues|${appKey}|${geo}|${keyword}`,
            ruleId: 'rank1_reached_but_push_continues',
            severity: 'warning',
            appKey,
            geo,
            keyword,
            message: buildMessage(lang, geo, keyword, suffix),
            evidence: { endDate, yesterdayDate, rankYesterday, rankToday, installsYesterday, installsToday },
            createdFromDate: endDate,
          });
        }
      }
    }

    const ruleD = getRuleSetting(settings, appKey, 'rank1_lost');
    if (ruleD.enabled) {
      const endDate = getLatestDate(series);
      const yesterdayDate = addDays(endDate, -1);
      const todayEntry = getEntry(series.byDate, endDate);
      const yEntry = getEntry(series.byDate, yesterdayDate);

      if (todayEntry && yEntry && isRankValid(todayEntry.ranking) && isRankValid(yEntry.ranking)) {
        const rankYesterday = yEntry.ranking;
        const rankToday = todayEntry.ranking;
        if (rankYesterday === 1 && rankToday > 1) {
          const suffix =
            lang === 'ru'
              ? 'потеряна позиция 1 (вчера была 1)'
              : 'rank 1 lost (was 1 yesterday)';
          pushWarning({
            id: `rank1_lost|${appKey}|${geo}|${keyword}`,
            ruleId: 'rank1_lost',
            severity: 'critical',
            appKey,
            geo,
            keyword,
            message: buildMessage(lang, geo, keyword, suffix),
            evidence: { endDate, yesterdayDate, rankYesterday, rankToday },
            createdFromDate: endDate,
          });
        }
      }
    }

    const ruleE = getRuleSetting(settings, appKey, 'no_rank_data_during_push');
    if (ruleE.enabled) {
      const params = ruleE.params || {};
      const noDataDays = clampNonNegativeInt(params.noDataDays, 7);
      const endDate = getLatestDate(series);
      if (endDate && noDataDays > 0) {
        const windowEntries = getEntriesInWindow(series.byDate, endDate, noDataDays);
        if (windowEntries.length === noDataDays) {
          const installsSum = sumInstalls(windowEntries);
          let installsDays = 0;
          for (const entry of windowEntries) {
            const value = entry?.installs;
            if (isFiniteNumber(value) && value > 0) installsDays++;
          }
          const validRanks = ranksFromEntries(windowEntries);
          const hasInstallsEveryDay = installsDays === noDataDays;
          if (hasInstallsEveryDay && installsSum > 0 && validRanks.length === 0) {
            const suffix =
              lang === 'ru'
                ? `нет данных по позиции ${noDataDays} дней при наличии установок каждый день`
                : `no ranking data for ${noDataDays} days while installs exist every day`;
            pushWarning({
              id: `no_rank_data_during_push|${appKey}|${geo}|${keyword}`,
              ruleId: 'no_rank_data_during_push',
              severity: 'warning',
              appKey,
              geo,
              keyword,
              message: buildMessage(lang, geo, keyword, suffix),
              evidence: { endDate, noDataDays, entriesCount: windowEntries.length, installsSum, installsDays },
              createdFromDate: endDate,
            });
          }
        }
      }
    }

    const ruleF = getRuleSetting(settings, appKey, 'install_efficiency_low');
    if (ruleF.enabled) {
      const endDate = getLatestValidRankDate(series);
      if (endDate) {
        const windowEntries = getEntriesInWindow(series.byDate, endDate, 7);
        const validRanks = ranksFromEntries(windowEntries);
        if (validRanks.length >= 3) {
          const minRank = Math.min(...validRanks);
          const maxRank = Math.max(...validRanks);
          const range = maxRank - minRank;

          const rankEndObj = latestValidRankInEntries(windowEntries);
          const rankStartObj = earliestValidRankInEntries(windowEntries);
          if (rankEndObj && rankStartObj) {
            const rankEnd = rankEndObj.rank;
            const net = rankEnd - rankStartObj.rank;
            const trigger =
              rankEnd > 30 ? net >= 0 || range <= 10 : net >= 0 || range <= 3;
            if (trigger) {
              const suffix =
                lang === 'ru'
                  ? 'низкая эффективность - позиция не улучшается'
                  : 'low efficiency: rank not improving';
              pushWarning({
                id: `install_efficiency_low|${appKey}|${geo}|${keyword}`,
                ruleId: 'install_efficiency_low',
                severity: rankEnd > 30 ? 'warning' : 'critical',
                appKey,
                geo,
                keyword,
                message: buildMessage(lang, geo, keyword, suffix),
                evidence: {
                  endDate,
                  windowStart: rankStartObj.date,
                  rankStart: rankStartObj.rank,
                  rankEnd,
                  net,
                  minRank,
                  maxRank,
                  range,
                },
                createdFromDate: endDate,
              });
            }
          }
        }
      }
    }

    const ruleG = getRuleSetting(settings, appKey, 'rank_drop_spike');
    if (ruleG.enabled) {
      const params = ruleG.params || {};
      const warnDelta = clampNonNegativeInt(params.warnDelta, 10);
      const criticalDelta = clampNonNegativeInt(params.criticalDelta, 20);
      const endDate = getLatestValidRankDate(series);
      if (endDate) {
        const prevDate = addDays(endDate, -1);
        const endEntry = getEntry(series.byDate, endDate);
        const prevEntry = getEntry(series.byDate, prevDate);
        if (endEntry && prevEntry && isRankValid(endEntry.ranking) && isRankValid(prevEntry.ranking)) {
          const rankPrev = prevEntry.ranking;
          const rankEnd = endEntry.ranking;
          const deltaDay = rankEnd - rankPrev;
          const severity: Severity | null =
            deltaDay >= criticalDelta ? 'critical' : deltaDay >= warnDelta ? 'warning' : null;

          if (severity) {
            const suffix =
              lang === 'ru'
                ? 'позиция резко ухудшилась со вчера'
                : 'rank dropped sharply since yesterday';
            pushWarning({
              id: `rank_drop_spike|${appKey}|${geo}|${keyword}`,
              ruleId: 'rank_drop_spike',
              severity,
              appKey,
              geo,
              keyword,
              message: buildMessage(lang, geo, keyword, suffix),
              evidence: { endDate, prevDate, rankPrev, rankEnd, deltaDay, warnDelta, criticalDelta },
              createdFromDate: endDate,
            });
          }
        }
      }
    }
  }

  for (const [appKey, maxDate] of maxDateByApp.entries()) {
    if (hiddenSet.has(appKey)) continue;
    const folder = folderOf(appKey, appCategoryMap);
    if (!isFolderMonitored(settings, folder)) continue;

    const ruleH = getRuleSetting(settings, appKey, 'data_stale');
    if (!ruleH.enabled) continue;
    const staleDays = clampNonNegativeInt(ruleH.params?.staleDays, 2);
    if (staleDays <= 0 || !isValidDateString(maxDate) || !isValidDateString(today)) continue;

    const daysMissing = diffDays(today, maxDate);
    if (daysMissing >= staleDays) {
      const suffix =
        lang === 'ru'
          ? `Данные устарели - нет новых строк ${daysMissing} дней`
          : `Data stale - no new rows for ${daysMissing} days`;
      pushWarning({
        id: `data_stale|${appKey}|ALL|ALL`,
        ruleId: 'data_stale',
        severity: 'warning',
        appKey,
        geo: 'ALL',
        keyword: 'ALL',
        message: suffix,
        evidence: { today, maxDate, staleDays, daysMissing },
        createdFromDate: maxDate,
      });
    }
  }

  warnings.sort((a, b) => {
    const s = compareWarningItems(a, b);
    if (s !== 0) return s;
    if (a.appKey !== b.appKey) return a.appKey.localeCompare(b.appKey);
    return 0;
  });

  const byFolder: Record<string, Record<string, WarningItem[]>> = {};
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  const byFolderCounts: Record<string, number> = {};
  const byAppCounts: Record<string, number> = {};

  for (const item of warnings) {
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
    byAppCounts[item.appKey] = (byAppCounts[item.appKey] || 0) + 1;

    const folder = folderOf(item.appKey, appCategoryMap);
    byFolderCounts[folder] = (byFolderCounts[folder] || 0) + 1;

    if (!byFolder[folder]) byFolder[folder] = {};
    if (!byFolder[folder][item.appKey]) byFolder[folder][item.appKey] = [];
    byFolder[folder][item.appKey].push(item);
  }

  for (const folder of Object.keys(byFolder)) {
    for (const appKey of Object.keys(byFolder[folder])) {
      byFolder[folder][appKey].sort(compareWarningItems);
    }
  }

  const total = warnings.length;

  return {
    allWarnings: warnings,
    byFolder,
    counts: {
      total,
      bySeverity,
      byFolder: byFolderCounts,
      byApp: byAppCounts,
    },
  };
}
