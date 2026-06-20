/**
 * Active service resolution and time-window helpers for GTFS schedule data.
 *
 * These are pure functions (no I/O, no store access) used by the schedule
 * store and schedule-consuming utilities. They operate on the shared schedule
 * types and follow the resolution semantics defined in the design document
 * (Correctness Property 4: Active service resolution).
 */

import type { CalendarEntry, CalendarException } from '../../types/schedule';

/** GTFS weekday flag keys ordered by JavaScript `Date.getDay()` (0 = Sunday). */
const WEEKDAY_FLAGS: ReadonlyArray<keyof CalendarEntry> = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * Format a `Date` as a GTFS `YYYYMMDD` string using its local calendar fields.
 *
 * Local fields are used (not UTC) so that "today" matches the user's wall-clock
 * day, which is the basis for active-service resolution and midnight crossing.
 */
function formatDateYYYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Resolve the set of active GTFS service IDs for a given date.
 *
 * A service is active when the date falls within the calendar entry's
 * start/end range (inclusive) AND the entry's weekday flag is true for that
 * day. Calendar exceptions then override the calendar result: services with
 * `exceptionType=1` (added) are included for that date, and services with
 * `exceptionType=2` (removed) are excluded for that date.
 *
 * `YYYYMMDD` strings compare correctly with lexicographic `<=`/`>=` because the
 * format is fixed-width and zero-padded, so string comparison matches the
 * chronological ordering.
 *
 * @param calendar Calendar entries (weekday flags + date ranges)
 * @param exceptions Date-specific service overrides
 * @param date The date to resolve active services for (local wall-clock day)
 * @returns The set of service IDs active on that date
 */
export function resolveActiveServices(
  calendar: CalendarEntry[],
  exceptions: CalendarException[],
  date: Date,
): Set<string> {
  const target = formatDateYYYYMMDD(date);
  const weekdayFlag = WEEKDAY_FLAGS[date.getDay()];

  const active = new Set<string>();

  // Base set from calendar: in date range AND weekday flag true.
  for (const entry of calendar) {
    const inRange = target >= entry.startDate && target <= entry.endDate;
    if (inRange && entry[weekdayFlag] === true) {
      active.add(entry.serviceId);
    }
  }

  // Apply exceptions for this exact date: add (type 1), then remove (type 2).
  // Removals are applied after additions so an explicit removal always wins.
  for (const exception of exceptions) {
    if (exception.date !== target) continue;
    if (exception.exceptionType === 1) {
      active.add(exception.serviceId);
    }
  }
  for (const exception of exceptions) {
    if (exception.date !== target) continue;
    if (exception.exceptionType === 2) {
      active.delete(exception.serviceId);
    }
  }

  return active;
}

/**
 * Compute minutes since midnight for a `Date` from its local hours and minutes.
 *
 * @param date The date/time to convert
 * @returns Integer minutes since local midnight (0–1439)
 */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Determine whether a scheduled time falls within a forward time window.
 *
 * The window is inclusive on both ends: a scheduled time equal to the current
 * time (0 minutes away) or exactly at the window edge is considered in-window.
 * Scheduled times in the past or beyond the window are excluded.
 *
 * @param scheduledMinutes Scheduled time as minutes since midnight
 * @param currentMinutes Current time as minutes since midnight
 * @param windowMinutes Forward window size in minutes (e.g. 60)
 * @returns True if `scheduledMinutes` is within `[currentMinutes, currentMinutes + windowMinutes]`
 */
export function isTimeInWindow(
  scheduledMinutes: number,
  currentMinutes: number,
  windowMinutes: number,
): boolean {
  return (
    scheduledMinutes >= currentMinutes &&
    scheduledMinutes <= currentMinutes + windowMinutes
  );
}
