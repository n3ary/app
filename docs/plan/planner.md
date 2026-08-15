# Plan: Planner (map-first journey planning)

Status: **draft / not started in app**. Work branch: `feat/planner-prototype`.
Fills the reserved `/planner` route (see
[system-overview.md](../architecture/system-overview.md) -- "Phase 8").

Scope: **jos + transport public** (bus / trolleybus / tram). From A to B ->
ranked itineraries with which line, transfers, board/arrival times, wait at
transfers, total duration, and walking to/from/between stops. **No car/bike.**

## What the prototype already proved (de-risking)

A throwaway Python prototype (outside the repo, `~/Downloads/n3ary/planner-proto/`)
runs against the real Cluj GTFS and validated end-to-end, so the app work is
integration, not research:

- **RAPTOR** over GTFS gives clean, few-transfer itineraries in <0.5 s.
- Multi-modal labels (tram=route_type 0, trolley=11, bus=3) -- all present in the feed.
- Real alternatives (distinct by line-combination), date/service handling (LV/S/D).
- Real pedestrian walking (via Valhalla) makes access/egress **feasible** -- the
  key learning: straight-line walking wrongly proposes crossing fields; street
  distance fixes it and keeps valid farther-stop options.
- Address/POI search via Photon; reverse geocoding (coords -> street) via Nominatim.

## Architecture decisions (confirm before coding)

Neary is an offline-first static PWA; the planner should honor that.

1. **Transit routing -> client-side RAPTOR in the GTFS worker.** No new backend;
   runs over the SQLite already in OPFS; works offline; feed-agnostic. (Recommended.)
2. **Pedestrian walking (access / egress / transfer).**
   - MVP (ship in B): straight-line via existing `getStopsNear`, tight radius.
   - Real streets (C): a routing service (self-host Valhalla/OSRM on the Hetzner
     VM that already serves gtfs-rt, or an online API). Keep the walk-cost behind
     an interface so B ships without it and C swaps it in.
3. **Destination search.**
   - MVP (ship in B): stop search (reuse `searchStops`) + tap-on-map.
   - Addresses/POI ("Regina Maria") (C): a geocoder (self-host Photon/Nominatim or
     online) -- inherently needs a service, conflicts with pure-offline; decide in C.

Everything network-dependent (walk routing, geocoding) is a **C** concern; **B**
ships a fully offline planner (stop->stop + straight-line walk) that is already useful.

## Implementation (files, concrete)

### B1 -- Engine (pure TS, unit-tested first)
- `src/lib/domain/raptor.ts` -- pattern preprocessing (group trips by identical
  stop sequence) + RAPTOR rounds + journey reconstruction. Pure, framework-free,
  feed-agnostic. Mirror the validated prototype (`planner-proto/plan.py`).
- `src/lib/domain/raptor.test.ts` -- fixtures + expected itineraries (vitest),
  same cases the prototype exercises (direct, 1-transfer, wait times, service days).
- Types: `Journey`, `Leg = WalkLeg | TransitLeg` -- colocate in
  `src/lib/domain/types.ts` (where the Vehicle union lives).

### B2 -- Worker query + RPC
- `src/lib/workers/gtfs/queries/planner.ts` -- `planJourney(db, opts)`: load
  patterns (cache per feed, like `shapeCache.ts`), pull active services
  (`activeServices.ts`), run `domain/raptor.ts`, hydrate stops/routes for legs.
- Wire into `src/lib/workers/gtfs.worker.ts` (`api.planJourney`) and add the
  signature to `GtfsRepo` in `src/lib/data/gtfs/types.ts`. Main thread calls it
  via `getGtfsRepo()` (`src/lib/data/gtfs/repo.ts`) -- never the worker directly.
- Walk-cost interface: `planJourney` takes access/egress candidate stops
  (`getStopsNear`) with a pluggable cost fn (haversine now; street later).

### B3 -- UI
- `src/routes/planner/+page.svelte` -- from/to inputs, time/day, results list,
  Leaflet map (reuse the map setup from `src/routes/map` +
  `src/lib/composables/useRouteMapView.svelte.ts`).
- Draw transit legs along the real shape via `getShapeForRouteDir` (nicer than the
  prototype's stop-polyline); walk legs dashed.
- Origin defaults to GPS (`src/lib/stores/gps`), like `getStationBoardsNear`.
- Match theme/i18n (`src/lib/i18n`), bits-ui primitives, lucide icons.

### B4 -- Polish / integration
- Fold live delays into times via the existing reconciled pipeline
  (`reconciledVehiclesStore` / `livePipeline.ts`) -- schedule -> live arrivals.
- Deep-linkable `/planner?from=...&to=...` for shareability (path-based like other drill-downs).

## Non-functional
- RAPTOR runs in the worker; UI never blocks. Target < 1 s per query; pattern
  preprocessing once per feed load.
- Feed-agnostic: no Cluj branches (see [feed-agnostic.md](../standards/feed-agnostic.md)).
- Tests: unit-test `domain/raptor.ts` heavily (it's pure); see
  [testing.md](../standards/testing.md).

## Open questions
- Walk cost in B: pure straight-line, or a lightweight on-device penalty for
  barriers? (Prototype showed straight-line alone is misleading.)
- How many alternatives to show, and ranking (arrival vs transfers vs walk).
- Where address/POI search lands (C) and whether to self-host the geocoder.

## Milestones
- **B1** [x] engine + tests -- `src/lib/domain/raptor.ts` (+ `raptor.test.ts`, 10 cases).
- **B2** [x] worker RPC -- `queries/planner.ts` + `plannerNetwork.ts` + `planJourney` on GtfsRepo.
- **B3** [x] `/planner` UI on Leaflet; transit legs drawn on real `shapes.txt` geometry (offline).
- **B4** (wait) deep links [x] (`?from&fl&to&tl&t&d`, shareable/restorable). Live times DEFERRED
  (owner decision): global reconciled ETA is origin-relative + matched by
  (route,dir,tripStart) not trip_id, so correct per-leg live requires reusing the
  station-board recompute -- do it with in-app verification, not blind.
- **C** street walk geometry + address/POI geocoding. Needs a **hosting decision**
  (self-host Valhalla + Photon/Nominatim on the Hetzner VM vs online APIs vs
  offline stop-only). Fully prototyped in `~/Downloads/n3ary/planner-proto`
  (Valhalla pedestrian route geometry + Photon/Nominatim suggest/reverse).

## Verification note
Verified in this env only in isolation (strict `tsc` on the pure/`.ts` files;
RAPTOR unit tests pass). The `.svelte` page and the full `npm run check` / `npm test`
need the repo's private `@n3ary/gtfs-spec` (NPM_TOKEN) -- run locally to confirm:
`export NPM_TOKEN=... && pnpm install && npm run check && npm test && npm run dev`.

At completion: distill decisions into `docs/specs/planner.md`, open issues for
C items, delete this plan (see
[issue-plan-lifecycle.md](../standards/issue-plan-lifecycle.md)).
