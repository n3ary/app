// Feature: gtfs-schedule-integration, Property 2: Time encoding round-trip
//
// Property 2: Time encoding round-trip
// For any valid GTFS time string (HH:MM:SS, including values >= 24:00:00 for
// overnight trips), encoding to minutes-since-midnight and converting back to
// hours/minutes preserves the original hour and minute values exactly.
// Seconds are discarded by design (minute-resolution comparisons).
//
// Validates: Requirements 2.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  gtfsTimeToMinutes,
  minutesToHoursMinutes,
  minutesToGtfsTime,
} from '../../../utils/schedule/timeEncoding';

const PBT_TIMEOUT_MS = 60_000;
const PBT_RUNS = 100;

/** Zero-pad a number to at least two digits (GTFS HH:MM:SS form). */
function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

describe('timeEncoding — Property 2: Time encoding round-trip', () => {
  it(
    'preserves hour and minute through encode -> decompose for all valid inputs',
    () => {
      fc.assert(
        fc.property(
          // 0-48 hours covers normal (0-23) and overnight (24-48) GTFS times.
          fc.integer({ min: 0, max: 48 }),
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 59 }),
          (hours, minutes, seconds) => {
            const time = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

            const totalMinutes = gtfsTimeToMinutes(time);
            const decomposed = minutesToHoursMinutes(totalMinutes);

            // Hours and minutes are preserved exactly; seconds are discarded.
            expect(decomposed.hours).toBe(hours);
            expect(decomposed.minutes).toBe(minutes);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );

  it(
    'round-trips at minute resolution through minutesToGtfsTime',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 48 }),
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 59 }),
          (hours, minutes, seconds) => {
            const time = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

            const totalMinutes = gtfsTimeToMinutes(time);
            const reencoded = minutesToGtfsTime(totalMinutes);

            // Re-encoded string normalizes seconds to 00 but keeps HH:MM.
            const expected = `${pad2(hours)}:${pad2(minutes)}:00`;
            expect(reencoded).toBe(expected);

            // And re-encoding the normalized string yields the same minutes.
            expect(gtfsTimeToMinutes(reencoded)).toBe(totalMinutes);
          },
        ),
        { numRuns: PBT_RUNS },
      );
    },
    PBT_TIMEOUT_MS,
  );
});
