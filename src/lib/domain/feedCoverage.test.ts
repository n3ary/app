import { describe, it, expect } from 'vitest';
import { isPositionInFeedBbox, distanceToFeedBboxKm, approxKm } from './feedCoverage';

const cluj = { lat: 46.7712, lon: 23.6236 };
const bucharest = { lat: 44.4268, lon: 26.1025 };

const bucharestFeed = {
  bbox: { minLat: 44.30, minLon: 25.80, maxLat: 44.65, maxLon: 26.35 },
  center: { lat: 44.4268, lon: 26.1025 },
};

const clujFeed = {
  bbox: { minLat: 46.70, minLon: 23.50, maxLat: 46.85, maxLon: 23.75 },
  center: { lat: 46.77, lon: 23.62 },
};

describe('isPositionInFeedBbox', () => {
  it('returns true when the position is inside the bbox', () => {
    expect(isPositionInFeedBbox(cluj, clujFeed)).toBe(true);
    expect(isPositionInFeedBbox(bucharest, bucharestFeed)).toBe(true);
  });

  it('returns false when the position is outside the bbox', () => {
    expect(isPositionInFeedBbox(cluj, bucharestFeed)).toBe(false);
    expect(isPositionInFeedBbox(bucharest, clujFeed)).toBe(false);
  });

  it('treats bbox edges as inside (boundary inclusive)', () => {
    const edge = { lat: clujFeed.bbox.maxLat, lon: clujFeed.bbox.minLon };
    expect(isPositionInFeedBbox(edge, clujFeed)).toBe(true);
  });
});

describe('distanceToFeedBboxKm', () => {
  it('returns 0 inside the bbox', () => {
    expect(distanceToFeedBboxKm(cluj, clujFeed)).toBe(0);
  });

  it('returns a coarse distance outside the bbox (Cluj <-> Bucharest ~300 km)', () => {
    const km = distanceToFeedBboxKm(cluj, bucharestFeed);
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(400);
  });
});

describe('approxKm', () => {
  it('is symmetric', () => {
    expect(approxKm(cluj, bucharest)).toBeCloseTo(approxKm(bucharest, cluj), 1);
  });
});
