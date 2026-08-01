// View-model for /map/route/[id]/[[selected]]. Extracted from the
// route-map +page.svelte so the page stops being 1,467 lines and the
// view-model logic becomes independently understandable + testable.
//
// Owns:
//   - URL parsing (routeId, direction, selectedTripId, fromStopId)
//   - View payload loading (one async fetch per route+direction+date)
//   - Route + stop routes (for the stop popups)
//   - Per-trip pre-projected shape plans
//   - Orphan vehicles on (route, dir) not in view.trips
//   - The render-ready markers list (the biggest derivation: 260 lines
//     of per-tick prediction logic — GPS-anchored position with
//     dead-reckon fallback, deadhead handling, ETA-to-from-stop, etc.)
//   - Derived geometry: hasStartVehicle, isCircular, overallBearing
//   - Header strings: originStopName, terminusStopName, headsign,
//     headerTitle, headerSubtitle
//   - Home direction/trip for swap-direction-restore
//
// The page composes this with `<RouteMap>` (Leaflet integration) and
// the header card. The composable returns an object with everything
// the page and the map component need; nothing imperative about
// Leaflet crosses this boundary.

import { feedsStore } from '$lib/stores/feedsStore.svelte';
import { feedConfigStore } from '$lib/stores/feedConfigStore.svelte';
import { nowTicker } from '$lib/stores/nowTicker.svelte';
import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
import { refreshBus } from '$lib/stores/refreshBus.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';
import { parseRouteIdWithDirection } from '$lib/data/gtfs/parseRouteIdWithDirection';
import { getGtfsRepo } from '$lib/data/gtfs/repo';
import type { Network, Route, RouteTag } from '$lib/domain/types';
import { vehicleTypeLabel } from '$lib/domain/types';
import { dateKeyInTz, minSinceMidnightInTz } from '$lib/domain/pipeline/timeUtils';
import { clockToBucket } from '$lib/domain/timeOfDay';
import {
  buildTripShapePlan,
  deadReckonGpsAlongShape,
  predictPosition,
  predictPositionOnShape,
  predictPositionFromGps,
  type TripShapePlan,
} from '$lib/domain/predictPosition';
import { predictArrivalFromGps } from '$lib/domain/predictArrivalAlongShape';
import { haversineMeters, measurePolyline, projectOnPolyline, bearingBetween } from '@n3ary/gtfs-spec/shape';
import { page } from '$app/state';
import type { RouteMapView } from '$lib/data/gtfs/types';
import type { VehicleMarker } from '$lib/map/routeMapPopupHtml';

const START_VEHICLE_RADIUS_M = 200;
const CIRCULAR_MAX_M = 200;
// Lookback / lookahead window for the route-active-trips query.
// 90 min in each direction comfortably covers normal urban trip
// lengths plus a head/tail buffer.
const LOOKBACK_MIN = 90;
const LOOKAHEAD_MIN = 90;

export function useRouteMapView(): {
  // URL-derived
  routeId: string;
  direction: 0 | 1 | null;
  selectedTripId: string | null;
  fromStopId: string | null;
  // Data
  view: RouteMapView | null;
  route: Route | null;
  error: string | null;
  routeTags: Map<string, RouteTag>;
  networkMap: Map<string, Network>;
  // Per-view derivations
  stopRoutes: Map<string, Route[]>;
  tz: string;
  nowMin: number;
  // Markers + geometry
  markers: VehicleMarker[];
  hasStartVehicle: boolean;
  isCircular: boolean;
  overallBearing: number;
  // Header
  originStopName: string | null;
  terminusStopName: string | null;
  headsign: string | null;
  headerTitle: string;
  headerSubtitle: string | null;
  // For swap-direction restore
  homeDirection: 0 | 1 | null;
  homeSelectedTripId: string | null;
} {
  // ── URL params ──────────────────────────────────────────────────────
  // Same `[id]_[dir]` convention the schedule view uses — parser
  // shared via lib/data/gtfs/parseRouteIdWithDirection.
  const idSegment = $derived(page.params.id ?? '');
  const parsed = $derived(parseRouteIdWithDirection(idSegment));
  const routeId = $derived(parsed.routeId);
  const direction = $derived(parsed.direction);
  const selectedTripId = $derived(page.params.selected ?? null);
  // Origin stop the user came from when they tapped 'map' on a station-card
  // vehicle row. Painted in green on the route so the rider can recognise
  // 'this is the stop I was at'. Null when the URL has no `?from` param
  // (e.g. arriving via favorites, browser history, deep link). GTFS
  // stop_id is a free-form string per spec.
  const fromStopId = $derived<string | null>(
    page.url.searchParams.get('from'),
  );

  // Remember the original direction + trip so that swapping twice restores
  // the highlight. Captured once on first arrival; swapping to the other
  // direction and back re-selects the trip the user navigated here with.
  let homeDirection = $state<0 | 1 | null>(null);
  let homeSelectedTripId = $state<string | null>(null);
  $effect(() => {
    const dir = direction;
    const sel = selectedTripId;
    if (dir != null && homeDirection === null) {
      homeDirection = dir;
      homeSelectedTripId = sel;
    }
  });

  // ── Data ────────────────────────────────────────────────────────────
  let view = $state<RouteMapView | null>(null);
  let error = $state<string | null>(null);
  let routeTags = $state<Map<string, RouteTag>>(new Map());
  let networkMap = $state<Map<string, Network>>(new Map());

  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid) return;
    void getGtfsRepo().getRouteTags().then((tags) => {
      routeTags = new Map(tags.map((t) => [t.id, t]));
    });
    void getGtfsRepo().getNetworks().then((nets) => {
      networkMap = new Map(nets.map((n) => [n.id, n]));
    });
  });

  const tz = $derived(feedsStore.activeTimezone);
  const nowMin = $derived(minSinceMidnightInTz(nowTicker.ms, tz));

  $effect(() => {
    const fid = feedsStore.boundFeedId;
    if (!fid || direction == null || routeId.length === 0) return;
    refreshBus.tick;
    const rid = routeId;
    const dir = direction;
    const ms = nowTicker.ms;
    // Window query depends on nowTicker for service-date pickup,
    // but we don't want to refetch every minute — just on first
    // load + dir change + manual refresh.
    void ms;
    (async () => {
      try {
        const repo = getGtfsRepo();
        const nowMs = Date.now();
        const localDate = dateKeyInTz(nowMs, tz);
        view = await repo.getRouteMapView(
          rid, dir, localDate,
          minSinceMidnightInTz(nowMs, tz),
          LOOKBACK_MIN, LOOKAHEAD_MIN,
        );
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    })();
  });

  const route = $derived(view?.route ?? null);

  // Routes per stop — fetched once when the view payload arrives so
  // the stop popup can show route badges without a per-click async call.
  let stopRoutes = $state<Map<string, Route[]>>(new Map());
  $effect(() => {
    const stops = view?.stops;
    if (!stops || stops.length === 0) return;
    const repo = getGtfsRepo();
    void (async () => {
      const entries = await Promise.all(
        stops.map(async (s) => [s.stopId, await repo.getRoutesForStop(s.stopId)] as const),
      );
      stopRoutes = new Map(entries);
    })();
  });

  // Pre-projected per-trip shape plans. Built once when the view
  // payload arrives and reused on every nowMin tick — the per-tick
  // cost is then a binary search + interpolation per visible
  // vehicle. Trips with no usable shape get `null` here and the UI
  // falls back to straight-line interpolation between stops.
  const tripPlans = $derived.by<Map<string, TripShapePlan | null>>(() => {
    const map = new Map<string, TripShapePlan | null>();
    if (!view) return map;
    for (const t of view.trips) {
      map.set(t.tripId, buildTripShapePlan(t.stops, view.shape));
    }
    return map;
  });

  // Live observations on (routeId, direction) whose trip didn't
  // surface in view.trips. Sourced from the worker's reconciliation
  // broadcast — these are the kind:'gps-only' rows: the worker matched
  // every scheduled trip it could via (route, dir, tripStartMin)
  // tolerance, and anything left over on this (route, dir) is a
  // genuine orphan. We render them at raw GPS (no shape projection
  // — we don't have stop_times for these tripIds, and the static
  // schedule doesn't have a matching trip we could ride a polyline
  // along). The bus is *there* now; the next poll updates it.
  const orphanVehicles = $derived.by(() => {
    if (!view) return [];
    return reconciledVehiclesStore.vehicles.filter(
      (v) =>
        v.kind === 'gps-only' &&
        v.route.id === routeId &&
        v.directionId === direction &&
        v.position != null,
    );
  });

  // ── Derived view-model ──────────────────────────────────────────────
  /** Render-ready vehicles for the current nowMin. Each trip yields
   *  one entry; the domain decides position + status, the UI maps
   *  status → opacity / style.
   *
   *  `scheduled` = vehicle is at origin waiting to depart ('at-origin')
   *  or not yet close enough to be imminent ('before', next trip only).
   *  Scheduled vehicles show with an outlined badge so the user knows
   *  position is a schedule estimate, not a live/interpolated position. */
  const markers = $derived.by<VehicleMarker[]>(() => {
    if (!view) return [];
    // Snapshot `view` into a non-null local so the nested closures
    // below (computeArrivingInMin, the stop forEach inside the trips
    // loop) narrow correctly under TypeScript's strict null checks.
    const curView = view;
    const out: VehicleMarker[] = [];
    let nextScheduledShown = false;
    const nowMs = nowTicker.ms;

    // Pre-compute the from-stop's position (when the URL carries
    // `?from=<stopId>`) plus the speed-cascade context, so the
    // per-marker arrival-to-from-stop ETA below is a one-liner
    // instead of duplicating projection / TOD-bucket lookups per
    // marker. fromTarget is null when there's no selected origin
    // stop, in which case computeArrivingInMin always returns null.
    const fromTarget = ((): { lat: number; lon: number } | null => {
      if (fromStopId == null) return null;
      const s = curView.stops.find((x) => x.stopId === fromStopId);
      return s ? { lat: s.lat, lon: s.lon } : null;
    })();
    const arrivingTodBucket = clockToBucket(
      minSinceMidnightInTz(nowMs, tz),
      feedConfigStore.todProfile,
    );
    const measuredShape = curView.shape.length >= 2 ? measurePolyline(curView.shape) : null;
    const stopDistCache = new Map<string, number[]>();
    const stopDistAlongM = (tripId: string, stops: RouteMapView['trips'][number]['stops']): number[] => {
      const cached = stopDistCache.get(tripId);
      if (cached) return cached;
      if (!measuredShape) return [];
      const out = stops.map((s) =>
        typeof s.distAlongM === 'number'
          ? s.distAlongM
          : projectOnPolyline({ lat: s.lat, lon: s.lon }, measuredShape.points).distAlongM,
      );
      stopDistCache.set(tripId, out);
      return out;
    };
    // Single GPS-anchored ETA call site for the popup `arriving in N min`
    // row. Delegates the dead-reckon + per-segment + dwell walk to the
    // shared domain helper used by station applyGpsEta, so the two views
    // can never diverge. Schedule-only fallback (no GPS) uses the trip's
    // own scheduled arrival at the from-stop.
    const computeArrivingInMin = (opts: {
      rawGpsLat: number | null;
      rawGpsLon: number | null;
      scheduledAtOrigin: boolean;
      etaSource: 'gps' | 'schedule';
      speedMs: number | null;
      gpsAsOfMs: number | null;
      directionId: 0 | 1 | -1;
      scheduledFromArrivalMin: number | null;
      dwellStopDistAlongM: ReadonlyArray<number> | null;
    }): number | null => {
      if (!fromTarget || opts.scheduledAtOrigin) return null;
      if (opts.etaSource === 'schedule') {
        if (opts.scheduledFromArrivalMin == null) return null;
        const m = opts.scheduledFromArrivalMin - nowMin;
        return m > 0 ? m : null;
      }
      if (
        curView.shape.length < 2 ||
        opts.rawGpsLat == null ||
        opts.rawGpsLon == null ||
        opts.gpsAsOfMs == null
      ) return null;
      const { arrival } = predictArrivalFromGps({
        obs: {
          lat: opts.rawGpsLat,
          lon: opts.rawGpsLon,
          speedMs: opts.speedMs,
          asOfMs: opts.gpsAsOfMs,
        },
        polyline: curView.shape,
        stopPos: fromTarget,
        nowMs,
        todBucket: arrivingTodBucket,
        feedConfig: feedConfigStore.speedConfig,
        vehicleDirectionId: opts.directionId === -1 ? undefined : opts.directionId,
        dwellStopDistAlongM: opts.dwellStopDistAlongM ?? undefined,
        dwellSecondsPerStop: feedConfigStore.dwellSec,
        ctx: {
          feedConfig: feedConfigStore.speedConfig,
          timezone: tz,
          todProfile: feedConfigStore.todProfile,
        },
      });
      return arrival.minutes > 0 ? Math.round(arrival.minutes) : null;
    };

    // Hard cap on GPS-fix age before we stop showing the orphan marker
    // at all — the same 15-min ceiling `deadReckonGpsAlongShape`
    // enforces for tracked vehicles.
    const STALE_HARD_MAX_MS = 15 * 60_000;

    // Index reconciled vehicles by their (static) tripId so each
    // iteration is O(1). The worker matched by (route, dir,
    // tripStartMin) tolerance — NOT by string-equality on tripId —
    // so live observations whose tripId drifted from static still
    // resolve correctly here.
    const reconciledByTripId = new Map<string, (typeof reconciledVehiclesStore.vehicles)[number]>();
    for (const v of reconciledVehiclesStore.vehicles) {
      if (v.tripId) reconciledByTripId.set(v.tripId, v);
    }

    // Sort by tripStartMin so the soonest not-yet-departed trip always wins
    // the single origin slot, regardless of query order from the DB.
    const trips = [...view.trips].sort((a, b) => a.tripStartMin - b.tripStartMin);
    for (const t of trips) {
      const plan = tripPlans.get(t.tripId);
      // GPS-anchored prediction takes priority when the worker reconciled
      // this trip to a live fix; fall back to schedule interpolation
      // otherwise.
      const reconciled = reconciledByTripId.get(t.tripId);
      let p: ReturnType<typeof predictPositionOnShape> | null = null;
      let gpsConfidence: 'good' | 'stale' | 'very-stale' | null = null;
      if (plan && reconciled?.kind === 'tracked' && reconciled.position) {
        const pos = reconciled.position;
        const gps = predictPositionFromGps(
          plan,
          { lat: pos.lat, lon: pos.lon, speedMs: pos.speedMs ?? null, asOfMs: pos.asOf },
          nowMs,
          { timezone: tz },
          feedConfigStore.dwellSec,
        );
        if (gps) {
          p = gps;
          gpsConfidence =
            gps.freshness === 'fresh' ? 'good'
            : gps.freshness === 'stale' ? 'stale'
            : 'very-stale';
        }
        // No `else` fallback: predictPositionFromGps already walks the
        // fix forward within the dead-reckon window. Anything older
        // than 15 min returns null and we fall through to schedule
        // prediction so the marker doesn't freeze on a 30-min-old
        // GPS sample.
      }
      if (!p) {
        p = plan
          ? predictPositionOnShape(plan, nowMin)
          : predictPosition(t.stops, nowMin);
      }
      if (!p) continue;
      // Past terminus — drop entirely.
      if (p.status === 'after') continue;
      // 'before' and 'at-origin' are both "not yet departed from origin":
      // show only the soonest one so bubbles don't stack at the origin stop.
      if (p.status === 'before' || p.status === 'at-origin') {
        if (nextScheduledShown) continue;
        nextScheduledShown = true;
      }
      out.push({
        tripId: t.tripId,
        headsign: t.headsign,
        lat: p.lat,
        lon: p.lon,
        opacity: 0.9,
        selected: t.tripId === selectedTripId,
        tripStartMin: t.tripStartMin,
        scheduled: p.status === 'before' || p.status === 'at-origin',
        gpsConfidence,
        kind: reconciled?.kind ?? 'scheduled',
        directionId: (reconciled?.directionId ?? (direction as 0 | 1)) as 0 | 1 | -1,
        gpsAsOfMs: reconciled?.position?.asOf ?? null,
        hasOriginTime: true,
        arrivingInMin: computeArrivingInMin({
          rawGpsLat: reconciled?.position?.lat ?? null,
          rawGpsLon: reconciled?.position?.lon ?? null,
          scheduledAtOrigin: p.status === 'before' || p.status === 'at-origin',
          etaSource: reconciled?.position ? 'gps' : 'schedule',
          speedMs: reconciled?.position?.speedMs ?? null,
          gpsAsOfMs: reconciled?.position?.asOf ?? null,
          directionId: (reconciled?.directionId ?? (direction as 0 | 1)) as 0 | 1 | -1,
          scheduledFromArrivalMin:
            fromStopId == null
              ? null
              : (t.stops.find((s) => s.stopId === fromStopId)?.arrivalMin ?? null),
          dwellStopDistAlongM: stopDistAlongM(t.tripId, t.stops),
        }),
      });
    }

    // Orphans: live buses the worker couldn't match to any active
    // scheduled trip on this (route, dir). Rendered at raw GPS — no
    // shape projection because we don't have stop_times for them.
    // Cap by STALE_HARD_MAX_MS to drop markers whose last fix is
    // ancient.
    for (const v of orphanVehicles) {
      if (!v.position) continue;
      const age = nowMs - v.position.asOf;
      if (age > STALE_HARD_MAX_MS) continue;
      const tripId = v.tripId ?? v.id;
      // Orphans carry route + direction, so they get the same
      // dead-reckon walk as tracked vehicles — on the view's shape,
      // with the view's stop distances for dwell. The marker then
      // agrees with its own popup ETA (which already walked) instead
      // of sitting at the raw fix while the ETA claims it arrived.
      const orphanStopDistAlongM = stopDistAlongM(tripId, curView.stops);
      const walked = measuredShape
        ? deadReckonGpsAlongShape(
            {
              lat: v.position.lat,
              lon: v.position.lon,
              speedMs: v.position.speedMs ?? null,
              asOfMs: v.position.asOf,
            },
            measuredShape,
            nowMs,
            {
              feedConfig: feedConfigStore.speedConfig,
              timezone: tz,
              todProfile: feedConfigStore.todProfile,
            },
            {
              stopDistAlongM: orphanStopDistAlongM,
              dwellSecondsPerStop: feedConfigStore.dwellSec,
            },
          )
        : null;
      out.push({
        tripId,
        headsign: v.headsign ?? null,
        lat: walked?.position.lat ?? v.position.lat,
        lon: walked?.position.lon ?? v.position.lon,
        opacity: 0.9,
        selected: tripId === selectedTripId,
        // Worker sets schedule.tripStartMin on orphans when the live
        // obs carries a parseable start time; fall back to nowMin so
        // sort order stays defined.
        tripStartMin: v.schedule?.tripStartMin ?? nowMin,
        scheduled: false,
        // Orphan freshness mirrors the reconciled bands so the marker
        // styling matches.
        gpsConfidence:
          age < 3 * 60_000 ? 'good'
          : age < 5 * 60_000 ? 'stale'
          : 'very-stale',
        kind: v.kind,
        directionId: v.directionId ?? -1,
        gpsAsOfMs: v.position.asOf,
        hasOriginTime: v.schedule?.tripStartMin != null,
        arrivingInMin: computeArrivingInMin({
          rawGpsLat: v.position.lat,
          rawGpsLon: v.position.lon,
          scheduledAtOrigin: false,
          etaSource: 'gps',
          speedMs: v.position.speedMs ?? null,
          gpsAsOfMs: v.position.asOf,
          directionId: v.directionId ?? -1,
          scheduledFromArrivalMin: null,
          // Same stop list the orphan marker walks against, so the
          // ETA's dwell term matches the walked position.
          dwellStopDistAlongM: orphanStopDistAlongM,
        }),
      });
    }
    return out;
  });

  // True when at least one active vehicle marker sits within
  // START_VEHICLE_RADIUS_M of the route's origin — the "start
  // vehicle" that gets a direction arrow next to it. When false,
  // the origin stop takes over the direction cue via a play icon
  // (see the stops-render effect). Recomputes on every tick since
  // `markers` does; boolean output means downstream effects only
  // re-run on the rare transition edge, not per tick.
  const hasStartVehicle = $derived.by(() => {
    if (!view || markers.length === 0) return false;
    const origin = view.stops[0];
    if (!origin) return false;
    for (const m of markers) {
      if (haversineMeters(origin.lat, origin.lon, m.lat, m.lon) < START_VEHICLE_RADIUS_M) {
        return true;
      }
    }
    return false;
  });

  // Circular route: origin and terminus resolve to the same physical
  // stop (either identical stop_id, or so close they might as well
  // be — 200 m catches loops with paired origin / terminus stops on
  // opposite kerbs). Detected from the shape data alone, no
  // per-feed hint. Direction-of-travel cues are suppressed for
  // circular routes since "start" and "end" collapse and a single
  // arrow at one point on the loop just adds noise.
  const isCircular = $derived.by(() => {
    if (!view || view.stops.length < 2) return false;
    const first = view.stops[0];
    const last = view.stops[view.stops.length - 1];
    if (first.stopId === last.stopId) return true;
    return haversineMeters(first.lat, first.lon, last.lat, last.lon) < CIRCULAR_MAX_M;
  });

  // Overall direction of travel: initial bearing on the great-circle
  // from the route's origin stop to its terminus stop. Prefer this
  // over `bearingAtDistance(measured, 0)` (initial segment) because
  // the shape often wiggles for the first few metres out of the
  // terminal — a segment-0 arrow can point 45° off from the way the
  // route actually heads, which confuses more than it clarifies.
  // Meaningful only when the route is not circular (endpoints
  // collapse); the callers gate on `!isCircular` before rendering.
  const overallBearing = $derived.by(() => {
    if (!view || view.stops.length < 2) return 0;
    const a = view.stops[0];
    const b = view.stops[view.stops.length - 1];
    // bearingBetween lives in @n3ary/gtfs-spec/shape and returns
    // a number (degrees CW from N).
    return bearingBetween(a, b);
  });

  // ── Title / subtitle ───────────────────────────────────────────────
  // Mirrors the schedule view: title is the origin station name
  // (i.e. 'departures from here'), subtitle is the headsign —
  // operator-published when available, falling back to the
  // terminus stop name. The route badge on the left already
  // carries route identity; repeating 'Bus 40' as the title was
  // redundant.
  const originStopName = $derived(view?.stops[0]?.stopName ?? null);
  const terminusStopName = $derived(
    view ? view.stops[view.stops.length - 1]?.stopName ?? null : null,
  );
  const headsign = $derived(view?.trips[0]?.headsign ?? terminusStopName);
  const headerTitle = $derived(
    originStopName
    ?? (route ? `${vehicleTypeLabel(route.type ?? 'unknown')} ${route.shortName}` : ''),
  );
  const headerSubtitle = $derived(headsign ? `→ ${headsign}` : null);

  return {
    // URL — getters so the consumer sees live values, not a
    // destructured snapshot. Without these the page would render
    // the initial routeId / direction / view / markers and never
    // re-render when any of them change.
    get routeId() { return routeId; },
    get direction() { return direction; },
    get selectedTripId() { return selectedTripId; },
    get fromStopId() { return fromStopId; },
    // Data
    get view() { return view; },
    get route() { return route; },
    get error() { return error; },
    get routeTags() { return routeTags; },
    get networkMap() { return networkMap; },
    get stopRoutes() { return stopRoutes; },
    get tz() { return tz; },
    get nowMin() { return nowMin; },
    // Markers + geometry
    get markers() { return markers; },
    get hasStartVehicle() { return hasStartVehicle; },
    get isCircular() { return isCircular; },
    get overallBearing() { return overallBearing; },
    // Header
    get originStopName() { return originStopName; },
    get terminusStopName() { return terminusStopName; },
    get headsign() { return headsign; },
    get headerTitle() { return headerTitle; },
    get headerSubtitle() { return headerSubtitle; },
    // Swap restore
    get homeDirection() { return homeDirection; },
    get homeSelectedTripId() { return homeSelectedTripId; },
  };
}

