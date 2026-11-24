/*
 * stationUrl.ts — the ONE way to build an in-app station URL.
 *
 * Why this needs to exist: GTFS stop ids are not URL-safe. Transitous
 * feeds (Brasov, Oradea, Tursib, Timisoara) publish ids like
 * `node/10011185841` — the id itself contains a slash.
 *
 * Interpolated raw into `/station/${id}` the slash becomes a path
 * separator, so the URL has TWO segments after `/station/`. The route
 * `/station/[id]` matches a single segment, so SvelteKit's client
 * router finds no matching route and throws `navigation_route_missing`
 * — the tap silently does nothing. The station page is unreachable for
 * every feed whose ids contain a slash.
 *
 * `encodeURIComponent` keeps the id inside one segment. SvelteKit's
 * `decode_pathname` uses `decodeURI`, which deliberately leaves `%2F`
 * encoded (it only decodes escapes for non-reserved characters), so
 * the route still matches and `exec()` decodes the param back to the
 * raw id with `decodeURIComponent`.
 *
 * Use this helper everywhere a station URL is built. Interpolating a
 * stop id into a path by hand is the bug.
 */

/** In-app URL for a station detail page. */
export function stationUrl(stopId: string): string {
  return `/station/${encodeURIComponent(stopId)}`;
}
