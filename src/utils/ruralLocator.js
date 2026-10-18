import ruralVillages from '../data/ruralVillages.json';

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
 * Resolves the nearest rural village or outreach eye camp location
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {object} { village, block, district, distKm, isCamp, badge, label }
 */
export function getNearestRuralLocation(lat, lon) {
  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
    return {
      village: 'Base Hospital Standby',
      block: 'Khalilabad',
      district: 'Sant Kabir Nagar',
      distKm: 0,
      isCamp: false,
      badge: 'Base Station',
      label: 'Sant Kabir Eye Hospital (Khalilabad Base)',
    };
  }

  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey);
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

  const isAtCamp = minDistance <= 3.5;
  const badge = isAtCamp ? `Camp: ${nearest.name}` : `Near ${nearest.name}`;
  const label = isAtCamp
    ? `📍 Outreach Camp: ${nearest.name} (${nearest.block} Block, ${nearest.district}) • ${minDistance} km`
    : `📍 En Route near ${nearest.name} (${nearest.district}) • ${minDistance} km away`;

  const result = {
    village: nearest.name,
    block: nearest.block,
    district: nearest.district,
    distKm: minDistance,
    isCamp: isAtCamp,
    badge,
    label,
  };

  // Limit cache size to 500 keys
  if (locationCache.size > 500) {
    const firstKey = locationCache.keys().next().value;
    locationCache.delete(firstKey);
  }
  locationCache.set(cacheKey, result);

  return result;
}
