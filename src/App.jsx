import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import DynamicIsland from './components/DynamicIsland';
import FloatingControls from './components/FloatingControls';
import AppleSheet from './components/AppleSheet';
import DriverSetupModal from './components/DriverSetupModal';
import { INITIAL_VEHICLES, INITIAL_CAMPS, BASE_HOSPITAL, calculateDistanceKm } from './data/mockData';
import { playCampArrivalChime, playAlertTone } from './utils/audio';
import { CheckCircle2, AlertTriangle, X, Eye, User, Clock, Phone, MapPin, Navigation } from 'lucide-react';

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

  // Live Vehicle Simulation Engine (Demonstrates moving fleet along actual Basti road corridors)
  useEffect(() => {
    if (!isSimulation) return;

    const simInterval = setInterval(() => {
      setVehicles((prev) =>
        prev.map((v) => {
          if (v.status === 'at_base') return v;

          const targetCamp = camps.find((c) => c.id === v.assignedCampId);
          const waypoints = targetCamp?.routeWaypoints;
          if (!waypoints || waypoints.length < 2) return v;

          const maxIndex = waypoints.length - 1;
          let currentStep = typeof v.routeStep === 'number' ? v.routeStep : 0;
          let currentStatus = v.status;
          let currentSpeed = v.speed;

          if (currentStatus === 'moving') {
            // Advancing along road to camp at real road speed
            const stepDelta = 0.18;
            currentStep += stepDelta;

            if (currentStep >= maxIndex) {
              currentStep = maxIndex;
              currentStatus = 'at_camp';
              currentSpeed = 0;

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
            } else {
              currentSpeed = Math.floor(44 + Math.random() * 6);
            }
          } else if (currentStatus === 'returning') {
            // Returning along road back to Base Hospital
            const stepDelta = 0.18;
            currentStep -= stepDelta;

            if (currentStep <= 0) {
              currentStep = 0;
              currentStatus = 'at_base';
              currentSpeed = 0;
            } else {
              currentSpeed = Math.floor(46 + Math.random() * 6);
            }
          } else if (currentStatus === 'at_camp') {
            // After staying at camp for screening, cycle to returning with boarded patients
            const stayCounter = (v.stayTicks || 0) + 1;
            if (stayCounter > 12) {
              return {
                ...v,
                status: 'returning',
                stayTicks: 0,
                patientsOnboard: 0,
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

          // Calculate exact remaining road distance to Camp along highway
          let roadDistToCamp = calculateDistanceKm(lat, lon, pB[1], pB[0]);
          for (let j = segIdx + 1; j < maxIndex; j++) {
            roadDistToCamp += calculateDistanceKm(waypoints[j][1], waypoints[j][0], waypoints[j + 1][1], waypoints[j + 1][0]);
          }

          const distRemainingKm = currentStatus === 'returning' ? roadDistFromBase : roadDistToCamp;
          const etaMins = currentSpeed > 0 ? Math.max(1, Math.round((distRemainingKm / currentSpeed) * 60)) : 0;

          return {
            ...v,
            lat,
            lon,
            speed: currentSpeed,
            bearing,
            routeStep: currentStep,
            status: currentStatus,
            roadDistFromBaseKm: Math.round(roadDistFromBase * 10) / 10,
            roadDistToCampKm: Math.round(roadDistToCamp * 10) / 10,
            totalRoadKm: Math.round((roadDistFromBase + roadDistToCamp) * 10) / 10,
            distRemainingKm: Math.round(distRemainingKm * 10) / 10,
            etaMins,
            lastSeen: Date.now(),
          };
        })
      );
    }, 1500);

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

          {/* Camp Ground Person In-Charge & Contact */}
          <div className="mt-3 bg-slate-50/90 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 p-3 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block leading-tight">Camp In-Charge</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {selectedCamp.coordinatorName || 'Camp Coordinator'}
                  </span>
                </div>
              </div>
              {selectedCamp.coordinatorPhone && (
                <a 
                  href={`tel:${selectedCamp.coordinatorPhone}`}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                >
                  <Phone className="w-3 h-3" />
                  <span>Call</span>
                </a>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-800/80">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Hours: {selectedCamp.schedule || '09:00 AM - 04:00 PM'}</span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                500m Designated Zone
              </span>
            </div>
          </div>

          {/* Accurate GPS Coordinates & 1-Click Navigation */}
          <div className="mt-2.5 p-3 rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-white">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>Accurate Camp Coordinates</span>
              </div>
              <span className="text-[11px] font-mono font-bold text-sky-600 dark:text-cyan-400 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-200/60 dark:border-sky-800">
                {selectedCamp.lat.toFixed(5)}° N, {selectedCamp.lon.toFixed(5)}° E
              </span>
            </div>

            {/* Direct 1-Click Navigation Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedCamp.lat},${selectedCamp.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-98"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Google Maps</span>
                <span className="text-[10px]">↗</span>
              </a>
              <a
                href={`https://maps.apple.com/?daddr=${selectedCamp.lat},${selectedCamp.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                <span>Apple Maps</span>
                <span className="text-[10px]">↗</span>
              </a>
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
