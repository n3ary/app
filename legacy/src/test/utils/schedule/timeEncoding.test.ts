import { describe, it, expect } from 'vitest';
import {
  gtfsTimeToMinutes,
  minutesToHoursMinutes,
  minutesToGtfsTime,
} from '../../../utils/schedule/timeEncoding';

describe('gtfsTimeToMinutes', () => {
  it('converts a morning time to minutes since midnight', () => {
    expect(gtfsTimeToMinutes('05:05:00')).toBe(305);
  });

  it('converts end-of-day time', () => {
    expect(gtfsTimeToMinutes('23:59:00')).toBe(1439);
  });

  it('preserves overnight hours beyond 24:00', () => {
    expect(gtfsTimeToMinutes('25:30:00')).toBe(1530);
  });

  it('handles single-digit hours', () => {
    expect(gtfsTimeToMinutes('5:05:00')).toBe(305);
  });

  it('discards seconds (minute resolution)', () => {
    expect(gtfsTimeToMinutes('05:05:45')).toBe(305);
  });

  it('throws on malformed input', () => {
    expect(() => gtfsTimeToMinutes('not-a-time')).toThrow();
    expect(() => gtfsTimeToMinutes('05:60:00')).toThrow();
  });
});

describe('minutesToHoursMinutes / minutesToGtfsTime (inverse)', () => {
  it('decomposes minutes into hours and minutes', () => {
    expect(minutesToHoursMinutes(305)).toEqual({ hours: 5, minutes: 5 });
    expect(minutesToHoursMinutes(1530)).toEqual({ hours: 25, minutes: 30 });
  });

  it('round-trips hour/minute through encode then decode', () => {
    for (const time of ['00:00:00', '05:05:00', '23:59:00', '25:30:00', '47:59:00']) {
      const minutes = gtfsTimeToMinutes(time);
      expect(minutesToGtfsTime(minutes)).toBe(time);
    }
  });
});
