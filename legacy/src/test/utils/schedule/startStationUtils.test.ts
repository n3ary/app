import { describe, it, expect } from 'vitest';
import {
  shouldSuppressPrediction,
  START_STATION_PROXIMITY_THRESHOLD_METERS,
} from '../../../utils/schedule/startStationUtils';
import type { SchedulePayload } from '../../../types/schedule';
import type {
  TranzyStopResponse,
  TranzyStopTimeResponse,
} from '../../../types/rawTranzyApi';
import type { EnhancedVehicleData } from '../../../utils/vehicle/vehicleEnhancementUtils';

// Minimal builders ---------------------------------------------------------

const TRIP_ID = 'CJ1001_1_Mon-Fri';

// First stop near (46.7700, 23.6200); second stop ~1km away.
const stops: TranzyStopResponse[] = [
  {
    stop_id: 100,
    stop_name: 'Start Station',
    stop_lat: 46.77,
    stop_lon: 23.62,
    location_type: 0,
    stop_code: null,
  },
  {
    stop_id: 101,
    stop_name: 'Second Station',
    stop_lat: 46.78,
    stop_lon: 23.63,
    location_type: 0,
    stop_code: null,
  },
];

const tripStopTimes: TranzyStopTimeResponse[] = [
  { trip_id: TRIP_ID, stop_id: 100, stop_sequence: 0 },
  { trip_id: TRIP_ID, stop_id: 101, stop_sequence: 1 },
];

const scheduleData: SchedulePayload = {
  version: '2025-01-15T03:00:00Z',
  stopTimes: {
    [TRIP_ID]: [
      { s: 100, q: 0, a: 480, d: 480 }, // departs at 08:00 (480 min)
      { s: 101, q: 1, a: 485, d: 485 },
    ],
  },
  calendar: [],
  calendarExceptions: [],
  tripServiceMap: { [TRIP_ID]: 'Mon-Fri' },
};

function makeVehicle(
  overrides: Partial<EnhancedVehicleData> = {},
): EnhancedVehicleData {
  return {
    id: 1,
    label: 'V1',
    latitude: 46.77,
    longitude: 23.62,
    timestamp: '2025-01-15T08:00:00Z',
    speed: 0,
    route_id: 1,
    trip_id: TRIP_ID,
    vehicle_type: 3,
    bike_accessible: 'BIKE_INACCESSIBLE',
    wheelchair_accessible: 'WHEELCHAIR_INACCESSIBLE',
    apiLatitude: 46.77,
    apiLongitude: 23.62,
    apiSpeed: 0,
    ...overrides,
  };
}

describe('shouldSuppressPrediction', () => {
  it('suppresses when all four conditions are met', () => {
    const vehicle = makeVehicle();
    // current time 07:55 (475), before scheduled departure 08:00 (480)
    expect(
      shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, 475),
    ).toBe(true);
  });

  it('does not suppress when current time is at/after scheduled departure', () => {
    const vehicle = makeVehicle();
    expect(
      shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, 480),
    ).toBe(false);
    expect(
      shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, 500),
    ).toBe(false);
  });

  it('does not suppress when vehicle is far from the first stop', () => {
    // Place vehicle near the second stop instead of the first.
    const vehicle = makeVehicle({ latitude: 46.78, longitude: 23.63 });
    expect(
      shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, 475),
    ).toBe(false);
  });

  it('does not suppress when schedule data is missing for the trip', () => {
    const vehicle = makeVehicle();
    const emptySchedule: SchedulePayload = { ...scheduleData, stopTimes: {} };
    expect(
      shouldSuppressPrediction(vehicle, emptySchedule, tripStopTimes, stops, 475),
    ).toBe(false);
  });

  it('does not suppress when vehicle has no trip_id', () => {
    const vehicle = makeVehicle({ trip_id: null });
    expect(
      shouldSuppressPrediction(vehicle, scheduleData, tripStopTimes, stops, 475),
    ).toBe(false);
  });

  it('exposes a positive proximity threshold constant', () => {
    expect(START_STATION_PROXIMITY_THRESHOLD_METERS).toBeGreaterThan(0);
  });
});
