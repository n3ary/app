// Shared boards-and-assembly controller for /+page.svelte (GPS-based
// nearby stations) and /station/[id]/+page.svelte (URL-id single
// station). The two pages have identical "render a list of assembled
// station boards" needs but different selection mechanisms — this
// module owns the shared half: page state for boards, the per-tick
// worker call that produces GPS-adjusted vehicles per stop, and the
// per-board $derived.by that buckets the result for display.
//
// The caller (page) owns selection — it calls setBoards() from its own
// $effect with whatever boards came back from its query. The caller
// also owns route-filter state (since /'s is per-stop and /station's
// is single) and passes a getter via routeFilterFor.
//
// Architecture note: the heavy merge + GPS-ETA half of the pipeline
// runs worker-side now (`repo.assembleLiveBoards`), so shape polylines
// and stop-distance arrays never cross the IPC boundary. Main thread
// receives Vehicle[] per stop with `kind` and ETA already finalised
// and only does the final filter + bucket via `bucketLiveBoardMemo`.

import { untrack } from 'svelte';
import { getGtfsRepo } from '$lib/data/gtfs/repo';
import type { StopWithDistance } from '$lib/data/gtfs/types';
import {
  bucketLiveBoardMemo,
  routesFromVehicles,
  type BoardRow,
} from '$lib/domain/stationBoard';
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
   * Called per-stop during bucketing. Read reactive state inside so the
   * $derived.by traces it (e.g. `() => routeFilters[stopId] ?? null`).
   */
  routeFilterFor: (stopId: number) => string | null;
}): StationBoardsController {
  let boards = $state<StationBoardInput[] | null>(null);
  // Per-stop vehicles after worker-side merge + GPS-ETA. Keyed by
  // stop.id. Empty record before the first worker call resolves.
  let livePerStop = $state<Record<number, Vehicle[]>>({});

  // Worker-side assembly. Reacts to either a boards change or new
  // reconciled snapshot (the worker uses the latest snapshot it has
  // broadcast, so main + worker agree on freshness). The async IIFE's
  // write to `livePerStop` cannot retrigger the effect because we
  // never read it here.
  $effect(() => {
    if (!boards || boards.length === 0) {
      if (Object.keys(untrack(() => livePerStop)).length > 0) livePerStop = {};
      return;
    }
    // Touch reconciledVehiclesStore so the effect re-fires per live tick.
    void reconciledVehiclesStore.vehicles;
    const nowMs = Date.now();
    const inputs = boards.map((b) => ({
      stopId: b.stop.id,
      stop: { lat: b.stop.lat, lon: b.stop.lon },
      vehicles: b.vehicles,
    }));
    (async () => {
      try {
        const repo = getGtfsRepo();
        const out = await repo.assembleLiveBoards(inputs, nowMs);
        const next: Record<number, Vehicle[]> = {};
        for (const { stopId, vehicles } of out) next[stopId] = vehicles;
        livePerStop = next;
      } catch {
        // Soft-fail: keep last good livePerStop. Scheduled vehicles
        // still render via the fallback in the derived below.
      }
    })();
  });

  const feedTimezone = $derived(feedsStore.activeTimezone);
  const nowMs = $derived(nowTicker.ms);

  const assembled = $derived.by<AssembledStationBoard[]>(() => {
    if (!boards) return [];
    return boards.map(({ stop, vehicles }) => {
      // Until the first worker response lands for this stop, fall
      // back to scheduled-only vehicles so the card paints something.
      const live = livePerStop[stop.id] ?? vehicles;
      return {
        stop,
        vehicles,
        rows: bucketLiveBoardMemo({
          vehicles: live,
          stop,
          prefs: userPrefs,
          nowMs,
          timezone: feedTimezone,
          routeFilterId: opts.routeFilterFor(stop.id),
        }),
        allRoutes: routesFromVehicles(vehicles),
      };
    });
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
