# Prediction

ETA estimation — what the app shows for "in X minutes" or "Departed".

## Current state

Shipped:
- Schedule-spine prediction: ETA = scheduled time, optionally corrected by
  reconciled live observations.
- Shape projection: `predictEta` projects live GPS onto the route polyline
  and produces a distance-along-shape, used for downstream stops on the
  same trip.
- Reconciler matches live vehicles to scheduled rows with adaptive
  tolerance, bipartite greedy matching, direction-id resolution (Cluj
  feed bug workaround — see [../specs/live-data-pipeline.md](../specs/live-data-pipeline.md)).

Known gap: today's prediction uses **schedule as the spine** (regression
vs v1's GPS-spine cascade) and the UI update cycles are opaque — a manual
refresh can take up to ~30 s to flip ETA labels. Both addressed by the
active plan: [../plan/prediction-v2.md](../plan/prediction-v2.md).

Source: [src/lib/domain/predictEta.ts](../../src/lib/domain/predictEta.ts),
[src/lib/domain/shapeProjection.ts](../../src/lib/domain/shapeProjection.ts),
[src/lib/domain/reconcile.ts](../../src/lib/domain/reconcile.ts).

## The three stages we're moving to

| Stage | Where | What |
|---|---|---|
| A | build-time, in neary-gtfs | Produce a better schedule: shape-aware distance, time-of-day speed profile, per-stop dwell, populate `shape_dist_traveled` |
| B | runtime, no GPS | Consume `shape_dist_traveled` to collapse buildTripShapePlan cost |
| C | runtime, with GPS | Per-segment speed cascade (vehicle speed → fleet avg → time-of-day default → city-centre heuristic → static fallback) |

Full design and roadmap: [../plan/prediction-v2.md](../plan/prediction-v2.md).

## Three loops

The app runs three independent loops; the manual refresh button fires all three
for ~150 ms end-to-end responsiveness:

| Loop | Cadence | What |
|---|---|---|
| L1 — live poll | 15 s | GTFS-RT vehicle positions |
| L2 — UI tick | 15 s | Re-evaluate ETAs / buckets against new wall-clock |
| L3 — manual refresh | on tap | User-triggered L1 + L2 |

## Confidence interaction

Predicted rows without GPS confirmation render at `low` confidence
(dimmed) per [confidence.md](confidence.md). At the trip origin the
schedule is authoritative and the row stays at full opacity even without
GPS — the bus is parked, not late.
