import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onChange: (start: string | null, end: string | null) => void;
  theme: 'light' | 'dark';
  t: any;
  variant?: 'default' | 'compact' | 'overview'; // compact for Lab, overview for Overview dashboard
}

// Helpers
const toDate = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toStr = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onChange, theme, t, variant = 'default' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileModalRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  // Internal state for the picker (before applying)
  const [tempStart, setTempStart] = useState<string | null>(startDate);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate);
  const [showHint, setShowHint] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  // View state for the calendar (controls which month is visible)
  const [viewDate, setViewDate] = useState(startDate ? toDate(startDate) : new Date());

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isContainer = containerRef.current && containerRef.current.contains(target);
      const isDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      const isHint = hintRef.current && hintRef.current.contains(target);
      const isMobileModal = mobileModalRef.current && mobileModalRef.current.contains(target);

      if (!isContainer && !isDropdown && !isHint && !isMobileModal) {
        setIsOpen(false);
        setShowHint(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on scroll to prevent detached floating
  useEffect(() => {
    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('scroll', handleScroll, { capture: true });
    }
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [isOpen]);

  // Reset temp state when opening & Calculate Position
  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate);
      setTempEnd(endDate);
      if (endDate) {
        setViewDate(toDate(endDate));
      }

      // Calculate Position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 8, // 8px gap
          right: window.innerWidth - rect.right
        });
      }
    }
  }, [isOpen, startDate, endDate]);

  const handleApply = () => {
    onChange(tempStart, tempEnd);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
    setShowHint(false);
  };

  const handlePreset = (days: number | 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'all') => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;

    if (days === 'all') {
      setTempStart(null);
      setTempEnd(null);
      return;
    }

    if (days === 'today') {
      start = new Date(today);
      end = new Date(today);
    } else if (days === 'yesterday') {
      start = new Date(today);
      start.setDate(today.getDate() - 1);
      end = new Date(start);
    } else if (days === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today);
    } else if (days === 'lastMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (typeof days === 'number') {
      end = new Date(today);
      start = new Date(today);
      start.setDate(today.getDate() - (days - 1));
    } else {
      start = new Date(today);
      end = new Date(today);
    }

    setTempStart(toStr(start));
    setTempEnd(toStr(end));
    setViewDate(end);
  };

  const handleDateClick = (dateStr: string) => {
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(dateStr);
      setTempEnd(null);
    } else {
      if (dateStr < tempStart) {
        setTempEnd(tempStart);
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
    }
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setViewDate(newDate);
  };

  const renderCalendar = (offset: number) => {
    const currentMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${offset}-${i}`} className="h-8 w-8" />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toStr(new Date(year, month, d));
      let isSelected = false;
      let isInRange = false;
      let isStart = false;
      let isEnd = false;

      if (tempStart && tempEnd) {
        isInRange = dateStr >= tempStart && dateStr <= tempEnd;
        isStart = dateStr === tempStart;
        isEnd = dateStr === tempEnd;
      } else if (tempStart) {
        isStart = dateStr === tempStart;
      }

      const classes = `
            h-8 w-8 text-sm flex items-center justify-center rounded-full cursor-pointer transition-colors relative z-10
            ${isStart || isEnd ? 'bg-indigo-600 text-white hover:bg-indigo-700' : ''}
            ${!isStart && !isEnd && isInRange ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-300 rounded-none' : ''}
            ${!isStart && !isEnd && !isInRange ? 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300' : ''}
            ${isStart && isInRange ? 'rounded-r-none' : ''}
            ${isEnd && isInRange ? 'rounded-l-none' : ''}
        `;

      days.push(
        <div key={dateStr} onClick={() => handleDateClick(dateStr)} className={classes}>
          {d}
        </div>
      );
    }

    return (
      <div className="w-full sm:w-64 p-3 sm:p-4">
        <div className="font-semibold text-slate-800 dark:text-slate-200 text-center mb-3 sm:mb-4">
          {currentMonthDate.toLocaleDateString(theme === 'dark' ? 'en-US' : 'en-US', { month: 'long', year: 'numeric' })}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <span key={d} className="text-xs font-medium text-slate-400 dark:text-slate-500">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {days}
        </div>
      </div>
    );
  };

  const formatDisplay = (): React.ReactNode => {
    const todayStr = toStr(new Date());
    if (!startDate) return t.allTime;

    const startLabel = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const isNow = !endDate || endDate === todayStr;
    const endLabel = isNow
      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">Now</span>
      : new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
      <span className="inline-flex items-center gap-1">
        <span>{startLabel}</span>
        <span className="text-slate-400 dark:text-slate-500">-</span>
        {endLabel}
      </span>
    );
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 
          ${variant === 'compact' ? 'px-3 py-1.5 text-xs' : variant === 'overview' ? 'px-3 py-2 text-xs' : 'px-3 py-1.5 text-xs md:text-sm'} 
          bg-white 
          ${variant === 'compact' ? 'dark:bg-slate-900' : variant === 'overview' ? 'dark:bg-slate-800' : 'dark:bg-slate-700'} 
          border border-slate-200 
          ${variant === 'compact' ? 'dark:border-slate-700' : variant === 'overview' ? 'dark:border-slate-700' : 'dark:border-slate-600'} 
          ${variant === 'compact' ? 'rounded-md' : 'rounded-lg'} 
          font-medium text-slate-700 
          ${variant === 'compact' ? 'dark:text-slate-300' : variant === 'overview' ? 'dark:text-slate-200' : 'dark:text-slate-200'} 
          hover:border-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none transition-all cursor-pointer shadow-sm w-full lg:w-auto`}
      >
        <CalendarIcon size={16} className="text-slate-500 dark:text-slate-400" />
        <span className="flex-1 text-left truncate">{formatDisplay()}</span>
      </button>

      {isOpen && (
        <>
          {/* Mobile: Fullscreen Modal (Portal not strictly needed for fixed inset-0, but consistent) */}
          {createPortal(
            <div className="md:hidden fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleCancel}>
              <div ref={mobileModalRef} className="fixed inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.selectDateRange || 'Select Date Range'}</h3>
                  <button onClick={handleCancel} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <X size={20} className="text-slate-500 dark:text-slate-400" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Preset Buttons */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button onClick={() => handlePreset('today')} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.today}</button>
                    <button onClick={() => handlePreset('yesterday')} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.yesterday}</button>
                    <button onClick={() => handlePreset(7)} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last7Days}</button>
                    <button onClick={() => handlePreset(30)} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last30Days}</button>
                    <button onClick={() => handlePreset(90)} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last3Months}</button>
                    <button onClick={() => handlePreset('thisMonth')} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.thisMonth}</button>
                    <button onClick={() => handlePreset('lastMonth')} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.lastMonth}</button>
                    <button onClick={() => handlePreset('all')} className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.allTime}</button>
                  </div>

                  {/* Calendar Navigation */}
                  <div className="flex items-center justify-between px-1 mb-2 text-slate-600 dark:text-slate-400 font-medium">
                    <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
                      <ChevronLeft size={18} />
                    </button>
                    <div className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {/* Two Months side-by-side with horizontal scroll fallback */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 shadow-sm border border-slate-200 dark:border-slate-700">
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      <div className="min-w-[240px] shrink-0">{renderCalendar(0)}</div>
                      <div className="min-w-[240px] shrink-0">{renderCalendar(1)}</div>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="relative">
                    <button
                      onClick={() => setShowHint(prev => !prev)}
                      className="h-8 w-8 rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sm font-bold"
                    >
                      ?
                    </button>
                    {showHint && (
                      <div ref={hintRef} className="absolute -top-20 left-1/2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg text-[11px] text-slate-600 dark:text-slate-300 px-3 py-2 flex items-start gap-2">
                        <span className="text-indigo-500 text-xs font-bold">?</span>
                        <span className="leading-tight">{t.dateHelpHint}</span>
                        <button onClick={() => setShowHint(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm px-1">✕</button>
                      </div>
                    )}
                  </div>
                  <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">{t.cancel}</button>
                  <button onClick={handleApply} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{t.applyRange}</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Desktop: Dropdown via Portal */}
          {dropdownPos && createPortal(
            <div
              ref={dropdownRef}
              style={{
                top: dropdownPos.top,
                right: dropdownPos.right,
              }}
              className="hidden md:flex fixed z-[100] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
              {/* Presets Sidebar */}
              <div className="w-40 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1">
                <button onClick={() => handlePreset('today')} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.today}</button>
                <button onClick={() => handlePreset('yesterday')} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.yesterday}</button>
                <button onClick={() => handlePreset(7)} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last7Days}</button>
                <button onClick={() => handlePreset(30)} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last30Days}</button>
                <button onClick={() => handlePreset(90)} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.last3Months}</button>
                <button onClick={() => handlePreset('thisMonth')} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.thisMonth}</button>
                <button onClick={() => handlePreset('lastMonth')} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.lastMonth}</button>
                <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                <button onClick={() => handlePreset('all')} className="text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition-colors">{t.allTime}</button>
              </div>

              {/* Calendars Area */}
              <div>
                <div className="flex items-start justify-center p-2 border-b border-slate-100 dark:border-slate-800">
                  <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex-1"></div>
                  <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400">
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="flex">
                  {renderCalendar(-1)}
                  <div className="w-px bg-slate-100 dark:bg-slate-800 my-4"></div>
                  {renderCalendar(0)}
                </div>
                <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                  <div className="relative">
                    <button
                      onClick={() => setShowHint(prev => !prev)}
                      className="h-8 w-8 rounded-full border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sm font-bold"
                    >
                      ?
                    </button>
                    {showHint && (
                      <div ref={hintRef} className="absolute -top-20 left-1/2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg text-[11px] text-slate-600 dark:text-slate-300 px-3 py-2 flex items-start gap-2">
                        <span className="text-indigo-500 text-xs font-bold">?</span>
                        <span className="leading-tight">{t.dateHelpHint}</span>
                        <button onClick={() => setShowHint(false)} className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm px-1">✕</button>
                      </div>
                    )}
                  </div>
                  <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">{t.cancel}</button>
                  <button onClick={handleApply} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{t.applyRange}</button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
};
