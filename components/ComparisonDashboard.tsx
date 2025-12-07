import React, { useState, useEffect, useMemo } from 'react';
import { AsoEntry, ComparisonBlock } from '../types';
import { ComposedAppChart } from './ComposedAppChart';
import { LabModelBuilder } from './LabModelBuilder';
import { OptimizationTable, SuccessRun } from './OptimizationTable';
import { Plus, RotateCcw, FlaskConical, LayoutGrid, LayoutList, GitCompare, Zap } from 'lucide-react';

interface ComparisonDashboardProps {
    data: AsoEntry[];
    activeApps: string[];
    appIdLabelsByGroup?: Record<string, Record<string, { name: string; date: string }>>;
    getCountryFlag: (geo: string) => string;
    theme: 'light' | 'dark';
    t: any;
}

export const ComparisonDashboard: React.FC<ComparisonDashboardProps> = ({ data, activeApps, appIdLabelsByGroup, getCountryFlag, theme, t }) => {
    // -- Active Tab --
    const [activeTab, setActiveTab] = useState<'comparison' | 'optimization'>('comparison');

    // -- Comparison State --
    const [blocks, setBlocks] = useState<ComparisonBlock[]>(() => {
        try {
            const saved = localStorage.getItem('aso_comparison_config');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    const [layout, setLayout] = useState<'list' | 'grid'>(() => {
        try {
            const saved = localStorage.getItem('aso_comparison_layout');
            return saved === 'list' ? 'list' : 'grid';
        } catch {
            return 'grid';
        }
    });

    // -- Optimization State --
    const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

    // Persistence
    useEffect(() => {
        localStorage.setItem('aso_comparison_config', JSON.stringify(blocks));
    }, [blocks]);

    useEffect(() => {
        localStorage.setItem('aso_comparison_layout', layout);
    }, [layout]);


    // -- Comparison Handlers --
    const addBlock = () => {
        const newBlock: ComparisonBlock = {
            id: crypto.randomUUID(),
            appName: activeApps.length > 0 ? activeApps[0] : '',
            appId: 'All',
            geo: 'All',
            keyword: 'All',
            color: '#6366f1',
            startDate: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
        };
        setBlocks(prev => [newBlock, ...prev]);
    };

    const updateBlock = (id: string, field: keyof ComparisonBlock, value: string | null) => {
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
    };

    const deleteBlock = (id: string) => {
        setBlocks(prev => prev.filter(b => b.id !== id));
    };

    const resetComparison = () => {
        setBlocks([]);
        localStorage.removeItem('aso_comparison_config');
    };

    // -- Run Finding Logic (Global Scan) --
    const allSuccessRuns = useMemo(() => {
        const runs: SuccessRun[] = [];

        // Group all data by unique App ID (Name+ID) + Geo + Keyword
        // We use d.appId here instead of d.appName to ensure we capture the specific app source
        const timelineMap = new Map<string, AsoEntry[]>();

        data.forEach(d => {
            const key = `${d.appId}::${d.geo}::${d.keyword}`;
            if (!timelineMap.has(key)) timelineMap.set(key, []);
            timelineMap.get(key)?.push(d);
        });

        timelineMap.forEach((entries, key) => {
            const [appDisplayId, geo, keyword] = key.split('::');

            // Sort by Date
            const timeline = entries.sort((a, b) => a.date.localeCompare(b.date));

            // Find Rank 1
            const rankOneIndex = timeline.findIndex(t => t.ranking === 1);

            if (rankOneIndex > 0) {
                // Must have some history before it (rankOneIndex > 0)
                // Check if it started from a "low" point (Rank > 10 or 0)
                const firstEntry = timeline[0];
                const startRank = firstEntry.ranking;

                // Definition of a "Run": Start unranked or > 10, end at 1.
                if (startRank === 0 || startRank > 10) {
                    const runSegment = timeline.slice(0, rankOneIndex + 1);

                    // Create Success Run Object
                    runs.push({
                        id: `${key}-run`,
                        appName: appDisplayId, // This holds the composite Name+ID string
                        geo,
                        keyword,
                        daysToRank1: runSegment.length,
                        totalCost: runSegment.reduce((acc, curr) => acc + (curr.installs * curr.cpi), 0),
                        startRank,
                        dailyInstalls: runSegment.map(t => t.installs)
                    });
                }
            }
        });

        return runs;
    }, [data]);

    const toggleRunSelection = (id: string) => {
        const newSet = new Set(selectedRunIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedRunIds(newSet);
    };

    // -- Selected Runs for Model --
    const selectedRunsData = useMemo(() => {
        return allSuccessRuns.filter(r => selectedRunIds.has(r.id));
    }, [allSuccessRuns, selectedRunIds]);


    return (
        <div className="p-6 pb-20 pt-16 md:pt-6 max-w-[1600px] mx-auto min-h-full flex flex-col">
            {/* Header */}
            <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 shrink-0">
                <div className="z-10">
                    <h2 className="text-3xl font-black text-slate-800 dark:text-slate-100 tracking-tight mb-1 flex items-center gap-3">
                        <FlaskConical size={32} className="text-indigo-600 dark:text-indigo-400" />
                        {t.theLab}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">{t.labDescription}</p>
                </div>

                {/* Main Tab Switch - Modern & Noticeable Design */}
                <div className="relative z-0 mt-4 md:mt-0">
                    <div className="bg-white dark:bg-slate-900 p-2 rounded-xl flex items-center gap-1.5 shadow-lg border-2 border-slate-200 dark:border-slate-700 relative">
                        {/* Sliding Background Indicator */}
                        <div
                            className={`absolute top-2 bottom-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 transition-all duration-300 ease-out shadow-md ${activeTab === 'comparison'
                                ? 'left-2 right-[50%]'
                                : 'left-[50%] right-2'
                                }`}
                        />

                        <button
                            onClick={() => setActiveTab('comparison')}
                            className={`relative z-10 flex items-center justify-center gap-2 pl-8 pr-4 py-3 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'comparison'
                                ? 'text-white scale-105'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:scale-105'
                                }`}
                        >
                            <GitCompare size={20} className={activeTab === 'comparison' ? 'animate-pulse' : ''} />
                            <span>{t.comparison}</span>
                        </button>

                        <button
                            onClick={() => setActiveTab('optimization')}
                            className={`relative z-10 flex items-center justify-center gap-2 pl-8 pr-4 py-3 rounded-lg text-sm font-bold transition-all duration-300 ${activeTab === 'optimization'
                                ? 'text-white scale-105'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:scale-105'
                                }`}
                        >
                            <Zap size={24} className={`ml-4 ${activeTab === 'optimization' ? 'animate-pulse' : ''}`} />
                            <span>{t.optimization}</span>
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${activeTab === 'optimization'
                                ? 'bg-white/20 text-white'
                                : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
                                }`}>Beta</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* --- COMPARISON TAB CONTENT --- */}
            {activeTab === 'comparison' && (
                <div className="animate-in fade-in duration-300">
                    <div className="flex justify-end mb-4">
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                            {/* Layout Toggle */}
                            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                <button
                                    onClick={() => setLayout('grid')}
                                    className={`p-2 rounded-md transition-all flex items-center gap-2 text-sm font-bold ${layout === 'grid' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    title="Grid View"
                                >
                                    <LayoutGrid size={18} />
                                </button>
                                <button
                                    onClick={() => setLayout('list')}
                                    className={`p-2 rounded-md transition-all flex items-center gap-2 text-sm font-bold ${layout === 'list' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    title="List View"
                                >
                                    <LayoutList size={18} />
                                </button>
                            </div>

                            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-1"></div>

                            <button
                                onClick={addBlock}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                <Plus size={18} /> {t.addComparison}
                            </button>

                            {blocks.length > 0 && (
                                <button
                                    onClick={resetComparison}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Clear Lab"
                                >
                                    <RotateCcw size={20} />
                                </button>
                            )}
                        </div>
                    </div>

                    {blocks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 text-center">
                            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-400 rounded-full flex items-center justify-center mb-6">
                                <GitCompare size={40} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">{t.comparePerformance}</h3>
                            <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
                                {t.compareDesc}
                            </p>
                            <button
                                onClick={addBlock}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
                            >
                                {t.addComparisonChart}
                            </button>
                        </div>
                    ) : (
                        <div className={`grid gap-6 ${layout === 'grid' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>
                            {blocks.map(block => (
                        <ComposedAppChart
                            key={block.id}
                            block={block}
                            allData={data}
                            availableApps={activeApps}
                            idLabelsByGroup={appIdLabelsByGroup}
                            getCountryFlag={getCountryFlag}
                            onUpdate={updateBlock}
                            onDelete={deleteBlock}
                            theme={theme}
                            t={t}
                        />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* --- OPTIMIZATION TAB CONTENT --- */}
            {activeTab === 'optimization' && (
                <div className="animate-in fade-in duration-300 flex flex-col flex-1 min-h-0">
                    {/* Top: Model Builder */}
                    <LabModelBuilder selectedRuns={selectedRunsData} theme={theme} t={t} />

                    {/* Bottom: Selection Table */}
                    <OptimizationTable
                        runs={allSuccessRuns}
                        selectedRunIds={selectedRunIds}
                        onToggleRun={toggleRunSelection}
                        getCountryFlag={getCountryFlag}
                        theme={theme}
                        t={t}
                    />
                </div>
            )}
        </div>
    );
};
