import { FLEET_15 } from './purvanchal15FleetData.js';
import { getUniqueVehicleColor } from '../utils/colors.js';

const BASE_LAT = 26.7797;
const BASE_LON = 83.0722;

function calculateBearing(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function getLive11Fleet(now = Date.now()) {
  if (!Array.isArray(FLEET_15) || FLEET_15.length === 0) return [];
  
  return FLEET_15.slice(0, 11).map((car, idx) => {
    const waypoints = car.coords;
    const n = waypoints.length;
    const colors = getUniqueVehicleColor(car.id);
    
    if (n < 2) {
      const pt = waypoints[0] || [BASE_LON, BASE_LAT];
      return {
        id: car.id,
        name: car.id,
        type: 'ambulance',
        driverName: car.driver,
        driverPhone: car.phone,
        plate: car.id,
        status: 'moving',
        lat: pt[1],
        lon: pt[0],
        speed: 48,
        speedKnots: 26,
        bearing: 90,
        batt: 90,
        battery: 90,
        charge: false,
        distFromBaseKm: 0,
        roadDistFromBaseKm: 0,
        villageName: car.village,
        villageBlock: car.village,
        villageDistrict: car.district,
        villageBadge: `Camp: ${car.village}`,
        villageLabel: `📍 Outreach Camp: ${car.village} (${car.district})`,
        lineColor: colors.line,
        glowColor: colors.glow,
        routeWaypoints: waypoints,
        trail: [[pt[0], pt[1]]],
        lastSeen: now,
        isLive: true,
      };
    }

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
      id: car.id,
      name: car.id,
      type: 'ambulance',
      driverName: car.driver,
      driverPhone: car.phone,
      plate: car.id,
      status: 'moving',
      lat,
      lon,
      speed,
      speedKnots: Math.round(speed / 1.852),
      bearing,
      altitude: 0,
      accuracy: 1.5,
      batt,
      battery: batt,
      charge,
      distFromBaseKm: distKm,
      roadDistFromBaseKm: car.roadDistanceKm || roadDistKm,
      villageName: car.village,
      villageBlock: car.village,
      villageDistrict: car.district,
      villageBadge: `Camp: ${car.village}`,
      villageLabel: `📍 Outreach Camp: ${car.village} (${car.district}) • ${roadDistKm} km`,
      lineColor: colors.line,
      glowColor: colors.glow,
      routeWaypoints: waypoints,
      trail,
      lastSeen: now,
      updatedAt: now,
      isLive: true,
      ageSec: 0,
      gapMinutes: 0,
      isSignalGap: false,
      isParked: false,
      networkState: 'live',
    };
  });
}
