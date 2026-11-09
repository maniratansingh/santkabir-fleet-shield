# Testing

## Branch

New work starts on `experimental`. `testing` is the QA gate and `main` is
production.

- `testing` is not deployed.
- It only moves by merging a verified `experimental`.
- Do not experiment or make direct edits on `testing` or `main`.
- Run the full suite before merging `testing` into `main`.

## Commands

```bash
npm test                  # master contract + route anchor guard
npm run test:routes       # route origin guard only
npm run test:kalman       # kinematic GPS filter
npm run test:map-matching # client-side road snapping
npm run test:do-ws        # Durable Object + WebSocket hub
```

`test:do-ws` requires a local Worker:

```bash
npx wrangler dev --port 8787 --local
node scripts/verify_do_ws.mjs
```

## Current coverage

| Suite | Checks |
|---|---:|
| Master contract | 28 |
| Route anchor guard | 240 |
| Kalman filter | 8 |
| Map matching | 6 |
| Durable Object / WebSocket | 13 |

The route anchor guard checks 195 village routes, 17 initial-fleet routes,
15 FLEET_15 routes, 11 INITIAL_11 routes, and both generator scripts.

## Release checklist

1. `npm run build`
2. `npm test`
3. `npm run test:kalman`
4. `npm run test:map-matching`
5. `npx wrangler dev --port 8787 --local` in another terminal
6. `npm run test:do-ws`
7. Manual visual check:
   - dark and light wallboard
   - fleet list filters
   - vehicle detail
   - provisioning dialog
   - telemetry dialog
   - desktop and mobile widths
   - overview zoom: icons small, tags attached, no detached labels
8. Confirm no browser console errors.
9. Merge `testing` into `main`.

## Viewing the live board

```bash
npm run dev
# http://localhost:3000/?demo=true
```

Local Worker:

```bash
ADMIN_SECRET_KEY=dev-admin-key npx wrangler dev --port 8787 --local
# http://localhost:8787
```

## What not to do

- Do not run `npm run data:routes` against production during a live dispatch.
- Do not test against the public OSRM server at high frequency.
- Do not merge `experimental` directly into `main`.
