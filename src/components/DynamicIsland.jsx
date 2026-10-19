import React, { useState, useEffect } from 'react';
import { Sun, Moon, Radio, ChevronDown, CheckCircle2, Activity, X, Navigation, Ambulance } from 'lucide-react';
import { BASE_HOSPITAL } from '../data/mockData';

function DynamicIsland({
  vehicles = [],
  theme = 'light',
  onToggleTheme,
  onOpenDriverModal,
  arrivalAlert = null,
  onDismissArrivalAlert,
  onFocusArrival,
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

  // Aggregated Fleet Status with Signal Gap Tracking
  const movingCount = vehicles.filter((v) => !v.isSignalGap && (v.status === 'moving' || v.status === 'returning')).length;
  const inFieldCount = vehicles.filter((v) => !v.isSignalGap && v.status === 'in_field').length;
  const signalGapCount = vehicles.filter((v) => v.isSignalGap).length;

  return (
    <header className="fixed top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[94vw] transition-all duration-300">
      {/* If Alert is active: Apple Dynamic Island Live Activity Sonar Capsule */}
      {arrivalAlert ? (
        <div 
          onClick={onFocusArrival}
          className="glass-panel px-4 py-2 rounded-full flex items-center gap-3 shadow-2xl border cursor-pointer select-none transition-all duration-300 animate-in zoom-in-95 border-emerald-500/60 dark:border-emerald-400/60 bg-white/95 dark:bg-slate-950/95"
        >
          {/* Sonar Radar Wave Icon */}
          <div className="relative flex items-center justify-center shrink-0">
            <span className="absolute w-7 h-7 rounded-full bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.4)]"></span>
            <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          {/* Alert Message */}
          <div className="flex flex-col pr-1">
            <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400 leading-none">
              Field Outreach Update
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight mt-0.5">
              {arrivalAlert.vehicleName} • Driver: {arrivalAlert.driverName || 'En Route'}
            </span>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onFocusArrival) onFocusArrival();
              }}
              className="px-2.5 py-1 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <span>View</span>
              <span className="text-[10px]">↗</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDismissArrivalAlert) onDismissArrivalAlert();
              }}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Normal Compact Dynamic Island Capsule */
        <div 
          onClick={() => setIsExpanded(prev => !prev)}
          className="glass-panel px-3.5 py-1.5 rounded-full flex items-center gap-2.5 sm:gap-3.5 shadow-xl border cursor-pointer select-none transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] border-slate-200/90 dark:border-white/10 whitespace-nowrap"
        >
          {/* Developer Logo Avatar */}
          <div className="flex items-center gap-2 shrink-0">
            <img 
              src="/avatar.png" 
              alt="Mani Ratan Singh" 
              className="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-white/10 shadow-xs shrink-0"
              onError={(e) => { e.target.src = 'https://avatars.githubusercontent.com/u/85608407?v=4'; }}
            />
            <div className="hidden lg:flex flex-col">
              <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                Sant Kabir Eye Hospital
              </span>
              <span className="text-[10px] text-sky-600 dark:text-cyan-400 font-semibold tracking-wider uppercase mt-0.5">
                Fleet Command
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block shrink-0" />

          {/* Live Fleet Status Pill (Steady Aura, Zero Blink) */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={`relative inline-flex rounded-full h-2 w-2 shadow-[0_0_8px_rgba(16,185,129,0.6)] ${
                vehicles.length === 0 ? 'bg-sky-500' : (signalGapCount > 0 ? 'bg-amber-500' : 'bg-emerald-500')
              }`}></span>
            </span>
            {vehicles.length === 0 ? (
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                Hospital Standby • Telemetry Ready
              </span>
            ) : (
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {movingCount} En Route
                </span>
                {signalGapCount > 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span className="text-xs font-bold text-amber-500 dark:text-amber-400 flex items-center gap-1">
                      <span>⏳</span>
                      <span>{signalGapCount} Blind Spot</span>
                    </span>
                  </>
                )}
                {inFieldCount > 0 && signalGapCount === 0 && (
                  <>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span className="text-xs font-medium text-sky-600 dark:text-cyan-400">
                      {inFieldCount} In Field
                    </span>
                  </>
                )}
                <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hidden sm:inline">
                  {vehicles.length} Active Fleet
                </span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Time */}
          <div className="hidden sm:flex items-center font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
            {time}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            {/* Live Telemetry & Tracker Stream (by Mani Ratan Singh) */}
            <button
              onClick={onOpenDriverModal}
              title="Live Telemetry & Tracker Stream"
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
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
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Expanded Island Card (Clean Fleet Summary) */}
      {isExpanded && (
        <div className="mt-2 glass-panel p-4 rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Hospital Outreach Fleet Summary
              </span>
            </div>
            <a 
              href={BASE_HOSPITAL.googleMapsUrl || 'https://maps.app.goo.gl/6eur1NCPRzC93sDG9'} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-sky-600 dark:text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Base: {BASE_HOSPITAL.lat?.toFixed(4)}° N, {BASE_HOSPITAL.lon?.toFixed(4)}° E</span>
              <span>↗</span>
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
            <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold block">En Route</span>
              <span className="text-lg font-extrabold text-emerald-900 dark:text-emerald-200 font-mono">{movingCount} Active</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-800/40">
              <span className="text-[10px] text-sky-700 dark:text-sky-300 uppercase font-semibold block">In Field</span>
              <span className="text-lg font-extrabold text-sky-900 dark:text-sky-200 font-mono">{inFieldCount} On Site</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/40">
              <span className="text-[10px] text-indigo-700 dark:text-indigo-300 uppercase font-semibold block">Active Fleet</span>
              <span className="text-lg font-extrabold text-indigo-900 dark:text-indigo-200 font-mono">{vehicles.length} Ambulances</span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-600 dark:text-slate-400 uppercase font-semibold block">District</span>
              <span className="text-sm font-bold text-slate-800 dark:text-white mt-1 block">Basti, UP</span>
            </div>
          </div>

          {/* Deployed Field Units & Personnel List */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Active Ambulances, Drivers & Camp Organizers
            </div>
            {vehicles.length === 0 ? (
              <div className="p-3 text-center rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                Hospital base on standby. Live telemetry will display here automatically when drivers launch the app.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {vehicles.map(v => (
                  <div 
                    key={v.id} 
                    className="p-2 rounded-2xl bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${v.status === 'moving' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {v.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                        Driver: <strong className="text-slate-800 dark:text-white">{v.driverName}</strong>
                        {v.organizerName && <span> • Org: {v.organizerName}</span>}
                      </div>
                      <div className="text-[9.5px] font-mono text-slate-400">
                        {Number(v.lat || 0).toFixed(4)}° N, {Number(v.lon || 0).toFixed(4)}° E
                      </div>
                    </div>

                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-cyan-400 text-[10px] font-bold hover:bg-sky-100 transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <span>Maps</span>
                      <span>↗</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default React.memo(DynamicIsland);
