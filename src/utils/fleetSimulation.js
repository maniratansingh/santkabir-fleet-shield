// Fleet Simulation Engine — Smooth OSM Road Route Interpolation
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Guarantees zero-blanking, zero-stutter, butter-smooth physical velocity (zero humping / zero jumping).

const BASE_LAT = 26.779703;
const BASE_LON = 83.072184;

export function calculateBearing(c1, c2) {
  if (!c1 || !c2) return 0;
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Haversine distance in meters
function haversineMeters(p1, p2) {
  const R = 6371000;
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1[1] * Math.PI) / 180) *
      Math.cos((p2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * R;
}

// Precompute and memoize cumulative arc-length distances in meters for each route
const routeDistancesCache = new WeakMap();

function getRouteDistances(waypoints) {
  if (routeDistancesCache.has(waypoints)) {
    return routeDistancesCache.get(waypoints);
  }
  const n = waypoints.length;
  const cumDists = new Float64Array(n);
  cumDists[0] = 0;
  for (let i = 1; i < n; i++) {
    cumDists[i] = cumDists[i - 1] + haversineMeters(waypoints[i - 1], waypoints[i]);
  }
  const meta = {
    cumDists,
    totalMeters: cumDists[n - 1] || 0,
  };
  routeDistancesCache.set(waypoints, meta);
  return meta;
}

/**
 * Computes realistic, physical arc-length interpolated positions along authentic OSM roads at timestamp `now`.
 * Guaranteed constant physical speed: zero acceleration jumps, zero crawl dips, zero humping, zero jumping.
 * @param {Array} fleet - Array of vehicle configurations.
 * @param {number} now - Epoch timestamp (Date.now()).
 * @returns {Array} - Array of interpolated vehicle state objects.
 */
export function simulateFleetAtTime(fleet, now = Date.now()) {
  if (!Array.isArray(fleet) || fleet.length === 0) return [];

  return fleet.map((car, idx) => {
    const waypoints = car.routeWaypoints || car.coords || [];
    const n = waypoints.length;

    // Base standby or insufficient waypoints: hold position smoothly
    if (n < 2) {
      const lat = car.lat || BASE_LAT;
      const lon = car.lon || BASE_LON;
      const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, lat, lon);
      return {
        ...car,
        lat,
        lon,
        bearing: car.bearing || 0,
        speed: 0,
        speedKnots: 0,
        isParked: true,
        status: 'standby',
        distFromBaseKm: distKm,
        roadDistFromBaseKm: Math.round(distKm * 1.15 * 10) / 10,
        trail: waypoints.length > 0 ? waypoints : [[lon, lat]],
        lastSeen: now,
        isLive: true,
      };
    }

    const { cumDists, totalMeters } = getRouteDistances(waypoints);
    if (totalMeters <= 0) {
      return {
        ...car,
        lat: waypoints[0][1],
        lon: waypoints[0][0],
        bearing: 0,
        speed: 0,
        speedKnots: 0,
        isParked: true,
        status: 'standby',
        distFromBaseKm: 0,
        roadDistFromBaseKm: 0,
        trail: [[waypoints[0][0], waypoints[0][1]]],
        lastSeen: now,
        isLive: true,
      };
    }

    // Constant, realistic physical speed: 41 - 46 km/h (~11.4 - 12.8 m/s)
    const baseSpeedKmh = 42 + (idx % 5);
    const speedMs = baseSpeedKmh / 3.6;

    const oneWaySec = totalMeters / speedMs;
    const campDwellSec = 12; // 12s patient screening at rural camp
    const baseDwellSec = 10; // 10s turnaround at base hospital
    const cycleSec = 2 * oneWaySec + campDwellSec + baseDwellSec;

    // Phase offset so all 17 ambulances are distributed nicely along their distinct corridors
    const offsetSec = (idx * 67.3) % cycleSec;
    const elapsedSec = ((now / 1000) + offsetSec) % cycleSec;

    let targetDistMeters = 0;
    let isReturning = false;
    let isParked = false;
    let currentSpeed = baseSpeedKmh;

    if (elapsedSec < oneWaySec) {
      // Phase 1: Cruising Outbound from Base Hospital to Camp
      targetDistMeters = elapsedSec * speedMs;
      isReturning = false;
      isParked = false;
    } else if (elapsedSec < oneWaySec + campDwellSec) {
      // Phase 2: Standby at Camp
      targetDistMeters = totalMeters;
      isReturning = false;
      isParked = true;
      currentSpeed = 0;
    } else if (elapsedSec < 2 * oneWaySec + campDwellSec) {
      // Phase 3: Cruising Inbound from Camp back to Base Hospital
      const returnElapsedSec = elapsedSec - (oneWaySec + campDwellSec);
      targetDistMeters = Math.max(0, totalMeters - returnElapsedSec * speedMs);
      isReturning = true;
      isParked = false;
    } else {
      // Phase 4: Standby at Base Hospital
      targetDistMeters = 0;
      isReturning = false;
      isParked = true;
      currentSpeed = 0;
    }

    // Binary search to find segment [segIdx, segIdx + 1] containing targetDistMeters
    let low = 0;
    let high = n - 2;
    let segIdx = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cumDists[mid] <= targetDistMeters) {
        segIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const d1 = cumDists[segIdx];
    const d2 = cumDists[segIdx + 1];
    const segLen = d2 - d1;
    const frac = segLen > 0 ? Math.max(0, Math.min(1, (targetDistMeters - d1) / segLen)) : 0;

    const p1 = waypoints[segIdx];
    const p2 = waypoints[segIdx + 1];

    const lon = Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(5));
    const lat = Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(5));

    const bearing = isReturning ? calculateBearing(p2, p1) : calculateBearing(p1, p2);

    const batt = 82 + (idx % 16);
    const charge = idx % 3 === 0;

    const roadDistKm = Math.round((targetDistMeters / 1000) * 10) / 10;
    const straightDistKm = calculateDistanceKm(BASE_LAT, BASE_LON, lat, lon);

    let trail = [];
    if (isReturning) {
      trail = waypoints.slice(segIdx, Math.min(n, segIdx + 28)).reverse();
    } else {
      trail = waypoints.slice(Math.max(0, segIdx - 28), segIdx + 1);
    }
    if (trail.length === 0) trail = [[lon, lat]];

    return {
      ...car,
      lat,
      lon,
      bearing,
      speed: currentSpeed,
      speedKnots: Math.round(currentSpeed * 0.539957),
      batt,
      battery: batt,
      charge,
      distFromBaseKm: straightDistKm,
      roadDistFromBaseKm: roadDistKm,
      trail,
      status: isParked ? 'standby' : (isReturning ? 'returning' : 'moving'),
      isLive: true,
      isParked,
      lastSeen: now,
    };
  });
}
