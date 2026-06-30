/*
 * locationStore — GPS state singleton consumed by the header's GPS dot and
 * the Stations view's proximity query.
 *
 * Lifecycle:
 *   - Constructed lazily on first reactive access (browser only; SSR builds
 *     skip the watchPosition call because no consumer touches it during
 *     prerender).
 *   - GPS is strictly opt-in. `start()` is idempotent but does not flip the
 *     "opted in" flag; callers that want the user choice to persist across
 *     reloads use `enable()` instead. The +layout effect calls `start()`
 *     on mount when `userPrefs.gpsOptedIn` is already true.
 *   - A 15s ticker bumps `now`, so the `freshness` getter naturally demotes
 *     ok -> stale -> error over time without us having to remember to
 *     re-render.
 */

import { userPrefs } from './userPrefs.svelte';

export type FreshState = 'off' | 'idle' | 'ok' | 'stale' | 'error';
export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied';

class LocationStore {
  position = $state<GeolocationPosition | null>(null);
  error = $state<GeolocationPositionError | null>(null);
  permission = $state<PermissionState>('unknown');
  lastUpdated = $state<number | null>(null);

  /** Ticks every 15s while a watch is active so `freshness` re-evaluates. */
  now = $state(typeof Date === 'undefined' ? 0 : Date.now());

  private watchId: number | null = null;
  private tickerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    // Permissions API is a hint — some browsers throw for geolocation.
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        this.permission = status.state as PermissionState;
        status.addEventListener('change', () => {
          this.permission = status.state as PermissionState;
        });
      })
      .catch(() => {
        // Older browser or query unsupported — leave as 'unknown'.
      });
  }

  /** Idempotent. Returns true if a watch is active after the call. */
  start(): boolean {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return false;
    if (this.watchId !== null) return true;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.position = pos;
        this.lastUpdated = Date.now();
        this.error = null;
      },
      (err) => {
        this.error = err;
        if (err.code === err.PERMISSION_DENIED) this.permission = 'denied';
      },
      // Low-accuracy is fine for proximity filtering and saves battery on iOS.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 },
    );

    if (this.tickerId === null && typeof setInterval !== 'undefined') {
      this.tickerId = setInterval(() => (this.now = Date.now()), 15_000);
    }
    return true;
  }

  /**
   * Mark the user as opted in (persists across reloads via userPrefs) and
   * start the watch. Single entry point for the in-page opt-in banner and
   * the header's GPS-off dot — they both call this. Idempotent: safe to
   * call repeatedly. Clears any previous "Not now" dismissal so the
   * banner won't reappear after a deliberate opt-in.
   */
  enable(): boolean {
    userPrefs.gpsOptedIn = true;
    userPrefs.gpsPromptDismissedAt = null;
    return this.start();
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.tickerId !== null) {
      clearInterval(this.tickerId);
      this.tickerId = null;
    }
  }

  /**
   * Debug helper: pin the store to an arbitrary lat/lon, bypassing the
   * geolocation API. Useful in browsers without a built-in GPS override
   * (notably Safari). Exposed on window as `neary.setLocation(lat, lon)`
   * by the layout. Pair with `clearMockPosition()` to resume real GPS.
   */
  setMockPosition(lat: number, lon: number, accuracy = 25): void {
    this.position = {
      coords: {
        latitude: lat,
        longitude: lon,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON() {
          return { latitude: lat, longitude: lon, accuracy };
        },
      },
      timestamp: Date.now(),
      toJSON() {
        return { coords: this.coords, timestamp: this.timestamp };
      },
    } as GeolocationPosition;
    this.lastUpdated = Date.now();
    this.error = null;
  }

  /** Clear the mocked position; subsequent `watchPosition` callbacks (if a
   *  watch is active) will resume populating it. */
  clearMockPosition(): void {
    this.position = null;
    this.lastUpdated = null;
  }

  /** True iff a navigator.geolocation watch is currently active. The
   *  tooltip getter uses this to distinguish 'view never asked for
   *  GPS' (idle, no message) from 'view asked, still waiting for the
   *  first fix' (the legitimate 'waiting' state). */
  get isWatching(): boolean {
    return this.watchId !== null;
  }

  /**
   * Header-dot state. Buckets:
   *   - permission denied: error (red)
   *   - watch error w/ no position ever: error
   *   - watch not started (user hasn't opted in): off (grey, tap-to-enable)
   *   - watch started but no position yet: idle (grey, waiting)
   *   - position < 60s old: ok (green)
   *   - position 60s-5min old: stale (amber)
   *   - position older: error (red — likely lost signal)
   */
  get freshness(): FreshState {
    if (this.permission === 'denied') return 'error';
    if (this.error && !this.position) return 'error';
    if (!this.lastUpdated) return this.isWatching ? 'idle' : 'off';
    const age = this.now - this.lastUpdated;
    if (age < 60_000) return 'ok';
    if (age < 5 * 60_000) return 'stale';
    return 'error';
  }

  /** Human-readable tooltip text for the dot. */
  get tooltip(): string {
    if (this.permission === 'denied') return 'Location permission denied';
    if (this.error && !this.position) return `GPS error: ${this.error.message}`;
    if (!this.lastUpdated) {
      return this.isWatching
        ? 'Waiting for first GPS fix…'
        : 'GPS off — tap to enable.';
    }
    const ageSec = Math.round((this.now - this.lastUpdated) / 1000);
    if (ageSec < 60) return `GPS fresh (${ageSec}s ago)`;
    return `GPS last fix ${Math.round(ageSec / 60)} min ago`;
  }
}

export const locationStore = new LocationStore();
