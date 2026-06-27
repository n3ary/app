# Live data analysis — Tranzy vs GTFS-RT (CTP Cluj)

Empirical comparison between the two real-time vehicle position sources
available for CTP Cluj, captured at unix `1782448779` (2026-06-26 04:39:39 UTC).
Used to ground the architectural decision in
[neary-gtfs-plan.md §4](neary-gtfs-plan.md#4-tranzyai-disposition) — Tranzy
is **demoted to an optional advanced signal**, not removed entirely.

## Sources sampled

| Source | URL | Auth |
|---|---|---|
| Tranzy | `https://api.tranzy.ai/v1/opendata/vehicles` (header `X-API-KEY` + `X-Agency-Id: 2`) | API key, free tier |
| GTFS-RT | `https://cluj-rt-feed.gtfs.ro/vehiclePositions` | None |

## Headline numbers

| | Tranzy | GTFS-RT |
|---|---|---|
| Vehicles reported | **420** | **169** |
| Payload size | 104 KB JSON | 15 KB protobuf |
| Authentication | API key required | None |
| CORS | `Access-Control-Allow-Origin: *` ✓ | None — needs edge proxy |
| Trip-id format | `42_1` (route_direction, stripped) | `42_1_LV_2_0640` (canonical, matches our GTFS) |

GTFS-RT's 169 vehicles are a **strict subset** of Tranzy's 420. The 251
Tranzy-only vehicles are almost certainly **yard / parked / out-of-service**
buses with active GPS but no current trip assignment. GTFS-RT filters to
trip-assigned vehicles; Tranzy publishes the full fleet.

## Agreement (on the 169 vehicles in both feeds)

| Metric | Value |
|---|---|
| Identical position (< 0.5 m) | **41** (24%) |
| Median position delta | **286 m** |
| p90 position delta | 1068 m |
| Max position delta | 2414 m |
| Median timestamp lag (GTFS-RT behind Tranzy) | **61 s** |
| p90 timestamp lag | 208 s |
| Max timestamp lag | 566 s (~9 min) |

Where the two feeds share a vehicle timestamp (24% of cases), positions
agree to within a meter — confirming both ultimately read **the same CTP
AVL source**. The position discrepancies elsewhere are explained almost
entirely by the timestamp lag: GTFS-RT regenerates every 10 s but ingests
upstream AVL more conservatively, while Tranzy ingests as fast as it
receives. During the ~60 s typical lag, an in-service bus moves ~200–400 m.

## Trip ID format mismatch (critical)

**0 of 169 trip IDs match by string compare.** The two feeds reference
the same scheduled runs using different ID conventions:

- Tranzy: `45_1` — route + direction only
- GTFS-RT: `45_1_LV_9_0721` — route + direction + service pattern + block
  + start time. This is the canonical CTP trip_id, **identical to what's
  in our GTFS .zip and our SQLite blob**.

For v2's reconciler, **GTFS-RT trip_ids JOIN the SQLite directly** with
no remapping. Tranzy trip_ids would need an additional lookup table
built daily.

## Field coverage

| Field | Tranzy | GTFS-RT |
|---|---|---|
| lat/lon | ✓ | ✓ |
| bearing | ✗ | ✓ |
| speed | ✓ (km/h) | ✓ (m/s) |
| license plate | ✓ | ✓ |
| internal numeric id | ✓ | ✗ |
| route_id | ✓ | ✓ |
| trip_id (stripped form) | ✓ | ✗ |
| trip_id (canonical, joins GTFS) | ✗ | ✓ |
| trip start_date | ✗ | ✓ |
| **current_status** (`STOPPED_AT` / `IN_TRANSIT_TO` / `INCOMING_AT`) | ✗ | ✓ |
| current_stop_sequence | ✗ | ✓ |
| next stop_id | ✗ | ✓ |
| vehicle_type | ✓ on vehicle | ✗ (lives in `routes.txt`) |
| wheelchair_accessible | ✓ on vehicle | ✗ (lives in `trips.txt`) |
| bike_accessible | ✓ on vehicle | ✗ (lives in `trips.txt`) |

Operational fields exclusive to GTFS-RT (`current_status`, `next_stop_id`,
`current_stop_sequence`, `bearing`) are exactly what powers "approaching"
/ "at stop" / "between stops" UX. Tranzy has none of these.

Tranzy's exclusive fields (wheelchair / bike / vehicle_type per-vehicle)
are redundant — they're already in `routes.txt` / `trips.txt` of the
static GTFS, so we get them from the SQLite for free.

## Sample comparison rows (15 vehicles in both feeds)

```
plate  route  trip (Tranzy)  trip (GTFS-RT)         Δm     T_age  RT_age
─────  ─────  ─────────────  ──────────────────────  ─────  ─────  ──────
821    79     79_1           79_0_LV_5_0705            0.2   35s    35s
822    45     45_1           45_1_LV_9_0721          286.1   36s    93s
823    13     13_1           13_1_LV_12_0736           0.3   49s    49s
824    78     78_1           78_1_LV_9_0706            0.3   39s    39s
825    23     23_1           23_1_LV_14_0715           0.1   45s    45s
827     8      8_0            8_0_LV_12_0721        1103.5   45s   304s
829    24     24_1           24_1_LV_17_0717           0.6   39s    39s
830    13     13_0           13_0_LV_14_0713         954.2   42s   189s
831    24     24_0           24_0_LV_19_0734         391.5   35s   160s
832    —      —              121_1_LV_3_0600           0.4   35s    35s
833    42     42_0           42_0_LV_6_0714          737.0   39s   190s
834    29     29_0           29_0_LV_17_0724         354.1   39s    98s
837    45     45_0           45_0_LV_4_0615            0.3   4857s  4857s
841    58     58_1           58_1_LV_14_0723         419.0   36s   161s
850    70     70_0           70_0_LV_3_0720            0.3   48s    48s
```

Notes from the sample:
- Plate `832` has no trip assignment in Tranzy but a full one in GTFS-RT
  (`121_1_LV_3_0600`). Tranzy's trip_id format loses information.
- Plate `837` is identically stuck at 4857 s (~81 min) old in both
  feeds — both inherit upstream AVL quirks. The reconciler's "ghost
  after 5 min stale" rule applies to both sources equally.

## RT feed cadence (independently validated)

Sampled 7 times over 60 s ([sample 0 → 6 in
gtfs-rt-decode/sample.mjs](../../../neary)):

- Server regenerates the GTFS-RT feed exactly every **10 s** (header
  `timestamp` advances 10 s per sample).
- Per-vehicle AVL updates land every **~1–2 min** upstream (27% of
  vehicles got a newer `vehicle.timestamp` inside a 60 s window).
- ~10% long-tail of vehicles > 5 min stale (parked / transponder /
  off-route) — handled by reconciler as `ghost`.

## Verdict

**Use GTFS-RT as the primary live source. Make Tranzy an optional
advanced signal.**

Primary (default, all users):
- GTFS-RT polling every 15 s (matches server regen + leaves headroom)
- Reconciler joins via canonical trip_id directly to SQLite
- No API key, no rate limit, standard format

Optional (advanced setting, with API key):
- Tranzy polling every 30 s as a second signal
- Reconciler cross-checks: when both sources see a vehicle, position
  reliability is "high"; when only one does, "medium"; when schedule
  expects a vehicle and neither source sees it, it's a confirmed `ghost`
  rather than "RT just hasn't caught up yet"
- Tranzy fleet completeness (the 251 yard buses) is opt-in via a
  debug toggle, not shown by default

The expanded `Vehicle` discriminated union for multi-source confidence
is documented in [plan.md §3](plan.md#3-architecture) under "Vehicle
taxonomy is data".

## Security note (one-off)

A Tranzy API key was pasted into the chat history during this
analysis. The key is **not** committed to this repo or its history.
Rotate it at <https://apps.tranzy.ai/accounts/my-apps>.
