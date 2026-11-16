# History redesign — interactive mockups

Static design explorations for `/history`. No production code is imported or
modified. Synthetic data only.

## Open it

```
http://localhost:5199/design/history-mockups/index.html
```

Query parameters:

```
?mode=before|a|b|c|d
?scene=dense|lanes|sparse|poor|mixed
?theme=light
?quality=1
?window=0|120|30
```

## Modes

| Mode | Name | Idea |
|---|---|---|
| `before` | Before | Replica of the current page: dot per sample, 7-row key, trip colours, dotted no-data line, amber suspect dash |
| `a` | Maps | Apple Maps language: one trail with casing, stop rings, gaps break the path, 3-row key |
| `b` | Timeline | Same map, timeline is the hero: larger scrubber, play control and clock |
| `d` | Trips | Trips in distinct colours, each with a Clean / Good / Bad quality badge and a quality underline on the timeline |
| `c` | Dispatch | Left rail with metrics and trip list, route fitted to the right of the rail |

## Data scenarios (calendar)

Click the date pill to pick a day. Each day is a different data shape:

| Date | Scenario | What it tests |
|---|---|---|
| 12 Nov | Dense 30 s | 30 s, high accuracy, no gaps — the "good day" |
| 13 Nov | Narrow lanes | 10 km/h, 30 s, high accuracy — your normal pattern |
| 14 Nov | Sparse 5 min | 5 min samples and two long gaps |
| 15 Nov | Poor accuracy | 40–120 m fixes, one gap, one outlier |
| 16 Nov | Mixed day | Stops, a real gap, and one GPS outlier |

## Date + time

Click the **date pill** to open the calendar. It now contains:

- the month grid (days 12–16 carry the five data scenarios)
- **From** and **To** steppers: big `−` / `+` buttons, 5-minute steps, no typing
- presets: Full day / 2h / 1h / 30m (they end at the current **To**)
- a range readout, e.g. `07:05 am → 07:25 am · 20m`

The map, timeline, stops and metrics restrict to exactly that window.

The timeline always shows the whole day, with the selected window highlighted
and two **handles** you can drag to change the start and end. Five tick labels
(three on phones) give the time scale. The **‹ ›** buttons shift the window by
its own length; the clock pill cycles presets.

Trips in **Trips** mode are nudged 5 px apart so overlapping out-and-back trips
stay visible, each in its own colour.

## Vehicle / driver picker

The vehicle pill at top-left opens the driver list. It has a search field and
shows status (Live / gap / on scene) and the vehicle colour. Selecting a driver:

- updates the pill
- changes the trail colour to that vehicle's colour
- closes the list

The mock has five drivers: AMB-07 Ramesh Yadav, AMB-02 Sunita Devi, AMB-11 Arjun
Kumar, AMB-05 Meena Prasad, AMB-13 Farhan Ali.

## What each mode proves

### Why "dashes and dots" happens even with 30 s and high accuracy

Open **Before → 13 Nov (Narrow lanes)** and then **Maps → 13 Nov**.

At 10 km/h, a 30 s sample is about **83 m** apart. The current page draws a
stroked dot for every sample, so at street zoom those dots read as a dashed
line. The trail under it changes colour every trip (blue → green → amber), which
adds to the dashed look. The dots are not missing data.

The new trail draws one continuous line and no dots, so the same data reads as a
road.

### Accuracy vs data quality

`accuracy=0` (missing) is currently treated as **High ≤ 20 m** in the production
page. The mock separates the two ideas:

- accuracy is an opt-in overlay (green / amber / red), off by default
- trip quality is a badge: **Clean** (median ≤ 20 m, no gaps), **Good**
  (20–50 m or one gap), **Bad** (> 50 m or an outlier)

Open **15 Nov (Poor accuracy)** with the quality overlay on to see all three.

### Offline buffering

Buffering only recovers points that failed to upload. It does not change sample
spacing, the dot rendering, map snapping or smoothing. So "buffer is on" and
"still looks dotted" are both expected with the current UI.

## Interactions

- drag the timeline to scrub
- play at 160×
- click a trip block, chip or list row to isolate a trip
- GPS quality toggle
- map key popover
- calendar day picker
- From / To time range
- drag the window handles
- previous / next window step
- vehicle / driver picker with search
- theme toggle

## Files

- `index.html` — the whole mockup, no build step
- `screenshots/` — before/after, lanes, sparse, poor, trips, calendar, time
  window, vehicle picker

## Branding and map attribution

- Header: **Fleet History — Basti · 16 Nov · by Mani Ratan Singh**
- Sheet footer: **Demo data · built by Mani Ratan Singh · mrps.in**
- Page title and meta author carry the same credit.
- The small **Esri, HERE, Garmin** text is the basemap copyright, required by
  the tile provider. It now sits in the compact attribution control together
  with **Fleet Shield · Mani Ratan Singh (mrps.in)**.

## Not included

- no production component or style is reused
- no data pipeline change; the fixes (raw coordinates, stop vs gap, unknown
  accuracy, buffering, snapping) come after a direction is chosen

## Local worker with Wrangler

Wrangler 4 is installed as a dev dependency (it matches the `2026-11-10`
compatibility date in `wrangler.toml`):

```bash
npm run build
npx wrangler dev --port 8788
```

Then open `http://127.0.0.1:8788/history`. Durable Objects run locally through
Miniflare. The mockups on port 5199 are independent of this.
