/*
 * stationUrl.test.ts — the station URL must survive stop ids that are
 * not URL-safe.
 *
 * Transitous feeds publish ids like `node/10011185841`. Interpolated
 * raw into `/station/${id}` the slash becomes a path separator, the URL
 * gains a second segment, and the `/station/[id]` route stops matching
 * — SvelteKit throws `navigation_route_missing` and the tap does
 * nothing. The station page was unreachable for every feed whose ids
 * contain a slash.
 */
import { describe, it, expect } from 'vitest';
import { stationUrl } from './stationUrl.ts';

describe('stationUrl', () => {
  it('encodes a slash in the stop id so the route still matches', () => {
    expect(stationUrl('node/10011185841')).toBe('/station/node%2F10011185841');
  });

  it('leaves a plain numeric id untouched', () => {
    expect(stationUrl('46')).toBe('/station/46');
  });

  it('encodes characters that would break the path', () => {
    expect(stationUrl('a b')).toBe('/station/a%20b');
    expect(stationUrl('a?b')).toBe('/station/a%3Fb');
    expect(stationUrl('a#b')).toBe('/station/a%23b');
  });

  it('never emits a second path segment', () => {
    // The whole point: whatever the id, the URL must have exactly one
    // segment after /station/.
    for (const id of ['node/1', 'a/b/c', 'x y', 'p?q', 'r#s', 'ü/ö']) {
      const url = stationUrl(id);
      const rest = url.slice('/station/'.length);
      expect(rest).not.toContain('/');
      expect(decodeURIComponent(rest)).toBe(id);
    }
  });
});
