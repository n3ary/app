/*
 * serviceDay.test.ts -- the GTFS service-day model.
 *
 * A service day is not a calendar day: it runs from 00:00 past
 * midnight, so a trip published at "25:10" belongs to the PREVIOUS
 * calendar date and departs at 01:10 the next morning. Between
 * midnight and the end of the night service, two service days are in
 * progress at once.
 */
import { describe, expect, it } from 'vitest';
import {
  SERVICE_DAY_OFFSET_MIN,
  SERVICE_DAY_ROLLOVER_MIN,
  observationTimeOffsetMin,
  previousDateKey,
  serviceContextFor,
  serviceWindowsFor,
} from './serviceDay';

const TZ = 'Europe/Bucharest';

/** Monday 2026-10-26 00:30 local (UTC+2 - Bucharest leaves DST on the
 *  25th). */
const MONDAY_0030 = Date.parse('2026-10-25T22:30:00Z');
/** Monday 2026-10-26 12:00 local. */
const MONDAY_1200 = Date.parse('2026-10-26T10:00:00Z');
/** Sunday 2026-10-25 23:30 UTC = Monday 2026-10-26 01:30 in Bucharest
 *  (UTC+2) - the two disagree about the calendar date, so the feed's
 *  timezone must win. */
const SUNDAY_2330_UTC = Date.parse('2026-10-25T23:30:00Z');

describe('serviceContextFor', () => {
  it('places "now" on the current calendar day outside the night window', () => {
    const ctx = serviceContextFor(MONDAY_1200, TZ);
    expect(ctx.serviceDate).toBe('20261026');
    expect(ctx.nowMin).toBe(12 * 60);
    expect(ctx.overlapping).toBe(false);
  });

  it('flags the post-midnight window as overlapping', () => {
    const ctx = serviceContextFor(MONDAY_0030, TZ);
    expect(ctx.serviceDate).toBe('20261026');
    expect(ctx.previousServiceDate).toBe('20261025');
    expect(ctx.nowMin).toBe(30);
    expect(ctx.overlapping).toBe(true);
  });

  it('uses the feed timezone, not the system one', () => {
    // In UTC this instant is still Sunday; in Bucharest it is already
    // Monday 01:30 - past the rollover, so the two disagree and the
    // feed-local answer wins.
    const ctx = serviceContextFor(SUNDAY_2330_UTC, TZ);
    expect(ctx.serviceDate).toBe('20261026');
    expect(ctx.nowMin).toBe(1 * 60 + 30);
    expect(ctx.overlapping).toBe(true);
  });
});

describe('serviceWindowsFor', () => {
  it('queries a single service day outside the night window', () => {
    const ctx = serviceContextFor(MONDAY_1200, TZ);
    expect(serviceWindowsFor(ctx)).toEqual([
      { date: '20261026', offsetMin: 0 },
    ]);
  });

  it('queries both service days during the night window', () => {
    const ctx = serviceContextFor(MONDAY_0030, TZ);
    expect(serviceWindowsFor(ctx)).toEqual([
      // Yesterday's service day is still running its late-night tail.
      { date: '20261025', offsetMin: -SERVICE_DAY_OFFSET_MIN },
      // Today's service day has already started.
      { date: '20261026', offsetMin: 0 },
    ]);
  });
});

describe('previousDateKey', () => {
  it('steps back a calendar day', () => {
    expect(previousDateKey('20261026')).toBe('20261025');
    expect(previousDateKey('20260301')).toBe('20260228');
    expect(previousDateKey('20240101')).toBe('20231231');
  });
});

describe('observationTimeOffsetMin', () => {
  const ctx = serviceContextFor(MONDAY_0030, TZ);

  it('shifts an observation of the previous service day a day back', () => {
    // A night trip departing at "25:10" has Sunday as its service date.
    expect(observationTimeOffsetMin('20261025', ctx)).toBe(-SERVICE_DAY_OFFSET_MIN);
  });

  it('leaves an observation of the current service day alone', () => {
    expect(observationTimeOffsetMin('20261026', ctx)).toBe(0);
  });

  it('is a no-op when the feed does not report a service date', () => {
    expect(observationTimeOffsetMin('', ctx)).toBe(0);
  });
});

describe('the rollover window', () => {
  it('starts at local midnight and ends at the rollover hour', () => {
    expect(SERVICE_DAY_ROLLOVER_MIN).toBe(240);
    // 03:59 is still overlapping, 04:00 is not.
    expect(serviceContextFor(Date.parse('2026-10-25T23:59:00Z'), TZ).overlapping).toBe(true);
    expect(serviceContextFor(Date.parse('2026-10-26T02:00:00Z'), TZ).overlapping).toBe(false);
  });
});
