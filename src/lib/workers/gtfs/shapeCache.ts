/*
 * Shape polyline cache — keyed by `shape_id`, survives across method
 * calls but is feed-scoped: `closeCurrent()` in [`bootstrap.ts`](./bootstrap.ts)
 * clears it on every feed switch so a previous feed's shape ids
 * can't leak into the next.
 *
 * Cached even for empty results (negative cache) so a missing
 * `shape_id` doesn't re-query every render.
 */

type Polyline = Array<{ lat: number; lon: number }>;

const cache = new Map<string, Polyline>();

export const shapeCache = {
  get: (shapeId: string): Polyline | undefined => cache.get(shapeId),
  set: (shapeId: string, points: Polyline): void => {
    cache.set(shapeId, points);
  },
  has: (shapeId: string): boolean => cache.has(shapeId),
  clear: (): void => {
    cache.clear();
  },
};
