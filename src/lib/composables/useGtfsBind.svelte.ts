// Owns the GTFS worker bind lifecycle. Three effects, all reacting to
// the same pair of inputs (`userPrefs.feedId` + the loaded registry):
//
// 1. Load the feed registry once on mount.
//
// 2. Boot-stall watchdog healthy signal. `done()` is fired when the app
//    reaches a healthy state: no feed selected (the picker is
//    interactive), a feed bound, or a bind failure already surfaced via
//    StatusBar. Until one of these holds, the watchdog keeps its stall
//    clock running.
//
//    Watch the three inputs that genuinely affect health, and nothing
//    else. The SW's background feeds.json refresh updates feedsStore.feeds
//    but must NOT re-fire this effect — otherwise the bind effect's
//    boundFeedId=null clear fires a beat, the SW's new registry has a
//    different id than the old one, setFeed takes longer than the
//    watchdog window, and the app reloads for no reason.
//
// 3. Auto-bind the GTFS worker to the user's selected feed. The repo
//    is lazily constructed; this effect only spawns the worker once a
//    feed exists in both userPrefs AND the loaded registry, then
//    re-runs when EITHER the id changes (user switched feeds) or the
//    registry refresh surfaces a new hash for the same feed (upstream
//    zip changed, OPFS needs the newer .sqlite3). Progress + errors are
//    surfaced through the global StatusBar so the user sees them
//    regardless of route.
//
// External surface:
//   - `bumpEpoch()` is called from the suspend/resume composable's
//     `onResume` to re-fire the bind effect when the worker has
//     released its OPFS handles (e.g. after Android froze the page).
//   - `clearLastBound()` is called from `onSuspend` so the bind effect
//     knows the previous bind's state is no longer authoritative.

import { untrack } from 'svelte';
import * as Comlink from 'comlink';
import { BOOT_BIND_STALL_MS } from '$lib/sw/bootWatchdog';
import { getGtfsRepo } from '$lib/data/gtfs/repo';
import { scheduleTilePrefetch } from '$lib/map/offlineTiles';
import { favoritesStore } from '$lib/stores/favoritesStore.svelte';
import { feedsStore } from '$lib/stores/feedsStore.svelte';
import { reconciledVehiclesStore } from '$lib/stores/reconciledVehiclesStore.svelte';
import { stationsViewStore } from '$lib/stores/stationsViewStore.svelte';
import { statusBus } from '$lib/stores/statusBus.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';

export function useGtfsBind(): {
  bumpEpoch: () => void;
  clearLastBound: () => void;
} {
  let lastBoundFeedKey = $state<string | null>(null);
  // Bumped on every resume-from-background: re-fires the bind effect
  // even though (feedId, registry) are unchanged, so the feed re-binds
  // after a suspend released the worker's OPFS handles.
  let bindEpoch = $state(0);
  // Set when a bind attempt failed and the error was surfaced. Feeds
  // the boot watchdog's healthy check: a visible error is a terminal
  // state, not a hang.
  let bindFailed = $state(false);

  $effect(() => {
    void feedsStore.load();
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    const feedId = userPrefs.feedId;
    const bound = feedsStore.boundFeedId;
    const failed = bindFailed;
    if (feedId == null || bound != null || failed) {
      window.__nearyBoot?.done();
    }
  });

  $effect(() => {
    void bindEpoch; // resume trigger — see bumpEpoch()
    const id = userPrefs.feedId;
    if (id == null) {
      // User deselected (e.g. deleted the active feed from Settings).
      // closeCurrent() ran in the worker but feedsStore.boundFeedId is
      // still the previous truthy id — any page that gates queries on
      // it would fire them against a worker with currentDb=null and
      // throw "GTFS worker not bound to a feed yet". Clear it here so
      // page effects stay in their loading state until the user picks
      // a new feed (which resets lastBoundFeedKey and rebinds).
      feedsStore.boundFeedId = null;
      return;
    }
    const feed = feedsStore.byId(id);
    if (!feed) return; // registry not loaded yet; effect will re-fire when it is
    // Key by (id, hash) so a new hash on the same id triggers re-bind.
    // The hash is the sha256 of the published sqlite_gz — when the daily
    // pipeline publishes a fresher build, the hash changes, opfsFileFor()
    // computes a new filename, bootstrap() downloads the new blob.
    const key = `${id}@${feed.hash ?? ''}`;
    if (key === lastBoundFeedKey) return;
    // Same defensive clear as the deselect branch — if we're switching
    // to a different feed (or a new hash on the same id) the previous
    // bind is no longer authoritative. The page-level $effect that
    // watches boundFeedId needs to see null until the new setFeed
    // resolves, otherwise it fires queries during the bind window.
    feedsStore.boundFeedId = null;
    // New feed = new geography. Drop the previous selection so the
    // user doesn't land on a stale "expanded stop" that isn't in the
    // new feed's stop table (issue #203: state should not leak across
    // feed swaps). Not on a resume re-bind (lastBoundFeedKey was
    // nulled by the suspend): same feed, the expansion stays.
    if (lastBoundFeedKey != null && lastBoundFeedKey !== key) {
      stationsViewStore.reset();
    }
    lastBoundFeedKey = key;
    bindFailed = false;
    const repo = getGtfsRepo();
    // Mark this feed as in-flight so the Settings feed row can render
    // a download spinner instead of a (false) "delete local data"
    // affordance. Cleared on success and failure below.
    feedsStore.bindingFeedId = feed.id;
    feedsStore.bindingProgress = 0;
    // statusBus.push reads `entries` (findIndex for dedupe), so calls
    // from inside a $effect must be wrapped in untrack to avoid
    // effect_update_depth loops. Matches the pattern at
    // routes/+page.svelte for the gps-pending push.
    untrack(() => {
      statusBus.push({
        id: 'gtfs-bind',
        kind: 'progress',
        message: `Loading schedule for ${feed.name}…`,
        progress: 0,
      });
    });
    // Callback that surfaces byte-level download progress from the
    // worker as a percentage on the same status entry. Wrapped in
    // Comlink.proxy so it can cross the worker boundary. Fires at
    // most every ~250 ms (throttled worker-side). When the upstream
    // omits Content-Length (totalBytes is null) we leave the bar at
    // its last determinate value rather than jumping around.
    const onProgress = Comlink.proxy((bytes: number, total: number | null) => {
      // Real download progress — the boot watchdog gives the bind
      // another full stall window per beat.
      window.__nearyBoot?.beat();
      if (total && total > 0) {
        const pct = Math.min(100, Math.round((bytes / total) * 100));
        untrack(() => {
          statusBus.progress('gtfs-bind', pct);
        });
        feedsStore.bindingProgress = pct;
      }
    });
    // A bind may mean a 21 MB seed download on patchy signal: widen
    // the watchdog window for its duration (beats fire per chunk;
    // done() on success/error restores the default). Without this a
    // stalled-but-retrying download would trigger a reload that
    // throws its progress away.
    window.__nearyBoot?.arm(BOOT_BIND_STALL_MS);
    repo
      .setFeed($state.snapshot(feed) as typeof feed, onProgress)
      .then(() => {
        feedsStore.boundFeedId = feed.id;
        feedsStore.bindingFeedId = null;
        // Load the feed's favorites from localStorage (migrating from the
        // legacy flat key on first visit). Old feed's markers stay in
        // localStorage under their own feed-scoped key.
        favoritesStore.loadForFeed(feed.id);
        feedsStore.bindingProgress = null;
        // Subscribe to the worker's reconciliation broadcast. The worker
        // owns the live poll loop (started in setFeed); this just wires
        // the main-thread store to receive every tick. Idempotent across
        // feed switches.
        reconciledVehiclesStore.bind();
        // Warm the OSM tile cache for this feed's bbox so the map view
        // works offline. Budget- and policy-guarded, idle-time, no-op
        // when offline or metered (see lib/map/offlineTiles.ts).
        scheduleTilePrefetch(feed);
        untrack(() => {
          statusBus.push({
            id: 'gtfs-bind',
            kind: 'success',
            message: 'Schedule ready.',
          });
        });
      })
      .catch((e: Error) => {
        feedsStore.bindingFeedId = null;
        feedsStore.bindingProgress = null;
        // Our own suspend aborts an in-flight seed download with this
        // exact reason (see bootstrap.ts ABORT_REASON_FEED_SWITCH) —
        // lifecycle, not failure: the resume re-bind restarts the
        // download. Surface nothing.
        const msg = e?.message ?? '';
        if (msg.includes('feed-switch-cancelled') || msg.includes('cancelled (feed switched)')) {
          return;
        }
        bindFailed = true; // disarms the boot watchdog: error shown, not a hang
        untrack(() => {
          statusBus.push({
            id: 'gtfs-bind',
            kind: 'error',
            message: e?.message ?? 'Failed to load schedule.',
            ttlMs: 0,
          });
        });
        // Keep lastBoundFeedKey set to the failed key so the effect
        // doesn't re-fire in an infinite loop. `lastBoundFeedKey` is
        // read by this same effect at the top; nulling it here would
        // re-trigger the effect, which would call setFeed again, fail
        // again, null again — a self-driving retry storm. To retry the
        // same feed the user reloads the page; to try another they
        // pick it from Settings (different key → effect fires normally).
        feedsStore.boundFeedId = null;
      });
  });

  function bumpEpoch() {
    bindEpoch++;
  }

  function clearLastBound() {
    lastBoundFeedKey = null;
  }

  return { bumpEpoch, clearLastBound };
}
