// Fleet Simulation Engine — Smooth OSM Road Route Interpolation
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)
// Guarantees zero-blanking, zero-stutter, butter-smooth movement across any fleet size.

const BASE_LAT = 26.797313;
const BASE_LON = 82.718401;

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

/**
 * Computes realistic, interpolated positions for the fleet along authentic OSM roads at timestamp `now`.
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

    // Ambulances cruise smoothly back and forth along authentic OSM road routes (140s - 200s round-trip)
    const cycleDuration = 140000 + (idx % 6) * 12000;
    const phaseOffset = (idx * 0.19) % 1.0;
    const elapsed = (now % cycleDuration) / cycleDuration;
    const t = (elapsed + phaseOffset) % 1.0;
    const ratio = t < 0.5 ? t * 2 : (1 - t) * 2;

    const floatIdx = ratio * (n - 1);
    const currIdx = Math.min(n - 2, Math.max(0, Math.floor(floatIdx)));
    const frac = floatIdx - currIdx;

    const p1 = waypoints[currIdx];
    const p2 = waypoints[currIdx + 1];

    const lon = Number((p1[0] + (p2[0] - p1[0]) * frac).toFixed(5));
    const lat = Number((p1[1] + (p2[1] - p1[1]) * frac).toFixed(5));
    const isReturning = t >= 0.5;
    const bearing = isReturning ? calculateBearing(p2, p1) : calculateBearing(p1, p2);

    const speed = Math.round(44 + Math.sin(now * 0.0015 + idx) * 7);
    const batt = 82 + (idx % 16);
    const charge = idx % 3 === 0;

    const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, lat, lon);
    const roadDistKm = Math.round(distKm * 1.15 * 10) / 10;

    let trail = [];
    if (isReturning) {
      trail = waypoints.slice(currIdx, Math.min(n, currIdx + 28)).reverse();
    } else {
      trail = waypoints.slice(Math.max(0, currIdx - 28), currIdx + 1);
    }
    if (trail.length === 0) trail = [[lon, lat]];

    return {
      ...car,
      lat,
      lon,
      bearing,
      speed,
      speedKnots: Math.round(speed * 0.539957),
      batt,
      battery: batt,
      charge,
      distFromBaseKm: distKm,
      roadDistFromBaseKm: roadDistKm,
      trail,
      status: 'moving',
      isLive: true,
      isParked: false,
      lastSeen: now,
    };
  });
}
