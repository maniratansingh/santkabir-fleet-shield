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
  ShieldCheck,
  QrCode
} from 'lucide-react';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';
import { getNearestRuralLocation } from '../utils/ruralLocator';
import { getUniqueVehicleColor } from '../utils/colors';
import { getFleetState, countFleetStates, sortVehiclesByPriority } from '../utils/fleetStatus';
import ProvisioningQrModal from './ProvisioningQrModal';
import { useDraggableSheet } from '../hooks/useDraggableSheet';

const STATE_TEXT = {
  no_signal: 'text-amber-600 dark:text-amber-400',
  moving: 'text-emerald-600 dark:text-emerald-400',
  on_scene: 'text-slate-500 dark:text-slate-400',
  returning: 'text-sky-600 dark:text-sky-400',
  at_base: 'text-rose-600 dark:text-rose-400',
};

const STATE_DOT = {
  no_signal: 'bg-amber-500',
  moving: 'bg-emerald-500',
  on_scene: 'bg-slate-400',
  returning: 'bg-sky-500',
  at_base: 'bg-rose-500',
};

function getVehicleDistance(v) {
  if (!v) return 0;
  if (typeof v.roadDistFromBaseKm === 'number' && v.roadDistFromBaseKm > 0) {
    return v.roadDistFromBaseKm;
  }
  const dist = calculateDistanceKm(BASE_HOSPITAL.lat, BASE_HOSPITAL.lon, Number(v.lat || 0), Number(v.lon || 0));
  return Math.round(dist * 1.15 * 10) / 10;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'Live Active';
  const diffSec = Math.max(1, Math.round((Date.now() - lastSeen) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  return `${diffHr}h ago`;
}

// Ultra-fast memoized row (0ms re-render overhead per ambulance card)
const AmbulanceRow = React.memo(function AmbulanceRow({
  v,
  isSelected,
  onSelectVehicle,
  openProvision,
}) {
  const uniqueColors = getUniqueVehicleColor(v.id);
  const vColor = v.lineColor || uniqueColors.line;
  const distKm = v.roadDistFromBaseKm || getVehicleDistance(v);
  const state = getFleetState(v);
  const locationLabel = (v.lat && v.lon)
    ? getNearestRuralLocation(Number(v.lat), Number(v.lon)).badge
    : (v.villageBadge || 'Purvanchal region');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${v.id}, ${state.label}, ${v.speed > 0 ? `${v.speed} kilometres per hour` : 'stationary'}, ${locationLabel}, ${distKm} kilometres from base`}
      onClick={() => onSelectVehicle(v.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectVehicle(v.id);
        }
      }}
      className={`px-3 py-2.5 rounded-[14px] border transition-all cursor-pointer flex items-center justify-between group ${
        isSelected
          ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 dark:border-sky-600 shadow-xs'
          : 'bg-white/80 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 hover:border-slate-400'
      }`}
    >
      {/* Left: identifier, speed and village */}
      <div className="flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: vColor, boxShadow: `0 0 6px ${vColor}88` }}
          />
          <span className="type-footnote font-mono font-bold text-slate-900 dark:text-white shrink-0 tnum">
            {v.id}
          </span>
          <span className={`type-caption font-semibold shrink-0 ${STATE_TEXT[state.key]}`}>
            {state.label}
          </span>
          <span className="type-caption font-mono text-slate-500 dark:text-slate-400 truncate tnum">
            {v.speed > 0 ? `${v.speed} km/h` : '—'}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-1 pl-[18px]">
          <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="type-caption font-medium text-slate-600 dark:text-slate-300 truncate">
            {locationLabel} · {distKm} km
          </span>
        </div>
      </div>

      {/* Right: quick actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openProvision(v.id);
          }}
          aria-label={`Provision ${v.id}`}
          className="hidden sm:flex w-8 h-8 rounded-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 items-center justify-center transition-colors cursor-pointer"
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        {v.driverPhone && (
          <a
            href={`tel:${v.driverPhone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${v.driverName || v.id}`}
            className="w-8 h-8 rounded-[10px] bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
          </a>
        )}

        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Navigate to ${v.id} in Google Maps`}
          className="w-8 h-8 rounded-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
        >
          <Navigation className="w-3.5 h-3.5" />
        </a>

        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-sky-500 transition-colors" />
      </div>
    </div>
  );
});

function AppleSheet({
  vehicles = [],
  selectedVehicleId = null,
  onSelectVehicle,
  onFocusRoute,
  onLocateVehicle,
  onFitRoute,
  onFocusDistance,
  onOpenProvisionModal,
  detent = 'peek', // 'peek', 'half', 'full'
  onChangeDetent,
  connectionState = 'connecting',
}) {
  const [filter, setFilter] = useState('all'); // all | enroute | onscene | nosignal
  const [qrModalVehicleId, setQrModalVehicleId] = useState(null);

  const openProvision = (id) => {
    if (onOpenProvisionModal) onOpenProvisionModal(id);
    else setQrModalVehicleId(id);
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const selectedState = selectedVehicle ? getFleetState(selectedVehicle) : null;
  const { height, isDragging, isExpanded, handleProps } = useDraggableSheet({
    detent,
    onChangeDetent,
  });

  // Operational counts shared with the header.
  const counts = countFleetStates(vehicles);
  const enRouteCount = counts.enRoute;
  const onSceneCount = counts.on_scene;
  const atBaseCount = counts.at_base;
  const signalGapCount = counts.no_signal;

  const filteredVehicles = vehicles.filter((v) => {
    const state = getFleetState(v);
    if (filter === 'enroute') return state.key === 'moving' || state.key === 'returning';
    if (filter === 'onscene') return state.key === 'on_scene';
    if (filter === 'nosignal') return state.key === 'no_signal';
    return true;
  });
  const sortedVehicles = sortVehiclesByPriority(filteredVehicles);

  return (
    <div
      className={`fixed bottom-[calc(0.75rem+var(--safe-bottom))] left-[calc(0.75rem+var(--safe-left))] z-30 pointer-events-auto w-[92vw] sm:w-[380px] glass-panel rounded-[24px] shadow-xl border border-slate-200/90 dark:border-white/10 flex flex-col overflow-hidden ${isDragging ? 'select-none' : ''}`}
      style={{ height }}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...handleProps}
        aria-label={detent === 'full' ? 'Collapse fleet panel' : 'Expand fleet panel'}
        aria-expanded={isExpanded}
        className="w-full min-h-8 pt-2.5 pb-2.5 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing group"
      >
        <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-sky-500 transition-colors" />
      </button>

      {/* Peek */}
      {!isExpanded && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onChangeDetent('half')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChangeDetent('half');
            }
          }}
          aria-label={selectedVehicle
            ? `${selectedVehicle.name}, driver ${selectedVehicle.driverName}, ${selectedVehicle.speed} kilometres per hour, view fleet list`
            : `Fleet overview, ${vehicles.length} ambulances, ${enRouteCount} en route, ${onSceneCount} on scene, ${atBaseCount} at base, view fleet list`}
          className="px-4 pb-2 flex-1 flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-500/10 dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center justify-center font-semibold type-footnote tnum shrink-0">
              {vehicles.length}
            </div>
            <div className="min-w-0">
              <span className="type-subhead text-slate-900 dark:text-white block leading-tight truncate">
                {selectedVehicle ? selectedVehicle.name : 'Fleet overview'}
              </span>
              <span className="type-caption text-slate-500 dark:text-slate-400 truncate block mt-0.5">
                {selectedVehicle
                  ? `Driver: ${selectedVehicle.driverName} · ${selectedVehicle.speed} km/h`
                  : vehicles.length === 0
                    ? connectionState === 'offline'
                      ? 'Telemetry offline · retrying'
                      : connectionState === 'connecting'
                        ? 'Connecting to fleet…'
                        : 'Hospital base standby · Ready for GPS telemetry'
                    : `${enRouteCount} en route${onSceneCount > 0 ? ` · ${onSceneCount} on scene` : ''}${atBaseCount > 0 ? ` · ${atBaseCount} at base` : ''}`}
              </span>
            </div>
          </div>
          <span className="type-footnote font-semibold text-sky-600 dark:text-cyan-400 flex items-center shrink-0">
            View <ChevronRight className="w-4 h-4 ml-0.5" />
          </span>
        </div>
      )}

      {/* DETENT = HALF OR FULL */}
      {isExpanded && (
        <div className="flex-1 flex flex-col overflow-hidden px-3.5 pb-3">
          {/* VIEW A: SELECTED VEHICLE (AirTag Precision Item Platter) */}
          {selectedVehicle ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Top Navigation Row */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onSelectVehicle(null)}
                  className="flex items-center gap-1 type-footnote font-semibold text-sky-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  All ambulances
                </button>
                <button
                  type="button"
                  onClick={() => onSelectVehicle(null)}
                  aria-label="Close vehicle details"
                  className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Vehicle hero */}
              <div className="py-3 flex items-start gap-3">
                <div className="w-12 h-12 rounded-[14px] bg-slate-500/10 dark:bg-white/10 border border-slate-200/70 dark:border-white/10 flex items-center justify-center shrink-0">
                  <Ambulance
                    className="w-6 h-6"
                    style={{ color: selectedVehicle.lineColor || '#007AFF' }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="type-headline text-slate-900 dark:text-white truncate font-mono tnum">
                      {selectedVehicle.id}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 type-caption font-semibold ${STATE_TEXT[selectedState.key]}`}>
                        <span className={`ui-status-dot ${STATE_DOT[selectedState.key]}`} aria-hidden="true" />
                        {selectedState.label}
                      </span>
                      <div className="ui-chip tnum">
                        <Battery className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>{selectedVehicle.battery ?? selectedVehicle.batt ?? 100}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="type-footnote text-slate-500 dark:text-slate-400 mt-1 truncate">
                    Driver:{' '}
                    <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                      {selectedVehicle.driverName || 'Assigned driver'}
                    </strong>
                  </div>
                  <div className="type-caption text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {selectedVehicle.highwayName || selectedVehicle.sector || 'Rural outreach sector'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Provisioning shortcut */}
              <button
                type="button"
                onClick={() => openProvision(selectedVehicle.id)}
                className="ui-card-muted w-full my-1.5 py-2 px-3 flex items-center justify-between transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-[10px] bg-slate-500/10 dark:bg-white/10 flex items-center justify-center">
                    <QrCode className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div className="text-left">
                    <span className="type-footnote font-semibold text-slate-900 dark:text-white block leading-none">
                      Provision Android app
                    </span>
                    <span className="type-caption text-slate-500 dark:text-slate-400 font-normal">
                      One-scan QR for ML Kit
                    </span>
                  </div>
                </div>
                <span className="ui-chip bg-transparent dark:bg-transparent">
                  Scan QR
                  <span aria-hidden="true">↗</span>
                </span>
              </button>

              {/* Driver contact */}
              <div className="ui-card p-3 flex items-center justify-between my-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-[12px] text-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: selectedVehicle.lineColor || '#007AFF' }}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="ui-section-label">
                      Ambulance driver
                    </div>
                    <div className="type-subhead text-slate-900 dark:text-white truncate mt-0.5">
                      {selectedVehicle.driverName || 'Driver'}
                    </div>
                    <div className="type-caption font-mono text-slate-500 dark:text-slate-400 tnum">
                      {selectedVehicle.driverPhone || '+91 94151 40719'}
                    </div>
                  </div>
                </div>

                {selectedVehicle.driverPhone && (
                  <a
                    href={`tel:${selectedVehicle.driverPhone}`}
                    aria-label={`Call ${selectedVehicle.driverName || 'driver'}`}
                    className="ui-btn ui-btn-sm ui-btn-success shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call driver</span>
                  </a>
                )}
              </div>

              {/* Live position and navigation */}
              <div className="ui-card my-2 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="type-subhead text-slate-800 dark:text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Live position</span>
                  </div>
                  <span className="ui-chip font-mono tnum">
                    {Number(selectedVehicle.lat || 0).toFixed(5)}° N, {Number(selectedVehicle.lon || 0).toFixed(5)}° E
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedVehicle.lat},${selectedVehicle.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn-primary"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>Google Maps</span>
                  </a>
                  <a
                    href={`https://maps.apple.com/?daddr=${selectedVehicle.lat},${selectedVehicle.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ui-btn ui-btn-secondary"
                  >
                    <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>Apple Maps</span>
                  </a>
                </div>
              </div>

              {/* Road Highway Distance from Base Hospital */}
              {selectedVehicle.status !== 'at_base' && (
                <div
                  className="my-1.5 p-3 rounded-[14px] border"
                  style={{
                    backgroundColor: `${selectedVehicle.lineColor || '#007AFF'}0D`,
                    borderColor: `${selectedVehicle.lineColor || '#007AFF'}26`
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedVehicle.lineColor || '#007AFF' }}
                      />
                      <span className="ui-section-label truncate" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                        {(selectedVehicle.lat && selectedVehicle.lon)
                          ? getNearestRuralLocation(Number(selectedVehicle.lat), Number(selectedVehicle.lon)).badge
                          : (selectedVehicle.villageBadge || 'En route')}
                      </span>
                    </div>
                    <span className="type-subhead font-mono tnum shrink-0" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                      {getVehicleDistance(selectedVehicle)} km
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 type-caption text-slate-500 dark:text-slate-400">
                    <span className="truncate">Base hospital</span>
                    <span className="font-mono font-semibold tnum shrink-0" style={{ color: selectedVehicle.lineColor || '#007AFF' }}>
                      {selectedVehicle.speed > 0 ? `${selectedVehicle.speed} km/h` : 'Active'}
                    </span>
                    <span className="truncate max-w-[140px] font-medium text-slate-700 dark:text-slate-200">
                      {selectedVehicle.villageName ? selectedVehicle.villageName : (selectedVehicle.highwayName || 'Highway sector')}
                    </span>
                  </div>

                  <div className="relative mt-2 w-full h-1.5 rounded-full bg-slate-500/15 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(12, Math.round(
                          (getVehicleDistance(selectedVehicle) / ((selectedVehicle.totalRoadKm || 40) || 1)) * 100
                        )))}%`,
                        backgroundColor: selectedVehicle.lineColor || '#007AFF'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-4 gap-1.5 my-2 py-2.5 px-2 ui-card-muted">
                <button
                  type="button"
                  onClick={onLocateVehicle || onFocusRoute}
                  className="flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Zoom to vehicle GPS position"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Locate</span>
                </button>

                <button
                  type="button"
                  onClick={onFitRoute || onFocusRoute}
                  className="flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Frame the full highway corridor to base"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <Navigation className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Route</span>
                </button>

                <a
                  href={`tel:${selectedVehicle.driverPhone || '+919415140719'}`}
                  className="flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                >
                  <span className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Phone className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Call</span>
                </a>

                <button
                  type="button"
                  onClick={() => openProvision(selectedVehicle.id)}
                  className="flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Generate Android app provisioning QR"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <QrCode className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">QR</span>
                </button>
              </div>

              {/* Micro telemetry */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="ui-card p-2.5">
                  <span className="ui-section-label block">Speed</span>
                  <span className="type-subhead text-slate-800 dark:text-white font-mono tnum mt-0.5 block">
                    {selectedVehicle.speed} km/h
                  </span>
                </div>
                <div className="ui-card p-2.5">
                  <span className="ui-section-label block">Last update</span>
                  <span className="type-subhead text-slate-800 dark:text-white font-mono tnum mt-0.5 flex items-center gap-1">
                    <Signal className="w-3 h-3 text-emerald-500" />
                    {formatLastSeen(selectedVehicle.lastSeen)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* VIEW B: FLEET LIST OVERVIEW */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter tabs */}
              <div className="flex items-center gap-1 p-1 rounded-[12px] bg-slate-500/10 mb-2">
                {[
                  { key: 'all', label: `All (${vehicles.length})` },
                  { key: 'enroute', label: 'En route' },
                  { key: 'onscene', label: 'On scene' },
                  { key: 'nosignal', label: 'No signal' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    aria-pressed={filter === tab.key}
                    className={`flex-1 min-h-[30px] py-1 type-footnote font-semibold rounded-[9px] transition-all cursor-pointer ${
                      filter === tab.key
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Vehicle list */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {filteredVehicles.length === 0 ? (
                  vehicles.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center">
                      <div className="w-12 h-12 rounded-[14px] bg-slate-500/10 text-slate-500 dark:text-slate-300 flex items-center justify-center mb-3">
                        <Ambulance className="w-6 h-6" />
                      </div>
                      <span className="type-subhead text-slate-800 dark:text-slate-100">
                        {connectionState === 'offline'
                          ? 'Telemetry offline'
                          : connectionState === 'connecting'
                            ? 'Connecting…'
                            : 'Hospital base standby'}
                      </span>
                      <span className="type-footnote text-slate-500 dark:text-slate-400 mt-1 max-w-[250px] leading-relaxed">
                        {connectionState === 'offline'
                          ? 'The fleet backend is unreachable. The board retries automatically and will populate as soon as telemetry returns.'
                          : connectionState === 'connecting'
                            ? 'Checking the fleet backend and live telemetry. This usually takes a few seconds.'
                            : 'No active ambulances are reporting. Live telemetry appears automatically as GPS packets arrive.'}
                      </span>

                      <button
                        type="button"
                        onClick={() => openProvision('AMB-01')}
                        className="ui-btn ui-btn-primary mt-3"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Provision ambulance</span>
                      </button>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center">
                      <div className="w-12 h-12 rounded-[14px] bg-slate-500/10 text-slate-500 dark:text-slate-300 flex items-center justify-center mb-3">
                        <Ambulance className="w-6 h-6" />
                      </div>
                      <span className="type-subhead text-slate-800 dark:text-slate-100">
                        No ambulances in this filter
                      </span>
                      <span className="type-footnote text-slate-500 dark:text-slate-400 mt-1 max-w-[250px] leading-relaxed">
                        Try another operational state, or return to the full fleet.
                      </span>
                      <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className="ui-btn ui-btn-secondary mt-3"
                      >
                        Show all ambulances
                      </button>
                    </div>
                  )
                ) : (
                  sortedVehicles.map((v) => (
                    <AmbulanceRow
                      key={v.id}
                      v={v}
                      isSelected={selectedVehicleId === v.id}
                      onSelectVehicle={onSelectVehicle}
                      openProvision={openProvision}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 mt-1 border-t border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between type-caption text-slate-500 dark:text-slate-400 shrink-0 select-none gap-2">
            <span className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="ui-status-dot bg-emerald-500" aria-hidden="true"></span>
              Sant Kabir Eye Hospital
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <span className="hidden sm:inline">Engineered by</span>
              <a
                href="https://mrps.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-cyan-400 transition-colors"
              >
                Mani Ratan Singh
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://mrps.in"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-cyan-400 hover:underline"
              >
                mrps.in
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Fallback Android Device Provisioning QR Code Modal (if not handled by root App) */}
      {!onOpenProvisionModal && (
        <ProvisioningQrModal
          isOpen={Boolean(qrModalVehicleId)}
          onClose={() => setQrModalVehicleId(null)}
          initialVehicleId={qrModalVehicleId}
          availableVehicles={vehicles}
        />
      )}
    </div>
  );
}

export default React.memo(AppleSheet);
