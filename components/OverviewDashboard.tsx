import React, { useMemo, useState, useEffect } from 'react';
import {
    DollarSign,
    Smartphone,
    TrendingUp,
    TrendingDown,
    Minus,
    Filter,
    Download,
    AlertTriangle,
    Sparkles,
    Globe,
    Type,
    LayoutTemplate,
    LayoutGrid
} from 'lucide-react';
import { AsoEntry } from '../types';
import { DateRangePicker } from './DateRangePicker';

interface OverviewDashboardProps {
    data: AsoEntry[];
    appIcons: Record<string, string>;
    categories: string[];
    appCategoryMap: Record<string, string>;
    currencySymbol?: string;
    getCountryFlag: (geo: string) => string;
    getStoreUrl: (geo: string, id: string) => string;
    theme: 'light' | 'dark';
    t: any;
}

// Unified structure for both views
interface OverviewItem {
    label: string; // The sub-item name (e.g. "US" in keyword view, or "Keyword" in geo view)
    flag?: string; // Optional flag emoji
    installs: number;
    currentRank: number;
    status: 'new' | 'lost' | 'change' | 'stable' | 'no-data';
    changeValue: number;
}

interface OverviewGroup {
    id: string;
    title: string;
    subTitle?: string;
    flag?: string; // If the group itself is a GEO
    totalInstalls: number;
    items: OverviewItem[];
}

interface ProcessedApp {
    appName: string; // Active App (tab name)
    displayName: string; // Latest Store App name for context
    totalCost: number;
    totalInstalls: number;
    groups: OverviewGroup[];
}

type OverviewMode = 'keyword' | 'geo';

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
    data,
    appIcons,
    categories,
    appCategoryMap,
    currencySymbol = '$',
    getCountryFlag,
    getStoreUrl,
    theme,
    t
}) => {
    const STORAGE_KEY = 'overview_filters_v1';

    // -- Helpers --
    const toLocalStr = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const getStoredOverviewFilters = () => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const todayStr = toLocalStr(new Date());
            if (parsed.savedAt !== todayStr) return null;
            return parsed as {
                startDate?: string | null;
                endDate?: string | null;
                selectedCategory?: string;
                selectedApp?: string;
            };
        } catch {
            return null;
        }
    };

    // -- State --
    // Default to last 30 days
    const [startDate, setStartDate] = useState<string | null>(() => {
        const stored = getStoredOverviewFilters();
        if (stored?.startDate) return stored.startDate;
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return toLocalStr(d);
    });
    const [endDate, setEndDate] = useState<string | null>(
        () => getStoredOverviewFilters()?.endDate || toLocalStr(new Date())
    );
    const [selectedCategory, setSelectedCategory] = useState<string>(() => getStoredOverviewFilters()?.selectedCategory || 'All');
    const [selectedApp, setSelectedApp] = useState<string>(() => getStoredOverviewFilters()?.selectedApp || 'All');
    const [overviewMode, setOverviewMode] = useState<OverviewMode>(() => {
        const saved = localStorage.getItem('zeyfaso_overview_mode');
        return (saved === 'keyword' || saved === 'geo') ? saved : 'keyword';
    });

    // Persist desktop overview filters for same-day revisits
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const todayStr = toLocalStr(new Date());
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                startDate,
                endDate,
                selectedCategory,
                selectedApp,
                savedAt: todayStr
            })
        );
    }, [startDate, endDate, selectedCategory, selectedApp]);

    // Save overview mode preference
    useEffect(() => {
        localStorage.setItem('zeyfaso_overview_mode', overviewMode);
    }, [overviewMode]);

    const setQuickDate = (type: 'yesterday' | 'today' | 'thisMonth' | 'lastMonth') => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (type === 'today') {
            start = now;
            end = now;
        } else if (type === 'yesterday') {
            start = new Date(now);
            start.setDate(now.getDate() - 1);
            end = new Date(start);
        } else if (type === 'thisMonth') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of this month
        } else {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0); // End of last month
        }

        setStartDate(toLocalStr(start));
        setEndDate(toLocalStr(end));
    };

    // Check active states
    const now = new Date();
    const todayStr = toLocalStr(now);

    const yestDate = new Date(now);
    yestDate.setDate(now.getDate() - 1);
    const yesterdayStr = toLocalStr(yestDate);

    const thisMonthStart = toLocalStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const thisMonthEnd = toLocalStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const lastMonthStart = toLocalStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = toLocalStr(new Date(now.getFullYear(), now.getMonth(), 0));

    const isToday = startDate === todayStr && endDate === todayStr;
    const isYesterday = startDate === yesterdayStr && endDate === yesterdayStr;
    const isThisMonth = startDate === thisMonthStart && endDate === thisMonthEnd;
    const isLastMonth = startDate === lastMonthStart && endDate === lastMonthEnd;

    // -- Aggregation Logic --
    const aggregatedData: ProcessedApp[] = useMemo(() => {
        // 1. Filter by Date and Category
        const effectiveStart = startDate || '0000-00-00';
        const effectiveEnd = endDate || '9999-99-99';

        const filteredRaw = data.filter(d => {
            const group = d.appGroup || d.appName;
            if (d.date < effectiveStart || d.date > effectiveEnd) return false;
            if (selectedCategory !== 'All') {
                const appCat = appCategoryMap[group] || 'Uncategorized';
                if (appCat !== selectedCategory) return false;
            }
            if (selectedApp !== 'All' && group !== selectedApp) return false;
            return true;
        });

        // 2. Group by App
        const appsMap = new Map<string, AsoEntry[]>();
        filteredRaw.forEach(d => {
            const group = d.appGroup || d.appName;
            if (!appsMap.has(group)) appsMap.set(group, []);
            appsMap.get(group)?.push(d);
        });

        // 3. Process each App
        const processed = Array.from(appsMap.entries()).map(([appName, entries]) => {
            const totalCost = entries.reduce((acc, curr) => acc + (curr.installs * curr.cpi), 0);
            const totalInstalls = entries.reduce((acc, curr) => acc + curr.installs, 0);
            const latestEntryForLabel = entries.reduce((latest, curr) => curr.date > latest.date ? curr : latest, entries[0]);

            const groups: OverviewGroup[] = [];

            if (overviewMode === 'keyword') {
                // --- GROUP BY KEYWORD ---
                const kwMap = new Map<string, AsoEntry[]>();
                entries.forEach(e => {
                    if (!kwMap.has(e.keyword)) kwMap.set(e.keyword, []);
                    kwMap.get(e.keyword)?.push(e);
                });

                kwMap.forEach((kwEntries, keyword) => {
                    // Sub-group by GEO
                    const geoMap = new Map<string, AsoEntry[]>();
                    kwEntries.forEach(e => {
                        if (!geoMap.has(e.geo)) geoMap.set(e.geo, []);
                        geoMap.get(e.geo)?.push(e);
                    });

                    const items: OverviewItem[] = [];
                    let groupInstalls = 0;

                    geoMap.forEach((geoEntries, geo) => {
                        const stats = calculateStats(geoEntries);
                        if (stats) {
                            groupInstalls += stats.installs;
                            items.push({
                                label: geo,
                                flag: getCountryFlag(geo),
                                ...stats
                            });
                        }
                    });

                    // Sort Items by Installs
                    items.sort((a, b) => b.installs - a.installs);

                    if (items.length > 0) {
                        groups.push({
                            id: keyword,
                            title: keyword,
                            totalInstalls: groupInstalls,
                            items
                        });
                    }
                });

            } else {
                // --- GROUP BY GEO ---
                const geoMapMain = new Map<string, AsoEntry[]>();
                entries.forEach(e => {
                    if (!geoMapMain.has(e.geo)) geoMapMain.set(e.geo, []);
                    geoMapMain.get(e.geo)?.push(e);
                });

                geoMapMain.forEach((geoEntriesMain, geo) => {
                    // Sub-group by Keyword
                    const kwMap = new Map<string, AsoEntry[]>();
                    geoEntriesMain.forEach(e => {
                        if (!kwMap.has(e.keyword)) kwMap.set(e.keyword, []);
                        kwMap.get(e.keyword)?.push(e);
                    });

                    const items: OverviewItem[] = [];
                    let groupInstalls = 0;

                    kwMap.forEach((kwEntries, keyword) => {
                        const stats = calculateStats(kwEntries);
                        if (stats) {
                            groupInstalls += stats.installs;
                            items.push({
                                label: keyword,
                                // No flag needed for keyword label
                                ...stats
                            });
                        }
                    });

                    // Sort Items by Installs
                    items.sort((a, b) => b.installs - a.installs);

                    if (items.length > 0) {
                        groups.push({
                            id: geo,
                            title: geo,
                            flag: getCountryFlag(geo),
                            totalInstalls: groupInstalls,
                            items
                        });
                    }
                });
            }

            // Sort Groups by Total Installs
            groups.sort((a, b) => b.totalInstalls - a.totalInstalls);

            return {
                appName,
                displayName: latestEntryForLabel?.appName || appName,
                totalCost,
                totalInstalls,
                groups
            };
        });

        // Sort apps by spend (highest first)
        return processed.sort((a, b) => b.totalCost - a.totalCost);

    }, [data, startDate, endDate, selectedCategory, selectedApp, appCategoryMap, overviewMode]);


    // Helper Logic for calculating stats from a set of entries
    function calculateStats(entries: AsoEntry[]) {
        // Sort by date ascending
        const sorted = entries.sort((a, b) => a.date.localeCompare(b.date));
        const installs = sorted.reduce((acc, curr) => acc + curr.installs, 0);

        const latestEntry = sorted[sorted.length - 1];
        const currentRank = latestEntry.ranking;

        const validRanks = sorted.filter(e => e.ranking > 0);

        let status: OverviewItem['status'] = 'no-data';
        let changeValue = 0;

        if (currentRank === 0) {
            if (validRanks.length > 0) status = 'lost';
            else status = 'no-data';
        } else {
            if (validRanks.length === 1) {
                status = 'new';
            } else {
                const earliestValid = validRanks[0];
                const startRank = earliestValid.ranking;
                changeValue = currentRank - startRank;
                if (changeValue !== 0) status = 'change';
                else status = 'stable';
            }
        }

        if (installs > 0 || status !== 'no-data') {
            return { installs, currentRank, status, changeValue };
        }
        return null;
    }

    // -- Grand Totals --
    const grandTotalCost = aggregatedData.reduce((acc, curr) => acc + curr.totalCost, 0);
    const activeAppsCount = aggregatedData.length;
    const availableApps = useMemo(() => Array.from(new Set(data.map(d => d.appGroup || d.appName))).sort(), [data]);

    return (
        <div className="p-6 pb-20 pt-16 md:pt-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">

            {/* Header & Controls */}
            <div className="sticky top-4 z-30 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md rounded-xl p-4 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-end shadow-sm">
                <div className="hidden md:block">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 bg-gradient-to-br from-fuchsia-500 to-pink-500 rounded-lg">
                            <LayoutGrid size={24} className="text-white" />
                        </div>
                        <h2
                            title={t.overviewDescription}
                            className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight"
                        >
                            {t.overview}
                        </h2>
                    </div>
                    <p className="overview-desc text-slate-500 dark:text-slate-400 font-medium">{t.overviewDescription}</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm w-full xl:w-auto">
                    {/* Mobile compact layout */}
                    <div className="flex md:hidden flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="relative group">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="appearance-none w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <option value="All">All Categories</option>
                                    <option value="Uncategorized">{t.uncategorized}</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                            <div className="relative group">
                                <select
                                    value={selectedApp}
                                    onChange={(e) => setSelectedApp(e.target.value)}
                                    className="appearance-none w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                >
                                    <option value="All">All Apps</option>
                                    {availableApps.map(app => <option key={app} value={app}>{app}</option>)}
                                </select>
                                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-center w-full">
                            <div className="grid grid-cols-2 gap-1">
                                <button
                                    onClick={() => setQuickDate('lastMonth')}
                                    className={`h-4.5 flex items-center justify-center text-[10px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isLastMonth
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.lastMonth}
                                </button>
                                <button
                                    onClick={() => setQuickDate('yesterday')}
                                    className={`h-4.5 flex items-center justify-center text-[10px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isYesterday
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.yesterday || 'Yesterday'}
                                </button>
                                <button
                                    onClick={() => setQuickDate('thisMonth')}
                                    className={`h-4.5 flex items-center justify-center text-[10px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isThisMonth
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.thisMonth}
                                </button>
                                <button
                                    onClick={() => setQuickDate('today')}
                                    className={`h-4.5 flex items-center justify-center text-[10px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isToday
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.today || 'Today'}
                                </button>
                            </div>
                            <div className="min-w-0 w-full">
                                <DateRangePicker
                                    startDate={startDate}
                                    endDate={endDate}
                                    onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                                    theme={theme}
                                    t={t}
                                    variant="overview"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Desktop / tablet layout (unchanged) */}
                    <div className="hidden md:flex flex-col sm:flex-row gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative group">
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="overview-filter appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-auto"
                                >
                                    <option value="All">All Categories</option>
                                    <option value="Uncategorized">{t.uncategorized}</option>
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                            <div className="relative group">
                                <select
                                    value={selectedApp}
                                    onChange={(e) => setSelectedApp(e.target.value)}
                                    className="overview-filter appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm rounded-lg pl-9 pr-8 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors w-auto"
                                >
                                    <option value="All">All Apps</option>
                                    {availableApps.map(app => <option key={app} value={app}>{app}</option>)}
                                </select>
                                <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </div>
                        </div>

                        <div className="h-px sm:h-auto sm:w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="grid grid-cols-2 gap-0.5 h-[34px] w-auto min-w-[140px]">
                                <button
                                    onClick={() => setQuickDate('lastMonth')}
                                    className={`flex items-center justify-center text-[9px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isLastMonth
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.lastMonth}
                                </button>
                                <button
                                    onClick={() => setQuickDate('yesterday')}
                                    className={`flex items-center justify-center text-[9px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isYesterday
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.yesterday || 'Yesterday'}
                                </button>
                                <button
                                    onClick={() => setQuickDate('thisMonth')}
                                    className={`flex items-center justify-center text-[9px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isThisMonth
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.thisMonth}
                                </button>
                                <button
                                    onClick={() => setQuickDate('today')}
                                    className={`flex items-center justify-center text-[9px] font-bold rounded transition-colors border whitespace-nowrap px-2 ${isToday
                                        ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/50 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/50'
                                        }`}
                                >
                                    {t.today || 'Today'}
                                </button>
                            </div>
                            <div className="overview-date min-w-[180px] flex-shrink-0">
                                <DateRangePicker
                                    startDate={startDate}
                                    endDate={endDate}
                                    onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                                    theme={theme}
                                    t={t}
                                    variant="overview"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hero Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white shadow-2xl shadow-indigo-500/20 group hover:scale-[1.01] transition-transform duration-300">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                        <DollarSign size={180} strokeWidth={1} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 text-indigo-100 font-bold uppercase tracking-wider text-sm">
                            <DollarSign size={16} /> {t.totalSpend}
                        </div>
                        <div className="text-6xl sm:text-7xl font-black tracking-tighter">
                            {currencySymbol}{grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                        <p className="mt-4 text-indigo-100 font-medium opacity-90">
                            {t.investedAcross} {activeAppsCount} {t.appsInPeriod}
                        </p>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-xl shadow-slate-500/20 group hover:scale-[1.01] transition-transform duration-300">
                    <div className="absolute -bottom-10 -right-10 opacity-10 group-hover:opacity-20 transition-opacity rotate-12">
                        <Smartphone size={200} strokeWidth={1} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 text-slate-300 font-bold uppercase tracking-wider text-sm">
                            <Smartphone size={16} /> {t.activeApps}
                        </div>
                        <div className="text-6xl sm:text-7xl font-black tracking-tighter text-emerald-400">
                            {activeAppsCount}
                        </div>
                        <p className="mt-4 text-slate-300 font-medium opacity-90">
                            {t.trackedDataMsg} {startDate || 'Start'} - {endDate || 'Now'}.
                        </p>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-2xl shadow-purple-500/20 group hover:scale-[1.01] transition-transform duration-300">
                    <div className="absolute -top-10 -right-10 opacity-10 group-hover:opacity-20 transition-opacity">
                        <LayoutTemplate size={200} strokeWidth={1} />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2 text-purple-100 font-bold uppercase tracking-wider text-sm">
                            <LayoutTemplate size={16} /> {t.pushes || 'Active Pushes'}
                        </div>
                        <div className="text-6xl sm:text-7xl font-black tracking-tighter">
                            {(() => {
                                const uniquePushes = new Set();
                                aggregatedData.forEach(app => {
                                    app.groups.forEach(group => {
                                        if (overviewMode === 'keyword') {
                                            group.items.forEach(item => {
                                                uniquePushes.add(`${group.id}|${item.label}`);
                                            });
                                        } else {
                                            group.items.forEach(item => {
                                                uniquePushes.add(`${item.label}|${group.id}`);
                                            });
                                        }
                                    });
                                });
                                return uniquePushes.size;
                            })()}
                        </div>
                        <p className="mt-4 text-purple-100 font-medium opacity-90">
                            {(() => {
                                const uniqueKeywords = new Set();
                                const uniqueGeos = new Set();
                                aggregatedData.forEach(app => {
                                    app.groups.forEach(group => {
                                        if (overviewMode === 'keyword') {
                                            uniqueKeywords.add(group.id);
                                            group.items.forEach(item => uniqueGeos.add(item.label));
                                        } else {
                                            uniqueGeos.add(group.id);
                                            group.items.forEach(item => uniqueKeywords.add(item.label));
                                        }
                                    });
                                });
                                return `${uniqueKeywords.size} ${t.keywords || 'keywords'} • ${uniqueGeos.size} ${t.countries || 'countries'}`;
                            })()}
                        </p>
                    </div>
                </div>
            </div>

            {/* View Switch */}
            <div className="flex justify-center">
                <div className="bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm inline-flex items-center gap-1">
                    <button
                        onClick={() => setOverviewMode('keyword')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${overviewMode === 'keyword'
                            ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-md'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                    >
                        <Type size={16} /> {t.byKeyword}
                    </button>
                    <button
                        onClick={() => setOverviewMode('geo')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${overviewMode === 'geo'
                            ? 'bg-slate-900 dark:bg-slate-700 text-white shadow-md'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                    >
                        <Globe size={16} /> {t.byCountry}
                    </button>
                </div>
            </div>

            {/* App Blocks Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {aggregatedData.map((app) => (
                    <div key={app.appName} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-indigo-100 dark:hover:border-indigo-900 transition-all duration-300 flex flex-col overflow-hidden">
                        {/* App Header */}
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                {appIcons[app.appName] ? (
                                    <img
                                        src={appIcons[app.appName]}
                                        alt={app.displayName || app.appName}
                                        loading="eager"
                                        className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm object-cover bg-white"
                                    />
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 font-bold text-xl">
                                        {(app.displayName || app.appName).charAt(0)}
                                    </div>
                                )}
                                <div>
                                    <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 leading-tight">{app.appName}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                            {app.totalInstalls.toLocaleString()} {t.installs}
                                        </span>
                                        <span className="text-xs text-slate-400">•</span>
                                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                            {appCategoryMap[app.appName] || t.uncategorized}
                                        </span>
                                    </div>
                                    {/* Store Links */}
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {Array.from(new Set(data.filter(d => (d.appGroup || d.appName) === app.appName).map(d => d.geo))).sort().map(geo => {
                                            const entry = data.find(d => (d.appGroup || d.appName) === app.appName && d.geo === geo);
                                            const match = entry?.appId.match(/(\d+)/);
                                            const id = match ? match[0] : '';
                                            if (!id) return null;
                                            return (
                                                <a
                                                    key={geo}
                                                    href={getStoreUrl(geo, id)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="opacity-80 hover:opacity-100 hover:scale-110 transition-all"
                                                    title={`Open in ${geo} App Store`}
                                                >
                                                    <img
                                                        src={getCountryFlag(geo)}
                                                        alt={geo}
                                                        loading="eager"
                                                        className="w-5 h-3.5 object-contain shadow-sm rounded-[2px]"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400 uppercase">{t.cost}</p>
                                <p className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                                    {currencySymbol}{app.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-5 bg-white dark:bg-slate-900 flex-1">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                                    {t.performanceBreakdown} <span className="font-normal text-slate-300 dark:text-slate-600 normal-case">{t.sortedByInstalls}</span>
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                {app.groups.length === 0 ? (
                                    <span className="text-sm text-slate-400 italic">No data in this period</span>
                                ) : (
                                    app.groups.map(group => (
                                        <div
                                            key={group.id}
                                            className="bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 w-full hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm transition-all"
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    {group.flag && <img src={group.flag} alt="flag" loading="eager" className="w-5 h-3.5 object-contain shadow-sm" />}
                                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{group.title}</span>
                                                </div>
                                                <span className="text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                                    {group.totalInstalls} {t.installs}
                                                </span>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {group.items.map((item, idx) => (
                                                    <div
                                                        key={`${item.label}-${idx}`}
                                                        className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg pl-2 pr-1.5 py-1.5 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900 transition-colors"
                                                    >
                                                        {/* Flag if in Keyword View */}
                                                        {item.flag && <img src={item.flag} alt={item.label} loading="eager" className="w-4 h-3 object-contain shadow-sm" title={item.label} />}

                                                        {/* Label (Geo or Keyword) */}
                                                        {!item.flag && <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.label}</span>}

                                                        <div className="h-4 w-px bg-slate-100 dark:bg-slate-800 mx-0.5"></div>

                                                        {/* Installs */}
                                                        <div className="flex items-center gap-0.5 text-xs font-bold text-slate-500 dark:text-slate-400" title="Installs">
                                                            <Download size={10} className="text-slate-400" />
                                                            {item.installs}
                                                        </div>

                                                        {/* Highlighted Rank Box */}
                                                        <div className={`flex items-center justify-center px-1.5 py-0.5 rounded min-w-[2rem] text-xs font-black border ml-1 ${item.currentRank === 0
                                                            ? 'bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-700'
                                                            : item.currentRank === 1
                                                                ? 'bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                                                : item.currentRank <= 3
                                                                    ? 'bg-orange-50 dark:bg-red-900/40 text-orange-600 dark:text-red-400 border-orange-200 dark:border-red-800'
                                                                    : item.currentRank <= 10
                                                                        ? 'bg-indigo-50 dark:bg-blue-900/40 text-indigo-600 dark:text-blue-400 border-indigo-200 dark:border-blue-800'
                                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                                            }`}>
                                                            {item.currentRank > 0 ? `#${item.currentRank}` : '-'}
                                                        </div>

                                                        {/* Status Icons */}
                                                        <div className="flex items-center">
                                                            {item.status === 'lost' && (
                                                                <div title="Rank Lost">
                                                                    <AlertTriangle size={14} className="text-red-500" strokeWidth={2.5} />
                                                                </div>
                                                            )}
                                                            {item.status === 'new' && (
                                                                <div title="New Rank">
                                                                    <Sparkles size={14} className="text-indigo-500 fill-indigo-100" />
                                                                </div>
                                                            )}
                                                            {item.status === 'change' && (
                                                                <div className={`flex items-center text-xs font-bold ml-1 ${item.changeValue < 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                                    {item.changeValue < 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                                    {Math.abs(item.changeValue)}
                                                                </div>
                                                            )}
                                                            {item.status === 'stable' && item.currentRank > 0 && (
                                                                <Minus size={14} className="text-slate-300" />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        {/* Footer decoration */}
                        <div className="h-1 w-full bg-gradient-to-r  from-slate-100 via-slate-200 to-slate-100  dark:from-slate-800 dark:via-slate-700 dark:to-slate-800" />

                    </div>
                ))}

                {aggregatedData.length === 0 && (
                    <div className="col-span-full text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                        <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Filter size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200">{t.noDataFound}</h3>
                        <p className="text-slate-500 dark:text-slate-400">{t.tryAdjusting}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
