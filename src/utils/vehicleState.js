// Shared telemetry age model.
//
// Vehicles are never deleted for going quiet. Instead the age of the last
// packet maps to a display/operational state:
//
//   < 60 s          live
//   60 s - 15 min   no signal (signal gap)
//   15 - 35 min     parked / stale
//   > 35 min        offline (record and last position are kept)
//
// A new packet from the same canonical id moves the record straight back to
// live, so the name never disappears and never duplicates.

export const LIVE_WINDOW_MS = 60 * 1000;
export const SIGNAL_GAP_WINDOW_MS = 15 * 60 * 1000;
export const PARKED_WINDOW_MS = 35 * 60 * 1000;
export const OFFLINE_AFTER_MS = PARKED_WINDOW_MS;

// Prefer the server receive time (updatedAt). Device clocks can drift or be
// stuck, and using a device timestamp would mark a healthy phone offline.
export function getVehicleLastSeenMs(v) {
  const candidates = [v?.updatedAt, v?.lastSeen];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function computeVehicleAgeState(v, now = Date.now()) {
  const lastSeenMs = getVehicleLastSeenMs(v);
  if (!lastSeenMs) {
    return {
      lastSeenMs: 0,
      ageMs: null,
      ageSec: null,
      gapMinutes: null,
      isLive: false,
      isSignalGap: false,
      isParked: false,
      isOffline: true,
      networkState: 'offline',
    };
  }

  const ageMs = Math.max(0, Number(now) - lastSeenMs);
  const ageSec = Math.floor(ageMs / 1000);
  const gapMinutes = Math.floor(ageSec / 60);

  const isLive = ageMs < LIVE_WINDOW_MS;
  const isOffline = ageMs > OFFLINE_AFTER_MS;
  const isSignalGap = !isLive && !isOffline && ageMs <= SIGNAL_GAP_WINDOW_MS;
  const isParked = !isLive && !isOffline && !isSignalGap;

  return {
    lastSeenMs,
    ageMs,
    ageSec,
    gapMinutes,
    isLive,
    isSignalGap,
    isParked,
    isOffline,
    networkState: isLive ? 'live' : isOffline ? 'offline' : isSignalGap ? 'gap' : 'parked',
  };
}

// Return a copy of the vehicle with freshly derived state. The stored
// isLive/isParked flags from an old snapshot are always overwritten.
export function withVehicleAgeState(v, now = Date.now()) {
  if (!v) return v;
  return { ...v, ...computeVehicleAgeState(v, now) };
}

export function formatVehicleAge(v, now = Date.now()) {
  const { ageSec } = computeVehicleAgeState(v, now);
  if (ageSec === null) return 'never seen';
  if (ageSec < 60) return `${Math.max(1, ageSec)}s ago`;
  const minutes = Math.floor(ageSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
