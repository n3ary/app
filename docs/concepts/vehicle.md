# Vehicle

Every row in a station/schedule/map view is one `Vehicle`. The `kind`
field is a discriminated union encoding **how we know where it is**.

Source: [src/lib/domain/types.ts](../../src/lib/domain/types.ts) is authoritative.

## Kinds

| Kind | Meaning |
|---|---|
| `scheduled` | In the schedule; not yet active or no live match |
| `predicted` | Schedule says it should be running, no live source reports it (older design — see notes) |
| `live` | Live GPS, no schedule match |
| `reconciled` | One live source matched to a scheduled trip |
| `corroborated` | Two live sources agree on this trip (only when Tranzy key is set) |

The visual taxonomy and bucket interaction live in [specs/vehicles-and-views.md](../specs/vehicles-and-views.md).

## Why a discriminated union

- One component per kind, used identically in list / schedule / map.
- Schedule-only detection lives in the reconciler, not in JSX.
- The UI never has to guess what data is present — the type system enforces it.

## Per-row metadata

Each entry also carries:

- `confidence: 'high' | 'medium' | 'low'` → see [confidence.md](confidence.md).
- `liveSources: LiveSource[]` (when the kind has live data) → records which feeds confirm it.
- `schedule.isFirstStop` → this row's target stop IS the trip's first stop (origin). Named from the row's POV, not the vehicle's: the row represents the origin, the bus itself may be anywhere. Schedule is authoritative when true (the bus hasn't started moving yet).
- `schedule.isLastStop` → this row's target stop IS the trip's last stop (terminus). Suppresses the upcoming-stops expansion.
- `schedule.tripPhase` → see "Trip phase" below.

## Trip phase

On rows where `isFirstStop === true`, `schedule.tripPhase` classifies
how this origin departure relates to `now` on its route:

| Value | Meaning |
|---|---|
| `next` | The next departure on this route that hasn't left yet |
| `last` | The most recent departure that has left and is still running |
| `on-route` | An earlier departure that has left and is still running (not the most recent) |
| `later` | Any future origin departure that is not `next` |

Exactly one `next` and at most one `last` per route. Tie-break on equal
departure times by `tripId` lexicographic order. Undefined on non-origin
rows.

The role is recomputed on every snapshot regeneration because it is a
function of `now`: at 14:59 a trip is `next`, at 15:00 (once its
scheduled departure passes) it becomes `last`, the previous `last`
demotes to `on-route`, and the next `later` row promotes to `next`.

Orthogonal to `kind` and to [arrival-buckets](arrival-buckets.md). A
`next` row can carry GPS (`kind: 'reconciled'`) when the bus is at
the depot already broadcasting; `last` and `on-route` rows almost
always do.
