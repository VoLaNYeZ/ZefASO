import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { AsoEntry, Granularity } from '../types';

interface DashboardChartsProps {
  data: AsoEntry[];
  currencySymbol?: string;
  granularity: Granularity;
  viewMode: 'full' | 'mini';
  theme: 'light' | 'dark';
  translations?: any;
}

interface GroupedData {
  date: string;
  displayDate: string;
  installs: number;
  ranking: number | null;
  cost: number;
  count: number;
  rankSum: number;
  rankCount: number;
}

// Helper to get the Monday of the week for a given date
const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ data, currencySymbol = '$', granularity, viewMode, theme, translations }) => {

  // Theme Colors
  const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b';
  const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';
  const tooltipBg = theme === 'dark' ? '#1e293b' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? '#334155' : '#f1f5f9';
  const tooltipText = theme === 'dark' ? '#f1f5f9' : '#1e293b';

  // Aggregate data based on granularity
  const chartData = useMemo(() => {
    // First pass: Group data
    const grouped = data.reduce((acc, curr) => {
      let key = curr.date;
      let displayDate = curr.date;

      const dateObj = new Date(curr.date);

      if (granularity === 'Weekly') {
        key = getMonday(dateObj);
        displayDate = key;
      } else if (granularity === 'Monthly') {
        key = curr.date.substring(0, 7);
        displayDate = key;
      } else if (granularity === 'Yearly') {
        key = curr.date.substring(0, 4);
        displayDate = key;
      }

      if (!acc[key]) {
        acc[key] = {
          date: key,
          displayDate,
          installs: 0,
          ranking: 0,
          cost: 0,
          count: 0,
          rankSum: 0,
          rankCount: 0
        };
      }

      acc[key].installs += curr.installs;
      acc[key].cost += (curr.installs * curr.cpi);
      acc[key].count += 1;

      if (curr.ranking > 0) {
        acc[key].rankSum += curr.ranking;
        acc[key].rankCount += 1;
      }

      return acc;
    }, {} as Record<string, GroupedData>);

    // Calculate max rank for unranked placement
    let maxRank = 0;
    (Object.values(grouped) as GroupedData[]).forEach(item => {
      if (item.rankCount > 0) {
        const avg = Math.round(item.rankSum / item.rankCount);
        if (avg > maxRank) maxRank = avg;
      }
    });

    // Set unranked value to be slightly below the worst rank (or 100 if no data)
    const UNRANKED_VALUE = maxRank > 0 ? maxRank + 20 : 100;

    return (Object.values(grouped) as GroupedData[])
      .map(item => ({
        ...item,
        // If we have valid ranks, use average. If not, but we have data (unranked), use UNRANKED_VALUE
        ranking: item.rankCount > 0
          ? Math.round(item.rankSum / item.rankCount)
          : (item.count > 0 ? UNRANKED_VALUE : null),
        cost: parseFloat(item.cost.toFixed(2)),
        isUnranked: item.rankCount === 0 && item.count > 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, granularity]);

  const xAxisFormatter = (val: string) => {
    if (granularity === 'Daily' || granularity === 'Weekly') {
      const [y, m, d] = val.split('-');
      return `${d}/${m}`;
    }
    if (granularity === 'Monthly') {
      const [y, m] = val.split('-');
      const date = new Date(parseInt(y), parseInt(m) - 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return val;
  };

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400">
        No data available for the selected filters.
      </div>
    );
  }

  const totalCost = chartData.reduce((sum, item) => sum + item.cost, 0);

  // Layout Configuration
  const isMini = viewMode === 'mini';

  // Slice data for Mini View (show last 14 points to prevent overcrowding)
  const displayedData = useMemo(() => {
    if (isMini && chartData.length > 14) {
      return chartData.slice(-14);
    }
    return chartData;
  }, [chartData, isMini]);
  const containerClass = isMini
    ? "grid grid-cols-1 lg:grid-cols-3 gap-4 pb-4"
    : "space-y-8 pb-10";

  const chartContainerClass = `bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm ${isMini ? 'h-full' : ''}`;
  const chartHeightClass = isMini ? "h-[250px]" : "h-[300px]";

  return (
    <div className={containerClass}>

      {/* Graph 1: Installs */}
      <div className={chartContainerClass}>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{granularity} Installs</h3>
        <div className={`${chartHeightClass} w-full min-w-0`}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <AreaChart data={displayedData}>
              <defs>
                <linearGradient id="colorInstalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={xAxisFormatter}
                interval={isMini ? 'preserveStartEnd' : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                labelFormatter={xAxisFormatter}
                contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipText, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: tooltipText }}
                labelStyle={{ color: axisColor }}
              />
              <Area
                type="monotone"
                dataKey="installs"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorInstalls)"
                name="Installs"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Graph 2: Ranking */}
      <div className={chartContainerClass}>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">{translations?.avgAppStoreRanking || 'Avg. App Store Ranking'}</h3>
        <div className={`${chartHeightClass} w-full min-w-0`}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <LineChart data={displayedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={xAxisFormatter}
                interval={isMini ? 'preserveStartEnd' : 0}
              />
              <YAxis
                reversed={true}
                domain={[1, 'auto']}
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;

                  const hasRank1 = payload.find(p => p.dataKey === 'ranking' && p.value === 1);
                  const formattedLabel = xAxisFormatter(label);
                  // @ts-ignore
                  const isUnranked = payload[0]?.payload?.isUnranked;

                  return (
                    <div className={`rounded-xl border shadow-sm backdrop-blur-md ${hasRank1
                      ? 'bg-amber-50/90 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50'
                      : 'bg-white/90 border-slate-200 dark:bg-slate-800/90 dark:border-slate-700'
                      }`}>
                      <div className={`px-3 py-2 border-b text-xs font-semibold ${hasRank1
                        ? 'border-amber-200 text-amber-700 dark:border-amber-700/50 dark:text-amber-400'
                        : 'border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}>
                        {formattedLabel}
                        {hasRank1 && <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">★ #1 Rank</span>}
                      </div>
                      <div className="p-3 space-y-1">
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">
                              {entry.name}:
                            </span>
                            <span className={`font-bold ${isUnranked ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
                              {isUnranked ? 'Unranked' : `#${entry.value}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="ranking"
                stroke="#f59e0b"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: any) => {
                  const { cx, cy, value, payload } = props;
                  if (value === 1) {
                    return (
                      <svg x={cx - 8} y={cy - 8} width={16} height={16} viewBox="0 0 16 16" className="overflow-visible">
                        <circle cx="8" cy="8" r="8" fill="#fbbf24" fillOpacity="0.4" className="animate-pulse" />
                        <circle cx="8" cy="8" r="4" fill="#fbbf24" stroke="white" strokeWidth="1.5" />
                      </svg>
                    );
                  }
                  if (payload.isUnranked) {
                    return <circle cx={cx} cy={cy} r={4} fill="#ef4444" strokeWidth={0} />;
                  }
                  return <circle cx={cx} cy={cy} r={4} fill="#f59e0b" strokeWidth={0} />;
                }}
                activeDot={{ r: 6 }}
                name="Avg. Rank"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Graph 3: Costs */}
      <div className={chartContainerClass}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{granularity} Costs</h3>
          {!isMini && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-medium border border-emerald-100 dark:border-emerald-800">
              {currencySymbol}{totalCost.toFixed(2)}
            </div>
          )}
          {isMini && (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-sm">{currencySymbol}{totalCost.toFixed(0)}</span>
          )}
        </div>

        <div className={`${chartHeightClass} w-full min-w-0`}>
          <ResponsiveContainer width="100%" height="100%" minHeight={200}>
            <BarChart data={displayedData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={xAxisFormatter}
                interval={isMini ? 'preserveStartEnd' : 0}
              />
              <YAxis
                tick={{ fontSize: 10, fill: axisColor }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `${currencySymbol}${val}`}
                width={30}
              />
              <Tooltip
                labelFormatter={xAxisFormatter}
                formatter={(value: number) => [`${currencySymbol}${value}`, 'Cost']}
                cursor={{ fill: theme === 'dark' ? '#334155' : '#f1f5f9' }}
                contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, backgroundColor: tooltipBg, color: tooltipText, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: tooltipText }}
                labelStyle={{ color: axisColor }}
              />
              <Bar
                dataKey="cost"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                name="Cost ($)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};