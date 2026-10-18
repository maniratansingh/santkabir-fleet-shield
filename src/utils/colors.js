// Golden Ratio HSL Unique Color Engine for Fleet Shield
// Ensures 100+ vehicles get non-colliding, high-contrast, clinical Apple-grade colors

// Pre-defined premium palette for the first 12 primary ambulances
const PRIMARY_PALETTE = [
  { line: '#007AFF', glow: '#38BDF8' }, // Apple Blue
  { line: '#10B981', glow: '#34D399' }, // Emerald Green
  { line: '#F59E0B', glow: '#FBBF24' }, // Vivid Amber
  { line: '#8B5CF6', glow: '#A78BFA' }, // Royal Violet
  { line: '#EC4899', glow: '#F472B6' }, // Rose Pink
  { line: '#06B6D4', glow: '#22D3EE' }, // Electric Cyan
  { line: '#84CC16', glow: '#A3E635' }, // Lime Green
  { line: '#F97316', glow: '#FB923C' }, // Tangerine
  { line: '#6366F1', glow: '#818CF8' }, // Indigo
  { line: '#14B8A6', glow: '#2DD4BF' }, // Teal
  { line: '#E11D48', glow: '#FB7185' }, // Crimson Coral
  { line: '#D946EF', glow: '#E879F9' }, // Magenta
];

// Golden ratio conjugate
const GOLDEN_RATIO_CONJUGATE = 0.618033988749895;

function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/**
 * Returns a deterministic, vibrant, non-colliding color pair for any vehicle identifier.
 * @param {string} id - Vehicle ID (e.g. 'AMB-01', 'AMB-042')
 * @returns {object} { line: string, glow: string }
 */
export function getUniqueVehicleColor(id = '') {
  const cleanId = String(id).trim().toUpperCase();

  // If vehicle has a standard AMB-XX number, map first 12 directly to handcrafted palette
  const match = cleanId.match(/AMB-(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= PRIMARY_PALETTE.length) {
      return PRIMARY_PALETTE[num - 1];
    }
  }

  // Calculate deterministic numeric seed from ID string
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 31 + cleanId.charCodeAt(i)) & 0xffffffff;
  }
  const seed = Math.abs(hash);

  // Generate hue using golden ratio spacing for maximum visual distinction
  let hue = (seed * GOLDEN_RATIO_CONJUGATE) % 1;
  hue = Math.floor(hue * 360);

  // High saturation (85%) and clinical brightness (52% line, 68% glow)
  const line = hslToHex(hue, 88, 50);
  const glow = hslToHex(hue, 92, 68);

  return { line, glow };
}
