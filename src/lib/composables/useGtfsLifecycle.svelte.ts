/*
 * Owns the background suspend/resume behaviour of the GTFS worker.
 *
 * Kept out of +layout.svelte so the cycle is testable on its own: the
 * handlers below are the exact ones the visibility events fire.
 *
 * The contract:
 *
 *   suspend -> release the worker's OPFS access handles (so a frozen
 *             page can't block the next launch) and freeze the bind
 *             effect. The UI keeps its bound state: nothing on screen
 *             flips back to a loading state.
 *
 *   resume  -> re-open the DB the suspend closed and refresh live data.
 *             No re-bind, no progress entry, no watchdog reload: the
 *             page keeps its state and the fresh snapshot lands on its
 *             own. A resume that FAILS falls back to a full re-bind,
 *             which is boot-class and arms the stall watchdog itself.
 *
 * Why not re-bind on resume: a bind is a boot-class operation - it
 * pushes a "Loading schedule..." progress entry, resets the UI to its
 * loading state and arms the boot watchdog. The worker's DB only needs
 * re-opening, which costs a pool re-acquire plus a DB open (the OPFS
 * file is still on disk - no re-download).
 */

import { useBackgroundSuspend } from './useBackgroundSuspend.svelte';
import { resumeGtfs, suspendGtfs } from '$lib/data/gtfs/repo';
import { nowTicker } from '$lib/stores/nowTicker.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';

export interface GtfsBindHandle {
  bumpEpoch: () => void;
  clearLastBound: () => void;
  pauseBinding: () => void;
  resumeBinding: () => void;
}

export interface GtfsLifecycle {
  /** Backgrounded: release the worker's OPFS handles, freeze the bind. */
  suspend: () => void;
  /** Foregrounded: re-open the worker and refresh live data. */
  resume: () => void;
}

export function useGtfsLifecycle(gtfs: GtfsBindHandle): GtfsLifecycle {
  const suspend = () => {
    // Freeze the bind effect for the duration of the suspend. A bind
    // started here would push a "Loading schedule..." progress entry and
    // arm the boot watchdog for a page nobody is looking at.
    gtfs.pauseBinding();
    // Disarm the watchdog - the OS may freeze this tab for seconds to
    // minutes without firing any JS. A pre-freeze timer that fires
    // after thaw reloads a hidden tab and the user sees a flash of the
    // loading screen instead of their previous state.
    window.__nearyBoot?.disarm();
    void suspendGtfs().catch((e) => {
      console.warn('[pwa] GTFS suspend failed', e);
    });
  };

  const resume = () => {
    // No feed selected: the picker is a healthy state, nothing
    // re-binds - don't arm the watchdog (nothing is coming to
    // disarm it).
    if (userPrefs.feedId == null) return;
    // Reopen the worker and refresh live data. This is NOT a boot: the
    // feed is still bound and the UI keeps its state, so the stall
    // watchdog stays disarmed.
    void resumeGtfs()
      .then(() => {
        gtfs.resumeBinding();
        // The ticker's clock may have drifted while the tab was frozen
        // - snap it to now so every now-derived value (ETAs, "at
        // station" buckets) is recomputed against the real clock the
        // moment the rider comes back.
        nowTicker.bump();
      })
      .catch((e) => {
        // The reopen failed (OPFS handle contention, a deleted cache...).
        // Fall back to a full re-bind, which is boot-class and arms the
        // stall watchdog itself.
        console.warn('[pwa] GTFS resume failed, falling back to a full re-bind', e);
        gtfs.resumeBinding();
        gtfs.clearLastBound();
        gtfs.bumpEpoch();
      });
  };

  useBackgroundSuspend({ onSuspend: suspend, onResume: resume });

  return { suspend, resume };
}
