import React, { useMemo } from 'react';
import {
    Check,
    Search,
    DollarSign,
    Calendar,
    Trophy
} from 'lucide-react';

export interface SuccessRun {
    id: string; // Unique ID for this specific run
    appName: string; // This holds the composite "App Name + ID"
    geo: string;
    keyword: string;
    daysToRank1: number;
    totalCost: number;
    startRank: number;
    dailyInstalls: number[]; // The sequence of installs
}

interface OptimizationTableProps {
    runs: SuccessRun[];
    selectedRunIds: Set<string>;
    onToggleRun: (id: string) => void;
    getCountryFlag: (geo: string) => string;
    theme: 'light' | 'dark';
    t: any;
}

export const OptimizationTable: React.FC<OptimizationTableProps> = ({
    runs,
    selectedRunIds,
    onToggleRun,
    getCountryFlag,
    theme,
    t
}) => {

    // Sort runs: Selected first, then by duration (shortest first)
    const sortedRuns = useMemo(() => {
        return [...runs].sort((a, b) => {
            const aSelected = selectedRunIds.has(a.id);
            const bSelected = selectedRunIds.has(b.id);
            if (aSelected && !bSelected) return -1;
            if (!aSelected && bSelected) return 1;
            return a.daysToRank1 - b.daysToRank1;
        });
    }, [runs, selectedRunIds]);

    if (runs.length === 0) {
        return (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
                    <Search size={20} />
                </div>
                <h3 className="text-slate-600 dark:text-slate-300 font-bold">{t.noSuccessPatterns}</h3>
                <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                    {t.noSuccessPatternsDesc}
                </p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col mt-6">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Trophy size={16} className="text-amber-500" />
                        {t.successStories}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.selectBestRuns}
                    </p>
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                    {selectedRunIds.size} {t.selected} / {runs.length} {t.available}
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-xs tracking-wider">
                        <tr>
                            <th className="px-4 py-3 w-10 text-center">
                                {t.include}
                            </th>
                            <th className="px-4 py-3">{t.applicationId}</th>
                            <th className="px-4 py-3">{t.keywordGeo}</th>
                            <th className="px-4 py-3 text-right">{t.duration}</th>
                            <th className="px-4 py-3 text-right">{t.estCost}</th>
                            <th className="px-4 py-3 text-center">{t.startRank}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedRuns.map((run) => {
                            const isSelected = selectedRunIds.has(run.id);
                            return (
                                <tr
                                    key={run.id}
                                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}
                                    onClick={() => onToggleRun(run.id)}
                                >
                                    <td className="px-4 py-3 text-center">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all mx-auto ${isSelected
                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent hover:border-indigo-400 dark:hover:border-indigo-500'
                                            }`}>
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                                        <div className="truncate max-w-[200px]" title={run.appName}>
                                            {run.appName}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <img
                                                src={getCountryFlag(run.geo)}
                                                alt={run.geo}
                                                className="w-5 h-3.5 object-contain rounded-[2px]"
                                                title={run.geo}
                                            />
                                            <span className="font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700">
                                                {run.keyword}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="inline-flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                                            <Calendar size={14} className="text-slate-400" />
                                            {run.daysToRank1} {t.days}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                                            <DollarSign size={14} className="text-slate-400" />
                                            {run.totalCost.toFixed(0)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                            {run.startRank === 0 ? t.unranked : `#${run.startRank}`}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};