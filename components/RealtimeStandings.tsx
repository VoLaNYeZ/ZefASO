import React, { useEffect, useState } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle2, Trophy, Eye } from 'lucide-react';
import { fetchAppRank, fetchTop5Apps, Top5App } from '../lib/itunesService';
import { loadRealtimeRankings, saveRealtimeRanking, RealtimeRanking } from '../lib/supabaseService';
import Top5Modal from './Top5Modal';

interface RealtimeStandingsProps {
    appId: string;
    appName: string;
    appIcon?: string;
    items: { keyword: string; geo: string }[];
    getCountryFlag: (geo: string) => string;
    theme: 'light' | 'dark';
    translations?: any;
}

export const RealtimeStandings: React.FC<RealtimeStandingsProps> = ({
    appId,
    appName,
    appIcon,
    items,
    getCountryFlag,
    theme,
    translations
}) => {
    const [rankings, setRankings] = useState<Record<string, RealtimeRanking>>({});
    const [loadingState, setLoadingState] = useState<Record<string, boolean>>({});
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);

    // Top 5 Modal State
    const [isTop5ModalOpen, setIsTop5ModalOpen] = useState(false);
    const [top5Apps, setTop5Apps] = useState<Top5App[]>([]);
    const [top5Loading, setTop5Loading] = useState(false);
    const [top5Error, setTop5Error] = useState<string | null>(null);
    const [selectedKeywordGeo, setSelectedKeywordGeo] = useState<{ keyword: string; geo: string } | null>(null);

    // Load saved rankings on mount
    useEffect(() => {
        loadData();
    }, [appId]);

    const loadData = async () => {
        const data = await loadRealtimeRankings(appId);
        const map: Record<string, RealtimeRanking> = {};
        data.forEach(r => {
            map[`${r.keyword}-${r.geo}`] = r;
        });
        setRankings(map);
    };

    const getKey = (keyword: string, geo: string) => `${keyword}-${geo}`;

    const handleRefresh = async (keyword: string, geo: string) => {
        const key = getKey(keyword, geo);
        setLoadingState(prev => ({ ...prev, [key]: true }));

        try {
            // Fetch from iTunes
            const rank = await fetchAppRank(keyword, geo, appId);

            // Save to Supabase
            const newRanking: RealtimeRanking = {
                appId,
                keyword,
                geo,
                rank,
                lastUpdated: new Date().toISOString()
            };

            await saveRealtimeRanking(newRanking);

            // Update local state
            setRankings(prev => ({ ...prev, [key]: newRanking }));
        } catch (error) {
            console.error(`Failed to refresh ${keyword} in ${geo}`, error);
        } finally {
            setLoadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleRefreshAll = async () => {
        setIsGlobalLoading(true);
        // Fire all requests - the queue in itunesService will handle the 3s delay
        const promises: Promise<void>[] = [];

        items.forEach(item => {
            promises.push(handleRefresh(item.keyword, item.geo));
        });

        await Promise.all(promises);
        setIsGlobalLoading(false);
    };

    const handleViewTop5 = async (keyword: string, geo: string) => {
        setSelectedKeywordGeo({ keyword, geo });
        setIsTop5ModalOpen(true);
        setTop5Loading(true);
        setTop5Error(null);
        setTop5Apps([]);

        try {
            const apps = await fetchTop5Apps(keyword, geo);
            setTop5Apps(apps);
        } catch (error) {
            console.error(`Failed to fetch top 5 for ${keyword} in ${geo}`, error);
            setTop5Error('Failed to load top 5 apps. Please try again.');
        } finally {
            setTop5Loading(false);
        }
    };

    // Group items by Geo
    const groupedItems: Record<string, string[]> = {};
    items.forEach(item => {
        if (!groupedItems[item.geo]) {
            groupedItems[item.geo] = [];
        }
        if (!groupedItems[item.geo].includes(item.keyword)) {
            groupedItems[item.geo].push(item.keyword);
        }
    });

    const uniqueGeos = Object.keys(groupedItems).sort();

    if (uniqueGeos.length === 0) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Trophy className="text-indigo-500" size={24} />
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{translations?.realTimeStandings || 'Real-Time Standings'}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            {appIcon && (
                                <img src={appIcon} alt={appName} className="w-6 h-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm object-cover" />
                            )}
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{appName}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">ID: {appId.trim().split(' ').pop()}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleRefreshAll}
                    disabled={isGlobalLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${isGlobalLoading
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
                        }`}
                >
                    <RefreshCw size={16} className={isGlobalLoading ? 'animate-spin' : ''} />
                    {isGlobalLoading ? `${translations?.refreshAll || 'Refresh All'} (Queued)...` : translations?.refreshAll || 'Refresh All'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {uniqueGeos.map(geo => (
                    <div key={geo} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        {/* Header */}
                        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                            <img src={getCountryFlag(geo)} alt={geo} className="w-5 h-4 object-cover rounded-sm" />
                            <span className="font-bold text-slate-700 dark:text-slate-200">{geo}</span>
                        </div>

                        {/* Table */}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {groupedItems[geo].sort().map(keyword => {
                                const key = getKey(keyword, geo);
                                const data = rankings[key];
                                const isLoading = loadingState[key];

                                return (
                                    <div key={keyword} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <div className="flex flex-col min-w-0 flex-1 mr-4">
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate" title={keyword}>
                                                {keyword}
                                            </span>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                                <Clock size={10} />
                                                <span>
                                                    {data?.lastUpdated
                                                        ? new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : 'Never'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Rank Display */}
                                            <div className={`flex items-center justify-center w-12 h-8 rounded-lg font-bold text-sm ${isLoading ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' :
                                                !data ? 'bg-slate-100 dark:bg-slate-800 text-slate-400' :
                                                    data.rank === null ? 'bg-red-50 dark:bg-red-900/20 text-red-500' :
                                                        data.rank <= 3 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                                            data.rank <= 10 ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                                                                'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}>
                                                {isLoading ? (
                                                    <RefreshCw size={14} className="animate-spin" />
                                                ) : (
                                                    data?.rank ?? '-'
                                                )}
                                            </div>

                                            {/* Refresh Button */}
                                            <button
                                                onClick={() => handleRefresh(keyword, geo)}
                                                disabled={isLoading || isGlobalLoading}
                                                className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors disabled:opacity-50"
                                                title="Refresh this ranking"
                                            >
                                                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                                            </button>

                                            {/* View Top 5 Button */}
                                            <button
                                                onClick={() => handleViewTop5(keyword, geo)}
                                                disabled={isGlobalLoading}
                                                className="p-1.5 text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors disabled:opacity-50"
                                                title={translations?.viewTop5 || 'View Top 5'}
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Top 5 Modal */}
            <Top5Modal
                isOpen={isTop5ModalOpen}
                onClose={() => setIsTop5ModalOpen(false)}
                apps={top5Apps}
                keyword={selectedKeywordGeo?.keyword || ''}
                geo={selectedKeywordGeo?.geo || ''}
                isLoading={top5Loading}
                error={top5Error}
                getCountryFlag={getCountryFlag}
                translations={translations}
            />
        </div>
    );
};
