import React, { useState } from 'react';
import {
  Compass,
  Layers,
  Hospital,
  Ruler,
  Tv,
  Maximize2,
  Minimize2,
  Check,
  Sparkles,
  Plus,
  Minus,
  Scan
} from 'lucide-react';
import { useSpringPresence } from '../hooks/useSpringPresence';

export default function FloatingControls({
  activeStyleKey = 'light',
  onSelectStyle,
  onResetNorth,
  onCenterBase,
  onZoomIn,
  onZoomOut,
  onFitAll,
  showDistanceLines = true,
  onToggleDistanceLines,
  isAutoTour = false,
  onToggleAutoTour,
  isDemoMode = false,
  onToggleDemoMode,
}) {
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const flyout = useSpringPresence(isLayerMenuOpen, {
    fromScale: 0.94,
    fromX: 8,
    fromY: 0,
    transformOrigin: 'top right',
  });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const MAP_STYLES = [
    { key: 'light', name: 'Light Canvas', desc: 'Esri Light Gray' },
    { key: 'dark', name: 'Dark Canvas', desc: 'Esri Dark Gray' },
    { key: 'satellite', name: 'Satellite', desc: 'High-Res Aerial' },
    { key: 'streets', name: 'Highways & Streets', desc: 'World Street Map' },
  ];

  return (
    <div className="fixed top-[calc(0.75rem+var(--safe-top))] right-[calc(0.75rem+var(--safe-right))] z-30 pointer-events-auto flex flex-col items-end gap-2 max-h-[calc(100vh-1.5rem)] overflow-y-auto max-sm:top-auto max-sm:bottom-[calc(6rem+var(--safe-bottom))] max-sm:right-2 max-sm:w-[calc(100vw-1rem)] max-sm:flex-row max-sm:flex-wrap max-sm:items-end max-sm:justify-end max-sm:gap-1 max-sm:max-h-none max-sm:overflow-visible">
      {/* Primary Floating Apple Dock */}
      <div className="glass-panel p-1.5 rounded-2xl flex flex-col items-center gap-1.5 shadow-xl border border-slate-200/90 dark:border-white/10 max-sm:flex-row max-sm:flex-wrap max-sm:justify-end max-sm:gap-0.5">
        {/* Zoom In */}
        <button
          onClick={onZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom in"
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Plus className="w-4 h-4 text-slate-800 dark:text-white" />
        </button>

        {/* Zoom Out */}
        <button
          onClick={onZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom out"
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Minus className="w-4 h-4 text-slate-800 dark:text-white" />
        </button>

        {/* Fit Entire Fleet Overview */}
        <button
          onClick={onFitAll}
          title="Fit All Ambulances (Fleet Overview)"
          aria-label="Fit all ambulances in view"
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Scan className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
        </button>

        {/* Subtle Separator */}
        <div className="w-5 h-px bg-slate-200 dark:bg-slate-700/80 my-0.5 max-sm:w-px max-sm:h-5 max-sm:my-0 max-sm:mx-0.5" />

        {/* Compass (Reset North) */}
        <button
          onClick={onResetNorth}
          title="Reset Map to True North"
          aria-label="Reset map to true north"
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Compass className="w-5 h-5 text-sky-600 dark:text-cyan-400 group-hover:rotate-45 transition-transform" />
        </button>

        {/* Center Base Hospital */}
        <button
          onClick={onCenterBase}
          title="Focus Sant Kabir Hospital Base (Basti)"
          aria-label="Focus Sant Kabir Hospital base in Basti"
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <Hospital className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        </button>

        {/* Distance Range & Vector Lines Toggle */}
        <button
          onClick={onToggleDistanceLines}
          title={showDistanceLines ? "Hide Distance Vectors from Base" : "Show Distance Vectors from Base"}
          aria-label={showDistanceLines ? "Hide distance vectors from base" : "Show distance vectors from base"}
          aria-pressed={showDistanceLines}
          className={`touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            showDistanceLines
              ? 'bg-sky-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Ruler className="w-4 h-4" />
        </button>

        {/* Map Layers Switcher Button */}
        <div className="relative">
          <button
            onClick={() => setIsLayerMenuOpen(prev => !prev)}
            title="Map Style Switcher"
            aria-label="Open map style switcher"
            aria-expanded={isLayerMenuOpen}
            aria-haspopup="menu"
            className={`touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              isLayerMenuOpen
                ? 'bg-slate-200 dark:bg-slate-700 text-sky-600 dark:text-cyan-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Layer Flyout Menu */}
          {flyout.mounted && (
            <div
              role="menu"
              aria-label="Map basemap"
              className="absolute right-11 top-0 w-44 glass-panel p-1.5 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-white/10 flex flex-col gap-1 max-sm:right-0 max-sm:top-auto max-sm:bottom-12"
              style={flyout.style}
            >
              <span className="px-2 py-1 ui-section-label">
                Map Basemap
              </span>
              {MAP_STYLES.map((style) => (
                <button
                  key={style.key}
                  role="menuitemradio"
                  aria-checked={activeStyleKey === style.key}
                  onClick={() => {
                    onSelectStyle(style.key);
                    setIsLayerMenuOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    activeStyleKey === style.key
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="leading-tight">{style.name}</div>
                    <div className={`type-caption ${activeStyleKey === style.key ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {style.desc}
                    </div>
                  </div>
                  {activeStyleKey === style.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

      {/* Secondary Quick Utilities Dock */}
        <div className="h-px w-5 bg-slate-200 dark:bg-slate-700/80 my-0.5 max-sm:h-5 max-sm:w-px max-sm:my-0 max-sm:mx-0.5" />

        <div className="flex flex-col items-center gap-1 max-sm:flex-row max-sm:gap-0.5">
        {/* Demo Mode Toggle: 10 Simulated Cars vs Real GPS Clean Mode */}
        {onToggleDemoMode && (
          <button
            onClick={onToggleDemoMode}
            title={isDemoMode ? "Switch to Live Real GPS Only (Remove 10 Demo Cars)" : "Load 10 Demo Ambulances for UI Preview"}
            aria-label={isDemoMode ? "Switch to live GPS only" : "Load demo ambulances for UI preview"}
            aria-pressed={isDemoMode}
            className={`touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              isDemoMode
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/40'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}

        {/* TV Wallboard Auto-Tour */}
        <button
          onClick={onToggleAutoTour}
          title={isAutoTour ? "Stop TV Wallboard Auto-Tour" : "Start TV Wallboard Auto-Tour (Continuous Kiosk Monitoring)"}
          aria-label={isAutoTour ? "Stop TV wallboard auto-tour" : "Start TV wallboard auto-tour"}
          aria-pressed={isAutoTour}
          className={`touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
            isAutoTour
              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 ring-1 ring-inset ring-purple-500/40'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen Wallboard"
          aria-label="Toggle fullscreen wallboard"
          aria-pressed={isFullscreen}
          className="touch-target-sm ui-press w-10 h-10 max-sm:w-10 max-sm:h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        </div>
      </div>
    </div>
  );
}
