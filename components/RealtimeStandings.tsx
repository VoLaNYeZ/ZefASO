import React, { useEffect, useState } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle2, Trophy } from 'lucide-react';
import { fetchAppRank } from '../lib/itunesService';
import { loadRealtimeRankings, saveRealtimeRanking, RealtimeRanking } from '../lib/supabaseService';

interface RealtimeStandingsProps {
    appId: string;
    appName: string;
    appIcon?: string;
    items: { keyword: string; geo: string }[];
    getCountryFlag: (geo: string) => string;
    theme: 'light' | 'dark';
}

export const RealtimeStandings: React.FC<RealtimeStandingsProps> = ({
    appId,
    appName,
    appIcon,
    items,
    getCountryFlag,
    theme
}) => {
    const [rankings, setRankings] = useState<Record<string, RealtimeRanking>>({});
    const [loadingState, setLoadingState] = useState<Record<string, boolean>>({});
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);

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
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Real-Time Standings</h2>
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
                    {isGlobalLoading ? 'Refreshing All (Queued)...' : 'Refresh All'}
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
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
