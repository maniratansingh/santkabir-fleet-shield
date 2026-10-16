import React, { useState } from 'react';
import { 
  Truck, 
  Bus, 
  Ambulance, 
  MapPin, 
  Phone, 
  Battery, 
  BatteryCharging, 
  Signal, 
  Navigation, 
  ChevronRight, 
  ChevronLeft, 
  Volume2, 
  Ruler, 
  User, 
  X, 
  CheckCircle2, 
  Clock, 
  Users,
  Compass
} from 'lucide-react';
import { playCampArrivalChime } from '../utils/audio';

export default function AppleSheet({
  vehicles = [],
  camps = [],
  selectedVehicleId = null,
  onSelectVehicle,
  onFocusRoute,
  onFocusDistance,
  detent = 'half', // 'peek', 'half', 'full'
  onChangeDetent,
}) {
  const [filter, setFilter] = useState('all'); // 'all', 'moving', 'at_camp', 'at_base'

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Cycling detents
  const cycleDetent = () => {
    if (detent === 'peek') onChangeDetent('half');
    else if (detent === 'half') onChangeDetent('full');
    else onChangeDetent('peek');
  };

  // Filtered vehicles
  const filteredVehicles = vehicles.filter((v) => {
    if (filter === 'moving') return v.status === 'moving' || v.status === 'returning';
    if (filter === 'at_camp') return v.status === 'at_camp';
    if (filter === 'at_base') return v.status === 'at_base';
    return true;
  });

  // Vehicle Icon Selector
  const getVehicleIcon = (type) => {
    if (type === 'bus') return Bus;
    if (type === 'ambulance') return Ambulance;
    return Truck;
  };

  // Determine height classes based on detent
  const getDetentHeightClass = () => {
    if (detent === 'peek') return 'h-16';
    if (detent === 'half') return 'h-[380px]';
    return 'h-[580px] max-h-[85vh]';
  };

  return (
    <div 
      className={`fixed bottom-3 left-3 z-30 pointer-events-auto w-[92vw] sm:w-[380px] glass-panel rounded-3xl shadow-2xl border border-slate-200/90 dark:border-white/10 flex flex-col transition-all duration-300 overflow-hidden ${getDetentHeightClass()}`}
    >
      {/* Apple Drag Handle Grabber Pill */}
      <div 
        onClick={cycleDetent}
        className="w-full pt-2 pb-1 flex flex-col items-center justify-center cursor-pointer select-none group"
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-sky-500 transition-colors" />
      </div>

      {/* DETENT = PEEK (Minimalist Bottom Status Capsule) */}
      {detent === 'peek' && (
        <div 
          onClick={() => onChangeDetent('half')}
          className="px-4 pb-2 flex-1 flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs">
              {vehicles.length}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block leading-tight">
                {selectedVehicle ? selectedVehicle.name : 'Outreach Eye Fleet'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {selectedVehicle ? `${selectedVehicle.status.replace('_', ' ')} • ${selectedVehicle.speed} km/h` : `${vehicles.filter(v => v.status === 'moving').length} en route • Tap to expand`}
              </span>
            </div>
          </div>
          <span className="text-xs font-semibold text-sky-600 dark:text-cyan-400 flex items-center">
            View <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </span>
        </div>
      )}

      {/* DETENT = HALF OR FULL */}
      {detent !== 'peek' && (
        <div className="flex-1 flex flex-col overflow-hidden px-3.5 pb-3">
          {/* VIEW A: SELECTED VEHICLE (AirTag Precision Item Platter) */}
          {selectedVehicle ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Top Navigation Row */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <button
                  onClick={() => onSelectVehicle(null)}
                  className="flex items-center gap-1 text-xs font-semibold text-sky-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  All Vehicles
                </button>
                <button
                  onClick={() => onSelectVehicle(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* AirTag Hero Header */}
              <div className="py-3 flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-cyan-500 text-white flex items-center justify-center shadow-md shrink-0">
                  {React.createElement(getVehicleIcon(selectedVehicle.type), { className: 'w-6 h-6' })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedVehicle.name}
                    </h3>
                    {/* Battery Pill */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                      <Battery className="w-3 h-3" />
                      <span>{selectedVehicle.battery}%</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {selectedVehicle.plate || selectedVehicle.regNumber || 'UP-51-AT-4211'} • {selectedVehicle.driverName || selectedVehicle.driver || 'Driver'}
                  </div>
                  <div className="text-[11px] text-sky-600 dark:text-cyan-400 font-medium flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {camps.find(c => c.id === selectedVehicle.assignedCampId)?.name || 'Sant Kabir Eye Hospital Base'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Apple Signature 4-Column Action Platter */}
              <div className="grid grid-cols-4 gap-2 my-2 py-2.5 px-2 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                {/* 1. Play Chime */}
                <button
                  onClick={() => playCampArrivalChime()}
                  className="flex flex-col items-center gap-1 text-center cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-xs flex items-center justify-center text-sky-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Play Chime</span>
                </button>

                {/* 2. Route Corridor */}
                <button
                  onClick={onFocusRoute}
                  className="flex flex-col items-center gap-1 text-center cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-xs flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Route</span>
                </button>

                {/* 3. Distance Radar */}
                <button
                  onClick={onFocusDistance}
                  className="flex flex-col items-center gap-1 text-center cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-xs flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition-transform">
                    <Ruler className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Distance</span>
                </button>

                {/* 4. Call Driver */}
                <a
                  href={`tel:${selectedVehicle.driverPhone || selectedVehicle.phone || '+919415140719'}`}
                  className="flex flex-col items-center gap-1 text-center cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-600 text-white shadow-xs flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Call Driver</span>
                </a>
              </div>

              {/* Micro-Telemetry Grid */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Speed</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white font-mono">
                    {selectedVehicle.speed} km/h
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cellular Ping</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white font-mono flex items-center gap-1">
                    <Signal className="w-3 h-3 text-emerald-500" />
                    4G LTE • 38ms
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Doctor In-Charge</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white truncate block">
                    {selectedVehicle.assignedDoctor || selectedVehicle.doctor || 'Dr. S. K. Verma'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Surgical Boarded</span>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                    {selectedVehicle.boardedPatients || selectedVehicle.boardedPassengers || 0} Patients
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW B: FLEET LIST OVERVIEW */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 mb-2">
                {[
                  { key: 'all', label: 'All (4)' },
                  { key: 'moving', label: 'En Route' },
                  { key: 'at_camp', label: 'At Camp' },
                  { key: 'at_base', label: 'Base' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                      filter === tab.key
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Vehicle Cards List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {filteredVehicles.map((v) => {
                  const Icon = getVehicleIcon(v.type);
                  const isMoving = v.status === 'moving' || v.status === 'returning';
                  const assignedCamp = camps.find((c) => c.id === v.assignedCampId);

                  return (
                    <div
                      key={v.id}
                      onClick={() => onSelectVehicle(v.id)}
                      className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 hover:border-sky-400 dark:hover:border-cyan-400 transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isMoving 
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' 
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {v.name}
                            </span>
                            {isMoving && (
                              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                {v.speed} km/h
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block">
                            {assignedCamp ? assignedCamp.name : 'Sant Kabir Eye Hospital'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-[10px] font-mono text-slate-400 block">
                            {v.battery}%
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
