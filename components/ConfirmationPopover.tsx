import React, { useEffect, useRef, useState } from 'react';

interface ConfirmationPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    message: string;
    subMessage?: string;
    confirmText?: string;
    cancelText?: string;
    targetRef: React.RefObject<HTMLElement>;
}

export const ConfirmationPopover: React.FC<ConfirmationPopoverProps> = ({
    isOpen,
    onClose,
    onConfirm,
    message,
    subMessage,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    targetRef
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        if (isOpen && targetRef.current) {
            const rect = targetRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX + rect.width / 2
            });
        }
    }, [isOpen, targetRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
                targetRef.current && !targetRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose, targetRef]);

    if (!isOpen || !position) return null;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 w-64 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 -translate-x-1/2"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
        >
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                {message}
            </div>
            {subMessage && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {subMessage}
                </div>
            )}
            <div className="flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >
                    {cancelText}
                </button>
                <button
                    onClick={() => {
                        onConfirm();
                        onClose();
                    }}
                    className="px-2 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded"
                >
                    {confirmText}
                </button>
            </div>

            {/* Arrow */}
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-800 border-t border-l border-slate-200 dark:border-slate-700 rotate-45" />
        </div>
    );
};
