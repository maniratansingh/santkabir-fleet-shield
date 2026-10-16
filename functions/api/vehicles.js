// Cloudflare Pages Function: /api/vehicles
// Returns all active fleet ambulances (Engineered by Mani Ratan Singh • mrps.in)
// 100% Pure Cloudflare Pages Serverless (No external database or KV required)

export const DEFAULT_VEHICLES = [
  {
    id: 'SK-AMB-01',
    name: 'Mobile Clinic Ambulance 1',
    type: 'ambulance',
    driverName: 'Ramesh Yadav',
    driverPhone: '+91 94151 40719',
    status: 'moving',
    speed: 46,
    bearing: 268,
    batt: 89,
    lat: 26.7771,
    lon: 82.6890,
    lastSeen: Date.now() - 10000,
  },
  {
    id: 'SK-AMB-02',
    name: 'Surgical Patient Ambulance A',
    type: 'ambulance',
    driverName: 'Manoj Kumar',
    driverPhone: '+91 93364 66677',
    status: 'moving',
    speed: 48,
    bearing: 27,
    batt: 76,
    lat: 26.9675,
    lon: 82.7752,
    lastSeen: Date.now() - 25000,
  },
  {
    id: 'SK-AMB-03',
    name: 'Vision Outreach Ambulance 2',
    type: 'ambulance',
    driverName: 'Suresh Maurya',
    driverPhone: '+91 98380 12345',
    status: 'returning',
    speed: 51,
    bearing: 275,
    batt: 64,
    lat: 26.7925,
    lon: 82.9459,
    lastSeen: Date.now() - 5000,
  },
];

export async function onRequest() {
  return new Response(JSON.stringify(DEFAULT_VEHICLES), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Powered-By': 'Sant Kabir Fleet Shield (mrps.in)',
    },
  });
}
