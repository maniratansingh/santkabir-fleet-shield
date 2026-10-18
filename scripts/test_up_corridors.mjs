import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const roadRoutesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../src/data/roadRoutes.json'), 'utf-8')
);

const BASE_HOSPITAL = { lat: 26.7973, lon: 82.7184 };

function haversineKm(coord1, coord2) {
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

function matchNearestCorridor(point) {
  let minDistance = Infinity;
  let bestCorridor = 'HIGHWAY-NH27-LUCKNOW';
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

function testVehicleRoute(name, lat, lon) {
  const point = [lon, lat];
  const match = matchNearestCorridor(point);
  const corridor = roadRoutesData[match.corridor];
  const roadCoords = corridor.coordinates;

  let roadDistFromBase = 0;
  for (let i = 0; i < match.idx; i++) {
    roadDistFromBase += haversineKm(roadCoords[i], roadCoords[i + 1]);
  }
  roadDistFromBase += haversineKm(roadCoords[match.idx], match.snapped);

  const roadPath = [];
  for (let i = 0; i <= match.idx; i++) {
    roadPath.push(roadCoords[i]);
  }
  roadPath.push(match.snapped);
  if (haversineKm(match.snapped, point) > 0.015) {
    roadPath.push(point);
  }

  console.log(`📍 ${name.padEnd(30)} -> Corridor: ${match.corridor.padEnd(25)} SnapDist: ${match.distKm.toFixed(2)}km | RoadKm: ${roadDistFromBase.toFixed(1)}km | Pts: ${roadPath.length}`);
}

console.log('--- Testing UP Cities & Locations Routing to Sant Kabir Hospital (Basti) ---');
testVehicleRoute('Lucknow (Charbagh/Hazratganj)', 26.8467, 80.9462);
testVehicleRoute('Barabanki', 26.9274, 81.1834);
testVehicleRoute('Ayodhya (Ram Mandir)', 26.7922, 82.1998);
testVehicleRoute('Harraiya', 26.7945, 82.4630);
testVehicleRoute('Khalilabad', 26.7780, 83.0718);
testVehicleRoute('Gorakhpur (AIIMS)', 26.7606, 83.3732);
testVehicleRoute('Varanasi (BHU)', 25.3176, 82.9739);
testVehicleRoute('Akbarpur (Ambedkar Nagar)', 26.4371, 82.5392);
testVehicleRoute('Tanda', 26.5492, 82.6567);
testVehicleRoute('Siddharthnagar / Bansi', 27.1738, 82.9351);
testVehicleRoute('Domariyaganj', 27.1969, 82.6825);
testVehicleRoute('Rudhauli', 27.0235, 82.7503);
testVehicleRoute('Kanpur (Central)', 26.4499, 80.3319);
testVehicleRoute('Prayagraj (Civil Lines)', 25.4358, 81.8463);
