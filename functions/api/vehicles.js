// Cloudflare Pages Function: /api/vehicles
// Returns all registered outreach vehicles and their real-time state

export const DEFAULT_VEHICLES = [
  {
    id: 'SK-VAN-01',
    name: 'Mobile Screening Van 1',
    type: 'screening',
    model: 'Force Traveller (Equipped with Slit Lamp & Autorefractor)',
    plate: 'UP-51-AT-4211',
    assignedDoctor: 'Dr. S. K. Verma (Ophthalmologist)',
    driverName: 'Ramesh Yadav',
    driverPhone: '+91 94151 40719',
    assignedCampId: 'CAMP-HARRAIYA',
    status: 'moving',
    speed: 44,
    bearing: 78,
    batt: 92,
    lat: 26.7982,
    lon: 82.5214,
    lastSeen: Date.now() - 15000,
  },
  {
    id: 'SK-SHUTTLE-02',
    name: 'Cataract Surgical Transport A',
    type: 'shuttle',
    model: 'Tata Winger (15-Seater Patient Carrier)',
    plate: 'UP-51-B-8930',
    assignedDoctor: 'Optom. Priya Singh',
    driverName: 'Manoj Kumar',
    driverPhone: '+91 93364 66677',
    assignedCampId: 'CAMP-BANSI',
    status: 'at_camp',
    speed: 0,
    bearing: 15,
    batt: 78,
    lat: 27.1723,
    lon: 82.9341,
    lastSeen: Date.now() - 40000,
  },
  {
    id: 'SK-VISION-03',
    name: 'Vision Outreach Bus 2',
    type: 'screening',
    model: 'Eicher Starline 32-Seater (Complete Mobile OT)',
    plate: 'UP-51-E-1044',
    assignedDoctor: 'Dr. Anand Tiwari',
    driverName: 'Suresh Maurya',
    driverPhone: '+91 98380 12345',
    assignedCampId: 'CAMP-KHALILABAD',
    status: 'returning',
    speed: 52,
    bearing: 260,
    batt: 65,
    lat: 26.7841,
    lon: 82.8950,
    lastSeen: Date.now() - 8000,
  },
  {
    id: 'SK-AMBULANCE-04',
    name: 'Emergency Outreach Ambulance',
    type: 'ambulance',
    model: 'Force Gurkha 4x4 Medical Unit',
    plate: 'UP-51-G-0012',
    assignedDoctor: 'Paramedic Team Alpha',
    driverName: 'Deepak Shukla',
    driverPhone: '+91 94500 98765',
    assignedCampId: 'BASE-HOSPITAL',
    status: 'at_base',
    speed: 0,
    bearing: 0,
    batt: 100,
    lat: 26.8048,
    lon: 82.7628,
    lastSeen: Date.now() - 5000,
  },
];

export async function onRequest(context) {
  const { env } = context;

  let vehicles = [...DEFAULT_VEHICLES];

  // If Cloudflare KV is configured, fetch live overrides
  if (env && env.FLEET_KV) {
    try {
      const rawIndex = await env.FLEET_KV.get('vehicle_index');
      if (rawIndex) {
        const ids = JSON.parse(rawIndex);
        const fetched = await Promise.all(
          ids.map(id => env.FLEET_KV.get(`vehicle:${id}`).then(res => res ? JSON.parse(res) : null))
        );
        
        // Merge KV live data with vehicle definitions
        for (const item of fetched) {
          if (!item) continue;
          const idx = vehicles.findIndex(v => v.id === item.id);
          if (idx !== -1) {
            vehicles[idx] = {
              ...vehicles[idx],
              lat: item.lat,
              lon: item.lon,
              speed: item.speed,
              bearing: item.bearing,
              batt: item.batt,
              lastSeen: item.lastSeen,
            };
          } else {
            // New auto-registered vehicle from Traccar Client
            vehicles.push({
              id: item.id,
              name: `Eye Camp Vehicle ${item.id}`,
              type: 'screening',
              model: 'Mobile Unit',
              plate: item.id,
              assignedDoctor: 'Outreach Unit',
              driverName: 'Driver',
              driverPhone: '—',
              assignedCampId: 'UNKNOWN',
              status: item.speed > 5 ? 'moving' : 'idle',
              ...item,
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed reading KV:', e);
    }
  }

  return new Response(JSON.stringify({ vehicles, count: vehicles.length, timestamp: Date.now() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
