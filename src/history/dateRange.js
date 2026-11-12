export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_MS = 7 * DAY_MS;

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
