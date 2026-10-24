/*
 * Worker state — the small set of mutable singletons every query
 * module reads. Kept in one place so feed-switch can reset them
 * atomically and so individual query files stay free of module-level
 * state.
 *
 * `bootstrap.ts` mutates these; everything else only reads.
 */

import type { Database } from '@sqlite.org/sqlite-wasm';
import type { Feed } from '$lib/data/feeds';

/** Deferred hand-off used across a background suspend. The worker closes
 *  its DB (and releases the OPFS handles) when the page is backgrounded;
 *  queries that arrive during that window wait on the gate instead of
 *  throwing, and complete as soon as the resume reopens the DB. */
export interface ResumeGate {
  promise: Promise<void>;
  resolve: () => void;
}

export function createResumeGate(): ResumeGate {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** How long a query waits for a background resume before giving up and
 *  throwing. Generous: the resume is a pool re-acquire + DB open (well
 *  under a second on a warm OPFS), so hitting this means the page was
 *  never restored. */
const SUSPEND_QUERY_TIMEOUT_MS = 60_000;

class WorkerState {
  currentFeedId: string | null = null;
  /** Hash (`feed.hash`) of the currently-bound feed. Used by `setFeed`
   *  to detect when the same feed id has a newer published build and
   *  re-bootstrap against the new OPFS file. */
  currentFeedHash: string | null = null;
  /** The bound feed object itself. `closeCurrent()` deliberately leaves it
   *  alone so a background resume can re-open the same OPFS file without
   *  the main thread having to re-send the feed. */
  currentFeed: Feed | null = null;
  /** IANA timezone for the current feed (e.g. 'Europe/Bucharest').
   *  Required for every minute-since-midnight conversion the queries do. */
  currentFeedTz: string | null = null;
  /** URL the live pipeline polls for cleaned GTFS-RT vehicle_positions.
   *  Comes from `feed.realtime.vehicle_positions` -- in production this
   *  is the canonical gtfs-rt.n3ary.com proxy URL (the static pipeline
   *  rewrites it when the feed has a per-feed config). null when the
   *  feed has no realtime configured. */
  currentFeedRtUrl: string | null = null;
  currentDb: Database | null = null;
  /** Dwell seconds per stop from the feed's _neary_config timing block.
   *  Used by assembleLiveBoards to thread feed-specific dwell into ETA. */
  currentDwellSec: number = 20;
  /** Promise of the in-flight bootstrap when setFeed is mid-fetch.
   *  Used by ensureDb so the very first call can await the bind. */
  bootstrapping: Promise<Database> | null = null;
  /** Promise of the in-flight background resume (re-opening the DB after
   *  a suspend). ensureDb awaits it so a query that races the resume
   *  waits instead of throwing. */
  resumePromise: Promise<void> | null = null;
  /** Gate signalled by `resume()` and awaited by queries that arrive while
   *  the worker is suspended. null when the worker is not suspended. */
  suspendGate: ResumeGate | null = null;
  /** AbortController wrapping the seed download currently being streamed
   *  by bootstrap(). `closeCurrent()` calls abort() on it so a feed
   *  switch mid-download stops the old fetch instead of running it to
   *  completion. Cleared once bootstrap succeeds (or fails). */
  currentDownloadAbort: AbortController | null = null;
}

export const state = new WorkerState();

/** Wait for the worker's DB to be open and return it. Throws when
 *  no feed has been bound yet — every query must go through this so
 *  we never run SQL against a null handle.
 *
 *  When the page is backgrounded the worker closes its DB so a frozen
 *  session can't hold the OPFS access handles hostage. A query that
 *  lands in that window waits for the resume to re-open the DB rather
 *  than failing - the caller is usually a page effect that has just
 *  become visible again and would otherwise surface a spurious error. */
export async function ensureDb(): Promise<Database> {
  if (state.currentDb) return state.currentDb;
  if (state.bootstrapping) return state.bootstrapping;
  if (state.resumePromise) {
    await state.resumePromise;
    if (state.currentDb) return state.currentDb;
    if (state.bootstrapping) return state.bootstrapping;
  }
  const gate = state.suspendGate;
  if (gate) {
    await Promise.race([
      gate.promise,
      new Promise<void>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `GTFS worker is suspended and no resume arrived within ${Math.round(SUSPEND_QUERY_TIMEOUT_MS / 1000)}s.`,
              ),
            ),
          SUSPEND_QUERY_TIMEOUT_MS,
        ),
      ),
    ]);
    if (state.currentDb) return state.currentDb;
    if (state.bootstrapping) return state.bootstrapping;
  }
  throw new Error('GTFS worker not bound to a feed yet — call setFeed(feed) first.');
}
