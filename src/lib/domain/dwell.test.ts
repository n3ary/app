import { describe, expect, it } from 'vitest';
import { dwellSecondsFor } from './dwell';

describe('dwellSecondsFor', () => {
  it('returns 0 at trip endpoints (origin / terminus)', () => {
    expect(dwellSecondsFor({ isEndpoint: true })).toBe(0);
  });

  it('returns the default intermediate dwell elsewhere', () => {
    expect(dwellSecondsFor({ isEndpoint: false })).toBe(20);
  });
});
