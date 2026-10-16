import React, { useState, useEffect } from 'react';
import { Eye, Sun, Moon, QrCode, CloudSun, ChevronDown, CheckCircle2, Award, Activity } from 'lucide-react';

export default function DynamicIsland({
  vehicles = [],
  camps = [],
  theme = 'light',
  onToggleTheme,
  onOpenDriverModal,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [time, setTime] = useState('');

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Aggregated Stats
  const totalScreened = camps.reduce((acc, c) => acc + (c.currentScreened || 0), 0);
  const totalCataracts = camps.reduce((acc, c) => acc + (c.cataractIdentified || 0), 0);
  const movingCount = vehicles.filter((v) => v.status === 'moving' || v.status === 'returning').length;

  return (
    <header className="fixed top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[94vw] transition-all duration-300">
      {/* Compact Capsule */}
      <div 
        onClick={() => setIsExpanded(prev => !prev)}
        className="glass-panel px-3.5 py-1.5 rounded-full flex items-center gap-2.5 sm:gap-4 shadow-xl border cursor-pointer select-none transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] border-slate-200/90 dark:border-white/10"
      >
        {/* Hospital Monogram */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-600 to-cyan-500 text-white flex items-center justify-center shadow-xs">
            <Eye className="w-4 h-4" />
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-white leading-none">
              Sant Kabir Eye Hospital
            </span>
            <span className="text-[10px] text-sky-600 dark:text-cyan-400 font-semibold tracking-wider uppercase mt-0.5">
              PIECS Fleet Command
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Live Outreach Pill */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {movingCount} En Route
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="text-xs font-bold text-sky-700 dark:text-cyan-400 font-mono">
            {totalScreened} Screened
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden lg:inline">•</span>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono hidden lg:inline">
            {totalCataracts} Cataracts
          </span>
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />

        {/* Weather Tag */}
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <CloudSun className="w-3.5 h-3.5 text-amber-500" />
          <span>Basti 28°C</span>
        </div>

        {/* Time */}
        <div className="hidden sm:flex items-center font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
          {time}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
          {/* Traccar Setup Modal Button */}
          <button
            onClick={onOpenDriverModal}
            title="Traccar Smartphone Setup"
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
          </button>

          {/* Theme Switcher */}
          <button
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-sky-700" />}
          </button>

          {/* Chevron for expansion */}
          <button 
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Expanded Island Card (Dropdown overview) */}
      {isExpanded && (
        <div className="mt-2 glass-panel p-4 rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Outreach Eye Camp Live Summary
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Basti District, U.P.
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-800/40">
              <span className="text-[10px] text-sky-700 dark:text-sky-300 uppercase font-semibold block">Total Screened</span>
              <span className="text-lg font-extrabold text-sky-900 dark:text-sky-200 font-mono">{totalScreened}</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/40">
              <span className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-semibold block">PM-JAY Cataract</span>
              <span className="text-lg font-extrabold text-amber-900 dark:text-amber-200 font-mono">{totalCataracts}</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold block">Active Vans</span>
              <span className="text-lg font-extrabold text-emerald-900 dark:text-emerald-200 font-mono">{vehicles.length} Units</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-800/40">
              <span className="text-[10px] text-purple-700 dark:text-purple-300 uppercase font-semibold block">Eye Camps</span>
              <span className="text-lg font-extrabold text-purple-900 dark:text-purple-200 font-mono">{camps.length} Sites</span>
            </div>
          </div>

          {/* Quick Camp Badges */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {camps.map(c => (
              <div 
                key={c.id} 
                className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                <span className="font-medium">{c.name.replace(' Community Eye Camp', '').replace(' Rural Vision & Cataract Camp', '')}</span>
                <span className="font-bold text-sky-600 dark:text-cyan-400 font-mono">{c.currentScreened}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
