/**
 * GTFS Schedule Serving — Netlify function.
 *
 * Exposes the compact schedule payload (written daily to Netlify Blobs by
 * `schedule-pipeline.mts`) at the public CDN URL `/data/schedule.json`, which
 * the client `scheduleStore` fetches.
 *
 * Why this function exists:
 *   Netlify Blobs are a key/value store reachable only through the `@netlify/blobs`
 *   SDK from a function or edge runtime — they have no built-in public HTTP URL.
 *   To serve the payload at a stable CDN path we (a) read the blob here and
 *   return it as JSON, and (b) rewrite `/data/schedule.json` → this function in
 *   netlify.toml (status 200 rewrite). This is the correct mechanism for
 *   publicly serving Netlify Blobs content.
 *
 * Caching:
 *   The response sets `Cache-Control: public, max-age=3600` so the Netlify CDN
 *   caches the payload at the edge for one hour (matching the netlify.toml
 *   `/data/*` header rule). netlify.toml `[[headers]]` are not reliably applied
 *   to function/rewrite responses, so the header is set here as well to
 *   guarantee the 1-hour cache regardless of how the response is routed.
 *
 * Design reference: .kiro/specs/gtfs-schedule-integration/design.md
 *   (Server-Side: Schedule Pipeline — "Write the compact JSON to Netlify Blobs
 *    (served at /data/schedule.json)")
 */

import { getStore } from '@netlify/blobs';

/**
 * Netlify Blobs store + key holding the compact schedule payload.
 * MUST stay in sync with `schedule-pipeline.mts`, which writes the same
 * store/key.
 */
const SCHEDULE_BLOB_STORE = 'schedule';
const SCHEDULE_BLOB_KEY = 'current';

/** One-hour CDN cache for the served payload (Requirement 1.3 / task 2.3). */
const CACHE_CONTROL = 'public, max-age=3600';

const LOG_PREFIX = '[ScheduleServe]';

export default async function handler(): Promise<Response> {
  try {
    const store = getStore(SCHEDULE_BLOB_STORE);

    // Stream the stored JSON straight through to keep memory flat for the
    // multi-hundred-KB payload.
    const stream = await store.get(SCHEDULE_BLOB_KEY, { type: 'stream' });

    if (!stream) {
      // No payload has been published yet (pipeline has not run, or its first
      // run has not completed). The client treats this as a fetch failure and
      // falls back to GPS-only behavior.
      return new Response(JSON.stringify({ error: 'Schedule not available' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': CACHE_CONTROL,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} failed to serve schedule blob:`, message);
    return new Response(JSON.stringify({ error: 'Failed to load schedule' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
