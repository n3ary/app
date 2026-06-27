/*
 * favoritesStore — persistent set of route ids the user has starred.
 *
 * Single-source for "is this route a favorite?" reads + writes. Used by:
 *   - RouteBadge (heart pip when favorite)
 *   - StationCard (passes the set down so each badge knows)
 *   - selectBoardsForView (favorite fallback when no stop is nearby)
 *   - /favorites page (lists favorite routes)
 *
 * Persistence: localStorage key `neary:favoriteRoutes`, stored as a
 * JSON array of GTFS route_ids (strings, matching `Route.id`). Loaded
 * once on construction (browser only), saved on every mutation.
 * SSR-safe (no-ops on the server).
 *
 * `loadInitial` is lenient about legacy entries (numbers from older
 * builds before Route.id was widened to string) and normalises them
 * to strings on read so a migrating user doesn't lose their favorites.
 */

import { SvelteSet } from 'svelte/reactivity';

const STORAGE_KEY = 'neary:favoriteRoutes';

function loadInitial(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Tolerate legacy number entries so migrating users keep their
    // favorites; everything new is written as a string.
    return arr
      .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
      .map((x) => String(x));
  } catch {
    return [];
  }
}

class FavoritesStore {
  // Native reactive Set — mutations on it propagate without any
  // reassignment dance, and consumers read through `routeIds` (a
  // ReadonlySet view) so they can't mutate behind our back.
  #routes = new SvelteSet<string>(loadInitial());

  /** Reactive, read-only view. */
  get routeIds(): ReadonlySet<string> {
    return this.#routes;
  }

  has(routeId: string): boolean {
    return this.#routes.has(routeId);
  }

  add(routeId: string): void {
    if (this.#routes.has(routeId)) return;
    this.#routes.add(routeId);
    this.#persist();
  }

  remove(routeId: string): void {
    if (!this.#routes.has(routeId)) return;
    this.#routes.delete(routeId);
    this.#persist();
  }

  toggle(routeId: string): void {
    if (this.has(routeId)) this.remove(routeId);
    else this.add(routeId);
  }

  clear(): void {
    this.#routes.clear();
    this.#persist();
  }

  #persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.#routes)));
    } catch {
      // Quota / disabled — silently noop. Favorites is non-critical.
    }
  }
}

export const favoritesStore = new FavoritesStore();
