// Canonical telemetry processor shared by the HTTP edge handler and the
// Durable Object tracker WebSocket. It accepts a normalized packet and returns
// the same vehicle record shape used by /api/vehicles and /api/ws.

import { BASE_LAT, BASE_LON } from './baseLocation.js';
import { calculateBearing, calculateDistanceKm } from './geo.js';
import { getUniqueVehicleColor } from './colors.js';
import { resolveVillage } from './village.js';
import { canonicalVehicleId } from './vehicleId.js';

/**
 * Normalise a device timestamp to epoch milliseconds. Traccar and some JSON
 * clients send seconds; a future clock is clamped so it cannot poison history.
 */
export function normalizeEpochMs(value, now = Date.now()) {
  let ms = NaN;
  if (typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) ms = parsed;
  } else {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) ms = n < 1e11 ? n * 1000 : n;
  }
  if (!Number.isFinite(ms) || ms <= 0) return now;
  if (ms > now + 5 * 60 * 1000) return now;
  return ms;
}

/**
 * Coerce an object, compact array, or JSON string into a telemetry packet.
 * Compact arrays follow [id, lat, lon, speed, bearing, timestamp].
 */
export function coerceTelemetryPacket(raw) {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    const [id, lat, lon, speed, bearing, timestamp] = raw;
    return { id, lat, lon, speedKnots: speed, bearing, timestamp };
  }

  if (typeof raw === 'string') {
    try {
      return coerceTelemetryPacket(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  if (typeof raw === 'object') {
    return {
      id: raw.id || raw.uniqueId || raw.deviceId || raw.deviceid,
      driver: raw.driver || raw.driverName || '',
      lat: raw.lat ?? raw.latitude,
      lon: raw.lon ?? raw.lng ?? raw.longitude,
      speedKnots: raw.speed ?? raw.speedKnots ?? 0,
      bearing: raw.bearing ?? raw.heading ?? 0,
      altitude: raw.altitude ?? 0,
      accuracy: raw.accuracy ?? 0,
      batt: raw.batt ?? raw.battery ?? 100,
      charge: raw.charge === true || raw.charge === 'true' || raw.charge === 1 || raw.charge === '1',
      mock: raw.mock === true || raw.mock === 'true' || raw.mock === 1 || raw.mock === '1',
      timestamp: raw.timestamp ?? raw.time ?? Date.now(),
    };
  }

  return null;
}

/**
 * Build the canonical vehicle record.
 *
 * @param {object} packet  Normalized packet from `coerceTelemetryPacket`.
 * @param {object} options
 * @param {object} options.existing  Previous record for this vehicle.
 * @param {object} options.filter    Kinematic filter instance (optional).
 * @param {number} options.now       Current epoch milliseconds.
 */
export function processTelemetryPacket(packet, options = {}) {
  if (!packet) return null;
  const cleanId = canonicalVehicleId(packet.id);
  const rawLat = Number(packet.lat);
  const rawLon = Number(packet.lon);

  if (packet.mock) return null;
  if (!cleanId || !Number.isFinite(rawLat) || !Number.isFinite(rawLon)) return null;
  if (rawLat < -90 || rawLat > 90 || rawLon < -180 || rawLon > 180) return null;

  const existing = options.existing || {};
  const filter = options.filter;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timestamp = normalizeEpochMs(packet.timestamp, now);

  const fixedLat = Number(rawLat.toFixed(6));
  const fixedLon = Number(rawLon.toFixed(6));

  let filteredLat = fixedLat;
  let filteredLon = fixedLon;
  if (filter && typeof filter.update === 'function') {
    const smoothed = filter.update(fixedLat, fixedLon, packet.accuracy, timestamp);
    if (Number.isFinite(smoothed.lat)) filteredLat = Number(smoothed.lat.toFixed(6));
    if (Number.isFinite(smoothed.lon)) filteredLon = Number(smoothed.lon.toFixed(6));
  }

  const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, filteredLat, filteredLon);
  const roadDistKm = Math.round(distKm * 1.15 * 10) / 10;
  const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
  const updatedTrail = [...prevTrail.slice(-29), [filteredLon, filteredLat]];
  const ruralLoc = resolveVillage(filteredLat, filteredLon);
  const colors = getUniqueVehicleColor(cleanId);

  const rawSpeed = Number(packet.speedKnots) || 0;
  let speedKmH = rawSpeed > 0 ? Math.min(130, Math.round(rawSpeed * 1.852)) : 0;
  if (!speedKmH && existing.lat && existing.lon && Number.isFinite(Number(existing.lastSeen))) {
    const dtHours = (timestamp - Number(existing.lastSeen)) / 3600000;
    if (dtHours > 0) {
      const derived = calculateDistanceKm(existing.lat, existing.lon, filteredLat, filteredLon) / dtHours;
      if (derived > 3 && derived < 160) speedKmH = Math.round(derived);
    }
  }

  let computedBearing = Math.round(((Number(packet.bearing) || 0) % 360 + 360) % 360);
  if (
    computedBearing === 0 &&
    existing.lat &&
    existing.lon &&
    (existing.lat !== filteredLat || existing.lon !== filteredLon)
  ) {
    computedBearing = calculateBearing(
      [existing.lon, existing.lat],
      [filteredLon, filteredLat]
    );
  } else if (computedBearing === 0 && existing.bearing) {
    computedBearing = existing.bearing;
  }

  const altitude = Number(packet.altitude) || 0;
  const accuracy = Number(packet.accuracy) || 0;
  const batt = Number(packet.batt);

  return {
    id: cleanId,
    name: cleanId,
    type: 'ambulance',
    driverName: packet.driver ? String(packet.driver).trim() : (existing.driverName || ''),
    driverPhone: existing.driverPhone || '',
    plate: existing.plate || cleanId,
    status: speedKmH > 3 ? 'moving' : (distKm < 0.25 ? 'at_base' : 'in_field'),
    lat: filteredLat,
    lon: filteredLon,
    rawLat: fixedLat,
    rawLon: fixedLon,
    speed: speedKmH,
    speedKnots: Number(rawSpeed.toFixed(2)),
    bearing: computedBearing,
    altitude: Math.round(altitude),
    accuracy: Number.isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
    batt: Math.min(100, Math.max(0, Math.round(batt))),
    battery: Math.min(100, Math.max(0, Math.round(batt))),
    charge: Boolean(packet.charge),
    distFromBaseKm: distKm,
    roadDistFromBaseKm: roadDistKm,
    villageName: ruralLoc.villageName,
    villageBlock: ruralLoc.villageBlock,
    villageDistrict: ruralLoc.villageDistrict,
    villageBadge: ruralLoc.villageBadge,
    villageLabel: ruralLoc.villageLabel,
    lineColor: existing.lineColor || colors.line,
    glowColor: existing.glowColor || colors.glow,
    trail: updatedTrail,
    lastSeen: timestamp,
    updatedAt: now,
    isLive: true,
  };
}
