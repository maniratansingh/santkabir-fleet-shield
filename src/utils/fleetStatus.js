// Canonical operational state for the fleet UI. Keeps the header, fleet list,
// filters and detail view using the same vocabulary.
import { BASE_LAT, BASE_LON } from './baseLocation.js';
import { calculateDistanceKm } from './geo.js';

export const FLEET_STATES = {
  no_signal: { key: 'no_signal', label: 'No signal', priority: 0 },
  moving: { key: 'moving', label: 'Moving', priority: 1 },
  on_scene: { key: 'on_scene', label: 'On scene', priority: 2 },
  returning: { key: 'returning', label: 'Returning', priority: 3 },
  at_base: { key: 'at_base', label: 'At base', priority: 4 },
  offline: { key: 'offline', label: 'Offline', priority: 5 },
};

export function getVehicleDistanceFromBase(v) {
  if (!v) return Infinity;
  const numeric = Number(v.roadDistFromBaseKm ?? v.distFromBaseKm);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const lat = Number(v.lat);
  const lon = Number(v.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity;
  return calculateDistanceKm(BASE_LAT, BASE_LON, lat, lon);
}

export function getFleetState(v) {
  if (!v) return FLEET_STATES.at_base;
  if (v.isOffline) return FLEET_STATES.offline;
  if (v.isSignalGap) return FLEET_STATES.no_signal;

  const status = String(v.status || '').toLowerCase();
  const dist = getVehicleDistanceFromBase(v);

  if (status === 'moving') return FLEET_STATES.moving;
  if (status === 'returning') return FLEET_STATES.returning;
  if (
    status === 'at_base' ||
    (dist <= 1.2 && (v.isParked || status === 'standby'))
  ) {
    return FLEET_STATES.at_base;
  }
  if (status === 'standby' || status === 'in_field' || v.isParked) {
    return FLEET_STATES.on_scene;
  }
  return Number(v.speed) > 3 ? FLEET_STATES.moving : FLEET_STATES.on_scene;
}

export function sortVehiclesByPriority(vehicles = []) {
  return [...vehicles].sort((a, b) => {
    const stateA = getFleetState(a);
    const stateB = getFleetState(b);

    if (stateA.key === 'no_signal' && stateB.key === 'no_signal') {
      const gapA = Number(a.gapMinutes) || 0;
      const gapB = Number(b.gapMinutes) || 0;
      if (gapA !== gapB) return gapB - gapA;
    }

    if (stateA.priority !== stateB.priority) {
      return stateA.priority - stateB.priority;
    }
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

export function countFleetStates(vehicles = []) {
  const counts = {
    no_signal: 0,
    moving: 0,
    on_scene: 0,
    returning: 0,
    at_base: 0,
    offline: 0,
    enRoute: 0,
  };

  vehicles.forEach((v) => {
    const state = getFleetState(v);
    counts[state.key] += 1;
  });

  counts.enRoute = counts.moving + counts.returning;
  return counts;
}
