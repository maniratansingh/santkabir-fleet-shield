import roadRoutesData from './roadRoutes.json';

// Default Eye Hospital Fleet & Configuration for Sant Kabir Eye Hospital (PIECS)
// Engineered by Mani Ratan Singh (https://mrps.in | https://github.com/maniratansingh)

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital',
  organization: 'Pragati India Eye Care Society (PIECS)',
  address: 'Khalilabad Base Station, Sant Kabir Nagar, UP 272175',
  lat: 26.779703,
  lon: 83.072184,
  googleMapsUrl: 'https://maps.app.goo.gl/NDr27v6mEnooeBE99',
  phone: '+91 94151 40719',
  isBase: true,
};

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

const CORRIDOR_CONFIGS = [
  { id: 'CAMP-HARRAIYA', name: 'NH-27 West', totalKm: 34.8, color: '#10B981', glow: '#34D399' },
  { id: 'CAMP-BANSI', name: 'SH-88 North', totalKm: 38.2, color: '#007AFF', glow: '#38BDF8' },
  { id: 'CAMP-KHALILABAD', name: 'NH-27 East', totalKm: 28.5, color: '#8B5CF6', glow: '#A78BFA' },
  { id: 'CAMP-DOMARIYAGANJ', name: 'SH-88A NW', totalKm: 46.0, color: '#06B6D4', glow: '#22D3EE' },
  { id: 'KALWARI-SOUTH', name: 'SH-61 South', totalKm: 24.6, color: '#F59E0B', glow: '#FBBF24' },
  { id: 'CITY-EAST', name: 'City East Corridor', totalKm: 12.4, color: '#EC4899', glow: '#F472B6' },
  { id: 'RUDHAULI-NORTH', name: 'Rudhauli Road North', totalKm: 26.8, color: '#14B8A6', glow: '#2DD4BF' },
];

const DRIVERS = [
  { name: 'Ramesh Yadav', phone: '+91 94151 40719' },
  { name: 'Manoj Kumar', phone: '+91 98390 12345' },
  { name: 'Suresh Maurya', phone: '+91 94505 67890' },
  { name: 'Sunil Yadav', phone: '+91 99182 34567' },
  { name: 'Rajesh Verma', phone: '+91 97923 45678' },
  { name: 'Vikram Singh', phone: '+91 94150 88991' },
  { name: 'Anita Patel', phone: '+91 94512 33445' },
  { name: 'Deepak Verma', phone: '+91 98380 55667' },
  { name: 'Amit Mishra', phone: '+91 99190 77889' },
  { name: 'Pooja Sharma', phone: '+91 94152 11223' },
  { name: 'Sanjay Gupta', phone: '+91 98391 22334' },
  { name: 'Rakesh Tiwari', phone: '+91 94506 33445' },
  { name: 'Kavita Singh', phone: '+91 99183 44556' },
  { name: 'Vinod Pandey', phone: '+91 97924 55667' },
  { name: 'Dinesh Chauhan', phone: '+91 94151 66778' },
  { name: 'Santosh Pal', phone: '+91 94513 77889' },
  { name: 'Neeraj Shahi', phone: '+91 98381 88990' },
  { name: 'Arun Kumar', phone: '+91 99191 99001' },
  { name: 'Pankaj Dubey', phone: '+91 94153 00112' },
  { name: 'Ashok Bind', phone: '+91 98392 11223' },
  { name: 'Virendra Yadav', phone: '+91 94507 22334' },
  { name: 'Alok Srivastava', phone: '+91 99184 33445' },
  { name: 'Pramod Giri', phone: '+91 97925 44556' },
  { name: 'Harish Chandra', phone: '+91 94152 55667' },
  { name: 'Ajay Tripathi', phone: '+91 94514 66778' },
  { name: 'Brijesh Mourya', phone: '+91 98382 77889' },
  { name: 'Gyanendra Rai', phone: '+91 99192 88990' },
  { name: 'Rohit Tiwari', phone: '+91 94154 99001' },
  { name: 'Kamlesh Gautam', phone: '+91 98393 00112' },
  { name: 'Sachin Shukla', phone: '+91 94508 11223' },
  { name: 'Manish Jaiswal', phone: '+91 99185 22334' },
  { name: 'Suraj Maurya', phone: '+91 97926 33445' },
  { name: 'Satish Chaubey', phone: '+91 94153 44556' },
  { name: 'Dhirendra Singh', phone: '+91 94515 55667' },
  { name: 'Anand Upadhyay', phone: '+91 98383 66778' }
];

// Calculate bearing along highway waypoints
function getRoadHeading(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

export const INITIAL_VEHICLES = Array.from({ length: 35 }).map((_, i) => {
  const corridor = CORRIDOR_CONFIGS[i % CORRIDOR_CONFIGS.length];
  const wps = roadRoutesData[corridor.id]?.coordinates || [];
  const driver = DRIVERS[i % DRIVERS.length];
  const carIdxInCorridor = Math.floor(i / CORRIDOR_CONFIGS.length);
  const ratio = Math.min(0.95, Math.max(0.18, 0.18 + carIdxInCorridor * 0.19));
  const wpIndex = Math.min(wps.length - 1, Math.floor(wps.length * ratio));
  const pos = wps[wpIndex] || [82.718401, 26.797313];
  const nextWp = wps[Math.min(wps.length - 1, wpIndex + 2)] || pos;
  const heading = (pos[0] === nextWp[0] && pos[1] === nextWp[1]) ? 0 : getRoadHeading(pos, nextWp);
  const idNum = String(i + 1).padStart(2, '0');
  const speed = 36 + ((i * 7) % 28);
  const roadDist = Number((corridor.totalKm * ratio).toFixed(1));

  return {
    id: `SK-AMB-${idNum}`,
    name: `Outreach Ambulance ${idNum}`,
    type: 'ambulance',
    plate: `UP-51-AT-${4000 + i * 17}`,
    driverName: driver.name,
    driverPhone: driver.phone,
    highwayName: corridor.name,
    status: 'moving',
    speed: speed,
    bearing: heading,
    roadDistFromBaseKm: roadDist,
    totalRoadKm: corridor.totalKm,
    routeWaypoints: wps,
    lineColor: corridor.color,
    glowColor: corridor.glow,
    battery: 82 + (i % 16),
    network: '4G LTE',
    pingMs: 32 + (i % 24),
    lon: pos[0],
    lat: pos[1],
    lastSeen: Date.now() - (i * 3000),
  };
});
