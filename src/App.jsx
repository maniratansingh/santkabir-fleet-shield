import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import MapView from './components/MapView';
import VehicleSidebar from './components/VehicleSidebar';
import DriverSetupModal from './components/DriverSetupModal';
import { INITIAL_VEHICLES, INITIAL_CAMPS, calculateDistanceKm, BASE_HOSPITAL } from './data/mockData';
import { playCampArrivalChime, playAlertTone } from './utils/audio';
import { CheckCircle2, AlertTriangle, X, Eye, Users, User, Clock, Phone, MapPin, Glasses, Stethoscope } from 'lucide-react';

export default function App() {
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [camps, setCamps] = useState(INITIAL_CAMPS);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [isSimulation, setIsSimulation] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [toast, setToast] = useState(null);

  const prevCampStatusRef = useRef({});
  const tourIndexRef = useRef(0);

  // Show temporary toast notification
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
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

  // TV Kiosk Auto-Tour Mode (Cycles focus across active fleet and camps every 10 seconds)
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
        showToast(`🎥 Auto-Tour: Focusing ${current.name}`, 'info');
      } else if (current.type === 'camp') {
        setSelectedVehicleId(null);
        setSelectedCamp(current.camp);
        showToast(`🎥 Auto-Tour: Viewing ${current.name}`, 'info');
      } else {
        setSelectedVehicleId(null);
        setSelectedCamp(null);
        setFitTrigger(prev => prev + 1);
        showToast('🎥 Auto-Tour: Overview', 'info');
      }
    }, 10000);

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
              // Just arrived at camp!
              if (!prevCampStatusRef.current[v.id]) {
                prevCampStatusRef.current[v.id] = true;
                if (soundEnabled) playCampArrivalChime();
                showToast(`🚐 ${v.name} has arrived at ${targetCamp?.name || 'Camp'}!`, 'arrival');
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
          const step = 0.0006; // ~40-50 km/h simulation rate
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

  const handleFitMap = () => {
    setSelectedVehicleId(null);
    setSelectedCamp(null);
    setIsAutoTour(false);
    setFitTrigger((prev) => prev + 1);
  };

  const handleToggleSimulation = () => {
    setIsSimulation((prev) => {
      const next = !prev;
      showToast(next ? 'Live Vehicle Simulator Started' : 'Switched to Live Traccar Receiver', 'info');
      return next;
    });
  };

  const handleToggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) playCampArrivalChime();
      return next;
    });
  };

  const handleToggleAutoTour = () => {
    setIsAutoTour((prev) => {
      const next = !prev;
      showToast(next ? 'TV Auto-Tour Kiosk Mode Started' : 'Auto-Tour Stopped', 'info');
      return next;
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#060d17] text-slate-100">
      {/* Top Operations Header */}
      <Header
        vehicles={vehicles}
        camps={camps}
        onFitMap={handleFitMap}
        isSimulation={isSimulation}
        onToggleSimulation={handleToggleSimulation}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenDriverModal={() => setIsDriverModalOpen(true)}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isAutoTour={isAutoTour}
        onToggleAutoTour={handleToggleAutoTour}
      />

      {/* Main Real-Time Operations Canvas */}
      <main className="flex-1 flex relative overflow-hidden">
        {/* Full Screen Live Map */}
        <MapView
          vehicles={vehicles}
          camps={camps}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          onSelectCamp={setSelectedCamp}
          fitTrigger={fitTrigger}
          isSidebarOpen={isSidebarOpen}
        />

        {/* Right Operations Sidebar */}
        <VehicleSidebar
          vehicles={vehicles}
          camps={camps}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        {/* Camp Info Modal (when user clicks an Eye Camp marker) */}
        {selectedCamp && (
          <div className="absolute top-16 left-4 z-40 w-80 md:w-96 glass-panel-glow p-4 rounded-2xl border border-cyan-400 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight font-['Outfit']">
                    {selectedCamp.name}
                  </h3>
                  <span className="text-[11px] text-cyan-300 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {selectedCamp.location}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCamp(null)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Screening Progress Bar */}
            <div className="mt-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-400">Screening Target</span>
                <span className="text-cyan-300 font-bold font-mono">
                  {selectedCamp.currentScreened} / {selectedCamp.targetScreening} checked
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.round((selectedCamp.currentScreened / selectedCamp.targetScreening) * 100))}%` }}
                />
              </div>

              {/* Clinical Breakdown */}
              <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800/80 text-center">
                <div className="p-1.5 rounded-lg bg-amber-950/40 border border-amber-500/20">
                  <span className="text-[9px] text-amber-300/70 block uppercase font-semibold">Cataract</span>
                  <span className="text-xs font-bold text-amber-400 font-mono">{selectedCamp.cataractIdentified}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-sky-950/40 border border-sky-500/20">
                  <span className="text-[9px] text-sky-300/70 block uppercase font-semibold">Glasses</span>
                  <span className="text-xs font-bold text-sky-400 font-mono">{selectedCamp.refractiveErrors || 50}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/20">
                  <span className="text-[9px] text-emerald-300/70 block uppercase font-semibold">Glaucoma</span>
                  <span className="text-xs font-bold text-emerald-400 font-mono">{selectedCamp.glaucomaSuspects || 10}</span>
                </div>
              </div>
            </div>

            {/* Doctor and Field Coordinator */}
            <div className="mt-3 space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Doctor: <strong>{selectedCamp.leadDoctor}</strong></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Hours: {selectedCamp.schedule}</span>
                </div>
                {selectedCamp.coordinatorPhone && (
                  <a 
                    href={`tel:${selectedCamp.coordinatorPhone}`}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
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
                }}
                className="mt-3 w-full py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-lg"
              >
                Track Assigned Van ({selectedCamp.assignedVehicleId})
              </button>
            )}
          </div>
        )}

        {/* Toast Alert Notification */}
        {toast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 glass-panel-glow px-4 py-2.5 rounded-xl border border-cyan-400 flex items-center gap-3 shadow-2xl animate-in slide-in-from-top duration-300 max-w-[90vw]">
            {toast.type === 'arrival' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-cyan-400 shrink-0" />
            )}
            <span className="text-xs md:text-sm font-semibold text-white">{toast.message}</span>
            <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-0.5 ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* Driver Smartphone Setup Modal */}
      <DriverSetupModal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
      />
    </div>
  );
}
