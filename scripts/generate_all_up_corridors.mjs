import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, '../src/data/roadRoutes.json');
const roadRoutesData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

function haversineKm(c1, c2) {
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
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

// Generate smooth dense coordinates along key waypoints
function generateDenseSpline(waypoints, stepKm = 0.4) {
  const result = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const segDist = haversineKm(p1, p2);
    const steps = Math.max(1, Math.round(segDist / stepKm));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      // Slight natural road curvature wiggle
      const wiggleLat = Math.sin(t * Math.PI) * 0.0006 * ((i % 2 === 0) ? 1 : -1);
      const wiggleLon = Math.cos(t * Math.PI) * 0.0005 * ((i % 3 === 0) ? 1 : -1);
      const lon = Number((p1[0] + (p2[0] - p1[0]) * t + wiggleLon).toFixed(6));
      const lat = Number((p1[1] + (p2[1] - p1[1]) * t + wiggleLat).toFixed(6));
      result.push([lon, lat]);
    }
  }
  return result;
}

function calculateTotalKm(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineKm(coords[i], coords[i + 1]);
  }
  return Math.round(total * 10) / 10;
}

// 1. NH-27 West Extension: Basti -> Lucknow -> Kanpur
const lucknowCoords = roadRoutesData['HIGHWAY-NH27-LUCKNOW'].coordinates;
const lucknowToKanpurWaypoints = [
  [80.9462, 26.8467], // Lucknow Hazratganj
  [80.9120, 26.8050], // Alambagh
  [80.8820, 26.7606], // Amausi Airport
  [80.7850, 26.7200], // Banthra
  [80.6450, 26.6800], // Nawabganj
  [80.5600, 26.6100], // Gadankhera
  [80.4878, 26.5393], // Unnao Bypass
  [80.4350, 26.4800], // Ganga Barrage Approach
  [80.3950, 26.4350], // Jajmau Bridge
  [80.3550, 26.4420], // Shukla Ganj / GT Road
  [80.3319, 26.4499], // Kanpur Central
];
const lkoToKnpCoords = generateDenseSpline(lucknowToKanpurWaypoints, 0.4);
const bastiToKanpurCoords = [...lucknowCoords, ...lkoToKnpCoords.slice(1)];
const bastiToKanpurKm = calculateTotalKm(bastiToKanpurCoords);

roadRoutesData['HIGHWAY-WEST-KANPUR'] = {
  name: 'NH-27 West Extension (Basti - Lucknow - Unnao - Kanpur)',
  roadDistanceKm: bastiToKanpurKm,
  roadDistanceMeters: Math.round(bastiToKanpurKm * 1000),
  coordinates: bastiToKanpurCoords,
};

// 2. NH-330 South-West: Basti -> Ayodhya -> Sultanpur -> Pratapgarh -> Prayagraj
// Takes the first ~275 points of HIGHWAY-NH27-LUCKNOW (up to Ayodhya) then heads south along NH-330
const ayodhyaIndex = 275; // Ayodhya
const bastiToAyodhyaCoords = lucknowCoords.slice(0, ayodhyaIndex);
const ayodhyaToPrayagrajWaypoints = [
  bastiToAyodhyaCoords[bastiToAyodhyaCoords.length - 1], // Ayodhya
  [82.1650, 26.7500], // Faizabad Cantt
  [82.1350, 26.6000], // Bikapur
  [82.1100, 26.4400], // Kurebhar
  [82.0727, 26.2648], // Sultanpur Junction
  [82.0450, 26.1900], // Dubaldhan
  [82.0100, 26.1300], // Piparpur
  [81.9967, 25.9228], // Pratapgarh Bela
  [81.9550, 25.8100], // Mandhata
  [81.9200, 25.7000], // Mau Aima
  [81.8850, 25.6100], // Soraon
  [81.8600, 25.5200], // Phaphamau Ganga Bridge
  [81.8463, 25.4358], // Prayagraj Civil Lines
];
const ayodhyaToPrayagrajCoords = generateDenseSpline(ayodhyaToPrayagrajWaypoints, 0.4);
const bastiToPrayagrajCoords = [...bastiToAyodhyaCoords, ...ayodhyaToPrayagrajCoords.slice(1)];
const bastiToPrayagrajKm = calculateTotalKm(bastiToPrayagrajCoords);

roadRoutesData['HIGHWAY-SOUTHWEST-PRAYAGRAJ'] = {
  name: 'NH-330 South-West (Basti - Ayodhya - Sultanpur - Prayagraj)',
  roadDistanceKm: bastiToPrayagrajKm,
  roadDistanceMeters: Math.round(bastiToPrayagrajKm * 1000),
  coordinates: bastiToPrayagrajCoords,
};

// 3. SH-26 / NH-334 North-West: Basti -> Gonda -> Bahraich
const bastiToGondaWaypoints = [
  [82.718537, 26.79729], // Sant Kabir Base
  [82.6850, 26.8120],
  [82.5500, 26.8400],
  [82.4630, 26.7945], // Harraiya
  [82.4100, 26.8600],
  [82.3500, 26.9200], // Babhnan
  [82.2850, 26.9750],
  [82.2300, 27.0300], // Mankapur
  [82.1500, 27.0600],
  [82.0800, 27.0800], // Motiganj
  [81.9619, 27.1306], // Gonda Town
  [81.8800, 27.2400],
  [81.8000, 27.4000], // Payagpur
  [81.6900, 27.4900],
  [81.5944, 27.5750], // Bahraich
];
const bastiToBahraichCoords = generateDenseSpline(bastiToGondaWaypoints, 0.4);
const bastiToBahraichKm = calculateTotalKm(bastiToBahraichCoords);

roadRoutesData['HIGHWAY-NORTHWEST-GONDA'] = {
  name: 'SH-26 North-West (Basti - Mankapur - Gonda - Bahraich)',
  roadDistanceKm: bastiToBahraichKm,
  roadDistanceMeters: Math.round(bastiToBahraichKm * 1000),
  coordinates: bastiToBahraichCoords,
};

// 4. NH-27 East Extension: Basti -> Gorakhpur -> Kushinagar
const gkpCoords = roadRoutesData['HIGHWAY-NH27-GORAKHPUR'].coordinates;
const gkpToKushinagarWaypoints = [
  [83.3732, 26.7606], // Gorakhpur AIIMS
  [83.4200, 26.7550], // Mohaddipur
  [83.4700, 26.7500], // Jagdishpur
  [83.5600, 26.7480], // Pipraich Road
  [83.6600, 26.7460], // Sukrauli
  [83.7400, 26.7450], // Hata
  [83.8200, 26.7430], // Kasia Bypass
  [83.8893, 26.7410], // Kushinagar International / Medical
];
const gkpToKushCoords = generateDenseSpline(gkpToKushinagarWaypoints, 0.4);
const bastiToKushinagarCoords = [...gkpCoords, ...gkpToKushCoords.slice(1)];
const bastiToKushKm = calculateTotalKm(bastiToKushinagarCoords);

roadRoutesData['HIGHWAY-EAST-KUSHINAGAR'] = {
  name: 'NH-27 East Extension (Basti - Gorakhpur - Hata - Kushinagar)',
  roadDistanceKm: bastiToKushKm,
  roadDistanceMeters: Math.round(bastiToKushKm * 1000),
  coordinates: bastiToKushinagarCoords,
};

fs.writeFileSync(jsonPath, JSON.stringify(roadRoutesData, null, 2), 'utf-8');
console.log('✅ Generated Full UP Highway Network in roadRoutes.json:');
console.log(`- HIGHWAY-WEST-KANPUR: ${bastiToKanpurKm} km (${bastiToKanpurCoords.length} pts)`);
console.log(`- HIGHWAY-SOUTHWEST-PRAYAGRAJ: ${bastiToPrayagrajKm} km (${bastiToPrayagrajCoords.length} pts)`);
console.log(`- HIGHWAY-NORTHWEST-GONDA: ${bastiToBahraichKm} km (${bastiToBahraichCoords.length} pts)`);
console.log(`- HIGHWAY-EAST-KUSHINAGAR: ${bastiToKushKm} km (${bastiToKushinagarCoords.length} pts)`);
