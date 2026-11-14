/*
 * GTFS service days.
 *
 * A GTFS service day is NOT a calendar day. It starts at 00:00 and may
 * run past midnight - a trip published at "25:10" departs at 01:10 the
 * NEXT calendar morning, and it belongs to the PREVIOUS date's service
 * day. Feeds that run night services publish exactly that (the Cluj
 * feed's 25N / 5N / 54N lines use 24:00-25:33).
 *
 * The app resolved "what is running now" against the calendar date, so
 * between midnight and the end of the night service the buses that
 * were actually running were invisible: they were dropped from the
 * station board at exactly the moment they started running, and the
 * ETA arithmetic mixed two timelines (a 24 h error).
 *
 * This module is the single place that answers "which service days are
 * in progress right now, and how do their trip times land on the
 * timeline the rest of the app uses".
 *
 * THE TIMELINE
 *
 * Everything the app compares against "now" lives on one timeline:
 * minutes since the CURRENT calendar day's local midnight, extended
 * past 24:00. A trip of the current calendar day's service day is
 * already on that timeline. A trip of the PREVIOUS service day is one
 * day behind on it, so its times are shifted by -1440 minutes
 * (`SERVICE_DAY_OFFSET_MIN`).
 *
 * Both service days are in progress during the post-midnight window:
 * yesterday's service day is still running its late-night tail, and
 * today's service day has already started. Both must be queried.
 */

import { dateKeyInTz, minSinceMidnightInTz } from './timeUtils';

/**
 * Local hour (feed timezone) at which the previous service day is
 * considered finished. 04:00 is the usual agency convention and matches
 * the assumption already documented in `config.ts` ("18 h from any
 * wall-clock reaches a typical 04:00 GTFS end-of-service").
 */
export const SERVICE_DAY_ROLLOVER_MIN = 4 * 60;

/** Minutes in a day - the shift between consecutive service days. */
export const SERVICE_DAY_OFFSET_MIN = 1440;

export interface ServiceContext {
  /** Calendar date (YYYYMMDD) of the current service day. */
  serviceDate: string;
  /** Calendar date (YYYYMMDD) of the previous service day. */
  previousServiceDate: string;
  /** "Now" in minutes since local midnight (0..1439). */
  nowMin: number;
  /**
   * True during the post-midnight window, when the previous service
   * day's late-night tail is still running alongside the current
   * service day's first departures.
   */
  overlapping: boolean;
}

/**
 * Resolve the service-day context for a wall-clock instant.
 *
 * Pure. `timeZone` is the feed's IANA timezone - every value here is
 * feed-local, never system-local.
 */
export function serviceContextFor(nowMs: number, timeZone: string): ServiceContext {
  const serviceDate = dateKeyInTz(nowMs, timeZone);
  const nowMin = minSinceMidnightInTz(nowMs, timeZone);
  return {
    serviceDate,
    previousServiceDate: previousDateKey(serviceDate),
    nowMin,
    overlapping: nowMin < SERVICE_DAY_ROLLOVER_MIN,
  };
}

/**
 * The service days that are in progress, with the offset that places
 * each one's trip times on the shared timeline.
 */
export interface ServiceWindow {
  /** Calendar date whose services this window covers. */
  date: string;
  /** Minutes to add to that date's trip times to reach the shared timeline. */
  offsetMin: number;
}

export function serviceWindowsFor(ctx: ServiceContext): ServiceWindow[] {
  if (!ctx.overlapping) return [{ date: ctx.serviceDate, offsetMin: 0 }];
  return [
    // The previous service day is still running its late-night tail.
    { date: ctx.previousServiceDate, offsetMin: -SERVICE_DAY_OFFSET_MIN },
    // Today's service day has already started.
    { date: ctx.serviceDate, offsetMin: 0 },
  ];
}

/**
 * The offset that places a live observation's GTFS start time on the
 * shared timeline.
 *
 * A GTFS-RT observation carries the trip's SERVICE DATE
 * (`TripDescriptor.start_date`), which for a night-service trip is the
 * PREVIOUS calendar date - its GTFS start time ("25:10") is measured
 * from that day's midnight, so it sits a day behind "now".
 *
 * Returns 0 when the feed doesn't report a service date, or when the
 * observation belongs to the current service day.
 */
export function observationTimeOffsetMin(
  startDate: string,
  ctx: ServiceContext,
): number {
  if (!startDate) return 0;
  return startDate === ctx.previousServiceDate ? -SERVICE_DAY_OFFSET_MIN : 0;
}

/** The previous calendar date as YYYYMMDD. Calendar arithmetic, not
 *  millisecond arithmetic - subtracting 24 h across a DST boundary can
 *  land on the wrong date. */
export function previousDateKey(dateKey: string): string {
  const y = Number(dateKey.slice(0, 4));
  const m = Number(dateKey.slice(4, 6));
  const d = Number(dateKey.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return formatDateKey(dt);
}

function formatDateKey(dt: Date): string {
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
}
