import React, { useState } from 'react';
import { X, Star, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Top5App } from '../lib/itunesService';

interface Top5ModalProps {
    isOpen: boolean;
    onClose: () => void;
    apps: Top5App[];
    keyword: string;
    geo: string;
    isLoading: boolean;
    error: string | null;
    getCountryFlag: (geo: string) => string;
    translations?: any;
}

const Top5Modal: React.FC<Top5ModalProps> = ({
    isOpen,
    onClose,
    apps,
    keyword,
    geo,
    isLoading,
    error,
    getCountryFlag,
    translations
}) => {
    const [currentScreenshots, setCurrentScreenshots] = useState<Record<number, number>>({});

    if (!isOpen) return null;

    const getRankBadgeClass = (rank: number) => {
        switch (rank) {
            case 1:
                return 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-900 shadow-lg shadow-yellow-500/50';
            case 2:
                return 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800 shadow-md shadow-gray-400/50';
            case 3:
                return 'bg-gradient-to-br from-orange-400 to-orange-600 text-orange-900 shadow-md shadow-orange-500/50';
            default:
                return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        }
    };

    const navigateScreenshot = (trackId: number, direction: 'prev' | 'next', totalScreenshots: number) => {
        setCurrentScreenshots(prev => {
            const current = prev[trackId] || 0;
            let newIndex = direction === 'prev' ? current - 1 : current + 1;
            if (newIndex < 0) newIndex = totalScreenshots - 1;
            if (newIndex >= totalScreenshots) newIndex = 0;
            return { ...prev, [trackId]: newIndex };
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border dark:border-slate-800"
                onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <img src={getCountryFlag(geo)} alt={geo} className="w-6 h-5 object-cover rounded-sm shadow-sm" />
                        <div>
                            <h2 className="text-xl font-bold text-white">{translations?.top5Apps || 'Top 5 Apps'}</h2>
                            <p className="text-sm text-indigo-100">"{keyword}" {translations?.inGeo || 'in'} {geo}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                    {isLoading && (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600"></div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
                            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
                        </div>
                    )}

                    {!isLoading && !error && apps.length === 0 && (
                        <div className="text-center py-20 text-slate-500 dark:text-slate-400">
                            <p className="font-medium">No apps found</p>
                        </div>
                    )}

                    {!isLoading && !error && apps.length > 0 && (
                        <div className="grid grid-cols-1 gap-4">
                            {apps.map((app) => (
                                <div
                                    key={app.trackId}
                                    className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-lg transition-all"
                                >
                                    <div className="flex gap-4">
                                        {/* Rank Badge */}
                                        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${getRankBadgeClass(app.rank)}`}>
                                            #{app.rank}
                                        </div>

                                        {/* App Icon */}
                                        <a
                                            href={app.trackViewUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-shrink-0"
                                        >
                                            <img
                                                src={app.artworkUrl100}
                                                alt={app.trackName}
                                                className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm object-cover hover:opacity-80 transition-opacity cursor-pointer"
                                            />
                                        </a>

                                        {/* App Info */}
                                        <div className="flex-1 min-w-0">
                                            <a
                                                href={app.trackViewUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-bold text-slate-800 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 truncate text-lg transition-colors cursor-pointer"
                                            >
                                                {app.trackName}
                                            </a>
                                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                                {app.sellerName}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2">
                                                {/* Rating */}
                                                <div className="flex items-center gap-1.5">
                                                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                        {app.averageUserRating ? app.averageUserRating.toFixed(1) : 'N/A'}
                                                    </span>
                                                </div>
                                                {/* Rating Count */}
                                                <div className="flex items-center gap-1.5">
                                                    <Users size={14} className="text-slate-400" />
                                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                                        {app.userRatingCount ? app.userRatingCount.toLocaleString() : '0'}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Genres */}
                                            {app.genres.length > 0 && (
                                                <div className="flex gap-1.5 mt-2 flex-wrap">
                                                    {app.genres.slice(0, 2).map((genre, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md"
                                                        >
                                                            {genre}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Screenshot Thumbnails */}
                                    {app.screenshotUrls.length > 0 && (
                                        <div className="mt-3 flex gap-2">
                                            {app.screenshotUrls.slice(0, 3).map((url, idx) => (
                                                <img
                                                    key={idx}
                                                    src={url}
                                                    alt={`Screenshot ${idx + 1}`}
                                                    className="w-16 h-16 rounded-lg border border-slate-200 dark:border-slate-700 object-cover object-top shadow-sm"
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Top5Modal;
