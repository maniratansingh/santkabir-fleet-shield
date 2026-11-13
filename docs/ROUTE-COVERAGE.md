# Route Coverage Expansion — Custom Fixed Paths Only

**Purpose:** This file is the reminder and operating procedure for expanding
coverage in Sant Kabir Fleet Shield.

**Rule:** We only add **fixed, precomputed route data** for the paths this
application actually uses. We do **not** add all-India, all-UP, all-Purvanchal
coverage, whole-city street networks, camps, camp points, dynamic OSRM routing,
or external runtime routing services.

Reliability first. The same routes must behave like the existing Basti routes:
the live trail sticks to the road, and the distance back to Basti is shown.

---

## Current fixed coverage policy

Allowed:

- Basti → Lucknow City
- Basti → Sitapur → Shahjahanpur → Tilhar
- Basti → Parsa, Bihar (via Gorakhpur)
- Basti → Parsa, Bihar (via Ballia–Buxar)
- Later, when explicitly requested: Basti → Delhi
- Other fixed paths only when explicitly requested

Not allowed without a separate decision:

- Whole-city road networks
- Every lane or street in Lucknow/Shahjahanpur
- Dynamic routing at runtime
- External routing servers at runtime
- Camps or camp points
- Code changes to the matcher, App, or Worker
- Refactoring the existing route logic

---

## Current required route

**Basti → Lucknow → Sitapur → Shahjahanpur → Tilhar**

- Tilhar is the endpoint area near the medical college.
- Shahjahanpur and Sitapur are on the way; do not create separate camp entries.
- The route is stored as one base-anchored corridor.
- The existing `Tilhar` place entry is used only so the current route selector
  can choose the corridor; it is not a camp and must not be presented as one.
- The existing `Lucknow City` place entry is used the same way for the Lucknow
  end of the corridor.

Data added:

- `src/data/roadRoutes.json`:
  - `HIGHWAY-BASTI-LUCKNOW-CITY`
  - `HIGHWAY-BASTI-TILHAR`
- `src/data/ruralVillages.json`:
  - `Lucknow City`
  - `Tilhar`

Approximate size:

- Basti → Lucknow City: ~17 KB minified, ~6 KB gzip
- Basti → Tilhar: ~38 KB minified, ~13 KB gzip
- Total: ~55 KB minified, ~19 KB gzip

---

## Basti → Parsa, Bihar

Two major fixed alternatives are stored:

| Corridor key | Route | Distance | Points | Minified | Gzip |
|---|---|---:|---:|---:|---:|
| `HIGHWAY-BASTI-PARSA-GORAKHPUR` | Basti → Parsa via Gorakhpur | 522.6 km | 3,104 | 67.8 KB | 22.4 KB |
| `HIGHWAY-BASTI-PARSA-BALLIA` | Basti → Parsa via Ballia–Buxar | 591.2 km | 2,897 | 63.3 KB | 21.4 KB |
| | **Total** | | **6,001** | **131.0 KB** | **43.8 KB** |

`Parsa` is a route-selector place near the destination, not a camp. The actual
corridor endpoints are the Parsa coordinates `25.0987437, 86.6220546`.

---

## How to add a future fixed route

Example: Basti → Bihar, or Basti → Delhi.

1. Confirm the exact fixed endpoint and the roads the vehicles actually use.
2. Fetch one OSRM driving route from the Basti base to that endpoint:
   `overview=full&geometries=geojson`.
3. Keep every second point (the existing convention), round coordinates to 6
   decimal places.
4. Add one base-anchored entry to `src/data/roadRoutes.json`:
   - `key`: a stable uppercase corridor key
   - `name`: human-readable route name
   - `roadDistanceKm`
   - `roadDistanceMeters`
   - `coordinates`
5. If the current place selector cannot return the endpoint name, add one
   place entry to `src/data/ruralVillages.json` with the endpoint coordinates.
   This is a **route-selection place**, not a camp.
6. Do not add the route to `allVillagesRoadRoutes.json` unless a named village
   route is specifically required.
7. Run:
   - `npm run build`
   - `npm test`
   - `npm run test:route-anchors` (or `npm run test:routes`)
8. Deploy only after the files build and the route appears in the live trail.
9. Update this file with the new corridor and its size.

---

## Size guide

At the existing dense convention:

- About **10 KB minified / 3.5 KB gzip per 100 km**.
- A 700 km Basti → Delhi corridor is roughly **70 KB minified / 24 KB gzip**.
- A 250 km Basti → Bihar corridor is roughly **25 KB minified / 9 KB gzip**.

These are static files. No database rows, no Durable Object storage, no runtime
routing cost.

---

## Validation checklist

- [ ] The corridor starts at the Basti base (within 0.5 km).
- [ ] The corridor follows the requested main roads.
- [ ] The end point is the fixed destination area, not a camp.
- [ ] The vehicle’s nearest place resolves to the corridor endpoint.
- [ ] The live trail follows the road and reaches the vehicle projection.
- [ ] Distance back to Basti is present.
- [ ] No matcher, App, Worker, or dynamic-routing code was changed.
- [ ] Build and route tests pass.
- [ ] This file is updated with the new corridor.

---

## Hard reminder

If a change requires modifying the matcher, App, Worker, or adding dynamic
routing, **stop**. That is a separate decision, not a coverage increase.
Coverage increase means adding fixed route data only.
