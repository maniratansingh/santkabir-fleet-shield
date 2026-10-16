import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import { INITIAL_VEHICLES, INITIAL_CAMPS, BASE_HOSPITAL } from './data/mockData';
import { playCampArrivalChime, playAlertTone } from './utils/audio';
import { CheckCircle2, AlertTriangle, X, Eye, User, Clock, Phone, MapPin } from 'lucide-react';

export default function App() {
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [camps, setCamps] = useState(INITIAL_CAMPS);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedCamp, setSelectedCamp] = useState(null);
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

  const prevCampStatusRef = useRef({});
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
      if (arrivalAlert.camp) {
        setSelectedCamp(arrivalAlert.camp);
      }
      setArrivalAlert(null);
    }
  };

  // Keyboard shortcut listener (ESC to deselect)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedVehicleId(null);
        setSelectedCamp(null);
        setIsDriverModalOpen(false);
        setIsAutoTour(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // TV Kiosk Auto-Tour Mode (Cycles focus across active fleet and camps every 12 seconds)
  useEffect(() => {
    if (!isAutoTour) return;

    const tourItems = [
      ...vehicles.map(v => ({ type: 'vehicle', id: v.id, name: v.name })),
      ...camps.map(c => ({ type: 'camp', id: c.id, camp: c, name: c.name })),
      { type: 'all', name: 'Fleet Overview' },
    ];

    const tourInterval = setInterval(() => {
      tourIndexRef.current = (tourIndexRef.current + 1) % tourItems.length;
      const current = tourItems[tourIndexRef.current];

      if (current.type === 'vehicle') {
        setSelectedCamp(null);
        setSelectedVehicleId(current.id);
        setDetent('peek'); // keep UI minimal during TV auto-tour
        showToast(`🎥 Auto-Tour: Focusing ${current.name}`, 'info');
      } else if (current.type === 'camp') {
        setSelectedVehicleId(null);
        setSelectedCamp(current.camp);
        setDetent('peek');
        showToast(`🎥 Auto-Tour: Viewing ${current.name}`, 'info');
      } else {
        setSelectedVehicleId(null);
        setSelectedCamp(null);
        setFitTrigger(prev => prev + 1);
        setDetent('peek');
        showToast('🎥 Auto-Tour: Basti District Overview', 'info');
      }
    }, 12000);

    return () => clearInterval(tourInterval);
  }, [isAutoTour, vehicles, camps]);

  // Fetch real data from Cloudflare Pages API when not in simulation
  useEffect(() => {
    const fetchRealData = async () => {
      try {
        const [vehRes, campRes] = await Promise.all([
          fetch('/api/vehicles').catch(() => null),
          fetch('/api/camps').catch(() => null),
        ]);

        if (vehRes && vehRes.ok) {
          const vehData = await vehRes.json();
          if (vehData.vehicles && vehData.vehicles.length > 0) {
            setVehicles(vehData.vehicles);
          }
        }

        if (campRes && campRes.ok) {
          const campData = await campRes.json();
          if (campData.camps && campData.camps.length > 0) {
            setCamps(campData.camps);
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

  // Live Vehicle Simulation Engine (Demonstrates moving fleet on Basti roads)
  useEffect(() => {
    if (!isSimulation) return;

    const simInterval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.status === 'at_base') return v;

          // Find assigned camp coordinates
          const targetCamp = camps.find((c) => c.id === v.assignedCampId);
          let targetLat = targetCamp ? targetCamp.lat : BASE_HOSPITAL.lat;
          let targetLon = targetCamp ? targetCamp.lon : BASE_HOSPITAL.lon;

          if (v.status === 'returning') {
            targetLat = BASE_HOSPITAL.lat;
            targetLon = BASE_HOSPITAL.lon;
          }

          // Compute step towards target
          const dLat = targetLat - v.lat;
          const dLon = targetLon - v.lon;
          const dist = Math.sqrt(dLat * dLat + dLon * dLon);

          // Close to target (< 300m)
          if (dist < 0.005) {
            if (v.status === 'moving') {
              if (!prevCampStatusRef.current[v.id]) {
                prevCampStatusRef.current[v.id] = true;
                if (soundEnabled) playCampArrivalChime();
                setArrivalAlert({
                  vehicleId: v.id,
                  vehicleName: v.name,
                  campId: targetCamp?.id,
                  campName: targetCamp?.name || 'Camp Site',
                  camp: targetCamp,
                });
              }
              return {
                ...v,
                status: 'at_camp',
                speed: 0,
                lastSeen: Date.now(),
              };
            }
            if (v.status === 'returning') {
              return {
                ...v,
                status: 'at_base',
                speed: 0,
                lastSeen: Date.now(),
              };
            }
          }

          // Move along vector
          const step = 0.0006;
          const angle = Math.atan2(dLon, dLat);
          const bearing = Math.round(((angle * 180) / Math.PI + 360) % 360);
          const nextLat = v.lat + Math.cos(angle) * step;
          const nextLon = v.lon + Math.sin(angle) * step;
          const randomSpeed = Math.floor(40 + Math.random() * 12);

          return {
            ...v,
            lat: nextLat,
            lon: nextLon,
            speed: randomSpeed,
            bearing: bearing,
            lastSeen: Date.now(),
          };
        })
      );
    }, 2000);

    return () => clearInterval(simInterval);
  }, [isSimulation, camps, soundEnabled]);

  // Action Triggers
  const handleResetNorth = () => {
    setActionTrigger({ type: 'resetNorth', timestamp: Date.now() });
  };

  const handleCenterBase = () => {
    setActionTrigger({ type: 'centerBase', timestamp: Date.now() });
  };

  const handleFocusRoute = () => {
    setActionTrigger({ type: 'focusRoute', timestamp: Date.now() });
  };

  const handleFocusDistance = () => {
    setActionTrigger({ type: 'focusDistance', timestamp: Date.now() });
  };

  const handleToggleSimulation = () => {
    setIsSimulation(prev => {
      const next = !prev;
      showToast(next ? 'Simulator Running' : 'Switched to Live Traccar Receiver', 'info');
      return next;
    });
  };

  const handleToggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      if (next) playCampArrivalChime();
      return next;
    });
  };

  const handleToggleAutoTour = () => {
    setIsAutoTour(prev => {
      const next = !prev;
      showToast(next ? 'TV Auto-Tour Kiosk Mode Active' : 'Auto-Tour Stopped', 'info');
      return next;
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 select-none">
      {/* 1. Full-Bleed Edge-to-Edge Map Canvas */}
      <MapView
        vehicles={vehicles}
        camps={camps}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        onSelectCamp={setSelectedCamp}
        fitTrigger={fitTrigger}
        theme={theme}
        activeStyleKey={activeStyleKey}
        onStyleChange={setActiveStyleKey}
        showDistanceLines={showDistanceLines}
        detent={detent}
        actionTrigger={actionTrigger}
      />

      {/* 2. Top-Center Dynamic Island Status Capsule */}
      <DynamicIsland
        vehicles={vehicles}
        camps={camps}
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

      {/* 4. Bottom-Left Floating Apple Sheet (with Peek / Half / Full Detents & AirTag Platter) */}
      <AppleSheet
        vehicles={vehicles}
        camps={camps}
        selectedVehicleId={selectedVehicleId}
        onSelectVehicle={setSelectedVehicleId}
        onFocusRoute={handleFocusRoute}
        onFocusDistance={handleFocusDistance}
        detent={detent}
        onChangeDetent={setDetent}
      />

      {/* 5. Camp Detail Modal (When user taps an Eye Camp site marker) */}
      {selectedCamp && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 md:translate-x-0 md:left-4 z-40 w-[92vw] sm:w-96 glass-panel p-4 rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200 text-sky-600 dark:bg-cyan-500/20 dark:border-cyan-500/30 dark:text-cyan-400 flex items-center justify-center">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                  {selectedCamp.name}
                </h3>
                <span className="text-[11px] text-sky-700 dark:text-cyan-300 flex items-center gap-1 mt-0.5 font-medium">
                  <MapPin className="w-3 h-3 shrink-0 text-sky-600 dark:text-cyan-400" />
                  {selectedCamp.location}
                </span>
              </div>
            </div>
            <button 
              onClick={() => setSelectedCamp(null)}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Screening Progress Bar */}
          <div className="mt-3 bg-slate-50/80 border border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800 p-3 rounded-2xl">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Screening Target</span>
              <span className="text-sky-700 dark:text-cyan-300 font-bold font-mono">
                {selectedCamp.currentScreened} / {selectedCamp.targetScreening} checked
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, Math.round((selectedCamp.currentScreened / selectedCamp.targetScreening) * 100))}%` }}
              />
            </div>

            {/* Clinical Breakdown */}
            <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 text-center">
              <div className="p-1.5 rounded-xl bg-amber-50/80 border border-amber-200/70 dark:bg-amber-950/40 dark:border-amber-500/20">
                <span className="text-[9px] text-amber-700 dark:text-amber-300 uppercase font-semibold block">Cataract</span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 font-mono">{selectedCamp.cataractIdentified}</span>
              </div>
              <div className="p-1.5 rounded-xl bg-sky-50/80 border border-sky-200/70 dark:bg-sky-950/40 dark:border-sky-500/20">
                <span className="text-[9px] text-sky-700 dark:text-sky-300 uppercase font-semibold block">Glasses</span>
                <span className="text-xs font-bold text-sky-700 dark:text-sky-400 font-mono">{selectedCamp.refractiveErrors || 50}</span>
              </div>
              <div className="p-1.5 rounded-xl bg-emerald-50/80 border border-emerald-200/70 dark:bg-emerald-950/40 dark:border-emerald-500/20">
                <span className="text-[9px] text-emerald-700 dark:text-emerald-300 uppercase font-semibold block">Glaucoma</span>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">{selectedCamp.glaucomaSuspects || 10}</span>
              </div>
            </div>
          </div>

          {/* Doctor and Field Coordinator */}
          <div className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-sky-600 dark:text-cyan-400 shrink-0" />
              <span>Doctor: <strong className="text-slate-900 dark:text-white">{selectedCamp.leadDoctor}</strong></span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Hours: {selectedCamp.schedule}</span>
              </div>
              {selectedCamp.coordinatorPhone && (
                <a 
                  href={`tel:${selectedCamp.coordinatorPhone}`}
                  className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                >
                  <Phone className="w-3 h-3" />
                  Call Lead
                </a>
              )}
            </div>
          </div>

          {/* Action button to select assigned van */}
          {selectedCamp.assignedVehicleId && (
            <button
              onClick={() => {
                setSelectedVehicleId(selectedCamp.assignedVehicleId);
                setSelectedCamp(null);
                setDetent('half');
              }}
              className="mt-3 w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              Track Assigned Outreach Van
            </button>
          )}
        </div>
      )}

      {/* 6. Dynamic Island Toast Notifications */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 glass-panel px-4 py-2 rounded-full border border-sky-400/60 dark:border-cyan-400/60 flex items-center gap-2.5 shadow-2xl animate-in slide-in-from-top duration-300 max-w-[90vw]">
          {toast.type === 'arrival' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-sky-500 dark:text-cyan-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-900 dark:text-white">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-0.5 ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 7. Traccar Driver Setup Modal */}
      <DriverSetupModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
      />
    </div>
  );
}
