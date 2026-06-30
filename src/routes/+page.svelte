<!--
  Stations — the default landing route. Until a feed is selected, shows
  an empty state pointing to Settings. With a feed selected, fetches the
  nearest stops (GPS if the user has opted in, else the active feed's
  published center) and renders a StationCard list with the bucketed
  arrivals board for each.

  GPS is strictly opt-in (#110). The browser permission dialog is never
  triggered without an explicit user gesture — the in-page banner below
  is one entry point, the header GPS dot is the other. Returning users
  who opted in previously have the watch auto-resumed by +layout.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { MapPin } from 'lucide-svelte';
  import {
    Box, Button, Card, CardContent, NoFeedState, Spinner, Stack, StationCard,
    Typography,
  } from '$lib/ui';
  import { getGtfsRepo } from '$lib/data/gtfs/repo';
  import { getUpcomingStops } from '$lib/data/gtfs/upcomingStops';
  import { createStationBoardsController } from '$lib/data/stationBoardsController.svelte';
  import type { StationBoardInput } from '$lib/data/stationBoardsController.svelte';
  import { selectBoardsForView } from '$lib/domain/stationSelection';
  import { DEFAULT_CONFIG } from '$lib/domain/config';
  import { isPositionInFeedBbox, distanceToFeedBboxKm } from '$lib/domain/feedCoverage';
  import { feedsStore } from '$lib/stores/feedsStore.svelte';
  import { locationStore } from '$lib/stores/locationStore.svelte';
  import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
  import { refreshBus } from '$lib/stores/refreshBus.svelte';
  import { statusBus } from '$lib/stores/statusBus.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';

  // Query a single, wide radius that covers BOTH the primary nearby
  // search and the favorite-route fallback. The domain selector then
  // narrows to 1–2 stops per the rules in lib/domain/stationSelection.
  // KISS: one round-trip; the selector handles which to show.
  const SEARCH_RADIUS_M = Math.max(
    DEFAULT_CONFIG.nearbyRadiusM,
    DEFAULT_CONFIG.favoriteFallbackRadiusM,
  );
  const MAX_STATIONS = 25;
  // Arrivals window owned by DEFAULT_CONFIG (shared with the
  // Station-detail view) — 18 h from any wall-clock time covers the
  // rest of the GTFS service day; StationCard caps display rows so
  // overshoot is free.
  const ARRIVALS_WINDOW_MIN = DEFAULT_CONFIG.arrivalsWindowMin;

  // GPS state, four-way:
  //   not-opted-in — user has never tapped Enable; banner drives opt-in.
  //   pending      — opted in, watch active, no first fix yet.
  //   available    — we have a position.
  //   unavailable  — geolocation unsupported, or permission denied / errored.
  type GpsState = 'not-opted-in' | 'pending' | 'available' | 'unavailable';
  const gpsState = $derived.by<GpsState>(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unavailable';
    if (locationStore.position) return 'available';
    if (locationStore.permission === 'denied') return 'unavailable';
    if (locationStore.error && !locationStore.position) return 'unavailable';
    if (!userPrefs.gpsOptedIn) return 'not-opted-in';
    return 'pending';
  });

  // Active feed for fallback anchor (when GPS isn't available) and for
  // the bbox-distance hint in the empty state.
  const activeFeed = $derived(feedsStore.byId(feedsStore.boundFeedId));

  // Fallback anchor when GPS isn't available: the feed's published
  // bbox centroid (`Feed.center`, populated by neary-gtfs). Boards stay
  // pinned to this until the user opts in or grants permission.
  const fallbackAnchor = $derived(activeFeed?.center ?? null);

  // Round to 4 decimals so GPS jitter doesn't refire the SQLite query.
  const queryLat = $derived(
    locationStore.position
      ? Math.round(locationStore.position.coords.latitude * 1e4) / 1e4
      : fallbackAnchor
        ? Math.round(fallbackAnchor.lat * 1e4) / 1e4
        : null,
  );
  const queryLon = $derived(
    locationStore.position
      ? Math.round(locationStore.position.coords.longitude * 1e4) / 1e4
      : fallbackAnchor
        ? Math.round(fallbackAnchor.lon * 1e4) / 1e4
        : null,
  );

  let boards = $state<StationBoardInput[] | null>(null);
  let boardsError = $state<string | null>(null);
  let expandedStopId = $state<number | null>(null);
  // Per-stop route filter — click a route badge on a StationCard to scope
  // its board to that route; click again to clear. Lives in page state
  // (not in a store) because the spec is: temporary, view-only, cleared
  // on view-swap (this component remounts) or refresh (we reset below).
  let routeFilters = $state<Record<number, string | null>>({});
  function toggleRouteFilter(stopId: number, routeId: string) {
    routeFilters[stopId] = routeFilters[stopId] === routeId ? null : routeId;
  }

  // Shared controller owns shapes cache, the shape-sync $effect, and the
  // per-board assembly. We just hand it the boards we select and the
  // per-stop route filter getter; it exposes `assembled` + totals.
  const boardsController = createStationBoardsController({
    routeFilterFor: (stopId) => routeFilters[stopId] ?? null,
  });
  $effect(() => { boardsController.setBoards(boards); });

  // Surface GPS state on the global StatusBar instead of a page-level
  // card — the StatusBar already exists for cross-cutting loading info
  // (per plan §4) and the schedule-bind effect in +layout.svelte uses
  // the same channel. KISS / DRY.
  //
  // `untrack` is required around the bus calls because `push` reads
  // `entries` (findIndex for dedupe), so without it the effect would
  // re-run on every push and loop infinitely — effect_update_depth.
  $effect(() => {
    const pending = gpsState === 'pending';
    untrack(() => {
      if (pending) {
        statusBus.push({
          id: 'gps-pending',
          kind: 'loading',
          message: 'Determining your location…',
        });
      } else {
        statusBus.dismiss('gps-pending');
      }
    });
  });

  $effect(() => {
    // Wait until the worker has actually been bound to the user's chosen
    // feed (set by +layout after repo.setFeed resolves). Without this gate
    // the page can race the bind and briefly flash a 'not bound' error.
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    // Wait for GPS to resolve in one direction or the other so we don't
    // briefly render the fallback list during the pre-fix window.
    if (gpsState === 'pending') return;
    // Need an anchor — either GPS position or feed.center. The feed's
    // center is guaranteed by the neary-gtfs schema; missing means a
    // misbuilt feed and we bail with a visible error.
    if (queryLat == null || queryLon == null) {
      boardsError = "Active feed has no center coordinate. Re-pick the feed in Settings.";
      return;
    }
    // Subscribe to manual-refresh ticks so the header refresh button
    // re-fires this effect.
    refreshBus.tick;
    const lat = queryLat;
    const lon = queryLon;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const candidates = await repo.getStationBoardsNear(
          lat, lon, SEARCH_RADIUS_M, MAX_STATIONS, Date.now(), ARRIVALS_WINDOW_MIN,
        );
        // The worker already filters out stops with zero scheduled
        // service ever (legacy / terminus-pad entries). Stops whose
        // last bus of the day has departed still flow through here
        // with an empty `vehicles` list — that's a real piece of
        // information ("the stop is here, no service right now"),
        // so the selector + card both handle empty vehicle lists.
        const selection = selectBoardsForView({
          candidates,
          config: DEFAULT_CONFIG,
          favoriteRouteIds: favoritesStore.routeIds,
        });
        boards = selection.boards;
        boardsError = null;
        // Route filters are view-only: reset on every refresh / re-fetch.
        routeFilters = {};
        expandedStopId = selection.expandedStopId;
      } catch (e) {
        boardsError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  // Banner visibility. Shown when:
  //   - GPS opt-in is available (not denied / unsupported) AND
  //     the user hasn't dismissed AND hasn't opted in yet, OR
  //   - permission was explicitly denied (regardless of dismissal —
  //     denial is a settings-level instruction the user needs to see).
  const showOptInBanner = $derived(
    gpsState === 'not-opted-in' && userPrefs.gpsPromptDismissedAt == null,
  );
  const showDeniedBanner = $derived(
    gpsState === 'unavailable' && locationStore.permission === 'denied',
  );
</script>

<div class="mx-auto max-w-3xl px-4 py-6">
  {#if userPrefs.feedId == null}
    <NoFeedState
      message="Neary needs a transit feed to load schedules and routes. Pick one in Settings to get started. The data downloads once and is cached for offline use — no account needed."
    />
  {:else if boardsError}
    <Card>
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="h6" class="text-[color:var(--color-danger)]">Failed to load nearby stations</Typography>
          <Typography variant="caption">{boardsError}</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else if !boards}
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} align="center">
          <Spinner size={16} />
          <Typography variant="caption">Loading nearby stations…</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else if boards.length === 0}
    {@const activeFeed = feedsStore.byId(feedsStore.boundFeedId)}
    {@const userPos = locationStore.position
      ? { lat: locationStore.position.coords.latitude, lon: locationStore.position.coords.longitude }
      : null}
    {@const outsideBbox = activeFeed && userPos && gpsState === 'available'
      ? !isPositionInFeedBbox(userPos, activeFeed)
      : false}
    {@const distanceKm = outsideBbox && activeFeed && userPos
      ? Math.round(distanceToFeedBboxKm(userPos, activeFeed))
      : 0}
    <Card>
      <CardContent>
        {#if outsideBbox && activeFeed}
          <Stack spacing={1}>
            <Typography variant="h6">Wrong feed for your location</Typography>
            <Typography variant="caption">
              You're about {distanceKm} km from the <strong>{activeFeed.name}</strong> service area.
              Pick a feed that covers your location in <a href="/settings" class="underline">Settings</a>.
            </Typography>
          </Stack>
        {:else}
          <Stack spacing={1}>
            <Typography variant="h6">No nearby stations</Typography>
            <Typography variant="caption">
              No stops within {DEFAULT_CONFIG.favoriteFallbackRadiusM} m of {gpsState === 'available' ? 'your current position' : 'the fallback location'}.
              Try moving closer to a transit corridor or enabling location.
            </Typography>
          </Stack>
        {/if}
      </CardContent>
    </Card>
  {:else}
    <Stack spacing={1}>
      {#if showOptInBanner}
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} align="center">
                <MapPin size={16} class="shrink-0 text-[color:var(--color-primary)]" />
                <Typography variant="h6">See stops near you</Typography>
              </Stack>
              <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                Neary uses your location to sort nearby stations and put real-time arrivals
                closer to you first. We never store it, never send it to a server, and never
                track you in the background.
              </Typography>
              <Stack direction="row" spacing={1} align="center" class="pt-1">
                <Button variant="contained" size="small" onclick={() => locationStore.enable()}>
                  Enable location
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onclick={() => { userPrefs.gpsPromptDismissedAt = Date.now(); }}
                >
                  Not now
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      {:else if showDeniedBanner}
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} align="center">
              <MapPin size={14} class="shrink-0 text-[color:var(--color-fg-muted)]" />
              <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                Location is off in your browser settings. Open Settings → Site permissions →
                Location to allow it.
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      {/if}
      {#if boardsController.rawTotal > 0 && boardsController.filteredTotal === 0}
        <Box class="px-2 py-1 text-xs text-[color:var(--color-warning)]">
          {boardsController.rawTotal} vehicles found but all hidden by your filters
          (check Settings → Display: drop-off-only, schedule-only,
          departed).
        </Box>
      {/if}
      {#each boardsController.assembled as { stop, vehicles, rows, allRoutes } (stop.id)}
        <StationCard
          station={{ id: stop.id, name: stop.name, distance: stop.distance, lat: stop.lat, lon: stop.lon }}
          rows={rows}
          allRoutes={allRoutes}
          selectedRouteId={routeFilters[stop.id] ?? null}
          onRouteClick={(rid) => toggleRouteFilter(stop.id, rid)}
          favoriteRouteIds={favoritesStore.routeIds}
          getUpcomingStops={getUpcomingStops}
          expanded={expandedStopId === stop.id}
          ontoggle={() => (expandedStopId = expandedStopId === stop.id ? null : stop.id)}
        />
      {/each}
    </Stack>
  {/if}
</div>
