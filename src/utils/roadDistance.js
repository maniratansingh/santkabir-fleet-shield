import roadRoutesData from '../data/roadRoutes.json';
import { BASE_HOSPITAL } from '../data/mockData';

// Haversine distance in Kilometers
export function haversineKm(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
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
  return R * c;
}

// Direction bearing between two coordinates
export function calculateBearing(coord1, coord2) {
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

// Project point onto line segment
function projectPointOnSegment(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return { point: a, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return {
    point: [ax + t * dx, ay + t * dy],
    t,
  };
}

// Get the high-fidelity road polyline coordinates for a given camp ID
export function getRoadCoordinates(campId) {
  if (roadRoutesData[campId] && roadRoutesData[campId].coordinates) {
    return roadRoutesData[campId].coordinates;
  }
  return null;
}

// Get total road distance in km for a camp
export function getCampTotalRoadKm(campId) {
  if (roadRoutesData[campId]) {
    return roadRoutesData[campId].roadDistanceKm;
  }
  return 35.0;
}

// Calculate road distance and split polylines for vehicle
export function snapVehicleToRoadAndCalculateDistances(vehicle, campId, isReturning = false) {
  const roadCoords = getRoadCoordinates(campId);
  const baseCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];
  const vehRawCoord = [vehicle.lon, vehicle.lat];

  if (!roadCoords || roadCoords.length < 2) {
    return {
      snappedCoord: vehRawCoord,
      bearing: vehicle.bearing || 0,
      roadDistFromBaseKm: 0,
      roadDistToCampKm: 0,
      filledTrail: [baseCoord, vehRawCoord],
      upcomingRoute: [vehRawCoord, baseCoord],
      progress: 0,
    };
  }

  // 1. Find the nearest segment on the road network
  let minDistance = Infinity;
  let bestIdx = 0;
  let bestProj = roadCoords[0];

  for (let i = 0; i < roadCoords.length - 1; i++) {
    const a = roadCoords[i];
    const b = roadCoords[i + 1];
    const { point, t } = projectPointOnSegment(vehRawCoord, a, b);
    const d = haversineKm(vehRawCoord, point);
    if (d < minDistance) {
      minDistance = d;
      bestIdx = i;
      bestProj = point;
    }
  }

  // 2. Calculate bearing along that road segment
  const nextCoord = roadCoords[Math.min(bestIdx + 1, roadCoords.length - 1)];
  const roadBearing = calculateBearing(roadCoords[bestIdx], nextCoord);
  const bearing = isReturning ? (roadBearing + 180) % 360 : roadBearing;

  // 3. Calculate cumulative road distance from Base Hospital to snapped point
  let roadDistFromBase = 0;
  for (let i = 0; i < bestIdx; i++) {
    roadDistFromBase += haversineKm(roadCoords[i], roadCoords[i + 1]);
  }
  roadDistFromBase += haversineKm(roadCoords[bestIdx], bestProj);

  // 4. Calculate cumulative road distance from snapped point to Camp Destination
  let roadDistToCamp = haversineKm(bestProj, roadCoords[bestIdx + 1]);
  for (let i = bestIdx + 1; i < roadCoords.length - 1; i++) {
    roadDistToCamp += haversineKm(roadCoords[i], roadCoords[i + 1]);
  }

  const totalRoadKm = roadDistFromBase + roadDistToCamp;
  const progress = totalRoadKm > 0 ? roadDistFromBase / totalRoadKm : 0;

  // 5. Build the filled trail (from Base Hospital up to current vehicle road location)
  // This line slowly and slowly fills along the road as the vehicle advances
  const filledTrail = [];
  for (let i = 0; i <= bestIdx; i++) {
    filledTrail.push(roadCoords[i]);
  }
  filledTrail.push(bestProj);

  // 6. Build the upcoming route (from current vehicle road location to Camp Destination)
  const upcomingRoute = [bestProj];
  for (let i = bestIdx + 1; i < roadCoords.length; i++) {
    upcomingRoute.push(roadCoords[i]);
  }

  return {
    snappedCoord: bestProj,
    bearing,
    roadDistFromBaseKm: Math.round(roadDistFromBase * 10) / 10,
    roadDistToCampKm: Math.round(roadDistToCamp * 10) / 10,
    totalRoadKm: Math.round(totalRoadKm * 10) / 10,
    filledTrail: isReturning ? upcomingRoute.reverse() : filledTrail,
    upcomingRoute: isReturning ? filledTrail.reverse() : upcomingRoute,
    progress: Math.min(1, Math.max(0, progress)),
  };
}
