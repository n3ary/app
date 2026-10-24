// @vitest-environment jsdom
/*
 * Regression cover for the background suspend/resume cycle.
 *
 * The bug this guards against: `onSuspend` cleared the bind key, which
 * re-fired the bind effect *while the page was backgrounded*. That
 * re-armed the key, so the resume's `bumpEpoch()` hit the
 * "already bound" early-return and never re-opened the worker. The app
 * sat unbound, the boot watchdog's 15 s stall window expired, and the
 * page did a full `location.reload()` - a green "Loading schedule..."
 * bar and a hard flicker roughly 15 s after the rider came back.
 *
 * The contract now:
 *   suspend -> the bind effect is inert, the UI keeps its bound state
 *   resume  -> the worker re-opens its DB and refreshes live data, with
 *             NO re-bind, NO progress entry and NO watchdog reload
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';

const workerCalls: string[] = [];
let resolveBind: (() => void) | null = null;
let resumeShouldFail = false;

vi.mock('$lib/data/gtfs/repo', () => ({
  getGtfsRepo: () => ({
    setFeed: vi.fn(() => {
      workerCalls.push('setFeed');
      return new Promise<void>((res) => {
        resolveBind = res;
      });
    }),
    subscribeReconciled: vi.fn(async () => () => {}),
    refreshLive: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
  }),
  suspendGtfs: vi.fn(async () => {
    workerCalls.push('suspendGtfs');
  }),
  resumeGtfs: vi.fn(async () => {
    workerCalls.push('resumeGtfs');
    if (resumeShouldFail) throw new Error('OPFS handle contention');
  }),
}));

vi.mock('$lib/map/offlineTiles', () => ({
  scheduleTilePrefetch: vi.fn(),
}));

import Host from './useGtfsBind.testHost.svelte';
import { feedsStore } from '$lib/stores/feedsStore.svelte';
import { statusBus } from '$lib/stores/statusBus.svelte';
import { userPrefs } from '$lib/stores/userPrefs.svelte';

const bootCalls: string[] = [];

const FEED = {
  id: 'cluj-napoca',
  name: 'Cluj-Napoca',
  country: 'RO',
  timezone: 'Europe/Bucharest',
  bbox: { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 },
  center: { lat: 0.5, lon: 0.5 },
  agencies: [],
  source: { type: 'transitous', publisher: 'x' },
  files: { sqlite_gz: 'x.sqlite3.gz' },
  hash: 'abc123',
  license: { attribution_text: '' },
} as never;

const flush = async (times = 6) => {
  for (let i = 0; i < times; i++) {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
  }
  await tick();
};

beforeEach(() => {
  workerCalls.length = 0;
  bootCalls.length = 0;
  resolveBind = null;
  resumeShouldFail = false;
  statusBus.clear();
  feedsStore.feeds = [FEED];
  feedsStore.boundFeedId = null;
  feedsStore.bindingFeedId = null;
  userPrefs.feedId = 'cluj-napoca';
  (window as unknown as { __nearyBoot: unknown }).__nearyBoot = {
    arm: (ms?: number) => bootCalls.push(`arm(${ms ?? 'default'})`),
    disarm: () => bootCalls.push('disarm()'),
    done: () => bootCalls.push('done()'),
    beat: () => bootCalls.push('beat()'),
  };
});

type Lifecycle = { suspend: () => void; resume: () => void };

async function mount(): Promise<Lifecycle> {
  let api!: Lifecycle;
  render(Host, { props: { onReady: (a: Lifecycle) => (api = a) } });
  await flush();
  // Let the initial bind settle.
  resolveBind?.();
  await flush();
  return api;
}

describe('background suspend/resume', () => {
  it('keeps the UI bound and never re-binds across a suspend', async () => {
    const api = await mount();

    expect(workerCalls).toContain('setFeed');
    expect(feedsStore.boundFeedId).toBe('cluj-napoca');

    // -- Suspend (the app is backgrounded) -------------------------------
    workerCalls.length = 0;
    bootCalls.length = 0;
    api.suspend();
    await flush();

    // No bind may start while the page is backgrounded: it would push a
    // "Loading schedule..." entry and arm the watchdog for a page nobody
    // is looking at.
    expect(workerCalls).not.toContain('setFeed');
    expect(feedsStore.boundFeedId).toBe('cluj-napoca');
    expect(statusBus.entries.some((e) => e.message.startsWith('Loading schedule'))).toBe(false);
    expect(bootCalls).toContain('disarm()');

    // -- Resume (the rider brings the app back) --------------------------
    workerCalls.length = 0;
    bootCalls.length = 0;
    api.resume();
    await flush();

    // The resume re-opens the worker; it must NOT re-bind, and it must
    // not arm the stall watchdog (a resume is not a boot - arming it is
    // what caused the 15 s auto-reload).
    expect(workerCalls).toEqual(['resumeGtfs']);
    expect(feedsStore.boundFeedId).toBe('cluj-napoca');
    expect(bootCalls.some((c) => c.startsWith('arm('))).toBe(false);
    expect(statusBus.entries.some((e) => e.message.startsWith('Loading schedule'))).toBe(false);
  });

  it('re-binds when the feed itself changes across a suspend', async () => {
    const api = await mount();

    workerCalls.length = 0;
    api.suspend();
    await flush();
    expect(workerCalls).not.toContain('setFeed');

    // While backgrounded the registry publishes a newer build of the
    // same feed - the hash changes, so the resume must re-bind.
    feedsStore.feeds = [{ ...(FEED as object), hash: 'def456' } as never];
    workerCalls.length = 0;
    api.resume();
    await flush();

    expect(workerCalls).toContain('setFeed');
  });

  it('falls back to a full re-bind when the resume fails', async () => {
    const api = await mount();

    workerCalls.length = 0;
    resumeShouldFail = true;
    api.resume();
    await flush();

    // The fallback re-binds - that is a boot-class operation and may
    // arm the stall watchdog itself.
    expect(workerCalls).toContain('setFeed');
  });
});
