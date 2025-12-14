import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import { generateKeywordSuggestions } from '../services/openaiService';

interface KeywordSuggesterProps {
    appName: string;
    geo: string;
    existingKeywords: string[];
    theme: 'light' | 'dark';
    t: any; // Translation object
}

export const KeywordSuggester: React.FC<KeywordSuggesterProps> = ({ appName, geo, existingKeywords, theme, t }) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedKeyword, setCopiedKeyword] = useState<string | null>(null);
    const [allCopied, setAllCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        requestIdRef.current += 1;
        setSuggestions([]);
        setError(null);
        setCopiedKeyword(null);
        setAllCopied(false);
        setIsLoading(false);
    }, [appName, geo]);

    const handleGenerate = async () => {
        const reqId = requestIdRef.current + 1;
        requestIdRef.current = reqId;
        setIsLoading(true);
        setSuggestions([]);
        setError(null);
        try {
            const results = await generateKeywordSuggestions(appName, geo, existingKeywords);
            if (requestIdRef.current !== reqId) return;
            if (results.length === 0) {
                setError(t.keywordSuggesterError || 'Failed to generate keywords. Please try again later.');
            } else {
                setSuggestions(results);
            }
        } catch {
            if (requestIdRef.current !== reqId) return;
            setError(t.keywordSuggesterError || 'Failed to generate keywords. Please try again later.');
        } finally {
            if (requestIdRef.current !== reqId) return;
            setIsLoading(false);
        }
    };

    const handleCopy = (keyword: string) => {
        navigator.clipboard.writeText(keyword);
        setCopiedKeyword(keyword);
        setTimeout(() => setCopiedKeyword(null), 2000);
    };

    const handleCopyAll = () => {
        const text = suggestions.join(',');
        navigator.clipboard.writeText(text);
        setAllCopied(true);
        setTimeout(() => setAllCopied(false), 2000);
    };

    if (!appName) return null;

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden my-8 transition-all duration-300 ${suggestions.length > 0 ? 'max-w-full' : 'max-w-2xl mx-auto'}`}>
            <div className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t.keywordSuggester}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t.generateKeywords} <span className="font-medium text-slate-900 dark:text-slate-200">{appName}</span>{geo !== 'All' && <> {t.in} <span className="font-medium text-slate-900 dark:text-slate-200">{geo}</span></>}
                            </p>
                        </div>
                    </div>

                    {/* Actions Area */}
                    <div className="flex items-center gap-3">
                        {suggestions.length > 0 ? (
                            <button
                                onClick={handleCopyAll}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                {allCopied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                                {allCopied ? t.copied : t.copyAll}
                            </button>
                        ) : (
                            !isLoading && (
                                <button
                                    onClick={handleGenerate}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all text-sm"
                                >
                                    <Sparkles size={16} />
                                    {t.generate}
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 animate-in fade-in zoom-in duration-300">
                        <Loader2 size={24} className="animate-spin mb-2 text-purple-500" />
                        <p className="text-sm font-medium">{t.analyzing}</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                    </div>
                )}

                {/* Results Grid */}
                {suggestions.length > 0 && (
                    <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                        <div className="flex flex-wrap gap-2">
                            {suggestions.map((keyword, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleCopy(keyword)}
                                    className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${copiedKeyword === keyword
                                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm'
                                        }`}
                                    title={t.clickToCopy}
                                >
                                    {keyword}
                                    {copiedKeyword === keyword ? (
                                        <Check size={12} className="shrink-0" />
                                    ) : (
                                        <Copy size={12} className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity" />
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="flex justify-center pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={handleGenerate}
                                className="text-sm text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 font-medium transition-colors flex items-center gap-1"
                            >
                                <Sparkles size={14} />
                                {t.regenerate}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
