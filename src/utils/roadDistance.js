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
export function projectPointOnSegment(p, a, b) {
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

// Get the high-fidelity road polyline coordinates for a given corridor ID
export function getRoadCoordinates(corridorId) {
  if (roadRoutesData[corridorId] && roadRoutesData[corridorId].coordinates) {
    return roadRoutesData[corridorId].coordinates;
  }
  return null;
}

// Get all regional road corridors for ambient network rendering
export function getAllRoadCorridors() {
  return Object.entries(roadRoutesData).map(([id, data]) => ({
    id,
    name: data.name || id,
    roadDistanceKm: data.roadDistanceKm,
    coordinates: data.coordinates,
  }));
}

// Find closest corridor on the road network to an arbitrary GPS point
export function matchNearestCorridor(point) {
  let minDistance = Infinity;
  let bestCorridor = 'CAMP-HARRAIYA';
  let bestIdx = 0;
  let bestProj = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];

  for (const [k, corridor] of Object.entries(roadRoutesData)) {
    const coords = corridor.coordinates;
    if (!coords || coords.length < 2) continue;
    for (let i = 0; i < coords.length - 1; i++) {
      const { point: proj } = projectPointOnSegment(point, coords[i], coords[i + 1]);
      const d = haversineKm(point, proj);
      if (d < minDistance) {
        minDistance = d;
        bestCorridor = k;
        bestIdx = i;
        bestProj = proj;
      }
    }
  }

  return {
    corridor: bestCorridor,
    distKm: minDistance,
    idx: bestIdx,
    snapped: bestProj,
  };
}

// Compute high-fidelity road navigation route between Sant Kabir Hospital Base and vehicle
// Strictly follows road geometry — NEVER creates straight air-line star patterns!
export function getDeliveryRouteSplit(vehicle, camps = []) {
  const baseCoord = [BASE_HOSPITAL.lon, BASE_HOSPITAL.lat];
  const vehRawCoord = [Number(vehicle.lon || 0), Number(vehicle.lat || 0)];

  // At base or missing coordinates
  if (vehicle.status === 'at_base' || (vehRawCoord[0] === 0 && vehRawCoord[1] === 0) || haversineKm(vehRawCoord, baseCoord) < 0.2) {
    return {
      upcomingRoute: [],
      completedTrail: [],
      roadDistFromBaseKm: 0,
      midPoint: baseCoord,
      snappedCoord: baseCoord,
      bearing: 0,
    };
  }

  // 1. Determine road waypoints
  let roadCoords = null;

  // Case A: explicit routeWaypoints attached to vehicle
  if (Array.isArray(vehicle.routeWaypoints) && vehicle.routeWaypoints.length > 1) {
    roadCoords = vehicle.routeWaypoints;
  }

  // Case B: vehicle assigned to a camp/sector
  if (!roadCoords && vehicle.assignedCampId) {
    const camp = camps.find(c => c.id === vehicle.assignedCampId);
    if (camp && camp.routeWaypoints && camp.routeWaypoints.length > 1) {
      roadCoords = camp.routeWaypoints;
    } else if (roadRoutesData[vehicle.assignedCampId]) {
      roadCoords = roadRoutesData[vehicle.assignedCampId].coordinates;
    }
  }

  // Case C: Live vehicle with arbitrary GPS coordinates -> snap to nearest regional road corridor
  let bestIdx = 0;
  let bestProj = vehRawCoord;

  if (!roadCoords) {
    const match = matchNearestCorridor(vehRawCoord);
    const corridor = roadRoutesData[match.corridor];
    if (corridor && corridor.coordinates) {
      roadCoords = corridor.coordinates;
      bestIdx = match.idx;
      bestProj = match.snapped;
    }
  }

  // Fallback to primary corridor if somehow still null
  if (!roadCoords || roadCoords.length < 2) {
    roadCoords = roadRoutesData['CAMP-HARRAIYA']?.coordinates || [baseCoord, vehRawCoord];
  }

  // If bestIdx wasn't calculated above, project onto selected roadCoords
  if (bestProj === vehRawCoord && roadCoords.length > 1) {
    let minD = Infinity;
    for (let i = 0; i < roadCoords.length - 1; i++) {
      const { point: proj } = projectPointOnSegment(vehRawCoord, roadCoords[i], roadCoords[i + 1]);
      const d = haversineKm(vehRawCoord, proj);
      if (d < minD) {
        minD = d;
        bestIdx = i;
        bestProj = proj;
      }
    }
  }

  // 2. Calculate true road distance from Sant Kabir Hospital Base to vehicle
  let roadDistFromBase = 0;
  for (let i = 0; i < bestIdx; i++) {
    roadDistFromBase += haversineKm(roadCoords[i], roadCoords[i + 1]);
  }
  roadDistFromBase += haversineKm(roadCoords[bestIdx], bestProj);

  // 3. Assemble road navigation route (from Base Hospital to vehicle)
  // Every single waypoint adheres to asphalt road geometries
  const roadPath = [];
  for (let i = 0; i <= bestIdx; i++) {
    roadPath.push(roadCoords[i]);
  }
  roadPath.push(bestProj);
  // If slightly off road, smoothly append raw coordinate
  if (haversineKm(bestProj, vehRawCoord) > 0.015) {
    roadPath.push(vehRawCoord);
  }

  // Upcoming navigation ribbon (corridor from vehicle to base if returning, or base to vehicle if outbound)
  const isReturning = vehicle.status === 'returning';
  const upcomingRoute = isReturning ? [...roadPath].reverse() : roadPath;

  // Completed trail breadcrumbs behind vehicle
  let completedTrail = [];
  if (Array.isArray(vehicle.trail) && vehicle.trail.length > 1) {
    completedTrail = vehicle.trail;
  } else {
    const startIdx = Math.max(0, bestIdx - 6);
    completedTrail = roadCoords.slice(startIdx, bestIdx + 1);
    completedTrail.push(bestProj);
  }

  const midIdx = Math.floor(roadPath.length / 2);
  const midPoint = roadPath[midIdx] || vehRawCoord;

  // Next road bearing
  const nextCoord = roadCoords[Math.min(bestIdx + 1, roadCoords.length - 1)];
  const roadBearing = calculateBearing(roadCoords[bestIdx], nextCoord);
  const bearing = isReturning ? (roadBearing + 180) % 360 : roadBearing;

  return {
    upcomingRoute,
    completedTrail,
    roadDistFromBaseKm: Math.round(roadDistFromBase * 10) / 10,
    snappedCoord: bestProj,
    bearing,
    midPoint,
  };
}

// Legacy alias for backwards compatibility
export function snapVehicleToRoadAndCalculateDistances(vehicle, campId, isReturning = false) {
  const res = getDeliveryRouteSplit({ ...vehicle, assignedCampId: campId, status: isReturning ? 'returning' : 'moving' });
  return {
    snappedCoord: res.snappedCoord,
    bearing: res.bearing,
    roadDistFromBaseKm: res.roadDistFromBaseKm,
    roadDistToCampKm: res.roadDistFromBaseKm,
    totalRoadKm: res.roadDistFromBaseKm,
    filledTrail: res.completedTrail,
    upcomingRoute: res.upcomingRoute,
    progress: 0.5,
  };
}
