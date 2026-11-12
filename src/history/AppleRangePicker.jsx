import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  DAY_MS,
  formatPickerValue,
  formatRange,
  fromLocalInput,
  toLocalInput,
} from './dateRange';

const PRESETS = [
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfMonth(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthLabel(date) {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export default function AppleRangePicker({
  preset,
  rangeLabel,
  fromValue,
  toValue,
  minMs,
  maxMs,
  onFromChange,
  onToChange,
  onPreset,
  onApply,
  error = '',
  inline = false,
}) {
  const [editing, setEditing] = useState(null); // 'from' | 'to' | null
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(Date.now()));

  const fromMs = fromLocalInput(fromValue);
  const toMs = fromLocalInput(toValue);
  const fromDate = Number.isFinite(fromMs) ? new Date(fromMs) : null;
  const toDate = Number.isFinite(toMs) ? new Date(toMs) : null;
  const activeDate = editing === 'from' ? fromDate : editing === 'to' ? toDate : null;

  useEffect(() => {
    if (!editing) return;
    const date = editing === 'from' ? fromDate : toDate;
    setViewMonth(startOfMonth(date && Number.isFinite(date.getTime()) ? date.getTime() : Date.now()));
  }, [editing]);

  const openEditor = (which) => {
    setEditing(which);
  };

  const setDateFor = (which, date) => {
    const current = which === 'from' ? fromDate : toDate;
    const next = new Date(date);
    next.setHours(
      current ? current.getHours() : which === 'from' ? 0 : 23,
      current ? current.getMinutes() : which === 'from' ? 0 : 59,
      0,
      0
    );
    const setter = which === 'from' ? onFromChange : onToChange;
    setter(toLocalInput(next.getTime()));
    setViewMonth(startOfMonth(next.getTime()));
  };

  const setTimeFor = (which, hours, minutes) => {
    const current = which === 'from' ? fromDate : toDate;
    const next = current ? new Date(current) : new Date();
    next.setHours(hours, minutes, 0, 0);
    const setter = which === 'from' ? onFromChange : onToChange;
    setter(toLocalInput(next.getTime()));
  };

  const handleNow = () => {
    const current = editing === 'from' ? fromDate : toDate;
    const next = current ? new Date(current) : new Date();
    const now = new Date();
    next.setHours(now.getHours(), now.getMinutes(), 0, 0);
    const setter = editing === 'from' ? onFromChange : onToChange;
    setter(toLocalInput(next.getTime()));
  };

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const dayNumber = index - startDay + 1;
        const date = new Date(year, month, dayNumber);
        return {
          date,
          outside: dayNumber < 1 || dayNumber > daysInMonth,
        };
      }),
    [year, month, startDay, daysInMonth]
  );

  const today = startOfDay(new Date());
  const fromStart = fromDate ? startOfDay(fromDate) : null;
  const toStart = toDate ? startOfDay(toDate) : null;
  const prevDisabled = new Date(year, month, 0).getTime() < minMs - DAY_MS;
  const nextDisabled = new Date(year, month + 1, 1).getTime() > maxMs;

  const hours24 = activeDate ? activeDate.getHours() : editing === 'from' ? 0 : 23;
  const minutes = activeDate ? activeDate.getMinutes() : editing === 'from' ? 0 : 59;
  const hour12 = hours24 % 12 || 12;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const minuteOptions = useMemo(() => {
    const options = Array.from({ length: 12 }, (_, index) => index * 5);
    if (!options.includes(minutes)) options.push(minutes);
    return options.sort((a, b) => a - b);
  }, [minutes]);

  const timeSelectClass =
    'rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100 outline-none';

  const renderEditor = () => (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-900 dark:text-white">
          {editing === 'from' ? 'Start date & time' : 'End date & time'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="rounded-full px-3 py-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
        >
          Done
        </button>
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          disabled={prevDisabled}
          className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">
          {monthLabel(viewMonth)}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          disabled={nextDisabled}
          className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {WEEKDAYS.map((day, index) => (
          <span
            key={`${day}-${index}`}
            className="text-[9px] font-semibold uppercase text-slate-400 dark:text-slate-500"
          >
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.map(({ date, outside }) => {
          const timestamp = date.getTime();
          const dayEnd = timestamp + DAY_MS - 1;
          const outsideRange =
            (editing === 'from' && toStart && timestamp > toStart.getTime()) ||
            (editing === 'to' && fromStart && timestamp < fromStart.getTime());
          const disabled = dayEnd < minMs || timestamp > maxMs || outsideRange;
          const isFrom = fromDate && sameDay(date, fromDate);
          const isTo = toDate && sameDay(date, toDate);
          const selected = isFrom || isTo;
          const inRange =
            fromStart && toStart && timestamp > fromStart.getTime() && timestamp < toStart.getTime();
          const isToday = sameDay(date, today);

          return (
            <button
              key={timestamp}
              type="button"
              disabled={disabled}
              onClick={() => setDateFor(editing, date)}
              className={`h-9 w-9 mx-auto rounded-full text-[11px] font-semibold flex items-center justify-center transition-colors ${
                selected
                  ? 'bg-sky-500 text-white dark:text-slate-950 shadow-sm'
                  : inRange
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : outside
                      ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-white/10'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-white/10'
              } ${isToday && !selected ? 'ring-1 ring-sky-400/60' : ''} ${
                disabled ? 'opacity-25 cursor-not-allowed hover:bg-transparent' : ''
              }`}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <select
          value={hour12}
          onChange={(event) => {
            const nextHour = (Number(event.target.value) % 12) + (meridiem === 'PM' ? 12 : 0);
            setTimeFor(editing, nextHour, minutes);
          }}
          className={timeSelectClass}
          aria-label="Hour"
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="text-slate-400">:</span>
        <select
          value={minutes}
          onChange={(event) => setTimeFor(editing, hours24, Number(event.target.value))}
          className={timeSelectClass}
          aria-label="Minute"
        >
          {minuteOptions.map((minute) => (
            <option key={minute} value={minute}>
              {String(minute).padStart(2, '0')}
            </option>
          ))}
        </select>
        <select
          value={meridiem}
          onChange={(event) => {
            const nextHour = (hour12 % 12) + (event.target.value === 'PM' ? 12 : 0);
            setTimeFor(editing, nextHour, minutes);
          }}
          className={timeSelectClass}
          aria-label="AM or PM"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <button
          type="button"
          onClick={handleNow}
          className="ml-auto rounded-full px-3 py-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
        >
          Now
        </button>
      </div>

      <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        {formatPickerValue(activeDate?.getTime())}
      </div>
    </>
  );

  return (
    <div className="relative">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-[12px] bg-slate-200/70 dark:bg-white/10">
        {PRESETS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onPreset(item.key)}
            className={`min-h-10 rounded-[9px] text-[11px] font-semibold transition-colors ${
              preset === item.key
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Custom range
        </div>

        {['from', 'to'].map((which) => {
          const isFrom = which === 'from';
          const value = isFrom ? fromMs : toMs;
          const isEditing = editing === which;
          return (
            <button
              key={which}
              type="button"
              onClick={() => openEditor(which)}
              className={`w-full flex items-center gap-2.5 rounded-[12px] border px-2.5 py-2.5 text-left transition-colors ${
                isEditing
                  ? 'border-sky-400/60 bg-sky-500/10'
                  : 'border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/20'
              } ${isFrom ? 'mb-1.5' : ''}`}
            >
              <span className="w-8 h-8 rounded-[9px] bg-slate-500/10 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {isFrom ? 'From' : 'To'}
                </span>
                <span className="block text-[11px] font-semibold text-slate-800 dark:text-slate-100 truncate tnum">
                  {formatPickerValue(value)}
                </span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          );
        })}
      </div>

      {editing && inline && (
        <div className="mt-2 rounded-[16px] border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3">
          {renderEditor()}
        </div>
      )}

      <div className="mt-2 flex items-start gap-1.5 rounded-[10px] bg-slate-500/5 dark:bg-white/5 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        <Clock className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          <strong className="font-semibold text-slate-700 dark:text-slate-200">{rangeLabel}</strong>
          {' · '}
          {formatRange(fromMs, toMs)}
        </span>
      </div>

      {error && (
        <div className="mt-2 rounded-[10px] border border-rose-500/25 bg-rose-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          onApply();
          setEditing(null);
        }}
        className="mt-2 w-full min-h-11 rounded-[10px] bg-sky-500 hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors"
      >
        Apply range
      </button>

      {editing && !inline && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            aria-hidden="true"
            onClick={() => setEditing(null)}
          />
          <div className="absolute left-0 right-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-[18px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1728] p-3 shadow-2xl">
            {renderEditor()}
          </div>
        </>
      )}
    </div>
  );
}
