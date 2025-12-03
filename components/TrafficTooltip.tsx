import React, { useEffect, useState, useRef } from 'react';
import { TrafficData } from '../services/asoMobile';

interface TrafficTooltipProps {
    data: TrafficData;
    isVisible: boolean;
    lastUpdated?: string;
    targetElement?: HTMLElement | null;
}

export const TrafficTooltip: React.FC<TrafficTooltipProps> = ({ data, isVisible, lastUpdated, targetElement }) => {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isVisible && targetElement && tooltipRef.current) {
            const rect = targetElement.getBoundingClientRect();
            const tooltipHeight = tooltipRef.current.offsetHeight;

            setPosition({
                top: rect.top + window.scrollY - tooltipHeight - 8,
                left: rect.left + window.scrollX + rect.width / 2
            });
        }
    }, [isVisible, targetElement]);

    if (!isVisible || !data) return null;

    return (
        <div
            ref={tooltipRef}
            className="fixed z-[9999] w-64 p-4 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 max-h-80 overflow-auto -translate-x-1/2"
            style={position ? { top: `${position.top}px`, left: `${position.left}px` } : { opacity: 0, pointerEvents: 'none' }}
        >
            <div className="space-y-2">
                {lastUpdated && (
                    <div className="text-[10px] text-slate-400 mb-2">
                        Fetched: {new Date(lastUpdated).toLocaleDateString('en-GB')} {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                )}
                <div className="flex justify-between">
                    <span className="font-semibold">Traffic:</span>
                    <span>{data.traffic?.value?.toFixed(1)}</span>
                </div>
                {data.ci && (
                    <div className="flex justify-between">
                        <span className="font-semibold">Complexity (CI):</span>
                        <span>{data.ci.value?.toFixed(1)}</span>
                    </div>
                )}
                {data.kei && (
                    <div className="flex justify-between">
                        <span className="font-semibold">Effectiveness (KEI):</span>
                        <span>{data.kei.value?.toFixed(1)}</span>
                    </div>
                )}
                {data.suggestions && data.suggestions.length > 0 && (
                    <div>
                        <span className="font-semibold block mb-1">Suggestions:</span>
                        <div className="flex flex-wrap gap-1">
                            {data.suggestions.slice(0, 5).map((s, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-[10px]">
                                    {s}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
                {data.top_apps && data.top_apps.length > 0 && (
                    <div className="flex justify-between">
                        <span className="font-semibold">Top Apps:</span>
                        <span className="text-[10px] text-slate-500">
                            {data.top_apps.length} apps found
                        </span>
                    </div>
                )}
            </div>

            {/* Arrow pointing down */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 rotate-45" />
        </div>
    );
};
