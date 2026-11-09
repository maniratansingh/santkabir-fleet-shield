// Single source of truth for the Sant Kabir Eye Hospital base coordinates.
// Kept separate from the heavier mockData module so the edge worker and the
// Durable Object can import it without pulling in client-only datasets.

export const BASE_LAT = 26.797313;
export const BASE_LON = 82.718401;
