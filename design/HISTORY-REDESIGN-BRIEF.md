# History Page Redesign — Brief

Status: research complete, no app code changed.
Goal: produce static, high-fidelity mockups for review on localhost before any
production code is touched.

## Context

- App: Sant Kabir Fleet Shield (React 19 + Vite, MapLibre, Tailwind v4).
- Page: `/history` (`src/history/HistoryApp.jsx`), password protected.
- The live fleet board already has a polished, Apple-like visual language
  (floating glass pills, bottom sheet, dark map). The history page does not.
- The user's complaint: "the legend and displaying is confusing; it feels like
  dashes and dots; data does not feel cohesive."
- Reference feel: Apple Maps / Apple Fitness timeline / Apple Health detail.

Do not copy Apple assets or branding. Translate HIG principles only.

## Verified findings that the mockups must solve

### Visual
1. Seven legend rows and ten visual encodings compete: unified line, trip line,
   return dash, no-data dotted, suspect amber dash, plus five point styles.
2. Every sample is drawn as a stroked dot (2–5 px) — a 7-day range is 20,160
   points, so the trail reads as a bead chain.
3. Sidebar is 8 stacked sections with 8–10 px uppercase labels.
4. Stats card leads with "Points", a developer metric.
5. History trail is raw point-to-point; the live board snaps to roads. Same
   product, two different looks.

### Data truth (must be reflected, not hidden)
1. History stores Kalman-smoothed coordinates, not raw fixes. The official
   Traccar view shows raw fixes, which is why it looks more accurate.
2. `buffer=false` in the provisioning QR dropped fixes when upload failed. The
   fleet profile now uses `buffer=true`.
3. `stop_detection=true` produced stationary gaps because the app stopped
   location updates. The fleet profile now uses `stop_detection=false`; the UI
   still draws genuine network gaps as dotted diagonals.
4. `accuracy=0` (missing) is rendered as High accuracy.
5. Gap threshold `max(90s, median*3)` hides 60–90 s holes as solid line.
6. `Return` trips are inferred and drawn 55 m offset — fabricated geometry.
7. Trips split at midnight, producing fake trips.
8. Distance is a straight-line sum, not road distance.

## Design non-negotiables

- Map first, full bleed. No permanent 340 px sidebar.
- One trail language. No dot per sample by default.
- Gaps break the path. Never draw a dotted straight line across the map.
- Distinguish **Stop** (endpoints close, vehicle stationary) from **No data**
  (endpoints far, real signal loss).
- GPS quality is an opt-in overlay with its own 3-row key. Off by default.
- Legend outside the overlay: 3 rows max — Trip, Stop, No data.
- Human summary: distance, moving time, stops, average speed.
- Type scale: 11 px minimum for labels, 13 px body, 15/17 px values,
  24–28 px hero number. Sentence case. Three text tones.
- 8 pt spacing grid, 12/16/20 px radii, one accent hue + one warning hue.
- Respect `prefers-reduced-motion`; motion is purposeful, 200–400 ms.
- Dark and light themes must both be designed, not tinted.
- Phone width is a first-class layout, not a shrinking desktop.

## Three directions to mock

### A. Maps-native minimal
Closest to Apple Maps. Floating vehicle + range pills, one accent trail with
casing, start/end pins, small inline "Stop"/"No data" chips on the path.
Sheet at peek/half. Summary as a single line of metrics.

### B. Timeline / Fitness
Bottom timeline scrubber is the hero: trip blocks, drag to scrub, play at 8×/30×,
moving marker, camera follow. Right side stats card. Legend hidden until asked.

### C. Operations pro
For dispatchers: left rail with trip list and KPIs, map full bleed, quality
overlay available as a mode. Denser than A/B but still one trail language.

Each direction should show:
- 7-day overview (many trips)
- single-trip focus
- a real gap and a real stop, clearly different
- GPS quality overlay ON in one shot
- dark + light
- desktop 1440×900 and phone 390×844

## Mockup constraints

- Standalone files under `design/history-mockups/`. Import nothing from `src/`.
- MapLibre from CDN is allowed; a styled static SVG basemap is also acceptable
  if it keeps the mock fast. Use the project's Esri style colours for realism.
- Synthetic data only. Use the Basti / Khalilabad / Bansi area.
- No auth, no API calls, no build step. Open the HTML directly.
- One `index.html` that links the directions is preferred.
- Keep each direction in its own file so they can be compared side by side.

## Deliverables for review

1. `design/history-mockups/index.html` — direction switcher.
2. One HTML file per direction.
3. Screenshots: A/B/C × dark/light × desktop/phone.
4. A short `design/HISTORY-REDESIGN-DECISION.md` comparing them and recommending
   one, with the trade-offs.

## Out of scope for the mockup phase

- No edits to `src/`, `package.json`, config, or the worker.
- No deployment.
- No data-pipeline changes yet; those follow after the direction is chosen.
