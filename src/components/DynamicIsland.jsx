import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Radio,
  ChevronDown,
  CheckCircle2,
  X,
  List,
} from 'lucide-react';
import { BASE_HOSPITAL } from '../data/mockData';
import { countFleetStates } from '../utils/fleetStatus';

const CONNECTION_META = {
  live: { label: 'Live telemetry', detail: 'WebSocket', dot: 'bg-emerald-500' },
  polling: { label: 'Polling fallback', detail: '10 s', dot: 'bg-amber-500' },
  offline: { label: 'Backend offline', detail: 'Retrying', dot: 'bg-rose-500' },
  demo: { label: 'Demo simulation', detail: 'Local', dot: 'bg-sky-500' },
  connecting: { label: 'Connecting', detail: '…', dot: 'bg-slate-400' },
};

function DynamicIsland({
  vehicles = [],
  theme = 'light',
  onToggleTheme,
  onOpenDriverModal,
  onOpenFleet,
  connectionState = 'connecting',
  arrivalAlert = null,
  onDismissArrivalAlert,
  onFocusArrival,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [time, setTime] = useState('');

  // Live IST clock
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

  const counts = countFleetStates(vehicles);
  const enRouteCount = counts.enRoute;
  const onSceneCount = counts.on_scene;
  const atBaseCount = counts.at_base;
  const signalGapCount = counts.no_signal;

  const connection = CONNECTION_META[connectionState] || CONNECTION_META.connecting;
  const fleetDot =
    connectionState === 'offline'
      ? 'bg-rose-500'
      : vehicles.length === 0
        ? 'bg-sky-500'
        : signalGapCount > 0
          ? 'bg-amber-500'
          : 'bg-emerald-500';

  const openFleet = () => {
    setIsExpanded(false);
    if (onOpenFleet) onOpenFleet();
  };

  return (
    <header className="fixed top-[calc(0.75rem+var(--safe-top))] left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[94vw]">
      <div className="relative flex flex-col items-center">
        {/* Light dismiss layer behind the popover */}
        {isExpanded && (
          <div
            className="fixed inset-0 z-0 cursor-default"
            aria-hidden="true"
            onClick={() => setIsExpanded(false)}
          />
        )}

        <div className="relative z-10 flex flex-col items-center">
          {arrivalAlert ? (
            <div className="glass-panel px-3 py-2 rounded-full flex items-center gap-3 shadow-lg border border-emerald-500/40 dark:border-emerald-400/40 bg-white/95 dark:bg-slate-950/95 animate-in zoom-in-95">
              <div className="relative flex items-center justify-center shrink-0">
                <span className="absolute w-7 h-7 rounded-full bg-emerald-500/20" />
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>

              <button
                type="button"
                onClick={onFocusArrival}
                className="flex flex-col text-left pr-1 cursor-pointer"
              >
                <span className="type-caption font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Field outreach update
                </span>
                <span className="type-subhead text-slate-900 dark:text-white mt-0.5">
                  {arrivalAlert.vehicleName}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    {' '}· {arrivalAlert.driverName || 'En route'}
                  </span>
                </span>
              </button>

              <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-800 pl-2">
                <button
                  type="button"
                  onClick={onFocusArrival}
                  className="ui-btn ui-btn-sm ui-btn-primary"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={onDismissArrivalAlert}
                  aria-label="Dismiss arrival alert"
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-full flex items-center shadow-lg border border-slate-200/90 dark:border-white/10 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
                aria-controls="fleet-summary-popover"
                className="flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-full text-left cursor-pointer transition-colors hover:bg-slate-500/5 dark:hover:bg-white/5"
              >
                <span
                  className={`ui-status-dot ${fleetDot}`}
                  aria-hidden="true"
                  title={connection.label}
                />
                <span className="flex flex-col justify-center leading-none">
                  <span className="type-footnote font-semibold tracking-tight text-slate-900 dark:text-white">
                    Sant Kabir Eye Hospital
                  </span>
                  <span className="type-caption text-slate-500 dark:text-slate-400 mt-1 font-medium tnum">
                    {vehicles.length === 0 ? (
                      connectionState === 'offline'
                        ? 'Offline · retrying'
                        : connectionState === 'connecting'
                          ? 'Connecting · checking fleet'
                          : 'Standby · telemetry ready'
                    ) : (
                      <>
                        <span className="text-slate-700 dark:text-slate-200 font-semibold">
                          {enRouteCount} en route
                        </span>
                        {onSceneCount > 0 && (
                          <>
                            <span className="mx-1 text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
                            <span className="hidden sm:inline">{onSceneCount} on scene</span>
                          </>
                        )}
                        {atBaseCount > 0 && (
                          <>
                            <span className="mx-1 text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
                            <span className="hidden sm:inline">{atBaseCount} at base</span>
                          </>
                        )}
                        {signalGapCount > 0 && (
                          <>
                            <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              {signalGapCount} no signal
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </span>
              </button>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block shrink-0" />
              <div className="hidden sm:flex items-center type-caption font-semibold text-slate-600 dark:text-slate-300 tabular-nums px-2.5">
                {time}
              </div>

              <div className="flex items-center gap-0.5 pr-1.5 pl-1 border-l border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={onOpenDriverModal}
                  aria-label="Open telemetry and tracker setup"
                  title="Live telemetry & tracker stream"
                  className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400" />
                </button>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 text-sky-700" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  aria-label={isExpanded ? 'Collapse fleet summary' : 'Expand fleet summary'}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
            </div>
          )}

          {isExpanded && (
            <div
              id="fleet-summary-popover"
              className="mt-2 w-[min(92vw,380px)] glass-panel p-3.5 rounded-[24px] border border-slate-200/90 dark:border-white/10 shadow-xl animate-in fade-in slide-in-from-top-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src="/avatar.png"
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0"
                    onError={(e) => {
                      e.target.src = 'https://avatars.githubusercontent.com/u/85608407?v=4';
                    }}
                  />
                  <div className="min-w-0">
                    <div className="type-subhead text-slate-900 dark:text-white truncate">
                      Fleet summary
                    </div>
                    <a
                      href={BASE_HOSPITAL.googleMapsUrl || 'https://maps.app.goo.gl/6eur1NCPRzC93sDG9'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="type-caption text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-cyan-400 inline-flex items-center gap-1"
                    >
                      Basti, UP · {BASE_HOSPITAL.lat?.toFixed(4)}° N, {BASE_HOSPITAL.lon?.toFixed(4)}° E
                      <span aria-hidden="true">↗</span>
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  aria-label="Close fleet summary"
                  className="p-1.5 -mr-1 -mt-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  { label: 'En route', value: enRouteCount, dot: 'bg-emerald-500' },
                  { label: 'On scene', value: onSceneCount, dot: 'bg-slate-400' },
                  { label: 'At base', value: atBaseCount, dot: 'bg-rose-500' },
                  { label: 'Fleet', value: vehicles.length, dot: 'bg-sky-500' },
                ].map((stat) => (
                  <div key={stat.label} className="ui-card-muted p-2.5">
                    <span className="type-caption uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                      <span className={`ui-status-dot ${stat.dot}`} aria-hidden="true" />
                      {stat.label}
                    </span>
                    <span className="type-title2 block mt-1.5 text-slate-900 dark:text-white tnum">
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="ui-card-muted mt-2 p-2.5 flex items-center justify-between gap-3">
                <span className="type-footnote text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <span className={`ui-status-dot ${connection.dot}`} aria-hidden="true" />
                  {connection.label}
                </span>
                <span className="type-caption text-slate-500 dark:text-slate-400 tnum">
                  {connection.detail}
                </span>
              </div>

              {signalGapCount > 0 && (
                <div className="mt-2 rounded-[14px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 type-footnote font-medium text-amber-700 dark:text-amber-300">
                  {signalGapCount} ambulance{signalGapCount > 1 ? 's' : ''} without a recent GPS fix.
                </div>
              )}

              <button
                type="button"
                onClick={openFleet}
                className="ui-btn ui-btn-secondary w-full mt-2.5"
              >
                <List className="w-4 h-4" />
                Open fleet list
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default React.memo(DynamicIsland);
