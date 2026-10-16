import roadRoutesData from './roadRoutes.json';

// Default Eye Hospital Fleet & Sector Data for Sant Kabir Eye Hospital (PIECS)
// Note: Per hospital operational workflow, there are NO fixed/designated camp bases or places.
// Camp locations change frequently. Camp Organizers are deployed with vehicles/drivers into the field.

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital',
  organization: 'Pragati India Eye Care Society (PIECS)',
  address: 'Bansi Road, near Pindari Hospital, Katra, Basti, UP 272001',
  lat: 26.8048,
  lon: 82.7628,
  phone: '+91 94151 40719',
  isBase: true,
};

// Outreach Highway Sectors (road corridors connecting hospital base to field areas)
export const OUTREACH_SECTORS = {
  HARRAIYA: {
    id: 'SECTOR-HARRAIYA',
    name: 'Harraiya Rural Sector',
    highwayName: 'NH-27 West',
    organizerName: 'Rajesh Mishra',
    organizerPhone: '+91 94151 88822',
    totalRoadKm: roadRoutesData['CAMP-HARRAIYA']?.roadDistanceKm || 34.8,
    routeWaypoints: roadRoutesData['CAMP-HARRAIYA']?.coordinates || [],
  },
  BANSI: {
    id: 'SECTOR-BANSI',
    name: 'Bansi Rural Sector',
    highwayName: 'SH-88 / Bansi Road North',
    organizerName: 'M. P. Chaudhary',
    organizerPhone: '+91 93364 55511',
    totalRoadKm: roadRoutesData['CAMP-BANSI']?.roadDistanceKm || 48.3,
    routeWaypoints: roadRoutesData['CAMP-BANSI']?.coordinates || [],
  },
  KHALILABAD: {
    id: 'SECTOR-KHALILABAD',
    name: 'Sant Kabir Nagar Sector',
    highwayName: 'NH-27 East',
    organizerName: 'Sunil Jaiswal',
    organizerPhone: '+91 98380 77733',
    totalRoadKm: roadRoutesData['CAMP-KHALILABAD']?.roadDistanceKm || 34.1,
    routeWaypoints: roadRoutesData['CAMP-KHALILABAD']?.coordinates || [],
  },
  DOMARIYAGANJ: {
    id: 'SECTOR-DOMARIYAGANJ',
    name: 'Domariyaganj Rural Sector',
    highwayName: 'Basti-Domariyaganj Road',
    organizerName: 'Harishankar Tripathi',
    organizerPhone: '+91 94500 44488',
    totalRoadKm: roadRoutesData['CAMP-DOMARIYAGANJ']?.roadDistanceKm || 55.8,
    routeWaypoints: roadRoutesData['CAMP-DOMARIYAGANJ']?.coordinates || [],
  },
};

// Empty array for backwards compatibility - no static camp base sites
export const INITIAL_CAMPS = [];

const harraiyaWps = OUTREACH_SECTORS.HARRAIYA.routeWaypoints;
const bansiWps = OUTREACH_SECTORS.BANSI.routeWaypoints;
const khalilabadWps = OUTREACH_SECTORS.KHALILABAD.routeWaypoints;

const hIdx = Math.floor(harraiyaWps.length * 0.48);
const bIdx = Math.floor(bansiWps.length * 0.44);
const kIdx = Math.floor(khalilabadWps.length * 0.62);

export const VEHICLE_LINE_PALETTES = [
  { lineColor: '#10B981', glowColor: '#34D399', colorName: 'emerald' },
  { lineColor: '#007AFF', glowColor: '#38BDF8', colorName: 'blue' },
  { lineColor: '#8B5CF6', glowColor: '#C084FC', colorName: 'purple' },
  { lineColor: '#F59E0B', glowColor: '#FCD34D', colorName: 'amber' },
  { lineColor: '#EC4899', glowColor: '#F472B6', colorName: 'pink' },
];

export const INITIAL_VEHICLES = [
  {
    id: 'SK-VAN-01',
    name: 'Mobile Clinic Ambulance 1',
    type: 'ambulance',
    equipment: 'Slit Lamp, Auto-Refractor, Tonometer',
    plate: 'UP-51-AT-4211',
    driverName: 'Ramesh Yadav',
    driverPhone: '+91 94151 40719',
    organizerName: 'Rajesh Mishra',
    sector: 'Harraiya Rural Sector',
    highwayName: 'NH-27 West',
    status: 'moving',
    speed: 46,
    bearing: 268,
    routeStep: hIdx,
    roadDistFromBaseKm: 16.8,
    totalRoadKm: 34.8,
    routeWaypoints: harraiyaWps,
    lineColor: '#10B981', // Vibrant Emerald / Mint
    glowColor: '#34D399',
    colorName: 'emerald',
    battery: 89,
    network: '4G LTE',
    pingMs: 38,
    lon: harraiyaWps[hIdx] ? harraiyaWps[hIdx][0] : 82.6890,
    lat: harraiyaWps[hIdx] ? harraiyaWps[hIdx][1] : 26.7771,
    lastSeen: Date.now() - 10000,
  },
  {
    id: 'SK-SHUTTLE-02',
    name: 'Surgical Patient Ambulance A',
    type: 'ambulance',
    equipment: '15-Seater Patient Carrier, First Aid',
    plate: 'UP-51-B-8930',
    driverName: 'Manoj Kumar',
    driverPhone: '+91 93364 66677',
    organizerName: 'M. P. Chaudhary',
    sector: 'Bansi Rural Sector',
    highwayName: 'SH-88 / Bansi Road North',
    status: 'moving',
    speed: 48,
    bearing: 27,
    routeStep: bIdx,
    roadDistFromBaseKm: 21.2,
    totalRoadKm: 48.3,
    routeWaypoints: bansiWps,
    lineColor: '#007AFF', // Authentic Apple Blue
    glowColor: '#38BDF8',
    colorName: 'blue',
    battery: 76,
    network: '5G',
    pingMs: 24,
    lon: bansiWps[bIdx] ? bansiWps[bIdx][0] : 82.7752,
    lat: bansiWps[bIdx] ? bansiWps[bIdx][1] : 26.9675,
    lastSeen: Date.now() - 25000,
  },
  {
    id: 'SK-VISION-03',
    name: 'Vision Outreach Ambulance 2',
    type: 'ambulance',
    equipment: '32-Seater Complete Mobile Eye Clinic',
    plate: 'UP-51-E-1044',
    driverName: 'Suresh Maurya',
    driverPhone: '+91 98380 12345',
    organizerName: 'Sunil Jaiswal',
    sector: 'Sant Kabir Nagar Sector',
    highwayName: 'NH-27 East',
    status: 'returning',
    speed: 51,
    bearing: 275,
    routeStep: kIdx,
    roadDistFromBaseKm: 13.0,
    totalRoadKm: 34.1,
    routeWaypoints: khalilabadWps,
    lineColor: '#8B5CF6', // Vivid Royal Violet
    glowColor: '#C084FC',
    colorName: 'purple',
    battery: 64,
    network: '4G LTE',
    pingMs: 44,
    lon: khalilabadWps[kIdx] ? khalilabadWps[kIdx][0] : 82.9459,
    lat: khalilabadWps[kIdx] ? khalilabadWps[kIdx][1] : 26.7925,
    lastSeen: Date.now() - 5000,
  },
];

// Calculate Distance in Kilometers between two coordinates
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
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
