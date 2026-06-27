import { describe, expect, it } from 'vitest';
import { predictEta } from './predictEta';
import type { Polyline } from './shapeProjection';

// Same east-west polyline used in shapeProjection.test.ts. ~1 km
// between successive vertices.
const STRAIGHT: Polyline = [
  { lat: 46.770, lon: 23.580 },
  { lat: 46.770, lon: 23.5931 },
  { lat: 46.770, lon: 23.6062 },
  { lat: 46.770, lon: 23.6193 },
];

describe('predictEta', () => {
  it('returns positive minutes when vehicle is before stop', () => {
    // Vehicle at vertex 0, stop at vertex 2 (~2 km). At 5 m/s →
    // 2000 / 5 = 400 s = 6.67 min.
    const out = predictEta({
      vehiclePos: STRAIGHT[0],
      stopPos: STRAIGHT[2],
      polyline: STRAIGHT,
      vehicleSpeedMs: 5,
    });
    expect(out.minutes).toBeGreaterThan(6);
    expect(out.minutes).toBeLessThan(7.5);
    expect(out.distanceMeters).toBeGreaterThan(1800);
    expect(out.distanceMeters).toBeLessThan(2200);
    expect(out.confidence).toBe('high');
  });

  it('returns negative minutes when vehicle has already passed the stop', () => {
    const out = predictEta({
      vehiclePos: STRAIGHT[2],
      stopPos: STRAIGHT[0],
      polyline: STRAIGHT,
      vehicleSpeedMs: 5,
    });
    expect(out.minutes).toBeLessThan(0);
    // distanceMeters is unsigned magnitude.
    expect(out.distanceMeters).toBeGreaterThan(1800);
  });

  it('falls back to a sensible speed when vehicleSpeedMs is null', () => {
    const out = predictEta({
      vehiclePos: STRAIGHT[0],
      stopPos: STRAIGHT[1],
      polyline: STRAIGHT,
      vehicleSpeedMs: null,
    });
    // 1 km at fallback 5 m/s = 200 s ≈ 3.3 min
    expect(out.minutes).toBeGreaterThan(2.5);
    expect(out.minutes).toBeLessThan(4);
  });

  it('clamps zero / negative speed up to the minimum', () => {
    const out = predictEta({
      vehiclePos: STRAIGHT[0],
      stopPos: STRAIGHT[1],
      polyline: STRAIGHT,
      vehicleSpeedMs: 0, // bus stopped at a light
    });
    // Falls through to fallback 5 m/s (zero is not "present").
    expect(out.minutes).toBeGreaterThan(2.5);
    expect(out.minutes).toBeLessThan(4);
    // Even an extreme tiny speed would clamp to MIN (1 m/s) which is
    // ~16 min for 1 km — checked separately to keep this test focused.
  });

  it('clamps tiny but positive speeds to the floor (no 99h ETAs)', () => {
    const out = predictEta({
      vehiclePos: STRAIGHT[0],
      stopPos: STRAIGHT[1],
      polyline: STRAIGHT,
      vehicleSpeedMs: 0.001, // crawling, but reported positive
    });
    // Clamped to MIN_EFFECTIVE_SPEED_MS = 1 m/s → 1000 / 1 / 60 ≈ 16.7 min
    expect(out.minutes).toBeGreaterThan(12);
    expect(out.minutes).toBeLessThan(20);
  });

  it('downgrades confidence when the vehicle is off-shape', () => {
    // Vehicle 200 m perpendicular to the polyline.
    const off = { lat: 46.7718, lon: 23.5931 }; // ~200 m north
    const out = predictEta({
      vehiclePos: off,
      stopPos: STRAIGHT[2],
      polyline: STRAIGHT,
      vehicleSpeedMs: 5,
    });
    expect(out.confidence).toBe('low');
  });
});
