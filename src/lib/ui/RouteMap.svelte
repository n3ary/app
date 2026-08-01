<!--
  Leaflet integration for /map/route. Owns the map instance, all
  per-layer refs, and the four re-paint effects (init, shape+stops,
  vehicles, user position). The page passes the view-model via
  props; the component is responsible for translating data → DOM.

  Bindable handles (`mapInstance`, `L`, `shapeLayer`) are exposed so
  the page can call fitBounds / focusOnVehicle from its control
  buttons. The page never touches Leaflet types directly.

  Why a separate component and not a composable: Leaflet is fully
  imperative. A composable that owns a DOM element + Leaflet
  instance + per-layer mutable refs would have to surface ALL of
  them as return values, and the effect that paints the shape (now
  inside the composable) would still need `bind:this` on the page's
  mapEl. Splitting it into a component is the same total code with a
  cleaner API: props in, imperative handle out, no template glue on
  the page.
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { haversineMeters } from '@n3ary/gtfs-spec/shape';
  import type { RouteMapView } from '$lib/data/gtfs/types';
  import { locationStore } from '$lib/stores/gps/locationStore.svelte';
  import { nowTicker } from '$lib/stores/nowTicker.svelte';
  import { userPrefs } from '$lib/stores/userPrefs.svelte';
  import { pickContrastingText, type Route } from '$lib/domain/types';
  import {
    stopPopupHtml,
    vehicleHtml,
    vehiclePopupHtml,
    type VehicleMarker,
  } from '$lib/map/routeMapPopupHtml';

  type LeafletNS = typeof import('leaflet');
  type LeafletMap = import('leaflet').Map;
  type LeafletPolyline = import('leaflet').Polyline;
  type LeafletLayerGroup = import('leaflet').LayerGroup;
  type LeafletMarker = import('leaflet').Marker;

  type Props = {
    view: RouteMapView;
    markers: VehicleMarker[];
    stopRoutes: Map<string, Route[]>;
    selectedTripId: string | null;
    fromStopId: string | null;
    isCircular: boolean;
    overallBearing: number;
    hasStartVehicle: boolean;
    nowMin: number;
    /** URL direction (0 or 1) — used in the vehicle popup's
     *  "open schedule" link and the start-vehicle direction cue. */
    direction: 0 | 1;
    /** Bindable: the live Leaflet map instance, set after init.
     *  Read by the page's control buttons (zoom, fit, focus). */
    mapInstance?: LeafletMap | null;
    /** Bindable: the Leaflet namespace, set after the dynamic
     *  import resolves. Read by the page's focusOnVehicle. */
    L?: LeafletNS | null;
    /** Bindable: the route shape polyline, set when the shape
     *  effect paints. Read by the page's fitToRoute. */
    shapeLayer?: LeafletPolyline | null;
  };

  let {
    view,
    markers,
    stopRoutes,
    selectedTripId,
    fromStopId,
    isCircular,
    overallBearing,
    hasStartVehicle,
    nowMin,
    direction,
    // Bindable imperative handles — the page's control buttons (zoom,
    // fit-to-route, focus-on-vehicle) need to call methods on the map
    // instance and the shape layer. We expose them via $bindable so
    // the page can `bind:this` them without owning the map itself.
    mapInstance = $bindable<LeafletMap | null>(null),
    L = $bindable<LeafletNS | null>(null),
    shapeLayer = $bindable<LeafletPolyline | null>(null),
  }: Props = $props();

  // Layer refs that are only ever touched from effects that already
  // track mapInstance + view — they don't need to be reactive.
  let stopsLayer: LeafletLayerGroup | null = null;
  let vehiclesLayer: LeafletLayerGroup | null = null;
  let userMarker: LeafletMarker | null = null;
  let hasFitOnce = false;
  let resizeObserver: ResizeObserver | null = null;
  let mapEl: HTMLDivElement | undefined = $state();

  onMount(async () => {
    try {
      const mod = (await import('leaflet')) as unknown as { default?: LeafletNS };
      L = (mod.default ?? (mod as unknown as LeafletNS));
      await import('leaflet/dist/leaflet.css');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[map] leaflet import failed', e);
      error = e instanceof Error ? e.message : String(e);
    }
  });

  // Re-paint error: set on Leaflet import failure or init failure so
  // the page can show a non-map error state. Local state, not
  // bindable — the page observes it via prop.
  let error = $state<string | null>(null);

  // Lazy init the Leaflet instance the first time the container has
  // non-zero size. We can't just init when mapEl + L + view are all
  // present — the Card's flex height is 0 for one frame after it
  // mounts, and Leaflet caches that 0-size on init. Instead, gate
  // on a ResizeObserver tick that reports a real width × height,
  // then disconnect that gate and start observing for future
  // resizes so the map re-tiles when the viewport changes.
  $effect(() => {
    if (!L || mapInstance || !mapEl || view == null) return;
    const el = mapEl;
    const Lref = L;

    const doInit = () => {
      try {
        mapInstance = Lref.map(el, {
          zoomControl: false,
          attributionControl: true,
          center: [46.77, 23.6],
          zoom: 13,
        });
        (window as unknown as { __nearyMap?: LeafletMap }).__nearyMap = mapInstance;
        Lref.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
          // CORS mode so tile responses are readable: the SW's tile
          // cache (cacheFirstOsmTile) can then stamp put-time for
          // freshness and serve the SAME response to both Leaflet's
          // requests and the bbox prefetch's cors fetches. OSM sends
          // Access-Control-Allow-Origin: *.
          crossOrigin: 'anonymous',
        }).addTo(mapInstance);
        stopsLayer = Lref.layerGroup().addTo(mapInstance);
        vehiclesLayer = Lref.layerGroup().addTo(mapInstance);
        // Vehicles pane sits above markerPane (600) so vehicle badges
        // always paint over stop circles, but below tooltipPane (650).
        const vehiclesPane = mapInstance.createPane('nearyVehicles');
        vehiclesPane.style.zIndex = '620';
        // Stop debug-id tooltips live in their own pane below the
        // vehicles pane (z=610 < nearyVehicles z=620) so vehicle
        // badges and their debug overlays stay readable in debug
        // mode and aren't covered by station ids. Tooltip pointer
        // events are disabled too — riders can still tap stop
        // circles through the label.
        const stopDebugPane = mapInstance.createPane('nearyStopDebug');
        stopDebugPane.style.zIndex = '610';
        stopDebugPane.style.pointerEvents = 'none';
        // Future-resize listener (rotation, splitscreen, sidebar).
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => mapInstance?.invalidateSize());
          resizeObserver.observe(el);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[map] init failed', e);
        error = e instanceof Error ? e.message : String(e);
      }
    };

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      doInit();
      return;
    }

    // Container has 0 size right now — wait for the layout to give
    // it real dimensions before initialising. ResizeObserver fires
    // immediately on observe() and again on every size change, so
    // the first non-zero entry triggers init and we disconnect.
    if (typeof ResizeObserver === 'undefined') return;
    const gate = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      gate.disconnect();
      doInit();
    });
    gate.observe(el);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    mapInstance?.remove();
    mapInstance = null;
  });

  // Re-paint the route shape + stops whenever the view-model or stop
  // routes change. Leaflet layers are mutated in place; markers are
  // recreated cheaply (a route has O(50) stops, an order of magnitude
  // less than what Leaflet handles fluidly).
  $effect(() => {
    // Capture reactive state into local const so TypeScript narrowing
    // holds inside forEach callbacks (rune getters don't narrow).
    const Lref = L;
    const currentView = view;
    const currentRoutes = stopRoutes;
    if (!Lref || !mapInstance || !currentView) return;
    if (shapeLayer) {
      shapeLayer.remove();
      shapeLayer = null;
    }
    if (currentView.shape.length >= 2) {
      const latlngs = currentView.shape.map((p) => [p.lat, p.lon] as [number, number]);
      shapeLayer = Lref.polyline(latlngs, {
        color: currentView.route.color,
        weight: 5,
        opacity: 0.85,
      }).addTo(mapInstance);
      if (!hasFitOnce) {
        // Borrowed v1's tighter framing: small fixed padding so the
        // route fills the viewport, capped at zoom 15 so a short
        // route doesn't slam in past the point where street labels
        // start to fight each other.
        mapInstance.fitBounds(shapeLayer.getBounds(), {
          padding: [12, 12],
          maxZoom: 15,
        });
        hasFitOnce = true;
      }
    }
    stopsLayer?.clearLayers();
    const sl = stopsLayer;
    if (sl) {
      // Every stop renders as the same small circleMarker — origin and
      // terminus get no special treatment. The route badge in the
      // header already names origin + destination, and "next at
      // origin" surfaces via the scheduled vehicle bubble; a separate
      // play / square endpoint glyph was redundant.
      //
      // Exception: when the user navigated here from a station card
      // (`?from=<stopId>` query param), that stop renders in the
      // success-green colour so the rider can recognise where they
      // were standing. Pure visual marker; no other behavioural
      // change — the popup, hit target, and trip data are identical.
      //
      // Second exception: when no vehicle is currently at / near the
      // route's origin (hasStartVehicle === false), the origin stop
      // takes over the direction-of-travel cue and renders as a
      // play triangle rotated to the initial-segment bearing. When
      // a start vehicle is present, that vehicle gets the arrow (in
      // the vehicles effect below) and the origin falls back to the
      // regular circle so the two cues don't stack.
      const fromStop = fromStopId;
      const routeOriginId = currentView.stops[0]?.stopId ?? null;
      const hasShape = currentView.shape.length >= 2;
      currentView.stops.forEach((s) => {
        // Both sides are strings (GTFS stop_id is a free-form text id
        // per spec, kept as string end-to-end). Direct === compare.
        const isFromStop = fromStop != null && s.stopId === fromStop;
        const isRouteOrigin = routeOriginId != null && s.stopId === routeOriginId;
        const showPlayIcon =
          isRouteOrigin && !hasStartVehicle && !isFromStop && !isCircular && hasShape;
        const m: LeafletMarker | import('leaflet').CircleMarker = showPlayIcon
          ? Lref.marker([s.lat, s.lon], {
              // Play-triangle pill matching the vehicle badge: route
              // colour fill, contrasting glyph inside, white ring,
              // same corner radius. Only the SVG glyph rotates —
              // the pill stays upright so it reads as a UI element,
              // not a rotated stop marker.
              icon: Lref.divIcon({
                className: 'neary-stop-play',
                html: `<div style="
                    display:inline-flex;align-items:center;justify-content:center;
                    width:24px;height:24px;border-radius:6px;
                    background:${currentView.route.color};color:${pickContrastingText(currentView.route.color)};
                    box-shadow:0 0 0 2px #fff, 0 1px 2px rgba(0,0,0,0.35);
                  "><svg width="14" height="14" viewBox="0 0 20 20"
                          style="transform:rotate(${overallBearing.toFixed(1)}deg);" aria-hidden="true">
                    <path d="M10 2 L17 17 L3 17 Z" fill="currentColor" />
                  </svg></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              }),
            })
          : Lref.circleMarker([s.lat, s.lon], {
              // Stops are already drawn ON TOP of the route polyline:
              // both live in overlayPane, the polyline is added by this
              // effect FIRST and the stops are appended AFTER, so SVG
              // insertion order puts the stop circles above the line. No
              // pane gymnastics needed — earlier attempts to hoist the
              // origin into markerPane / a custom pane broke the marker
              // entirely because Leaflet's SVG renderer isn't on
              // markerPane by default.
              radius: isFromStop ? 9 : 5,
              color: '#fff',
              weight: isFromStop ? 3 : 1.5,
              // Hardcoded green hex (not var(--color-success)) because
              // Leaflet's SVG renderer doesn't parse CSS custom properties
              // or oklch() — keep parity with the GPS-good ring used in
              // vehicleHtml below.
              fillColor: isFromStop ? '#22c55e' : currentView.route.color,
              fillOpacity: 1,
            });
        m.bindPopup(stopPopupHtml(s.stopId, s.stopName, currentRoutes.get(s.stopId) ?? []), {
          closeButton: false,
        });
        // Debug overlay: render the stop_id as a permanent tooltip
        // next to each stop circle when `userPrefs.showDebugIds` is
        // on. Lets the rider compare against the `?from=<id>` query
        // param (and against the station-card stop they came from)
        // when investigating why the from-stop highlight didn't
        // appear. The from-stop gets a `★` prefix so we can also
        // see whether the isFromStop check itself is firing — if the
        // star appears but the dot is still route-coloured, the
        // match works and it's a rendering bug; if no star appears
        // on the stop you came from, the match itself is failing.
        // Suppressed in production so the map stays readable.
        if (userPrefs.showDebugIds) {
          m.bindTooltip(`${isFromStop ? '★ ' : ''}${s.stopId}`, {
            permanent: true,
            direction: 'right',
            offset: [4, 0],
            className: 'neary-stop-id-label',
            pane: 'nearyStopDebug',
          });
        }
        m.addTo(sl);
      });
    }
  });

  // Re-paint vehicles every nowMin tick.
  $effect(() => {
    if (!L || !mapInstance || !vehiclesLayer || !view) return;
    void nowMin; // declare dependency so the effect re-runs each tick
    const Lref = L;
    const rid = view.route.id;
    const dir = direction;
    vehiclesLayer.clearLayers();
    const routeColor = view.route.color;
    const labelFg = pickContrastingText(routeColor);
    const nowMinSnap = nowMin;
    for (const m of markers) {
      const debugId = userPrefs.showDebugIds
        ? `${m.tripId} · ${m.kind[0]}${m.directionId === -1 ? '' : m.directionId}`
          + (m.gpsAsOfMs != null
            ? ` · ${Math.max(0, Math.round((nowTicker.ms - m.gpsAsOfMs) / 1000))}s ago`
            : '')
        : '';
      const html = vehicleHtml(view.route.shortName, routeColor, labelFg, m.selected, m.opacity, m.scheduled, m.gpsConfidence, debugId);
      const icon = Lref.divIcon({
        className: 'neary-vehicle',
        html,
        iconSize: [44, 28],
        iconAnchor: [22, 14],
      });
      // pane: 'nearyVehicles' (z=620) keeps vehicles above stop markers
      // (markerPane z=600) so they're never hidden behind station icons.
      // zIndexOffset stacks vehicles within the pane so a schedule-only
      // marker never covers a live (GPS-backed) marker, and the
      // selected vehicle floats above both. Leaflet otherwise uses
      // insertion order, which is non-deterministic across ticks.
      const stackOffset = m.selected ? 1000 : m.scheduled ? -100 : 0;
      const marker = Lref.marker([m.lat, m.lon], {
        icon,
        pane: 'nearyVehicles',
        zIndexOffset: stackOffset,
      });
      // offset: [0, -16] anchors the popup tail just above the badge
      // top edge so it floats above the vehicle rather than covering it.
      marker.bindPopup(vehiclePopupHtml(
        m,
        rid,
        dir,
        nowMinSnap,
        view.route.hasSchedule !== false,
      ), {
        closeButton: false,
        offset: Lref.point(0, -16),
      });
      marker.addTo(vehiclesLayer);
    }

    // Direction-of-travel cue when a vehicle is at / near the route's
    // origin: pin a small arrow at that vehicle's position, rotated
    // to the polyline's initial bearing (vehicle is close to origin,
    // so the first-segment bearing is a good approximation of the
    // vehicle's actual heading). Non-interactive so it never steals
    // taps from the underlying vehicle marker. `iconAnchor` shifts
    // the arrow just above the 44×28 vehicle badge instead of
    // covering it. When no vehicle is near origin, the origin STOP
    // shows a play icon instead (rendered by the stops effect).
    // Skipped entirely for circular routes — origin and terminus
    // collapse, so a single arrow near origin is misleading.
    if (view && markers.length > 0 && !isCircular) {
      const origin = view.stops[0];
      if (origin) {
        let best: VehicleMarker | null = null;
        let bestDistM = Infinity;
        for (const m of markers) {
          const d = haversineMeters(origin.lat, origin.lon, m.lat, m.lon);
          if (d < bestDistM) {
            bestDistM = d;
            best = m;
          }
        }
        if (best && bestDistM < 200) {
          const brg = overallBearing;
          // Rounded pill matching the vehicle badge: route colour
          // fill, contrasting glyph inside, white ring, same corner
          // radius. Only the SVG glyph rotates — the pill stays
          // upright so it reads as a UI element rather than a
          // free-floating pointer.
          const SIZE = 24;
          const html = `<div style="
              display:inline-flex;align-items:center;justify-content:center;
              width:${SIZE}px;height:${SIZE}px;border-radius:6px;
              background:${routeColor};color:${labelFg};
              box-shadow:0 0 0 2px #fff, 0 1px 2px rgba(0,0,0,0.35);
              pointer-events:none;
            "><svg width="14" height="14" viewBox="0 0 20 20"
                    style="transform:rotate(${brg.toFixed(1)}deg);" aria-hidden="true">
              <path d="M10 2 L16 14 L10 11 L4 14 Z" fill="currentColor" />
            </svg></div>`;
          // Anchor the pill on the side OPPOSITE the direction of
          // travel: since the route line extends from origin in the
          // bearing direction, the opposite flank is off-route, so
          // the pill doesn't overlap other vehicle badges that stack
          // near the departure area. Screen-space math: bearing θ
          // (CW from N) maps to screen direction (sin θ, -cos θ);
          // pill sits in direction (-sin θ, cos θ). Distance R=40
          // gives clearance around the 44×28 vehicle badge even at
          // pure-diagonal bearings.
          const brgRad = (brg * Math.PI) / 180;
          const R = 40;
          const dxCenter = -R * Math.sin(brgRad);
          const dyCenter = R * Math.cos(brgRad);
          const icon = Lref.divIcon({
            className: 'neary-start-vehicle-arrow',
            html,
            iconSize: [SIZE, SIZE],
            iconAnchor: [SIZE / 2 - dxCenter, SIZE / 2 - dyCenter],
          });
          Lref.marker([best.lat, best.lon], {
            icon,
            pane: 'nearyVehicles',
            zIndexOffset: 1500,
            interactive: false,
            keyboard: false,
          }).addTo(vehiclesLayer);
        }
      }
    }
  });

  // User position layer. `locationStore.position` is a native
  // `GeolocationPosition`, so coords come from `.coords.latitude` /
  // `.coords.longitude` — NOT the LatLon shape we use everywhere
  // else in the domain.
  $effect(() => {
    if (!L || !mapInstance) return;
    const pos = locationStore.position;
    const coords = pos?.coords;
    if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
      userMarker?.remove();
      userMarker = null;
      return;
    }
    const latlng: [number, number] = [coords.latitude, coords.longitude];
    if (!userMarker) {
      userMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: '',
          html: '<div class="neary-user-dot"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
        interactive: false,
        zIndexOffset: -200,
      }).addTo(mapInstance);
    } else {
      userMarker.setLatLng(latlng);
    }
  });
</script>

<div bind:this={mapEl} class="neary-map"></div>
