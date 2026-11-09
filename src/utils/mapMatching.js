// Client-side road map-matching.
// Uses the 14 precomputed corridors in src/data/roadRoutes.json. Points within
// 25 m of a road centreline are projected onto it; points further away
// (hospital compounds, fields, village depots) are left untouched.

import roadRoutes from '../data/roadRoutes.json' with { type: 'json' };

const METERS_PER_DEG_LAT = 111320;
const BBOX_PAD_DEG = 0.001; // about 111 m
const MAX_CACHE_SIZE = 1200;

const segments = [];
for (const [corridor, data] of Object.entries(roadRoutes)) {
  const coords = data?.coordinates || [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    segments.push({
      a,
      b,
      corridor,
      minLat: Math.min(a[1], b[1]),
      maxLat: Math.max(a[1], b[1]),
      minLon: Math.min(a[0], b[0]),
      maxLon: Math.max(a[0], b[0]),
    });
  }
}

const snapCache = new Map();

function remember(key, value) {
  if (snapCache.size >= MAX_CACHE_SIZE) {
    const oldest = snapCache.keys().next().value;
    snapCache.delete(oldest);
  }
  snapCache.set(key, value);
  return value;
}

/**
 * Snap a coordinate to the nearest road centreline when it is close enough.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} maxDistanceM  Maximum snap distance in metres.
 * @returns {{lat:number, lon:number, snapped:boolean, distanceM:number, corridor:string|null}}
 */
export function snapToRoad(lat, lon, maxDistanceM = 25) {
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) {
    return { lat: nLat, lon: nLon, snapped: false, distanceM: Infinity, corridor: null };
  }

  const key = `${nLat.toFixed(5)},${nLon.toFixed(5)},${maxDistanceM}`;
  const cached = snapCache.get(key);
  if (cached) return cached;

  const cosLat = Math.max(0.1, Math.cos((nLat * Math.PI) / 180));
  const metersPerDegLon = METERS_PER_DEG_LAT * cosLat;

  let bestDistance = Infinity;
  let bestX = nLon;
  let bestY = nLat;
  let bestCorridor = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Cheap bbox reject before any projection work.
    if (
      nLat < seg.minLat - BBOX_PAD_DEG ||
      nLat > seg.maxLat + BBOX_PAD_DEG ||
      nLon < seg.minLon - BBOX_PAD_DEG ||
      nLon > seg.maxLon + BBOX_PAD_DEG
    ) {
      continue;
    }

    // Local equirectangular metres relative to the query point.
    const ax = (seg.a[0] - nLon) * metersPerDegLon;
    const ay = (seg.a[1] - nLat) * METERS_PER_DEG_LAT;
    const bx = (seg.b[0] - nLon) * metersPerDegLon;
    const by = (seg.b[1] - nLat) * METERS_PER_DEG_LAT;

    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lengthSq))
      : 0;

    const px = ax + t * dx;
    const py = ay + t * dy;
    const distance = Math.sqrt(px * px + py * py);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestX = nLon + px / metersPerDegLon;
      bestY = nLat + py / METERS_PER_DEG_LAT;
      bestCorridor = seg.corridor;
    }
  }

  const shouldSnap = Number.isFinite(bestDistance) && bestDistance <= maxDistanceM;
  return remember(key, {
    lat: shouldSnap ? bestY : nLat,
    lon: shouldSnap ? bestX : nLon,
    snapped: shouldSnap,
    distanceM: bestDistance,
    corridor: bestCorridor,
  });
}

export function clearSnapCache() {
  snapCache.clear();
}
