# Features

A reference for what the wallboard does and where each control lives. All
vehicle and route numbers below are the current implementation, not sample
marketing figures.

## Map

| Feature | Where | Behaviour |
|---|---|---|
| Basemaps | Map style button | Light Gray, Dark Gray, Satellite, Highways & Streets. |
| Zoom / fit | Top-right dock | Zoom in, zoom out, fit all vehicles and the base. |
| True north | Top-right dock | Resets bearing to 0. |
| Focus base | Top-right dock | Centres on Sant Kabir Eye Hospital, Basti. |
| Distance vectors | Top-right dock | Shows or hides the route ribbons from base to vehicle. |
| Fullscreen | Top-right dock | Browser fullscreen for wallboard use. |
| Marker tags | Map | Full detail at close zoom; ID only below zoom 11.2. |
| Zoom tiers | Map | Icon scales to 56% below 10.6, 78% from 10.6–12.4, 100% above 12.4. |
| Tag anchoring | Map | Tags float above the icon. The icon stays on the GPS point. |
| Dense clusters | Map | Overlapping ID pills are hidden at far zoom; the selected or hovered vehicle keeps its tag. |
| Base cluster | Map | Vehicles within 150 m of base are grouped into the base badge below zoom 13.5. |

## Fleet sheet

| Feature | Where | Behaviour |
|---|---|---|
| Peek / half / full | Bottom-left sheet handle | Drag or click the handle. Detents: 88, 560 and 680 px. |
| Spring motion | Sheet | Momentum projection, rubber-banding and interruptible drag. |
| Filters | Sheet header | All, En route, On scene, No signal. |
| Sorting | Sheet | No signal → Moving → On scene → Returning → At base, then by ID. |
| Row actions | Each vehicle row | Provision QR, call driver, open navigation. |
| Vehicle detail | Select a vehicle | Driver contact, coordinates, Google Maps, Apple Maps, distance and speed. |
| Summary popover | Chevron in the island | En route, on scene, at base and total counts, connection state, link to the list. |

## Live state

| State | Meaning |
|---|---|
| Moving | Reporting and above the movement threshold. |
| On scene | Parked or stationary away from base. |
| Returning | Reporting with a returning status. |
| At base | Parked within 1.2 km of the base. |
| No signal | Last fix is 1–15 minutes old; the vehicle stays pinned. |

After 15 minutes without a fix the vehicle is marked parked. After 35 minutes it
is removed from the hub state.

## TV wallboard

| Feature | Behaviour |
|---|---|
| Auto-tour | Alternates a vehicle close-up and a fleet overview. |
| Close-up | Zoom 13.2 desktop / 12.2 mobile, pitch 28, bearing 0. 8.5 s normally, 5 s for a signal-gap vehicle. |
| Overview | Fits all reporting vehicles and the base. Zoom capped at 12.8 / 10.8, pitch 22. 6 s. |
| Demo / live | The demo toggle loads ten simulated vehicles; live mode shows only real telemetry. |
| Reduced motion | The tour and CSS animations respect `prefers-reduced-motion`. |

## Provisioning and telemetry

| Feature | Where | Behaviour |
|---|---|---|
| QR provisioning | Vehicle row → Provision | Enter the driver name, choose the server, download or copy the Traccar QR. |
| Telemetry setup | Island radio button | Driver name, Traccar QR, OsmAnd and REST API tabs. |
| OsmAnd contract | Telemetry setup | `/api/track` with URL-encoded query parameters. Speed is in knots. |
| REST contract | Telemetry setup | JSON or form posts to `/api/track` or `/api/location`. |
| Test ingestion | Provisioning dialog | Sends a test packet and reports the response and latency. |
| Protocol tab | Provisioning dialog | Shows the Traccar QR URI and the settings it applies. |

## Presentation

| Feature | Behaviour |
|---|---|
| Themes | Dark and light, including matching map styles. |
| Typography | rem-based ramp with optical sizing. |
| Contrast | `prefers-contrast: more` adds solid surfaces, 2 px borders and a stronger focus ring. |
| Transparency | `prefers-reduced-transparency: reduce` removes backdrop blur and makes panels solid. |
| Touch | 44 px hit areas on coarse pointers, press states on buttons and rows. |
| Reduced motion | Transitions and animations are reduced to near-zero. |

## Data and routing

| Feature | Behaviour |
|---|---|
| One base | Sant Kabir Eye Hospital, Basti — `26.797313, 82.718401`. |
| Routes | 195 village routes, 17 / 15 / 11 fleet route arrays, all starting at Basti. |
| Route guard | `npm run test:routes` checks every route origin. |
| Gazetteer | 195 local named places. Place labels come from the current GPS fix. |
| Runtime routing | No OSRM call at runtime. Routes are generated offline and committed. |
| Live state | One SQLite-backed Durable Object, `PurvanchalFleetHub`. |
| Transports | WebSocket snapshot + deltas, with a 10-second HTTP fallback. |

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/track` | Traccar OsmAnd telemetry. |
| `POST /api/location` | JSON or form telemetry. |
| `GET /api/vehicles` | Current fleet snapshot. |
| `GET /api/ws` | Dashboard WebSocket. |
| `GET /api/ws?role=tracker` | Tracker WebSocket. |
| `POST/DELETE /api/clear` | Admin-only state flush. |
| `GET /api/route` | Optional route endpoint; the current client does not call it. |

See [DATA_AND_ROUTING.md](DATA_AND_ROUTING.md) and [TESTING.md](TESTING.md) for
the pipeline and release checks.
