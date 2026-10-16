import React, { useState } from 'react';
import { 
  Ambulance, 
  MapPin, 
  Phone, 
  Battery, 
  Signal, 
  Navigation, 
  ChevronRight, 
  ChevronLeft, 
  Volume2, 
  Ruler, 
  User, 
  UserCheck,
  X, 
  Clock, 
  ShieldCheck
} from 'lucide-react';
import { playCampArrivalChime } from '../utils/audio';

export default function AppleSheet({
  vehicles = [],
  selectedVehicleId = null,
  onSelectVehicle,
  onFocusRoute,
  onFocusDistance,
  detent = 'half', // 'peek', 'half', 'full'
  onChangeDetent,
}) {
  const [filter, setFilter] = useState('all'); // 'all', 'moving', 'in_field', 'at_base'

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
    if (filter === 'in_field') return v.status === 'in_field';
    if (filter === 'at_base') return v.status === 'at_base';
    return true;
  });

  // Determine height classes based on detent
  const getDetentHeightClass = () => {
    if (detent === 'peek') return 'h-16';
    if (detent === 'half') return 'h-[420px]';
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
                {selectedVehicle ? selectedVehicle.name : 'Sant Kabir Eye Hospital Fleet'}
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {selectedVehicle 
                  ? `Driver: ${selectedVehicle.driverName} • ${selectedVehicle.speed} km/h` 
                  : vehicles.length === 0
                    ? 'Hospital Base Standby • Ready for GPS telemetry'
                    : `${vehicles.filter(v => v.status === 'moving').length} en route • Tap to expand`}
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
                  All Ambulances
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
                      <span>{selectedVehicle.battery || 88}%</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono">
                    Plate: <strong className="text-slate-800 dark:text-slate-200">{selectedVehicle.plate || 'UP-51-AT-4211'}</strong>
                  </div>
                  <div className="text-[11px] text-sky-600 dark:text-cyan-400 font-medium flex items-center gap-1 mt-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      Sector: {selectedVehicle.sector || selectedVehicle.highwayName || 'Rural Outreach'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dedicated Driver Contact Card (Only Driver Call Option) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between my-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div 
                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 shadow-sm"
                    style={{ backgroundColor: selectedVehicle.lineColor || '#007AFF' }}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      Ambulance Driver
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {selectedVehicle.driverName || 'Driver'}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {selectedVehicle.driverPhone || '+91 94151 40719'}
                    </div>
                  </div>
                </div>

                {selectedVehicle.driverPhone && (
                  <a
                    href={`tel:${selectedVehicle.driverPhone}`}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-transform active:scale-95 cursor-pointer shrink-0"
                    title={`Call Driver (${selectedVehicle.driverName})`}
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Driver</span>
                  </a>
                )}
              </div>

              {/* Accurate Live GPS & 1-Click Navigation */}
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

              {/* Road Highway Distance from Base Hospital */}
              {selectedVehicle.status !== 'at_base' && (
                <div 
                  className="my-1.5 p-3 rounded-2xl border shadow-xs"
                  style={{
                    backgroundColor: `${selectedVehicle.lineColor || '#007AFF'}10`,
                    borderColor: `${selectedVehicle.lineColor || '#007AFF'}35`
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: selectedVehicle.lineColor || '#007AFF' }}></span>
                      <span className="text-[10px] font-bold uppercase tracking-wider font-mono" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                        {selectedVehicle.status === 'returning' ? 'Returning to Base Hospital' : 'En Route in Sector'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold font-mono" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                        {selectedVehicle.roadDistFromBaseKm || 0} KM ROAD
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    <span>Sant Kabir Eye Hospital (0 km)</span>
                    <span className="font-mono font-bold" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                      {selectedVehicle.speed > 0 ? `${selectedVehicle.speed} km/h` : 'Active'}
                    </span>
                    <span>{selectedVehicle.highwayName || 'Highway'}</span>
                  </div>

                  <div className="relative mt-1 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${Math.min(100, Math.max(12, Math.round(
                          ((selectedVehicle.roadDistFromBaseKm || 16) / ((selectedVehicle.totalRoadKm || 40) || 1)) * 100
                        )))}%`,
                        backgroundColor: selectedVehicle.lineColor || '#007AFF'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Apple Signature Action Platter */}
              <div className="grid grid-cols-3 gap-2 my-2 py-2.5 px-2 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
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

                {/* 2. Focus Route Corridor */}
                <button
                  onClick={onFocusRoute}
                  className="flex flex-col items-center gap-1 text-center cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-xs flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">Route Trail</span>
                </button>

                {/* 3. Call Driver Direct */}
                <a
                  href={`tel:${selectedVehicle.driverPhone || '+919415140719'}`}
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
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cellular Link</span>
                  <span className="text-xs font-bold text-slate-800 dark:text-white font-mono flex items-center gap-1">
                    <Signal className="w-3 h-3 text-emerald-500" />
                    {selectedVehicle.network || '4G LTE'} • {selectedVehicle.pingMs || 38}ms
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW B: FLEET LIST OVERVIEW */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Tabs (No At Base Tab) */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 mb-2">
                {[
                  { key: 'all', label: `All (${vehicles.length})` },
                  { key: 'moving', label: 'En Route' },
                  { key: 'in_field', label: 'In Field' },
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
                {filteredVehicles.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-cyan-400 flex items-center justify-center mb-2.5 shadow-xs border border-sky-200/60 dark:border-sky-800/40">
                      <Ambulance className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      Hospital Base Standby
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[250px] leading-relaxed">
                      Zero active ambulances reporting. Live telemetry will appear automatically once drivers open Fleet Shield APK.
                    </span>
                  </div>
                ) : (
                  filteredVehicles.map((v) => {
                  const isMoving = v.status === 'moving' || v.status === 'returning';
                  const vColor = v.lineColor || '#007AFF';

                  return (
                    <div
                      key={v.id}
                      onClick={() => onSelectVehicle(v.id)}
                      className="p-2.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 hover:border-slate-400 transition-all cursor-pointer flex items-center justify-between group shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Ambulance Icon Tinted by Vehicle Unique Line Color */}
                        <div 
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
                          style={{
                            backgroundColor: `${vColor}15`,
                            color: vColor,
                            border: `1px solid ${vColor}30`,
                          }}
                        >
                          <Ambulance className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {v.name}
                            </span>
                            {isMoving && (
                              <span className="text-[10px] font-mono font-semibold" style={{ color: vColor }}>
                                {v.speed} km/h
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-slate-600 dark:text-slate-300 truncate">
                            Driver: <strong className="text-slate-800 dark:text-white">{v.driverName}</strong>
                          </div>
                          <div className="text-[9.5px] font-mono text-slate-400 truncate">
                            {v.lat.toFixed(4)}° N, {v.lon.toFixed(4)}° E
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Quick 1-Tap Driver Call Button */}
                        {v.driverPhone && (
                          <a
                            href={`tel:${v.driverPhone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center transition-colors shadow-2xs"
                            title={`Call Driver (${v.driverName})`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Navigation in Google Maps */}
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
                }))}
              </div>
            </div>
          )}

          {/* Clinical Developer Plaque by Mani Ratan Singh */}
          <div className="pt-2 mt-1 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 shrink-0 select-none">
            <span className="flex items-center gap-1 font-mono text-[9px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Sant Kabir Hospital (PIECS)
            </span>
            <div className="flex items-center gap-1">
              <span>Engineered by</span>
              <a
                href="https://mrps.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-slate-800 dark:text-white hover:text-sky-600 dark:hover:text-cyan-400 transition-colors"
              >
                Mani Ratan Singh
              </a>
              <span>•</span>
              <a
                href="https://github.com/maniratansingh"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 dark:text-cyan-400 hover:underline"
              >
                mrps.in
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
