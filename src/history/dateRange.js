export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_MS = 30 * DAY_MS;
export const HOUR_MS = 60 * 60 * 1000;

// Playback speed is a multiplier over a range-aware baseline, so 1x always
// means "the whole visible range, at a pace you can follow". A fixed 1x
// duration makes 7 and 30 day ranges finish in seconds while short ranges
// crawl. 0.25x and 0.5x exist because long ranges need a slow pass.
export const PLAY_RATES = [0.25, 0.5, 1, 2, 4, 8, 16];

export function basePlaybackMs(from, to) {
  const span = Math.max(1, to - from);
  if (span <= 2 * HOUR_MS) return 60000;
  if (span <= 6 * HOUR_MS) return 90000;
  if (span <= DAY_MS) return 180000;
  if (span <= 3 * DAY_MS) return 240000;
  if (span <= 7 * DAY_MS) return 300000;
  if (span <= 14 * DAY_MS) return 420000;
  return 600000;
}

export function pad(value) {
  return String(value).padStart(2, '0');
}

export function toLocalInput(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return '';
  const date = new Date(Number(timestamp));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return NaN;
  return new Date(value).getTime();
}

export function formatRangeTime(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return '—';
  const date = new Date(Number(timestamp));
  const day = date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });
  const time = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${day} at ${time}`;
}

export function formatPickerValue(timestamp) {
  if (!Number.isFinite(Number(timestamp))) return 'Select date & time';
  const date = new Date(Number(timestamp));
  const day = date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${day}, ${time}`;
}

export function formatRange(from, to) {
  return `${formatRangeTime(from)} → ${formatRangeTime(to)}`;
}
