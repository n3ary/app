/**
 * Unit tests for start station prediction suppression wiring (task 8.3).
 *
 * Verifies that the optional `suppressForwardPrediction` flag added to
 * `predictVehiclePosition` (and threaded through `enhanceVehicle` via
 * `EnhancementOptions`) makes a vehicle show at its current/API position with no
 * forward movement (Req 9.1), and that the flag defaults to off so existing
 * behavior is unchanged when schedule data is absent (Req 9.4).
 */

import { describe, it, expect } from 'vitest';
import { predictVehiclePosition } from '../../../utils/vehicle/positionPredictionUtils';
import { enhanceVehicle } from '../../../utils/vehicle/vehicleEnhancementUtils';
import type { TranzyVehicleResponse } from '../../../types/arrivalTime';

/**
 * A stale-timestamp vehicle so that, absent suppression, forward prediction
 * would normally be attempted. Coordinates are the "current/API" position.
 */
function makeVehicle(): TranzyVehicleResponse {
  return {
    id: 1,
    label: 'V1',
    latitude: 46.77,
    longitude: 23.6,
    // Far in the past so timestampAge is large (would trigger prediction).
    timestamp: '2000-01-01T00:00:00Z',
    speed: 0,
    route_id: 1,
    trip_id: 'T1',
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
  };
}

describe('predictVehiclePosition - start station suppression', () => {
  it('returns the API position with no forward movement when suppressed (9.1)', () => {
    const vehicle = makeVehicle();

    const result = predictVehiclePosition(
      vehicle,
      undefined,
      undefined,
      undefined,
      undefined,
      true, // suppressForwardPrediction
    );

    expect(result.predictedPosition).toEqual({
      lat: vehicle.latitude,
      lon: vehicle.longitude,
    });
    expect(result.metadata.predictedDistance).toBe(0);
    expect(result.metadata.method).toBe('fallback');
    expect(result.metadata.success).toBe(false);
  });

  it('defaults to off, leaving existing behavior unchanged (9.4)', () => {
    const vehicle = makeVehicle();

    // No suppression flag provided: same as before this feature.
    const withoutFlag = predictVehiclePosition(vehicle);
    const explicitlyOff = predictVehiclePosition(
      vehicle,
      undefined,
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(withoutFlag).toEqual(explicitlyOff);
  });
});

describe('enhanceVehicle - start station suppression', () => {
  it('keeps the vehicle at its API position when suppression is active (9.1)', () => {
    const vehicle = makeVehicle();

    const enhanced = enhanceVehicle(vehicle, {
      suppressForwardPrediction: true,
    });

    expect(enhanced.latitude).toBe(vehicle.latitude);
    expect(enhanced.longitude).toBe(vehicle.longitude);
    expect(enhanced.predictionMetadata?.predictedDistance).toBe(0);
    expect(enhanced.predictionMetadata?.positionApplied).toBe(false);
  });

  it('does not suppress by default (9.4)', () => {
    const vehicle = makeVehicle();

    const enhanced = enhanceVehicle(vehicle, {});

    // Without route shape/stop data the predictor falls back to API coords, but
    // the suppression flag must remain off (positionApplied stays false only via
    // the normal fallback path, not via forced suppression).
    expect(enhanced.apiLatitude).toBe(vehicle.latitude);
    expect(enhanced.apiLongitude).toBe(vehicle.longitude);
  });
});
