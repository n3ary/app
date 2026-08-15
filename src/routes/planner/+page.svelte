<!--
  Journey planner (walk + transit). Pick a start (GPS / map tap / stop
  search) and destination, then plan via the worker's client-side RAPTOR
  (getGtfsRepo().planJourney). Map + itinerary list. Additive feature --
  reuses the same Leaflet + OSM tile setup as the route map, the same GPS
  store, and does not touch the Stations / live pipeline.

  This cut resolves destinations to feed stops (offline searchStops) or a
  map tap; street-address / POI geocoding and live-time folding are
  follow-ups (see docs/plan/planner.md).
-->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { LocateFixed, ArrowRight, Search, Footprints, Hourglass, Bus, TramFront } from 'lucide-svelte';
  import { getGtfsRepo } from '$lib/data/gtfs/repo';
  import { locationStore } from '$lib/stores/gps/locationStore.svelte';
  import type { PlannerJourney, StopWithDistance } from '$lib/data/gtfs/types';

  type LeafletNS = typeof import('leaflet');
  type LeafletMap = import('leaflet').Map;
  type LeafletLayerGroup = import('leaflet').LayerGroup;

  type Place = { lat: number; lon: number; label: string };

  const FEED_CENTER: [number, number] = [46.77, 23.6];

  // -- State -------------------------------------------------------------
  let from = $state<Place | null>(null);
  let to = $state<Place | null>(null);
  let fromText = $state('');
  let toText = $state('');
  let results = $state<StopWithDistance[]>([]);
  let activeField = $state<'from' | 'to' | null>(null);
  let dayOffset = $state(0);
  let timeStr = $state(nowHHMM());
  let journeys = $state<PlannerJourney[]>([]);
  let selectedIdx = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // -- Leaflet (imperative, non-reactive refs) --------------------------
  let L: LeafletNS | null = null;
  let map: LeafletMap | null = null;
  let mapEl: HTMLDivElement | undefined = $state();
  let pointsLayer: LeafletLayerGroup | null = null;
  let routeLayer: LeafletLayerGroup | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const name = DAYS[(d.getDay() + 6) % 7];
    return { value: i, label: i === 0 ? `Today (${name})` : i === 1 ? `Tomorrow (${name})` : name };
  });

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }
  function nowHHMM(): string {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function ymd(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }
  function fmt(sec: number): string {
    const pre = sec >= 86400 ? '+1 ' : '';
    const s = sec % 86400;
    return `${pre}${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`;
  }

  // -- Map init ----------------------------------------------------------
  onMount(async () => {
    try {
      const mod = (await import('leaflet')) as unknown as { default?: LeafletNS };
      L = mod.default ?? (mod as unknown as LeafletNS);
      await import('leaflet/dist/leaflet.css');
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return;
    }
    initWhenSized();
    const c = locationStore.position?.coords;
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      setPoint('from', c.latitude, c.longitude, 'My location');
    }
    applyQuery(); // shareable-link params override the GPS default
  });

  // -- Deep links (?from=lat,lon&fl=label&to=...&tl=...&t=HH:MM&d=offset) ----
  function parsePlace(coord: string | null, label: string | null): Place | null {
    if (!coord) return null;
    const [la, lo] = coord.split(',').map(Number);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    return { lat: la, lon: lo, label: label || `${la.toFixed(4)}, ${lo.toFixed(4)}` };
  }
  function applyQuery(): void {
    const sp = page.url.searchParams;
    const t = sp.get('t');
    if (t && /^\d{1,2}:\d{2}$/.test(t)) timeStr = t;
    const d = Number(sp.get('d'));
    if (Number.isInteger(d) && d >= 0 && d < 7) dayOffset = d;
    const pf = parsePlace(sp.get('from'), sp.get('fl'));
    const pt = parsePlace(sp.get('to'), sp.get('tl'));
    if (pf) setPoint('from', pf.lat, pf.lon, pf.label);
    if (pt) setPoint('to', pt.lat, pt.lon, pt.label);
    if (pf && pt) void plan();
  }
  function syncUrl(): void {
    if (!from || !to) return;
    const p = new URLSearchParams();
    p.set('from', `${from.lat.toFixed(5)},${from.lon.toFixed(5)}`);
    p.set('fl', from.label);
    p.set('to', `${to.lat.toFixed(5)},${to.lon.toFixed(5)}`);
    p.set('tl', to.label);
    p.set('t', timeStr);
    p.set('d', String(dayOffset));
    try {
      replaceState(`?${p.toString()}`, {});
    } catch {
      /* replaceState is a no-op outside the browser router */
    }
  }

  function initWhenSized(): void {
    const el = mapEl;
    const Lref = L;
    if (!el || !Lref) return;
    const doInit = () => {
      map = Lref.map(el, { zoomControl: false, attributionControl: true, center: FEED_CENTER, zoom: 13 });
      Lref.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: ' OpenStreetMap contributors',
        crossOrigin: 'anonymous',
      }).addTo(map);
      pointsLayer = Lref.layerGroup().addTo(map);
      routeLayer = Lref.layerGroup().addTo(map);
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const target = from ? 'to' : 'from';
        void reverseTap(target, e.latlng.lat, e.latlng.lng);
      });
      renderPoints();
      // If a shareable link auto-planned before the map had size, paint now.
      if (journeys.length) draw(journeys[selectedIdx]);
    };
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      doInit();
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const gate = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      gate.disconnect();
      doInit();
    });
    gate.observe(el);
  }

  onDestroy(() => {
    map?.remove();
    map = null;
  });

  // -- Point selection ---------------------------------------------------
  function setPoint(field: 'from' | 'to', lat: number, lon: number, label: string): void {
    const place = { lat, lon, label };
    if (field === 'from') {
      from = place;
      fromText = label;
    } else {
      to = place;
      toText = label;
    }
    results = [];
    activeField = null;
    renderPoints();
    map?.setView([lat, lon], Math.max(map.getZoom(), 14));
  }

  /** Map tap: use the tapped coordinate, labelled by the nearest stop name
   *  if one is close (offline, no geocoder), else the raw coordinate. */
  async function reverseTap(field: 'from' | 'to', lat: number, lon: number): Promise<void> {
    let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    try {
      const near = await getGtfsRepo().getStopsNear(lat, lon, 150, 1);
      if (near[0]?.name) label = `Near ${near[0].name}`;
    } catch {
      /* keep coordinate label */
    }
    setPoint(field, lat, lon, label);
  }

  function useMyLocation(): void {
    const c = locationStore.position?.coords;
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) {
      setPoint('from', c.latitude, c.longitude, 'My location');
    } else {
      error = 'Location not available yet -- tap the map or search a stop.';
    }
  }

  function onSearchInput(field: 'from' | 'to', text: string): void {
    activeField = field;
    if (field === 'from') fromText = text;
    else toText = text;
    if (searchTimer) clearTimeout(searchTimer);
    const q = text.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    searchTimer = setTimeout(async () => {
      const anchor = from ?? placeFromGps() ?? { lat: FEED_CENTER[0], lon: FEED_CENTER[1] };
      try {
        results = await getGtfsRepo().searchStops(q, anchor.lat, anchor.lon, 8, 'distance');
      } catch {
        results = [];
      }
    }, 220);
  }

  function placeFromGps(): { lat: number; lon: number } | null {
    const c = locationStore.position?.coords;
    return c && Number.isFinite(c.latitude) ? { lat: c.latitude, lon: c.longitude } : null;
  }

  function chooseStop(stop: StopWithDistance): void {
    if (activeField && stop.lat != null && stop.lon != null) {
      setPoint(activeField, stop.lat, stop.lon, stop.name);
    }
  }

  // -- Planning ----------------------------------------------------------
  async function plan(): Promise<void> {
    if (!from || !to) {
      error = 'Set both a start and a destination.';
      return;
    }
    syncUrl(); // keep the URL shareable / restorable
    const [h, m] = timeStr.split(':').map(Number);
    loading = true;
    error = null;
    journeys = [];
    try {
      const res = await getGtfsRepo().planJourney({
        fromLat: from.lat,
        fromLon: from.lon,
        toLat: to.lat,
        toLon: to.lon,
        localDate: ymd(dayOffset),
        departMin: (h || 0) * 60 + (m || 0),
        maxResults: 5,
      });
      journeys = res;
      selectedIdx = 0;
      if (res.length === 0) error = 'No transit journeys found for this time.';
      else draw(res[0]);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  // -- Map rendering ---------------------------------------------------
  function renderPoints(): void {
    if (!L || !pointsLayer) return;
    pointsLayer.clearLayers();
    if (from) dot(from.lat, from.lon, '#22c55e', 'Start');
    if (to) dot(to.lat, to.lon, '#ef4444', 'Destination');
  }
  function dot(lat: number, lon: number, color: string, tip: string): void {
    if (!L || !pointsLayer) return;
    L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
      .bindTooltip(tip, { direction: 'top' })
      .addTo(pointsLayer);
  }

  function draw(j: PlannerJourney): void {
    if (!L || !map || !routeLayer) return;
    const Lref = L;
    routeLayer.clearLayers();
    const bounds: [number, number][] = [];
    if (from) bounds.push([from.lat, from.lon]);
    if (to) bounds.push([to.lat, to.lon]);
    renderPoints();

    for (const leg of j.legs) {
      if (leg.kind === 'walk') {
        const pts: [number, number][] = [
          [leg.from.lat, leg.from.lon],
          [leg.to.lat, leg.to.lon],
        ];
        Lref.polyline(pts, { color: '#9aa5b4', weight: 4, dashArray: '2 8', opacity: 0.9 }).addTo(routeLayer);
        pts.forEach((p) => bounds.push(p));
      } else {
        const col = leg.routeColor || '#2563eb';
        // Real road geometry from shapes.txt when present; else through stops.
        const pts: [number, number][] =
          leg.shape && leg.shape.length >= 2
            ? leg.shape.map((p) => [p.lat, p.lon])
            : leg.stops.map((s) => [s.lat, s.lon]);
        Lref.polyline(pts, { color: col, weight: 6, opacity: 0.95 }).addTo(routeLayer);
        pts.forEach((p) => bounds.push(p));
        leg.stops.forEach((s, idx) => {
          const end = idx === 0 || idx === leg.stops.length - 1;
          Lref.circleMarker([s.lat, s.lon], {
            radius: end ? 6 : 3.5,
            color: col,
            weight: 2,
            fillColor: end ? '#fff' : col,
            fillOpacity: 1,
          })
            .bindTooltip(`${fmt(s.time)} - ${s.name}`, { direction: 'top' })
            .addTo(routeLayer);
        });
      }
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }

  function select(i: number): void {
    selectedIdx = i;
    draw(journeys[i]);
  }
</script>

{#snippet modeIcon(t: string)}
  {#if t === 'tram'}<TramFront size={12} />{:else}<Bus size={12} />{/if}
{/snippet}

<div class="flex flex-col gap-3 p-3">
  <!-- Search form -->
  <div class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 flex flex-col gap-2">
    <!-- From -->
    <div class="relative flex items-center gap-2">
      <span class="h-2.5 w-2.5 rounded-full bg-[#22c55e] shrink-0"></span>
      <input
        class="flex-1 h-10 px-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
        placeholder="Start (my location / stop)"
        bind:value={fromText}
        oninput={(e) => onSearchInput('from', e.currentTarget.value)}
        onfocus={() => (activeField = 'from')}
      />
      <button
        type="button"
        title="Use my location"
        class="h-10 w-10 grid place-items-center rounded-md border border-[color:var(--color-border)] text-[color:var(--color-fg-muted)] hover:text-[color:var(--color-primary)]"
        onclick={useMyLocation}
      >
        <LocateFixed size={18} />
      </button>
    </div>
    <!-- To -->
    <div class="relative flex items-center gap-2">
      <span class="h-2.5 w-2.5 rounded-full bg-[#ef4444] shrink-0"></span>
      <input
        class="flex-1 h-10 px-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
        placeholder="Destination (stop name)"
        bind:value={toText}
        oninput={(e) => onSearchInput('to', e.currentTarget.value)}
        onfocus={() => (activeField = 'to')}
      />
      <span class="h-10 w-10 grid place-items-center text-[color:var(--color-fg-muted)]"><Search size={18} /></span>
    </div>

    <!-- Suggestions -->
    {#if activeField && results.length}
      <div class="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] overflow-hidden">
        {#each results as s (s.id)}
          <button
            type="button"
            class="block w-full text-left px-3 py-2 text-sm border-b last:border-b-0 border-[color:var(--color-border)] hover:bg-[color:var(--color-surface)] text-[color:var(--color-fg)]"
            onclick={() => chooseStop(s)}
          >
            {s.name}
            {#if s.distance != null}<span class="text-[color:var(--color-fg-muted)]"> - {Math.round(s.distance)} m</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- When + plan -->
    <div class="flex items-center gap-2">
      <select
        class="h-10 px-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-fg)] text-sm"
        bind:value={dayOffset}
      >
        {#each dayOptions as d (d.value)}<option value={d.value}>{d.label}</option>{/each}
      </select>
      <input
        type="time"
        class="h-10 px-2 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-fg)] text-sm"
        bind:value={timeStr}
      />
      <button
        type="button"
        class="ml-auto h-10 px-4 rounded-md bg-[color:var(--color-primary)] text-[color:var(--color-primary-fg)] font-medium disabled:opacity-50"
        onclick={plan}
        disabled={loading || !from || !to}
      >
        {loading ? 'Planning...' : 'Plan'}
      </button>
    </div>

    <p class="text-xs text-[color:var(--color-fg-muted)]">
      Start defaults to your location. Tap the map to set start then destination, or search a stop.
    </p>
    {#if error}<p class="text-xs text-[color:var(--color-danger)]">{error}</p>{/if}
  </div>

  <!-- Map -->
  <div bind:this={mapEl} class="w-full h-[42vh] rounded-lg overflow-hidden border border-[color:var(--color-border)]"></div>

  <!-- Results -->
  {#each journeys as j, i (i)}
    {@const transit = j.legs.filter((l) => l.kind === 'transit')}
    <button
      type="button"
      class="text-left rounded-lg border p-3 transition-colors {i === selectedIdx
        ? 'border-[color:var(--color-primary)]'
        : 'border-[color:var(--color-border)]'} bg-[color:var(--color-surface)]"
      onclick={() => select(i)}
    >
      <div class="flex items-baseline justify-between">
        <span class="text-lg font-bold text-[color:var(--color-fg)]">{fmt(j.departTime)} -> {fmt(j.arriveTime)}</span>
        <span class="text-xs text-[color:var(--color-fg-muted)]">~{Math.round(j.durationSec / 60)} min</span>
      </div>
      <div class="text-xs text-[color:var(--color-fg-muted)] mb-2">
        {j.transfers} {j.transfers === 1 ? 'transfer' : 'transfers'}
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        {#each j.legs as leg, k}
          {#if k > 0}<ArrowRight size={12} class="text-[color:var(--color-fg-muted)]" />{/if}
          {#if leg.kind === 'walk'}
            <span class="text-xs px-2 py-1 rounded-md bg-[color:var(--color-bg)] text-[color:var(--color-fg-muted)]"><Footprints size={12} /> {Math.max(1, Math.round(leg.seconds / 60))}'</span>
          {:else}
            {#if leg.waitSec >= 60}<span class="text-xs px-2 py-1 rounded-md bg-[color:var(--color-bg)] text-[color:var(--color-fg-muted)]"><Hourglass size={12} /> {Math.round(leg.waitSec / 60)}'</span><ArrowRight size={12} class="text-[color:var(--color-fg-muted)]" />{/if}
            <span class="text-xs font-bold px-2 py-1 rounded-md text-white" style="background:{leg.routeColor || '#2563eb'}">{@render modeIcon(leg.routeType)} {leg.routeShortName}</span>
          {/if}
        {/each}
      </div>
      {#if i === selectedIdx}
        <div class="mt-3 border-t border-dashed border-[color:var(--color-border)] pt-2 flex flex-col gap-1.5">
          {#each j.legs as leg}
            {#if leg.kind === 'walk'}
              <div class="text-xs text-[color:var(--color-fg)]">
                <Footprints size={12} /> {leg.variant === 'access' ? 'Walk to stop' : leg.variant === 'egress' ? 'Walk to destination' : 'Walk to next stop'}
                {#if leg.to.name}<span class="text-[color:var(--color-fg-muted)]"> ({leg.to.name})</span>{/if}
                <span class="text-[color:var(--color-fg-muted)]"> - ~{leg.meters} m, {Math.max(1, Math.round(leg.seconds / 60))} min</span>
              </div>
            {:else}
              {#if leg.waitSec >= 60}
                <div class="text-xs text-[color:var(--color-fg-muted)]"><Hourglass size={12} /> Wait {Math.round(leg.waitSec / 60)} min at {leg.board.name}</div>
              {/if}
              <div class="text-xs text-[color:var(--color-fg)]">
                {@render modeIcon(leg.routeType)} <b>{leg.routeShortName}</b>
                {#if leg.headsign}<span class="text-[color:var(--color-fg-muted)]"> -> {leg.headsign}</span>{/if}
                <div class="text-[color:var(--color-fg-muted)]">{fmt(leg.board.time)} {leg.board.name} -> {fmt(leg.alight.time)} {leg.alight.name}</div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </button>
  {/each}
</div>
