// Cloudflare Pages Function: /api/camps
// Returns active eye camp locations around Basti (UP) and statistics

export const BASE_HOSPITAL = {
  id: 'BASE-HOSPITAL',
  name: 'Sant Kabir Eye Hospital (Base)',
  organization: 'Pragati India Eye Care Society (PIECS)',
  address: 'Bansi Road, near Pindari Hospital, Katra, Basti, UP 272001',
  lat: 26.8048,
  lon: 82.7628,
  phone: '+91 94151 40719',
  isBase: true,
};

export const ACTIVE_CAMPS = [
  {
    id: 'CAMP-HARRAIYA',
    name: 'Harraiya Community Eye Camp',
    location: 'Block Primary Health Centre, Harraiya, Basti',
    lat: 26.7950,
    lon: 82.4630,
    targetScreening: 250,
    currentScreened: 168,
    cataractIdentified: 34,
    status: 'active',
    assignedTeam: 'Team Alpha (Van 1)',
    startTime: '09:00 AM',
    endTime: '04:00 PM',
  },
  {
    id: 'CAMP-BANSI',
    name: 'Bansi Rural Vision & Cataract Camp',
    location: 'Gram Panchayat Hall, Bansi, Siddharthnagar',
    lat: 27.1740,
    lon: 82.9320,
    targetScreening: 300,
    currentScreened: 242,
    cataractIdentified: 52,
    status: 'boarding_patients', // Shuttle is boarding patients for surgery at base hospital
    assignedTeam: 'Team Beta (Shuttle 2)',
    startTime: '08:30 AM',
    endTime: '03:30 PM',
  },
  {
    id: 'CAMP-KHALILABAD',
    name: 'Sant Kabir Nagar Outreach Centre',
    location: 'Kisan Inter College Ground, Khalilabad',
    lat: 26.7780,
    lon: 83.0720,
    targetScreening: 200,
    currentScreened: 195,
    cataractIdentified: 41,
    status: 'concluded',
    assignedTeam: 'Team Gamma (Bus 3 - Returning)',
    startTime: '09:00 AM',
    endTime: '02:00 PM',
  },
];

export async function onRequest() {
  return new Response(JSON.stringify({
    baseHospital: BASE_HOSPITAL,
    camps: ACTIVE_CAMPS,
    timestamp: Date.now(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  });
}
