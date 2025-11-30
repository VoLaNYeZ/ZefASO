import React, { useState, useEffect, useRef } from 'react';
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

  // Internal state for the picker (before applying)
  const [tempStart, setTempStart] = useState<string | null>(startDate);
  const [tempEnd, setTempEnd] = useState<string | null>(endDate);

  // View state for the calendar (controls which month is visible)
  const [viewDate, setViewDate] = useState(startDate ? toDate(startDate) : new Date());

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset temp state when opening
  useEffect(() => {
    if (isOpen) {
      setTempStart(startDate);
      setTempEnd(endDate);
      if (endDate) {
        // If we have an end date, try to show that month, or the start month
        setViewDate(toDate(endDate));
      }
    }
  }, [isOpen, startDate, endDate]);

  const handleApply = () => {
    onChange(tempStart, tempEnd);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handlePreset = (days: number | 'today' | 'yesterday' | 'thisMonth' | 'lastMonth' | 'all') => {
    const today = new Date();
    // Reset hours to avoid any weirdness
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
      end = new Date(today); // Month to date
    } else if (days === 'lastMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (typeof days === 'number') {
      end = new Date(today);
      start = new Date(today);
      start.setDate(today.getDate() - (days - 1));
    } else {
      // Fallback
      start = new Date(today);
      end = new Date(today);
    }

    setTempStart(toStr(start));
    setTempEnd(toStr(end));
    setViewDate(end); // Show the end of the range
  };

  const handleDateClick = (dateStr: string) => {
    if (!tempStart || (tempStart && tempEnd)) {
      // Start a new selection
      setTempStart(dateStr);
      setTempEnd(null);
    } else {
      // Complete selection
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
    const firstDay = getFirstDayOfMonth(year, month); // 0 = Sun

    const days = [];
    // Empty slots for start of month
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
      <div className="w-64 p-4">
        <div className="font-semibold text-slate-800 dark:text-slate-200 text-center mb-4">
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

  const formatDisplay = () => {
    if (!startDate) return t.allTime;
    const start = new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (!endDate) return `${start} - ...`;
    const end = new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${start} - ${end}`;
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
        <div className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 flex flex-col md:flex-row overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Presets Sidebar */}
          <div className="w-full md:w-40 bg-slate-50 dark:bg-slate-800/50 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1">
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
            <div className="flex flex-col md:flex-row">
              {renderCalendar(-1)}
              <div className="hidden md:block w-px bg-slate-100 dark:bg-slate-800 my-4"></div>
              {renderCalendar(0)}
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <button onClick={handleCancel} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">{t.cancel}</button>
              <button onClick={handleApply} className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors">{t.applyRange}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};