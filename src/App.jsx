import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import ProvisioningQrModal from './components/ProvisioningQrModal';
import { BASE_HOSPITAL } from './data/mockData';
import { ACTIVE_FLEET } from './data/activeFleet';
import { simulateFleetAtTime } from './utils/fleetSimulation';
import { getDeliveryRouteSplit, subscribeToRouteUpdates } from './utils/roadDistance';
import { getNearestRuralLocation } from './utils/ruralLocator';
import { getUniqueVehicleColor } from './utils/colors';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {

  // Default to dev simulation on localhost so the user sees live movement in their Chrome tab immediately;
  // On deployed production site, defaults to clean live telemetry mode (0 cars, blank sheet).
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('live')) return false;
      if (params.has('dev') || params.has('demo')) return true;
      return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }
    return false;
  });

  const [vehicles, setVehicles] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if ((isLocal || params.has('dev') || params.has('demo')) && !params.has('live')) {
        return simulateFleetAtTime(ACTIVE_FLEET, Date.now());
      }
    }
    return [];
  });

  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [provisionModalVehicleId, setProvisionModalVehicleId] = useState(null);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [detent, setDetent] = useState('half'); // 'peek', 'half', 'full'
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [actionTrigger, setActionTrigger] = useState(null);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [toast, setToast] = useState(null);
  const fleetStoreRef = useRef(new Map(
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? simulateFleetAtTime(ACTIVE_FLEET, Date.now()).map(v => [v.id, v])
      : []
  ));

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
        setFitTrigger(prev => prev + 1);
        setIsDriverModalOpen(false);
        setIsAutoTour(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // TV Kiosk Auto-Tour Mode (Continuous monitoring: adaptive pacing for active vs blind spot cars)
  useEffect(() => {
    if (!isAutoTour) return;

    let timeoutId;

    const runTourStep = () => {
      const currentVehicles = vehiclesRef.current || [];
      if (!currentVehicles || currentVehicles.length === 0) {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('📺 TV Auto-Tour: Hospital Base Standby (0 reporting)', 'info');
        timeoutId = setTimeout(runTourStep, 8000);
        return;
      }

      const tourItems = [
        ...currentVehicles.map(v => ({ 
          type: 'vehicle', 
          id: v.id, 
          name: v.name, 
          driver: v.driverName,
          isSignalGap: Boolean(v.isSignalGap),
          gapMinutes: v.gapMinutes || 1,
        })),
        { type: 'all', name: 'Fleet Overview' },
      ];

      tourIndexRef.current = (tourIndexRef.current + 1) % tourItems.length;
      const current = tourItems[tourIndexRef.current];

      let nextDelay = 12000;

      if (current.type === 'vehicle') {
        setSelectedVehicleId(current.id);
        setDetent('peek'); // keep UI minimal during TV auto-tour
        if (current.isSignalGap) {
          showToast(`📺 TV Auto-Tour: ${current.name} (⏳ Signal Gap ${current.gapMinutes}m)`, 'warning');
          nextDelay = 6000; // Shorter dwell time on network blind spot vehicles
        } else {
          showToast(`📺 TV Auto-Tour: Focusing ${current.name} (${current.driver || 'Driver'})`, 'info');
          nextDelay = 12000; // Full 12s focus on actively moving vehicles
        }
      } else {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('📺 TV Auto-Tour: Purvanchal Fleet Overview', 'info');
        nextDelay = 10000;
      }

      timeoutId = setTimeout(runTourStep, nextDelay);
    };

    timeoutId = setTimeout(runTourStep, 2000);
    return () => clearTimeout(timeoutId);
  }, [isAutoTour]);

  // Unified Telemetry Sync & Continuous High-Fidelity Road Cruising Engine
  useEffect(() => {
    let isSubscribed = true;

    const syncFleet = async () => {
      const now = Date.now();
      const store = fleetStoreRef.current;
      const isLocal = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      let serverVehicles = null;
      try {
        const vehRes = await fetch('/api/vehicles').catch(() => null);
        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          const list = Array.isArray(vehData) ? vehData : (vehData.vehicles || []);
          if (Array.isArray(list) && list.length > 0) {
            serverVehicles = list;
          }
        }
      } catch (err) {
        // Backend API offline
      }

      if (!isSubscribed) return;

      // PRIORITY 1: Real-time Telemetry reported to /api/vehicles
      if (serverVehicles && serverVehicles.length > 0) {
        const liveIds = new Set(serverVehicles.map(v => v.id));

        // Synchronize store with reported server vehicles
        for (const storedId of Array.from(store.keys())) {
          if (!liveIds.has(storedId)) {
            store.delete(storedId);
          }
        }

        serverVehicles.forEach(liveV => {
          const existing = store.get(liveV.id) || {};
          const colors = getUniqueVehicleColor(liveV.id);

          store.set(liveV.id, {
            ...existing,
            ...liveV,
            isLive: Boolean(liveV.isLive !== false),
            isSignalGap: Boolean(liveV.isSignalGap),
            gapMinutes: liveV.gapMinutes || 0,
            isParked: Boolean(liveV.isParked),
            lineColor: liveV.lineColor || existing.lineColor || colors.line,
            glowColor: liveV.glowColor || existing.glowColor || colors.glow,
            driverName: liveV.driverName || existing.driverName || 'Assigned Driver',
            villageName: liveV.villageName || existing.villageName || 'Base Hospital Standby',
            villageBlock: liveV.villageBlock || existing.villageBlock || 'Khalilabad',
            villageDistrict: liveV.villageDistrict || existing.villageDistrict || 'Sant Kabir Nagar',
            villageBadge: liveV.villageBadge || existing.villageBadge || 'Base Station',
            villageLabel: liveV.villageLabel || existing.villageLabel || 'Sant Kabir Eye Hospital',
            highwayName: liveV.highwayName || existing.highwayName || liveV.villageBadge || 'Highway Link',
            roadDistFromBaseKm: liveV.roadDistFromBaseKm || existing.roadDistFromBaseKm || 0,
            lastSeen: liveV.lastSeen || now,
          });
        });

        setVehicles(
          Array.from(store.values()).sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          )
        );
        return;
      }

      // PRIORITY 2: Dev / Localhost / Explicit Demo Mode simulation
      // If server has 0 vehicles AND we are on localhost or in demo mode,
      // cruise the full ACTIVE_FLEET (17 ambulances) smoothly on OSM roads!
      if (isDemoMode || isLocal) {
        const simulated = simulateFleetAtTime(ACTIVE_FLEET, now);
        const simIds = new Set(simulated.map(v => v.id));

        // Clean any stale vehicles not in ACTIVE_FLEET
        for (const storedId of Array.from(store.keys())) {
          if (!simIds.has(storedId)) {
            store.delete(storedId);
          }
        }

        simulated.forEach(simV => {
          const existing = store.get(simV.id) || {};
          store.set(simV.id, {
            ...existing,
            ...simV,
            lastSeen: now,
          });
        });

        setVehicles(
          Array.from(store.values()).sort((a, b) => 
            String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
          )
        );
        return;
      }

      // PRIORITY 3: Production Clean Blank Sheet (0 cars reporting)
      store.clear();
      setVehicles([]);
    };

    syncFleet();
    const interval = setInterval(syncFleet, 2000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isDemoMode]);

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

  // Action Triggers with stable references
  const handleZoomIn = useCallback(() => {
    setActionTrigger({ type: 'zoomIn', timestamp: Date.now() });
  }, []);

  const handleZoomOut = useCallback(() => {
    setActionTrigger({ type: 'zoomOut', timestamp: Date.now() });
  }, []);

  const handleFitAll = useCallback(() => {
    setSelectedVehicleId(null);
    setActionTrigger({ type: 'fitAll', timestamp: Date.now() });
    showToast('Overview: 17 Ambulances & Base Station', 'info');
  }, []);

  const handleResetNorth = useCallback(() => {
    setActionTrigger({ type: 'resetNorth', timestamp: Date.now() });
    showToast('Compass oriented to True North (0°)', 'info');
  }, []);

  const handleCenterBase = useCallback(() => {
    setSelectedVehicleId(null);
    setActionTrigger({ type: 'centerBase', timestamp: Date.now() });
    showToast('Camera centered on Sant Kabir Hospital Base (Khalilabad)', 'info');
  }, []);

  const handleToggleAutoTour = useCallback(() => {
    setIsAutoTour(prev => {
      const next = !prev;
      showToast(next ? '📺 TV Wallboard Auto-Tour Started' : 'TV Auto-Tour Stopped', 'info');
      return next;
    });
  }, []);

  const handleToggleDemoMode = useCallback(() => {
    setIsDemoMode(prev => {
      const next = !prev;
      if (next) {
        const demoFleet = simulateFleetAtTime(ACTIVE_FLEET, Date.now());
        fleetStoreRef.current = new Map(demoFleet.map(v => [v.id, v]));
        setVehicles(demoFleet);
        showToast('⚡ Demo Mode: Loaded 17 Simulated Purvanchal Ambulances', 'info');
      } else {
        fleetStoreRef.current.clear();
        setVehicles([]);
        showToast('🧹 Clean Live Mode: Empty Blank Sheet (Real Telemetry Only)', 'info');
      }
      return next;
    });
  }, []);

  const handleSelectVehicle = useCallback((id) => {
    setSelectedVehicleId(id);
    if (!id) {
      setFitTrigger(prev => prev + 1);
    }
  }, []);

  const handleToggleDistanceLines = useCallback(() => {
    setShowDistanceLines(prev => !prev);
  }, []);

  const handleResetView = useCallback(() => {
    setFitTrigger(prev => prev + 1);
  }, []);

  const handleOpenProvisionModal = useCallback((id) => {
    setProvisionModalVehicleId(id || 'AMB-01');
  }, []);

  // Apple Sheet Action Handlers
  const handleLocateVehicle = useCallback(() => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'locateVehicle', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Camera focused on Vehicle GPS position', 'info');
    }
  }, [selectedVehicleId]);

  const handleFitRoute = useCallback(() => {
    if (selectedVehicleId) {
      setActionTrigger({ type: 'fitRoute', vehicleId: selectedVehicleId, timestamp: Date.now() });
      showToast('Framing Full UP Highway Corridor to Base Hospital', 'info');
    }
  }, [selectedVehicleId]);

  const handleFocusRoute = useCallback(() => {
    handleFitRoute();
  }, [handleFitRoute]);

  const handleFocusDistance = useCallback(() => {
    setShowDistanceLines(true);
    showToast('Road Highway Distances Highlighted', 'info');
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 select-none">
      {/* 1. Full-Bleed Edge-to-Edge Map Canvas */}
      <MapView
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        fitTrigger={fitTrigger}
        actionTrigger={actionTrigger}
        theme={theme}
        activeStyleKey={activeStyleKey}
        onStyleChange={setActiveStyleKey}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={handleToggleDistanceLines}
        onResetView={handleResetView}
      />

      {/* 2. Top-Center Dynamic Island Status Capsule */}
      <DynamicIsland
        vehicles={vehicles}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenDriverModal={() => handleOpenProvisionModal('AMB-01')}
      />

      {/* 3. Top-Right Floating Controls Stack */}
      <FloatingControls
        activeStyleKey={activeStyleKey}
        onSelectStyle={setActiveStyleKey}
        onResetNorth={handleResetNorth}
        onCenterBase={handleCenterBase}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitAll={handleFitAll}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={handleToggleDistanceLines}
        isAutoTour={isAutoTour}
        onToggleAutoTour={handleToggleAutoTour}
        isDemoMode={isDemoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* 4. Bottom-Left Floating Apple Sheet */}
      <AppleSheet
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={handleSelectVehicle}
        onFocusRoute={handleFocusRoute}
        onLocateVehicle={handleLocateVehicle}
        onFitRoute={handleFitRoute}
        onFocusDistance={handleFocusDistance}
        onOpenProvisionModal={handleOpenProvisionModal}
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
