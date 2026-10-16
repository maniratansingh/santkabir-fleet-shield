import roadRoutesData from './roadRoutes.json';

// Default Eye Hospital Fleet & Configuration for Sant Kabir Eye Hospital (PIECS)
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital',
  organization: 'Pragati India Eye Care Society (PIECS)',
  address: 'Bansi Road, near Pindari Hospital, Katra, Basti, UP 272001',
  lat: 26.797313,
  lon: 82.718401,
  googleMapsUrl: 'https://maps.app.goo.gl/NDr27v6mEnooeBE99',
  phone: '+91 94151 40719',
  isBase: true,
};

const harraiyaWps = roadRoutesData['CAMP-HARRAIYA']?.coordinates || [];
const bansiWps = roadRoutesData['CAMP-BANSI']?.coordinates || [];
const khalilabadWps = roadRoutesData['CAMP-KHALILABAD']?.coordinates || [];
const kalwariWps = roadRoutesData['KALWARI-SOUTH']?.coordinates || [];
const cityWps = roadRoutesData['CITY-EAST']?.coordinates || [];

const hIdx = Math.min(harraiyaWps.length - 1, Math.floor(harraiyaWps.length * 0.48));
const bIdx = Math.min(bansiWps.length - 1, Math.floor(bansiWps.length * 0.44));
const kIdx = Math.min(khalilabadWps.length - 1, Math.floor(khalilabadWps.length * 0.62));
const sIdx = Math.min(kalwariWps.length - 1, Math.floor(kalwariWps.length * 0.50));
const cIdx = Math.min(cityWps.length - 1, Math.floor(cityWps.length * 0.70));

export const INITIAL_VEHICLES = [
  {
    id: 'SK-VAN-01',
    name: 'Mobile Clinic Ambulance 1',
    type: 'ambulance',
    plate: 'UP-51-AT-4211',
    driverName: 'Ramesh Yadav',
    driverPhone: '+91 94151 40719',
    highwayName: 'NH-27 West',
    status: 'moving',
    speed: 46,
    bearing: 268,
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
    plate: 'UP-51-B-8930',
    driverName: 'Manoj Kumar',
    driverPhone: '+91 93364 66677',
    highwayName: 'SH-88 / Bansi Road North',
    status: 'moving',
    speed: 48,
    bearing: 27,
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
    plate: 'UP-51-E-1044',
    driverName: 'Suresh Maurya',
    driverPhone: '+91 98380 12345',
    highwayName: 'NH-27 East',
    status: 'returning',
    speed: 51,
    bearing: 275,
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
  {
    id: 'SK-AMB-04',
    name: 'Trauma Care Ambulance 4',
    type: 'ambulance',
    plate: 'UP-51-G-0012',
    driverName: 'Sunil Yadav',
    driverPhone: '+91 94500 98765',
    highwayName: 'SH-61 Kalwari Road South',
    status: 'moving',
    speed: 44,
    bearing: 185,
    roadDistFromBaseKm: 12.6,
    totalRoadKm: 18.4,
    routeWaypoints: kalwariWps,
    lineColor: '#F59E0B', // Amber
    glowColor: '#FCD34D',
    colorName: 'amber',
    battery: 92,
    network: '4G LTE',
    pingMs: 32,
    lon: kalwariWps[sIdx] ? kalwariWps[sIdx][0] : 82.7230,
    lat: kalwariWps[sIdx] ? kalwariWps[sIdx][1] : 26.7410,
    lastSeen: Date.now() - 15000,
  },
  {
    id: 'SK-AMB-05',
    name: 'City Rapid Response 5',
    type: 'ambulance',
    plate: 'UP-51-C-5521',
    driverName: 'Rajesh Verma',
    driverPhone: '+91 98390 44332',
    highwayName: 'Gandhi Nagar / City Corridor',
    status: 'moving',
    speed: 38,
    bearing: 95,
    roadDistFromBaseKm: 3.5,
    totalRoadKm: 4.2,
    routeWaypoints: cityWps,
    lineColor: '#EC4899', // Rose Pink
    glowColor: '#F472B6',
    colorName: 'pink',
    battery: 95,
    network: '5G',
    pingMs: 18,
    lon: cityWps[cIdx] ? cityWps[cIdx][0] : 82.7420,
    lat: cityWps[cIdx] ? cityWps[cIdx][1] : 26.7880,
    lastSeen: Date.now() - 8000,
  },
];

export const INITIAL_CAMPS = [];

// Calculate Great-Circle Distance in Kilometers between two coordinates
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
