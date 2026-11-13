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
  QrCode,
  Trash2,
  Share2,
  Pin,
  PinOff
} from 'lucide-react';
import { BASE_HOSPITAL, calculateDistanceKm } from '../data/mockData';
import { getNearestRuralLocation } from '../utils/ruralLocator';
import { getUniqueVehicleColor } from '../utils/colors';
import { getFleetState, countFleetStates, sortVehiclesByPriority } from '../utils/fleetStatus';
import { formatVehicleAge } from '../utils/vehicleState';
import ProvisioningQrModal from './ProvisioningQrModal';
import { useDraggableSheet } from '../hooks/useDraggableSheet';

const STATE_TEXT = {
  no_signal: 'text-amber-600 dark:text-amber-400',
  moving: 'text-emerald-600 dark:text-emerald-400',
  on_scene: 'text-slate-500 dark:text-slate-400',
  returning: 'text-sky-600 dark:text-sky-400',
  at_base: 'text-rose-600 dark:text-rose-400',
  offline: 'text-slate-500 dark:text-slate-400',
};

const STATE_DOT = {
  no_signal: 'bg-amber-500',
  moving: 'bg-emerald-500',
  on_scene: 'bg-slate-400',
  returning: 'bg-sky-500',
  at_base: 'bg-rose-500',
  offline: 'bg-slate-500',
};

function getVehicleDistance(v) {
  if (!v) return 0;
  if (typeof v.roadDistFromBaseKm === 'number' && v.roadDistFromBaseKm > 0) {
    return v.roadDistFromBaseKm;
  }
  const dist = calculateDistanceKm(BASE_HOSPITAL.lat, BASE_HOSPITAL.lon, Number(v.lat || 0), Number(v.lon || 0));
  return Math.round(dist * 1.15 * 10) / 10;
}

// Ultra-fast memoized row (0ms re-render overhead per ambulance card)
const AmbulanceRow = React.memo(function AmbulanceRow({
  v,
  isSelected,
  onSelectVehicle,
  openProvision,
  onRemoveVehicle,
  onShareVehicle,
  isPinned = false,
  onTogglePin,
}) {
  const uniqueColors = getUniqueVehicleColor(v.id);
  const vColor = v.lineColor || uniqueColors.line;
  const distKm = v.roadDistFromBaseKm || getVehicleDistance(v);
  const state = getFleetState(v);
  const isOffline = state.key === 'offline';
  const dotColor = isOffline ? '#64748B' : vColor;
  const locationLabel = (v.lat && v.lon)
    ? getNearestRuralLocation(Number(v.lat), Number(v.lon)).badge
    : (v.villageBadge || 'Purvanchal region');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${v.id}, ${state.label}, ${isOffline ? `last seen ${formatVehicleAge(v)}` : (v.speed > 0 ? `${v.speed} kilometres per hour` : 'stationary')}, ${locationLabel}, ${distKm} kilometres from base`}
      onClick={() => onSelectVehicle(v.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectVehicle(v.id);
        }
      }}
      className={`ui-press-row px-3 py-2.5 rounded-[14px] border cursor-pointer flex items-center justify-between group ${
        isSelected
          ? 'bg-sky-50 dark:bg-sky-950 border-sky-400 dark:border-sky-600 shadow-xs'
          : isOffline
            ? 'bg-slate-50 dark:bg-[#0d1727] border-slate-200/70 dark:border-slate-800 hover:border-slate-400'
            : 'bg-white dark:bg-[#0f1d31] border-slate-200/70 dark:border-slate-800 hover:border-slate-400'
      }`}
    >
      {/* Left: identifier, speed and village */}
      <div className="flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}
          />
          <span className={`type-footnote font-mono font-bold shrink-0 tnum ${isOffline ? 'text-slate-600 dark:text-slate-300' : 'text-slate-900 dark:text-white'}`}>
            {v.id}
          </span>
          <span className={`type-caption font-semibold shrink-0 ${STATE_TEXT[state.key]}`}>
            {state.label}
          </span>
          <span className="type-caption font-mono text-slate-500 dark:text-slate-400 truncate tnum">
            {v.speed > 0 && !isOffline ? `${v.speed} km/h` : '—'}
          </span>
        </div>

        <div className="flex items-center gap-1 mt-1 pl-[18px]">
          <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="type-caption font-medium text-slate-600 dark:text-slate-300 truncate">
            {locationLabel} · {distKm} km
          </span>
        </div>

        {isOffline && (
          <div className="flex items-center gap-1 mt-0.5 pl-[18px]">
            <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
            <span className="type-caption font-medium text-slate-500 dark:text-slate-400 truncate">
              Last seen {formatVehicleAge(v)}
            </span>
          </div>
        )}
      </div>

      {/* Right: quick actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(v.id);
            }}
            aria-label={isPinned ? `Unpin ${v.id} from TV tour` : `Pin ${v.id} to TV tour`}
            title={isPinned ? 'Pinned to TV auto-tour — tap to unpin' : 'Pin to TV auto-tour'}
            className={`touch-target ui-press w-9 h-9 rounded-[10px] flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
              isPinned
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>
        )}
        {onShareVehicle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShareVehicle(v.id);
            }}
            aria-label={`Share ${v.id} live tracking`}
            title="Share live tracking link"
            className="touch-target ui-press w-9 h-9 rounded-[10px] bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/50 dark:hover:bg-sky-900/70 text-sky-600 dark:text-sky-400 flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openProvision(v.id);
          }}
          aria-label={`Provision ${v.id}`}
          className="touch-target ui-press hidden sm:flex w-9 h-9 rounded-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 items-center justify-center transition-colors cursor-pointer"
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        {isOffline && onRemoveVehicle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveVehicle(v.id);
            }}
            aria-label={`Remove ${v.id} from the fleet`}
            title="Remove this driver record"
            className="touch-target ui-press w-9 h-9 rounded-[10px] bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/70 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        {v.driverPhone && (
          <a
            href={`tel:${v.driverPhone}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${v.driverName || v.id}`}
            className="touch-target ui-press w-9 h-9 rounded-[10px] bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors"
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
          className="touch-target ui-press w-9 h-9 rounded-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors"
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
  onRemoveVehicle,
  onShareVehicle,
  pinnedVehicleIds = [],
  onTogglePin,
  sharedView = false,
  onExitSharedView,
  detent = 'peek', // 'peek', 'half', 'full'
  onChangeDetent,
  filter: controlledFilter,
  onChangeFilter,
  connectionState = 'connecting',
}) {
  const [internalFilter, setInternalFilter] = useState('all'); // all | enroute | onscene | nosignal
  const [qrModalVehicleId, setQrModalVehicleId] = useState(null);
  const filter = controlledFilter ?? internalFilter;
  const setFilter = (next) => {
    setInternalFilter(next);
    onChangeFilter?.(next);
  };

  const openProvision = (id) => {
    if (onOpenProvisionModal) onOpenProvisionModal(id);
    else setQrModalVehicleId(id);
  };

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const selectedVehiclePinned = Boolean(selectedVehicle && pinnedVehicleIds.includes(selectedVehicle.id));
  const selectedDriverName = selectedVehicle?.driverName?.trim() || '';
  const showSelectedDriver = Boolean(selectedDriverName) && selectedDriverName.toUpperCase() !== String(selectedVehicle?.id || '').toUpperCase();
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
  const offlineCount = counts.offline;

  const filteredVehicles = vehicles.filter((v) => {
    const state = getFleetState(v);
    if (filter === 'enroute') return state.key === 'moving' || state.key === 'returning';
    if (filter === 'onscene') return state.key === 'on_scene';
    if (filter === 'nosignal') return state.key === 'no_signal';
    if (filter === 'offline') return state.key === 'offline';
    return true;
  });
  const sortedVehicles = sortVehiclesByPriority(filteredVehicles);

  return (
    <div
      className={`fixed bottom-[calc(0.75rem+var(--safe-bottom))] max-sm:bottom-[calc(4.75rem+var(--safe-bottom))] left-[calc(0.75rem+var(--safe-left))] z-30 pointer-events-auto w-[92vw] sm:w-[380px] glass-panel rounded-[24px] shadow-xl border border-slate-200/90 dark:border-white/10 flex flex-col overflow-hidden ${isDragging ? 'select-none' : ''}`}
      style={{ height }}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...handleProps}
        aria-label={detent === 'full' ? 'Collapse fleet panel' : 'Expand fleet panel'}
        aria-expanded={isExpanded}
        className="w-full min-h-10 pt-3 pb-3 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing group"
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
            ? `${selectedVehicle.name}${showSelectedDriver ? `, driver ${selectedDriverName}` : ''}, ${selectedVehicle.speed} kilometres per hour, view fleet list`
            : `Fleet overview, ${vehicles.length} ambulances, ${enRouteCount} en route, ${onSceneCount} on scene, ${atBaseCount} at base, view fleet list`}
          className="ui-press-row px-4 pb-2 flex-1 flex items-center justify-between cursor-pointer select-none"
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
                  ? `${showSelectedDriver ? `Driver: ${selectedDriverName} · ` : ''}${selectedVehicle.speed} km/h`
                  : vehicles.length === 0
                    ? connectionState === 'offline'
                      ? 'Telemetry offline · retrying'
                      : connectionState === 'connecting'
                        ? 'Connecting to fleet…'
                        : 'Hospital base standby · Ready for GPS telemetry'
                    : `${enRouteCount} en route${onSceneCount > 0 ? ` · ${onSceneCount} on scene` : ''}${atBaseCount > 0 ? ` · ${atBaseCount} at base` : ''}${offlineCount > 0 ? ` · ${offlineCount} offline` : ''}`}
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1 shrink-0">
            {selectedVehicle && onShareVehicle && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onShareVehicle(selectedVehicle.id);
                }}
                aria-label={`Share ${selectedVehicle.id} live tracking`}
                title="Share live tracking link"
                className="touch-target ui-press flex h-8 w-8 items-center justify-center rounded-full text-sky-600 hover:bg-sky-500/10 dark:text-cyan-400"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="type-footnote font-semibold text-sky-600 dark:text-cyan-400 flex items-center">
              View <ChevronRight className="w-4 h-4 ml-0.5" />
            </span>
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
                  onClick={sharedView ? onExitSharedView : () => onSelectVehicle(null)}
                  className="touch-target ui-press flex items-center gap-1 type-footnote font-semibold text-sky-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {sharedView ? 'Full fleet' : 'All ambulances'}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onTogglePin?.(selectedVehicle.id)}
                    aria-label={selectedVehiclePinned ? `Unpin ${selectedVehicle.id} from TV tour` : `Pin ${selectedVehicle.id} to TV tour`}
                    title={selectedVehiclePinned ? 'Pinned to TV auto-tour — tap to unpin' : 'Pin to TV auto-tour'}
                    className={`touch-target ui-press p-1.5 rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
                      selectedVehiclePinned
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'text-slate-500 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-300 hover:bg-slate-500/10'
                    }`}
                  >
                    {selectedVehiclePinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={sharedView ? onExitSharedView : () => onSelectVehicle(null)}
                    aria-label="Close vehicle details"
                    className="touch-target ui-press p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-500/10 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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
                  {showSelectedDriver && (
                    <div className="type-footnote text-slate-500 dark:text-slate-400 mt-1 truncate">
                      Driver:{' '}
                      <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                        {selectedDriverName}
                      </strong>
                    </div>
                  )}
                  <div className="type-caption text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {selectedVehicle.highwayName || selectedVehicle.sector || 'Rural outreach sector'}
                    </span>
                  </div>
                  {sharedView && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400">
                      <Share2 className="w-2.5 h-2.5" />
                      Shared live view
                    </div>
                  )}
                  {selectedVehiclePinned && (
                    <div className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                      <Pin className="w-2.5 h-2.5" />
                      Pinned to TV tour
                    </div>
                  )}
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
                      Provision Traccar app
                    </span>
                    <span className="type-caption text-slate-500 dark:text-slate-400 font-normal">
                      One-scan driver QR
                    </span>
                  </div>
                </div>
                <span className="ui-chip bg-transparent dark:bg-transparent">
                  Scan QR
                  <span aria-hidden="true">↗</span>
                </span>
              </button>

              {/* Driver contact — only when the feed provides contact data */}
              {(showSelectedDriver || selectedVehicle.driverPhone) && (
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
                        Driver
                      </div>
                      {showSelectedDriver && (
                        <div className="type-subhead text-slate-900 dark:text-white truncate mt-0.5">
                          {selectedDriverName}
                        </div>
                      )}
                      {selectedVehicle.driverPhone && (
                        <div className="type-caption font-mono text-slate-500 dark:text-slate-400 tnum">
                          {selectedVehicle.driverPhone}
                        </div>
                      )}
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
              )}

              {/* Live position and navigation */}
              <div className="ui-card my-2 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="type-subhead text-slate-800 dark:text-white flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedState.key === 'offline' ? 'Last known position' : 'Live position'}</span>
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
              <div className={`grid ${selectedVehicle.driverPhone ? 'grid-cols-5' : 'grid-cols-4'} gap-1.5 my-2 py-2.5 px-2 ui-card-muted`}>
                <button
                  type="button"
                  onClick={onLocateVehicle || onFocusRoute}
                  className="ui-press flex flex-col items-center gap-1.5 text-center cursor-pointer group"
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
                  className="ui-press flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Frame the full highway corridor to base"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <Navigation className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Route</span>
                </button>

                {selectedVehicle.driverPhone && (
                  <a
                    href={`tel:${selectedVehicle.driverPhone}`}
                    className="ui-press flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  >
                    <span className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Phone className="w-4 h-4" />
                    </span>
                    <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Call</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => openProvision(selectedVehicle.id)}
                  className="ui-press flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Generate Android app provisioning QR"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <QrCode className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">QR</span>
                </button>

                <button
                  type="button"
                  onClick={() => onShareVehicle?.(selectedVehicle.id)}
                  className="ui-press flex flex-col items-center gap-1.5 text-center cursor-pointer group"
                  title="Share this vehicle's live tracking link"
                >
                  <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 group-hover:scale-105 transition-transform">
                    <Share2 className="w-4 h-4" />
                  </span>
                  <span className="type-caption font-medium text-slate-600 dark:text-slate-300">Share</span>
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
                  <span className="ui-section-label block">
                    {selectedState.key === 'offline' ? 'Last seen' : 'Last update'}
                  </span>
                  <span className="type-subhead text-slate-800 dark:text-white font-mono tnum mt-0.5 flex items-center gap-1">
                    <Signal
                      className={`w-3 h-3 ${
                        selectedState.key === 'no_signal'
                          ? 'text-amber-500'
                          : selectedState.key === 'offline'
                            ? 'text-slate-400'
                            : 'text-emerald-500'
                      }`}
                    />
                    {formatVehicleAge(selectedVehicle)}
                  </span>
                </div>
              </div>

              {onRemoveVehicle && (
                <button
                  type="button"
                  onClick={() => onRemoveVehicle(selectedVehicle.id)}
                  className="mt-2 w-full min-h-10 rounded-[12px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 flex items-center justify-center gap-2 type-footnote font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove driver record</span>
                </button>
              )}
            </div>
          ) : (
            /* VIEW B: FLEET LIST OVERVIEW */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter tabs */}
              <div className="flex items-center gap-1 p-1 rounded-[12px] bg-slate-100 dark:bg-slate-800 mb-2">
                {[
                  { key: 'all', label: `All (${vehicles.length})` },
                  { key: 'enroute', label: 'En route' },
                  { key: 'onscene', label: 'On scene' },
                  { key: 'nosignal', label: 'No signal' },
                  { key: 'offline', label: `Offline${offlineCount > 0 ? ` (${offlineCount})` : ''}` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setFilter(tab.key)}
                    aria-pressed={filter === tab.key}
                    className={`ui-press flex-1 min-h-10 py-1 text-[0.6875rem] font-semibold rounded-[9px] whitespace-nowrap transition-colors cursor-pointer ${
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
                      onRemoveVehicle={onRemoveVehicle}
                      onShareVehicle={onShareVehicle}
                      isPinned={pinnedVehicleIds.includes(v.id)}
                      onTogglePin={onTogglePin}
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
        />
      )}
    </div>
  );
}

export default React.memo(AppleSheet);
