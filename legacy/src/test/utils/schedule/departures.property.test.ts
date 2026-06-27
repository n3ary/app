// Feature: gtfs-schedule-integration, Property 6: Upcoming departures query
//
// Property 6: For any station with active routes and any current time, the
// upcoming departures query SHALL return all scheduled departures from that
// station within the next `windowMinutes` (default 60) across all active trips
// serving that station, sorted by departure time ascending. Each departure
// SHALL indicate whether a GPS vehicle is assigned or whether it is
// schedule-only. Departures in the past or beyond the window are excluded, and
// trips whose service is not active today are excluded.
//
// The query under test lives on the schedule store
// (`useScheduleStore.getUpcomingDepartures`). We drive it with random trips,
// current time, GPS-assigned trip sets, and a window, then independently
// re-derive the expected result set and assert the query matches.
//
// Validates: Requirements 6.1, 6.2, 6.4, 6.5

import { describe, it, expect, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { useScheduleStore } from '../../../stores/scheduleStore';
import type {
  SchedulePayload,
  ScheduleStopTime,
  CalendarEntry,
  UpcomingDeparture,
} from '../../../types/schedule';

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

/** The station the query targets. Other stops use ids well clear of this. */
const TARGET_STOP = 1000;

/** Service id mapped to active trips (covered by an all-days calendar entry). */
const ACTIVE_SERVICE = 'svc-active';
/** Service id mapped to inactive trips (absent from the calendar). */
const INACTIVE_SERVICE = 'svc-inactive';

/** A calendar entry active on every weekday across a very wide date range. */
function allDaysEntry(serviceId: string): CalendarEntry {
  return {
    serviceId,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    sunday: true,
    startDate: '20000101',
    endDate: '20991231',
  };
}

/** Clamp a minutes value into a single day [0, 1439]. */
function clampMinutes(value: number): number {
  return Math.max(0, Math.min(1439, value));
}

/** Reset the store to a clean, data-free state. */
function resetStore() {
  useScheduleStore.setState({
    scheduleData: null,
    activeServiceIds: new Set<string>(),
    lastResolvedDate: null,
    loading: false,
    error: null,
    lastUpdated: null,
    dataVersion: null,
  });
}

/** Resolved trip spec used for both payload construction and expectation. */
interface TripSpec {
  id: string;
  active: boolean;
  servesStop: boolean;
  /** Departure (minutes since midnight) at the target stop when servesStop. */
  dep: number;
  hasGps: boolean;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Raw per-trip spec relative to the current time; id assigned later. */
const rawTripArb = fc.record({
  active: fc.boolean(),
  servesStop: fc.boolean(),
  hasGps: fc.boolean(),
  // Offset relative to current time covers past (negative), in-window, and
  // beyond-window (large positive) departures so filtering is exercised.
  departureOffset: fc.integer({ min: -180, max: 240 }),
});

interface Model {
  currentMinutes: number;
  windowMinutes: number;
  trips: TripSpec[];
}

const modelArb: fc.Arbitrary<Model> = fc
  .record({
    currentMinutes: fc.integer({ min: 0, max: 1439 }),
    // Window includes the spec default (60) plus a spread of other sizes.
    windowMinutes: fc.integer({ min: 1, max: 120 }),
    rawTrips: fc.array(rawTripArb, { maxLength: 12 }),
  })
  .map(({ currentMinutes, windowMinutes, rawTrips }) => ({
    currentMinutes,
    windowMinutes,
    trips: rawTrips.map((t, i) => ({
      id: `trip_${i}`,
      active: t.active,
      servesStop: t.servesStop,
      dep: clampMinutes(currentMinutes + t.departureOffset),
      hasGps: t.hasGps,
    })),
  }));

// ---------------------------------------------------------------------------
// Independent re-derivation of the expected query result
// ---------------------------------------------------------------------------

function buildPayload(trips: TripSpec[]): SchedulePayload {
  const stopTimes: Record<string, ScheduleStopTime[]> = {};
  const tripServiceMap: Record<string, string> = {};

  trips.forEach((t, i) => {
    const entries: ScheduleStopTime[] = [
      // A leading non-target stop so trips that don't serve the station still
      // appear in the payload (and so the target lookup must be selective).
      { s: 2000 + i, q: 0, a: t.dep, d: t.dep },
    ];
    if (t.servesStop) {
      entries.push({ s: TARGET_STOP, q: 1, a: t.dep, d: t.dep });
    }
    stopTimes[t.id] = entries;
    tripServiceMap[t.id] = t.active ? ACTIVE_SERVICE : INACTIVE_SERVICE;
  });

  return {
    version: 'test',
    stopTimes,
    calendar: [allDaysEntry(ACTIVE_SERVICE)],
    calendarExceptions: [],
    tripServiceMap,
  };
}

/** Compute the departures the query should return, independently of the impl. */
function expectedDepartures(model: Model): UpcomingDeparture[] {
  const { currentMinutes, windowMinutes, trips } = model;
  return trips
    .filter(
      (t) =>
        t.active &&
        t.servesStop &&
        t.dep >= currentMinutes &&
        t.dep <= currentMinutes + windowMinutes,
    )
    .map((t) => ({
      tripId: t.id,
      routeId: 0, // no trip->route map supplied, so routeId is the placeholder
      departureMinutes: t.dep,
      minutesUntil: t.dep - currentMinutes,
      hasGpsVehicle: t.hasGps,
      isGhost: false,
    }));
}

/** Stable order for comparing result sets without depending on tie ordering. */
function byTripThenTime(a: UpcomingDeparture, b: UpcomingDeparture): number {
  if (a.departureMinutes !== b.departureMinutes) {
    return a.departureMinutes - b.departureMinutes;
  }
  return a.tripId.localeCompare(b.tripId);
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 6: Upcoming departures query', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it('returns exactly the active, in-window departures for the station, sorted ascending with correct GPS indicators', () => {
    vi.useFakeTimers();

    fc.assert(
      fc.property(modelArb, (model) => {
        const { currentMinutes, windowMinutes, trips } = model;

        // Deterministic "now": 2025-06-16 (within the all-days range) at a
        // wall-clock time whose minutes-since-midnight equals currentMinutes.
        vi.setSystemTime(
          new Date(2025, 5, 16, Math.floor(currentMinutes / 60), currentMinutes % 60, 0),
        );

        // Fresh state each run; force active-service resolution to recompute.
        useScheduleStore.setState({
          scheduleData: buildPayload(trips),
          activeServiceIds: new Set<string>(),
          lastResolvedDate: null,
        });

        const gpsVehicleTripIds = new Set(trips.filter((t) => t.hasGps).map((t) => t.id));

        const actual = useScheduleStore
          .getState()
          .getUpcomingDepartures(TARGET_STOP, [], windowMinutes, { gpsVehicleTripIds });

        const expected = expectedDepartures(model);

        // 1) Result set matches expected exactly (right trips, right fields).
        expect([...actual].sort(byTripThenTime)).toEqual(
          [...expected].sort(byTripThenTime),
        );

        // 2) Returned list is sorted by departure time ascending (Req 6.5).
        for (let i = 1; i < actual.length; i++) {
          expect(actual[i].departureMinutes).toBeGreaterThanOrEqual(
            actual[i - 1].departureMinutes,
          );
        }

        // 3) Every returned departure is within [now, now + window] (Req 6.2):
        //    nothing in the past, nothing beyond the window.
        for (const d of actual) {
          expect(d.departureMinutes).toBeGreaterThanOrEqual(currentMinutes);
          expect(d.departureMinutes).toBeLessThanOrEqual(currentMinutes + windowMinutes);
          expect(d.minutesUntil).toBe(d.departureMinutes - currentMinutes);
          // 4) GPS indicator reflects the supplied set (Req 6.4).
          expect(d.hasGpsVehicle).toBe(gpsVehicleTripIds.has(d.tripId));
        }
      }),
      { numRuns: 200 },
    );
  }, 60000);
});
