// src/worker.js
var liveVehicles = /* @__PURE__ */ new Map();
var BASE_LAT = 26.779703;
var BASE_LON = 83.072184;
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}
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
function getVehicleColors(id = "") {
  const cleanId = String(id).trim().toUpperCase();
  const match = cleanId.match(/AMB-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= PRIMARY_PALETTE.length) {
      return PRIMARY_PALETTE[num - 1];
    }
  }
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) hash = hash * 31 + cleanId.charCodeAt(i) & 4294967295;
  const seed = Math.abs(hash);
  let hue = Math.floor(seed * GOLDEN_RATIO_CONJUGATE % 1 * 360);
  return {
    line: hslToHex(hue, 88, 50),
    glow: hslToHex(hue, 92, 68)
  };
}
var KEY_VILLAGES = [
  {
    "name": "Maghar Gram",
    "block": "Khalilabad",
    "district": "Sant Kabir Nagar",
    "lat": 26.7583,
    "lon": 83.1311
  },
  {
    "name": "Khalilabad Sadar",
    "block": "Khalilabad",
    "district": "Sant Kabir Nagar",
    "lat": 26.7797,
    "lon": 83.0722
  },
  {
    "name": "Semariyawan Gram",
    "block": "Semariyawan",
    "district": "Sant Kabir Nagar",
    "lat": 26.8856,
    "lon": 82.9847
  },
  {
    "name": "Belhar Kala Gram",
    "block": "Belhar Kala",
    "district": "Sant Kabir Nagar",
    "lat": 26.965,
    "lon": 83.052
  },
  {
    "name": "Baghnagar Gram",
    "block": "Semariyawan",
    "district": "Sant Kabir Nagar",
    "lat": 26.862,
    "lon": 82.934
  },
  {
    "name": "Mehdawal Bazar",
    "block": "Mehdawal",
    "district": "Sant Kabir Nagar",
    "lat": 26.98,
    "lon": 83.12
  },
  {
    "name": "Bakhira Gram",
    "block": "Bakhira",
    "district": "Sant Kabir Nagar",
    "lat": 26.92,
    "lon": 83.1
  },
  {
    "name": "Dhanghata Bazar",
    "block": "Dhanghata",
    "district": "Sant Kabir Nagar",
    "lat": 26.58,
    "lon": 83.02
  },
  {
    "name": "Hainsar Bazar",
    "block": "Hainsar",
    "district": "Sant Kabir Nagar",
    "lat": 26.54,
    "lon": 83.07
  },
  {
    "name": "Nathnagar Gram",
    "block": "Nathnagar",
    "district": "Sant Kabir Nagar",
    "lat": 26.65,
    "lon": 83.05
  },
  {
    "name": "Chureb Gram",
    "block": "Khalilabad",
    "district": "Sant Kabir Nagar",
    "lat": 26.81,
    "lon": 83.01
  },
  {
    "name": "Nandaur Gram",
    "block": "Mehdawal",
    "district": "Sant Kabir Nagar",
    "lat": 27.02,
    "lon": 83.07
  },
  {
    "name": "Pauli Gram",
    "block": "Pauli",
    "district": "Sant Kabir Nagar",
    "lat": 26.52,
    "lon": 82.96
  },
  {
    "name": "Umari Gram",
    "block": "Dhanghata",
    "district": "Sant Kabir Nagar",
    "lat": 26.62,
    "lon": 82.98
  },
  {
    "name": "Dharamsinghwa Gram",
    "block": "Belhar Kala",
    "district": "Sant Kabir Nagar",
    "lat": 27.01,
    "lon": 83.15
  },
  {
    "name": "Loharesen Gram",
    "block": "Semariyawan",
    "district": "Sant Kabir Nagar",
    "lat": 26.84,
    "lon": 82.96
  },
  {
    "name": "Karma Kala Gram",
    "block": "Khalilabad",
    "district": "Sant Kabir Nagar",
    "lat": 26.73,
    "lon": 83.09
  },
  {
    "name": "Munderwa Gram",
    "block": "Basti Sadar",
    "district": "Basti",
    "lat": 26.79,
    "lon": 82.88
  },
  {
    "name": "Harraiya Gram",
    "block": "Harraiya",
    "district": "Basti",
    "lat": 26.7972,
    "lon": 82.4636
  },
  {
    "name": "Rudhauli Bazar",
    "block": "Rudhauli",
    "district": "Basti",
    "lat": 27,
    "lon": 82.78
  },
  {
    "name": "Walterganj Gram",
    "block": "Saltaua",
    "district": "Basti",
    "lat": 26.9,
    "lon": 82.72
  },
  {
    "name": "Captainganj Gram",
    "block": "Captainganj",
    "district": "Basti",
    "lat": 26.78,
    "lon": 82.6
  },
  {
    "name": "Parasrampur Gram",
    "block": "Parasrampur",
    "district": "Basti",
    "lat": 26.85,
    "lon": 82.35
  },
  {
    "name": "Gaur Bazar",
    "block": "Gaur",
    "district": "Basti",
    "lat": 26.93,
    "lon": 82.52
  },
  {
    "name": "Chhapia Gram",
    "block": "Gaur",
    "district": "Gonda",
    "lat": 26.97,
    "lon": 82.39
  },
  {
    "name": "Mahadewa Gram",
    "block": "Kudaraha",
    "district": "Basti",
    "lat": 26.68,
    "lon": 82.74
  },
  {
    "name": "Bankati Gram",
    "block": "Bankati",
    "district": "Basti",
    "lat": 26.67,
    "lon": 82.85
  },
  {
    "name": "Saltaua Gopalpur Gram",
    "block": "Saltaua",
    "district": "Basti",
    "lat": 26.95,
    "lon": 82.68
  },
  {
    "name": "Kudaraha Gram",
    "block": "Kudaraha",
    "district": "Basti",
    "lat": 26.64,
    "lon": 82.79
  },
  {
    "name": "Vikramjot Gram",
    "block": "Vikramjot",
    "district": "Basti",
    "lat": 26.78,
    "lon": 82.3
  },
  {
    "name": "Dubaulia Bazar",
    "block": "Dubaulia",
    "district": "Basti",
    "lat": 26.69,
    "lon": 82.52
  },
  {
    "name": "Kalwari Bazar",
    "block": "Basti Sadar",
    "district": "Basti",
    "lat": 26.66,
    "lon": 82.7
  },
  {
    "name": "Tinich Gram",
    "block": "Gaur",
    "district": "Basti",
    "lat": 26.87,
    "lon": 82.62
  },
  {
    "name": "Bhabhnan Bazar",
    "block": "Gaur",
    "district": "Basti",
    "lat": 26.94,
    "lon": 82.47
  },
  {
    "name": "Nagar Bazar",
    "block": "Basti Sadar",
    "district": "Basti",
    "lat": 26.73,
    "lon": 82.78
  },
  {
    "name": "Bansi Nagar",
    "block": "Bansi",
    "district": "Siddharthnagar",
    "lat": 27.17,
    "lon": 82.93
  },
  {
    "name": "Domariyaganj Bazar",
    "block": "Domariyaganj",
    "district": "Siddharthnagar",
    "lat": 27.2,
    "lon": 82.68
  },
  {
    "name": "Itwa Gram",
    "block": "Itwa",
    "district": "Siddharthnagar",
    "lat": 27.32,
    "lon": 82.75
  },
  {
    "name": "Shohratgarh Bazar",
    "block": "Shohratgarh",
    "district": "Siddharthnagar",
    "lat": 27.38,
    "lon": 82.98
  },
  {
    "name": "Khesraha Gram",
    "block": "Khesraha",
    "district": "Siddharthnagar",
    "lat": 27.08,
    "lon": 82.97
  },
  {
    "name": "Barhni Bazar",
    "block": "Barhni",
    "district": "Siddharthnagar",
    "lat": 27.5,
    "lon": 82.78
  },
  {
    "name": "Naugarh Sadar",
    "block": "Naugarh",
    "district": "Siddharthnagar",
    "lat": 27.29,
    "lon": 83.08
  },
  {
    "name": "Uska Bazar",
    "block": "Uska Bazar",
    "district": "Siddharthnagar",
    "lat": 27.22,
    "lon": 83.13
  },
  {
    "name": "Birdpur Gram",
    "block": "Birdpur",
    "district": "Siddharthnagar",
    "lat": 27.36,
    "lon": 83.11
  },
  {
    "name": "Biskohar Gram",
    "block": "Itwa",
    "district": "Siddharthnagar",
    "lat": 27.37,
    "lon": 82.61
  },
  {
    "name": "Bhanpur Gram",
    "block": "Bhanpur",
    "district": "Basti",
    "lat": 26.97,
    "lon": 82.63
  },
  {
    "name": "Golhaura Gram",
    "block": "Golhaura",
    "district": "Siddharthnagar",
    "lat": 27.18,
    "lon": 83.02
  },
  {
    "name": "Tanda Nagar",
    "block": "Tanda",
    "district": "Ambedkar Nagar",
    "lat": 26.55,
    "lon": 82.66
  },
  {
    "name": "Akbarpur Sadar",
    "block": "Akbarpur",
    "district": "Ambedkar Nagar",
    "lat": 26.43,
    "lon": 82.54
  },
  {
    "name": "Jalalpur Bazar",
    "block": "Jalalpur",
    "district": "Ambedkar Nagar",
    "lat": 26.31,
    "lon": 82.74
  },
  {
    "name": "Baskhari Gram",
    "block": "Baskhari",
    "district": "Ambedkar Nagar",
    "lat": 26.47,
    "lon": 82.78
  },
  {
    "name": "Alapur Gram",
    "block": "Alapur",
    "district": "Ambedkar Nagar",
    "lat": 26.35,
    "lon": 82.88
  },
  {
    "name": "Katehari Gram",
    "block": "Katehari",
    "district": "Ambedkar Nagar",
    "lat": 26.48,
    "lon": 82.38
  },
  {
    "name": "Bhiti Gram",
    "block": "Bhiti",
    "district": "Ambedkar Nagar",
    "lat": 26.51,
    "lon": 82.26
  },
  {
    "name": "Jahangir Ganj Gram",
    "block": "Jahangir Ganj",
    "district": "Ambedkar Nagar",
    "lat": 26.34,
    "lon": 82.97
  },
  {
    "name": "Sahjanwa Bazar",
    "block": "Sahjanwa",
    "district": "Gorakhpur",
    "lat": 26.77,
    "lon": 83.19
  },
  {
    "name": "Pipraich Gram",
    "block": "Pipraich",
    "district": "Gorakhpur",
    "lat": 26.83,
    "lon": 83.52
  },
  {
    "name": "Campierganj Gram",
    "block": "Campierganj",
    "district": "Gorakhpur",
    "lat": 27.05,
    "lon": 83.27
  },
  {
    "name": "Bansgaon Gram",
    "block": "Bansgaon",
    "district": "Gorakhpur",
    "lat": 26.55,
    "lon": 83.35
  },
  {
    "name": "Barhalganj Gram",
    "block": "Barhalganj",
    "district": "Gorakhpur",
    "lat": 26.28,
    "lon": 83.5
  },
  {
    "name": "Khajni Gram",
    "block": "Khajni",
    "district": "Gorakhpur",
    "lat": 26.65,
    "lon": 83.22
  },
  {
    "name": "Gola Bazar",
    "block": "Gola",
    "district": "Gorakhpur",
    "lat": 26.34,
    "lon": 83.34
  },
  {
    "name": "Chauri Chaura Gram",
    "block": "Chauri Chaura",
    "district": "Gorakhpur",
    "lat": 26.64,
    "lon": 83.6
  },
  {
    "name": "Ayodhya Cantt",
    "block": "Ayodhya Sadar",
    "district": "Ayodhya",
    "lat": 26.79,
    "lon": 82.14
  },
  {
    "name": "Rudauli Bazar",
    "block": "Rudauli",
    "district": "Ayodhya",
    "lat": 26.75,
    "lon": 81.75
  },
  {
    "name": "Sohawal Gram",
    "block": "Sohawal",
    "district": "Ayodhya",
    "lat": 26.77,
    "lon": 81.98
  },
  {
    "name": "Milkipur Gram",
    "block": "Milkipur",
    "district": "Ayodhya",
    "lat": 26.58,
    "lon": 81.9
  },
  {
    "name": "Bikapur Gram",
    "block": "Bikapur",
    "district": "Ayodhya",
    "lat": 26.6,
    "lon": 82.13
  },
  {
    "name": "Mankapur Bazar",
    "block": "Mankapur",
    "district": "Gonda",
    "lat": 27.03,
    "lon": 82.23
  },
  {
    "name": "Nawabganj Gram",
    "block": "Nawabganj",
    "district": "Gonda",
    "lat": 26.86,
    "lon": 82.14
  },
  {
    "name": "Colonelganj Bazar",
    "block": "Colonelganj",
    "district": "Gonda",
    "lat": 27.1,
    "lon": 81.7
  },
  {
    "name": "Barabanki Sadar",
    "block": "Barabanki",
    "district": "Barabanki",
    "lat": 26.92,
    "lon": 81.18
  },
  {
    "name": "Lucknow East Ring",
    "block": "Chinhat",
    "district": "Lucknow",
    "lat": 26.88,
    "lon": 81.02
  },
  {
    "name": "Varanasi Outer",
    "block": "Shivpur",
    "district": "Varanasi",
    "lat": 25.35,
    "lon": 82.95
  },
  {
    "name": "Basti Sadar",
    "block": "Basti Sadar",
    "district": "Basti",
    "lat": 26.8,
    "lon": 82.76
  },
  {
    "name": "Ramnagar Basti Gram",
    "block": "Ramnagar",
    "district": "Basti",
    "lat": 26.98,
    "lon": 82.71
  },
  {
    "name": "Saunghat Gram",
    "block": "Saunghat",
    "district": "Basti",
    "lat": 26.83,
    "lon": 82.79
  },
  {
    "name": "Santha Gram",
    "block": "Santha",
    "district": "Sant Kabir Nagar",
    "lat": 27.04,
    "lon": 83.1
  },
  {
    "name": "Mithwal Gram",
    "block": "Mithwal",
    "district": "Siddharthnagar",
    "lat": 27.11,
    "lon": 82.84
  },
  {
    "name": "Jogia Gram",
    "block": "Jogia",
    "district": "Siddharthnagar",
    "lat": 27.24,
    "lon": 82.99
  },
  {
    "name": "Lotan Gram",
    "block": "Lotan",
    "district": "Siddharthnagar",
    "lat": 27.37,
    "lon": 83.21
  },
  {
    "name": "Azamgarh Sadar",
    "block": "Azamgarh Sadar",
    "district": "Azamgarh",
    "lat": 26.0688,
    "lon": 83.1836
  },
  {
    "name": "Phoolpur Azamgarh",
    "block": "Phoolpur",
    "district": "Azamgarh",
    "lat": 26.0469,
    "lon": 82.8369
  },
  {
    "name": "Sagri Jiyanpur",
    "block": "Sagri",
    "district": "Azamgarh",
    "lat": 26.15,
    "lon": 83.32
  },
  {
    "name": "Lalganj Azamgarh",
    "block": "Lalganj",
    "district": "Azamgarh",
    "lat": 25.93,
    "lon": 83.01
  },
  {
    "name": "Nizamabad Bazar",
    "block": "Nizamabad",
    "district": "Azamgarh",
    "lat": 26.05,
    "lon": 83.06
  },
  {
    "name": "Mehnagar Gram",
    "block": "Mehnagar",
    "district": "Azamgarh",
    "lat": 25.88,
    "lon": 83.12
  },
  {
    "name": "Bilariyaganj Bazar",
    "block": "Bilariyaganj",
    "district": "Azamgarh",
    "lat": 26.19,
    "lon": 83.23
  },
  {
    "name": "Atraulia Bazar",
    "block": "Atraulia",
    "district": "Azamgarh",
    "lat": 26.33,
    "lon": 82.94
  },
  {
    "name": "Koilsa Gram",
    "block": "Koilsa",
    "district": "Azamgarh",
    "lat": 26.25,
    "lon": 83.02
  },
  {
    "name": "Maharajganj Azamgarh",
    "block": "Maharajganj",
    "district": "Azamgarh",
    "lat": 26.26,
    "lon": 83.12
  },
  {
    "name": "Tahbarpur Gram",
    "block": "Tahbarpur",
    "district": "Azamgarh",
    "lat": 26.1,
    "lon": 83.03
  },
  {
    "name": "Rani Ki Sarai",
    "block": "Rani Ki Sarai",
    "district": "Azamgarh",
    "lat": 26,
    "lon": 83.1
  },
  {
    "name": "Mirzapur Azamgarh",
    "block": "Mirzapur",
    "district": "Azamgarh",
    "lat": 26.02,
    "lon": 82.93
  },
  {
    "name": "Mohammadpur Azamgarh",
    "block": "Mohammadpur",
    "district": "Azamgarh",
    "lat": 25.96,
    "lon": 83.02
  },
  {
    "name": "Jahanaganj Bazar",
    "block": "Jahanaganj",
    "district": "Azamgarh",
    "lat": 25.99,
    "lon": 83.27
  },
  {
    "name": "Sathiaon Gram",
    "block": "Sathiaon",
    "district": "Azamgarh",
    "lat": 26.07,
    "lon": 83.31
  },
  {
    "name": "Thekma Gram",
    "block": "Thekma",
    "district": "Azamgarh",
    "lat": 25.89,
    "lon": 82.93
  },
  {
    "name": "Tarwa Gram",
    "block": "Tarwa",
    "district": "Azamgarh",
    "lat": 25.82,
    "lon": 83.17
  },
  {
    "name": "Palhana Gram",
    "block": "Palhana",
    "district": "Azamgarh",
    "lat": 25.85,
    "lon": 83.04
  },
  {
    "name": "Martinganj Gram",
    "block": "Martinganj",
    "district": "Azamgarh",
    "lat": 25.87,
    "lon": 82.85
  },
  {
    "name": "Haraiya Azamgarh",
    "block": "Haraiya",
    "district": "Azamgarh",
    "lat": 26.14,
    "lon": 83.2
  },
  {
    "name": "Ahiraula Bazar",
    "block": "Ahiraula",
    "district": "Azamgarh",
    "lat": 26.16,
    "lon": 82.9
  },
  {
    "name": "Gonda Sadar",
    "block": "Gonda Sadar",
    "district": "Gonda",
    "lat": 27.13,
    "lon": 81.96
  },
  {
    "name": "Tarabganj Bazar",
    "block": "Tarabganj",
    "district": "Gonda",
    "lat": 26.91,
    "lon": 82.04
  },
  {
    "name": "Nawabganj Gonda",
    "block": "Nawabganj",
    "district": "Gonda",
    "lat": 26.86,
    "lon": 82.14
  },
  {
    "name": "Wazirganj Gram",
    "block": "Wazirganj",
    "district": "Gonda",
    "lat": 26.99,
    "lon": 82.16
  },
  {
    "name": "Katra Bazar Gonda",
    "block": "Katra Bazar",
    "district": "Gonda",
    "lat": 27.23,
    "lon": 81.79
  },
  {
    "name": "Paraspur Gram",
    "block": "Paraspur",
    "district": "Gonda",
    "lat": 27.02,
    "lon": 81.82
  },
  {
    "name": "Belsar Gram",
    "block": "Belsar",
    "district": "Gonda",
    "lat": 26.99,
    "lon": 81.93
  },
  {
    "name": "Jhanjhari Gram",
    "block": "Jhanjhari",
    "district": "Gonda",
    "lat": 27.15,
    "lon": 81.98
  },
  {
    "name": "Pandri Kripal Gram",
    "block": "Pandri Kripal",
    "district": "Gonda",
    "lat": 27.18,
    "lon": 82.02
  },
  {
    "name": "Mujehana Gram",
    "block": "Mujehana",
    "district": "Gonda",
    "lat": 27.13,
    "lon": 82.18
  },
  {
    "name": "Itiathok Bazar",
    "block": "Itiathok",
    "district": "Gonda",
    "lat": 27.28,
    "lon": 82.06
  },
  {
    "name": "Rupaidih Gram",
    "block": "Rupaidih",
    "district": "Gonda",
    "lat": 27.29,
    "lon": 81.92
  },
  {
    "name": "Haldharmau Gram",
    "block": "Haldharmau",
    "district": "Gonda",
    "lat": 27.17,
    "lon": 81.78
  },
  {
    "name": "Balrampur Sadar",
    "block": "Balrampur Sadar",
    "district": "Balrampur",
    "lat": 27.43,
    "lon": 82.18
  },
  {
    "name": "Tulsipur Bazar",
    "block": "Tulsipur",
    "district": "Balrampur",
    "lat": 27.55,
    "lon": 82.42
  },
  {
    "name": "Utraula Bazar",
    "block": "Utraula",
    "district": "Balrampur",
    "lat": 27.31,
    "lon": 82.41
  },
  {
    "name": "Pachperwa Bazar",
    "block": "Pachperwa",
    "district": "Balrampur",
    "lat": 27.52,
    "lon": 82.65
  },
  {
    "name": "Gainsari Bazar",
    "block": "Gainsari",
    "district": "Balrampur",
    "lat": 27.53,
    "lon": 82.52
  },
  {
    "name": "Harraiya Satgharwa",
    "block": "Harraiya Satgharwa",
    "district": "Balrampur",
    "lat": 27.58,
    "lon": 82.15
  },
  {
    "name": "Rehra Bazar",
    "block": "Rehra Bazar",
    "district": "Balrampur",
    "lat": 27.17,
    "lon": 82.35
  },
  {
    "name": "Shriduttganj Gram",
    "block": "Shriduttganj",
    "district": "Balrampur",
    "lat": 27.24,
    "lon": 82.37
  },
  {
    "name": "Shivpura Gram",
    "block": "Shivpura",
    "district": "Balrampur",
    "lat": 27.48,
    "lon": 82.28
  },
  {
    "name": "Bhinga Sadar",
    "block": "Bhinga",
    "district": "Shravasti",
    "lat": 27.71,
    "lon": 81.93
  },
  {
    "name": "Ikauna Bazar",
    "block": "Ikauna",
    "district": "Shravasti",
    "lat": 27.54,
    "lon": 81.96
  },
  {
    "name": "Gilaula Gram",
    "block": "Gilaula",
    "district": "Shravasti",
    "lat": 27.47,
    "lon": 81.87
  },
  {
    "name": "Hariharpur Rani Gram",
    "block": "Hariharpur Rani",
    "district": "Shravasti",
    "lat": 27.67,
    "lon": 81.87
  },
  {
    "name": "Jamunaha Gram",
    "block": "Jamunaha",
    "district": "Shravasti",
    "lat": 27.75,
    "lon": 81.73
  },
  {
    "name": "Bahraich Sadar",
    "block": "Bahraich Sadar",
    "district": "Bahraich",
    "lat": 27.57,
    "lon": 81.6
  },
  {
    "name": "Nanpara Bazar",
    "block": "Nanpara",
    "district": "Bahraich",
    "lat": 27.86,
    "lon": 81.5
  },
  {
    "name": "Mahsi Gram",
    "block": "Mahsi",
    "district": "Bahraich",
    "lat": 27.55,
    "lon": 81.38
  },
  {
    "name": "Kaiserganj Bazar",
    "block": "Kaiserganj",
    "district": "Bahraich",
    "lat": 27.25,
    "lon": 81.55
  },
  {
    "name": "Payagpur Bazar",
    "block": "Payagpur",
    "district": "Bahraich",
    "lat": 27.4,
    "lon": 81.8
  },
  {
    "name": "Risia Bazar",
    "block": "Risia",
    "district": "Bahraich",
    "lat": 27.72,
    "lon": 81.58
  },
  {
    "name": "Shivpur Bahraich",
    "block": "Shivpur",
    "district": "Bahraich",
    "lat": 27.81,
    "lon": 81.42
  },
  {
    "name": "Mihinpurwa Bazar",
    "block": "Mihinpurwa",
    "district": "Bahraich",
    "lat": 28.03,
    "lon": 81.25
  },
  {
    "name": "Chittaura Gram",
    "block": "Chittaura",
    "district": "Bahraich",
    "lat": 27.51,
    "lon": 81.65
  },
  {
    "name": "Visheshwarganj Gram",
    "block": "Visheshwarganj",
    "district": "Bahraich",
    "lat": 27.41,
    "lon": 81.72
  },
  {
    "name": "Huzoorpur Gram",
    "block": "Huzoorpur",
    "district": "Bahraich",
    "lat": 27.35,
    "lon": 81.67
  },
  {
    "name": "Jarwal Road Bazar",
    "block": "Jarwal",
    "district": "Bahraich",
    "lat": 27.16,
    "lon": 81.55
  },
  {
    "name": "Tejwapur Gram",
    "block": "Tejwapur",
    "district": "Bahraich",
    "lat": 27.45,
    "lon": 81.48
  },
  {
    "name": "Fakharpur Gram",
    "block": "Fakharpur",
    "district": "Bahraich",
    "lat": 27.35,
    "lon": 81.51
  },
  {
    "name": "Bhiyaon Gram",
    "block": "Bhiyaon",
    "district": "Ambedkar Nagar",
    "lat": 26.24,
    "lon": 82.71
  },
  {
    "name": "Mawai Gram",
    "block": "Mawai",
    "district": "Ayodhya",
    "lat": 26.73,
    "lon": 81.6
  },
  {
    "name": "Amaniganj Gram",
    "block": "Amaniganj",
    "district": "Ayodhya",
    "lat": 26.63,
    "lon": 81.78
  },
  {
    "name": "Harringtonganj Gram",
    "block": "Harringtonganj",
    "district": "Ayodhya",
    "lat": 26.58,
    "lon": 82.02
  },
  {
    "name": "Tarun Gram",
    "block": "Tarun",
    "district": "Ayodhya",
    "lat": 26.54,
    "lon": 82.2
  },
  {
    "name": "Pura Bazar Gram",
    "block": "Pura Bazar",
    "district": "Ayodhya",
    "lat": 26.73,
    "lon": 82.28
  },
  {
    "name": "Masodha Gram",
    "block": "Masodha",
    "district": "Ayodhya",
    "lat": 26.72,
    "lon": 82.13
  },
  {
    "name": "Sultanpur Sadar",
    "block": "Sultanpur Sadar",
    "district": "Sultanpur",
    "lat": 26.26,
    "lon": 82.07
  },
  {
    "name": "Kadipur Bazar",
    "block": "Kadipur",
    "district": "Sultanpur",
    "lat": 26.17,
    "lon": 82.38
  },
  {
    "name": "Jaisinghpur Gram",
    "block": "Jaisinghpur",
    "district": "Sultanpur",
    "lat": 26.23,
    "lon": 82.27
  },
  {
    "name": "Lambhua Bazar",
    "block": "Lambhua",
    "district": "Sultanpur",
    "lat": 26.13,
    "lon": 82.27
  },
  {
    "name": "Kurebhar Gram",
    "block": "Kurebhar",
    "district": "Sultanpur",
    "lat": 26.43,
    "lon": 82.13
  },
  {
    "name": "Dostpur Bazar",
    "block": "Dostpur",
    "district": "Sultanpur",
    "lat": 26.28,
    "lon": 82.47
  },
  {
    "name": "Akhand Nagar Gram",
    "block": "Akhand Nagar",
    "district": "Sultanpur",
    "lat": 26.15,
    "lon": 82.52
  },
  {
    "name": "Motigarpur Gram",
    "block": "Motigarpur",
    "district": "Sultanpur",
    "lat": 26.28,
    "lon": 82.35
  },
  {
    "name": "Dubeypur Gram",
    "block": "Dubeypur",
    "district": "Sultanpur",
    "lat": 26.29,
    "lon": 82.03
  },
  {
    "name": "Kurwar Gram",
    "block": "Kurwar",
    "district": "Sultanpur",
    "lat": 26.34,
    "lon": 81.98
  },
  {
    "name": "Dhanpatganj Gram",
    "block": "Dhanpatganj",
    "district": "Sultanpur",
    "lat": 26.43,
    "lon": 81.98
  },
  {
    "name": "Bhadaiya Gram",
    "block": "Bhadaiya",
    "district": "Sultanpur",
    "lat": 26.16,
    "lon": 82.13
  },
  {
    "name": "Baldirai Gram",
    "block": "Baldirai",
    "district": "Sultanpur",
    "lat": 26.44,
    "lon": 81.87
  },
  {
    "name": "Pratapganj Sultanpur",
    "block": "Pratapganj",
    "district": "Sultanpur",
    "lat": 26.22,
    "lon": 82.18
  },
  {
    "name": "Gauriganj Sadar",
    "block": "Gauriganj",
    "district": "Amethi",
    "lat": 26.21,
    "lon": 81.69
  },
  {
    "name": "Tiloi Bazar",
    "block": "Tiloi",
    "district": "Amethi",
    "lat": 26.39,
    "lon": 81.51
  },
  {
    "name": "Jagdishpur Bazar",
    "block": "Jagdishpur",
    "district": "Amethi",
    "lat": 26.47,
    "lon": 81.62
  },
  {
    "name": "Salon Bazar",
    "block": "Salon",
    "district": "Amethi",
    "lat": 26.03,
    "lon": 81.45
  },
  {
    "name": "Amethi Sadar",
    "block": "Amethi",
    "district": "Amethi",
    "lat": 26.15,
    "lon": 81.81
  },
  {
    "name": "Musafirkhana Bazar",
    "block": "Musafirkhana",
    "district": "Amethi",
    "lat": 26.37,
    "lon": 81.8
  },
  {
    "name": "Bhetua Gram",
    "block": "Bhetua",
    "district": "Amethi",
    "lat": 26.25,
    "lon": 81.8
  },
  {
    "name": "Sangrampur Gram",
    "block": "Sangrampur",
    "district": "Amethi",
    "lat": 26.07,
    "lon": 81.87
  },
  {
    "name": "Shahgarh Gram",
    "block": "Shahgarh",
    "district": "Amethi",
    "lat": 26.28,
    "lon": 81.75
  },
  {
    "name": "Singhpur Gram",
    "block": "Singhpur",
    "district": "Amethi",
    "lat": 26.44,
    "lon": 81.42
  },
  {
    "name": "Bahadurpur Amethi",
    "block": "Bahadurpur",
    "district": "Amethi",
    "lat": 26.32,
    "lon": 81.48
  },
  {
    "name": "Jamo Bazar",
    "block": "Jamo",
    "district": "Amethi",
    "lat": 26.35,
    "lon": 81.64
  },
  {
    "name": "Shuklabazar Gram",
    "block": "Shuklabazar",
    "district": "Amethi",
    "lat": 26.54,
    "lon": 81.65
  },
  {
    "name": "Pratapgarh Sadar",
    "block": "Pratapgarh Sadar",
    "district": "Pratapgarh",
    "lat": 25.92,
    "lon": 81.99
  },
  {
    "name": "Kunda Bazar",
    "block": "Kunda",
    "district": "Pratapgarh",
    "lat": 25.71,
    "lon": 81.51
  },
  {
    "name": "Patti Bazar",
    "block": "Patti",
    "district": "Pratapgarh",
    "lat": 25.92,
    "lon": 82.19
  },
  {
    "name": "Raniganj Bazar",
    "block": "Raniganj",
    "district": "Pratapgarh",
    "lat": 25.88,
    "lon": 82.05
  },
  {
    "name": "Lalganj Ajhara",
    "block": "Lalganj Ajhara",
    "district": "Pratapgarh",
    "lat": 25.99,
    "lon": 81.7
  },
  {
    "name": "Babaganj Gram",
    "block": "Babaganj",
    "district": "Pratapgarh",
    "lat": 25.68,
    "lon": 81.42
  },
  {
    "name": "Bihar Gram",
    "block": "Bihar",
    "district": "Pratapgarh",
    "lat": 25.61,
    "lon": 81.58
  },
  {
    "name": "Kalakankar Gram",
    "block": "Kalakankar",
    "district": "Pratapgarh",
    "lat": 25.78,
    "lon": 81.37
  },
  {
    "name": "Rampur Sangramgarh",
    "block": "Rampur Sangramgarh",
    "district": "Pratapgarh",
    "lat": 25.93,
    "lon": 81.58
  },
  {
    "name": "Sangipur Gram",
    "block": "Sangipur",
    "district": "Pratapgarh",
    "lat": 26.04,
    "lon": 81.63
  },
  {
    "name": "Lakshmanpur Gram",
    "block": "Lakshmanpur",
    "district": "Pratapgarh",
    "lat": 25.94,
    "lon": 81.83
  },
  {
    "name": "Sandwa Chandrika Gram",
    "block": "Sandwa Chandrika",
    "district": "Pratapgarh",
    "lat": 26.04,
    "lon": 81.93
  },
  {
    "name": "Mandhata Gram",
    "block": "Mandhata",
    "district": "Pratapgarh",
    "lat": 25.81,
    "lon": 81.92
  },
  {
    "name": "Gaura Gram",
    "block": "Gaura",
    "district": "Pratapgarh",
    "lat": 25.75,
    "lon": 82.09
  },
  {
    "name": "Shivgarh Pratapgarh",
    "block": "Shivgarh",
    "district": "Pratapgarh",
    "lat": 25.84,
    "lon": 82.16
  },
  {
    "name": "Aspur Deosara Gram",
    "block": "Aspur Deosara",
    "district": "Pratapgarh",
    "lat": 25.98,
    "lon": 82.35
  },
  {
    "name": "Magraura Gram",
    "block": "Magraura",
    "district": "Pratapgarh",
    "lat": 26.03,
    "lon": 82.12
  }
];
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
function calculateBearing(c1, c2) {
  if (!c1 || !c2) return 0;
  const [lon1, lat1] = c1;
  const [lon2, lat2] = c2;
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith(".apk") || url.pathname.startsWith("/downloads/")) {
      return new Response("Not Found", { status: 404 });
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
      let speedKmH = 0;
      if (rawSpeed > 0) {
        speedKmH = Math.min(130, Math.round(rawSpeed * 1.852));
      }
      const vehId = String(id).trim().toUpperCase();
      const existing = liveVehicles.get(vehId) || {};
      const colors = getVehicleColors(vehId);
      const cleanLat = Number(lat.toFixed(6));
      const cleanLon = Number(lon.toFixed(6));
      const distKm = calculateDistanceKm(BASE_LAT, BASE_LON, cleanLat, cleanLon);
      const roadDistKm = Math.round(distKm * 1.15 * 10) / 10;
      const prevTrail = Array.isArray(existing.trail) ? existing.trail : [];
      const updatedTrail = [...prevTrail.slice(-29), [cleanLon, cleanLat]];
      const ruralLoc = resolveVillage(cleanLat, cleanLon);
      let computedBearing = Math.round((bearing % 360 + 360) % 360);
      if (computedBearing === 0 && existing.lat && existing.lon && (existing.lat !== cleanLat || existing.lon !== cleanLon)) {
        computedBearing = calculateBearing([existing.lon, existing.lat], [cleanLon, cleanLat]);
      } else if (computedBearing === 0 && existing.bearing) {
        computedBearing = existing.bearing;
      }
      const record = {
        id: vehId,
        name: vehId,
        type: "ambulance",
        driverName: driver ? String(driver).trim() : existing.driverName || "Driver",
        driverPhone: existing.driverPhone || "",
        plate: existing.plate || vehId,
        status: speedKmH > 3 ? "moving" : distKm < 0.25 ? "at_base" : "in_field",
        lat: cleanLat,
        lon: cleanLon,
        speed: speedKmH,
        speedKnots: Number(rawSpeed.toFixed(2)),
        bearing: computedBearing,
        altitude: Math.round(altitude),
        accuracy: isNaN(accuracy) ? 0 : Number(accuracy.toFixed(1)),
        batt: Math.min(100, Math.max(0, Math.round(batt))),
        battery: Math.min(100, Math.max(0, Math.round(batt))),
        charge: Boolean(charge),
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
        updatedAt: Date.now(),
        isLive: true
      };
      liveVehicles.set(vehId, record);
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
      liveVehicles.clear();
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
        toLon = BASE_LON;
        toLat = BASE_LAT;
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
export {
  worker_default as default
};
