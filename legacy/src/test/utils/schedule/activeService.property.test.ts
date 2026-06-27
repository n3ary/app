// Feature: gtfs-schedule-integration, Property 4: Active service resolution
//
// Property 4: For any date, set of calendar entries (with weekday flags and
// date ranges), and set of calendar exceptions, resolveActiveServices SHALL
// return exactly the set of service_ids where the date falls within the
// entry's start/end range (inclusive) AND the entry's weekday flag is true,
// PLUS any service_ids with exception_type=1 for that date, MINUS any
// service_ids with exception_type=2 for that date (removal wins over add).
//
// Validates: Requirements 4.1, 4.2, 4.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolveActiveServices } from '../../../utils/schedule/activeServiceUtils';
import type { CalendarEntry, CalendarException } from '../../../types/schedule';

// ---------------------------------------------------------------------------
// Helpers (independent re-derivation of the resolution semantics)
// ---------------------------------------------------------------------------

/** Weekday flag keys indexed by JavaScript `Date.getDay()` (0 = Sunday). */
const WEEKDAYS: ReadonlyArray<keyof CalendarEntry> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/** Format a Date as GTFS `YYYYMMDD` using local calendar fields. */
function ymd(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Build a YYYYMMDD string for `base` shifted by `offsetDays` (local). */
function offsetYmd(base: Date, offsetDays: number): string {
  const shifted = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + offsetDays,
    12,
    0,
    0,
  );
  return ymd(shifted);
}

/**
 * Independently compute the expected active set using set algebra:
 * expected = (calendar matches ∪ added exceptions) \ removed exceptions.
 * This formulation makes "removal wins over add" explicit and does not
 * mirror the implementation's loop ordering.
 */
function expectedActive(
  calendar: CalendarEntry[],
  exceptions: CalendarException[],
  date: Date,
): Set<string> {
  const target = ymd(date);
  const weekdayFlag = WEEKDAYS[date.getDay()];

  const fromCalendar = new Set<string>();
  for (const entry of calendar) {
    const inRange = target >= entry.startDate && target <= entry.endDate;
    if (inRange && entry[weekdayFlag] === true) {
      fromCalendar.add(entry.serviceId);
    }
  }

  const added = new Set<string>();
  const removed = new Set<string>();
  for (const exc of exceptions) {
    if (exc.date !== target) continue;
    if (exc.exceptionType === 1) added.add(exc.serviceId);
    else if (exc.exceptionType === 2) removed.add(exc.serviceId);
  }

  const result = new Set<string>([...fromCalendar, ...added]);
  for (const id of removed) result.delete(id);
  return result;
}

const sortedArr = (set: Set<string>): string[] => [...set].sort();

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Small shared pool so calendar entries and exceptions overlap, exercising
// the add/remove/removal-wins interactions on the same service ids.
const SERVICE_IDS = ['S0', 'S1', 'S2', 'S3', 'S4'] as const;
const serviceIdArb = fc.constantFrom(...SERVICE_IDS);

const booleanFlags = fc.record({
  monday: fc.boolean(),
  tuesday: fc.boolean(),
  wednesday: fc.boolean(),
  thursday: fc.boolean(),
  friday: fc.boolean(),
  saturday: fc.boolean(),
  sunday: fc.boolean(),
});

// A target date across several years/months. Day capped at 28 to avoid invalid
// dates while still covering every weekday across the calendar.
const targetDateArb = fc
  .record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 0, max: 11 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => new Date(year, month, day, 12, 0, 0));

// Raw calendar spec relative to the target date. Offsets include 0 to exercise
// inclusive start/end boundaries; negative/positive cover in-range and
// out-of-range cases on both sides.
const rawCalArb = fc.record({
  serviceId: serviceIdArb,
  flags: booleanFlags,
  startOffset: fc.integer({ min: -5, max: 5 }),
  endOffset: fc.integer({ min: -5, max: 5 }),
});

// Raw exception spec. Bias the date toward the target so additions/removals
// actually apply, while still generating off-target dates that must be ignored.
const rawExcArb = fc.record({
  serviceId: serviceIdArb,
  exceptionType: fc.constantFrom<1 | 2>(1, 2),
  dateChoice: fc.oneof(
    { weight: 4, arbitrary: fc.constant<'target'>('target') },
    { weight: 1, arbitrary: fc.integer({ min: -10, max: 10 }) },
  ),
});

interface Model {
  date: Date;
  calendar: CalendarEntry[];
  exceptions: CalendarException[];
}

const modelArb: fc.Arbitrary<Model> = targetDateArb.chain((date) =>
  fc.record({
    date: fc.constant(date),
    calendar: fc
      .array(rawCalArb, { maxLength: 10 })
      .map((raws) =>
        raws.map((r) => ({
          serviceId: r.serviceId,
          ...r.flags,
          startDate: offsetYmd(date, r.startOffset),
          endDate: offsetYmd(date, r.endOffset),
        })),
      ),
    exceptions: fc
      .array(rawExcArb, { maxLength: 10 })
      .map((raws) =>
        raws.map((r) => ({
          serviceId: r.serviceId,
          date:
            r.dateChoice === 'target'
              ? ymd(date)
              : offsetYmd(date, r.dateChoice),
          exceptionType: r.exceptionType,
        })),
      ),
  }),
);

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 4: Active service resolution', () => {
  it('returns the correct active service set for any date, calendar, and exceptions', () => {
    fc.assert(
      fc.property(modelArb, ({ date, calendar, exceptions }) => {
        const actual = resolveActiveServices(calendar, exceptions, date);
        const expected = expectedActive(calendar, exceptions, date);
        expect(sortedArr(actual)).toEqual(sortedArr(expected));
      }),
      { numRuns: 200 },
    );
  }, 60000);

  // --- Targeted examples covering each clause explicitly -------------------

  const weekdayEntry = (
    serviceId: string,
    startDate: string,
    endDate: string,
    activeDay: keyof CalendarEntry,
  ): CalendarEntry => ({
    serviceId,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: false,
    [activeDay]: true,
    startDate,
    endDate,
  });

  it('matches the weekday flag for the date', () => {
    // 2025-01-15 is a Wednesday.
    const date = new Date(2025, 0, 15, 12, 0, 0);
    const entry = weekdayEntry('S0', '20250101', '20251231', 'wednesday');
    expect([...resolveActiveServices([entry], [], date)]).toEqual(['S0']);

    const thursdayEntry = weekdayEntry('S1', '20250101', '20251231', 'thursday');
    expect([...resolveActiveServices([thursdayEntry], [], date)]).toEqual([]);
  });

  it('treats the start and end dates as inclusive boundaries', () => {
    const date = new Date(2025, 0, 15, 12, 0, 0); // Wednesday
    const onStart = weekdayEntry('S0', '20250115', '20250131', 'wednesday');
    const onEnd = weekdayEntry('S1', '20250101', '20250115', 'wednesday');
    const justAfter = weekdayEntry('S2', '20250116', '20250131', 'wednesday');
    const justBefore = weekdayEntry('S3', '20250101', '20250114', 'wednesday');

    expect([...resolveActiveServices([onStart], [], date)]).toEqual(['S0']);
    expect([...resolveActiveServices([onEnd], [], date)]).toEqual(['S1']);
    expect([...resolveActiveServices([justAfter], [], date)]).toEqual([]);
    expect([...resolveActiveServices([justBefore], [], date)]).toEqual([]);
  });

  it('adds services via exception_type=1 for the date', () => {
    const date = new Date(2025, 0, 15, 12, 0, 0);
    const exceptions: CalendarException[] = [
      { serviceId: 'S9', date: '20250115', exceptionType: 1 },
      { serviceId: 'S8', date: '20250116', exceptionType: 1 }, // wrong date, ignored
    ];
    expect([...resolveActiveServices([], exceptions, date)]).toEqual(['S9']);
  });

  it('removes services via exception_type=2 for the date', () => {
    const date = new Date(2025, 0, 15, 12, 0, 0); // Wednesday
    const entry = weekdayEntry('S0', '20250101', '20251231', 'wednesday');
    const exceptions: CalendarException[] = [
      { serviceId: 'S0', date: '20250115', exceptionType: 2 },
    ];
    expect([...resolveActiveServices([entry], exceptions, date)]).toEqual([]);
  });

  it('lets removal win when a service is both added and removed on the same date', () => {
    const date = new Date(2025, 0, 15, 12, 0, 0);
    const exceptions: CalendarException[] = [
      { serviceId: 'S0', date: '20250115', exceptionType: 1 },
      { serviceId: 'S0', date: '20250115', exceptionType: 2 },
    ];
    expect([...resolveActiveServices([], exceptions, date)]).toEqual([]);
  });
});
