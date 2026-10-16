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
  const assignedCamp = camps.find((c) => c.id === selectedVehicle?.assignedCampId);

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

  // Vehicle Icon Selector - All outreach fleet units are specialized ambulances
  const getVehicleIcon = () => Ambulance;

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
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-rose-600 via-red-500 to-rose-400 text-white flex items-center justify-center shadow-md shadow-rose-500/20 shrink-0">
                  <Ambulance className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedVehicle.name}
                    </h3>
                    {/* Battery Pill */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                      <Battery className="w-3 h-3" />
                      <span>{selectedVehicle.battery || selectedVehicle.batt || 88}%</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                    Driver: <strong className="text-slate-900 dark:text-white font-bold">{selectedVehicle.driverName || 'Ramesh Yadav'}</strong> • <span className="font-mono text-slate-400">{selectedVehicle.plate || 'UP-51-AT-4211'}</span>
                  </div>
                  <div className="text-[11px] text-sky-600 dark:text-cyan-400 font-medium flex items-center gap-1 mt-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      Destination: {camps.find(c => c.id === selectedVehicle.assignedCampId)?.name?.replace(' Community Eye Camp', '')?.replace(' Rural Vision & Cataract Camp', '')?.replace(' Outreach Centre', '') || 'Sant Kabir Base'} 
                      {assignedCamp?.coordinatorName ? ` (Lead: ${assignedCamp.coordinatorName})` : ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Accurate Live GPS & Navigation Hub */}
              <div className="my-2 p-3 rounded-2xl bg-white/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-white">
                    <MapPin className="w-3.5 h-3.5 text-rose-500" />
                    <span>Live GPS Position</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-sky-600 dark:text-cyan-400 bg-sky-50 dark:bg-sky-950/60 px-2.5 py-0.5 rounded-full border border-sky-200/60 dark:border-sky-800">
                    {selectedVehicle.lat.toFixed(5)}° N, {selectedVehicle.lon.toFixed(5)}° E
                  </span>
                </div>

                {/* 1-Click External Navigation Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVehicle.lat},${selectedVehicle.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-transform active:scale-98"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Google Maps</span>
                    <span className="text-[10px]">↗</span>
                  </a>
                  <a
                    href={`https://maps.apple.com/?daddr=${selectedVehicle.lat},${selectedVehicle.lon}`}
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

              {/* Zomato / Swiggy Delivery Status Platter */}
              {selectedVehicle.status !== 'at_base' && (
                <div className="my-1.5 p-3 rounded-2xl bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-transparent border border-blue-500/25 dark:border-blue-400/20 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-cyan-400 font-mono">
                        {selectedVehicle.status === 'returning' ? 'Patient Return Transit' : 'Live Delivery to Camp'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-blue-700 dark:text-cyan-300 font-mono">
                        ~{selectedVehicle.etaMins || 14} MINS
                      </span>
                    </div>
                  </div>

                  {/* Route Corridor Progress Tracker Bar with True Road Distances */}
                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    <span className="truncate max-w-[110px]">
                      Base ({selectedVehicle.roadDistFromBaseKm || 16.8} km road)
                    </span>
                    <span className="font-mono text-blue-600 dark:text-cyan-400 font-bold">
                      {selectedVehicle.distRemainingKm || selectedVehicle.roadDistToCampKm || 18} km to Camp
                    </span>
                    <span className="truncate max-w-[105px] text-right">
                      {camps.find(c => c.id === selectedVehicle.assignedCampId)?.name?.replace(' Community Eye Camp', '')?.replace(' Rural Vision & Cataract Camp', '')?.replace(' Outreach Centre', '') || 'Camp'}
                    </span>
                  </div>

                  <div className="relative mt-1 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div 
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-400 to-emerald-400 transition-all duration-500"
                      style={{ 
                        width: `${Math.min(96, Math.max(8, Math.round(
                          ((selectedVehicle.roadDistFromBaseKm || 16) / ((selectedVehicle.totalRoadKm || 34.8) || 1)) * 100
                        )))}%` 
                      }}
                    />
                  </div>
                </div>
              )}

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
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Speed</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white font-mono">
                    {selectedVehicle.speed} km/h
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cellular Signal</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white font-mono flex items-center gap-1">
                    <Signal className="w-3 h-3 text-emerald-500" />
                    {selectedVehicle.network || '4G LTE'} • {selectedVehicle.pingMs || 38}ms
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Driver Assigned</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white truncate block">
                    {selectedVehicle.driverName || 'Driver'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Coordinates</span>
                  <span className="text-xs font-bold text-sky-700 dark:text-cyan-400 font-mono">
                    {selectedVehicle.lat.toFixed(4)}°, {selectedVehicle.lon.toFixed(4)}°
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
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                            Driver: <strong className="text-slate-800 dark:text-white">{v.driverName}</strong>
                          </div>
                          <div className="text-[9.5px] font-mono text-slate-400 truncate">
                            {v.lat.toFixed(4)}° N, {v.lon.toFixed(4)}° E
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200/80 dark:border-sky-800 text-sky-700 dark:text-cyan-400 text-[10px] font-bold hover:bg-sky-100 transition-colors flex items-center gap-1 shadow-2xs"
                          title="Navigate in Google Maps"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>Maps</span>
                        </a>
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
