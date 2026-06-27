// Feature: gtfs-schedule-integration, Property 1: Pipeline transformation completeness
//
// Property 1: For any valid GTFS CSV input (stop_times.txt, calendar.txt,
// calendar_dates.txt, trips.txt), transformToPayload SHALL produce a payload
// that is keyed by trip_id, contains every trip's stop times (count and values
// preserved, ordered by stop_sequence), includes all calendar entries, includes
// all calendar exceptions, and maps every trip to its service.
//
// Validates: Requirements 1.2, 1.3, 2.2, 2.4, 2.5

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { transformToPayload, GTFS_FILENAMES } from '../../../utils/schedule/pipelineTransform';
import type {
  CalendarEntry,
  CalendarException,
  ScheduleStopTime,
} from '../../../types/schedule';

// ---------------------------------------------------------------------------
// Generated model
// ---------------------------------------------------------------------------

interface GeneratedStop {
  stopId: number;
  seq: number;
  aH: number;
  aM: number;
  aS: number;
  dH: number;
  dM: number;
  dS: number;
}

interface GeneratedTrip {
  tripId: string;
  serviceId: string;
  routeId: number;
  stops: GeneratedStop[];
}

interface GeneratedGtfs {
  trips: GeneratedTrip[];
  calendar: CalendarEntry[];
  exceptions: CalendarException[];
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ID_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');

/** Non-empty identifier using CSV-safe characters (no commas/quotes/whitespace). */
const idArb = fc
  .array(fc.constantFrom(...ID_CHARS), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''));

/** An 8-digit YYYYMMDD-shaped string (value need not be a real date). */
const dateArb = fc.integer({ min: 10000000, max: 99999999 }).map(String);

/** A single stop time. Hours may exceed 24 to cover overnight trips. */
const stopArb: fc.Arbitrary<GeneratedStop> = fc.record({
  stopId: fc.integer({ min: 0, max: 99999 }),
  seq: fc.integer({ min: 0, max: 200 }),
  aH: fc.integer({ min: 0, max: 47 }),
  aM: fc.integer({ min: 0, max: 59 }),
  aS: fc.integer({ min: 0, max: 59 }),
  dH: fc.integer({ min: 0, max: 47 }),
  dM: fc.integer({ min: 0, max: 59 }),
  dS: fc.integer({ min: 0, max: 59 }),
});

const tripArb: fc.Arbitrary<GeneratedTrip> = fc.record({
  tripId: idArb,
  serviceId: idArb,
  routeId: fc.integer({ min: 1, max: 999 }),
  // Unique stop_sequence per trip so the expected ordering is unambiguous.
  stops: fc.uniqueArray(stopArb, {
    selector: (s) => s.seq,
    minLength: 1,
    maxLength: 6,
  }),
});

const calendarArb: fc.Arbitrary<CalendarEntry> = fc.record({
  serviceId: idArb,
  monday: fc.boolean(),
  tuesday: fc.boolean(),
  wednesday: fc.boolean(),
  thursday: fc.boolean(),
  friday: fc.boolean(),
  saturday: fc.boolean(),
  sunday: fc.boolean(),
  startDate: dateArb,
  endDate: dateArb,
});

const exceptionArb: fc.Arbitrary<CalendarException> = fc.record({
  serviceId: idArb,
  date: dateArb,
  exceptionType: fc.constantFrom<1 | 2>(1, 2),
});

const gtfsArb: fc.Arbitrary<GeneratedGtfs> = fc.record({
  // Unique trip_ids so each becomes a distinct key in the payload.
  trips: fc.uniqueArray(tripArb, {
    selector: (t) => t.tripId,
    minLength: 1,
    maxLength: 8,
  }),
  calendar: fc.array(calendarArb, { maxLength: 6 }),
  exceptions: fc.array(exceptionArb, { maxLength: 6 }),
});

// ---------------------------------------------------------------------------
// CSV serialization (RFC 4180-style quoting)
// ---------------------------------------------------------------------------

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
}

const pad2 = (n: number): string => n.toString().padStart(2, '0');
const gtfsTime = (h: number, m: number, s: number): string =>
  `${pad2(h)}:${pad2(m)}:${pad2(s)}`;

const flag = (b: boolean): string => (b ? '1' : '0');

function buildFiles(model: GeneratedGtfs): Record<string, string> {
  const stopTimeRows: string[][] = [];
  for (const trip of model.trips) {
    for (const stop of trip.stops) {
      stopTimeRows.push([
        trip.tripId,
        gtfsTime(stop.aH, stop.aM, stop.aS),
        gtfsTime(stop.dH, stop.dM, stop.dS),
        String(stop.stopId),
        String(stop.seq),
      ]);
    }
  }

  const stopTimes = toCsv(
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
    stopTimeRows,
  );

  const calendar = toCsv(
    [
      'service_id',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
      'start_date',
      'end_date',
    ],
    model.calendar.map((c) => [
      c.serviceId,
      flag(c.monday),
      flag(c.tuesday),
      flag(c.wednesday),
      flag(c.thursday),
      flag(c.friday),
      flag(c.saturday),
      flag(c.sunday),
      c.startDate,
      c.endDate,
    ]),
  );

  const calendarDates = toCsv(
    ['service_id', 'date', 'exception_type'],
    model.exceptions.map((e) => [e.serviceId, e.date, String(e.exceptionType)]),
  );

  const trips = toCsv(
    ['route_id', 'service_id', 'trip_id'],
    model.trips.map((t) => [String(t.routeId), t.serviceId, t.tripId]),
  );

  return {
    [GTFS_FILENAMES.stopTimes]: stopTimes,
    [GTFS_FILENAMES.calendar]: calendar,
    [GTFS_FILENAMES.calendarDates]: calendarDates,
    [GTFS_FILENAMES.trips]: trips,
  };
}

/** Expected stop times for a trip: minute-encoded and ordered by stop_sequence. */
function expectedStopTimes(trip: GeneratedTrip): ScheduleStopTime[] {
  return trip.stops
    .map((stop) => ({
      s: stop.stopId,
      q: stop.seq,
      a: stop.aH * 60 + stop.aM,
      d: stop.dH * 60 + stop.dM,
    }))
    .sort((left, right) => left.q - right.q);
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 1: Pipeline transformation completeness', () => {
  it('produces a complete payload keyed by trip_id for any valid CSV input', () => {
    fc.assert(
      fc.property(gtfsArb, (model) => {
        const payload = transformToPayload(buildFiles(model), new Date('2025-01-15T03:00:00.000Z'));

        // (1) Keyed by trip_id: exactly the generated trip_ids appear as keys.
        const expectedTripIds = model.trips.map((t) => t.tripId).sort();
        expect(Object.keys(payload.stopTimes).sort()).toEqual(expectedTripIds);

        // (2) Every trip's stop times are present, count + values preserved,
        //     ordered by stop_sequence.
        for (const trip of model.trips) {
          const expected = expectedStopTimes(trip);
          const actual = payload.stopTimes[trip.tripId];
          expect(actual).toHaveLength(trip.stops.length);
          expect(actual).toEqual(expected);
          // Explicit ordering check.
          const sequences = actual.map((st) => st.q);
          expect(sequences).toEqual([...sequences].sort((x, y) => x - y));
        }

        // (3) All calendar entries present with serviceId/weekday flags/date ranges.
        expect(payload.calendar).toEqual(model.calendar);

        // (4) All calendar exceptions present with serviceId/date/type.
        expect(payload.calendarExceptions).toEqual(model.exceptions);

        // (5) tripServiceMap maps every trip to its service.
        const expectedMap: Record<string, string> = {};
        for (const trip of model.trips) {
          expectedMap[trip.tripId] = trip.serviceId;
        }
        expect(payload.tripServiceMap).toEqual(expectedMap);

        // (6) tripRouteMap maps every trip to its route.
        const expectedRouteMap: Record<string, number> = {};
        for (const trip of model.trips) {
          expectedRouteMap[trip.tripId] = trip.routeId;
        }
        expect(payload.tripRouteMap).toEqual(expectedRouteMap);
      }),
      { numRuns: 200 },
    );
  }, 60000);
});
