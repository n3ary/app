import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseVehiclePositions } from './gtfsRtClient';

// Fixture is a real protobuf capture from Cluj's vehicle_positions feed.
// Purpose + regen recipe: docs/specs/live-data-pipeline.md § "Test fixture".
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(__dirname, '__fixtures__/cluj-vehicle-positions.bin'));

describe('parseVehiclePositions', () => {
  it('decodes a real Cluj VehiclePositions snapshot', () => {
    const snap = parseVehiclePositions(new Uint8Array(fixture));
    expect(snap.feedTimestampMs).toBeGreaterThan(0);
    expect(snap.vehicles.length).toBeGreaterThan(10);

    const v = snap.vehicles[0];
    expect(v.source).toBe('gtfs-rt');
    expect(typeof v.lat).toBe('number');
    expect(typeof v.lon).toBe('number');
    // Cluj is around 46.7, 23.6 — sanity-check the snapshot is in-region.
    expect(v.lat).toBeGreaterThan(46);
    expect(v.lat).toBeLessThan(47);
    expect(v.lon).toBeGreaterThan(23);
    expect(v.lon).toBeLessThan(24);
  });

  it('emits trip_ids verbatim from the feed (parser does no decoding)', () => {
    const snap = parseVehiclePositions(new Uint8Array(fixture));
    const withTrip = snap.vehicles.filter((v) => v.tripId.length > 0);
    expect(withTrip.length).toBeGreaterThan(0);
    // GTFS-RT trip_ids for Cluj look like '45_1_LV_9_0721'. Whether any
    // structure is parsed out of that string is the enrichment step's
    // concern, NOT the parser's.
    expect(withTrip[0].tripId).toMatch(/^\d+_\d+_/);
  });

  it('surfaces canonical RT fields verbatim — no derivation', () => {
    // Cluj's RT feed publishes direction_id=0 for every vehicle and
    // never populates start_time. The parser must mirror that as-is.
    // direction / start_time enrichment happens downstream in
    // enrichObservations.ts, not here.
    const snap = parseVehiclePositions(new Uint8Array(fixture));
    expect(snap.vehicles.every((v) => v.directionId === 0)).toBe(true);
    expect(snap.vehicles.every((v) => v.startTime === '')).toBe(true);
  });
});
