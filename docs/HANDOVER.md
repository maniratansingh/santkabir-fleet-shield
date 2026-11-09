# Handover

Last updated: 10 November 2026.

## Status

Ready. All three branches are synced and the working tree has no uncommitted
tracked changes.

| Branch | Role | State |
|---|---|---|
| `main` | Production at `fleet.mrps.in` | Synced |
| `testing` | QA gate | Synced |
| `experimental` | Active work | Synced |

Confirm the current commit:

```bash
git log --oneline -1 main testing experimental
git branch -vv
```

## What is implemented

- One base: Sant Kabir Eye Hospital, Basti — `26.797313, 82.718401`.
- Vehicle icons are anchored on the GPS point. Tags float above and cannot
  move the icon.
- Zoom tiers: 56% icon below zoom 10.6, 78% from 10.6–12.4, 100% above 12.4.
- Tags: full detail at close zoom, ID only below 11.2. Shelves are disabled at
  far zoom and limited to 2 at mid zoom. Overlapping ID pills are suppressed in
  dense far-zoom clusters.
- Draggable spring sheet at 88 / 560 / 680 px detents.
- rem type ramp, reduced-motion, reduced-transparency and high-contrast support.
- 44 px touch targets on coarse pointers and press states.
- Base-anchored route data: 195 village routes and 17 / 15 / 11 fleet arrays.
- Dashboard stream: WebSocket snapshot + deltas, 10-second HTTP fallback.
- TV auto-tour: close-up at zoom 13.2 desktop / 12.2 mobile, fitted overview.

## Start the app

```bash
npm install
npm run dev
```

Open `http://localhost:3000/?demo=true` for the ten-vehicle demo fleet.
The header toggle switches between demo and live GPS.

Production:

```bash
npm run build
npx wrangler deploy
```

## Verify before the next release

```bash
npm run build
npm test
npm run test:kalman
npm run test:map-matching
npm run test:routes
npm run test:do-ws
```

`test:do-ws` needs a local Worker:

```bash
npx wrangler dev --port 8787 --local
```

Last verified result:

| Suite | Result |
|---|---:|
| Master contract | 28/28 |
| Route anchor guard | 240/240 |
| Kalman | 8/8 |
| Map matching | 6/6 |
| Durable Object / WebSocket | 13/13 |
| Build | Pass |

## Branch flow

New work goes to `experimental`. Verified work is merged into `testing`, then
into `main`. Do not edit `testing` or `main` directly.

See [BRANCHING.md](BRANCHING.md) for the full rules and commands.

## Documentation

- [FEATURES.md](FEATURES.md) — feature and control reference.
- [BRANCHING.md](BRANCHING.md) — branch rules and promotion.
- [SCREENSHOTS.md](SCREENSHOTS.md) — current image gallery.
- [DATA_AND_ROUTING.md](DATA_AND_ROUTING.md) — routes, OSRM and data sources.
- [TESTING.md](TESTING.md) — test suites and release checks.
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — system architecture.
- [../README.md](../README.md) — project overview.

## Local files not committed

These are generated or superseded and are intentionally left untracked:

- `docs/ai-handover/` — older handover set. Superseded by `FEATURES.md`,
  `ARCHITECTURE.md` and this file. Do not treat it as current.
- `deepseek-dossier/`, `graphify-out/`, `recommendations/`
- `reports/` generated audit folders other than `reports/ui-audit/`

They do not affect the build or the running app.
