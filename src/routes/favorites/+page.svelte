<!--
  /favorites — pick + manage favorited routes and stations.

  After #234 the page landed a shared FavoritesCard that combined
  routes + stations under one "Your favorites" header. #237 splits
  the two surfaces onto separate tabs (Routes / Stations), cascades
  the mode + network filters to the Stations tab, ranks each surface
  with context-aware ordering, and paginates the station catalog so
  national-scale feeds stay performant.

  Tabs are scoped to /favorites — the search overlay and home
  favorites card keep their merged layout. The active tab persists
  via `?tab=routes|stations` so a deep link or reload lands on the
  same surface. Scroll position is preserved per tab (stash on
  leave, restore on re-entry) so a tab swap doesn't yank the user
  to the top of the new tab.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { Heart } from 'lucide-svelte';
  import {
    Card, CardContent, Chip, Collapsible, FavoriteRouteRow, FavoriteStationRow,
    SelectFeedCard, Spinner, Stack, Tabs, TripStopList, Typography, TypeBadge,
    networkIcon, networkTextColor,
  } from '$lib/ui';
  import { getGtfsRepo } from '$lib/data/gtfs/repo';
  import type { ScheduleTripStop, StopWithDistance } from '$lib/data/gtfs/types';
  import type { Network, Route, VehicleType } from '$lib/domain/types';
  import { vehicleTypeLabel } from '$lib/domain/types';
  import { STATIONS_PAGE_SIZE } from '$lib/ui/favoritesListConstants';
  import {
    parseFavoritesTab,
    sortRoutesForPicker,
    sortStationsForPicker,
    stationsPassingFilter,
    type FavoritesTab,
  } from '$lib/domain/favoritesListLayout';
  import { scheduleWindowFor } from '$lib/domain/pipeline/timeUtils';
  import { feedsStore } from '$lib/stores/feedsStore.svelte';
  import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
  import { locationStore } from '$lib/stores/gps/locationStore.svelte';
  import { nowTicker } from '$lib/stores/nowTicker.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';

  // ── Tab state + URL deep-link ───────────────────────────────────

  function defaultTabFromPrefs(): FavoritesTab {
    const routeTs = userPrefs.lastRouteFavoritedAt;
    const stationTs = userPrefs.lastStationFavoritedAt;
    if (routeTs == null && stationTs == null) return 'routes';
    if (routeTs == null) return 'stations';
    if (stationTs == null) return 'routes';
    return stationTs > routeTs ? 'stations' : 'routes';
  }

  let activeTab = $state<FavoritesTab>(initialTab());

  function initialTab(): FavoritesTab {
    const fromUrl = parseFavoritesTab(page.url.searchParams.get('tab'));
    return fromUrl ?? defaultTabFromPrefs();
  }

  // Keep local state in sync if the URL changes via back/forward.
  $effect(() => {
    const fromUrl = parseFavoritesTab(page.url.searchParams.get('tab'));
    if (fromUrl && fromUrl !== activeTab) {
      activeTab = fromUrl;
    }
  });

  function setTab(next: FavoritesTab) {
    if (next === activeTab) return;
    stashScroll(activeTab);
    activeTab = next;
    const url = new URL(page.url);
    if (next === 'routes') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    // replaceState: tab swaps don't grow back-history.
    // noScroll + keepFocus: SvelteKit must NOT touch scroll or focus
    // — the per-tab stashed position drives restoration below.
    void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
    requestAnimationFrame(() => restoreScroll(next));
  }

  // ── Scroll preservation per tab ─────────────────────────────────

  const scrollByTab = new Map<FavoritesTab, number>();
  function stashScroll(tab: FavoritesTab) {
    if (typeof window === 'undefined') return;
    scrollByTab.set(tab, window.scrollY);
  }
  function restoreScroll(tab: FavoritesTab) {
    if (typeof window === 'undefined') return;
    const y = scrollByTab.get(tab) ?? 0;
    window.scrollTo({ top: y, behavior: 'auto' });
  }

  // ── Shared filter state (visible on both tabs) ──────────────────

  let allRoutes = $state<Route[] | null>(null);
  let allNetworks = $state<Network[]>([]);
  let error = $state<string | null>(null);
  // null = no filter; clicking the active entry deselects.
  let typeFilter = $state<VehicleType | null>(null);
  let networkFilter = $state<string | null>(null);

  function toggleType(t: VehicleType) {
    typeFilter = typeFilter === t ? null : t;
  }
  function toggleNetwork(id: string) {
    networkFilter = networkFilter === id ? null : id;
  }

  const tz = $derived(feedsStore.activeTimezone);

  // ── Routes tab state ────────────────────────────────────────────

  // Routes currently active in a lookahead window (single worker
  // round-trip — see getActiveRouteIdsInWindow). Recomputed on the
  // nowTicker; user sees fresh "running right now" each ~60s tick.
  let activeRouteIds = $state<Set<string>>(new Set());

  // Expand-stops state (lifted from the original page; same UX).
  let expandedRouteId = $state<string | null>(null);
  let routeStops = $state<Map<string, ScheduleTripStop[]>>(new Map());
  let loadingRouteId = $state<string | null>(null);
  let stopsErrorRouteId = $state<string | null>(null);

  async function toggleRouteStops(route: Route) {
    if (route.hasSchedule === false) return;
    if (expandedRouteId === route.id) {
      expandedRouteId = null;
      return;
    }
    expandedRouteId = route.id;
    stopsErrorRouteId = null;
    if (routeStops.has(route.id)) return;
    loadingRouteId = route.id;
    try {
      const repo = getGtfsRepo();
      const qp = scheduleWindowFor({
        view: 'today',
        isNight: false,
        nowMs: nowTicker.ms,
        timeZone: tz,
      });
      let trips = await repo.getRouteSchedule(route.id, 0, qp.localDate, qp.fromMin, qp.windowMin);
      if (trips.length === 0) {
        trips = await repo.getRouteSchedule(route.id, 1, qp.localDate, qp.fromMin, qp.windowMin);
      }
      if (trips.length === 0) {
        trips = await repo.getRouteSchedule(route.id, 0, qp.localDate, 0, 24 * 60);
      }
      const tripId = trips[0]?.tripId;
      if (!tripId) {
        stopsErrorRouteId = route.id;
        return;
      }
      const stops = await repo.getStopsAlongTrip(tripId);
      const next = new Map(routeStops);
      next.set(route.id, stops);
      routeStops = next;
    } catch {
      stopsErrorRouteId = route.id;
    } finally {
      loadingRouteId = null;
    }
  }

  // ── Stations tab state ──────────────────────────────────────────

  let favoriteStations = $state<StopWithDistance[]>([]);
  let favoriteStationsRoutes = $state<Record<string, Route[]>>({});
  let favoriteStationsError = $state<string | null>(null);

  // Filter-cascade scope: stop_id -> distinct routes serving the stop
  // through the feed schedule, optionally narrowed by mode + network.
  // Worker caches keyed by (mode, network) signature; main thread
  // fetches once per filter change.
  let stationsScope = $state<Record<string, Route[]>>({});
  let stationsScopeError = $state<string | null>(null);

  // Paginated "other stations" (non-favorited). One page at a time;
  // IntersectionObserver drives prefetch of the next.
  let otherStationsPage = $state<StopWithDistance[]>([]);
  let otherStationsTotal = $state<number>(0);
  let otherStationsLoading = $state<boolean>(false);
  let otherStationsError = $state<string | null>(null);

  // GPS-derived anchor (lat/lon) when available; falls back to the
  // feed's published center so distance sort is still meaningful on
  // a feed without GPS opt-in.
  const stationAnchor = $derived.by(() => {
    if (locationStore.position) {
      return {
        lat: locationStore.position.coords.latitude,
        lon: locationStore.position.coords.longitude,
      };
    }
    const feed = feedsStore.byId(feedsStore.boundFeedId);
    return feed?.center ?? null;
  });

  // ── Effects: initial loads ──────────────────────────────────────

  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const [routes, networks] = await Promise.all([
          repo.getRoutes(),
          repo.getNetworks(),
        ]);
        allRoutes = routes;
        allNetworks = networks;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  // Favorited stations — independent of the paginated "other stations"
  // list. Same pattern the previous page used (one batched
  // getStopsByIds for the favorites).
  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    const ids = favoritesStore.stationIds;
    if (ids.size === 0) {
      favoriteStations = [];
      favoriteStationsRoutes = {};
      return;
    }
    (async () => {
      try {
        const repo = getGtfsRepo();
        const resolved = await repo.getStopsByIds(Array.from(ids));
        favoriteStations = sortStationsForPicker(resolved, stationAnchor);
        const routes = await repo.getRoutesForStops(Array.from(ids));
        // Filter to scheduled routes only — chips for routes with no
        // timetable are dead links (FavoriteStationRow doc says the
        // same).
        const filtered: Record<string, Route[]> = {};
        for (const [k, list] of Object.entries(routes)) {
          const scheduled = list.filter((r) => r.hasSchedule !== false);
          if (scheduled.length > 0) filtered[k] = scheduled;
        }
        favoriteStationsRoutes = filtered;
        favoriteStationsError = null;
      } catch (e) {
        favoriteStationsError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  // Filter-cascade scope. Recomputed when mode or network filter
  // changes (the worker's LRU handles the "toggle back and forth"
  // case for free).
  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    const modes = typeFilter === null ? undefined : [typeFilter];
    const networks = networkFilter === null ? undefined : [networkFilter];
    (async () => {
      try {
        const repo = getGtfsRepo();
        stationsScope = await repo.getRoutesThroughStations({ modes, networks });
        stationsScopeError = null;
      } catch (e) {
        stationsScopeError = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  // ── Routes tab: "active right now" refresh ───────────────────────

  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    // nowTicker.ms is the dependency; the effect re-runs on every
    // tick. 60-minute lookahead matches what a rider considers
    // "running now" — a bus coming in 5 min is in scope, a bus
    // coming in 2h isn't.
    const now = nowTicker.ms;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const qp = scheduleWindowFor({
          view: 'today',
          isNight: false,
          nowMs: now,
          timeZone: tz,
        });
        const ids = await repo.getActiveRouteIdsInWindow(qp.localDate, qp.fromMin, 60);
        activeRouteIds = new Set(ids);
      } catch {
        // Best-effort; ranking just won't have the active-first
        // boost. We don't surface an error to the user — the page
        // is still usable.
      }
    })();
  });

  // ── Stations tab: paginated "other stations" ────────────────────

  // Map of "which stations the filter cascade admitted". Lazily
  // derived from `stationsScope` + the candidate page; computed per
  // page so we don't ship the entire 5k-station scope through state.
  let loadedPages = $state<StopWithDistance[][]>([]);

  // Reset pagination when filter or anchor changes (the visible
  // ordering changes, so a partially-loaded page no longer makes
  // sense). untrack: don't depend on `loadedPages` / `stationAnchor`
  // to avoid the obvious loop.
  $effect(() => {
    // Touch the inputs so the effect re-runs.
    const _scope = stationsScope;
    const _anchor = stationAnchor;
    untrack(() => {
      loadedPages = [];
      otherStationsPage = [];
      otherStationsTotal = 0;
      otherStationsError = null;
    });
    void _scope;
    void _anchor;
    void fetchNextStationsPage();
  });

  // Sentinel-driven prefetch. When the bottom sentinel enters the
  // viewport (or comes within ~factor viewports of it), load the
  // next page. Resets are handled by the filter/anchor effect above
  // emptying `loadedPages` first.
  let sentinelEl = $state<HTMLElement | null>(null);
  $effect(() => {
    if (!sentinelEl) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (otherStationsLoading) continue;
          if (otherStationsPage.length >= otherStationsTotal) continue;
          void fetchNextStationsPage();
        }
      },
      // rootMargin below 0 means "trigger when sentinel is within N
      // pixels of the bottom". 1000px ≈ 1.5 viewports at typical
      // phone heights; the page-side factor in shouldPrefetchNextPage
      // gives callers a tunable scalar.
      { rootMargin: '0px 0px 1000px 0px', threshold: 0 },
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });

  async function fetchNextStationsPage() {
    if (otherStationsLoading) return;
    if (otherStationsTotal > 0 && otherStationsPage.length >= otherStationsTotal) return;
    otherStationsLoading = true;
    otherStationsError = null;
    const offset = otherStationsPage.length;
    try {
      const repo = getGtfsRepo();
      const scopeArr = Object.keys(stationsScope);
      const result = await repo.getStationsPage({
        offset,
        limit: STATIONS_PAGE_SIZE,
        sortBy: 'distance',
        anchor: stationAnchor ?? undefined,
        scope: scopeArr.length === 0 ? undefined : scopeArr,
      });
      // De-dupe by id (the worker may return a station we've already
      // favorited on this page — those should appear in the
      // favorites section above, not duplicated in "other stations").
      const seen = new Set(otherStationsPage.map((s) => s.id));
      const filtered = result.rows.filter((s) => !seen.has(s.id));
      otherStationsPage = [...otherStationsPage, ...filtered];
      otherStationsTotal = result.total;
      loadedPages = [...loadedPages, filtered];
    } catch (e) {
      otherStationsError = e instanceof Error ? e.message : String(e);
    } finally {
      otherStationsLoading = false;
    }
  }

  // ── Derived: Routes tab lists ───────────────────────────────────

  const presentTypes = $derived.by<VehicleType[]>(() => {
    if (!allRoutes) return [];
    const set = new Set<VehicleType>();
    for (const r of allRoutes) set.add(r.type ?? 'unknown');
    return Array.from(set).sort((a, b) =>
      vehicleTypeLabel(a).localeCompare(vehicleTypeLabel(b)),
    );
  });
  const colorByType = $derived.by<Map<VehicleType, string>>(() => {
    const m = new Map<VehicleType, string>();
    if (!allRoutes) return m;
    for (const r of allRoutes) {
      const t = r.type ?? 'unknown';
      if (!m.has(t)) m.set(t, r.color);
    }
    return m;
  });

  const filteredRoutes = $derived.by<Route[]>(() => {
    if (!allRoutes) return [];
    return allRoutes.filter((r) => {
      if (typeFilter !== null && (r.type ?? 'unknown') !== typeFilter) return false;
      if (networkFilter !== null && !(r.networks?.includes(networkFilter) ?? false)) return false;
      return true;
    });
  });

  // Favorited routes bypass the filter cascade — a user who hearted
  // a metro route should still see it under "Your favorites" even
  // when the Bus filter is active. The unfiltered set is sourced
  // directly from `allRoutes` (not `filteredRoutes`).
  const favRoutes = $derived.by<Route[]>(() => {
    if (!allRoutes) return [];
    const set = new Set(favoritesStore.routeIds);
    return sortRoutesForPicker(allRoutes.filter((r) => set.has(r.id)), activeRouteIds);
  });
  const otherRoutes = $derived.by<Route[]>(() => {
    return sortRoutesForPicker(
      filteredRoutes.filter((r) => !favoritesStore.hasRoute(r.id) && r.hasSchedule !== false),
      activeRouteIds,
    );
  });
  const noScheduleRoutes = $derived.by<Route[]>(() => {
    return sortRoutesForPicker(
      filteredRoutes.filter((r) => !favoritesStore.hasRoute(r.id) && r.hasSchedule === false),
      activeRouteIds,
    );
  });

  // ── Derived: Stations tab lists ─────────────────────────────────

  // Favorited stations: always shown regardless of the filter
  // cascade. Sorted by distance from anchor when GPS is on, alpha
  // otherwise.
  const favStationsSorted = $derived.by<StopWithDistance[]>(() => {
    return sortStationsForPicker(favoriteStations, stationAnchor);
  });

  // "All other stations": filtered by the cascade, paginated. The
  // worker handles ordering (distance from anchor); we re-sort here
  // because stationAnchor may have updated since the page was
  // fetched and we want the rendered order to reflect the current
  // GPS position.
  const otherStationsSorted = $derived.by<StopWithDistance[]>(() => {
    return sortStationsForPicker(otherStationsPage, stationAnchor);
  });

  // Stations in the cascade's scope (after the mode + network
  // filter). Empty when no filter is active (every station is in
  // scope). Used to compute the "X stations match" caption.
  const stationsScopeCount = $derived(Object.keys(stationsScope).length);

  const filtersActive = $derived(typeFilter !== null || networkFilter !== null);
  const otherStationsHasMore = $derived(
    otherStationsTotal === 0 || otherStationsPage.length < otherStationsTotal,
  );

  // ── Filter card visibility ──────────────────────────────────────

  const showFiltersCard = $derived(
    (allRoutes != null && (presentTypes.length > 1 || allNetworks.length > 0))
      || (activeTab === 'stations' && stationsScopeCount > 0),
  );

  function selectStation(id: string) {
    goto(`/station/${id}`);
  }
</script>

<div class="mx-auto max-w-3xl px-4 py-6">
  {#if userPrefs.feedId == null}
    <SelectFeedCard fallbackBody="Pick a feed in Settings to star routes here." />
  {:else if error}
    <Card>
      <CardContent>
        <Typography variant="h6" class="text-[color:var(--color-danger)]">Failed to load routes</Typography>
        <Typography variant="caption">{error}</Typography>
      </CardContent>
    </Card>
  {:else if allRoutes == null}
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} align="center">
          <Spinner size={16} />
          <Typography variant="caption">Loading routes…</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else}
    <Stack spacing={2}>
      <!-- Tabs sit above the filter card and the first list card so
           the user sees the tab choice before any per-tab content. -->
      <Tabs
        value={activeTab}
        items={[
          { value: 'routes', label: 'Routes' },
          { value: 'stations', label: 'Stations' },
        ]}
        onchange={setTab}
      />

      {#if showFiltersCard && (presentTypes.length > 1 || allNetworks.length > 0)}
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {#if presentTypes.length > 1}
                <Stack spacing={0.5}>
                  <Typography variant="h5">Filter by mode</Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {typeFilter === null
                      ? `Showing all ${allRoutes.length} routes. Tap a mode to narrow down.`
                      : `${filteredRoutes.length} of ${allRoutes.length} routes match.`}
                  </Typography>
                  <Stack direction="row" spacing={1} align="center" wrap>
                    {#each presentTypes as t (t)}
                      <TypeBadge type={t} color={colorByType.get(t)} active={typeFilter === t} onclick={() => toggleType(t)} />
                    {/each}
                  </Stack>
                </Stack>
              {/if}

              {#if allNetworks.length > 0}
                <Stack spacing={0.5}>
                  <Typography variant="h5">Filter by network</Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {networkFilter === null
                      ? 'Tap a network to narrow down.'
                      : activeTab === 'stations'
                        ? `Showing stations served by ${filteredRoutes.length} route${filteredRoutes.length !== 1 ? 's' : ''} in this network.`
                        : `Showing ${filteredRoutes.length} route${filteredRoutes.length !== 1 ? 's' : ''} in this network.`}
                  </Typography>
                  <Stack direction="row" spacing={1} align="center" wrap>
                    {#each allNetworks as net (net.id)}
                      {@const Icon = networkIcon(net.id)}
                      {@const active = networkFilter === net.id}
                      <Chip
                        size="small"
                        hex={net.color}
                        fg={networkTextColor(net.color)}
                        onclick={() => toggleNetwork(net.id)}
                        class={active ? '' : 'opacity-50'}
                      >
                        {#snippet icon()}<Icon size={12} />{/snippet}
                        {net.name}
                      </Chip>
                    {/each}
                  </Stack>
                </Stack>
              {/if}

              {#if activeTab === 'stations' && filtersActive}
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                  Stations below are filtered to those served by at least one matching route.
                  Your favorited stations are always shown regardless.
                </Typography>
              {/if}
            </Stack>
          </CardContent>
        </Card>
      {/if}

      {#if activeTab === 'routes'}
        <!-- ── Routes tab ──────────────────────────────────────── -->
        {#if favRoutes.length > 0}
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} align="center">
                    <Heart size={16} class="shrink-0 text-[color:var(--color-fg-muted)]" />
                    <Typography variant="h5">Your favorites</Typography>
                  </Stack>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {favRoutes.length} starred. Routes running in the next hour float to the top.
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {#each favRoutes as route (route.id)}
                    {@render expandableRouteRow({ route })}
                  {/each}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        {/if}

        {#if otherRoutes.length > 0}
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack spacing={0.5}>
                  <Typography variant="h5">
                    {favRoutes.length > 0 ? 'All other routes' : 'All routes'}
                  </Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {otherRoutes.length} more to choose from. Routes running in the next hour float to the top.
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {#each otherRoutes as route (route.id)}
                    {@render expandableRouteRow({ route })}
                  {/each}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        {/if}

        {#if noScheduleRoutes.length > 0}
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack spacing={0.5}>
                  <Typography variant="h5">All other routes (no schedule available)</Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {noScheduleRoutes.length} route{noScheduleRoutes.length !== 1 ? 's' : ''} without timetable data. Tap the heart to favorite.
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {#each noScheduleRoutes as route (route.id)}
                    {@render expandableRouteRow({ route })}
                  {/each}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        {/if}
      {:else}
        <!-- ── Stations tab ────────────────────────────────────── -->

        {#if favoriteStationsError}
          <Card>
            <CardContent>
              <Typography variant="caption" class="text-[color:var(--color-danger)]">
                {favoriteStationsError}
              </Typography>
            </CardContent>
          </Card>
        {:else if favStationsSorted.length > 0}
          <Card>
            <CardContent>
              <Stack spacing={1}>
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} align="center">
                    <Heart size={16} class="shrink-0 text-[color:var(--color-fg-muted)]" />
                    <Typography variant="h5">Your favorites</Typography>
                  </Stack>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {favStationsSorted.length} starred.
                    {#if locationStore.position}
                      Nearest to you first.
                    {:else if stationAnchor}
                      Sorted alphabetically (enable location to rank by distance).
                    {:else}
                      Sorted alphabetically.
                    {/if}
                    {#if filtersActive}
                      Favorited stations are always shown, even when the filter would otherwise hide them.
                    {/if}
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {#each favStationsSorted as stop (stop.id)}
                    <FavoriteStationRow
                      stop={stop}
                      isFav={favoritesStore.hasStation(stop.id)}
                      onToggleFavorite={() => favoritesStore.toggleStation(stop.id)}
                      onbodyclick={() => selectStation(stop.id)}
                      routes={favoriteStationsRoutes[stop.id]}
                      hasGps={!!locationStore.position && stop.distance != null}
                      variant="card"
                      class="mt-1"
                    />
                  {/each}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        {/if}

        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Stack spacing={0.5}>
                <Typography variant="h5">
                  {favStationsSorted.length > 0 ? 'All other stations' : 'All stations'}
                </Typography>
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                  {#if otherStationsLoading && otherStationsPage.length === 0}
                    Loading…
                  {:else if otherStationsError}
                    {otherStationsError}
                  {:else if otherStationsTotal > 0}
                    {#if filtersActive}
                      Showing {otherStationsPage.length} of {otherStationsTotal} stations matching the filter.
                    {:else}
                      Showing {otherStationsPage.length} of {otherStationsTotal} stations.
                    {/if}
                    {#if locationStore.position}
                      Nearest first.
                    {/if}
                  {:else}
                    {filtersActive
                      ? 'No stations match the current filter.'
                      : 'No stations in this feed.'}
                  {/if}
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {#each otherStationsSorted as stop (stop.id)}
                  <FavoriteStationRow
                    stop={stop}
                    isFav={favoritesStore.hasStation(stop.id)}
                    onToggleFavorite={() => favoritesStore.toggleStation(stop.id)}
                    onbodyclick={() => selectStation(stop.id)}
                    routes={stationsScope[stop.id]}
                    hasGps={!!locationStore.position && stop.distance != null}
                    variant="card"
                    class="mt-1"
                  />
                {/each}
              </Stack>

              <div bind:this={sentinelEl} aria-hidden="true" class="h-1"></div>

              {#if otherStationsLoading}
                <Stack direction="row" spacing={1} align="center" class="py-2">
                  <Spinner size={14} />
                  <Typography variant="caption">Loading more stations…</Typography>
                </Stack>
              {:else if otherStationsHasMore}
                <Stack direction="row" spacing={1} align="center" class="py-2">
                  <button
                    type="button"
                    class="text-xs text-[color:var(--color-fg-muted)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] rounded"
                    onclick={() => fetchNextStationsPage()}
                  >
                    Load more
                  </button>
                </Stack>
              {:else if otherStationsPage.length > 0}
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)] py-2">
                  End of stations.
                </Typography>
              {/if}
            </Stack>
          </CardContent>
        </Card>
      {/if}
    </Stack>
  {/if}
</div>

<!-- expandableRouteRow: route row + stops-list Collapsible. Routes
     with no schedule have no representative trip, so the card is
     non-expandable. -->
{#snippet expandableRouteRow({ route }: { route: Route })}
  {@const expandable = route.hasSchedule !== false}
  {@const expanded = expandedRouteId === route.id}
  {@const stops = routeStops.get(route.id)}
  {@const loading = loadingRouteId === route.id}
  {@const failed = stopsErrorRouteId === route.id && expanded && !loading}
  <div>
    <FavoriteRouteRow
      {route}
      isFav={favoritesStore.hasRoute(route.id)}
      onToggleFavorite={() => favoritesStore.toggleRoute(route.id)}
      onbodyclick={() => toggleRouteStops(route)}
    />
    {#if expandable}
      <Collapsible in={expanded} reduced>
        <div class="px-1 pt-1">
          {#if loading}
            <Stack direction="row" spacing={1} align="center" class="px-2 py-1">
              <Spinner size={14} />
              <Typography variant="caption">Loading stops…</Typography>
            </Stack>
          {:else if failed || (expanded && stops != null && stops.length === 0)}
            <Typography variant="caption" class="px-2 py-1 text-[color:var(--color-fg-muted)]">
              No stops published for this route today.
            </Typography>
          {:else if stops != null}
            <TripStopList {stops} />
          {/if}
        </div>
      </Collapsible>
    {/if}
  </div>
{/snippet}

<!-- Same shape as Stations: outer is flex flex-col flex-1 so a tail filler can stretch below the content on short lists and collapse to 0 when the favorites list fills the viewport. -->
<div class="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
  {#if userPrefs.feedId == null}
    <SelectFeedCard fallbackBody="Pick a feed in Settings to star routes here." />
  {:else if error}
    <Card>
      <CardContent>
        <Typography variant="h6" class="text-[color:var(--color-danger)]">Failed to load routes</Typography>
        <Typography variant="caption">{error}</Typography>
      </CardContent>
    </Card>
  {:else if allRoutes == null}
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} align="center">
          <Spinner size={16} />
          <Typography variant="caption">Loading routes…</Typography>
        </Stack>
      </CardContent>
    </Card>
  {:else}
    <Stack spacing={2}>
      {#if presentTypes.length > 1 || allNetworks.length > 0}
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              {#if presentTypes.length > 1}
                <Stack spacing={0.5}>
                  <Typography variant="h5">Filter by mode</Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {typeFilter === null
                      ? `Showing all ${allRoutes.length} routes. Tap a mode to narrow down.`
                      : `${filteredRoutes.length} of ${allRoutes.length} routes match.`}
                  </Typography>
                  <Stack direction="row" spacing={1} align="center" wrap>
                    {#each presentTypes as t (t)}
                      <TypeBadge type={t} color={colorByType.get(t)} active={typeFilter === t} onclick={() => toggleType(t)} />
                    {/each}
                  </Stack>
                </Stack>
              {/if}

              {#if allNetworks.length > 0}
                <Stack spacing={0.5}>
                  <Typography variant="h5">Filter by network</Typography>
                  <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                    {networkFilter === null
                      ? 'Tap a network to narrow down.'
                      : `Showing ${filteredRoutes.length} route${filteredRoutes.length !== 1 ? 's' : ''} in this network.`}
                  </Typography>
                  <Stack direction="row" spacing={1} align="center" wrap>
                    {#each allNetworks as net (net.id)}
                      {@const Icon = networkIcon(net.id)}
                      {@const active = networkFilter === net.id}
                      <Chip
                        size="small"
                        hex={net.color}
                        fg={networkTextColor(net.color)}
                        onclick={() => toggleNetwork(net.id)}
                        class={active ? '' : 'opacity-50'}
                      >
                        {#snippet icon()}<Icon size={12} />{/snippet}
                        {net.name}
                      </Chip>
                    {/each}
                  </Stack>
                </Stack>
              {/if}
            </Stack>
          </CardContent>
        </Card>
      {/if}

      {#if favRoutes.length > 0 || favoriteStations.length > 0}
        <FavoritesCard
          routes={favRoutes}
          stations={favoriteStations}
          headerStyle="standalone"
          {stationsError}
        >
          {#snippet routeRow(args: { route: Route })}
            {@render expandableRouteRow(args)}
          {/snippet}
        </FavoritesCard>
      {/if}

      {#if otherRoutes.length > 0}
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Stack spacing={0.5}>
                <Typography variant="h5">
                  {(favRoutes.length > 0 || favoriteStations.length > 0) ? 'All other routes' : 'All routes'}
                </Typography>
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                  {otherRoutes.length} more to choose from. Tap the heart to favorite.
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {#each otherRoutes as route (route.id)}
                  {@render expandableRouteRow({ route })}
                {/each}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      {/if}

      {#if noScheduleRoutes.length > 0}
        <Card>
          <CardContent>
            <Stack spacing={1}>
              <Stack spacing={0.5}>
                <Typography variant="h5">All other routes (no schedule available)</Typography>
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)]">
                  {noScheduleRoutes.length} route{noScheduleRoutes.length !== 1 ? 's' : ''} without timetable data. Tap the heart to favorite.
                </Typography>
              </Stack>
              <Stack spacing={1}>
                {#each noScheduleRoutes as route (route.id)}
                  {@render expandableRouteRow({ route })}
                {/each}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      {/if}
    </Stack>
  {/if}

  <!-- Tail filler — stretches to fill whatever space the favorites list leaves in <main>. See Stations +page.svelte for the long-form explanation. -->
  <div class="flex-1 min-h-0" aria-hidden="true"></div>
</div>
