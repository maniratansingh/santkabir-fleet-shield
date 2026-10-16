import React, { useState, useEffect } from 'react';
import { 
  Eye, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Smartphone, 
  Crosshair, 
  Sparkles, 
  PanelRightClose, 
  PanelRightOpen, 
  Sun, 
  Moon,
  RotateCw 
} from 'lucide-react';

export default function Header({ 
  vehicles, 
  camps, 
  onFitMap, 
  isSimulation, 
  onToggleSimulation, 
  soundEnabled, 
  onToggleSound, 
  onOpenDriverModal, 
  isSidebarOpen, 
  onToggleSidebar, 
  isAutoTour, 
  onToggleAutoTour,
  theme,
  onToggleTheme
}) {
  const [time, setTime] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.log(e));
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(e => console.log(e));
        setIsFullscreen(false);
      }
    }
  };

  const totalScreened = camps.reduce((sum, c) => sum + (c.currentScreened || 0), 0);
  const totalCataracts = camps.reduce((sum, c) => sum + (c.cataractIdentified || 0), 0);
  const movingCount = vehicles.filter(v => v.status === 'moving' || v.status === 'returning').length;
  const isDark = theme === 'dark';

  return (
    <header className="glass-panel border-b border-slate-200/90 dark:border-cyan-500/20 px-3 md:px-4 py-2 flex items-center justify-between z-30 relative select-none">
      {/* Hospital Identity */}
      <div className="flex items-center gap-2.5 md:gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20 ring-1 ring-white/30 shrink-0">
          <Eye className="w-5 h-5 md:w-6 md:h-6 text-white" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>
        <div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <h1 className="text-base md:text-xl font-bold tracking-tight text-slate-900 dark:text-white font-['Outfit'] truncate">
              Sant Kabir Eye Hospital
            </h1>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] md:text-[11px] font-semibold rounded bg-sky-50 text-sky-700 border border-sky-200 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-500/30">
              PIECS OUTREACH
            </span>
          </div>
          <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
            <span>Basti (U.P.)</span>
            <span className="text-slate-400 dark:text-slate-600">•</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Eye Camp Fleet Command
            </span>
          </p>
        </div>
      </div>

      {/* Hospital Impact Metrics (Large Screen Optimized) */}
      <div className="hidden xl:flex items-center gap-2.5">
        <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-700/50 flex items-center gap-2.5 shadow-xs">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">Outreach Fleet</span>
            <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span className="text-sky-600 dark:text-cyan-400">{vehicles.length} Units</span>
              <span className="text-slate-500 dark:text-slate-400 font-normal text-xs">({movingCount} en route)</span>
            </span>
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-700/50 flex items-center gap-2.5 shadow-xs">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">Active Camps</span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {camps.length} Locations
            </span>
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-700/50 flex items-center gap-2.5 shadow-xs">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider">Patients Screened</span>
            <span className="text-sm font-bold text-sky-700 dark:text-sky-400">
              {totalScreened} <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">checked</span>
            </span>
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-amber-50/90 border border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-500/30 flex items-center gap-2.5 shadow-xs">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-semibold text-amber-700/80 dark:text-amber-300/80 tracking-wider">Cataract Identified</span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
              {totalCataracts} <span className="text-xs text-amber-700/70 dark:text-amber-200/70 font-normal">PM-JAY</span>
            </span>
          </div>
        </div>

        {/* Live Weather / Field Conditions Pill */}
        <div className="px-3 py-1.5 rounded-xl bg-slate-100/60 border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
          <Sun className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">Basti Weather</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">28°C • Clear Field</span>
          </div>
        </div>
      </div>

      {/* Control Actions & Clock */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Time display */}
        <div className="hidden sm:flex flex-col items-end px-2.5 py-1 bg-slate-100/90 border border-slate-200 rounded-lg dark:bg-slate-900/70 dark:border-slate-700/50">
          <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-medium">IST</span>
          <span className="text-xs font-mono font-bold text-sky-700 dark:text-cyan-300">{time}</span>
        </div>

        {/* Light / Dark Mode Toggle */}
        <button
          onClick={onToggleTheme}
          title={isDark ? "Switch to Clean Light Mode" : "Switch to Ambient Dark Mode"}
          className="p-1.5 md:p-2 rounded-lg border transition-all cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700 shadow-xs"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-700" />
          )}
        </button>

        {/* Fleet Shield Phone App Setup Button */}
        <button
          onClick={onOpenDriverModal}
          title="Connect driver phones using Sant Kabir Fleet Shield"
          className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-lg shadow-sm border border-sky-400/30 transition-all cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden md:inline font-semibold">Fleet Shield</span>
        </button>

        {/* Demo Simulation Toggle */}
        <button
          onClick={onToggleSimulation}
          title={isSimulation ? "Switch to Live Server Mode" : "Start Live Vehicle Simulator Demo"}
          className={`flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
            isSimulation 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 hover:opacity-90' 
              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-spin shrink-0" style={{ animationDuration: '6s' }} />
          <span className="hidden lg:inline">{isSimulation ? 'Sim Moving' : 'Run Demo'}</span>
        </button>

        {/* TV Auto-Tour Mode Toggle */}
        <button
          onClick={onToggleAutoTour}
          title={isAutoTour ? "Stop TV Auto-Tour Mode" : "Start TV Auto-Tour (Cycles between fleet & camps every 10s)"}
          className={`p-1.5 md:p-2 rounded-lg border transition-colors cursor-pointer ${
            isAutoTour
              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700'
          }`}
        >
          <RotateCw className={`w-4 h-4 ${isAutoTour ? 'animate-spin text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`} style={{ animationDuration: '4s' }} />
        </button>

        {/* Re-center Map button */}
        <button
          onClick={onFitMap}
          title="Fit All Vehicles & Camps on Screen"
          className="p-1.5 md:p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <Crosshair className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
        </button>

        {/* Sound toggle */}
        <button
          onClick={onToggleSound}
          title={soundEnabled ? "Mute Arrival Chimes" : "Enable Arrival Chimes"}
          className="p-1.5 md:p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          )}
        </button>

        {/* TV Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen TV Kiosk Mode"
          className="p-1.5 md:p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:text-slate-300 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-sky-700 dark:text-cyan-300" />
          ) : (
            <Maximize2 className="w-4 h-4 text-sky-700 dark:text-cyan-300" />
          )}
        </button>

        {/* Fleet Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          title={isSidebarOpen ? "Collapse Fleet Sidebar" : "Open Fleet Sidebar"}
          className={`p-1.5 md:p-2 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
            isSidebarOpen 
              ? 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-cyan-950/80 dark:text-cyan-300 dark:border-cyan-500/40' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700'
          }`}
        >
          {isSidebarOpen ? (
            <PanelRightClose className="w-4 h-4 text-sky-600 dark:text-cyan-400" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          )}
          <span className="lg:hidden text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-cyan-500/30 dark:text-cyan-300 px-1 rounded">
            {vehicles.length}
          </span>
        </button>
      </div>
    </header>
  );
}
