/*
 * RAPTOR journey planner -- pure, framework-free, feed-agnostic.
 *
 * Round-based transit routing over GTFS: round k yields the earliest
 * arrival reachable with at most k vehicles, so we naturally get the
 * "fastest with N transfers" family instead of one convoluted path.
 * Prefer this over a plain Connection-Scan because CSA's per-stop labels
 * reconstruct phantom transfers (validated the difference in the Python
 * prototype behind this port).
 *
 * This module knows nothing about SQLite, stop names, coordinates, or
 * route colours. It operates on plain arrays and returns itineraries keyed
 * by stop/trip/route IDs plus times; the worker query layer hydrates those
 * into UI-facing legs. That keeps the algorithm unit-testable on tiny
 * synthetic networks with no DB and no DOM.
 *
 * Times are seconds since local midnight and MAY exceed 86400 (GTFS encodes
 * after-midnight trips as 25:10:00 etc.) -- never wrap them here.
 */

import { haversineMeters } from '@n3ary/gtfs-spec/shape';

// -- Inputs to preprocessing ---------------------------------------------

export interface StopTimeInput {
  stopId: string;
  /** seconds since midnight; may exceed 86400 */
  arr: number;
  dep: number;
}
export interface TripInput {
  tripId: string;
  serviceId: string;
  routeId: string;
  /** in stop_sequence order */
  stops: StopTimeInput[];
}
export interface StopPoint {
  id: string;
  lat: number;
  lon: number;
}

// -- Preprocessed network ------------------------------------------------

export interface RaptorTrip {
  tripId: string;
  serviceId: string;
  routeId: string;
  /** [arr, dep] per stop index, parallel to the pattern's stops */
  times: ReadonlyArray<readonly [number, number]>;
}
export interface Pattern {
  stops: readonly string[];
  /** sorted ascending by departure at the first stop */
  trips: readonly RaptorTrip[];
  /** depAt[stopIdx][tripIdx] = departure time; used for the earliest-trip search */
  depAt: readonly number[][];
}
export interface Footpath {
  to: string;
  seconds: number;
  meters: number;
}
export interface RaptorNetwork {
  patterns: readonly Pattern[];
  /** stopId -> [patternIdx, stopIdxWithinPattern][] */
  routesAtStop: ReadonlyMap<string, ReadonlyArray<readonly [number, number]>>;
  footpaths: ReadonlyMap<string, readonly Footpath[]>;
}

// -- Query + result ------------------------------------------------------

export interface StopWalk {
  stopId: string;
  seconds: number;
  meters: number;
}
export interface PlanQuery {
  access: readonly StopWalk[];
  egress: readonly StopWalk[];
  /** seconds since midnight */
  departTime: number;
  activeServices: ReadonlySet<string>;
  maxRounds?: number;
  transferPenaltySec?: number;
  maxResults?: number;
}
export type RaptorLeg =
  | {
      kind: 'walk';
      variant: 'access' | 'egress' | 'transfer';
      /** null for the origin (access) / destination (egress) endpoint */
      fromStop: string | null;
      toStop: string | null;
      seconds: number;
      meters: number;
    }
  | {
      kind: 'transit';
      tripId: string;
      routeId: string;
      boardStop: string;
      alightStop: string;
      boardTime: number;
      alightTime: number;
      stopIds: readonly string[];
      /** per stop: departure, except the alight stop which is arrival */
      stopTimes: readonly number[];
      /** seconds waited at the boarding stop; 0 for the first vehicle */
      waitSec: number;
    };
export interface RaptorJourney {
  departTime: number;
  arriveTime: number;
  durationSec: number;
  transfers: number;
  legs: readonly RaptorLeg[];
}

// -- Defaults ------------------------------------------------------------

const DEFAULTS = {
  maxRounds: 5,
  transferPenaltySec: 300,
  maxResults: 4,
  walkSpeedMps: 1.3,
  transferRadiusM: 200,
  minTransferSec: 60,
} as const;

// -- Preprocessing -------------------------------------------------------

/** Group trips into patterns (identical stop sequence). Trips with a
 *  missing arr/dep are dropped -- an incomplete row can't be scanned. */
export function buildPatterns(trips: readonly TripInput[]): Pick<RaptorNetwork, 'patterns' | 'routesAtStop'> {
  type MutablePattern = { stops: string[]; trips: RaptorTrip[]; depAt: number[][] };
  const patterns: MutablePattern[] = [];
  const routesAtStop = new Map<string, Array<readonly [number, number]>>();
  const byKey = new Map<string, number>();

  for (const trip of trips) {
    if (trip.stops.some((s) => !Number.isFinite(s.arr) || !Number.isFinite(s.dep))) continue;
    const stops = trip.stops.map((s) => s.stopId);
    const key = JSON.stringify(stops);
    let pi = byKey.get(key);
    if (pi === undefined) {
      pi = patterns.length;
      byKey.set(key, pi);
      patterns.push({ stops, trips: [], depAt: [] });
      stops.forEach((stopId, idx) => {
        const list = routesAtStop.get(stopId);
        const entry = [pi as number, idx] as const;
        if (list) list.push(entry);
        else routesAtStop.set(stopId, [entry]);
      });
    }
    patterns[pi].trips.push({
      tripId: trip.tripId,
      serviceId: trip.serviceId,
      routeId: trip.routeId,
      times: trip.stops.map((s) => [s.arr, s.dep] as const),
    });
  }

  for (const p of patterns) {
    p.trips.sort((a, b) => a.times[0][1] - b.times[0][1]);
    p.depAt = p.stops.map((_, i) => p.trips.map((tr) => tr.times[i][1]));
  }
  return { patterns, routesAtStop };
}

/** Symmetric walking transfers between nearby stops, via a spatial grid so
 *  we don't do an O(n^2) sweep. Straight-line -- the app can replace these
 *  with street distances later without touching the algorithm. */
export function buildFootpaths(
  stops: readonly StopPoint[],
  opts: { radiusM?: number; walkSpeedMps?: number; minTransferSec?: number } = {},
): Map<string, Footpath[]> {
  const radius = opts.radiusM ?? DEFAULTS.transferRadiusM;
  const speed = opts.walkSpeedMps ?? DEFAULTS.walkSpeedMps;
  const minTransfer = opts.minTransferSec ?? DEFAULTS.minTransferSec;
  const cell = radius / 111_000;
  const grid = new Map<string, StopPoint[]>();
  const key = (gx: number, gy: number) => `${gx}:${gy}`;
  for (const s of stops) {
    const k = key(Math.round(s.lat / cell), Math.round(s.lon / cell));
    const bucket = grid.get(k);
    if (bucket) bucket.push(s);
    else grid.set(k, [s]);
  }
  const foot = new Map<string, Footpath[]>();
  for (const s of stops) {
    const gx = Math.round(s.lat / cell);
    const gy = Math.round(s.lon / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of grid.get(key(gx + dx, gy + dy)) ?? []) {
          if (o.id === s.id) continue;
          const d = haversineMeters(s.lat, s.lon, o.lat, o.lon);
          if (d > radius) continue;
          const list = foot.get(s.id);
          const fp: Footpath = { to: o.id, seconds: Math.round(d / speed) + minTransfer, meters: Math.round(d) };
          if (list) list.push(fp);
          else foot.set(s.id, [fp]);
        }
      }
    }
  }
  return foot;
}

// -- Algorithm -----------------------------------------------------------

type Label =
  | { type: 'access'; seconds: number; meters: number }
  | { type: 'foot'; from: string; seconds: number; meters: number }
  | { type: 'trip'; patternIdx: number; tripIdx: number; boardIdx: number; thisIdx: number };

/** first index in `sorted` whose value is >= target */
function lowerBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function earliestTrip(p: Pattern, stopIdx: number, ready: number, active: ReadonlySet<string>): number {
  const deps = p.depAt[stopIdx];
  for (let t = lowerBound(deps, ready); t < p.trips.length; t++) {
    if (active.has(p.trips[t].serviceId)) return t;
  }
  return -1;
}

export function plan(net: RaptorNetwork, query: PlanQuery): RaptorJourney[] {
  const maxRounds = query.maxRounds ?? DEFAULTS.maxRounds;
  const penalty = query.transferPenaltySec ?? DEFAULTS.transferPenaltySec;
  const maxResults = query.maxResults ?? DEFAULTS.maxResults;
  const active = query.activeServices;

  const tau: Array<Map<string, number>> = [new Map()];
  const labels: Array<Map<string, Label>> = [new Map()];
  for (const a of query.access) {
    const t = query.departTime + a.seconds;
    if (t < (tau[0].get(a.stopId) ?? Infinity)) {
      tau[0].set(a.stopId, t);
      labels[0].set(a.stopId, { type: 'access', seconds: a.seconds, meters: a.meters });
    }
  }
  let marked = new Set<string>(tau[0].keys());

  for (let k = 1; k <= maxRounds; k++) {
    const tk = new Map(tau[k - 1]);
    const lk = new Map(labels[k - 1]);
    tau.push(tk);
    labels.push(lk);
    const prev = tau[k - 1];

    // routes to scan this round, each from its earliest marked stop
    const scan = new Map<number, number>();
    for (const s of marked) {
      const rs = net.routesAtStop.get(s);
      if (!rs) continue;
      for (const [pi, idx] of rs) {
        const cur = scan.get(pi);
        if (cur === undefined || idx < cur) scan.set(pi, idx);
      }
    }

    const newMarked = new Set<string>();
    for (const [pi, start] of scan) {
      const p = net.patterns[pi];
      let tripIdx = -1;
      let boardIdx = -1;
      for (let i = start; i < p.stops.length; i++) {
        const s = p.stops[i];
        if (tripIdx >= 0) {
          const arr = p.trips[tripIdx].times[i][0];
          if (arr < (tk.get(s) ?? Infinity)) {
            tk.set(s, arr);
            lk.set(s, { type: 'trip', patternIdx: pi, tripIdx, boardIdx, thisIdx: i });
            newMarked.add(s);
          }
        }
        const pr = prev.get(s);
        if (pr !== undefined && (tripIdx < 0 || pr <= p.trips[tripIdx].times[i][1])) {
          const nt = earliestTrip(p, i, pr, active);
          if (nt >= 0 && (tripIdx < 0 || nt < tripIdx)) {
            tripIdx = nt;
            boardIdx = i;
          }
        }
      }
    }

    for (const s of [...newMarked]) {
      const base = tk.get(s)!;
      for (const f of net.footpaths.get(s) ?? []) {
        if (base + f.seconds < (tk.get(f.to) ?? Infinity)) {
          tk.set(f.to, base + f.seconds);
          lk.set(f.to, { type: 'foot', from: s, seconds: f.seconds, meters: f.meters });
          newMarked.add(f.to);
        }
      }
    }

    marked = newMarked;
    if (marked.size === 0) break;
  }

  return enumerate(net, tau, labels, query, penalty, maxResults);
}

function enumerate(
  net: RaptorNetwork,
  tau: Array<Map<string, number>>,
  labels: Array<Map<string, Label>>,
  query: PlanQuery,
  penalty: number,
  maxResults: number,
): RaptorJourney[] {
  const egressMap = new Map(query.egress.map((e) => [e.stopId, e]));
  // Keep the best (lowest total arrival) journey per line-combination so
  // the user sees real alternatives (line 42 vs 19), not near-duplicates.
  const bySig = new Map<string, RaptorJourney>();

  for (let k = 1; k < tau.length; k++) {
    for (const e of query.egress) {
      const arrAtStop = tau[k].get(e.stopId);
      if (arrAtStop === undefined || !Number.isFinite(arrAtStop)) continue;
      const legs = reconstruct(net, labels, k, e.stopId, egressMap);
      const transit = legs.filter((l): l is Extract<RaptorLeg, { kind: 'transit' }> => l.kind === 'transit');
      if (transit.length === 0) continue;
      addWaits(legs);
      const total = arrAtStop + e.seconds;
      const depart = transit[0].boardTime;
      const sig = transit.map((l) => `${l.routeId}@${l.boardStop}`).join('>');
      const existing = bySig.get(sig);
      if (!existing || total < existing.arriveTime) {
        bySig.set(sig, {
          departTime: depart,
          arriveTime: total,
          durationSec: total - depart,
          transfers: transit.length - 1,
          legs,
        });
      }
    }
  }

  return [...bySig.values()]
    .sort((a, b) => a.arriveTime + a.transfers * penalty - (b.arriveTime + b.transfers * penalty))
    .slice(0, maxResults);
}

function reconstruct(
  net: RaptorNetwork,
  labels: Array<Map<string, Label>>,
  round: number,
  egressStop: string,
  egressMap: Map<string, StopWalk>,
): RaptorLeg[] {
  const legs: RaptorLeg[] = [];
  const ew = egressMap.get(egressStop)!;
  legs.push({ kind: 'walk', variant: 'egress', fromStop: egressStop, toStop: null, seconds: ew.seconds, meters: ew.meters });

  let s = egressStop;
  let k = round;
  for (let guard = 0; guard < 500; guard++) {
    const l = labels[k].get(s);
    if (!l) break;
    if (l.type === 'access') {
      legs.push({ kind: 'walk', variant: 'access', fromStop: null, toStop: s, seconds: l.seconds, meters: l.meters });
      break;
    }
    if (l.type === 'foot') {
      legs.push({ kind: 'walk', variant: 'transfer', fromStop: l.from, toStop: s, seconds: l.seconds, meters: l.meters });
      s = l.from;
      continue;
    }
    const p = net.patterns[l.patternIdx];
    const trip = p.trips[l.tripIdx];
    const stopIds: string[] = [];
    const stopTimes: number[] = [];
    for (let idx = l.boardIdx; idx <= l.thisIdx; idx++) {
      stopIds.push(p.stops[idx]);
      stopTimes.push(idx === l.thisIdx ? trip.times[idx][0] : trip.times[idx][1]);
    }
    legs.push({
      kind: 'transit',
      tripId: trip.tripId,
      routeId: trip.routeId,
      boardStop: p.stops[l.boardIdx],
      alightStop: p.stops[l.thisIdx],
      boardTime: trip.times[l.boardIdx][1],
      alightTime: trip.times[l.thisIdx][0],
      stopIds,
      stopTimes,
      waitSec: 0,
    });
    s = p.stops[l.boardIdx];
    k -= 1;
  }
  legs.reverse();
  return legs;
}

/** Fill transit `waitSec` at transfers (not the first vehicle -- the rider
 *  times their departure to catch it). */
function addWaits(legs: RaptorLeg[]): void {
  let ready: number | null = null;
  for (const l of legs) {
    if (l.kind === 'walk') {
      if (l.variant === 'transfer' && ready !== null) ready += l.seconds;
    } else {
      if (ready !== null) l.waitSec = Math.max(0, l.boardTime - ready);
      ready = l.alightTime;
    }
  }
}
