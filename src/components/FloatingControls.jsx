import React, { useState } from 'react';
import { 
  Compass, 
  Layers, 
  Hospital, 
  Ruler, 
  Tv, 
  Maximize2, 
  Minimize2,
  Check
} from 'lucide-react';

export default function FloatingControls({
  activeStyleKey = 'light',
  onSelectStyle,
  onResetNorth,
  onCenterBase,
  showDistanceLines = true,
  onToggleDistanceLines,
  isAutoTour = false,
  onToggleAutoTour,
}) {
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    <div className="fixed top-3 right-3 z-30 pointer-events-auto flex flex-col items-end gap-2">
      {/* Primary Floating Apple Dock */}
      <div className="glass-panel p-1 rounded-2xl flex flex-col items-center gap-1 shadow-xl border border-slate-200/90 dark:border-white/10">
        {/* Compass (Reset North) */}
        <button
          onClick={onResetNorth}
          title="Reset Map to True North"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
        >
          <Compass className="w-5 h-5 text-sky-600 dark:text-cyan-400 group-hover:rotate-45 transition-transform" />
        </button>

        {/* Center Base Hospital */}
        <button
          onClick={onCenterBase}
          title="Focus Base Hospital (Basti)"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Hospital className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </button>

        {/* Distance Range & Vector Lines Toggle */}
        <button
          onClick={onToggleDistanceLines}
          title={showDistanceLines ? "Hide Distance Vectors from Base" : "Show Distance Vectors from Base"}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
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
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              isLayerMenuOpen 
                ? 'bg-slate-200 dark:bg-slate-700 text-sky-600 dark:text-cyan-400' 
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Layer Flyout Menu */}
          {isLayerMenuOpen && (
            <div className="absolute right-11 top-0 w-44 glass-panel p-1.5 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-white/10 flex flex-col gap-1 animate-in fade-in slide-in-from-right-2 duration-150">
              <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Map Basemap
              </span>
              {MAP_STYLES.map((style) => (
                <button
                  key={style.key}
                  onClick={() => {
                    onSelectStyle(style.key);
                    setIsLayerMenuOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-xl text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                    activeStyleKey === style.key
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div>
                    <div className="leading-tight">{style.name}</div>
                    <div className={`text-[10px] ${activeStyleKey === style.key ? 'text-sky-100' : 'text-slate-400'}`}>
                      {style.desc}
                    </div>
                  </div>
                  {activeStyleKey === style.key && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Secondary Quick Utilities Dock */}
      <div className="glass-panel p-1 rounded-2xl flex flex-col items-center gap-1 shadow-lg border border-slate-200/90 dark:border-white/10">
        {/* TV Wallboard Auto-Tour */}
        <button
          onClick={onToggleAutoTour}
          title={isAutoTour ? "Stop TV Wallboard Auto-Tour" : "Start TV Wallboard Auto-Tour (Continuous Kiosk Monitoring)"}
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
            isAutoTour 
              ? 'bg-purple-600 text-white shadow-xs' 
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen Wallboard"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
