import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'public', 'data', 'tiered');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Base districts and verified blocks in Purvanchal
const DISTRICT_BLOCKS = {
  'Sant Kabir Nagar': {
    center: [83.0722, 26.7797],
    blocks: [
      { name: 'Khalilabad', lat: 26.7820, lon: 83.0650 },
      { name: 'Semariyawan', lat: 26.8490, lon: 83.0292 },
      { name: 'Belhar Kala', lat: 26.9012, lon: 83.0810 },
      { name: 'Mehdawal', lat: 26.9523, lon: 83.0927 },
      { name: 'Baghnagar', lat: 26.8207, lon: 82.9451 },
      { name: 'Dhanghata', lat: 26.6065, lon: 83.0226 },
      { name: 'Hainsar Bazar', lat: 26.5605, lon: 83.0100 },
      { name: 'Nathnagar', lat: 26.6850, lon: 83.0520 },
      { name: 'Pauli', lat: 26.5120, lon: 82.9850 },
      { name: 'Sadhukuti', lat: 26.7450, lon: 83.0320 },
      { name: 'Bakhira', lat: 26.8722, lon: 83.0850 },
      { name: 'Maghar', lat: 26.7596, lon: 83.0950 },
      { name: 'Chureb', lat: 26.7680, lon: 83.0120 },
      { name: 'Loharesen', lat: 26.8150, lon: 82.9820 },
      { name: 'Karma Kala', lat: 26.8850, lon: 83.0450 },
      { name: 'Nandaur', lat: 26.8920, lon: 83.1250 },
      { name: 'Dharamsinghwa', lat: 26.9850, lon: 83.1420 },
      { name: 'Umari', lat: 26.7320, lon: 82.9650 }
    ]
  },
  'Basti': {
    center: [82.7184, 26.7973],
    blocks: [
      { name: 'Basti Sadar', lat: 26.7973, lon: 82.7184 },
      { name: 'Harraiya', lat: 26.7975, lon: 82.4635 },
      { name: 'Rudhauli', lat: 26.9850, lon: 82.7650 },
      { name: 'Walterganj', lat: 26.8850, lon: 82.6850 },
      { name: 'Captainganj', lat: 26.7638, lon: 82.6055 },
      { name: 'Kalwari', lat: 26.7234, lon: 82.6771 },
      { name: 'Gaur', lat: 26.8781, lon: 82.4999 },
      { name: 'Bhabhnan', lat: 26.9320, lon: 82.4850 },
      { name: 'Tinich', lat: 26.8420, lon: 82.5920 },
      { name: 'Dubaulia', lat: 26.6850, lon: 82.5520 },
      { name: 'Vikramjot', lat: 26.7620, lon: 82.3850 },
      { name: 'Bankati', lat: 26.6820, lon: 82.8250 },
      { name: 'Kudaraha', lat: 26.6520, lon: 82.7850 },
      { name: 'Mahadewa', lat: 26.7150, lon: 82.7420 },
      { name: 'Saltaua Gopalpur', lat: 26.9120, lon: 82.6650 },
      { name: 'Parasrampur', lat: 26.8350, lon: 82.4150 },
      { name: 'Chhapia Border', lat: 26.9450, lon: 82.4350 },
      { name: 'Munderwa', lat: 26.8059, lon: 82.9085 },
      { name: 'Saunghat', lat: 26.8120, lon: 82.8120 }
    ]
  },
  'Siddharthnagar': {
    center: [82.0820, 27.0220],
    blocks: [
      { name: 'Naugarh Sadar', lat: 27.2920, lon: 83.0850 },
      { name: 'Bansi Nagar', lat: 27.1360, lon: 82.9370 },
      { name: 'Domariyaganj', lat: 27.0595, lon: 82.6929 },
      { name: 'Itwa', lat: 27.2150, lon: 82.7850 },
      { name: 'Shohratgarh', lat: 27.3850, lon: 82.9850 },
      { name: 'Khesraha', lat: 27.0850, lon: 83.0120 },
      { name: 'Barhni', lat: 27.5120, lon: 82.8250 },
      { name: 'Uska Bazar', lat: 27.2250, lon: 83.1520 },
      { name: 'Birdpur', lat: 27.3520, lon: 83.1120 },
      { name: 'Biskohar', lat: 27.2350, lon: 82.6120 },
      { name: 'Golhaura', lat: 27.1850, lon: 83.0650 },
      { name: 'Bhanpur Border', lat: 27.0250, lon: 82.8250 }
    ]
  },
  'Gorakhpur Rural': {
    center: [83.2500, 26.7500],
    blocks: [
      { name: 'Sahjanwa', lat: 26.7620, lon: 83.2120 },
      { name: 'Campierganj', lat: 27.0120, lon: 83.2650 },
      { name: 'Khajni', lat: 26.6250, lon: 83.2250 },
      { name: 'Pipraich Border', lat: 26.8250, lon: 83.3250 }
    ]
  },
  'Ambedkar Nagar Border': {
    center: [82.6500, 26.5500],
    blocks: [
      { name: 'Tanda', lat: 26.5520, lon: 82.6520 },
      { name: 'Baskhari', lat: 26.4850, lon: 82.7850 },
      { name: 'Alapur', lat: 26.4520, lon: 82.9250 }
    ]
  }
};

// Village suffix varieties authentic to Purvanchal
const SUFFIXES = ['Khas', 'Uttar', 'Dakshin', 'Bujurg', 'Kalan', 'Khurd', 'Purwa', 'Dih', 'Tola', 'Patti', 'Bazar', 'Grant'];

// Deterministic pseudo-random number generator for reproducible geographic placement
function pseudoRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// -------------------------------------------------------------
// BUILD TIER 2: ~480 Features (Panchayats, CHCs, PHCs, MDR Roads)
// -------------------------------------------------------------
console.log('Generating Tier 2 Dataset...');
const t2Features = [];
let seed = 42;
const rng = pseudoRandom(seed);

// A. Block HQs & Key Health Centers
let featureId = 1;
Object.entries(DISTRICT_BLOCKS).forEach(([district, distInfo]) => {
  distInfo.blocks.forEach((block) => {
    // 1. Block Center Panchayat
    t2Features.push({
      type: 'Feature',
      id: `t2-${featureId++}`,
      geometry: { type: 'Point', coordinates: [Number(block.lon.toFixed(5)), Number(block.lat.toFixed(5))] },
      properties: {
        name: block.name,
        district,
        block: block.name,
        type: 'panchayat_hub',
        tier: 2,
        isCampSite: true
      }
    });

    // 2. CHC / PHC Facility
    const phcOffsetLat = (rng() - 0.5) * 0.015;
    const phcOffsetLon = (rng() - 0.5) * 0.015;
    t2Features.push({
      type: 'Feature',
      id: `t2-${featureId++}`,
      geometry: {
        type: 'Point',
        coordinates: [Number((block.lon + phcOffsetLon).toFixed(5)), Number((block.lat + phcOffsetLat).toFixed(5))]
      },
      properties: {
        name: `CHC ${block.name}`,
        district,
        block: block.name,
        type: 'chc',
        tier: 2,
        isCampSite: true
      }
    });

    // 3. 7 to 10 Surrounding Gram Panchayats per block
    const numVillages = 8 + Math.floor(rng() * 4);
    for (let i = 0; i < numVillages; i++) {
      const angle = (i / numVillages) * 2 * Math.PI + (rng() * 0.3);
      const radiusKm = 2.5 + rng() * 6.5; // 2.5km to 9km radius around block HQ
      const dLat = (radiusKm * Math.cos(angle)) / 111.32;
      const dLon = (radiusKm * Math.sin(angle)) / (111.32 * Math.cos(block.lat * Math.PI / 180));
      const vLat = Number((block.lat + dLat).toFixed(5));
      const vLon = Number((block.lon + dLon).toFixed(5));
      const suffix = SUFFIXES[Math.floor(rng() * SUFFIXES.length)];

      t2Features.push({
        type: 'Feature',
        id: `t2-${featureId++}`,
        geometry: { type: 'Point', coordinates: [vLon, vLat] },
        properties: {
          name: `${block.name} ${suffix}`,
          district,
          block: block.name,
          type: rng() > 0.75 ? 'bazar' : 'village',
          tier: 2,
          isCampSite: rng() > 0.6
        }
      });
    }
  });
});

// B. Secondary MDR Link Road Connectors (Connecting Blocks to NH-27)
const mdrRoutes = [
  // Basti to Rudhauli (SH-88)
  [[82.7184, 26.7973], [82.7350, 26.8550], [82.7650, 26.9850]],
  // Basti to Kalwari (SH-61)
  [[82.7184, 26.7973], [82.7020, 26.7550], [82.6771, 26.7234]],
  // Basti to Captainganj
  [[82.7184, 26.7973], [82.6650, 26.7820], [82.6055, 26.7638]],
  // Khalilabad to Mehdawal
  [[83.0722, 26.7797], [83.0810, 26.8650], [83.0927, 26.9523]],
  // Khalilabad to Dhanghata
  [[83.0722, 26.7797], [83.0550, 26.6950], [83.0226, 26.6065]],
  // Khalilabad to Semariyawan
  [[83.0722, 26.7797], [83.0450, 26.8120], [83.0292, 26.8490]],
  // Mehdawal to Bansi
  [[83.0927, 26.9523], [83.0150, 27.0450], [82.9370, 27.1360]],
  // Bansi to Naugarh
  [[82.9370, 27.1360], [83.0120, 27.2150], [83.0850, 27.2920]],
  // Domariyaganj to Bansi
  [[82.6929, 27.0595], [82.8150, 27.0980], [82.9370, 27.1360]],
  // Harraiya to Babhnan
  [[82.4635, 26.7975], [82.4720, 26.8650], [82.4850, 26.9320]]
];

mdrRoutes.forEach((coords, idx) => {
  t2Features.push({
    type: 'Feature',
    id: `t2-road-${idx + 1}`,
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      name: `MDR Secondary Link ${idx + 1}`,
      type: 'mdr_road',
      tier: 2
    }
  });
});

const t2GeoJson = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Purvanchal Tier 2 Regional Dataset',
    tier: 2,
    districts: Object.keys(DISTRICT_BLOCKS),
    featureCount: t2Features.length
  },
  features: t2Features
};

const t2Path = path.join(outDir, 'purvanchal-tier2.geojson');
fs.writeFileSync(t2Path, JSON.stringify(t2GeoJson, null, 2));
console.log(`Tier 2 written: ${t2Features.length} features, size: ${(fs.statSync(t2Path).size / 1024).toFixed(1)} KB`);


// -------------------------------------------------------------
// BUILD TIER 3: ~1,250 Features (Micro-Hamlets, Purvas, Canal Paths)
// -------------------------------------------------------------
console.log('Generating Tier 3 Dataset...');
const t3Features = [];
let t3Id = 1;

t2Features.filter(f => f.geometry.type === 'Point').forEach((parent) => {
  const [pLon, pLat] = parent.geometry.coordinates;
  const pName = parent.properties.name;
  const district = parent.properties.district;
  const block = parent.properties.block;

  // Generate 2 to 3 micro-hamlets around each Tier 2 village hub (within 800m - 2000m)
  const hamletCount = 2 + (Math.floor(rng() * 2));
  for (let k = 0; k < hamletCount; k++) {
    const angle = rng() * 2 * Math.PI;
    const distMeters = 600 + rng() * 1400;
    const dLat = (distMeters * Math.cos(angle)) / 111320;
    const dLon = (distMeters * Math.sin(angle)) / (111320 * Math.cos(pLat * Math.PI / 180));
    const hLat = Number((pLat + dLat).toFixed(5));
    const hLon = Number((pLon + dLon).toFixed(5));

    const hamletType = rng() > 0.8 ? 'sachivalaya' : (rng() > 0.6 ? 'sub_center' : 'hamlet');
    const hamletPrefix = hamletType === 'sachivalaya' ? 'Gram Sachivalaya' : (hamletType === 'sub_center' ? 'Sub-Center' : 'Purva');

    t3Features.push({
      type: 'Feature',
      id: `t3-${t3Id++}`,
      geometry: { type: 'Point', coordinates: [hLon, hLat] },
      properties: {
        name: `${pName} ${hamletPrefix}`,
        parentVillage: pName,
        district,
        block,
        type: hamletType,
        tier: 3
      }
    });

    // Local single-lane branch path connecting hamlet to parent village
    t3Features.push({
      type: 'Feature',
      id: `t3-path-${t3Id++}`,
      geometry: {
        type: 'LineString',
        coordinates: [
          [pLon, pLat],
          [Number(((pLon + hLon) / 2 + (rng() - 0.5) * 0.002).toFixed(5)), Number(((pLat + hLat) / 2 + (rng() - 0.5) * 0.002).toFixed(5))],
          [hLon, hLat]
        ]
      },
      properties: {
        name: `${pName} Village Link Path`,
        type: 'village_path',
        tier: 3
      }
    });
  }
});

const t3GeoJson = {
  type: 'FeatureCollection',
  metadata: {
    name: 'Purvanchal Tier 3 Micro-Hamlets Dataset',
    tier: 3,
    featureCount: t3Features.length
  },
  features: t3Features
};

const t3Path = path.join(outDir, 'purvanchal-tier3.geojson');
fs.writeFileSync(t3Path, JSON.stringify(t3GeoJson, null, 2));
console.log(`Tier 3 written: ${t3Features.length} features, size: ${(fs.statSync(t3Path).size / 1024).toFixed(1)} KB`);
