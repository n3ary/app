import { describe, expect, it } from 'vitest';
import { selectBoardsForView } from './stationSelection';
import type { Route, Vehicle } from './types';

const r1: Route = { id: '1', shortName: '1', color: '#000' };
const r2: Route = { id: '2', shortName: '2', color: '#000' };
const r99: Route = { id: '99', shortName: '99', color: '#000' };

const cfg = {
  nearbyRadiusM: 500,
  pairProximityM: 100,
  favoriteFallbackRadiusM: 2000,
};

function stop(id: number, distance: number) {
  return { id: String(id), distance };
}
function vehicle(route: Route): Vehicle {
  return {
    kind: 'scheduled',
    id: `v-${route.id}`,
    route,
    type: 'bus',
    confidence: 'low',
    schedule: { tripId: 't', scheduledDeparture: 0 },
  } as Vehicle;
}

describe('selectBoardsForView', () => {
  it('returns the single closest when 2nd is farther than pairProximityM', () => {
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80), vehicles: [vehicle(r1)] },
        { stop: stop(2, 250), vehicles: [vehicle(r2)] },
      ],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1']);
    expect(res.expandedStopId).toBe('1');
  });

  it('pairs the 2nd closest when within pairProximityM of the closest', () => {
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80), vehicles: [vehicle(r1)] },
        { stop: stop(2, 150), vehicles: [vehicle(r2)] }, // delta 70 ≤ 100
        { stop: stop(3, 300), vehicles: [vehicle(r1)] },
      ],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1'); // closest always expanded
  });

  it('never returns a 2nd stop that exceeds nearbyRadiusM, even if close to the closest', () => {
    // Closest is right at the edge of nearbyRadiusM, so the "2nd" is
    // outside it entirely — must be filtered out before the pair check.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 480), vehicles: [vehicle(r1)] },
        { stop: stop(2, 540), vehicles: [vehicle(r2)] }, // > 500
      ],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1']);
  });

  it('falls back to closest stop with a favorite route when nothing within nearbyRadiusM', () => {
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 800), vehicles: [vehicle(r2)] },   // no favorite
        { stop: stop(2, 1200), vehicles: [vehicle(r99)] }, // favorite!
        { stop: stop(3, 1500), vehicles: [vehicle(r99)] }, // also favorite, but farther
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['2']);
    expect(res.expandedStopId).toBe('2');
  });

  it('wider fallback respects favoriteFallbackRadiusM', () => {
    // Stop at 800m is within the wider radius → returned.
    // Stop at 2500m is outside; ignored.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 800), vehicles: [vehicle(r2)] },
        { stop: stop(2, 2500), vehicles: [vehicle(r99)] }, // > 2000
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1']);
    expect(res.expandedStopId).toBe('1');
  });

  it('returns truly empty only when nothing is within favoriteFallbackRadiusM', () => {
    const res = selectBoardsForView({
      candidates: [{ stop: stop(1, 2500), vehicles: [vehicle(r2)] }],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards).toEqual([]);
    expect(res.expandedStopId).toBeNull();
  });

  it('falls back to closest stop in the wider radius when no favorites are set', () => {
    // No favorites — wider fallback still surfaces a stop (was the
    // "No nearby stations" bug pre-fix: empty even though a stop
    // existed within 2 km).
    const res = selectBoardsForView({
      candidates: [{ stop: stop(1, 800), vehicles: [vehicle(r1)] }],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1']);
  });

  it('returns empty when candidates is empty', () => {
    const res = selectBoardsForView({
      candidates: [],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards).toEqual([]);
    expect(res.expandedStopId).toBeNull();
  });
});

describe('selectBoardsForView favorited-route priority (issue #258)', () => {
  it('leads with the closest when neither paired station serves a favorite', () => {
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r1)] },
        { stop: stop(2, 150), vehicles: [vehicle(r2)] },
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1');
  });

  it('leads with the closest when only the closest serves a favorite', () => {
    // Closest already serves a favorite — second does not. No swap
    // needed; the user's interest is already on the lead.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r99)] },
        { stop: stop(2, 150), vehicles: [vehicle(r2)] },
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1');
  });

  it('leads with the second when only the second serves a favorite (issue #258)', () => {
    // The bug: distance puts the unfavorited stop first, the
    // user's favorited-route stop is buried second. After this fix,
    // the favorited one leads and gets auto-expanded.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r1)] },
        { stop: stop(2, 150), vehicles: [vehicle(r99)] },
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['2', '1']);
    expect(res.expandedStopId).toBe('2');
  });

  it('leads with the closest when both paired stations serve a favorite', () => {
    // Both have a favorite — the closest-by-distance stays the
    // lead. Flipping between the two on every snapshot would be a
    // worse UX than honoring distance.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r99)] },
        { stop: stop(2, 150), vehicles: [vehicle(r99)] },
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1');
  });

  it('does not swap when favorites are not set, even if a stop has a favorited-route vehicle', () => {
    // favoriteRouteIds null is the "favorites store not ready"
    // signal from the page. Selector must behave the same as the
    // no-favorites case: distance order, closest first.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r1)] },
        { stop: stop(2, 150), vehicles: [vehicle(r99)] },
      ],
      config: cfg,
      favoriteRouteIds: null,
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1');
  });

  it('does not swap when the set of favorites is empty', () => {
    // Mirror of the null case: a present-but-empty set is the same
    // as no favorites. Distance order, closest first.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r1)] },
        { stop: stop(2, 150), vehicles: [vehicle(r99)] },
      ],
      config: cfg,
      favoriteRouteIds: new Set(),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1', '2']);
    expect(res.expandedStopId).toBe('1');
  });

  it('does not swap when only one station is in the nearby radius (not paired)', () => {
    // Single-station case: no swap logic to apply. Closest stays,
    // even if it has no favorited-route vehicles.
    const res = selectBoardsForView({
      candidates: [
        { stop: stop(1, 80),  vehicles: [vehicle(r1)] },
        { stop: stop(2, 250), vehicles: [vehicle(r99)] }, // > pairProximityM
      ],
      config: cfg,
      favoriteRouteIds: new Set(['99']),
    });
    expect(res.boards.map((b) => b.stop.id)).toEqual(['1']);
    expect(res.expandedStopId).toBe('1');
  });
});
