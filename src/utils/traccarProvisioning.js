// Shared Traccar Client provisioning profile. One identity only: the driver
// name is the device id. The settings are sent inside the QR URI.
export const TRACCAR_SETTINGS = {
  accuracy: 'highest',
  distance: 0,
  interval: 30,
  angle: 0,
  heartbeat: 60,
  buffer: false,
  wakelock: true,
  stop_detection: true,
  prefer_platform_providers: false,
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
