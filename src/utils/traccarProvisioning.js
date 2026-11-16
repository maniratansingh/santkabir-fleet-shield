// Shared Traccar Client provisioning profile. One identity only: the driver
// name is the device id. The settings are sent inside the QR URI.
//
// Tuning is deliberate; see README "Provisioning contract" for the full
// rationale.
// - interval 30 s + distance 0: time is the only trigger, no fixes are skipped.
// - angle 15: Android GPS provider also emits a fix when heading changes by
//   15 degrees, which captures turns and lane changes instead of cutting corners.
// - stop_detection false: stop detection registers activity recognition and
//   geofences, switches the tracker to Stationary mode and stops location
//   updates entirely. That pauses uploads and produces the exact gaps we do not
//   want, so it stays off. Heartbeat only runs while stop detection is on.
// - prefer_platform_providers true: use Android's own LocationManager provider
//   (GPS for accuracy=highest) instead of Google Fused Location. Rural and
//   highway fixes are not blended with Wi-Fi/cell, so the trail stays truthful.
// - buffer true: queue fixes while offline and flush them when data returns.
export const TRACCAR_SETTINGS = {
  accuracy: 'highest',
  distance: 0,
  interval: 30,
  angle: 15,
  heartbeat: 60,
  buffer: true,
  wakelock: true,
  stop_detection: false,
  prefer_platform_providers: true,
};

export const MAX_DRIVER_NAME_WORDS = 4;
export const MAX_DRIVER_NAME_LENGTH = 40;

export function sanitizeDriverName(raw) {
  const collapsed = String(raw || '').replace(/\s+/g, ' ').replace(/^\s+/, '');
  const words = collapsed.split(' ').slice(0, MAX_DRIVER_NAME_WORDS);
  return words.join(' ').slice(0, MAX_DRIVER_NAME_LENGTH);
}

export function buildTraccarUrl(server, id) {
  try {
    const url = new URL(server);
    url.searchParams.set('id', id);
    for (const [key, value] of Object.entries(TRACCAR_SETTINGS)) {
      url.searchParams.set(key, String(value));
    }
    // Use %20 for spaces so every QR parser decodes the name identically.
    return url.toString().replace(/\+/g, '%20');
  } catch {
    return '';
  }
}
