import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import ProvisioningQrModal from './components/ProvisioningQrModal';
import { BASE_HOSPITAL, INITIAL_VEHICLES } from './data/mockData';
import { getDeliveryRouteSplit, subscribeToRouteUpdates } from './utils/roadDistance';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {

  // Live Clean Mode by default: 0 mock cars. Only real reporting GPS ambulances.
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [provisionModalVehicleId, setProvisionModalVehicleId] = useState(null);
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

const FLEET_COLORS = [
  { line: '#007AFF', glow: '#38BDF8' },
  { line: '#10B981', glow: '#34D399' },
  { line: '#F59E0B', glow: '#FBBF24' },
  { line: '#8B5CF6', glow: '#A78BFA' },
  { line: '#EC4899', glow: '#F472B6' },
  { line: '#06B6D4', glow: '#22D3EE' },
  { line: '#14B8A6', glow: '#2DD4BF' },
];

function getDynamicColor(id = '') {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  return FLEET_COLORS[Math.abs(hash) % FLEET_COLORS.length];
}

  // Fetch real data from Cloudflare Pages API
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const vehRes = await fetch('/api/vehicles').catch(() => null);
        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          const liveList = Array.isArray(vehData) ? vehData : (vehData.vehicles || []);
          if (liveList.length > 0) {
            setVehicles(prevVehicles => {
              const liveMap = new Map(liveList.map(v => [v.id, v]));
              
              // 1. Update existing vehicles that have live updates
              const updated = prevVehicles.map(v => {
                if (liveMap.has(v.id)) {
                  const liveV = liveMap.get(v.id);
                  liveMap.delete(v.id);
                  const split = getDeliveryRouteSplit({ ...v, ...liveV });
                  return {
                    ...v,
                    ...liveV,
                    isLive: true,
                    routeWaypoints: v.routeWaypoints || liveV.routeWaypoints,
                    highwayName: liveV.highwayName || split.corridorName || v.highwayName,
                    roadDistFromBaseKm: split.roadDistFromBaseKm,
                  };
                }
                return v;
              });

              // 2. Prepend any new identifiers (e.g. arbitrary identifiers sent from Traccar)
              const newlyAdded = Array.from(liveMap.values()).map(v => {
                const colors = getDynamicColor(v.id);
                const split = getDeliveryRouteSplit(v);
                return {
                  ...v,
                  isLive: true,
                  lineColor: v.lineColor || colors.line,
                  glowColor: v.glowColor || colors.glow,
                  highwayName: v.highwayName || split.corridorName || 'Uttar Pradesh Regional Corridor',
                  roadDistFromBaseKm: split.roadDistFromBaseKm,
                  driverName: v.driverName || 'Assigned Driver',
                };
              });

              return [...newlyAdded, ...updated];
            });
          }
        }
      } catch (err) {
        console.warn('Backend API not reachable (standby mode):', err);
      }
    };

    fetchRealData();
    const interval = setInterval(fetchRealData, 2500);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to background-resolved rural turn-by-turn routes (OSM)
  useEffect(() => {
    const unsubscribe = subscribeToRouteUpdates((key, coords) => {
      setVehicles(prevVehicles =>
        prevVehicles.map(v => {
          const vKey = `${Number(v.lon || 0).toFixed(3)},${Number(v.lat || 0).toFixed(3)}`;
          if (vKey === key) {
            const split = getDeliveryRouteSplit({ ...v, routeWaypoints: coords });
            return {
              ...v,
              routeWaypoints: coords,
              highwayName: 'Turn-by-Turn Rural Road Network (OSM)',
              roadDistFromBaseKm: split.roadDistFromBaseKm,
            };
          }
          return v;
        })
      );
    });
    return unsubscribe;
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

  const handleToggleDemoMode = () => {
    setIsDemoMode(prev => {
      const next = !prev;
      setVehicles(next ? INITIAL_VEHICLES : []);
      showToast(next ? '⚡ Demo Mode: Loaded 35 Simulated Ambulances' : '🧹 Live Clean Mode: Real GPS Only (0 active)', 'info');
      return next;
    });
  };

  // Apple Sheet Action Handlers
  const handleLocateVehicle = () => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'locateVehicle', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Camera focused on Vehicle GPS position', 'info');
    }
  };

  const handleFitRoute = () => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'fitRoute', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Framing Full UP Highway Corridor to Base Hospital', 'info');
    }
  };

  const handleFocusRoute = () => {
    handleFitRoute();
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
        onOpenDriverModal={() => setProvisionModalVehicleId('AMB-01')}
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
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* 4. Bottom-Left Floating Apple Sheet */}
      <AppleSheet
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        onFocusRoute={handleFocusRoute}
        onLocateVehicle={handleLocateVehicle}
        onFitRoute={handleFitRoute}
        onFocusDistance={handleFocusDistance}
        onOpenProvisionModal={(id) => setProvisionModalVehicleId(id || 'AMB-01')}
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

      {/* 6. Android Provisioning Center Modal (Master Integration Spec) */}
      <ProvisioningQrModal
        isOpen={Boolean(provisionModalVehicleId)}
        onClose={() => setProvisionModalVehicleId(null)}
        initialVehicleId={provisionModalVehicleId}
        availableVehicles={vehicles}
      />

      {/* 7. Live Telemetry & Tracker Stream Modal */}
      <DriverSetupModal 
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
      />
    </div>
  );
}
