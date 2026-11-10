import React, { useState } from 'react';
import {
  Map,
  List,
  AlertTriangle,
  MoreHorizontal,
  X,
  Layers,
  Sparkles,
  Tv,
  Maximize2,
  Minimize2,
  Ruler,
  Scan,
  Hospital,
  Compass,
} from 'lucide-react';

const MAP_STYLES = [
  { key: 'light', name: 'Light' },
  { key: 'dark', name: 'Dark' },
  { key: 'satellite', name: 'Satellite' },
  { key: 'streets', name: 'Streets' },
];

export default function MobileNav({
  vehicleCount = 0,
  onOpenMap,
  onOpenFleet,
  onOpenAlerts,
  onFitAll,
  onCenterBase,
  onResetNorth,
  showDistanceLines = true,
  onToggleDistanceLines,
  activeStyleKey = 'dark',
  onSelectStyle,
  isDemoMode = false,
  onToggleDemoMode,
  isAutoTour = false,
  onToggleAutoTour,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const closeMore = () => setMoreOpen(false);
  const run = (fn) => {
    closeMore();
    fn?.();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const navButton = 'min-h-12 flex flex-col items-center justify-center gap-0.5 rounded-[14px] text-[0.625rem] font-semibold transition-colors cursor-pointer active:scale-95';

  return (
    <>
      <nav
        className="sm:hidden fixed inset-x-0 bottom-0 z-40 pointer-events-auto px-3 pb-[calc(0.5rem+var(--safe-bottom))] pt-1.5"
        aria-label="Mobile navigation"
      >
        <div className="glass-panel rounded-[20px] border border-slate-200/90 dark:border-white/10 shadow-xl grid grid-cols-4 gap-0.5 p-1">
          <button type="button" onClick={() => run(onOpenMap)} className={`${navButton} text-slate-600 dark:text-slate-300`} aria-label="Show map">
            <Map className="w-4 h-4" />
            <span>Map</span>
          </button>
          <button type="button" onClick={() => run(onOpenFleet)} className={`${navButton} text-slate-600 dark:text-slate-300 relative`} aria-label="Open fleet list">
            <List className="w-4 h-4" />
            <span>Fleet</span>
            {vehicleCount > 0 && (
              <span className="absolute top-1 right-3 min-w-3.5 h-3.5 px-1 rounded-full bg-sky-600 text-white text-[0.5625rem] font-mono flex items-center justify-center">
                {vehicleCount}
              </span>
            )}
          </button>
          <button type="button" onClick={() => run(onOpenAlerts)} className={`${navButton} text-slate-600 dark:text-slate-300`} aria-label="Show fleet alerts">
            <AlertTriangle className="w-4 h-4" />
            <span>Alerts</span>
          </button>
          <button
            type="button"
            onClick={() => { onOpenMap?.(); setMoreOpen((v) => !v); }}
            className={`${navButton} ${moreOpen ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-cyan-300' : 'text-slate-600 dark:text-slate-300'}`}
            aria-label="More map controls"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {moreOpen && (
        <>
          <div className="sm:hidden fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm" onClick={closeMore} aria-hidden="true" />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="More map controls"
            className="sm:hidden fixed inset-x-2 bottom-[calc(5.1rem+var(--safe-bottom))] z-50 glass-panel rounded-[24px] border border-slate-200/90 dark:border-white/10 shadow-2xl p-3.5 max-h-[72vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h2 className="type-subhead text-slate-900 dark:text-white">Map controls</h2>
                <p className="type-caption text-slate-500 dark:text-slate-400">Layers, tour and map tools</p>
              </div>
              <button type="button" onClick={closeMore} aria-label="Close map controls" className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="ui-section-label mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Map style</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {MAP_STYLES.map((style) => (
                <button
                  key={style.key}
                  type="button"
                  onClick={() => onSelectStyle?.(style.key)}
                  className={`min-h-10 rounded-xl text-[0.625rem] font-semibold border transition-colors ${
                    activeStyleKey === style.key
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <button
                type="button"
                onClick={() => onToggleDemoMode?.()}
                className={`min-h-11 rounded-xl text-[0.625rem] font-semibold border flex flex-col items-center justify-center gap-0.5 ${
                  isDemoMode
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                {isDemoMode ? 'Demo on' : 'Demo'}
              </button>
              <button
                type="button"
                onClick={() => onToggleAutoTour?.()}
                className={`min-h-11 rounded-xl text-[0.625rem] font-semibold border flex flex-col items-center justify-center gap-0.5 ${
                  isAutoTour
                    ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Tv className="w-4 h-4" />
                {isAutoTour ? 'Tour on' : 'Tour'}
              </button>
              <button
                type="button"
                onClick={() => onToggleDistanceLines?.()}
                className={`min-h-11 rounded-xl text-[0.625rem] font-semibold border flex flex-col items-center justify-center gap-0.5 ${
                  showDistanceLines
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Ruler className="w-4 h-4" />
                Routes
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => run(onFitAll)} className="min-h-11 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[0.6875rem] font-bold flex items-center justify-center gap-1.5">
                <Scan className="w-4 h-4" /> Fit all
              </button>
              <button type="button" onClick={() => run(onCenterBase)} className="min-h-11 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-[0.6875rem] font-semibold flex items-center justify-center gap-1.5">
                <Hospital className="w-4 h-4 text-rose-500" /> Base
              </button>
              <button type="button" onClick={() => run(onResetNorth)} className="min-h-11 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-[0.6875rem] font-semibold flex items-center justify-center gap-1.5">
                <Compass className="w-4 h-4 text-sky-600 dark:text-cyan-400" /> North
              </button>
              <button type="button" onClick={toggleFullscreen} className="min-h-11 rounded-xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 text-[0.6875rem] font-semibold flex items-center justify-center gap-1.5">
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {isFullscreen ? 'Exit' : 'Fullscreen'}
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
