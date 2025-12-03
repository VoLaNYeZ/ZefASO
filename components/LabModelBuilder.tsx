import React, { useMemo } from 'react';
import {
    Zap,
    TrendingUp,
    AlertTriangle,
    CheckCircle,
    Info,
    FlaskConical
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine
} from 'recharts';
import { SuccessRun } from './OptimizationTable';

interface LabModelBuilderProps {
    selectedRuns: SuccessRun[];
    theme: 'light' | 'dark';
    t: any;
}

interface DailyPlan {
    day: number;
    installs: number;
    riskLevel: 'low' | 'medium' | 'high';
}

export const LabModelBuilder: React.FC<LabModelBuilderProps> = ({ selectedRuns, theme, t }) => {

    // Build The "Golden Path" (Average/Median Curve) from selected runs
    const modelData = useMemo(() => {
        if (selectedRuns.length === 0) return null;

        const successPaths = selectedRuns.map(r => r.dailyInstalls);

        // Find max duration among all selected success runs
        const maxDays = Math.max(...successPaths.map(p => p.length));
        const goldenPath: DailyPlan[] = [];

        for (let i = 0; i < maxDays; i++) {
            // Get installs for Day 'i' from all valid paths that lasted this long
            const values = successPaths
                .map(path => path[i])
                .filter(val => val !== undefined);

            if (values.length === 0) continue;

            // Calculate Average for this campaign day
            const avgInstalls = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

            // Determine Risk
            // > 100 installs = High Risk (Keyword Deletion chance)
            // > 50% jump from previous day = Medium Risk
            let risk: 'low' | 'medium' | 'high' = 'low';
            if (avgInstalls > 100) risk = 'high';
            else if (i > 0 && avgInstalls > goldenPath[i - 1].installs * 1.5) risk = 'medium';

            goldenPath.push({
                day: i + 1,
                installs: avgInstalls,
                riskLevel: risk
            });
        }

        return goldenPath;

    }, [selectedRuns]);

    if (!modelData || modelData.length === 0) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center opacity-70 h-[400px] flex flex-col items-center justify-center">
                <FlaskConical className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={64} />
                <h3 className="text-xl font-bold text-slate-600 dark:text-slate-400">{t.modelBuilderIdle}</h3>
                <p className="text-slate-400 dark:text-slate-500 max-w-md mx-auto mt-2">
                    {t.selectSuccessStory}
                </p>
            </div>
        );
    }

    const totalBudget = modelData.reduce((acc, curr) => acc + (curr.installs * 0.09), 0); // Assuming 0.09 CPI
    const duration = modelData.length;
    const maxInstalls = Math.max(...modelData.map(d => d.installs));
    const riskyDays = modelData.filter(d => d.riskLevel === 'high').length;

    return (
        <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl overflow-hidden text-white shadow-2xl shadow-indigo-900/40 border border-slate-700 dark:border-slate-800 h-[500px] flex flex-col">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm shrink-0">
                        <Zap className="text-yellow-300 fill-yellow-300" size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black tracking-tight">{t.theGoldenRoute}</h3>
                        <p className="text-indigo-100 text-sm font-medium opacity-90">{t.optimalInstallCurve} {selectedRuns.length} {t.selectedPatterns}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm font-bold">
                    <div className="px-4 py-2 bg-black/20 rounded-xl backdrop-blur-md border border-white/10">
                        <span className="opacity-70 text-xs block uppercase tracking-wider">{t.avgDuration}</span>
                        {duration} {t.days}
                    </div>
                    <div className="px-4 py-2 bg-black/20 rounded-xl backdrop-blur-md border border-white/10">
                        <span className="opacity-70 text-xs block uppercase tracking-wider">{t.estBudget}</span>
                        ${totalBudget.toFixed(2)}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 flex-1 min-h-0">
                {/* Chart Section */}
                <div className="lg:col-span-2 p-6 min-h-[300px] flex flex-col min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={modelData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                            <XAxis
                                dataKey="day"
                                stroke="#94a3b8"
                                tick={{ fontSize: 12 }}
                                label={{ value: t.campaignDay, position: 'insideBottom', offset: -5, fill: '#64748b', fontSize: 12 }}
                            />
                            <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' }}
                                itemStyle={{ color: '#818cf8' }}
                                labelFormatter={(label) => `${t.day} ${label}`}
                            />

                            <ReferenceLine y={100} stroke="#f87171" strokeDasharray="3 3" label={{ value: t.riskLimit, fill: '#f87171', fontSize: 10 }} />

                            <Area
                                type="monotone"
                                dataKey="installs"
                                stroke="#818cf8"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorPlan)"
                                name={t.targetInstalls}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Stats & Risk Section */}
                <div className="bg-slate-800/50 dark:bg-slate-900/50 border-l border-slate-700 dark:border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
                    <div>
                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">{t.riskAnalysis}</h4>

                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <div className={`mt-0.5 p-1 rounded-full ${riskyDays > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                    {riskyDays > 0 ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                                </div>
                                <div>
                                    <span className={`block font-bold ${riskyDays > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {riskyDays > 0 ? `${riskyDays} ${t.highRiskDays}` : t.safeCurve}
                                    </span>
                                    <p className="text-xs text-slate-400 leading-relaxed mt-1">
                                        {riskyDays > 0
                                            ? t.riskMsgHigh
                                            : t.riskMsgSafe}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-1 rounded-full bg-indigo-500/20 text-indigo-400">
                                    <TrendingUp size={16} />
                                </div>
                                <div>
                                    <span className="block font-bold text-indigo-400">{t.maxVelocity}: {maxInstalls}/{t.day}</span>
                                    <p className="text-xs text-slate-400 leading-relaxed mt-1">
                                        {t.peakVolumeMsg}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-indigo-900/30 rounded-xl border border-indigo-500/30">
                        <div className="flex gap-2 items-center text-indigo-300 font-bold text-sm mb-2">
                            <Info size={16} /> {t.recommendation}
                        </div>
                        <p className="text-xs text-indigo-200">
                            {t.startWith} <strong>{modelData[0]?.installs} {t.installs}</strong> {t.onDay1}.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};