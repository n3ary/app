// Pins RAPTOR's core guarantees on tiny synthetic networks: direct vs
// transfer, transfer wait time, the transfer penalty in ranking,
// service-day filtering, and street-agnostic footpath transfers. These are
// the semantics the app relies on; the SQLite hydration is tested elsewhere.

import { describe, expect, it } from 'vitest';
import { buildPatterns, buildFootpaths, plan, type TripInput, type RaptorNetwork, type RaptorLeg } from './raptor';

type TransitLeg = Extract<RaptorLeg, { kind: 'transit' }>;
const isTransit = (l: RaptorLeg): l is TransitLeg => l.kind === 'transit';

const t = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

// A--B--C--D roughly along a line; E sits a few metres from C for the footpath case.
const STOPS = [
  { id: 'A', lat: 46.77, lon: 23.59 },
  { id: 'B', lat: 46.775, lon: 23.595 },
  { id: 'C', lat: 46.78, lon: 23.6 },
  { id: 'D', lat: 46.785, lon: 23.605 },
  { id: 'E', lat: 46.7801, lon: 23.6001 },
];

/** R1 A->B->C, R2 C->D, R3 A->D direct. R2 also has a weekend-only run. */
function baseTrips(): TripInput[] {
  return [
    { tripId: 'R1a', serviceId: 'WD', routeId: 'R1',
      stops: [
        { stopId: 'A', arr: t(9, 0), dep: t(9, 0) },
        { stopId: 'B', arr: t(9, 5), dep: t(9, 5) },
        { stopId: 'C', arr: t(9, 10), dep: t(9, 10) },
      ] },
    { tripId: 'R1b', serviceId: 'WD', routeId: 'R1',
      stops: [
        { stopId: 'A', arr: t(9, 20), dep: t(9, 20) },
        { stopId: 'B', arr: t(9, 25), dep: t(9, 25) },
        { stopId: 'C', arr: t(9, 30), dep: t(9, 30) },
      ] },
    { tripId: 'R2a', serviceId: 'WD', routeId: 'R2',
      stops: [
        { stopId: 'C', arr: t(9, 15), dep: t(9, 15) },
        { stopId: 'D', arr: t(9, 25), dep: t(9, 25) },
      ] },
    { tripId: 'R2wknd', serviceId: 'WE', routeId: 'R2',
      stops: [
        { stopId: 'C', arr: t(9, 11), dep: t(9, 11) },
        { stopId: 'D', arr: t(9, 18), dep: t(9, 18) },
      ] },
    { tripId: 'R3a', serviceId: 'WD', routeId: 'R3',
      stops: [
        { stopId: 'A', arr: t(9, 2), dep: t(9, 2) },
        { stopId: 'D', arr: t(9, 28), dep: t(9, 28) },
      ] },
  ];
}

function net(trips: TripInput[], footpaths = new Map()): RaptorNetwork {
  return { ...buildPatterns(trips), footpaths };
}

describe('buildPatterns', () => {
  it('groups trips with the same stop sequence into one pattern', () => {
    const { patterns, routesAtStop } = buildPatterns(baseTrips());
    // R1a + R1b share A->B->C; R2a + R2wknd share C->D; R3a is A->D.
    expect(patterns).toHaveLength(3);
    const r1 = patterns.find((p) => p.stops.join() === 'A,B,C')!;
    expect(r1.trips.map((t) => t.tripId)).toEqual(['R1a', 'R1b']); // sorted by first departure
    expect(routesAtStop.get('C')?.length).toBe(2); // A->B->C (idx 2) and C->D (idx 0)
  });

  it('drops trips with non-finite times', () => {
    const { patterns } = buildPatterns([
      { tripId: 'bad', serviceId: 'WD', routeId: 'X',
        stops: [{ stopId: 'A', arr: NaN, dep: t(9, 0) }, { stopId: 'B', arr: t(9, 5), dep: t(9, 5) }] },
    ]);
    expect(patterns).toHaveLength(0);
  });
});

describe('plan', () => {
  const query = (over = {}) => ({
    access: [{ stopId: 'A', seconds: 0, meters: 0 }],
    egress: [{ stopId: 'D', seconds: 0, meters: 0 }],
    departTime: t(9, 0),
    activeServices: new Set(['WD']),
    ...over,
  });

  it('finds the direct 0-transfer journey', () => {
    const js = plan(net(baseTrips()), query());
    const direct = js.find((j) => j.transfers === 0);
    expect(direct).toBeDefined();
    const transit = direct!.legs.filter((l) => l.kind === 'transit');
    expect(transit).toHaveLength(1);
    expect(transit[0]).toMatchObject({ routeId: 'R3', boardStop: 'A', alightStop: 'D', alightTime: t(9, 28) });
  });

  it('finds a 1-transfer journey with the correct wait at the transfer stop', () => {
    const js = plan(net(baseTrips()), query());
    const via = js.find((j) => j.transfers === 1);
    expect(via).toBeDefined();
    const transit = via!.legs.filter(isTransit);
    expect(transit.map((l) => l.routeId)).toEqual(['R1', 'R2']);
    expect(via!.arriveTime).toBe(t(9, 25));
    // arrive C 09:10, board R2 09:15 -> wait 5 min.
    expect(transit[1].waitSec).toBe(t(0, 5));
    expect(transit[1].boardStop).toBe('C');
  });

  it('ranks the direct option above a slightly-faster transfer (transfer penalty)', () => {
    const js = plan(net(baseTrips()), query());
    // Transfer arrives 09:25 (earlier) but costs a 5-min penalty; direct 09:28 wins.
    expect(js[0].transfers).toBe(0);
    expect(js[0].arriveTime).toBe(t(9, 28));
  });

  it('excludes trips whose service is not active', () => {
    const weekday = plan(net(baseTrips()), query());
    expect(weekday.find((j) => j.transfers === 1)!.arriveTime).toBe(t(9, 25));
    // With the weekend service active, the earlier R2wknd (dep C 09:11) is catchable.
    const weekend = plan(net(baseTrips()), query({ activeServices: new Set(['WD', 'WE']) }));
    expect(weekend.find((j) => j.transfers === 1)!.arriveTime).toBe(t(9, 18));
  });

  it('adds access and egress walk time to the itinerary', () => {
    const js = plan(net(baseTrips()), query({
      access: [{ stopId: 'A', seconds: 120, meters: 150 }],
      egress: [{ stopId: 'D', seconds: 180, meters: 220 }],
    }));
    const direct = js.find((j) => j.transfers === 0)!;
    expect(direct.legs[0]).toMatchObject({ kind: 'walk', variant: 'access', toStop: 'A', seconds: 120 });
    expect(direct.legs.at(-1)).toMatchObject({ kind: 'walk', variant: 'egress', fromStop: 'D', seconds: 180 });
    expect(direct.arriveTime).toBe(t(9, 28) + 180); // egress walk pushes arrival
    expect(direct.departTime).toBe(t(9, 2)); // first vehicle boarding
  });

  it('returns nothing transit-only walkable (no vehicle) journeys', () => {
    // egress at A, the same as access -> a pure walk, which must not be returned.
    const js = plan(net(baseTrips()), query({ egress: [{ stopId: 'A', seconds: 0, meters: 0 }] }));
    expect(js.every((j) => j.legs.some((l) => l.kind === 'transit'))).toBe(true);
  });
});

describe('footpath transfers', () => {
  it('builds symmetric short-walk transfers between nearby stops', () => {
    const foot = buildFootpaths(STOPS, { radiusM: 200 });
    const cToE = foot.get('C')?.find((f) => f.to === 'E');
    expect(cToE).toBeDefined();
    expect(cToE!.meters).toBeLessThan(200);
    expect(foot.get('E')?.some((f) => f.to === 'C')).toBe(true);
  });

  it('uses a footpath to transfer between routes at different stops', () => {
    // R2 now departs from E (a short walk from C), not C itself.
    const trips = baseTrips().map((tr) =>
      tr.tripId === 'R2a'
        ? { ...tr, stops: [{ stopId: 'E', arr: t(9, 16), dep: t(9, 16) }, { stopId: 'D', arr: t(9, 26), dep: t(9, 26) }] }
        : tr,
    );
    const footpaths = buildFootpaths(STOPS, { radiusM: 200 });
    const js = plan({ ...buildPatterns(trips), footpaths }, {
      access: [{ stopId: 'A', seconds: 0, meters: 0 }],
      egress: [{ stopId: 'D', seconds: 0, meters: 0 }],
      departTime: t(9, 0),
      activeServices: new Set(['WD']),
    });
    const via = js.find((j) => j.transfers === 1 && j.legs.some((l) => l.kind === 'walk' && l.variant === 'transfer'));
    expect(via).toBeDefined();
    const walk = via!.legs.find((l) => l.kind === 'walk' && l.variant === 'transfer')!;
    expect(walk).toMatchObject({ fromStop: 'C', toStop: 'E' });
    expect(via!.arriveTime).toBe(t(9, 26));
  });
});
