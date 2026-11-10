// src/utils/kalman.js
var METERS_PER_DEG_LAT = 111320;
function mat4Mul(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[r * 4 + k] * b[k * 4 + c];
      }
      out[r * 4 + c] = sum;
    }
  }
  return out;
}
function mat4Transpose(a) {
  return [
    a[0],
    a[4],
    a[8],
    a[12],
    a[1],
    a[5],
    a[9],
    a[13],
    a[2],
    a[6],
    a[10],
    a[14],
    a[3],
    a[7],
    a[11],
    a[15]
  ];
}
function createKinematicFilter(options = {}) {
  const processAccel = Number.isFinite(options.processAccel) ? options.processAccel : 0.05;
  const minAccuracy = Number.isFinite(options.minAccuracy) ? options.minAccuracy : 3;
  const maxAccuracy = Number.isFinite(options.maxAccuracy) ? options.maxAccuracy : 150;
  let state = null;
  let covariance = null;
  let lastTimestamp = 0;
  const reset = () => {
    state = null;
    covariance = null;
    lastTimestamp = 0;
  };
  const initialize = (lat, lon, timestamp, rLat, rLon) => {
    state = [lat, lon, 0, 0];
    covariance = [
      rLat,
      0,
      0,
      0,
      0,
      rLon,
      0,
      0,
      0,
      0,
      1e-7,
      0,
      0,
      0,
      0,
      1e-7
    ];
    lastTimestamp = timestamp;
    return { lat, lon, vLat: 0, vLon: 0, filtered: false };
  };
  const update = (lat, lon, accuracy = 10, timestamp = Date.now()) => {
    const rawLat = Number(lat);
    const rawLon = Number(lon);
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
      return { lat: rawLat, lon: rawLon, vLat: 0, vLon: 0, filtered: false };
    }
    const acc = Math.min(maxAccuracy, Math.max(minAccuracy, Number(accuracy) || 10));
    const t = Number.isFinite(timestamp) ? timestamp : Date.now();
    const cosLat = Math.max(0.1, Math.cos(rawLat * Math.PI / 180));
    const metersPerDegLon = METERS_PER_DEG_LAT * cosLat;
    const rLat = (acc / METERS_PER_DEG_LAT) ** 2;
    const rLon = (acc / metersPerDegLon) ** 2;
    if (!state) return initialize(rawLat, rawLon, t, rLat, rLon);
    let dt = (t - lastTimestamp) / 1e3;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 60) {
      reset();
      return initialize(rawLat, rawLon, t, rLat, rLon);
    }
    dt = Math.max(0.5, Math.min(60, dt));
    const F = [
      1,
      0,
      dt,
      0,
      0,
      1,
      0,
      dt,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    ];
    const predicted = [
      state[0] + state[2] * dt,
      state[1] + state[3] * dt,
      state[2],
      state[3]
    ];
    const FP = mat4Mul(F, covariance);
    const FPFt = mat4Mul(FP, mat4Transpose(F));
    const qLat = (processAccel / METERS_PER_DEG_LAT) ** 2;
    const qLon = (processAccel / metersPerDegLon) ** 2;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    const Q = [
      qLat * dt4 / 4,
      0,
      qLat * dt3 / 2,
      0,
      0,
      qLon * dt4 / 4,
      0,
      qLon * dt3 / 2,
      qLat * dt3 / 2,
      0,
      qLat * dt2,
      0,
      0,
      qLon * dt3 / 2,
      0,
      qLon * dt2
    ];
    const P = FPFt.map((value, index) => value + Q[index]);
    const s00 = P[0] + rLat;
    const s01 = P[1];
    const s10 = P[4];
    const s11 = P[5] + rLon;
    const det = s00 * s11 - s01 * s10;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-24) {
      reset();
      return initialize(rawLat, rawLon, t, rLat, rLon);
    }
    const inv00 = s11 / det;
    const inv01 = -s01 / det;
    const inv10 = -s10 / det;
    const inv11 = s00 / det;
    const pht = [
      [P[0], P[1]],
      [P[4], P[5]],
      [P[8], P[9]],
      [P[12], P[13]]
    ];
    const K = pht.map((row) => [
      row[0] * inv00 + row[1] * inv10,
      row[0] * inv01 + row[1] * inv11
    ]);
    const innovationLat = rawLat - predicted[0];
    const innovationLon = rawLon - predicted[1];
    const nextState = [
      predicted[0] + K[0][0] * innovationLat + K[0][1] * innovationLon,
      predicted[1] + K[1][0] * innovationLat + K[1][1] * innovationLon,
      predicted[2] + K[2][0] * innovationLat + K[2][1] * innovationLon,
      predicted[3] + K[3][0] * innovationLat + K[3][1] * innovationLon
    ];
    const hp0 = P.slice(0, 4);
    const hp1 = P.slice(4, 8);
    const nextCovariance = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        nextCovariance[r * 4 + c] = P[r * 4 + c] - (K[r][0] * hp0[c] + K[r][1] * hp1[c]);
      }
    }
    state = nextState;
    covariance = nextCovariance;
    lastTimestamp = t;
    return {
      lat: nextState[0],
      lon: nextState[1],
      vLat: nextState[2],
      vLon: nextState[3],
      filtered: true
    };
  };
  return {
    update,
    reset,
    getState: () => state ? { state: [...state], covariance: [...covariance] } : null
  };
}

// src/utils/baseLocation.js
var BASE_LAT = 26.797313;
var BASE_LON = 82.718401;

// src/utils/geo.js
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
function calculateBearing(c1, c2) {
  if (!c1 || !c2) return 0;
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}

// src/utils/colors.js
var PRIMARY_PALETTE = [
  { line: "#007AFF", glow: "#38BDF8" },
  // Apple Blue
  { line: "#10B981", glow: "#34D399" },
  // Emerald Green
  { line: "#F59E0B", glow: "#FBBF24" },
  // Vivid Amber
  { line: "#8B5CF6", glow: "#A78BFA" },
  // Royal Violet
  { line: "#EC4899", glow: "#F472B6" },
  // Rose Pink
  { line: "#06B6D4", glow: "#22D3EE" },
  // Electric Cyan
  { line: "#84CC16", glow: "#A3E635" },
  // Lime Green
  { line: "#F97316", glow: "#FB923C" },
  // Tangerine
  { line: "#6366F1", glow: "#818CF8" },
  // Indigo
  { line: "#14B8A6", glow: "#2DD4BF" },
  // Teal
  { line: "#E11D48", glow: "#FB7185" },
  // Crimson Coral
  { line: "#D946EF", glow: "#E879F9" }
  // Magenta
];
var GOLDEN_RATIO_CONJUGATE = 0.618033988749895;
function hslToHex(h, s, l) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}
function getUniqueVehicleColor(id = "") {
  const cleanId = String(id).trim().toUpperCase();
  const match = cleanId.match(/AMB-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= PRIMARY_PALETTE.length) {
      return PRIMARY_PALETTE[num - 1];
    }
  }
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = hash * 31 + cleanId.charCodeAt(i) & 4294967295;
  }
  const seed = Math.abs(hash);
  let hue = seed * GOLDEN_RATIO_CONJUGATE % 1;
  hue = Math.floor(hue * 360);
  const line = hslToHex(hue, 88, 50);
  const glow = hslToHex(hue, 92, 68);
  return { line, glow };
}

// src/data/ruralVillages.json
var ruralVillages_default = [
  {
    name: "Maghar Gram",
    block: "Khalilabad",
    district: "Sant Kabir Nagar",
    lat: 26.7583,
    lon: 83.1311,
    type: "block_tehsil"
  },
  {
    name: "Khalilabad Sadar",
    block: "Khalilabad",
    district: "Sant Kabir Nagar",
    lat: 26.7797,
    lon: 83.0722,
    type: "block_tehsil"
  },
  {
    name: "Semariyawan Gram",
    block: "Semariyawan",
    district: "Sant Kabir Nagar",
    lat: 26.8856,
    lon: 82.9847,
    type: "block_tehsil"
  },
  {
    name: "Belhar Kala Gram",
    block: "Belhar Kala",
    district: "Sant Kabir Nagar",
    lat: 26.965,
    lon: 83.052,
    type: "block_tehsil"
  },
  {
    name: "Baghnagar Gram",
    block: "Semariyawan",
    district: "Sant Kabir Nagar",
    lat: 26.862,
    lon: 82.934,
    type: "block_tehsil"
  },
  {
    name: "Mehdawal Bazar",
    block: "Mehdawal",
    district: "Sant Kabir Nagar",
    lat: 26.98,
    lon: 83.12,
    type: "block_tehsil"
  },
  {
    name: "Bakhira Gram",
    block: "Bakhira",
    district: "Sant Kabir Nagar",
    lat: 26.92,
    lon: 83.1,
    type: "block_tehsil"
  },
  {
    name: "Dhanghata Bazar",
    block: "Dhanghata",
    district: "Sant Kabir Nagar",
    lat: 26.58,
    lon: 83.02,
    type: "block_tehsil"
  },
  {
    name: "Hainsar Bazar",
    block: "Hainsar",
    district: "Sant Kabir Nagar",
    lat: 26.54,
    lon: 83.07,
    type: "block_tehsil"
  },
  {
    name: "Nathnagar Gram",
    block: "Nathnagar",
    district: "Sant Kabir Nagar",
    lat: 26.65,
    lon: 83.05,
    type: "block_tehsil"
  },
  {
    name: "Chureb Gram",
    block: "Khalilabad",
    district: "Sant Kabir Nagar",
    lat: 26.81,
    lon: 83.01,
    type: "rural_camp"
  },
  {
    name: "Nandaur Gram",
    block: "Mehdawal",
    district: "Sant Kabir Nagar",
    lat: 27.02,
    lon: 83.07,
    type: "rural_camp"
  },
  {
    name: "Pauli Gram",
    block: "Pauli",
    district: "Sant Kabir Nagar",
    lat: 26.52,
    lon: 82.96,
    type: "block_tehsil"
  },
  {
    name: "Umari Gram",
    block: "Dhanghata",
    district: "Sant Kabir Nagar",
    lat: 26.62,
    lon: 82.98,
    type: "rural_camp"
  },
  {
    name: "Dharamsinghwa Gram",
    block: "Belhar Kala",
    district: "Sant Kabir Nagar",
    lat: 27.01,
    lon: 83.15,
    type: "rural_camp"
  },
  {
    name: "Loharesen Gram",
    block: "Semariyawan",
    district: "Sant Kabir Nagar",
    lat: 26.84,
    lon: 82.96,
    type: "rural_camp"
  },
  {
    name: "Karma Kala Gram",
    block: "Khalilabad",
    district: "Sant Kabir Nagar",
    lat: 26.73,
    lon: 83.09,
    type: "rural_camp"
  },
  {
    name: "Munderwa Gram",
    block: "Basti Sadar",
    district: "Basti",
    lat: 26.79,
    lon: 82.88,
    type: "rural_camp"
  },
  {
    name: "Harraiya Gram",
    block: "Harraiya",
    district: "Basti",
    lat: 26.7972,
    lon: 82.4636,
    type: "block_tehsil"
  },
  {
    name: "Rudhauli Bazar",
    block: "Rudhauli",
    district: "Basti",
    lat: 27,
    lon: 82.78,
    type: "block_tehsil"
  },
  {
    name: "Walterganj Gram",
    block: "Saltaua",
    district: "Basti",
    lat: 26.9,
    lon: 82.72,
    type: "block_tehsil"
  },
  {
    name: "Captainganj Gram",
    block: "Captainganj",
    district: "Basti",
    lat: 26.78,
    lon: 82.6,
    type: "block_tehsil"
  },
  {
    name: "Parasrampur Gram",
    block: "Parasrampur",
    district: "Basti",
    lat: 26.85,
    lon: 82.35,
    type: "block_tehsil"
  },
  {
    name: "Gaur Bazar",
    block: "Gaur",
    district: "Basti",
    lat: 26.93,
    lon: 82.52,
    type: "block_tehsil"
  },
  {
    name: "Chhapia Gram",
    block: "Gaur",
    district: "Gonda",
    lat: 26.97,
    lon: 82.39,
    type: "block_tehsil"
  },
  {
    name: "Mahadewa Gram",
    block: "Kudaraha",
    district: "Basti",
    lat: 26.68,
    lon: 82.74,
    type: "block_tehsil"
  },
  {
    name: "Bankati Gram",
    block: "Bankati",
    district: "Basti",
    lat: 26.67,
    lon: 82.85,
    type: "block_tehsil"
  },
  {
    name: "Saltaua Gopalpur Gram",
    block: "Saltaua",
    district: "Basti",
    lat: 26.95,
    lon: 82.68,
    type: "block_tehsil"
  },
  {
    name: "Kudaraha Gram",
    block: "Kudaraha",
    district: "Basti",
    lat: 26.64,
    lon: 82.79,
    type: "block_tehsil"
  },
  {
    name: "Vikramjot Gram",
    block: "Vikramjot",
    district: "Basti",
    lat: 26.78,
    lon: 82.3,
    type: "block_tehsil"
  },
  {
    name: "Dubaulia Bazar",
    block: "Dubaulia",
    district: "Basti",
    lat: 26.69,
    lon: 82.52,
    type: "block_tehsil"
  },
  {
    name: "Kalwari Bazar",
    block: "Basti Sadar",
    district: "Basti",
    lat: 26.66,
    lon: 82.7,
    type: "block_tehsil"
  },
  {
    name: "Tinich Gram",
    block: "Gaur",
    district: "Basti",
    lat: 26.87,
    lon: 82.62,
    type: "block_tehsil"
  },
  {
    name: "Bhabhnan Bazar",
    block: "Gaur",
    district: "Basti",
    lat: 26.94,
    lon: 82.47,
    type: "block_tehsil"
  },
  {
    name: "Nagar Bazar",
    block: "Basti Sadar",
    district: "Basti",
    lat: 26.73,
    lon: 82.78,
    type: "block_tehsil"
  },
  {
    name: "Bansi Nagar",
    block: "Bansi",
    district: "Siddharthnagar",
    lat: 27.17,
    lon: 82.93,
    type: "block_tehsil"
  },
  {
    name: "Domariyaganj Bazar",
    block: "Domariyaganj",
    district: "Siddharthnagar",
    lat: 27.2,
    lon: 82.68,
    type: "block_tehsil"
  },
  {
    name: "Itwa Gram",
    block: "Itwa",
    district: "Siddharthnagar",
    lat: 27.32,
    lon: 82.75,
    type: "block_tehsil"
  },
  {
    name: "Shohratgarh Bazar",
    block: "Shohratgarh",
    district: "Siddharthnagar",
    lat: 27.38,
    lon: 82.98,
    type: "block_tehsil"
  },
  {
    name: "Khesraha Gram",
    block: "Khesraha",
    district: "Siddharthnagar",
    lat: 27.08,
    lon: 82.97,
    type: "block_tehsil"
  },
  {
    name: "Barhni Bazar",
    block: "Barhni",
    district: "Siddharthnagar",
    lat: 27.5,
    lon: 82.78,
    type: "block_tehsil"
  },
  {
    name: "Naugarh Sadar",
    block: "Naugarh",
    district: "Siddharthnagar",
    lat: 27.29,
    lon: 83.08,
    type: "block_tehsil"
  },
  {
    name: "Uska Bazar",
    block: "Uska Bazar",
    district: "Siddharthnagar",
    lat: 27.22,
    lon: 83.13,
    type: "block_tehsil"
  },
  {
    name: "Birdpur Gram",
    block: "Birdpur",
    district: "Siddharthnagar",
    lat: 27.36,
    lon: 83.11,
    type: "block_tehsil"
  },
  {
    name: "Biskohar Gram",
    block: "Itwa",
    district: "Siddharthnagar",
    lat: 27.37,
    lon: 82.61,
    type: "block_tehsil"
  },
  {
    name: "Bhanpur Gram",
    block: "Bhanpur",
    district: "Basti",
    lat: 26.97,
    lon: 82.63,
    type: "rural_camp"
  },
  {
    name: "Golhaura Gram",
    block: "Golhaura",
    district: "Siddharthnagar",
    lat: 27.18,
    lon: 83.02,
    type: "block_tehsil"
  },
  {
    name: "Tanda Nagar",
    block: "Tanda",
    district: "Ambedkar Nagar",
    lat: 26.55,
    lon: 82.66,
    type: "block_tehsil"
  },
  {
    name: "Akbarpur Sadar",
    block: "Akbarpur",
    district: "Ambedkar Nagar",
    lat: 26.43,
    lon: 82.54,
    type: "block_tehsil"
  },
  {
    name: "Jalalpur Bazar",
    block: "Jalalpur",
    district: "Ambedkar Nagar",
    lat: 26.31,
    lon: 82.74,
    type: "block_tehsil"
  },
  {
    name: "Baskhari Gram",
    block: "Baskhari",
    district: "Ambedkar Nagar",
    lat: 26.47,
    lon: 82.78,
    type: "block_tehsil"
  },
  {
    name: "Alapur Gram",
    block: "Alapur",
    district: "Ambedkar Nagar",
    lat: 26.35,
    lon: 82.88,
    type: "block_tehsil"
  },
  {
    name: "Katehari Gram",
    block: "Katehari",
    district: "Ambedkar Nagar",
    lat: 26.48,
    lon: 82.38,
    type: "block_tehsil"
  },
  {
    name: "Bhiti Gram",
    block: "Bhiti",
    district: "Ambedkar Nagar",
    lat: 26.51,
    lon: 82.26,
    type: "block_tehsil"
  },
  {
    name: "Jahangir Ganj Gram",
    block: "Jahangir Ganj",
    district: "Ambedkar Nagar",
    lat: 26.34,
    lon: 82.97,
    type: "block_tehsil"
  },
  {
    name: "Sahjanwa Bazar",
    block: "Sahjanwa",
    district: "Gorakhpur",
    lat: 26.77,
    lon: 83.19,
    type: "rural_camp"
  },
  {
    name: "Pipraich Gram",
    block: "Pipraich",
    district: "Gorakhpur",
    lat: 26.83,
    lon: 83.52,
    type: "rural_camp"
  },
  {
    name: "Campierganj Gram",
    block: "Campierganj",
    district: "Gorakhpur",
    lat: 27.05,
    lon: 83.27,
    type: "rural_camp"
  },
  {
    name: "Bansgaon Gram",
    block: "Bansgaon",
    district: "Gorakhpur",
    lat: 26.55,
    lon: 83.35,
    type: "rural_camp"
  },
  {
    name: "Barhalganj Gram",
    block: "Barhalganj",
    district: "Gorakhpur",
    lat: 26.28,
    lon: 83.5,
    type: "rural_camp"
  },
  {
    name: "Khajni Gram",
    block: "Khajni",
    district: "Gorakhpur",
    lat: 26.65,
    lon: 83.22,
    type: "rural_camp"
  },
  {
    name: "Gola Bazar",
    block: "Gola",
    district: "Gorakhpur",
    lat: 26.34,
    lon: 83.34,
    type: "rural_camp"
  },
  {
    name: "Chauri Chaura Gram",
    block: "Chauri Chaura",
    district: "Gorakhpur",
    lat: 26.64,
    lon: 83.6,
    type: "rural_camp"
  },
  {
    name: "Ayodhya Cantt",
    block: "Ayodhya Sadar",
    district: "Ayodhya",
    lat: 26.79,
    lon: 82.14,
    type: "block_tehsil"
  },
  {
    name: "Rudauli Bazar",
    block: "Rudauli",
    district: "Ayodhya",
    lat: 26.75,
    lon: 81.75,
    type: "block_tehsil"
  },
  {
    name: "Sohawal Gram",
    block: "Sohawal",
    district: "Ayodhya",
    lat: 26.77,
    lon: 81.98,
    type: "block_tehsil"
  },
  {
    name: "Milkipur Gram",
    block: "Milkipur",
    district: "Ayodhya",
    lat: 26.58,
    lon: 81.9,
    type: "block_tehsil"
  },
  {
    name: "Bikapur Gram",
    block: "Bikapur",
    district: "Ayodhya",
    lat: 26.6,
    lon: 82.13,
    type: "block_tehsil"
  },
  {
    name: "Mankapur Bazar",
    block: "Mankapur",
    district: "Gonda",
    lat: 27.03,
    lon: 82.23,
    type: "block_tehsil"
  },
  {
    name: "Nawabganj Gram",
    block: "Nawabganj",
    district: "Gonda",
    lat: 26.86,
    lon: 82.14,
    type: "rural_camp"
  },
  {
    name: "Colonelganj Bazar",
    block: "Colonelganj",
    district: "Gonda",
    lat: 27.1,
    lon: 81.7,
    type: "block_tehsil"
  },
  {
    name: "Barabanki Sadar",
    block: "Barabanki",
    district: "Barabanki",
    lat: 26.92,
    lon: 81.18,
    type: "urban_center"
  },
  {
    name: "Lucknow East Ring",
    block: "Chinhat",
    district: "Lucknow",
    lat: 26.88,
    lon: 81.02,
    type: "urban_center"
  },
  {
    name: "Varanasi Outer",
    block: "Shivpur",
    district: "Varanasi",
    lat: 25.35,
    lon: 82.95,
    type: "urban_center"
  },
  {
    name: "Basti Sadar",
    block: "Basti Sadar",
    district: "Basti",
    lat: 26.8,
    lon: 82.76,
    type: "block_tehsil"
  },
  {
    name: "Ramnagar Basti Gram",
    block: "Ramnagar",
    district: "Basti",
    lat: 26.98,
    lon: 82.71,
    type: "block_tehsil"
  },
  {
    name: "Saunghat Gram",
    block: "Saunghat",
    district: "Basti",
    lat: 26.83,
    lon: 82.79,
    type: "block_tehsil"
  },
  {
    name: "Santha Gram",
    block: "Santha",
    district: "Sant Kabir Nagar",
    lat: 27.04,
    lon: 83.1,
    type: "block_tehsil"
  },
  {
    name: "Mithwal Gram",
    block: "Mithwal",
    district: "Siddharthnagar",
    lat: 27.11,
    lon: 82.84,
    type: "block_tehsil"
  },
  {
    name: "Jogia Gram",
    block: "Jogia",
    district: "Siddharthnagar",
    lat: 27.24,
    lon: 82.99,
    type: "block_tehsil"
  },
  {
    name: "Lotan Gram",
    block: "Lotan",
    district: "Siddharthnagar",
    lat: 27.37,
    lon: 83.21,
    type: "block_tehsil"
  },
  {
    name: "Azamgarh Sadar",
    block: "Azamgarh Sadar",
    district: "Azamgarh",
    lat: 26.0688,
    lon: 83.1836,
    type: "block_tehsil"
  },
  {
    name: "Phoolpur Azamgarh",
    block: "Phoolpur",
    district: "Azamgarh",
    lat: 26.0469,
    lon: 82.8369,
    type: "block_tehsil"
  },
  {
    name: "Sagri Jiyanpur",
    block: "Sagri",
    district: "Azamgarh",
    lat: 26.15,
    lon: 83.32,
    type: "block_tehsil"
  },
  {
    name: "Lalganj Azamgarh",
    block: "Lalganj",
    district: "Azamgarh",
    lat: 25.93,
    lon: 83.01,
    type: "block_tehsil"
  },
  {
    name: "Nizamabad Bazar",
    block: "Nizamabad",
    district: "Azamgarh",
    lat: 26.05,
    lon: 83.06,
    type: "block_tehsil"
  },
  {
    name: "Mehnagar Gram",
    block: "Mehnagar",
    district: "Azamgarh",
    lat: 25.88,
    lon: 83.12,
    type: "block_tehsil"
  },
  {
    name: "Bilariyaganj Bazar",
    block: "Bilariyaganj",
    district: "Azamgarh",
    lat: 26.19,
    lon: 83.23,
    type: "block_tehsil"
  },
  {
    name: "Atraulia Bazar",
    block: "Atraulia",
    district: "Azamgarh",
    lat: 26.33,
    lon: 82.94,
    type: "block_tehsil"
  },
  {
    name: "Koilsa Gram",
    block: "Koilsa",
    district: "Azamgarh",
    lat: 26.25,
    lon: 83.02,
    type: "block_tehsil"
  },
  {
    name: "Maharajganj Azamgarh",
    block: "Maharajganj",
    district: "Azamgarh",
    lat: 26.26,
    lon: 83.12,
    type: "block_tehsil"
  },
  {
    name: "Tahbarpur Gram",
    block: "Tahbarpur",
    district: "Azamgarh",
    lat: 26.1,
    lon: 83.03,
    type: "block_tehsil"
  },
  {
    name: "Rani Ki Sarai",
    block: "Rani Ki Sarai",
    district: "Azamgarh",
    lat: 26,
    lon: 83.1,
    type: "block_tehsil"
  },
  {
    name: "Mirzapur Azamgarh",
    block: "Mirzapur",
    district: "Azamgarh",
    lat: 26.02,
    lon: 82.93,
    type: "block_tehsil"
  },
  {
    name: "Mohammadpur Azamgarh",
    block: "Mohammadpur",
    district: "Azamgarh",
    lat: 25.96,
    lon: 83.02,
    type: "block_tehsil"
  },
  {
    name: "Jahanaganj Bazar",
    block: "Jahanaganj",
    district: "Azamgarh",
    lat: 25.99,
    lon: 83.27,
    type: "block_tehsil"
  },
  {
    name: "Sathiaon Gram",
    block: "Sathiaon",
    district: "Azamgarh",
    lat: 26.07,
    lon: 83.31,
    type: "block_tehsil"
  },
  {
    name: "Thekma Gram",
    block: "Thekma",
    district: "Azamgarh",
    lat: 25.89,
    lon: 82.93,
    type: "block_tehsil"
  },
  {
    name: "Tarwa Gram",
    block: "Tarwa",
    district: "Azamgarh",
    lat: 25.82,
    lon: 83.17,
    type: "block_tehsil"
  },
  {
    name: "Palhana Gram",
    block: "Palhana",
    district: "Azamgarh",
    lat: 25.85,
    lon: 83.04,
    type: "block_tehsil"
  },
  {
    name: "Martinganj Gram",
    block: "Martinganj",
    district: "Azamgarh",
    lat: 25.87,
    lon: 82.85,
    type: "block_tehsil"
  },
  {
    name: "Haraiya Azamgarh",
    block: "Haraiya",
    district: "Azamgarh",
    lat: 26.14,
    lon: 83.2,
    type: "block_tehsil"
  },
  {
    name: "Ahiraula Bazar",
    block: "Ahiraula",
    district: "Azamgarh",
    lat: 26.16,
    lon: 82.9,
    type: "block_tehsil"
  },
  {
    name: "Gonda Sadar",
    block: "Gonda Sadar",
    district: "Gonda",
    lat: 27.13,
    lon: 81.96,
    type: "block_tehsil"
  },
  {
    name: "Tarabganj Bazar",
    block: "Tarabganj",
    district: "Gonda",
    lat: 26.91,
    lon: 82.04,
    type: "block_tehsil"
  },
  {
    name: "Nawabganj Gonda",
    block: "Nawabganj",
    district: "Gonda",
    lat: 26.86,
    lon: 82.14,
    type: "block_tehsil"
  },
  {
    name: "Wazirganj Gram",
    block: "Wazirganj",
    district: "Gonda",
    lat: 26.99,
    lon: 82.16,
    type: "block_tehsil"
  },
  {
    name: "Katra Bazar Gonda",
    block: "Katra Bazar",
    district: "Gonda",
    lat: 27.23,
    lon: 81.79,
    type: "block_tehsil"
  },
  {
    name: "Paraspur Gram",
    block: "Paraspur",
    district: "Gonda",
    lat: 27.02,
    lon: 81.82,
    type: "block_tehsil"
  },
  {
    name: "Belsar Gram",
    block: "Belsar",
    district: "Gonda",
    lat: 26.99,
    lon: 81.93,
    type: "block_tehsil"
  },
  {
    name: "Jhanjhari Gram",
    block: "Jhanjhari",
    district: "Gonda",
    lat: 27.15,
    lon: 81.98,
    type: "block_tehsil"
  },
  {
    name: "Pandri Kripal Gram",
    block: "Pandri Kripal",
    district: "Gonda",
    lat: 27.18,
    lon: 82.02,
    type: "block_tehsil"
  },
  {
    name: "Mujehana Gram",
    block: "Mujehana",
    district: "Gonda",
    lat: 27.13,
    lon: 82.18,
    type: "block_tehsil"
  },
  {
    name: "Itiathok Bazar",
    block: "Itiathok",
    district: "Gonda",
    lat: 27.28,
    lon: 82.06,
    type: "block_tehsil"
  },
  {
    name: "Rupaidih Gram",
    block: "Rupaidih",
    district: "Gonda",
    lat: 27.29,
    lon: 81.92,
    type: "block_tehsil"
  },
  {
    name: "Haldharmau Gram",
    block: "Haldharmau",
    district: "Gonda",
    lat: 27.17,
    lon: 81.78,
    type: "block_tehsil"
  },
  {
    name: "Balrampur Sadar",
    block: "Balrampur Sadar",
    district: "Balrampur",
    lat: 27.43,
    lon: 82.18,
    type: "block_tehsil"
  },
  {
    name: "Tulsipur Bazar",
    block: "Tulsipur",
    district: "Balrampur",
    lat: 27.55,
    lon: 82.42,
    type: "block_tehsil"
  },
  {
    name: "Utraula Bazar",
    block: "Utraula",
    district: "Balrampur",
    lat: 27.31,
    lon: 82.41,
    type: "block_tehsil"
  },
  {
    name: "Pachperwa Bazar",
    block: "Pachperwa",
    district: "Balrampur",
    lat: 27.52,
    lon: 82.65,
    type: "block_tehsil"
  },
  {
    name: "Gainsari Bazar",
    block: "Gainsari",
    district: "Balrampur",
    lat: 27.53,
    lon: 82.52,
    type: "block_tehsil"
  },
  {
    name: "Harraiya Satgharwa",
    block: "Harraiya Satgharwa",
    district: "Balrampur",
    lat: 27.58,
    lon: 82.15,
    type: "block_tehsil"
  },
  {
    name: "Rehra Bazar",
    block: "Rehra Bazar",
    district: "Balrampur",
    lat: 27.17,
    lon: 82.35,
    type: "block_tehsil"
  },
  {
    name: "Shriduttganj Gram",
    block: "Shriduttganj",
    district: "Balrampur",
    lat: 27.24,
    lon: 82.37,
    type: "block_tehsil"
  },
  {
    name: "Shivpura Gram",
    block: "Shivpura",
    district: "Balrampur",
    lat: 27.48,
    lon: 82.28,
    type: "block_tehsil"
  },
  {
    name: "Bhinga Sadar",
    block: "Bhinga",
    district: "Shravasti",
    lat: 27.71,
    lon: 81.93,
    type: "block_tehsil"
  },
  {
    name: "Ikauna Bazar",
    block: "Ikauna",
    district: "Shravasti",
    lat: 27.54,
    lon: 81.96,
    type: "block_tehsil"
  },
  {
    name: "Gilaula Gram",
    block: "Gilaula",
    district: "Shravasti",
    lat: 27.47,
    lon: 81.87,
    type: "block_tehsil"
  },
  {
    name: "Hariharpur Rani Gram",
    block: "Hariharpur Rani",
    district: "Shravasti",
    lat: 27.67,
    lon: 81.87,
    type: "block_tehsil"
  },
  {
    name: "Jamunaha Gram",
    block: "Jamunaha",
    district: "Shravasti",
    lat: 27.75,
    lon: 81.73,
    type: "block_tehsil"
  },
  {
    name: "Bahraich Sadar",
    block: "Bahraich Sadar",
    district: "Bahraich",
    lat: 27.57,
    lon: 81.6,
    type: "block_tehsil"
  },
  {
    name: "Nanpara Bazar",
    block: "Nanpara",
    district: "Bahraich",
    lat: 27.86,
    lon: 81.5,
    type: "block_tehsil"
  },
  {
    name: "Mahsi Gram",
    block: "Mahsi",
    district: "Bahraich",
    lat: 27.55,
    lon: 81.38,
    type: "block_tehsil"
  },
  {
    name: "Kaiserganj Bazar",
    block: "Kaiserganj",
    district: "Bahraich",
    lat: 27.25,
    lon: 81.55,
    type: "block_tehsil"
  },
  {
    name: "Payagpur Bazar",
    block: "Payagpur",
    district: "Bahraich",
    lat: 27.4,
    lon: 81.8,
    type: "block_tehsil"
  },
  {
    name: "Risia Bazar",
    block: "Risia",
    district: "Bahraich",
    lat: 27.72,
    lon: 81.58,
    type: "block_tehsil"
  },
  {
    name: "Shivpur Bahraich",
    block: "Shivpur",
    district: "Bahraich",
    lat: 27.81,
    lon: 81.42,
    type: "block_tehsil"
  },
  {
    name: "Mihinpurwa Bazar",
    block: "Mihinpurwa",
    district: "Bahraich",
    lat: 28.03,
    lon: 81.25,
    type: "block_tehsil"
  },
  {
    name: "Chittaura Gram",
    block: "Chittaura",
    district: "Bahraich",
    lat: 27.51,
    lon: 81.65,
    type: "block_tehsil"
  },
  {
    name: "Visheshwarganj Gram",
    block: "Visheshwarganj",
    district: "Bahraich",
    lat: 27.41,
    lon: 81.72,
    type: "block_tehsil"
  },
  {
    name: "Huzoorpur Gram",
    block: "Huzoorpur",
    district: "Bahraich",
    lat: 27.35,
    lon: 81.67,
    type: "block_tehsil"
  },
  {
    name: "Jarwal Road Bazar",
    block: "Jarwal",
    district: "Bahraich",
    lat: 27.16,
    lon: 81.55,
    type: "block_tehsil"
  },
  {
    name: "Tejwapur Gram",
    block: "Tejwapur",
    district: "Bahraich",
    lat: 27.45,
    lon: 81.48,
    type: "block_tehsil"
  },
  {
    name: "Fakharpur Gram",
    block: "Fakharpur",
    district: "Bahraich",
    lat: 27.35,
    lon: 81.51,
    type: "block_tehsil"
  },
  {
    name: "Bhiyaon Gram",
    block: "Bhiyaon",
    district: "Ambedkar Nagar",
    lat: 26.24,
    lon: 82.71,
    type: "block_tehsil"
  },
  {
    name: "Mawai Gram",
    block: "Mawai",
    district: "Ayodhya",
    lat: 26.73,
    lon: 81.6,
    type: "block_tehsil"
  },
  {
    name: "Amaniganj Gram",
    block: "Amaniganj",
    district: "Ayodhya",
    lat: 26.63,
    lon: 81.78,
    type: "block_tehsil"
  },
  {
    name: "Harringtonganj Gram",
    block: "Harringtonganj",
    district: "Ayodhya",
    lat: 26.58,
    lon: 82.02,
    type: "block_tehsil"
  },
  {
    name: "Tarun Gram",
    block: "Tarun",
    district: "Ayodhya",
    lat: 26.54,
    lon: 82.2,
    type: "block_tehsil"
  },
  {
    name: "Pura Bazar Gram",
    block: "Pura Bazar",
    district: "Ayodhya",
    lat: 26.73,
    lon: 82.28,
    type: "block_tehsil"
  },
  {
    name: "Masodha Gram",
    block: "Masodha",
    district: "Ayodhya",
    lat: 26.72,
    lon: 82.13,
    type: "block_tehsil"
  },
  {
    name: "Sultanpur Sadar",
    block: "Sultanpur Sadar",
    district: "Sultanpur",
    lat: 26.26,
    lon: 82.07,
    type: "block_tehsil"
  },
  {
    name: "Kadipur Bazar",
    block: "Kadipur",
    district: "Sultanpur",
    lat: 26.17,
    lon: 82.38,
    type: "block_tehsil"
  },
  {
    name: "Jaisinghpur Gram",
    block: "Jaisinghpur",
    district: "Sultanpur",
    lat: 26.23,
    lon: 82.27,
    type: "block_tehsil"
  },
  {
    name: "Lambhua Bazar",
    block: "Lambhua",
    district: "Sultanpur",
    lat: 26.13,
    lon: 82.27,
    type: "block_tehsil"
  },
  {
    name: "Kurebhar Gram",
    block: "Kurebhar",
    district: "Sultanpur",
    lat: 26.43,
    lon: 82.13,
    type: "block_tehsil"
  },
  {
    name: "Dostpur Bazar",
    block: "Dostpur",
    district: "Sultanpur",
    lat: 26.28,
    lon: 82.47,
    type: "block_tehsil"
  },
  {
    name: "Akhand Nagar Gram",
    block: "Akhand Nagar",
    district: "Sultanpur",
    lat: 26.15,
    lon: 82.52,
    type: "block_tehsil"
  },
  {
    name: "Motigarpur Gram",
    block: "Motigarpur",
    district: "Sultanpur",
    lat: 26.28,
    lon: 82.35,
    type: "block_tehsil"
  },
  {
    name: "Dubeypur Gram",
    block: "Dubeypur",
    district: "Sultanpur",
    lat: 26.29,
    lon: 82.03,
    type: "block_tehsil"
  },
  {
    name: "Kurwar Gram",
    block: "Kurwar",
    district: "Sultanpur",
    lat: 26.34,
    lon: 81.98,
    type: "block_tehsil"
  },
  {
    name: "Dhanpatganj Gram",
    block: "Dhanpatganj",
    district: "Sultanpur",
    lat: 26.43,
    lon: 81.98,
    type: "block_tehsil"
  },
  {
    name: "Bhadaiya Gram",
    block: "Bhadaiya",
    district: "Sultanpur",
    lat: 26.16,
    lon: 82.13,
    type: "block_tehsil"
  },
  {
    name: "Baldirai Gram",
    block: "Baldirai",
    district: "Sultanpur",
    lat: 26.44,
    lon: 81.87,
    type: "block_tehsil"
  },
  {
    name: "Pratapganj Sultanpur",
    block: "Pratapganj",
    district: "Sultanpur",
    lat: 26.22,
    lon: 82.18,
    type: "block_tehsil"
  },
  {
    name: "Gauriganj Sadar",
    block: "Gauriganj",
    district: "Amethi",
    lat: 26.21,
    lon: 81.69,
    type: "block_tehsil"
  },
  {
    name: "Tiloi Bazar",
    block: "Tiloi",
    district: "Amethi",
    lat: 26.39,
    lon: 81.51,
    type: "block_tehsil"
  },
  {
    name: "Jagdishpur Bazar",
    block: "Jagdishpur",
    district: "Amethi",
    lat: 26.47,
    lon: 81.62,
    type: "block_tehsil"
  },
  {
    name: "Salon Bazar",
    block: "Salon",
    district: "Amethi",
    lat: 26.03,
    lon: 81.45,
    type: "block_tehsil"
  },
  {
    name: "Amethi Sadar",
    block: "Amethi",
    district: "Amethi",
    lat: 26.15,
    lon: 81.81,
    type: "block_tehsil"
  },
  {
    name: "Musafirkhana Bazar",
    block: "Musafirkhana",
    district: "Amethi",
    lat: 26.37,
    lon: 81.8,
    type: "block_tehsil"
  },
  {
    name: "Bhetua Gram",
    block: "Bhetua",
    district: "Amethi",
    lat: 26.25,
    lon: 81.8,
    type: "block_tehsil"
  },
  {
    name: "Sangrampur Gram",
    block: "Sangrampur",
    district: "Amethi",
    lat: 26.07,
    lon: 81.87,
    type: "block_tehsil"
  },
  {
    name: "Shahgarh Gram",
    block: "Shahgarh",
    district: "Amethi",
    lat: 26.28,
    lon: 81.75,
    type: "block_tehsil"
  },
  {
    name: "Singhpur Gram",
    block: "Singhpur",
    district: "Amethi",
    lat: 26.44,
    lon: 81.42,
    type: "block_tehsil"
  },
  {
    name: "Bahadurpur Amethi",
    block: "Bahadurpur",
    district: "Amethi",
    lat: 26.32,
    lon: 81.48,
    type: "block_tehsil"
  },
  {
    name: "Jamo Bazar",
    block: "Jamo",
    district: "Amethi",
    lat: 26.35,
    lon: 81.64,
    type: "block_tehsil"
  },
  {
    name: "Shuklabazar Gram",
    block: "Shuklabazar",
    district: "Amethi",
    lat: 26.54,
    lon: 81.65,
    type: "block_tehsil"
  },
  {
    name: "Pratapgarh Sadar",
    block: "Pratapgarh Sadar",
    district: "Pratapgarh",
    lat: 25.92,
    lon: 81.99,
    type: "block_tehsil"
  },
  {
    name: "Kunda Bazar",
    block: "Kunda",
    district: "Pratapgarh",
    lat: 25.71,
    lon: 81.51,
    type: "block_tehsil"
  },
  {
    name: "Patti Bazar",
    block: "Patti",
    district: "Pratapgarh",
    lat: 25.92,
    lon: 82.19,
    type: "block_tehsil"
  },
  {
    name: "Raniganj Bazar",
    block: "Raniganj",
    district: "Pratapgarh",
    lat: 25.88,
    lon: 82.05,
    type: "block_tehsil"
  },
  {
    name: "Lalganj Ajhara",
    block: "Lalganj Ajhara",
    district: "Pratapgarh",
    lat: 25.99,
    lon: 81.7,
    type: "block_tehsil"
  },
  {
    name: "Babaganj Gram",
    block: "Babaganj",
    district: "Pratapgarh",
    lat: 25.68,
    lon: 81.42,
    type: "block_tehsil"
  },
  {
    name: "Bihar Gram",
    block: "Bihar",
    district: "Pratapgarh",
    lat: 25.61,
    lon: 81.58,
    type: "block_tehsil"
  },
  {
    name: "Kalakankar Gram",
    block: "Kalakankar",
    district: "Pratapgarh",
    lat: 25.78,
    lon: 81.37,
    type: "block_tehsil"
  },
  {
    name: "Rampur Sangramgarh",
    block: "Rampur Sangramgarh",
    district: "Pratapgarh",
    lat: 25.93,
    lon: 81.58,
    type: "block_tehsil"
  },
  {
    name: "Sangipur Gram",
    block: "Sangipur",
    district: "Pratapgarh",
    lat: 26.04,
    lon: 81.63,
    type: "block_tehsil"
  },
  {
    name: "Lakshmanpur Gram",
    block: "Lakshmanpur",
    district: "Pratapgarh",
    lat: 25.94,
    lon: 81.83,
    type: "block_tehsil"
  },
  {
    name: "Sandwa Chandrika Gram",
    block: "Sandwa Chandrika",
    district: "Pratapgarh",
    lat: 26.04,
    lon: 81.93,
    type: "block_tehsil"
  },
  {
    name: "Mandhata Gram",
    block: "Mandhata",
    district: "Pratapgarh",
    lat: 25.81,
    lon: 81.92,
    type: "block_tehsil"
  },
  {
    name: "Gaura Gram",
    block: "Gaura",
    district: "Pratapgarh",
    lat: 25.75,
    lon: 82.09,
    type: "block_tehsil"
  },
  {
    name: "Shivgarh Pratapgarh",
    block: "Shivgarh",
    district: "Pratapgarh",
    lat: 25.84,
    lon: 82.16,
    type: "block_tehsil"
  },
  {
    name: "Aspur Deosara Gram",
    block: "Aspur Deosara",
    district: "Pratapgarh",
    lat: 25.98,
    lon: 82.35,
    type: "block_tehsil"
  },
  {
    name: "Magraura Gram",
    block: "Magraura",
    district: "Pratapgarh",
    lat: 26.03,
    lon: 82.12,
    type: "block_tehsil"
  }
];

// src/utils/village.js
var KEY_VILLAGES = ruralVillages_default;
function resolveVillage(lat, lon) {
  let nearest = KEY_VILLAGES[0];
  let minD = calculateDistanceKm(lat, lon, nearest.lat, nearest.lon);
  for (let i = 1; i < KEY_VILLAGES.length; i++) {
    const d = calculateDistanceKm(lat, lon, KEY_VILLAGES[i].lat, KEY_VILLAGES[i].lon);
    if (d < minD) {
      minD = d;
      nearest = KEY_VILLAGES[i];
    }
  }
  const isCamp = minD <= 4;
  return {
    villageName: nearest.name,
    villageBlock: nearest.block,
    villageDistrict: nearest.district,
    villageBadge: isCamp ? `Camp: ${nearest.name}` : `Near ${nearest.name}`,
    villageLabel: isCamp ? `\u{1F4CD} Outreach Camp: ${nearest.name} (${nearest.district}) \u2022 ${minD} km` : `\u{1F4CD} Near ${nearest.name} \u2022 ${minD} km away`
  };
}

// src/utils/telemetryProcessor.js
function coerceTelemetryPacket(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const [id, lat, lon, speed, bearing, timestamp] = raw;
    return { id, lat, lon, speedKnots: speed, bearing, timestamp };
  }
  if (typeof raw === "string") {
    try {
      return coerceTelemetryPacket(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }
  if (typeof raw === "object") {
    return {
      id: raw.id || raw.uniqueId || raw.deviceId || raw.deviceid,
      driver: raw.driver || raw.driverName || "",
      lat: raw.lat ?? raw.latitude,
      lon: raw.lon ?? raw.lng ?? raw.longitude,
      speedKnots: raw.speed ?? raw.speedKnots ?? 0,
      bearing: raw.bearing ?? raw.heading ?? 0,
      altitude: raw.altitude ?? 0,
      accuracy: raw.accuracy ?? 0,
      batt: raw.batt ?? raw.battery ?? 100,
      charge: raw.charge === true || raw.charge === "true" || raw.charge === 1 || raw.charge === "1",
      timestamp: raw.timestamp ?? raw.time ?? Date.now()
    };
  }
  return null;
}
function processTelemetryPacket(packet, options = {}) {
  if (!packet) return null;
  const cleanId = String(packet.id || "").trim().toUpperCase();
  const rawLat = Number(packet.lat);
  const rawLon = Number(packet.lon);
  if (!cleanId || !Number.isFinite(rawLat) || !Number.isFinite(rawLon)) return null;
  if (rawLat < -90 || rawLat > 90 || rawLon < -180 || rawLon > 180) return null;
  const existing = options.existing || {};
  const filter = options.filter;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const timestamp = Number.isFinite(Number(packet.timestamp)) ? Number(packet.timestamp) : now;
  const fixedLat = Number(rawLat.toFixed(6));
  const fixedLon = Number(rawLon.toFixed(6));
  let filteredLat = fixedLat;
  let filteredLon = fixedLon;
  if (filter && typeof filter.update === "function") {
    const smoothed = filter.update(fixedLat, fixedLon, packet.accuracy, timestamp);
    if (Number.isFinite(smoothed.lat)) filteredLat = Number(smoothed.lat.toFixed(6));
    if (Number.isFinite(smoothed.lon)) filteredLon = Number(smoothed.lon.toFixed(6));
  }
  const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, filteredLat, filteredLon);
  const roadDistKm = Math.round(distKm * 1.15 * 10) / 10;
  const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
  const updatedTrail = [...prevTrail.slice(-29), [filteredLon, filteredLat]];
  const ruralLoc = resolveVillage(filteredLat, filteredLon);
  const colors = getUniqueVehicleColor(cleanId);
  const rawSpeed = Number(packet.speedKnots) || 0;
  const speedKmH = rawSpeed > 0 ? Math.min(130, Math.round(rawSpeed * 1.852)) : 0;
  let computedBearing = Math.round(((Number(packet.bearing) || 0) % 360 + 360) % 360);
  if (computedBearing === 0 && existing.lat && existing.lon && (existing.lat !== filteredLat || existing.lon !== filteredLon)) {
    computedBearing = calculateBearing(
      [existing.lon, existing.lat],
      [filteredLon, filteredLat]
    );
  } else if (computedBearing === 0 && existing.bearing) {
    computedBearing = existing.bearing;
  }
  const altitude = Number(packet.altitude) || 0;
  const accuracy = Number(packet.accuracy) || 0;
  const batt = Number(packet.batt);
  return {
    id: cleanId,
    name: cleanId,
    type: "ambulance",
    driverName: packet.driver ? String(packet.driver).trim() : existing.driverName || "",
    driverPhone: existing.driverPhone || "",
    plate: existing.plate || cleanId,
    status: speedKmH > 3 ? "moving" : distKm < 0.25 ? "at_base" : "in_field",
    lat: filteredLat,
    lon: filteredLon,
    speed: speedKmH,
    speedKnots: Number(rawSpeed.toFixed(2)),
    bearing: computedBearing,
    altitude: Math.round(altitude),
    accuracy: Number.isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
    batt: Math.min(100, Math.max(0, Math.round(batt))),
    battery: Math.min(100, Math.max(0, Math.round(batt))),
    charge: Boolean(packet.charge),
    distFromBaseKm: distKm,
    roadDistFromBaseKm: roadDistKm,
    villageName: ruralLoc.villageName,
    villageBlock: ruralLoc.villageBlock,
    villageDistrict: ruralLoc.villageDistrict,
    villageBadge: ruralLoc.villageBadge,
    villageLabel: ruralLoc.villageLabel,
    lineColor: existing.lineColor || colors.line,
    glowColor: existing.glowColor || colors.glow,
    trail: updatedTrail,
    lastSeen: timestamp,
    updatedAt: now,
    isLive: true
  };
}

// src/worker.js
var liveVehicles = /* @__PURE__ */ new Map();
var vehicleFilters = /* @__PURE__ */ new Map();
var HUB_NAME = "purvanchal-fleet";
var HUB_FORWARD_INTERVAL_MS = 3e4;
var VEHICLE_TTL_MS = 35 * 60 * 1e3;
var HUB_PRUNE_INTERVAL_MS = 60 * 1e3;
var lastHubForward = /* @__PURE__ */ new Map();
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b)))
  ]);
  const av = new Uint8Array(ha);
  const bv = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
var BASE_LAT2 = 26.797313;
var BASE_LON2 = 82.718401;
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".apk") || url.pathname.startsWith("/downloads/")) {
      return new Response("Not Found", { status: 404 });
    }
    if (url.pathname === "/api/ws" || url.pathname === "/api/ws/") {
      if (!env.FLEET_HUB) {
        return new Response(JSON.stringify({ error: "WebSocket hub not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const hub = env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME));
      return hub.fetch(request);
    }
    const hasTraccarParams = (url.searchParams.has("id") || url.searchParams.has("uniqueId") || url.searchParams.has("deviceId") || url.searchParams.has("deviceid")) && (url.searchParams.has("lat") || url.searchParams.has("latitude"));
    const isTelemetryPath = url.pathname === "/api/track" || url.pathname === "/api/track/" || url.pathname === "/api/location" || url.pathname === "/api/location/" || url.pathname === "/api/v1/telemetry" || url.pathname === "/api/v1/telemetry/" || url.pathname === "/location" || url.pathname === "/track" || url.pathname === "/telemetry";
    if (isTelemetryPath || hasTraccarParams || request.method === "POST" && url.pathname === "/") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "X-Powered-By": "Sant Kabir Fleet Shield (mrps.in)"
          }
        });
      }
      let id = url.searchParams.get("id") || url.searchParams.get("uniqueId") || url.searchParams.get("deviceid") || url.searchParams.get("deviceId");
      let driver = url.searchParams.get("driver") || url.searchParams.get("driverName") || "";
      let lat = parseFloat(url.searchParams.get("lat") || url.searchParams.get("latitude") || "");
      let lon = parseFloat(url.searchParams.get("lon") || url.searchParams.get("lng") || url.searchParams.get("longitude") || "");
      let rawSpeed = parseFloat(url.searchParams.get("speed") || "0");
      let bearing = parseFloat(url.searchParams.get("bearing") || url.searchParams.get("heading") || "0");
      let altitude = parseFloat(url.searchParams.get("altitude") || "0");
      let accuracy = parseFloat(url.searchParams.get("accuracy") || "0");
      let batt = parseFloat(url.searchParams.get("batt") || url.searchParams.get("battery") || "100");
      let chargeParam = url.searchParams.get("charge");
      let charge = chargeParam === "true" || chargeParam === "1";
      let timestamp = Date.now();
      const tsParam = url.searchParams.get("timestamp") || url.searchParams.get("time");
      if (tsParam) {
        const parsed = parseInt(tsParam, 10);
        if (!isNaN(parsed)) timestamp = parsed > 1e10 ? parsed : parsed * 1e3;
      }
      if (request.method === "POST" && (isNaN(lat) || isNaN(lon) || !id)) {
        try {
          const contentType2 = request.headers.get("content-type") || "";
          if (contentType2.includes("application/json")) {
            const body = await request.json();
            if (!id) id = body.id || body.uniqueId || body.deviceId;
            if (!driver) driver = body.driver || body.driverName || "";
            if (isNaN(lat)) lat = parseFloat(body.lat || body.latitude);
            if (isNaN(lon)) lon = parseFloat(body.lon || body.lng || body.longitude);
            if (body.speed !== void 0) rawSpeed = parseFloat(body.speed);
            if (body.bearing !== void 0) bearing = parseFloat(body.bearing || body.heading);
            if (body.altitude !== void 0) altitude = parseFloat(body.altitude);
            if (body.accuracy !== void 0) accuracy = parseFloat(body.accuracy);
            if (body.batt !== void 0 || body.battery !== void 0) batt = parseFloat(body.batt || body.battery);
            if (body.charge !== void 0) charge = Boolean(body.charge);
            if (body.timestamp) timestamp = new Date(body.timestamp).getTime() || Date.now();
          } else if (contentType2.includes("application/x-www-form-urlencoded") || contentType2.includes("multipart/form-data")) {
            const formData = await request.formData();
            if (!id) id = formData.get("id") || formData.get("uniqueId") || formData.get("deviceId");
            if (!driver) driver = formData.get("driver") || formData.get("driverName") || "";
            if (isNaN(lat)) lat = parseFloat(formData.get("lat") || formData.get("latitude"));
            if (isNaN(lon)) lon = parseFloat(formData.get("lon") || formData.get("lng") || formData.get("longitude"));
            if (formData.has("speed")) rawSpeed = parseFloat(formData.get("speed"));
            if (formData.has("bearing")) bearing = parseFloat(formData.get("bearing") || formData.get("heading"));
            if (formData.has("altitude")) altitude = parseFloat(formData.get("altitude"));
            if (formData.has("accuracy")) accuracy = parseFloat(formData.get("accuracy"));
            if (formData.has("batt")) batt = parseFloat(formData.get("batt") || formData.get("battery"));
            if (formData.has("charge")) charge = formData.get("charge") === "true" || formData.get("charge") === "1";
          }
        } catch (e) {
        }
      }
      if (!id || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        if (url.pathname === "/" && request.method === "GET") {
          return env.ASSETS.fetch(request);
        }
        return new Response(JSON.stringify({
          error: "Missing or invalid parameters. Required: id, lat (-90..90), lon (-180..180)"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const vehId = String(id).trim().toUpperCase();
      const existing = liveVehicles.get(vehId) || {};
      let filter = vehicleFilters.get(vehId);
      if (!filter) {
        filter = createKinematicFilter();
        vehicleFilters.set(vehId, filter);
      }
      const record = processTelemetryPacket({
        id: vehId,
        driver,
        lat,
        lon,
        speedKnots: rawSpeed,
        bearing,
        altitude,
        accuracy,
        batt,
        charge,
        timestamp
      }, { existing, filter });
      if (!record) {
        return new Response(JSON.stringify({ error: "Invalid telemetry" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      liveVehicles.set(vehId, record);
      if (env.FLEET_HUB) {
        const nowMs = Date.now();
        const lastForward = lastHubForward.get(vehId) || 0;
        if (nowMs - lastForward >= HUB_FORWARD_INTERVAL_MS) {
          lastHubForward.set(vehId, nowMs);
          const hubPush = env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME)).fetch("https://fleet-hub/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
          }).catch(() => null);
          if (ctx?.waitUntil) ctx.waitUntil(hubPush);
        }
      }
      return new Response(JSON.stringify({
        success: true,
        app: "Sant Kabir Fleet Shield",
        developer: "Mani Ratan Singh (mrps.in)",
        vehicle: record
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Powered-By": "Sant Kabir Fleet Shield (mrps.in)"
        }
      });
    }
    if (url.pathname === "/api/clear" || url.pathname === "/api/clear/") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key"
          }
        });
      }
      if (request.method !== "POST" && request.method !== "DELETE") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Allow": "POST, DELETE, OPTIONS",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (!env.ADMIN_SECRET_KEY) {
        return new Response(JSON.stringify({ error: "Admin endpoint not configured" }), {
          status: 503,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      const suppliedKey = request.headers.get("X-Admin-Key") || "";
      if (!await safeEqual(suppliedKey, env.ADMIN_SECRET_KEY)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      liveVehicles.clear();
      vehicleFilters.clear();
      lastHubForward.clear();
      if (env.FLEET_HUB) {
        const hubClear = env.FLEET_HUB.get(env.FLEET_HUB.idFromName(HUB_NAME)).fetch("https://fleet-hub/clear", { method: "DELETE" }).catch(() => null);
        if (ctx?.waitUntil) ctx.waitUntil(hubClear);
      }
      return new Response(JSON.stringify({
        success: true,
        message: "Live telemetry cache cleared",
        count: 0
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    if (url.pathname === "/api/vehicles" || url.pathname === "/api/vehicles/") {
      const now = Date.now();
      const DECOMMISSION_TIMEOUT_MS = 35 * 60 * 1e3;
      for (const [vKey, vVal] of liveVehicles.entries()) {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        if (now - lastSeen > DECOMMISSION_TIMEOUT_MS) {
          liveVehicles.delete(vKey);
          vehicleFilters.delete(vKey);
          lastHubForward.delete(vKey);
        }
      }
      const reportedList = Array.from(liveVehicles.values()).map((vVal) => {
        const lastSeen = vVal.updatedAt || vVal.lastSeen || 0;
        const ageSec = Math.max(0, Math.floor((now - lastSeen) / 1e3));
        const gapMinutes = Math.floor(ageSec / 60);
        const isLive = ageSec < 60;
        const isSignalGap = ageSec >= 60 && ageSec <= 15 * 60;
        const isParked = ageSec > 15 * 60;
        return {
          ...vVal,
          ageSec,
          gapMinutes,
          isLive,
          isSignalGap,
          isParked,
          networkState: isLive ? "live" : isSignalGap ? "gap" : "parked"
        };
      });
      const list = reportedList;
      return new Response(JSON.stringify({
        success: true,
        vehicles: list,
        count: list.length,
        timestamp: now,
        app: "Sant Kabir Fleet Shield",
        developer: "Mani Ratan Singh (mrps.in)"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          "Pragma": "no-cache",
          "Expires": "0",
          "CDN-Cache-Control": "no-store",
          "Cloudflare-CDN-Cache-Control": "no-store",
          "X-Powered-By": "Sant Kabir Fleet Shield (mrps.in)"
        }
      });
    }
    if (url.pathname === "/api/route" || url.pathname === "/api/route/") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
          }
        });
      }
      let fromLon = parseFloat(url.searchParams.get("fromLon") || "");
      let fromLat = parseFloat(url.searchParams.get("fromLat") || "");
      const fromParam = url.searchParams.get("from");
      if (fromParam && (isNaN(fromLon) || isNaN(fromLat))) {
        const parts = fromParam.split(",");
        if (parts.length === 2) {
          fromLon = parseFloat(parts[0]);
          fromLat = parseFloat(parts[1]);
        }
      }
      let toLon = parseFloat(url.searchParams.get("toLon") || "");
      let toLat = parseFloat(url.searchParams.get("toLat") || "");
      const toParam = url.searchParams.get("to");
      if (toParam && (isNaN(toLon) || isNaN(toLat))) {
        const parts = toParam.split(",");
        if (parts.length === 2) {
          toLon = parseFloat(parts[0]);
          toLat = parseFloat(parts[1]);
        }
      }
      if (isNaN(toLon) || isNaN(toLat)) {
        toLon = BASE_LON2;
        toLat = BASE_LAT2;
      }
      if (isNaN(fromLon) || isNaN(fromLat)) {
        return new Response(JSON.stringify({ error: "Missing coordinates" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4e3);
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "SantKabirFleetShield/1.0 (https://fleet.mrps.in)" }
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`OSRM status ${res.status}`);
        const data = await res.json();
        if (data.code === "Ok" && Array.isArray(data.routes) && data.routes.length > 0) {
          const primaryRoute = data.routes[0];
          return new Response(JSON.stringify({
            success: true,
            source: "osrm-driving",
            roadDistanceKm: Math.round(primaryRoute.distance / 1e3 * 10) / 10,
            roadDistanceMeters: Math.round(primaryRoute.distance),
            durationMin: Math.round(primaryRoute.duration / 60),
            coordinates: primaryRoute.geometry.coordinates,
            pointsCount: primaryRoute.geometry.coordinates.length
          }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=3600"
            }
          });
        }
        throw new Error("No route returned by OSRM");
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: err.name === "AbortError" ? "Route query timed out" : err.message,
          fallbackRequired: true
        }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("content-type") || "";
    const isHtml = contentType.includes("text/html") || url.pathname === "/" || url.pathname.endsWith(".html");
    if (isHtml) {
      const freshHeaders = new Headers(assetResponse.headers);
      freshHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      freshHeaders.set("Pragma", "no-cache");
      freshHeaders.set("Expires", "0");
      freshHeaders.set("Surrogate-Control", "no-store");
      freshHeaders.set("CDN-Cache-Control", "no-store");
      freshHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers: freshHeaders
      });
    }
    return assetResponse;
  }
};
var PurvanchalFleetHub = class {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.state = ctx;
    this.env = env;
    this.vehicles = /* @__PURE__ */ new Map();
    this.filters = /* @__PURE__ */ new Map();
    this.wsTrackerIds = /* @__PURE__ */ new Set();
    this.lastSnapshotAt = 0;
    if (typeof WebSocketRequestResponsePair !== "undefined") {
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get("fleet_snapshot");
      if (Array.isArray(saved)) {
        const cutoff = Date.now() - VEHICLE_TTL_MS;
        const fresh = saved.filter((v) => {
          if (!v || !v.id) return false;
          const lastSeen = Number(v.updatedAt || v.lastSeen || 0);
          return lastSeen > 0 && lastSeen >= cutoff;
        });
        this.vehicles = new Map(fresh.map((v) => [String(v.id), v]));
        if (fresh.length !== saved.length) {
          await this.state.storage.put("fleet_snapshot", fresh);
        }
      }
      await this.ensurePruneAlarm();
    });
  }
  async fetch(request) {
    const url = new URL(request.url);
    const jsonHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    };
    if (url.pathname.endsWith("/ws")) {
      const upgrade = request.headers.get("Upgrade");
      if (!upgrade || upgrade.toLowerCase() !== "websocket") {
        return new Response(JSON.stringify({ error: "Expected WebSocket upgrade" }), {
          status: 426,
          headers: jsonHeaders
        });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      const role = url.searchParams.get("role") === "tracker" ? "tracker" : "dashboard";
      this.ctx.acceptWebSocket(server);
      try {
        server.serializeAttachment({ role });
      } catch (e) {
      }
      try {
        if (role === "dashboard") {
          await this.pruneStaleVehicles({ broadcast: false });
          server.send(JSON.stringify({
            type: "snapshot",
            vehicles: Array.from(this.vehicles.values()),
            timestamp: Date.now()
          }));
        } else {
          server.send(JSON.stringify({ type: "ready", role: "tracker", timestamp: Date.now() }));
        }
      } catch (e) {
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith("/track") && request.method === "POST") {
      try {
        const record = await request.json();
        if (record && record.id && !this.wsTrackerIds.has(String(record.id))) {
          this.vehicles.set(String(record.id), record);
          this.broadcast({ type: "delta", vehicle: record });
          this.persistSnapshotIfDue();
        }
      } catch (e) {
      }
      return new Response(JSON.stringify({ success: true, count: this.vehicles.size }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    if (url.pathname.endsWith("/vehicles")) {
      await this.pruneStaleVehicles({ broadcast: false });
      return new Response(JSON.stringify({
        success: true,
        vehicles: Array.from(this.vehicles.values()),
        count: this.vehicles.size,
        timestamp: Date.now()
      }), { status: 200, headers: jsonHeaders });
    }
    if (url.pathname.endsWith("/clear") && (request.method === "DELETE" || request.method === "POST")) {
      this.vehicles.clear();
      this.filters.clear();
      this.wsTrackerIds.clear();
      this.broadcast({ type: "clear", timestamp: Date.now() });
      if (this.state.waitUntil) {
        this.state.waitUntil(this.state.storage.put("fleet_snapshot", []));
      }
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        status: 200,
        headers: jsonHeaders
      });
    }
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: jsonHeaders
    });
  }
  webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === "tracker") {
      let raw = message;
      if (typeof raw !== "string") {
        try {
          raw = new TextDecoder().decode(raw);
        } catch (e) {
          raw = "";
        }
      }
      const packet = coerceTelemetryPacket(raw);
      if (!packet) return;
      const id = String(packet.id || "").trim().toUpperCase();
      if (!id) return;
      const existing = this.vehicles.get(id) || {};
      let filter = this.filters.get(id);
      if (!filter) {
        filter = createKinematicFilter();
        this.filters.set(id, filter);
      }
      const record = processTelemetryPacket(packet, { existing, filter, now: Date.now() });
      if (!record) return;
      this.vehicles.set(record.id, record);
      this.wsTrackerIds.add(record.id);
      try {
        ws.serializeAttachment({ role: "tracker", id: record.id });
      } catch (e) {
      }
      this.broadcast({ type: "delta", vehicle: record });
      this.persistSnapshotIfDue();
      try {
        ws.send(JSON.stringify({ type: "ack", id: record.id, timestamp: Date.now() }));
      } catch (e) {
      }
      return;
    }
    try {
      const data = JSON.parse(message);
      if (data?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (data?.type === "subscribe") {
        ws.send(JSON.stringify({
          type: "snapshot",
          vehicles: Array.from(this.vehicles.values()),
          timestamp: Date.now()
        }));
      } else if (data?.type === "track" && data.vehicle?.id) {
        this.vehicles.set(String(data.vehicle.id), data.vehicle);
        this.broadcast({ type: "delta", vehicle: data.vehicle });
        this.persistSnapshotIfDue();
      }
    } catch (e) {
      if (message === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      }
    }
  }
  webSocketClose(ws, code, reason, wasClean) {
    const attachment = ws.deserializeAttachment?.() || {};
    if (attachment.role === "tracker" && attachment.id) {
      this.wsTrackerIds.delete(String(attachment.id));
    }
    try {
      ws.close(code, "Hub closing connection");
    } catch (e) {
    }
  }
  webSocketError(ws, error) {
    try {
      ws.close(1011, "Hub socket error");
    } catch (e) {
    }
  }
  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const ws of this.state.getWebSockets()) {
      const role = ws.deserializeAttachment?.()?.role;
      if (role === "tracker") continue;
      try {
        ws.send(payload);
      } catch (e) {
      }
    }
  }
  async ensurePruneAlarm() {
    const alarm = await this.state.storage.getAlarm();
    if (alarm === null) {
      await this.state.storage.setAlarm(Date.now() + HUB_PRUNE_INTERVAL_MS);
    }
  }
  async pruneStaleVehicles({ persist = true, broadcast = true } = {}) {
    const now = Date.now();
    const removed = [];
    for (const [id, v] of this.vehicles) {
      const lastSeen = Number(v.updatedAt || v.lastSeen || 0);
      if (!lastSeen || now - lastSeen > VEHICLE_TTL_MS) {
        this.vehicles.delete(id);
        this.filters.delete(id);
        this.wsTrackerIds.delete(id);
        removed.push(id);
      }
    }
    if (removed.length) {
      if (persist) {
        await this.state.storage.put("fleet_snapshot", Array.from(this.vehicles.values()));
      }
      if (broadcast) {
        this.broadcast({ type: "remove", ids: removed, timestamp: now });
      }
    }
    return removed;
  }
  async alarm() {
    try {
      await this.pruneStaleVehicles();
    } finally {
      await this.state.storage.setAlarm(Date.now() + HUB_PRUNE_INTERVAL_MS);
    }
  }
  persistSnapshotIfDue() {
    const now = Date.now();
    if (now - this.lastSnapshotAt < 6e4) return;
    this.lastSnapshotAt = now;
    const snapshot = Array.from(this.vehicles.values());
    if (this.state.waitUntil) {
      this.state.waitUntil(this.state.storage.put("fleet_snapshot", snapshot));
    } else {
      this.state.storage.put("fleet_snapshot", snapshot).catch(() => {
      });
    }
  }
};
export {
  PurvanchalFleetHub,
  worker_default as default
};
