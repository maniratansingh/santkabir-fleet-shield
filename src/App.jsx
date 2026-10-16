import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import { INITIAL_VEHICLES, BASE_HOSPITAL, calculateDistanceKm } from './data/mockData';
import { playCampArrivalChime, playAlertTone } from './utils/audio';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [isSimulation, setIsSimulation] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [detent, setDetent] = useState('half'); // 'peek', 'half', 'full'
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [actionTrigger, setActionTrigger] = useState(null);
  const [showDistanceLines, setShowDistanceLines] = useState(true);
  const [toast, setToast] = useState(null);
  const [arrivalAlert, setArrivalAlert] = useState(null);

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
    // If user is on default style, sync it
    if (activeStyleKey === 'light' || activeStyleKey === 'dark') {
      setActiveStyleKey(theme === 'dark' ? 'dark' : 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const prevFieldStatusRef = useRef({});
  const tourIndexRef = useRef(0);

  // Show temporary toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Auto-dismiss arrival alert after 8 seconds
  useEffect(() => {
    if (!arrivalAlert) return;
    const timer = setTimeout(() => {
      setArrivalAlert(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [arrivalAlert]);

  // Focus camera and UI on arrival event
  const handleFocusArrival = () => {
    if (arrivalAlert) {
      if (arrivalAlert.vehicleId) {
        setSelectedVehicleId(arrivalAlert.vehicleId);
        setDetent('half');
      }
      setArrivalAlert(null);
    }
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

  // TV Kiosk Auto-Tour Mode (Cycles focus across active fleet every 12 seconds)
  useEffect(() => {
    if (!isAutoTour) return;

    const tourItems = [
      ...vehicles.map(v => ({ type: 'vehicle', id: v.id, name: v.name, driver: v.driverName })),
      { type: 'all', name: 'Fleet Overview' },
    ];

    const tourInterval = setInterval(() => {
      tourIndexRef.current = (tourIndexRef.current + 1) % tourItems.length;
      const current = tourItems[tourIndexRef.current];

      if (current.type === 'vehicle') {
        setSelectedVehicleId(current.id);
        setDetent('peek'); // keep UI minimal during TV auto-tour
        showToast(`🎥 Auto-Tour: Focusing ${current.name} (Driver: ${current.driver})`, 'info');
      } else {
        setSelectedVehicleId(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('🎥 Auto-Tour: Basti District Overview', 'info');
      }
    }, 12000);

    return () => clearInterval(tourInterval);
  }, [isAutoTour, vehicles]);

  // Fetch real data from Cloudflare Pages API when not in simulation
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const vehRes = await fetch('/api/vehicles').catch(() => null);
        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          if (vehData.vehicles && vehData.vehicles.length > 0) {
            setVehicles(vehData.vehicles);
          }
        }
      } catch (err) {
        console.warn('Backend API not reachable (using local state):', err);
      }
    };

    if (!isSimulation) {
      fetchRealData();
      const interval = setInterval(fetchRealData, 3000);
      return () => clearInterval(interval);
    }
  }, [isSimulation]);

  // Live Vehicle Simulation Engine (Demonstrates moving fleet along actual Basti road corridors)
  useEffect(() => {
    if (!isSimulation) return;

    const simInterval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.status === 'at_base') return v;

          const waypoints = v.routeWaypoints;
          if (!waypoints || waypoints.length < 2) return v;

          const maxIndex = waypoints.length - 1;
          let currentStep = typeof v.routeStep === 'number' ? v.routeStep : 0;
          let currentStatus = v.status;
          let currentSpeed = v.speed;

          if (currentStatus === 'moving') {
            // Advancing along road to field outreach area
            const stepDelta = 0.18;
            currentStep += stepDelta;

            if (currentStep >= maxIndex) {
              currentStep = maxIndex;
              currentStatus = 'in_field';
              currentSpeed = 0;

              if (!prevFieldStatusRef.current[v.id]) {
                prevFieldStatusRef.current[v.id] = true;
                if (soundEnabled) playCampArrivalChime();
                setArrivalAlert({
                  vehicleId: v.id,
                  vehicleName: v.name,
                  driverName: v.driverName,
                  organizerName: v.organizerName,
                  sector: v.sector,
                });
              }
            } else {
              currentSpeed = Math.floor(44 + Math.random() * 6);
            }
          } else if (currentStatus === 'returning') {
            // Returning along road back towards Base Hospital
            const stepDelta = 0.18;
            currentStep -= stepDelta;

            if (currentStep <= 0.2) {
              currentStep = 0.2;
              currentStatus = 'moving'; // Set back out on outreach corridor
              currentSpeed = Math.floor(42 + Math.random() * 6);
            } else {
              currentSpeed = Math.floor(46 + Math.random() * 6);
            }
          } else if (currentStatus === 'in_field') {
            // Conducting eye camp outreach in field, then cycle to returning
            const stayCounter = (v.stayTicks || 0) + 1;
            if (stayCounter > 14) {
              return {
                ...v,
                status: 'returning',
                stayTicks: 0,
                routeStep: maxIndex - 0.2,
              };
            }
            return { ...v, stayTicks: stayCounter };
          }

          // Interpolate coordinate along road segment
          const segIdx = Math.max(0, Math.min(Math.floor(currentStep), maxIndex - 1));
          const t = Math.max(0, Math.min(currentStep - segIdx, 1));
          const pA = waypoints[segIdx];
          const pB = waypoints[segIdx + 1];

          const lon = pA[0] + t * (pB[0] - pA[0]);
          const lat = pA[1] + t * (pB[1] - pA[1]);

          // Compute road tangent angle
          const dLon = pB[0] - pA[0];
          const dLat = pB[1] - pA[1];
          let bearing = Math.round(((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360);
          if (currentStatus === 'returning') {
            bearing = (bearing + 180) % 360;
          }

          // Calculate exact road distance from Base Hospital along highway
          let roadDistFromBase = 0;
          for (let j = 0; j < segIdx; j++) {
            roadDistFromBase += calculateDistanceKm(waypoints[j][1], waypoints[j][0], waypoints[j + 1][1], waypoints[j + 1][0]);
          }
          roadDistFromBase += calculateDistanceKm(pA[1], pA[0], lat, lon);

          return {
            ...v,
            lat,
            lon,
            speed: currentSpeed,
            bearing,
            routeStep: currentStep,
            status: currentStatus,
            roadDistFromBaseKm: Math.round(roadDistFromBase * 10) / 10,
            lastSeen: Date.now(),
          };
        })
      );
    }, 1500);

    return () => clearInterval(simInterval);
  }, [isSimulation, soundEnabled]);

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

  const handleToggleSimulation = () => {
    setIsSimulation(prev => {
      const next = !prev;
      showToast(next ? 'Active Simulation Mode (Live Corridors)' : 'Live Fleet Shield Feed Mode (mrps.in)', 'info');
      return next;
    });
  };

  const handleToggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      if (next) playAlertTone();
      showToast(next ? 'System Audio Chimes Enabled' : 'Audio Muted', 'info');
      return next;
    });
  };

  const handleToggleAutoTour = () => {
    setIsAutoTour(prev => {
      const next = !prev;
      showToast(next ? 'TV Kiosk Auto-Tour Started' : 'Auto-Tour Stopped', 'info');
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
        arrivalAlert={arrivalAlert}
        onDismissArrivalAlert={() => setArrivalAlert(null)}
        onFocusArrival={handleFocusArrival}
      />

      {/* 3. Top-Right Floating Controls Stack */}
      <FloatingControls
        activeStyleKey={activeStyleKey}
        onSelectStyle={setActiveStyleKey}
        onResetNorth={handleResetNorth}
        onCenterBase={handleCenterBase}
        showDistanceLines={showDistanceLines}
        onToggleDistanceLines={() => setShowDistanceLines(prev => !prev)}
        isSimulation={isSimulation}
        onToggleSimulation={handleToggleSimulation}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
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
          {toast.type === 'arrival' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-sky-500 dark:text-cyan-400 shrink-0" />
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
