<!--
  Station detail view — by-id entry point. Same render path as the
  Stations landing page (assembleLiveBoard → StationCard) but the stop
  is resolved by URL param instead of GPS + selector. Used today by
  type-the-id, in the future by map tap-to-inspect.

  No GPS dependency, no location store touched. Refresh + live polling
  flow exactly as on /.
-->
<script lang="ts">
  import { page } from '$app/state';
  import {
    Card, CardContent, NoFeedState, Spinner, Stack, StationCard, Typography,
  } from '$lib/ui';
  import { getGtfsRepo } from '$lib/data/gtfs/repo';
  import type { StopWithDistance } from '$lib/data/gtfs/types';
  import { getUpcomingStops } from '$lib/data/gtfs/upcomingStops';
  import { assembleLiveBoard, routesFromVehicles } from '$lib/domain/stationBoard';
  import { DEFAULT_CONFIG } from '$lib/domain/config';
  import { tripIdsFromVehicles } from '$lib/domain/tripIdsFromVehicles';
  import { buildOrphanLiveVehicle } from '$lib/domain/orphanLive';
  import type { Vehicle } from '$lib/domain/types';
  import { feedsStore } from '$lib/stores/feedsStore.svelte';
  import { liveVehiclesStore } from '$lib/stores/liveVehiclesStore.svelte';
  import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
  import { nowTicker } from '$lib/stores/nowTicker.svelte';
  import { refreshBus } from '$lib/stores/refreshBus.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';

  // Arrivals window owned by DEFAULT_CONFIG (shared with the
  // Stations / home view). 18 h from any wall-clock time covers
  // the rest of the GTFS service day.
  const ARRIVALS_WINDOW_MIN = DEFAULT_CONFIG.arrivalsWindowMin;

  const stopId = $derived(Number(page.params.id));
  const stopIdValid = $derived(Number.isFinite(stopId) && stopId > 0);

  let board = $state<{ stop: StopWithDistance; vehicles: Vehicle[] } | null>(null);
  let shapes = $state<Record<string, Array<{ lat: number; lon: number }>>>({});
  let originRouteIds = $state<Set<string>>(new Set());
  let error = $state<string | null>(null);
  let notFound = $state(false);
  let routeFilter = $state<string | null>(null);

  // Feed tz + wall clock both live in shared stores (feedsStore /
  // nowTicker) so every consumer pages on a single source.
  const feedTimezone = $derived(feedsStore.activeTimezone);
  const nowMs = $derived(nowTicker.ms);

  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    if (!stopIdValid) return;
    // Subscribe to manual-refresh ticks (header refresh button).
    refreshBus.tick;
    const sid = stopId;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const result = await repo.getStationBoard(sid, Date.now(), ARRIVALS_WINDOW_MIN);
        if (!result) {
          notFound = true;
          board = null;
        } else {
          notFound = false;
          board = result;
          error = null;
          routeFilter = null; // reset on every refresh
          // Fetch shapes + origin-route membership in parallel.
          const tripIds = tripIdsFromVehicles(result.vehicles);
          const [fetchedShapes, originIds] = await Promise.all([
            tripIds.length > 0 ? repo.getShapesForTrips(tripIds) : Promise.resolve({}),
            repo.getOriginRoutesAtStop(sid),
          ]);
          shapes = fetchedShapes;
          originRouteIds = new Set(originIds);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  // Orphan live vehicles: live observations whose trip_id wasn't
  // surfaced by the schedule scanner, but whose route is one this
  // station serves. We need the trip's shape to project the bus onto
  // it and compute ETA — top up the existing shapes cache when a new
  // orphan trip_id appears (worker caches by shape_id, so re-asking
  // for a known shape is O(1)).
  $effect(() => {
    if (!board) return;
    const scheduledTripIds = new Set(
      board.vehicles.map((v) => v.schedule?.tripId).filter(Boolean) as string[],
    );
    const routesById = new Map(board.vehicles.map((v) => [v.route.id, v.route]));
    const missing = Array.from(
      new Set(
        liveVehiclesStore.observations
          .filter(
            (o) =>
              o.tripId &&
              !scheduledTripIds.has(o.tripId) &&
              routesById.has(o.routeId) &&
              !(o.tripId in shapes),
          )
          .map((o) => o.tripId),
      ),
    );
    if (missing.length === 0) return;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const extra = await repo.getShapesForTrips(missing);
        shapes = { ...shapes, ...extra };
      } catch {
        // Soft-fail: orphan rows will just not appear this tick.
      }
    })();
  });

  const orphanVehicles = $derived.by<Vehicle[]>(() => {
    if (!board) return [];
    const scheduledTripIds = new Set(
      board.vehicles.map((v) => v.schedule?.tripId).filter(Boolean) as string[],
    );
    // (routeId, directionId) → { route, headsign } for the orphan
    // pipeline. Direction-keyed so:
    //   (a) we don't surface a bus heading e.g. dir 1 on a station
    //       that's only served by dir 0 of that route, and
    //   (b) we always have a sibling headsign to copy (GTFS-RT
    //       vehicle positions don't carry headsign themselves).
    // Trips on the same route+direction share their destination
    // headsign in every feed we've seen.
    const siblingByKey = new Map<string, { route: typeof board.vehicles[number]['route']; headsign: string | undefined }>();
    for (const v of board.vehicles) {
      if (v.schedule?.directionId !== 0 && v.schedule?.directionId !== 1) continue;
      const key = `${v.route.id}|${v.schedule.directionId}`;
      const existing = siblingByKey.get(key);
      if (!existing || (!existing.headsign && v.headsign)) {
        siblingByKey.set(key, { route: v.route, headsign: v.headsign });
      }
    }
    const stationPos =
      typeof board.stop.lat === 'number' && typeof board.stop.lon === 'number'
        ? { lat: board.stop.lat, lon: board.stop.lon }
        : null;
    if (!stationPos) return [];
    const out: Vehicle[] = [];
    for (const o of liveVehiclesStore.observations) {
      if (!o.tripId || scheduledTripIds.has(o.tripId)) continue;
      const sibling = siblingByKey.get(`${o.routeId}|${o.directionId}`);
      if (!sibling) continue;
      const shape = shapes[o.tripId];
      if (!shape) continue;
      const v = buildOrphanLiveVehicle(o, sibling.route, shape, stationPos, sibling.headsign);
      if (v) out.push(v);
    }
    return out;
  });

  const mergedVehicles = $derived<Vehicle[]>(
    board ? [...board.vehicles, ...orphanVehicles] : [],
  );
</script>

<div class="mx-auto max-w-3xl px-4 py-6">
  {#if userPrefs.feedId == null}
    <NoFeedState />
  {:else if !stopIdValid}
    <Card>
      <CardContent>
        <Typography variant="h6" class="text-[color:var(--color-danger)]">Invalid stop id</Typography>
      </CardContent>
    </Card>
  {:else if error}
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" class="text-[color:var(--color-danger)]">Failed to load station</Typography>
          <Typography variant="caption">{error}</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else if notFound}
    <Card>
      <CardContent>
        <Typography variant="h6">Station #{stopId} not found in the current feed.</Typography>
      </CardContent>
    </Card>
  {:else if !board}
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} align="center">
          <Spinner size={16} />
          <Typography variant="caption">Loading station…</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else}
    {@const rows = assembleLiveBoard({
      vehicles: mergedVehicles,
      stop: board.stop,
      liveObservations: liveVehiclesStore.observations,
      shapes,
      prefs: userPrefs,
      nowMs,
      timezone: feedTimezone,
      routeFilterId: routeFilter,
    })}
    <StationCard
      station={{ id: board.stop.id, name: board.stop.name, lat: board.stop.lat, lon: board.stop.lon }}
      rows={rows}
      allRoutes={routesFromVehicles(board.vehicles)}
      selectedRouteId={routeFilter}
      onRouteClick={(rid) => (routeFilter = routeFilter === rid ? null : rid)}
      favoriteRouteIds={favoritesStore.routeIds}
      originRouteIds={originRouteIds}
      getUpcomingStops={getUpcomingStops}
      expanded={true}
      ontoggle={() => {}}
    />
  {/if}
</div>
