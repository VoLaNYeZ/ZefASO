import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { BalanceEntry, addBalanceEntry, loadBalanceEntries } from '../lib/supabaseService';
import { DollarSign, Plus, Minus, Calendar, StickyNote, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface BalancePanelProps {
    session: Session | null;
    totalInstallCost: number;
}

const formatCurrency = (value: number) => {
    if (Number.isNaN(value)) return '$0.00';
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
};

export const BalancePanel: React.FC<BalancePanelProps> = ({ session, totalInstallCost }) => {
    const [expanded, setExpanded] = useState(false);
    const [entries, setEntries] = useState<BalanceEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<{ amount: string; note: string; date: string; mode: 'add' | 'spend' }>({
        amount: '',
        note: '',
        date: new Date().toISOString().slice(0, 10),
        mode: 'add'
    });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const datePickerRef = useRef<HTMLDivElement | null>(null);
    const dateTriggerRef = useRef<HTMLButtonElement | null>(null);
    const pickerPortalRef = useRef<HTMLDivElement | null>(null);
    const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
    const [calendarMonth, setCalendarMonth] = useState(() => new Date());

    const totals = useMemo(() => {
        const deposits = entries.filter(e => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
        const manualSpends = entries.filter(e => e.amount < 0).reduce((sum, e) => sum + Math.abs(e.amount), 0);
        const spends = totalInstallCost + manualSpends;
        const balance = deposits - spends;
        return { balance, deposits, spends };
    }, [entries, totalInstallCost]);

    useEffect(() => {
        if (!session) {
            setEntries([]);
            setExpanded(false);
            return;
        }

        const load = async () => {
            setLoading(true);
            const logs = await loadBalanceEntries();
            setEntries(logs);
            setLoading(false);
        };

        load();
    }, [session]);

    // Close date picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const path = (e.composedPath && e.composedPath()) || [];
            const insideTrigger = path.includes(dateTriggerRef.current as EventTarget);
            const insidePicker = path.includes(pickerPortalRef.current as EventTarget);
            if (!insideTrigger && !insidePicker) {
                setShowDatePicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Update picker position to avoid clipping under overflow parents
    const updatePickerPosition = () => {
        const rect = dateTriggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPickerPosition({
            top: rect.bottom + 6 + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width
        });
    };

    useLayoutEffect(() => {
        if (!showDatePicker) return;
        updatePickerPosition();
        const onScroll = () => updatePickerPosition();
        const onResize = () => updatePickerPosition();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [showDatePicker]);

    const goToMonth = (direction: 'prev' | 'next') => {
        setCalendarMonth(prev => {
            const d = new Date(prev);
            d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
            return d;
        });
    };

    const selectDate = (day: number) => {
        const y = calendarMonth.getFullYear();
        const m = calendarMonth.getMonth() + 1;
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setForm(f => ({ ...f, date: iso }));
        setShowDatePicker(false);
    };

    const parseIsoDate = (value: string) => {
        const [y, m, d] = value.split('-').map(Number);
        return { y, m: m - 1, d };
    };

    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear();
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: Array<{ day: number | null }> = [];
        for (let i = 0; i < firstDay; i++) days.push({ day: null });
        for (let d = 1; d <= daysInMonth; d++) days.push({ day: d });
        return days;
    }, [calendarMonth]);

    const displayDate = useMemo(() => {
        const { y, m, d } = parseIsoDate(form.date);
        const dateObj = new Date(Date.UTC(y, m, d));
        return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }, [form.date]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session || saving) return;

        const parsedAmount = parseFloat(form.amount);
        if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            setError('Enter a positive amount');
            return;
        }

        setSaving(true);
        setError(null);

        const signedAmount = form.mode === 'add' ? parsedAmount : -parsedAmount;
        const entryDate = form.date || new Date().toISOString().slice(0, 10);

        const saved = await addBalanceEntry({
            amount: signedAmount,
            note: form.note.trim() || null,
            entryDate
        });

        if (!saved) {
            setError('Could not save entry');
            setSaving(false);
            return;
        }

        setEntries(prev => [saved, ...prev]);
        setForm(current => ({ ...current, amount: '', note: '' }));
        setSaving(false);
    };

    return (
        <div className="relative inline-flex shrink-0 min-w-[140px] max-w-[200px]">
            <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className={`flex items-center gap-1.5 rounded-lg bg-slate-850 border border-slate-700 text-slate-100 px-2 py-1.5 shadow-md shadow-black/20 transition-all ${expanded ? 'ring-1 ring-indigo-500/60 bg-slate-800' : ''}`}
            >
                <span
                    className="font-semibold tabular-nums"
                    style={{
                        fontSize: formatCurrency(totals.balance).length >= 9 ? '0.8rem' : '0.9rem'
                    }}
                >
                    {formatCurrency(totals.balance)}
                </span>
                <span className="text-[10px] text-slate-500">{expanded ? '▴' : '▾'}</span>
            </button>

            {expanded && (
                <div className="absolute right-2 top-full mt-2 space-y-2 animate-shelf w-[200px] max-w-[calc(100vw-48px)] z-40">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/95 shadow-xl overflow-hidden w-full">
                        <div className="p-3 space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { label: 'Deposits', value: formatCurrency(totals.deposits), color: 'emerald' },
                                    { label: 'Spends', value: `-${formatCurrency(totals.spends)}`, color: 'rose' },
                                ].map(({ label, value, color }) => {
                                    const len = value.length;
                                    const fontSize = `${Math.max(10, 13 - Math.max(0, len - 8) * 0.6)}px`;
                                    return (
                                        <div
                                            key={label}
                                            className={`rounded-lg border border-${color}-500/20 bg-${color}-500/8 px-2.5 py-1.5 flex flex-col justify-center overflow-hidden`}
                                        >
                                            <p className={`text-[10px] uppercase text-${color}-200/80 font-semibold tracking-wide w-full text-${label === 'Deposits' ? 'left' : 'right'}`}>{label}</p>
                                            <div className="w-full flex items-center justify-center">
                                                <div className="flex-1 flex items-center justify-center">
                                                    <p
                                                        className={`font-black text-${color}-100 tabular-nums leading-tight whitespace-nowrap text-center`}
                                                        style={{ fontSize }}
                                                    >
                                                        {value}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <form onSubmit={handleSubmit} className="grid gap-2 rounded-lg border border-slate-800/70 bg-slate-900/80 p-3 shadow-inner shadow-black/15">
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, mode: 'add' }))}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-all whitespace-nowrap ${form.mode === 'add'
                                            ? 'border-emerald-500 text-emerald-200 bg-emerald-500/10 shadow-inner shadow-emerald-500/30'
                                            : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                                    >
                                        <Plus size={14} /> Add
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, mode: 'spend' }))}
                                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-all whitespace-nowrap ${form.mode === 'spend'
                                            ? 'border-rose-500 text-rose-200 bg-rose-500/10 shadow-inner shadow-rose-500/30'
                                            : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}
                                    >
                                        <Minus size={14} /> Spend
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="relative group">
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1 tracking-wide">Amount</label>
                                        <span className="absolute left-3 top-[43px] -translate-y-1/2 text-slate-500 text-sm">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.amount}
                                            onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                                        className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-sm placeholder:text-slate-500 shadow-sm shadow-black/20"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                                <div className="relative group" ref={datePickerRef}>
                                    <label className="text-[11px] text-slate-400 font-semibold block mb-1 tracking-wide">Date</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowDatePicker(prev => !prev)}
                                        ref={dateTriggerRef}
                                            className="w-full flex items-center justify-between px-3 py-2 h-10 rounded-lg bg-slate-800/80 border border-slate-700/70 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-sm shadow-sm shadow-black/20 relative"
                                    >
                                        <div className="flex items-center gap-2 text-slate-200">
                                            <Calendar size={14} className="text-slate-400" />
                                            <span className="font-semibold tracking-tight">{displayDate}</span>
                                        </div>
                                            <span className="text-slate-500 text-xs">▼</span>
                                        </button>

                                        {showDatePicker && createPortal(
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: pickerPosition.top,
                                                    left: pickerPosition.left,
                                                    width: pickerPosition.width
                                                }}
                                                className="z-[9999]"
                                                ref={pickerPortalRef}
                                            >
                                                <div className="rounded-xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-black/30 backdrop-blur animate-in fade-in slide-in-from-top-2 origin-top">
                                                    <div className="flex items-center justify-between px-3 py-1 border-b border-slate-800 text-[11px] text-slate-200">
                                                        <button type="button" onClick={() => goToMonth('prev')} className="p-1 rounded-lg hover:bg-slate-800/80">‹</button>
                                                        <span className="font-semibold text-[12px]">{calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                                                        <button type="button" onClick={() => goToMonth('next')} className="p-1 rounded-lg hover:bg-slate-800/80">›</button>
                                                    </div>
                                                    <div className="grid grid-cols-7 text-center text-[10px] text-slate-400 px-3 pt-1 gap-1">
                                                        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
                                                    </div>
                                                    <div className="grid grid-cols-7 gap-1 px-3 py-1">
                                                        {calendarDays.map((item, idx) => {
                                                            const { y: selY, m: selM, d: selD } = parseIsoDate(form.date);
                                                            const isSelected = item.day !== null && item.day === selD && calendarMonth.getMonth() === selM && calendarMonth.getFullYear() === selY;
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    disabled={item.day === null}
                                                                    onClick={() => item.day && selectDate(item.day)}
                                                                    className={`h-6 w-full rounded-md text-[11px] transition-all ${
                                                                        item.day === null
                                                                            ? 'bg-transparent cursor-default'
                                                                            : isSelected
                                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                                                                                : 'bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                                                                    }`}
                                                                >
                                                                    {item.day ?? ''}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>,
                                            document.body
                                        )}
                                    </div>
                                    <div className="relative group">
                                        <label className="text-[11px] text-slate-400 font-semibold block mb-1 tracking-wide">Note</label>
                                        <span className="absolute left-3 top-[43px] -translate-y-1/2 text-slate-500 text-sm">
                                            <StickyNote size={14} />
                                        </span>
                                        <input
                                            type="text"
                                            value={form.note}
                                            onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                                            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800/80 border border-slate-700/70 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all text-sm placeholder:text-slate-500 shadow-sm shadow-black/20"
                                            placeholder="Optional"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold shadow-lg hover:from-indigo-500 hover:to-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (form.mode === 'add' ? <Plus size={16} /> : <Minus size={16} />)}
                                    {form.mode === 'add' ? 'Save deposit' : 'Save spend'}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                            <p className="text-[11px] uppercase text-slate-500 tracking-[0.08em] font-semibold">Activity</p>
                            <p className="text-sm text-slate-300">{entries.length} record{entries.length === 1 ? '' : 's'}</p>
                        </div>
                        <div className="max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 divide-y divide-slate-800">
                            {loading && (
                                <div className="flex items-center justify-center gap-2 px-4 py-4 text-slate-400">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading balance...
                                </div>
                            )}

                            {!loading && entries.length === 0 && (
                                <div className="px-4 py-4 text-sm text-slate-500">No balance changes yet.</div>
                            )}

                            {!loading && entries.map(entry => (
                                <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                                    <div className={`px-2 py-1 rounded-md text-xs font-bold tabular-nums border whitespace-nowrap ${entry.amount >= 0
                                        ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/40'
                                        : 'bg-rose-500/10 text-rose-200 border-rose-500/40'}`}>
                                        {entry.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(entry.amount)).replace('$', '')}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between text-xs gap-2 leading-none">
                                            {entry.note ? (
                                                <span
                                                    className="whitespace-nowrap text-indigo-200 font-semibold cursor-help inline-flex items-center gap-1"
                                                    title={`Note: ${entry.note}`}
                                                >
                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-300 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]" />
                                                    <span className="underline decoration-dotted">{entry.entryDate}</span>
                                                </span>
                                            ) : (
                                                <span className="whitespace-nowrap text-slate-400">{entry.entryDate}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
