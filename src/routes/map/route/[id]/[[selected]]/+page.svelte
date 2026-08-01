<!-- By-route, by-direction map. URL (path only): /map/route/[id] (multi, not yet), /map/route/[id]_0|[id]_1 (single), /map/route/[id]_0|[id]_1/[v] (vehicle highlighted). Renders the shape polyline, every stop along the representative trip, the user's current GPS, and one marker per active trip positioned by domain prediction (linear interpolation between consecutive stops at reactive nowMin). Schedule-only / not-yet-active vehicles are dimmed; vehicles past their terminus drop off. Direction-swap and zoom controls live in the header card to match the schedule view's chrome. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { ArrowRightLeft, Bus, Calendar, Heart, Maximize2, Minus, Plus } from 'lucide-svelte';
  import {
    BackButton, Card, CardContent, Chip, IconButton, RouteBadge, RouteMap,
    SelectFeedCard, Spinner, Stack, Typography, tagIcon,
  } from '$lib/ui';
  import { useRouteMapView } from '$lib/composables/useRouteMapView.svelte';
  import { useOtherDirectionExists } from '$lib/data/gtfs/otherDirectionExists.svelte';
  import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';
  import { pickContrastingText } from '$lib/domain/types';

  const m = useRouteMapView();
  const otherDirection = useOtherDirectionExists(
    () => m.routeId,
    () => m.direction,
  );

  function swapDirection() {
    if (m.direction == null) return;
    const otherDir = m.direction === 0 ? 1 : 0;
    // When swapping back to the original direction, restore the trip the user
    // arrived with so the highlight isn't lost after a double-swap.
    const restoreTrip = otherDir === m.homeDirection ? m.homeSelectedTripId : null;
    const target = restoreTrip
      ? `/map/route/${m.routeId}_${otherDir}/${restoreTrip}`
      : `/map/route/${m.routeId}_${otherDir}`;
    goto(target, { replaceState: true });
  }

  // Map control wrappers — thin closures over Leaflet's imperative
  // API. Rendered as a styled IconButton overlay in the top-right of
  // the map card (see markup below), not as Leaflet's native
  // `leaflet-bar` controls (those don't match the app's chrome).
  // The map component exposes `mapInstance` and `shapeLayer` via
  // bind: so we don't have to know anything about Leaflet here.
  let mapInstance = $state<import('leaflet').Map | null>(null);
  let L = $state<typeof import('leaflet') | null>(null);
  let shapeLayer = $state<import('leaflet').Polyline | null>(null);

  function zoomIn() { mapInstance?.zoomIn(); }
  function zoomOut() { mapInstance?.zoomOut(); }
  function fitToRoute() {
    if (!mapInstance || !shapeLayer) return;
    mapInstance.fitBounds(shapeLayer.getBounds(), {
      padding: [12, 12],
      maxZoom: 15,
    });
  }
  /** Pan + zoom the viewport onto the selected vehicle with the two
   *  stops before and the two after, so the rider sees the bus
   *  centred between its current segment's neighbours. Bails when
   *  there's no selected trip OR the marker hasn't surfaced yet
   *  (e.g. the vehicle dropped off the live feed). Wraps fitBounds
   *  so the result remains pan-and-zoom-able afterwards — we never
   *  lock the viewport. */
  function focusOnVehicle() {
    if (!mapInstance || !m.view || !L || !m.selectedTripId) return;
    const sel = m.markers.find((mk) => mk.tripId === m.selectedTripId);
    if (!sel) return;
    const trip = m.view.trips.find((t) => t.tripId === m.selectedTripId);
    if (!trip || trip.stops.length === 0) return;
    const Lref = L;
    const vehLL = Lref.latLng(sel.lat, sel.lon);
    // Nearest stop index to the vehicle's current position. The trip
    // shape is monotonic in stop_sequence, so [idx-2 .. idx+2] gives a
    // five-stop window centred on where the bus is right now.
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < trip.stops.length; i += 1) {
      const d = vehLL.distanceTo(Lref.latLng(trip.stops[i].lat, trip.stops[i].lon));
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const lo = Math.max(0, nearestIdx - 2);
    const hi = Math.min(trip.stops.length - 1, nearestIdx + 2);
    const bounds = Lref.latLngBounds([[sel.lat, sel.lon]]);
    for (let i = lo; i <= hi; i += 1) {
      bounds.extend([trip.stops[i].lat, trip.stops[i].lon]);
    }
    mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }
  // Selected-vehicle focus is meaningful only when there IS a selected
  // trip AND its marker is currently on the map.
  const focusOnVehicleEnabled = $derived(
    m.selectedTripId != null && m.markers.some((mk) => mk.tripId === m.selectedTripId),
  );
</script>

<!-- Map control button factory + per-control icon snippets. Defined
     at the top of the template (NOT inside any component) so they
     stay template-scoped rather than being interpreted as props on
     whichever component happens to host them. -->
{#snippet mapControl(label: string, iconSnippet: import('svelte').Snippet, onclick: () => void, disabled = false)}
  <IconButton
    size="small"
    aria-label={label}
    title={label}
    {disabled}
    class="bg-[color:var(--color-surface)] text-[color:var(--color-fg)] border border-[color:var(--color-border)] shadow-lg hover:bg-[color:var(--color-border)]/60"
    {onclick}
  >
    {@render iconSnippet()}
  </IconButton>
{/snippet}
{#snippet plusIcon()}<Plus size={16} />{/snippet}
{#snippet minusIcon()}<Minus size={16} />{/snippet}
{#snippet fitIcon()}<Maximize2 size={16} />{/snippet}
{#snippet busIcon()}<Bus size={16} />{/snippet}
{#snippet calendarIcon()}<Calendar size={16} />{/snippet}
{#snippet heartIcon(filled: boolean)}
  <Heart
    size={16}
    fill={filled ? 'currentColor' : 'none'}
    class={filled ? 'text-[color:var(--color-danger)]' : ''}
  />
{/snippet}

<div class="mx-auto max-w-5xl w-full px-4 py-3 flex flex-col min-h-[calc(100svh-3.5rem-3rem)]">
  {#if userPrefs.feedId == null}
    <SelectFeedCard fallbackBody="Pick a feed in Settings to view the route map." />
  {:else if m.direction == null}
    <Card><CardContent>
      <Typography variant="h6" class="text-[color:var(--color-danger)]">Map view needs a direction</Typography>
      <Typography variant="caption">URL must end in <code>_0</code> or <code>_1</code>.</Typography>
    </CardContent></Card>
  {:else if m.error}
    <Card><CardContent>
      <Stack spacing={1}>
        <Typography variant="h6" class="text-[color:var(--color-danger)]">Failed to load map</Typography>
        <Typography variant="caption">{m.error}</Typography>
      </Stack>
    </CardContent></Card>
  {:else if m.view == null}
    <Card><CardContent>
      <Stack direction="row" spacing={1} align="center">
        <Spinner size={16} />
        <Typography variant="caption">Loading map…</Typography>
      </Stack>
    </CardContent></Card>
  {:else}
    <!-- Header card: outside the map card's flex column so the header
         can grow tall without clipping or pushing the map off-screen.
         The Stack shrinks to fit the header; the map card below it uses
         a fixed explicit height that accounts for the outer page chrome. -->
    <Stack spacing={2}>
      <!-- Header: same chrome the schedule view uses, with a swap-
           direction icon. -->
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1.5} align="center" wrap>
            <BackButton />
            <RouteBadge route={m.view.route} size="large" />
            <Stack spacing={0.5} class="flex-1 min-w-0">
              <Stack direction="row" spacing={1} align="center" wrap>
                <Typography variant="h5" class="truncate">{m.headerTitle}</Typography>
                {#each (m.route?.networks ?? []) as netId (netId)}
                  {@const net = m.networkMap.get(netId)}
                  <Chip size="small" hex={net?.color} fg={net ? pickContrastingText(net.color) : undefined}>
                    {net?.name ?? netId}
                  </Chip>
                {/each}
                {#each (m.route?.tags ?? []) as tagId (tagId)}
                  {@const tag = m.routeTags.get(tagId)}
                  {@const TagIcon = tag?.icon ? tagIcon(tag.icon) : null}
                  {@const tagColor = tag?.color}
                  {@const tagHex = tagColor ? `#${tagColor}` : undefined}
                  {#if TagIcon}
                    <Chip size="small" hex={tagHex} fg={tagColor ? pickContrastingText(tagColor) : undefined}>
                      {#snippet icon()}<TagIcon size={12} />{/snippet}
                      {tag?.name ?? tagId}
                    </Chip>
                  {:else}
                    <Chip size="small" hex={tagHex} fg={tagColor ? pickContrastingText(tagColor) : undefined}>
                      {tag?.name ?? tagId}
                    </Chip>
                  {/if}
                {/each}
              </Stack>
              {#if m.headerSubtitle}
                <Typography variant="caption" class="text-[color:var(--color-fg-muted)] truncate">
                  {m.headerSubtitle}
                </Typography>
              {/if}
            </Stack>
            <Stack direction="row" spacing={0.5} align="center" class="shrink-0">
              {#if otherDirection.value !== false}
                <IconButton
                  aria-label="Swap direction"
                  onclick={swapDirection}
                >
                  <ArrowRightLeft size={18} />
                </IconButton>
              {/if}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>

    <!-- The map card sits below the header as a sibling. A fixed
         height keeps Leaflet happy (known container size at init).
         The 18rem covers outer app header (~3.5rem), the in-page
         header card, page padding (~1.5rem), and bottom nav. -->
    <Card class="overflow-hidden neary-map-card">
        <RouteMap
          view={m.view}
          markers={m.markers}
          stopRoutes={m.stopRoutes}
          selectedTripId={m.selectedTripId}
          fromStopId={m.fromStopId}
          isCircular={m.isCircular}
          overallBearing={m.overallBearing}
          hasStartVehicle={m.hasStartVehicle}
          nowMin={m.nowMin}
          direction={m.direction ?? 0}
          bind:mapInstance
          bind:L
          bind:shapeLayer
        />
        <!-- Viewport controls overlaid on the map, top-right.
             Same IconButton styling the rest of the app uses, with a
             surface background + shadow so they read against any
             map tile. Sits above Leaflet's panes via z-index. The
             button class is identical for every control — factored
             into the `mapControl` snippet (defined at the top of
             this template, outside any Card) so adding a new
             control is one line, not seven. -->
        <div class="neary-map-controls">
          {@render mapControl('Zoom in', plusIcon, zoomIn)}
          {@render mapControl('Zoom out', minusIcon, zoomOut)}
          {@render mapControl('Fit route to view', fitIcon, fitToRoute)}
          {@render mapControl('Focus on tracked vehicle', busIcon, focusOnVehicle, !focusOnVehicleEnabled)}
        </div>
        <!-- Bottom-right control cluster. Same chrome as the top-right
             cluster, opposite corner so the two don't crowd each
             other. Favorite lives ABOVE the schedule shortcut in the
             flex-column so both stay thumb-reachable. Favorites work
             even for routes without a usable schedule, so this cluster
             renders whenever the view is loaded. -->
        {#if m.view}
          {@const isFavorite = favoritesStore.routeIds.has(m.routeId)}
          <div class="neary-map-controls-bottom">
            <IconButton
              size="small"
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              class="bg-[color:var(--color-surface)] text-[color:var(--color-fg)] border border-[color:var(--color-border)] shadow-lg hover:bg-[color:var(--color-border)]/60"
              onclick={() => favoritesStore.toggleRoute(m.routeId)}
            >
              {@render heartIcon(isFavorite)}
            </IconButton>
            {#if m.view.route.hasSchedule !== false}
              {@render mapControl(
                'Open schedule for this route',
                calendarIcon,
                () => goto(`/schedule/route/${m.routeId}_${m.direction}`),
              )}
            {/if}
          </div>
        {/if}
      </Card>
  {/if}
</div>

<style>
  /* Fixed explicit height keeps Leaflet happy (has a known container
     size at init). The 18rem covers outer app header (~3.5rem),
     the in-page header card, page padding (~1.5rem), and the bottom
     nav. The header card is a sibling above this card, not nested
     inside it, so it can grow without pushing the map off-screen. */
  :global(.neary-map-card) {
    height: calc(100svh - 18rem);
    position: relative;
  }
  /* .neary-map lives inside <RouteMap>; sizing follows the card. */
  :global(.neary-map) {
    width: 100%;
    height: 100%;
  }
  /* Floating viewport controls in the top-right corner. Above the
     Leaflet panes (which top out at ~700 for popups) so the buttons
     are always clickable; rounded shadow matches the app's surface
     chrome. */
  .neary-map-controls {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  /* Bottom-right cluster — same chrome as the top-right cluster,
     opposite corner so the two don't crowd each other. */
  .neary-map-controls-bottom {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  /* Floor for tiny viewports (e.g. landscape phone): the map gets
     a usable minimum even if the calc would otherwise hand it
     near-zero height. */
  @media (max-height: 480px) {
    :global(.neary-map-card) {
      height: 220px;
    }
  }
  /* Leaflet's own popup container inherits a default white bg; ours
     reads better with rounded corners + a touch of shadow. */
  :global(.leaflet-popup-content-wrapper) {
    border-radius: 8px;
  }
  /* User-position dot: blue circle with a gentle breathing pulse so it
     reads as "live location" without being distracting. 2 s cycle
     (not too fast / not too slow). Uses transform so the animation
     stays composited and doesn't repaint the map layer below it. */
  :global(.neary-user-dot) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #1d4ed8;
    border: 2.5px solid #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
    animation: neary-user-pulse 2s ease-in-out infinite;
  }
  @keyframes neary-user-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.35); opacity: 0.65; }
  }

  /* Selected vehicle marker: animate the dark outer ring outward in a
     soft breathing pulse so it stands out among other markers without
     redrawing the map. The inline box-shadow handles the static inner
     coloured ring + 5px dark ring at the resting state; this keyframe
     blends an extra 9px translucent ring at 50% so the dark ring
     appears to expand and fade rhythmically. --neary-inner is set
     inline per badge to preserve the GPS-confidence inner ring colour
     through the animation. */
  :global(.neary-vehicle-selected) {
    animation: neary-vehicle-selected-pulse 1.6s ease-in-out infinite;
  }
  @keyframes neary-vehicle-selected-pulse {
    0%, 100% {
      box-shadow:
        0 0 0 3px var(--neary-inner, #fff),
        0 0 0 5px #111;
    }
    50% {
      box-shadow:
        0 0 0 3px var(--neary-inner, #fff),
        0 0 0 5px #111,
        0 0 0 9px rgba(17, 17, 17, 0.35);
    }
  }

  /* Stop debug-id tooltip (only rendered when userPrefs.showDebugIds
     is on). Compact font + tight padding so the labels don't crowd
     the route geometry, and so the vehicle markers + their own debug
     labels (which paint above this pane) stay the eye's anchor. */
  :global(.leaflet-tooltip.neary-stop-id-label) {
    font: 600 8px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 1px 3px;
    background: rgba(255, 255, 255, 0.85);
    border: none;
    box-shadow: none;
    color: #333;
  }
  :global(.leaflet-tooltip.neary-stop-id-label::before) {
    display: none;
  }
</style>
