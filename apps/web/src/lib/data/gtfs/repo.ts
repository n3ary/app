/*
 * Main-thread facade for the GTFS worker. Components import `gtfsRepo` from
 * here — never the worker file directly. Keeps Comlink + worker plumbing
 * outside of UI code.
 *
 * Lazy: the worker isn't constructed until the first repo access, so the
 * SQLite-WASM payload (~1.5MB) doesn't load on routes that don't use it.
 */

import * as Comlink from 'comlink';
import type { GtfsRepo } from './types';

let cached: Comlink.Remote<GtfsRepo> | null = null;
let workerInstance: Worker | null = null;

export function getGtfsRepo(): Comlink.Remote<GtfsRepo> {
  if (cached) return cached;
  // Vite handles ?worker — produces a Worker class constructed below.
  // The dynamic import keeps the worker module out of the main-route bundle.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  workerInstance = new Worker(new URL('../../workers/gtfs.worker.ts', import.meta.url), {
    type: 'module',
  });
  cached = Comlink.wrap<GtfsRepo>(workerInstance);
  return cached;
}

// HMR cleanup. Without this, every dev hot-replace orphans the
// previous worker — which still holds OPFS-SAH access handles on
// the pool's slot files — and the freshly-spawned worker collides
// with those handles on init, surfacing as the noisy
// 'InvalidStateError, retrying' warning. Terminating the old
// worker before the module re-evaluates lets OPFS release the
// handles cleanly so the new worker's init is a no-op race.
// Production untouched — `import.meta.hot` is undefined there.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    workerInstance?.terminate();
    workerInstance = null;
    cached = null;
  });
}
