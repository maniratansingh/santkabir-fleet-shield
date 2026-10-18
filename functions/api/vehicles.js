// Cloudflare Pages Function: /api/vehicles
// Returns 15 authentic Purvanchal ambulances deployed across Basti, Sant Kabir Nagar & Siddharthnagar
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)

import { FLEET_15 } from '../../src/data/purvanchal15FleetData.js';

const BASE_LAT = 26.797313;
const BASE_LON = 82.718401;

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
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

const PRIMARY_PALETTE = [
  { line: '#007AFF', glow: '#38BDF8' },
  { line: '#10B981', glow: '#34D399' },
  { line: '#F59E0B', glow: '#FBBF24' },
  { line: '#8B5CF6', glow: '#A78BFA' },
  { line: '#EC4899', glow: '#F472B6' },
  { line: '#06B6D4', glow: '#22D3EE' },
  { line: '#84CC16', glow: '#A3E635' },
  { line: '#F97316', glow: '#FB923C' },
  { line: '#6366F1', glow: '#818CF8' },
  { line: '#14B8A6', glow: '#2DD4BF' },
  { line: '#E11D48', glow: '#FB7185' },
  { line: '#D946EF', glow: '#E879F9' },
];

function getVehicleColors(id = '') {
  const match = String(id).match(/AMB-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= PRIMARY_PALETTE.length) {
      return PRIMARY_PALETTE[num - 1];
    }
  }
  return { line: '#007AFF', glow: '#38BDF8' };
}

function calculateBearing(c1, c2) {
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

export async function onRequest() {
  const now = Date.now();
  const vehicles = FLEET_15.map((car, idx) => {
    const waypoints = car.coords;
    const n = waypoints.length;
    if (n < 2) return null;

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

    const colors = getVehicleColors(car.id);
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
      roadDistFromBaseKm: roadDistKm,
      villageName: car.village,
      villageBlock: car.district,
      villageDistrict: car.district,
      villageBadge: `Camp: ${car.village}`,
      villageLabel: `📍 Outreach Camp: ${car.village} (${car.district}) • ${roadDistKm} km`,
      lineColor: colors.line,
      glowColor: colors.glow,
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
  }).filter(Boolean);

  return new Response(JSON.stringify({
    success: true,
    vehicles,
    count: vehicles.length,
    timestamp: now,
    app: 'Sant Kabir Fleet Shield',
    developer: 'Mani Ratan Singh (mrps.in)',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
    },
  });
}
