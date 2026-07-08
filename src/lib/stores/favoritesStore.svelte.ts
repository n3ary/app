// favoritesStore: persistent map of stop_id -> StationMarker. Each
// station has at most one marker (a station's marker replaces any
// previous one for the same station); many stations can share the
// same marker type, so home / work / cityCenter are not singletons.

import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const STORAGE_KEY_ROUTES = 'neary:favoriteRoutes';
const STORAGE_KEY_MARKERS = 'neary:stationMarkers';

export type StationMarker = 'favorite' | 'home' | 'work' | 'cityCenter';

export const STATION_MARKERS: readonly StationMarker[] = [
  'favorite',
  'home',
  'work',
  'cityCenter',
] as const;

export function isStationMarker(value: unknown): value is StationMarker {
  return STATION_MARKERS.includes(value as StationMarker);
}

function loadRoutes(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ROUTES);
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

function loadMarkers(): Record<string, StationMarker> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MARKERS);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, StationMarker> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isStationMarker(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

class FavoritesStore {
  // Native reactive Set for routes. Mutations propagate without any
  // reassignment dance, and consumers read through `routeIds`
  // (ReadonlySet view) so they can't mutate behind our back.
  #routes = new SvelteSet<string>(loadRoutes());

  // Station markers: stop_id -> StationMarker. Native SvelteMap so
  // .set / .delete are reactive.
  #markers = new SvelteMap<string, StationMarker>(
    Object.entries(loadMarkers()) as [string, StationMarker][],
  );

  /** Reactive, read-only view. */
  get routeIds(): ReadonlySet<string> {
    return this.#routes;
  }

  hasRoute(routeId: string): boolean {
    return this.#routes.has(routeId);
  }

  addRoute(routeId: string): void {
    if (this.#routes.has(routeId)) return;
    this.#routes.add(routeId);
    this.#persistRoutes();
  }

  removeRoute(routeId: string): void {
    if (!this.#routes.has(routeId)) return;
    this.#routes.delete(routeId);
    this.#persistRoutes();
  }

  toggleRoute(routeId: string): void {
    if (this.hasRoute(routeId)) this.removeRoute(routeId);
    else this.addRoute(routeId);
  }

  clearRoutes(): void {
    this.#routes.clear();
    this.#persistRoutes();
  }

  // ── Station markers ───────────────────────────────────────────

  /** Reactive, read-only view of the marker map. */
  get markers(): ReadonlyMap<string, StationMarker> {
    return this.#markers;
  }

  /** Marker assigned to a station, or undefined. */
  markerFor(stopId: string): StationMarker | undefined {
    return this.#markers.get(stopId);
  }

  /** True if the station has any marker (favorite / home / work / cityCenter). */
  hasMarker(stopId: string): boolean {
    return this.#markers.has(stopId);
  }

  /** Stop ids with the given marker. Allocates a new array; callers
   *  that read this in render paths should keep the consumer in a
   *  `$derived` so the allocation only happens on real change. */
  stationsWithMarker(marker: StationMarker): string[] {
    const out: string[] = [];
    for (const [id, m] of this.#markers) {
      if (m === marker) out.push(id);
    }
    return out;
  }

  /** Apply a marker to a station. Assigning the same marker a station
   *  already has is a no-op; assigning a different marker replaces
   *  the previous one for that station. Pass `null` to remove the
   *  station's marker entirely. Many stations can share the same
   *  marker type (no per-type singleton invariant). */
  setMarker(stopId: string, marker: StationMarker | null): void {
    const current = this.#markers.get(stopId);
    if (marker === null) {
      if (current === undefined) return;
      this.#markers.delete(stopId);
    } else {
      if (current === marker) return;
      this.#markers.set(stopId, marker);
    }
    this.#persistMarkers();
  }

  /** Toggle semantics for the heart-button dropdown: if the station
   *  currently has the given marker, remove it; otherwise assign it.
   *  Returns the station's resulting marker (undefined if cleared). */
  toggleMarker(stopId: string, marker: StationMarker): StationMarker | undefined {
    const current = this.#markers.get(stopId);
    if (current === marker) {
      this.setMarker(stopId, null);
      return undefined;
    }
    this.setMarker(stopId, marker);
    return marker;
  }

  /** Reset every station's marker. Tests + "clear all" UI use this. */
  clearMarkers(): void {
    if (this.#markers.size === 0) return;
    this.#markers.clear();
    this.#persistMarkers();
  }

  // ── Persistence ────────────────────────────────────────────────

  #persistRoutes(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(Array.from(this.#routes)));
    } catch {
      // Quota / disabled — silent noop. Favorites is non-critical.
    }
  }

  #persistMarkers(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const out: Record<string, StationMarker> = {};
      for (const [id, m] of this.#markers) out[id] = m;
      localStorage.setItem(STORAGE_KEY_MARKERS, JSON.stringify(out));
    } catch {
      // Quota / disabled — silent noop.
    }
  }
}

// HMR: preserve the singleton instance across hot reloads. Without
// this, a save to favoritesStore.svelte (or any file in its dependency
// graph) replaces the module, the new class definition creates a fresh
// FavoritesStore with its own `#markers` private field, and component
// instances still holding the old reference throw "Cannot access
// invalid private field (evaluating 'this.#markers')" the next time
// they read `markers` / call `markerFor` / etc.
let cachedFavoritesStore: FavoritesStore | null =
  (import.meta.hot?.data.favoritesStore as FavoritesStore | undefined) ?? null;

export const favoritesStore = cachedFavoritesStore ?? new FavoritesStore();
cachedFavoritesStore = favoritesStore;

if (import.meta.hot) {
  // Self-accept so Vite doesn't escalate updates here to a full page
  // reload (which would force the feed-bind cold path and reset every
  // store the user has interacted with this session).
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.favoritesStore = favoritesStore;
  });
}

/** Exported for tests that need a clean instance after mutating the
 *  pre-load localStorage state. App code should always use the
 *  module-level singleton. */
export { FavoritesStore as FavoritesStoreInternal };