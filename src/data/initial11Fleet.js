import { FLEET_15 } from './purvanchal15FleetData.js';
import { getUniqueVehicleColor } from '../utils/colors.js';

export const INITIAL_11_FLEET = FLEET_15.slice(0, 11).map((c, i) => {
  const midIdx = Math.floor(c.coords.length * (0.3 + (i % 5) * 0.12));
  const pt = c.coords[midIdx] || c.coords[0] || [83.0722, 26.7797];
  const nextPt = c.coords[Math.min(c.coords.length - 1, midIdx + 1)] || pt;
  const colors = getUniqueVehicleColor(c.id);

  const y = Math.sin((nextPt[0] - pt[0]) * Math.PI / 180) * Math.cos(nextPt[1] * Math.PI / 180);
  const x = Math.cos(pt[1] * Math.PI / 180) * Math.sin(nextPt[1] * Math.PI / 180) -
            Math.sin(pt[1] * Math.PI / 180) * Math.cos(nextPt[1] * Math.PI / 180) * Math.cos((nextPt[0] - pt[0]) * Math.PI / 180);
  const bearing = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);

  return {
    id: c.id,
    name: c.id,
    type: 'ambulance',
    driverName: c.driver,
    driverPhone: c.phone,
    plate: c.id,
    status: 'moving',
    lat: pt[1],
    lon: pt[0],
    speed: 42 + (i % 4) * 6,
    speedKnots: 24 + (i % 4) * 3,
    bearing,
    altitude: 0,
    accuracy: 1.5,
    batt: 85 + (i % 12),
    battery: 85 + (i % 12),
    charge: i % 3 === 0,
    distFromBaseKm: Math.round(c.roadDistanceKm * 0.85 * 10) / 10,
    roadDistFromBaseKm: c.roadDistanceKm,
    villageName: c.village,
    villageBlock: c.village,
    villageDistrict: c.district,
    villageBadge: `Camp: ${c.village}`,
    villageLabel: `📍 Outreach Camp: ${c.village} (${c.district}) • ${c.roadDistanceKm} km`,
    lineColor: colors.line,
    glowColor: colors.glow,
    routeWaypoints: c.coords,
    trail: c.coords.slice(0, midIdx + 1),
    lastSeen: Date.now(),
    isLive: true,
  };
});
