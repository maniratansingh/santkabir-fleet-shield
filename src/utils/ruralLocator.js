import ruralVillages from '../data/ruralVillages.json';
import { BASE_HOSPITAL } from '../data/mockData';

// Haversine formula
function calculateDistKm(lat1, lon1, lat2, lon2) {
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

// Coordinate memoization cache
const locationCache = new Map();

/**
 * Resolves the nearest rural village or landmark based on LIVE GPS coordinates.
 * Strictly dynamic: guarantees accurate live vicinity (e.g. "Near Munderwa", "Near Gaur Bazar")
 * without predefined destination assumptions.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {object} { village, block, district, distKm, isCamp, badge, label }
 */
export function getNearestRuralLocation(lat, lon) {
  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
    return {
      village: 'Base Hospital Standby',
      block: 'Basti Sadar',
      district: 'Basti',
      distKm: 0,
      isCamp: false,
      badge: 'Base Hospital',
      label: 'Sant Kabir Eye Hospital (Basti Base)',
    };
  }

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey);
  }

  // Check proximity to Sant Kabir Hospital Base (Basti)
  const baseLat = BASE_HOSPITAL?.lat || 26.797313;
  const baseLon = BASE_HOSPITAL?.lon || 82.718401;
  const distFromBase = calculateDistKm(lat, lon, baseLat, baseLon);

  if (distFromBase <= 1.2) {
    const baseResult = {
      village: 'Sant Kabir Base Hospital',
      block: 'Basti Sadar',
      district: 'Basti',
      distKm: distFromBase,
      isCamp: false,
      badge: 'Base Hospital',
      label: 'Sant Kabir Eye Hospital (Basti Base)',
    };
    locationCache.set(cacheKey, baseResult);
    return baseResult;
  }

  let nearest = ruralVillages[0];
  let minDistance = calculateDistKm(lat, lon, nearest.lat, nearest.lon);

  for (let i = 1; i < ruralVillages.length; i++) {
    const v = ruralVillages[i];
    const dist = calculateDistKm(lat, lon, v.lat, v.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = v;
    }
  }

  const cleanName = nearest.name.replace(/ (Gram|Sadar|Nagar)$/, '');
  const isDirectlyAtVillage = minDistance <= 1.5;
  const badge = isDirectlyAtVillage ? cleanName : `Near ${cleanName}`;
  const label = isDirectlyAtVillage
    ? `📍 Outreach Camp: ${cleanName} (${nearest.district})`
    : `📍 En Route near ${cleanName} (${nearest.district}) • ${minDistance} km away`;

  const result = {
    village: cleanName,
    block: nearest.block,
    district: nearest.district,
    distKm: minDistance,
    isCamp: isDirectlyAtVillage,
    badge,
    label,
  };

  if (locationCache.size > 500) {
    const firstKey = locationCache.keys().next().value;
    locationCache.delete(firstKey);
  }
  locationCache.set(cacheKey, result);

  return result;
}
