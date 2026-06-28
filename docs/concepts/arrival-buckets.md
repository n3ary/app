# Arrival buckets

Station-view classification. Pure function of (vehicle, stop, now).

Source: [src/lib/domain/buckets.ts](../../src/lib/domain/buckets.ts) is authoritative
(constants, thresholds, ordering). This doc explains the model.

## The 7 buckets, in display order

| Bucket | Meaning |
|---|---|
| `departing` | Vehicle is leaving the stop (live speed ≥ threshold or within scheduled departure window) |
| `at-station` | Vehicle is physically at the stop (live GPS) or in scheduled dwell |
| `arriving` | ETA ≤ `arrivingThresholdMin` |
| `incoming` | ETA > `arrivingThresholdMin`, still in the future |
| `drop-off` | Drop-off-only vehicles (cannot board) — separate section after `incoming` |
| `departed` | Past this stop, still en route to terminus |
| `off-route` | Diagnostic — live vehicle far from the route shape |

Sort order: by bucket, then ascending ETA, except `departed` which sorts
most-recent first (negative ETA, sorted by smallest absolute value).

## Urgency

The UI colors a row based on `etaUrgency(bucket, etaMinutes)`:

| Urgency | When | Visual |
|---|---|---|
| `go` | `at-station`, `arriving`, or `incoming` ≤ `imminentEtaThresholdMin` | Bold accent |
| `stop` | `departing` | Bold danger |
| `neutral` | everything else | Muted |

## Context-aware labels

The section header changes when all rows in a bucket are at their trip origin
(the bus is being prepared to start, not "arriving from somewhere"):

| Bucket | All-origin label | Mixed label |
|---|---|---|
| `arriving` | Preparing | Arriving & Preparing |
| `incoming` | Scheduled | Incoming & Scheduled |

Origin-stop detection uses `schedule.isFirstStop`. Independent of
`schedule.tripPhase` (`next` / `last` / `on-route` / `later`), which is a per-route
positional anchor and is orthogonal to bucket placement — a `next` row
can land in `arriving` or `incoming` depending on how close `now` is to
its scheduled departure. See [vehicle.md](vehicle.md#trip-phase).

## Thresholds

All magic numbers live in [`DEFAULT_CONFIG`](../../src/lib/domain/config.ts).
Don't hardcode them anywhere else.

## Filters

The station view applies user preference filters to the bucketed list:

- `showDepartedVehicles=false` drops `departed` (map view ignores this).
- `showDropOffOnly=false` drops `drop-off`.
- `showOffRouteVehicles=false` drops `off-route` (advanced diagnostic).

Drop-off-only does NOT apply to the `departed` bucket — boardability is
moot for a vehicle that already left.

## Capping rule

The board's cap policy splits buckets into three groups:

| Group | Buckets | Cap |
|---|---|---|
| **Actionable now** | `departing`, `at-station`, `arriving` | Uncapped — the rider must never miss an imminent boarding option. |
| **Context** | `incoming`, `drop-off`, `departed` | Each capped at `userPrefs.stationBoardMaxRows` (3 / 5 / 8 / 10, default 5). |
| **Diagnostic** | `off-route` | Uncapped when opted-in — the rider explicitly enabled it. |

Dedup mechanic: within each bucket, rows sharing a `(routeId, directionId)`
cohort collapse to the soonest one. Dedup is **skipped entirely** when
the whole board is already a single `route` (single-route stop, or
filtered via the route badge — both directions of that route are
preserved) — in that case the rider has already chosen their view,
and per-bucket caps do the trimming.

Implementation: [`capStationBoard`](../../src/lib/domain/stationBoard.ts).
