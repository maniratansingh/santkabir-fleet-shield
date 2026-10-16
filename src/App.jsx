import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import { BASE_HOSPITAL } from './data/mockData';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [detent, setDetent] = useState('half'); // 'peek', 'half', 'full'
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [actionTrigger, setActionTrigger] = useState(null);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [toast, setToast] = useState(null);

  // Theme Management (Light mode default for clinical Apple aesthetic)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sk_theme');
      if (saved) return saved;
      return 'light';
    }
    return 'light';
  });

  const [activeStyleKey, setActiveStyleKey] = useState(theme === 'dark' ? 'dark' : 'light');

  // Synchronize <html> class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sk_theme', theme);
    if (activeStyleKey === 'light' || activeStyleKey === 'dark') {
      setActiveStyleKey(theme === 'dark' ? 'dark' : 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const tourIndexRef = useRef(0);
  const vehiclesRef = useRef(vehicles);
  useEffect(() => {
    vehiclesRef.current = vehicles;
  }, [vehicles]);

  // Show temporary toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Keyboard shortcut listener (ESC to deselect)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedVehicleId(null);
        setIsDriverModalOpen(false);
        setIsAutoTour(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // TV Kiosk Auto-Tour Mode (Continuous monitoring: cycles focus across active fleet or frames base hospital)
  useEffect(() => {
    if (!isAutoTour) return;

    const tourInterval = setInterval(() => {
      const currentVehicles = vehiclesRef.current || [];
      if (!currentVehicles || currentVehicles.length === 0) {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('📺 TV Auto-Tour: Hospital Base Standby (0 reporting)', 'info');
        return;
      }

      const tourItems = [
        ...currentVehicles.map(v => ({ type: 'vehicle', id: v.id, name: v.name, driver: v.driverName })),
        { type: 'all', name: 'Fleet Overview' },
      ];

      tourIndexRef.current = (tourIndexRef.current + 1) % tourItems.length;
      const current = tourItems[tourIndexRef.current];

      if (current.type === 'vehicle') {
        setSelectedVehicleId(current.id);
        setDetent('peek'); // keep UI minimal during TV auto-tour
        showToast(`📺 TV Auto-Tour: Focusing ${current.name} (${current.driver || 'Driver'})`, 'info');
      } else {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('📺 TV Auto-Tour: Basti District Overview', 'info');
      }
    }, 12000);

    return () => clearInterval(tourInterval);
  }, [isAutoTour]);

  // Fetch real data from Cloudflare Pages API
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const vehRes = await fetch('/api/vehicles').catch(() => null);
        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          const list = Array.isArray(vehData) ? vehData : (vehData.vehicles || []);
          const prev = vehiclesRef.current || [];
          const hasChanged = prev.length !== list.length || 
            list.some((v, idx) => {
              const p = prev[idx];
              return !p || p.id !== v.id || p.lat !== v.lat || p.lon !== v.lon || p.speed !== v.speed || p.status !== v.status;
            });
          if (hasChanged) {
            setVehicles(list);
          }
        }
      } catch (err) {
        console.warn('Backend API not reachable (standby mode):', err);
      }
    };

    fetchRealData();
    const interval = setInterval(fetchRealData, 3000);
    return () => clearInterval(interval);
  }, []);

  // Action Triggers
  const handleResetNorth = () => {
    setActionTrigger({ type: 'resetNorth', timestamp: Date.now() });
    showToast('Compass oriented to True North (0°)', 'info');
  };

  const handleCenterBase = () => {
    setSelectedVehicleId(null);
    setFitTrigger(prev => prev + 1);
    showToast('Camera centered on Sant Kabir Eye Hospital Base', 'info');
  };

  const handleToggleAutoTour = () => {
    setIsAutoTour(prev => {
      const next = !prev;
      showToast(next ? '📺 TV Wallboard Auto-Tour Started' : 'TV Auto-Tour Stopped', 'info');
      return next;
    });
  };

  // Apple Sheet Action Handlers
  const handleFocusRoute = () => {
    if (selectedVehicleId) {
      setFitTrigger(prev => prev + 1);
      showToast('Highway Route Trail Focused', 'info');
    }
  };

  const handleFocusDistance = () => {
    setShowDistanceLines(true);
    showToast('Road Highway Distances Highlighted', 'info');
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 select-none">
      {/* 1. Full-Bleed Edge-to-Edge Map Canvas */}
      <MapView
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        fitTrigger={fitTrigger}
        actionTrigger={actionTrigger}
        theme={theme}
        activeStyleKey={activeStyleKey}
        onStyleChange={setActiveStyleKey}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={() => setShowDistanceLines(prev => !prev)}
        onResetView={() => setFitTrigger(prev => prev + 1)}
      />

      {/* 2. Top-Center Dynamic Island Status Capsule */}
      <DynamicIsland
        vehicles={vehicles}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenDriverModal={() => setIsDriverModalOpen(true)}
      />

      {/* 3. Top-Right Floating Controls Stack */}
      <FloatingControls
        activeStyleKey={activeStyleKey}
        onSelectStyle={setActiveStyleKey}
        onResetNorth={handleResetNorth}
        onCenterBase={handleCenterBase}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={() => setShowDistanceLines(prev => !prev)}
        isAutoTour={isAutoTour}
        onToggleAutoTour={handleToggleAutoTour}
      />

      {/* 4. Bottom-Left Floating Apple Sheet */}
      <AppleSheet
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        onFocusRoute={handleFocusRoute}
        onFocusDistance={handleFocusDistance}
        detent={detent}
        onChangeDetent={setDetent}
      />

      {/* 5. Dynamic Island Toast Notifications */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 glass-panel px-4 py-2 rounded-full border border-sky-400/60 dark:border-cyan-400/60 flex items-center gap-2.5 shadow-2xl animate-in slide-in-from-top duration-300 max-w-[90vw]">
          {toast.type === 'alert' ? (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-900 dark:text-white">{toast.message}</span>
          <button 
            onClick={() => setToast(null)}
            className="p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 6. Sant Kabir Fleet Shield Driver Provisioning Modal (by Mani Ratan Singh) */}
      <DriverSetupModal 
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
      />
    </div>
  );
}
