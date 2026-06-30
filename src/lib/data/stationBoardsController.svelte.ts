// Shared boards-and-assembly controller for /+page.svelte (GPS-based
// nearby stations) and /station/[id]/+page.svelte (URL-id single
// station). The two pages have identical "render a list of assembled
// station boards" needs but different selection mechanisms — this
// module owns the shared half: page state for boards, the shape /
// stop-distance cache, the union-based shape sync $effect, and the
// per-board $derived.by that runs the assemble pipeline once.
//
// The caller (page) owns selection — it calls setBoards() from its own
// $effect with whatever boards came back from its query. The caller
// also owns route-filter state (since /'s is per-stop and /station's
// is single) and passes a getter via routeFilterFor.
//
// Standard Svelte 5 composable pattern: the runes inside this factory
// register with the calling component's lifecycle because the factory
// is invoked from a component's <script> at init.

import { untrack } from 'svelte';
import { getGtfsRepo } from '$lib/data/gtfs/repo';
import type { StopWithDistance } from '$lib/data/gtfs/types';
import { syncTripShapeCache } from '$lib/data/gtfs/tripShapeCache';
import {
  assembleLiveBoardMemo,
  routesFromVehicles,
  type BoardRow,
} from '$lib/domain/stationBoard';
import { tripIdsFromVehicles } from '$lib/domain/tripIdsFromVehicles';
import type { Route, Vehicle } from '$lib/domain/types';
import { feedsStore } from '$lib/stores/feedsStore.svelte';
import { nowTicker } from '$lib/stores/nowTicker.svelte';
import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';

export type StationBoardInput = {
  stop: StopWithDistance;
  vehicles: Vehicle[];
};

export type AssembledStationBoard = {
  stop: StopWithDistance;
  vehicles: Vehicle[];
  rows: BoardRow[];
  allRoutes: Route[];
};

export type StationBoardsController = {
  setBoards(next: StationBoardInput[] | null): void;
  readonly assembled: AssembledStationBoard[];
  readonly rawTotal: number;
  readonly filteredTotal: number;
};

export function createStationBoardsController(opts: {
  /**
   * Called per-stop during assembly. Read reactive state inside so the
   * $derived.by traces it (e.g. `() => routeFilters[stopId] ?? null`).
   */
  routeFilterFor: (stopId: number) => string | null;
}): StationBoardsController {
  let boards = $state<StationBoardInput[] | null>(null);
  let shapes = $state<Record<string, Array<{ lat: number; lon: number }>>>({});
  let stopDistancesByTrip = $state<Record<string, number[]>>({});

  // Shape sync — the single owner of `shapes` / `stopDistancesByTrip`.
  // Reacts to either a boards change or new live observations; computes
  // the union of (scheduled trip_ids on visible boards) + (gps-only
  // orphan trip_ids on visible routes); diff-fetches via the shared
  // cache helper. Reads of prev cache go through untrack so the effect
  // cannot depend on its own writes (the helper's reference-equality
  // no-op handles the steady state, this is the belt-and-braces).
  // See git log 5f368df + a32bd9f for the bug-class this avoids.
  $effect(() => {
    if (!boards) return;
    const visibleRouteIds = new Set<string>();
    const tripIds = new Set<string>();
    for (const b of boards) {
      for (const v of b.vehicles) visibleRouteIds.add(v.route.id);
      for (const tid of tripIdsFromVehicles(b.vehicles)) tripIds.add(tid);
    }
    for (const v of reconciledVehiclesStore.vehicles) {
      if (v.kind !== 'gps-only') continue;
      if (v.tripId == null) continue;
      if (!visibleRouteIds.has(v.route.id)) continue;
      tripIds.add(v.tripId);
    }
    (async () => {
      try {
        const repo = getGtfsRepo();
        const prev = untrack(() => ({ shapes, stopDistances: stopDistancesByTrip }));
        const next = await syncTripShapeCache(repo, tripIds, prev);
        if (next.shapes !== prev.shapes) shapes = next.shapes;
        if (next.stopDistances !== prev.stopDistances) stopDistancesByTrip = next.stopDistances;
      } catch {
        // Soft-fail: ETAs fall back to the sibling shape via
        // assembleLiveBoard's shapesByRouteDir, or stay as "Live".
      }
    })();
  });

  const feedTimezone = $derived(feedsStore.activeTimezone);
  const nowMs = $derived(nowTicker.ms);

  const assembled = $derived.by<AssembledStationBoard[]>(() => {
    if (!boards) return [];
    return boards.map(({ stop, vehicles }) => ({
      stop,
      vehicles,
      rows: assembleLiveBoardMemo({
        vehicles,
        stop,
        reconciledVehicles: reconciledVehiclesStore.vehicles,
        shapes,
        stopDistancesByTrip,
        prefs: userPrefs,
        nowMs,
        timezone: feedTimezone,
        routeFilterId: opts.routeFilterFor(stop.id),
      }),
      allRoutes: routesFromVehicles(vehicles),
    }));
  });
  const rawTotal = $derived(assembled.reduce((n, b) => n + b.vehicles.length, 0));
  const filteredTotal = $derived(assembled.reduce((n, b) => n + b.rows.length, 0));

  return {
    setBoards(next) { boards = next; },
    get assembled() { return assembled; },
    get rawTotal() { return rawTotal; },
    get filteredTotal() { return filteredTotal; },
  };
}
