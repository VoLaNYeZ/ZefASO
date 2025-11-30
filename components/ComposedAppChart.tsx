import React, { useMemo } from 'react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { AsoEntry, ComparisonBlock } from '../types';
import { X, Hash, Globe, Search, Download, DollarSign, Trophy, TrendingUp, ChevronDown } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';

interface ComposedAppChartProps {
    block: ComparisonBlock;
    allData: AsoEntry[];
    availableApps: string[];
    getCountryFlag: (geo: string) => string;
    onUpdate: (id: string, field: keyof ComparisonBlock, value: string | null) => void;
    onDelete: (id: string) => void;
    currencySymbol?: string;
    theme: 'light' | 'dark';
    t: any;
}

export const ComposedAppChart: React.FC<ComposedAppChartProps> = ({
    block,
    allData,
    availableApps,
    getCountryFlag,
    onUpdate,
    onDelete,
    currencySymbol = '$',
    theme,
    t
}) => {
    // Theme Colors
    const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    const gridColor = theme === 'dark' ? '#334155' : '#f1f5f9';
    const tooltipBg = theme === 'dark' ? '#1e293b' : '#ffffff';
    const tooltipBorder = theme === 'dark' ? '#334155' : '#f1f5f9';
    const tooltipText = theme === 'dark' ? '#f1f5f9' : '#1e293b';

    // 1. Get Dropdown Options based on selected App Name
    const appSpecificData = useMemo(() => {
        return allData.filter(d => d.appName === block.appName);
    }, [allData, block.appName]);

    const availableIds = useMemo(() => Array.from(new Set(appSpecificData.map(d => d.appId))), [appSpecificData]);
    const availableGeos = useMemo(() => Array.from(new Set(appSpecificData.map(d => d.geo))), [appSpecificData]);

    // Keywords depend on Geo + App
    const availableKeywords = useMemo(() => {
        return Array.from(new Set(appSpecificData
            .filter(d => block.geo === 'All' || d.geo === block.geo)
            .map(d => d.keyword)
        ));
    }, [appSpecificData, block.geo]);

    // 2. Filter Data for Chart
    const chartData = useMemo(() => {
        const start = block.startDate || '0000-00-00';
        const end = block.endDate || '9999-99-99';

        // Filter raw rows
        const filtered = appSpecificData.filter(d => {
            if (d.date < start || d.date > end) return false;
            if (block.appId !== 'All' && d.appId !== block.appId) return false;
            if (block.geo !== 'All' && d.geo !== block.geo) return false;
            if (block.keyword !== 'All' && d.keyword !== block.keyword) return false;
            return true;
        });

        // Aggregate by Date
        const aggMap = new Map<string, { date: string, installs: number, rankSum: number, rankCount: number, cost: number }>();

        filtered.forEach(d => {
            if (!aggMap.has(d.date)) {
                aggMap.set(d.date, { date: d.date, installs: 0, rankSum: 0, rankCount: 0, cost: 0 });
            }
            const entry = aggMap.get(d.date)!;
            entry.installs += d.installs;
            entry.cost += (d.installs * d.cpi);
            if (d.ranking > 0) {
                entry.rankSum += d.ranking;
                entry.rankCount += 1;
            }
        });

        return Array.from(aggMap.values())
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(item => ({
                date: item.date,
                installs: item.installs,
                cost: parseFloat(item.cost.toFixed(2)),
                // Avoid 0 rank if no data
                ranking: item.rankCount > 0 ? Math.round(item.rankSum / item.rankCount) : null
            }));

    }, [appSpecificData, block]);

    // Totals for Header
    const totalInstalls = chartData.reduce((acc, curr) => acc + curr.installs, 0);
    const totalCost = chartData.reduce((acc, curr) => acc + curr.cost, 0);

    // -- RAMP UP LOGIC --
    // Calculate Avg Daily Installs during the 7 days LEADING UP to a #1 Rank breakthrough
    const rampUpVelocity = useMemo(() => {
        if (chartData.length < 2) return 0;

        const breakthroughIndices: number[] = [];

        chartData.forEach((d, idx) => {
            if (idx === 0) return;
            const prev = chartData[idx - 1];

            // A breakthrough is when we hit #1, but weren't #1 yesterday.
            // Or if we are #1 and it's the first data point (less reliable, but counted if we treat index 0 as start)
            const isRankOne = d.ranking === 1;
            const wasNotRankOne = prev.ranking !== 1 && prev.ranking !== null;

            if (isRankOne && wasNotRankOne) {
                breakthroughIndices.push(idx);
            }
        });

        if (breakthroughIndices.length === 0) {
            // Fallback: If no "breakthrough" (maybe strictly #1 whole time, or never #1)
            // Check if just generally #1
            const anyRankOne = chartData.some(d => d.ranking === 1);
            if (!anyRankOne) return 0;

            // If it was #1 the whole time, take avg of whole period
            const rankOneDays = chartData.filter(d => d.ranking === 1);
            return Math.round(rankOneDays.reduce((a, c) => a + c.installs, 0) / rankOneDays.length);
        }

        // Calculate avg installs for the 7 days prior to each breakthrough
        let totalRampUpInstalls = 0;
        let countedBreakthroughs = 0;

        breakthroughIndices.forEach(idx => {
            // Look back up to 7 days (or start of chart)
            const startIdx = Math.max(0, idx - 7);
            const window = chartData.slice(startIdx, idx + 1); // Include the day of success

            const windowSum = window.reduce((a, c) => a + c.installs, 0);
            const windowAvg = windowSum / window.length;

            totalRampUpInstalls += windowAvg;
            countedBreakthroughs++;
        });

        return Math.round(totalRampUpInstalls / countedBreakthroughs);
    }, [chartData]);


    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-visible flex flex-col h-[480px]">
            {/* Header Container - Split into 2 Rows for better Grid/Mobile support */}
            <div className="flex flex-col border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-t-2xl z-20">

                {/* Row 1: App Context & Metrics */}
                <div className="flex items-center justify-between p-3 border-b border-slate-200/50 dark:border-slate-700/50 gap-4">
                    {/* App Selector */}
                    <select
                        value={block.appName}
                        onChange={(e) => onUpdate(block.id, 'appName', e.target.value)}
                        className="flex-1 min-w-[120px] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm truncate"
                    >
                        {availableApps.map(app => <option key={app} value={app}>{app}</option>)}
                    </select>

                    {/* Right Side: Metrics & Close */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="hidden sm:flex items-center gap-2">
                            {/* Efficiency Metric (Ramp Up) */}
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 rounded-lg" title="Avg Daily Installs during 7 days prior to reaching Rank #1">
                                <TrendingUp size={13} />
                                <span className="font-bold text-xs">{rampUpVelocity > 0 ? `${rampUpVelocity}/${t.day}` : '-'}</span>
                            </div>

                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-lg" title="Total Installs">
                                <Download size={13} />
                                <span className="font-bold text-xs">{totalInstalls.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-800 rounded-lg" title="Total Cost">
                                <DollarSign size={13} />
                                <span className="font-bold text-xs">{currencySymbol}{totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                        {/* Mobile Metrics Summary (Simple) */}
                        <div className="sm:hidden flex items-center gap-2 text-xs font-bold text-slate-600">
                            {rampUpVelocity > 0 && <span className="text-indigo-600">⚡{rampUpVelocity}</span>}
                            <span className="text-emerald-600">{totalInstalls}</span>
                        </div>

                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>

                        <button
                            onClick={() => onDelete(block.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Row 2: Granular Filters & Date */}
                <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-50/50 dark:bg-slate-800/50">
                    {/* ID */}
                    <div className="relative group min-w-[80px] flex-1">
                        <Hash size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                            value={block.appId}
                            onChange={(e) => onUpdate(block.id, 'appId', e.target.value)}
                            className="w-full appearance-none pl-7 pr-6 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-600 outline-none cursor-pointer truncate"
                        >
                            <option value="All">{t.allIds}</option>
                            {availableIds.map(id => <option key={id} value={id}>{id}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    {/* GEO */}
                    <div className="relative group min-w-[80px] flex-1">
                        <Globe size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                            value={block.geo}
                            onChange={(e) => onUpdate(block.id, 'geo', e.target.value)}
                            className="w-full appearance-none pl-7 pr-6 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-600 outline-none cursor-pointer truncate"
                        >
                            <option value="All" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">{t.allGeos}</option>
                            {availableGeos.map(geo => <option key={geo} value={geo} className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">{geo}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Keyword */}
                    <div className="relative group min-w-[100px] flex-[1.5]">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <select
                            value={block.keyword}
                            onChange={(e) => onUpdate(block.id, 'keyword', e.target.value)}
                            className="w-full appearance-none pl-7 pr-6 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-600 outline-none cursor-pointer truncate"
                        >
                            <option value="All">{t.allKeywords}</option>
                            {availableKeywords.map(kw => <option key={kw} value={kw}>{kw}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>

                    {/* Date Picker */}
                    <div className="min-w-[180px] max-w-[240px] flex-shrink-0">
                        <DateRangePicker
                            startDate={block.startDate}
                            endDate={block.endDate}
                            onChange={(s, e) => {
                                onUpdate(block.id, 'startDate', s);
                                onUpdate(block.id, 'endDate', e);
                            }}
                            theme={theme}
                            t={t}
                            variant="compact"
                        />
                    </div>
                </div>
            </div>

            {/* Chart Body */}
            <div className="flex-1 p-2 relative z-10 min-h-0">
                {chartData.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">No data matching these filters.</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke={gridColor} vertical={false} strokeDasharray="3 3" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: axisColor }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={30}
                                tickFormatter={(val) => val.slice(5)} // MM-DD
                            />
                            <YAxis
                                yAxisId="left"
                                orientation="left"
                                tick={{ fontSize: 10, fill: axisColor }}
                                axisLine={false}
                                tickLine={false}
                                label={{ value: `${t.installs} / ${t.cost}`, angle: -90, position: 'insideLeft', style: { fill: axisColor, fontSize: 10 } }}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                reversed={true} // Rank 1 is top
                                domain={[1, 'auto']}
                                allowDecimals={false}
                                tick={{ fontSize: 10, fill: axisColor }}
                                axisLine={false}
                                tickLine={false}
                                label={{ value: t.ranking, angle: 90, position: 'insideRight', style: { fill: axisColor, fontSize: 10 } }}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (!active || !payload || !payload.length) return null;

                                    // Check if any payload has rank 1
                                    const hasRank1 = payload.find(p => p.dataKey === 'ranking' && p.value === 1);

                                    return (
                                        <div className={`rounded-xl border shadow-sm backdrop-blur-md ${hasRank1
                                            ? 'bg-amber-50/90 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50'
                                            : 'bg-white/90 border-slate-200 dark:bg-slate-800/90 dark:border-slate-700'
                                            }`}>
                                            <div className={`px-3 py-2 border-b text-xs font-semibold ${hasRank1
                                                ? 'border-amber-200 text-amber-700 dark:border-amber-700/50 dark:text-amber-400'
                                                : 'border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                                                }`}>
                                                {new Date(label).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                {hasRank1 && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">★ #1 Rank</span>}
                                            </div>
                                            <div className="p-3 space-y-1">
                                                {payload.map((entry: any, index: number) => (
                                                    <div key={index} className="flex items-center gap-2 text-xs">
                                                        <div
                                                            className="w-2 h-2 rounded-full"
                                                            style={{ backgroundColor: entry.color }}
                                                        />
                                                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                                                            {entry.name}:
                                                        </span>
                                                        <span className="font-bold text-slate-700 dark:text-slate-200">
                                                            {entry.name === t.ranking ? `#${entry.value}` :
                                                                entry.name === t.cost ? `${currencySymbol}${entry.value}` :
                                                                    entry.value}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                            <Legend
                                content={({ payload }) => (
                                    <div className="flex items-center justify-center gap-6 pt-4">
                                        {/* Ranking */}
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-blue-500" />
                                            <span>{t.ranking}</span>
                                        </div>
                                        {/* Installs */}
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <div className="w-2.5 h-2.5 rounded-[1px] bg-emerald-500" />
                                            <span>{t.installs}</span>
                                        </div>
                                        {/* Cost */}
                                        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                                            <div className="w-2.5 h-0.5 bg-orange-500 rounded-full" />
                                            <span>{t.cost}</span>
                                        </div>
                                    </div>
                                )}
                            />

                            {/* Installs (Bar) - SOLID GREEN */}
                            <Bar
                                yAxisId="left"
                                dataKey="installs"
                                name={t.installs}
                                fill="#10b981"
                                stroke="#10b981"
                                strokeWidth={0}
                                radius={[4, 4, 0, 0]}
                                barSize={30}
                                fillOpacity={0.8}
                            />

                            {/* Cost (Line, Dotted) */}
                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="cost"
                                name={t.cost}
                                stroke="#f97316"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={false}
                                activeDot={{ r: 4 }}
                            />

                            {/* Rank (Line, Solid) */}
                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="ranking"
                                name={t.ranking}
                                stroke="#3b82f6"
                                strokeWidth={3}
                                connectNulls={true}
                                dot={(props: any) => {
                                    const { cx, cy, value } = props;
                                    if (value === 1) {
                                        return (
                                            <svg x={cx - 8} y={cy - 8} width={16} height={16} viewBox="0 0 16 16" className="overflow-visible">
                                                <circle cx="8" cy="8" r="8" fill="#fbbf24" fillOpacity="0.4" className="animate-pulse" />
                                                <circle cx="8" cy="8" r="4" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
                                            </svg>
                                        );
                                    }
                                    return <circle cx={cx} cy={cy} r={3} fill="#3b82f6" strokeWidth={0} />;
                                }}
                                activeDot={{ r: 5 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};