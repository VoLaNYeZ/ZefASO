import React, { useEffect, useState, useMemo } from 'react';
import { RefreshCw, Clock, AlertCircle, CheckCircle2, Trophy, Eye, Activity } from 'lucide-react';
import { fetchAppRank, fetchTop5Apps, Top5App } from '../lib/itunesService';
import { loadRealtimeRankings, saveRealtimeRanking, RealtimeRanking, getApiUsage, incrementApiUsage, fetchCountryRankings, CountryRanking } from '../lib/supabaseService';
import { fetchTrafficData, TrafficData } from '../services/asoMobile';
import { TrafficTooltip } from './TrafficTooltip';
import { ConfirmationPopover } from './ConfirmationPopover';
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
    const [trafficLoadingState, setTrafficLoadingState] = useState<Record<string, boolean>>({});
    const [hoveredTraffic, setHoveredTraffic] = useState<string | null>(null);
    const [hoveredTrafficElement, setHoveredTrafficElement] = useState<HTMLElement | null>(null);
    const [isGlobalLoading, setIsGlobalLoading] = useState(false);
    const [apiUsageCount, setApiUsageCount] = useState<number>(0);
    const [countryRankings, setCountryRankings] = useState<Record<string, CountryRanking>>({});
    const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

    // Popover State
    const [popoverState, setPopoverState] = useState<{
        isOpen: boolean;
        keyword: string;
        geo: string;
        targetRef: React.RefObject<HTMLElement> | null;
    }>({ isOpen: false, keyword: '', geo: '', targetRef: null });

    // Top 5 Modal State
    const [isTop5ModalOpen, setIsTop5ModalOpen] = useState(false);
    const [top5Apps, setTop5Apps] = useState<Top5App[]>([]);
    const [top5Loading, setTop5Loading] = useState(false);
    const [top5Error, setTop5Error] = useState<string | null>(null);
    const [selectedKeywordGeo, setSelectedKeywordGeo] = useState<{ keyword: string; geo: string } | null>(null);

    // Load saved rankings on mount
    useEffect(() => {
        loadData();
        loadApiUsage();
        loadCountryRankings();
    }, [appId]);

    // Map common country code variations to standard ISO codes
    const normalizeCountryCode = (geo: string): string => {
        const mapping: Record<string, string> = {
            'UK': 'GB',  // United Kingdom
            'SW': 'SE',  // Sweden
            'NE': 'NL',  // Netherlands
            'NO': 'NO',  // Norway (already standard)
            'PO': 'PL',  // Poland fix
        };
        return mapping[geo.toUpperCase()] || geo.toUpperCase();
    };

    const loadCountryRankings = async () => {
        const rankings = await fetchCountryRankings();
        setCountryRankings(rankings);
    };

    const loadApiUsage = async () => {
        const count = await getApiUsage('aso_mobile');
        setApiUsageCount(count);
    };

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

    const handleTrafficFetchConfirm = async () => {
        const { keyword, geo } = popoverState;
        if (!keyword || !geo) return;

        const key = getKey(keyword, geo);
        setTrafficLoadingState(prev => ({ ...prev, [key]: true }));

        try {
            const trafficData = await fetchTrafficData(keyword, geo);

            // Increment usage
            const newCount = await incrementApiUsage('aso_mobile');
            setApiUsageCount(newCount);

            // Update Supabase
            const currentRanking = rankings[key];
            if (currentRanking) {
                const updatedRanking: RealtimeRanking = {
                    ...currentRanking,
                    traffic: trafficData.traffic?.value,
                    trafficData: trafficData
                };

                await saveRealtimeRanking(updatedRanking);
                setRankings(prev => ({ ...prev, [key]: updatedRanking }));
            }
        } catch (error: any) {
            console.error(`Failed to fetch traffic for ${keyword} in ${geo}`, error);
            alert(`Failed to fetch traffic data: ${error.message || 'Unknown error'}`);
        } finally {
            setTrafficLoadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleTrafficClick = (keyword: string, geo: string, event: React.MouseEvent<HTMLElement>) => {
        // Create a ref-like object for the clicked element
        const target = { current: event.currentTarget as HTMLElement };
        setPopoverState({
            isOpen: true,
            keyword,
            geo,
            targetRef: target
        });
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
    const groupedItems = useMemo(() => {
        const groups: Record<string, string[]> = {};
        items.forEach(item => {
            if (!groups[item.geo]) {
                groups[item.geo] = [];
            }
            if (!groups[item.geo].includes(item.keyword)) {
                groups[item.geo].push(item.keyword);
            }
        });
        return groups;
    }, [items]);

    const uniqueGeos = useMemo(() => Object.keys(groupedItems).sort(), [groupedItems]);

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
                    <div key={geo} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        {/* Header */}
                        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                            <img src={getCountryFlag(geo)} alt={geo} className="w-5 h-4 object-cover rounded-sm" />
                            <span className="font-bold text-slate-700 dark:text-slate-200">{geo}</span>
                            {countryRankings[normalizeCountryCode(geo)] && (
                                <div
                                    className="relative inline-flex items-center"
                                    onMouseEnter={() => setHoveredCountry(geo)}
                                    onMouseLeave={() => setHoveredCountry(null)}
                                >
                                    <span className={`px-1.5 py-px text-[9px] font-bold rounded shadow-sm cursor-help ${countryRankings[normalizeCountryCode(geo)].label === 1
                                        ? 'bg-gradient-to-br from-yellow-400 to-amber-600 text-white border border-yellow-500'
                                        : countryRankings[normalizeCountryCode(geo)].label === 2
                                            ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900 border border-slate-400'
                                            : countryRankings[normalizeCountryCode(geo)].label === 3
                                                ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white border border-orange-500'
                                                : countryRankings[normalizeCountryCode(geo)].label === 4
                                                    ? 'bg-gradient-to-br from-blue-400 to-blue-600 text-white border border-blue-500'
                                                    : countryRankings[normalizeCountryCode(geo)].label === 5
                                                        ? 'bg-gradient-to-br from-purple-400 to-purple-600 text-white border border-purple-500'
                                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600'
                                        }`} title="Country Tier">
                                        T{countryRankings[normalizeCountryCode(geo)].label}
                                    </span>
                                    {hoveredCountry === geo && (
                                        <div className="absolute bottom-full left-0 mb-2 bg-slate-900 dark:bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl z-50 min-w-[200px] border border-slate-700 dark:border-slate-600">
                                            <div className="text-[11px] font-bold mb-1.5">{countryRankings[normalizeCountryCode(geo)].name || geo}</div>
                                            {countryRankings[normalizeCountryCode(geo)].population && (
                                                <div className="text-xs mb-1">
                                                    <span className="text-slate-400">Population:</span> <span className="font-bold">{countryRankings[normalizeCountryCode(geo)].population!.toLocaleString()}</span>
                                                </div>
                                            )}
                                            {countryRankings[normalizeCountryCode(geo)].gdp && (
                                                <div className="text-xs">
                                                    <span className="text-slate-400">GDP per capita:</span> <span className="font-bold">${countryRankings[normalizeCountryCode(geo)].gdp!.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
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
                                                        ? `${new Date(data.lastUpdated).toLocaleDateString('en-GB')} ${new Date(data.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                                        : 'Never'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {/* Traffic Refresh Button - only show when data exists */}
                                            {typeof data?.traffic === 'number' && !trafficLoadingState[key] && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTrafficClick(keyword, geo, e);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                                                    title="Refresh traffic data"
                                                >
                                                    <RefreshCw size={12} />
                                                </button>
                                            )}

                                            {/* Traffic Display */}
                                            <div
                                                className="relative flex items-center justify-center w-16 h-8 rounded-lg font-bold text-sm bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                                onMouseEnter={(e) => {
                                                    setHoveredTraffic(key);
                                                    setHoveredTrafficElement(e.currentTarget);
                                                }}
                                                onMouseLeave={() => {
                                                    setHoveredTraffic(null);
                                                    setHoveredTrafficElement(null);
                                                }}
                                            >
                                                {trafficLoadingState[key] ? (
                                                    <RefreshCw size={14} className="animate-spin text-indigo-500" />
                                                ) : typeof data?.traffic === 'number' ? (
                                                    <span className="cursor-help">{Math.round(data.traffic)}</span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => handleTrafficClick(keyword, geo, e)}
                                                        className="w-full h-full flex items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-500 transition-colors rounded-lg"
                                                        title="Fetch Traffic"
                                                    >
                                                        <Activity size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Render tooltip outside the relative container */}
                                            {hoveredTraffic === key && typeof data?.traffic === 'number' && (
                                                <TrafficTooltip
                                                    data={data.trafficData}
                                                    lastUpdated={data.lastUpdated}
                                                    isVisible={true}
                                                    targetElement={hoveredTrafficElement}
                                                />
                                            )}

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
                                                title={translations?.viewTop5 || 'View Top 20'}
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
            < Top5Modal
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

            {/* Confirmation Popover */}
            <ConfirmationPopover
                isOpen={popoverState.isOpen}
                onClose={() => setPopoverState(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleTrafficFetchConfirm}
                message="Fetch traffic data?"
                subMessage={`Requests left: ${Math.max(0, 50 - apiUsageCount)}`}
                confirmText="Fetch"
                targetRef={popoverState.targetRef as React.RefObject<HTMLElement>}
            />
        </div>
    );
};
