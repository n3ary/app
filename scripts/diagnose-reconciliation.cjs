#!/usr/bin/env node
/**
 * diagnose-reconciliation.cjs — per-(route, direction) census against
 * the live Cluj GTFS-RT feed and the published static sqlite.
 *
 * Compares four quantities the app produces today against a sane
 * ground-truth derived from the same data:
 *
 *   active_sched   — scheduled trips currently in transit per static
 *                    schedule (origin departure ≤ now ≤ terminus arrival),
 *                    filtered to today's active services.
 *   live_obs       — live observations on (route_id, direction_id) carrying
 *                    a non-empty trip_id.
 *   tol_match      — count of (live, sched) pairs the reconciler WOULD
 *                    match via (route, dir, tripStartMin) adaptive
 *                    tolerance.
 *   tid_match      — count of (live, sched) pairs that match via
 *                    string-equality on trip_id (what the map page
 *                    currently uses).
 *   today_dup      — live observations that DO match a scheduled trip by
 *                    timing tolerance but NOT by trip_id equality. This
 *                    is the duplicate-marker count on the map today.
 *   map_today      — markers the map renders today: view.trips active in
 *                    [-90, +90] window + orphan live obs not in
 *                    view.trips by trip_id.
 *   map_fixed      — markers after centralized reconciliation: same
 *                    view.trips count, but orphans are only the
 *                    timing-tolerance-orphans (true orphans).
 *
 * Usage:
 *   node neary/scripts/diagnose-reconciliation.cjs > report.txt
 *
 * Requires /tmp/neary-data/cluj.sqlite3 and /tmp/neary-data/vp.pb
 * (fetched manually before running — script doesn't network out).
 */

const path = require('path');
// Resolve relative to this file so the script is portable across checkouts.
// Expects neary-gtfs (better-sqlite3 source) as a sibling repo, which is
// where the diagnostic script's runtime dep lives.
const NEARY = path.resolve(__dirname, '..');
const NEARY_GTFS = path.resolve(NEARY, '..', 'neary-gtfs');
const Database = require(path.join(NEARY_GTFS, 'node_modules', 'better-sqlite3'));
const GtfsRealtimeBindings = require(path.join(NEARY, 'node_modules', 'gtfs-realtime-bindings'));
const { readFileSync } = require('fs');

// ── timezone-aware now in feed-local minutes-since-midnight ──
const FEED_TZ = 'Europe/Bucharest';
function localMinAt(date) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: FEED_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}
function localDateAt(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: FEED_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(date).replace(/-/g, '');
}
function localDayOfWeekAt(date) {
  // 0 = Sunday, 6 = Saturday
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: FEED_TZ, weekday: 'short' });
  const wd = fmt.format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}
function hhmmToMin(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// ── load data ──
const NOW = new Date();
const nowMin = localMinAt(NOW);
const localDate = localDateAt(NOW);
const dow = localDayOfWeekAt(NOW);

const db = new Database('/tmp/neary-data/cluj.sqlite3', { readonly: true });

// Active services today
const dayCols = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const activeServices = db
  .prepare(
    `SELECT service_id FROM calendar
     WHERE ${dayCols[dow]} = 1
       AND start_date <= ? AND end_date >= ?`,
  )
  .all(localDate, localDate)
  .map((r) => r.service_id);
if (activeServices.length === 0) {
  console.error('no active services for', localDate, dayCols[dow]);
  process.exit(1);
}

// Live RT
const live = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
  readFileSync('/tmp/neary-data/vp.pb'),
);
const liveObs = [];
for (const e of live.entity) {
  const t = e.vehicle && e.vehicle.trip;
  if (!t || !t.tripId) continue;
  // Cluj direction-from-trip-id workaround.
  let dir = t.directionId;
  const seg = t.tripId.split('_');
  if (seg.length >= 2) {
    const fromId = Number(seg[1]);
    if (fromId === 0 || fromId === 1) dir = fromId;
  }
  liveObs.push({
    tripId: t.tripId,
    routeId: t.routeId,
    directionId: dir,
    startTime: t.startTime || '',
  });
}

// All scheduled trips today per route+dir with tripStartMin + tripEndMin.
const tripRows = db
  .prepare(
    `SELECT t.trip_id, t.route_id, t.direction_id,
            (SELECT departure_time FROM stop_times
              WHERE trip_id = t.trip_id
              ORDER BY stop_sequence ASC LIMIT 1) AS start_time,
            (SELECT arrival_time FROM stop_times
              WHERE trip_id = t.trip_id
              ORDER BY stop_sequence DESC LIMIT 1) AS end_time
     FROM trips t
     WHERE t.service_id IN (${activeServices.map(() => '?').join(',')})`,
  )
  .all(...activeServices);

// Bucket by (route, dir).
const byKey = new Map();
function key(route, dir) { return `${route}|${dir}`; }
for (const r of tripRows) {
  if (r.direction_id !== 0 && r.direction_id !== 1) continue;
  const k = key(r.route_id, r.direction_id);
  if (!byKey.has(k)) byKey.set(k, { scheduled: [], live: [] });
  byKey.get(k).scheduled.push({
    tripId: r.trip_id,
    tripStartMin: hhmmToMin(r.start_time),
    tripEndMin: hhmmToMin(r.end_time),
  });
}
for (const o of liveObs) {
  const k = key(o.routeId, o.directionId);
  if (!byKey.has(k)) byKey.set(k, { scheduled: [], live: [] });
  byKey.get(k).live.push(o);
}

// Parse live start time: prefer startTime, fall back to trip_id _HHMM tail.
function parseLiveStart(obs) {
  if (obs.startTime) return hhmmToMin(obs.startTime);
  const m = obs.tripId.match(/_(\d{3,4})$/);
  if (!m) return null;
  const s = m[1].padStart(4, '0');
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(2));
}

// Adaptive tolerance: median gap / 2 in [1, 30].
function computeTolerance(starts) {
  if (starts.length < 2) return 5;
  const sorted = [...starts].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.max(1, Math.min(30, Math.round(median / 2)));
}

// Per cohort, compute stats.
const ACTIVE_BUFFER = 5; // min — accommodates pre-departure / post-arrival GPS
const MAP_WINDOW_MIN = 90; // matches getRouteMapView

const routes = db.prepare(`SELECT route_id, route_short_name FROM routes`).all();
const routeShort = new Map(routes.map((r) => [r.route_id, r.route_short_name]));

const rows = [];
for (const [k, cohort] of byKey) {
  const [route, dir] = k.split('|');
  const sched = cohort.scheduled;
  const lives = cohort.live;
  if (sched.length === 0 && lives.length === 0) continue;

  // active_sched
  const activeSched = sched.filter(
    (s) => nowMin >= s.tripStartMin - ACTIVE_BUFFER && nowMin <= s.tripEndMin + ACTIVE_BUFFER,
  );

  // view.trips (the map's window-active set)
  const viewTrips = sched.filter(
    (s) =>
      s.tripStartMin >= nowMin - MAP_WINDOW_MIN &&
      s.tripStartMin <= nowMin + MAP_WINDOW_MIN &&
      s.tripEndMin >= nowMin,
  );

  // tid_match: live obs whose tripId is in view.trips by string equality
  const viewTripIds = new Set(viewTrips.map((s) => s.tripId));
  let tidMatch = 0;
  for (const o of lives) if (viewTripIds.has(o.tripId)) tidMatch += 1;

  // today_orphans (string-equality orphans, what map emits today)
  const todayOrphans = lives.length - tidMatch;

  // tol_match: bipartite greedy by (live, sched) timing tolerance
  const tol = computeTolerance(sched.map((s) => s.tripStartMin));
  const pairs = [];
  for (const o of lives) {
    const ls = parseLiveStart(o);
    if (ls == null) continue;
    for (const s of activeSched) {
      const d = Math.abs(s.tripStartMin - ls);
      if (d > tol) continue;
      pairs.push({ o, s, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const matchedLive = new Set();
  const matchedSched = new Set();
  for (const p of pairs) {
    if (matchedLive.has(p.o) || matchedSched.has(p.s)) continue;
    matchedLive.add(p.o);
    matchedSched.add(p.s);
  }
  const tolMatch = matchedLive.size;
  // true orphans = live obs not matched by tolerance
  const trueOrphans = lives.length - tolMatch;
  // today_dup = (tolerance-matched) − (tripId-equality-matched), assuming
  // tid_match ⊆ tol_match (usually true).
  const todayDup = Math.max(0, tolMatch - tidMatch);

  // map_today  = view.trips markers + tid-orphan markers (what user sees)
  const mapToday = viewTrips.length + todayOrphans;
  // map_fixed  = view.trips markers + true_orphans (after centralized reconciliation)
  const mapFixed = viewTrips.length + trueOrphans;

  rows.push({
    route,
    short: routeShort.get(route) ?? '',
    dir,
    active_sched: activeSched.length,
    live_obs: lives.length,
    tol_match: tolMatch,
    tid_match: tidMatch,
    today_dup: todayDup,
    map_today: mapToday,
    map_fixed: mapFixed,
    overcount: mapToday - mapFixed,
    tol_min: tol,
  });
}

// Sort: routes with biggest overcount first.
rows.sort((a, b) => b.overcount - a.overcount || a.route.localeCompare(b.route));

function pad(s, n, left = false) {
  s = String(s);
  return s.length >= n ? s : left ? s + ' '.repeat(n - s.length) : ' '.repeat(n - s.length) + s;
}

console.log(`# Cluj reconciliation diagnosis  ${NOW.toISOString()}`);
console.log(`# now (local) = ${String(Math.floor(nowMin / 60)).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}  ${localDate}  active services=${activeServices.join(',')}`);
console.log('');
console.log(
  pad('route', 7, true) + pad('short', 7, true) + pad('dir', 4) +
  pad('sched', 6) + pad('live', 5) + pad('tolM', 5) + pad('tidM', 5) +
  pad('orph', 5) + pad('today', 6) + pad('fixed', 6) +
  pad('over', 5) + pad('tol', 4),
);
console.log('-'.repeat(67));
let totLive = 0, totSched = 0, totTodayDup = 0, totOver = 0, totMapToday = 0, totMapFixed = 0;
for (const r of rows) {
  console.log(
    pad(r.route, 7, true) + pad(r.short, 7, true) + pad(r.dir, 4) +
    pad(r.active_sched, 6) + pad(r.live_obs, 5) + pad(r.tol_match, 5) +
    pad(r.tid_match, 5) + pad(r.live_obs - r.tol_match, 5) +
    pad(r.map_today, 6) + pad(r.map_fixed, 6) + pad(r.overcount, 5) +
    pad(r.tol_min, 4),
  );
  totLive += r.live_obs;
  totSched += r.active_sched;
  totTodayDup += r.today_dup;
  totOver += r.overcount;
  totMapToday += r.map_today;
  totMapFixed += r.map_fixed;
}
console.log('-'.repeat(67));
console.log(
  pad('TOTAL', 7, true) + pad('', 7, true) + pad('', 4) +
  pad(totSched, 6) + pad(totLive, 5) +
  pad('', 5) + pad('', 5) + pad('', 5) +
  pad(totMapToday, 6) + pad(totMapFixed, 6) + pad(totOver, 5),
);
console.log('');
console.log(`Total duplicate map markers across all routes: ${totOver}`);
console.log(`= ${totMapToday} markers shown today vs ${totMapFixed} after centralized reconciliation`);
console.log(`(${((totOver / totMapToday) * 100).toFixed(1)}% reduction)`);
