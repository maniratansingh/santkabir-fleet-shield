// Shared rural gazetteer resolver. The 195-entry array is the JSON source of
// truth, so the edge worker and the Durable Object cannot drift apart.

import ruralVillages from '../data/ruralVillages.json';
import { calculateDistanceKm } from './geo.js';

export const KEY_VILLAGES = ruralVillages;

export function resolveVillage(lat, lon) {
  let nearest = KEY_VILLAGES[0];
  let minD = calculateDistanceKm(lat, lon, nearest.lat, nearest.lon);
  for (let i = 1; i < KEY_VILLAGES.length; i++) {
    const d = calculateDistanceKm(lat, lon, KEY_VILLAGES[i].lat, KEY_VILLAGES[i].lon);
    if (d < minD) {
      minD = d;
      nearest = KEY_VILLAGES[i];
    }
  }
  const isCamp = minD <= 4.0;
  return {
    villageName: nearest.name,
    villageBlock: nearest.block,
    villageDistrict: nearest.district,
    villageBadge: isCamp ? `Camp: ${nearest.name}` : `Near ${nearest.name}`,
    villageLabel: isCamp
      ? `📍 Outreach Camp: ${nearest.name} (${nearest.district}) • ${minD} km`
      : `📍 Near ${nearest.name} • ${minD} km away`,
  };
}
