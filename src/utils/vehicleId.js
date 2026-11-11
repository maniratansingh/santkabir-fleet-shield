// Single canonical vehicle identity used by the edge Worker, the Durable
// Object, the tracker QR and the dashboard.
//
// The driver name is the device id, so two spellings of the same name must map
// to exactly one fleet record. Otherwise a re-connecting phone can create a
// second "ghost" marker beside its real one.
//
// Rules:
//   - trim leading/trailing whitespace
//   - collapse any run of whitespace (spaces, tabs, newlines, NBSP) to one space
//   - uppercase (locale independent)
export function canonicalVehicleId(value) {
  return String(value ?? '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toUpperCase();
}

export function isSameVehicleId(a, b) {
  return canonicalVehicleId(a) === canonicalVehicleId(b);
}
