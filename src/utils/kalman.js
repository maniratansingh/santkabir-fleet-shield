// 2D Kinematic Kalman Filter for GPS smoothing.
// State: [lat, lon, vLat, vLon] in decimal degrees and degrees/second.
// Pure JavaScript, no dependencies. The 2x2 innovation covariance is
// inverted analytically, so this stays well below the 0.05 ms/vehicle budget.

const METERS_PER_DEG_LAT = 111320;

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
    a[0], a[4], a[8], a[12],
    a[1], a[5], a[9], a[13],
    a[2], a[6], a[10], a[14],
    a[3], a[7], a[11], a[15],
  ];
}

/**
 * Create an independent filter for one vehicle.
 *
 * @param {object} options
 * @param {number} options.processAccel  Expected acceleration noise, m/s^2.
 * @param {number} options.minAccuracy   Floor for reported GPS accuracy, metres.
 * @param {number} options.maxAccuracy   Ceiling for reported GPS accuracy, metres.
 */
export function createKinematicFilter(options = {}) {
  const processAccel = Number.isFinite(options.processAccel) ? options.processAccel : 0.05;
  const minAccuracy = Number.isFinite(options.minAccuracy) ? options.minAccuracy : 3;
  const maxAccuracy = Number.isFinite(options.maxAccuracy) ? options.maxAccuracy : 150;

  let state = null; // [lat, lon, vLat, vLon]
  let covariance = null; // 4x4, row-major
  let lastTimestamp = 0;

  const reset = () => {
    state = null;
    covariance = null;
    lastTimestamp = 0;
  };

  const initialize = (lat, lon, timestamp, rLat, rLon) => {
    state = [lat, lon, 0, 0];
    covariance = [
      rLat, 0, 0, 0,
      0, rLon, 0, 0,
      0, 0, 1e-7, 0,
      0, 0, 0, 1e-7,
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
    const cosLat = Math.max(0.1, Math.cos((rawLat * Math.PI) / 180));
    const metersPerDegLon = METERS_PER_DEG_LAT * cosLat;
    const rLat = (acc / METERS_PER_DEG_LAT) ** 2;
    const rLon = (acc / metersPerDegLon) ** 2;

    if (!state) return initialize(rawLat, rawLon, t, rLat, rLon);

    let dt = (t - lastTimestamp) / 1000;
    // A long signal gap is not a constant-velocity interval. Re-seed.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 60) {
      reset();
      return initialize(rawLat, rawLon, t, rLat, rLon);
    }
    dt = Math.max(0.5, Math.min(60, dt));

    const F = [
      1, 0, dt, 0,
      0, 1, 0, dt,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    // Predict state.
    const predicted = [
      state[0] + state[2] * dt,
      state[1] + state[3] * dt,
      state[2],
      state[3],
    ];

    // Predict covariance: F P F^T + Q.
    const FP = mat4Mul(F, covariance);
    const FPFt = mat4Mul(FP, mat4Transpose(F));

    const qLat = (processAccel / METERS_PER_DEG_LAT) ** 2;
    const qLon = (processAccel / metersPerDegLon) ** 2;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    const Q = [
      (qLat * dt4) / 4, 0, (qLat * dt3) / 2, 0,
      0, (qLon * dt4) / 4, 0, (qLon * dt3) / 2,
      (qLat * dt3) / 2, 0, qLat * dt2, 0,
      0, (qLon * dt3) / 2, 0, qLon * dt2,
    ];
    const P = FPFt.map((value, index) => value + Q[index]);

    // Innovation covariance S = H P H^T + R, a 2x2 matrix.
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

    // K = P H^T S^-1. P H^T is the first two columns of P.
    const pht = [
      [P[0], P[1]],
      [P[4], P[5]],
      [P[8], P[9]],
      [P[12], P[13]],
    ];
    const K = pht.map((row) => [
      row[0] * inv00 + row[1] * inv10,
      row[0] * inv01 + row[1] * inv11,
    ]);

    const innovationLat = rawLat - predicted[0];
    const innovationLon = rawLon - predicted[1];

    const nextState = [
      predicted[0] + K[0][0] * innovationLat + K[0][1] * innovationLon,
      predicted[1] + K[1][0] * innovationLat + K[1][1] * innovationLon,
      predicted[2] + K[2][0] * innovationLat + K[2][1] * innovationLon,
      predicted[3] + K[3][0] * innovationLat + K[3][1] * innovationLon,
    ];

    // P = (I - K H) P. H P is the first two rows of P.
    const hp0 = P.slice(0, 4);
    const hp1 = P.slice(4, 8);
    const nextCovariance = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        nextCovariance[r * 4 + c] =
          P[r * 4 + c] - (K[r][0] * hp0[c] + K[r][1] * hp1[c]);
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
      filtered: true,
    };
  };

  return {
    update,
    reset,
    getState: () => (state ? { state: [...state], covariance: [...covariance] } : null),
  };
}
