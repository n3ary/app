/*
 * resume.spec.ts - end-to-end cover for the background suspend/resume
 * cycle in a real browser against the production build.
 *
 * What this reproduces (the bug):
 *   iOS standalone PWAs freeze the page when backgrounded. On restore
 *   the old code cleared the bind key, which re-fired the bind effect
 *   while the page was hidden; that re-armed the key so the resume's
 *   re-bind was skipped, leaving the app unbound. The boot watchdog's
 *   15 s stall window then expired and the page did a full
 *   `location.reload()` - a green "Loading schedule..." bar and a hard
 *   flicker about 15 s after the rider came back.
 *
 * The contract now:
 *   suspend -> the worker releases its OPFS handles, the UI keeps its
 *             bound state, nothing flips to a loading state
 *   resume  -> the worker re-opens its DB and refreshes live data; no
 *             re-bind, no progress bar, no page reload
 *
 * The visibility transition is simulated by overriding
 * `document.visibilityState` and dispatching `visibilitychange` - the
 * exact signal the app listens for.
 */

import { test, expect, type Page } from '@playwright/test';

const FEED_ID = 'cluj-napoca';

async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => s,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** Read a value out of the app's debug store hooks. */
async function readState<T>(page: Page, fn: (stores: any) => T): Promise<T> {
  return page.evaluate((src) => {
    const stores = (window as any).neary?.stores;
    if (!stores) throw new Error('window.neary.stores missing - app did not boot');
    // eslint-disable-next-line no-new-func
    return new Function('stores', `return (${src})(stores);`)(stores);
  }, fn.toString());
}

test.describe('background suspend / resume', () => {
  test.slow(); // the first bind downloads + imports the feed into OPFS

  test('resumes without a reload, a loading flash, or a lost binding', async ({ page }) => {
    // Seed the feed choice so the app binds on load.
    await page.addInitScript((feedId) => {
      localStorage.setItem(
        'neary-user-prefs',
        JSON.stringify({ feedId, theme: 'auto' }),
      );
    }, FEED_ID);

    await page.goto('/');

    // 1. Wait for the bind to finish. "Schedule ready." is a success
    //    entry on the StatusBar (2.5 s TTL), so it comes and goes -
    //    poll the store instead of racing the text.
    await expect
      .poll(
        () => readState(page, (s) => s.feedsStore.boundFeedId),
        { timeout: 180_000, message: 'feed never bound' },
      )
      .toBe(FEED_ID);

    // 2. Marker: a page reload would wipe it.
    await page.evaluate(() => {
      (window as any).__resumeMarker = 'alive';
    });

    // 3. Capture the live-feed timestamp before the suspend so we can
    //    prove the resume actually refreshed the data.
    const fetchBefore = await readState(
      page,
      (s) => s.reconciledVehiclesStore.lastFetchMs,
    );

    // 4. Background the app, then bring it back.
    await setVisibility(page, 'hidden');
    await page.waitForTimeout(2_000);
    await setVisibility(page, 'visible');

    // 5. Wait past the boot watchdog's 15 s stall window. With the old
    //    code this is where `location.reload()` fired.
    await page.waitForTimeout(20_000);

    // 6. The page must not have reloaded.
    expect(
      await page.evaluate(() => (window as any).__resumeMarker),
      'page reloaded on resume - the boot watchdog fired',
    ).toBe('alive');

    // 7. The binding survived: the UI never dropped back to "loading".
    expect(
      await readState(page, (s) => s.feedsStore.boundFeedId),
      'feed binding was lost across the suspend',
    ).toBe(FEED_ID);

    // 8. No "Loading schedule..." entry - that is the green bar the rider
    //    saw. A bind must not have started.
    const statusMessages = await readState(
      page,
      (s) => s.statusBus.entries.map((e: any) => e.message),
    );
    expect(
      statusMessages.filter((m: string) => m.startsWith('Loading schedule')),
      'a bind was started during the suspend/resume',
    ).toEqual([]);

    // 9. Live data refreshed in the background after the resume.
    await expect
      .poll(
        () => readState(page, (s) => s.reconciledVehiclesStore.lastFetchMs),
        { timeout: 30_000, message: 'live feed never refreshed after the resume' },
      )
      .toBeGreaterThan(fetchBefore ?? 0);
  });

  test('a hidden page does not re-bind and does not arm the watchdog', async ({
    page,
  }) => {
    await page.addInitScript((feedId) => {
      localStorage.setItem(
        'neary-user-prefs',
        JSON.stringify({ feedId, theme: 'auto' }),
      );
    }, FEED_ID);

    await page.goto('/');
    await expect
      .poll(
        () => readState(page, (s) => s.feedsStore.boundFeedId),
        { timeout: 180_000, message: 'feed never bound' },
      )
      .toBe(FEED_ID);

    // Count the binds the worker sees. The repo facade is not exposed on
    // window, so watch the observable side effects instead: a bind
    // pushes a "Loading schedule..." status entry and sets bindingFeedId.
    await setVisibility(page, 'hidden');
    await page.waitForTimeout(3_000);

    const during = await readState(page, (s) => ({
      bindingFeedId: s.feedsStore.bindingFeedId,
      messages: s.statusBus.entries.map((e: any) => e.message),
    }));

    expect(during.bindingFeedId, 'a bind was in flight while backgrounded').toBeNull();
    expect(
      during.messages.filter((m: string) => m.startsWith('Loading schedule')),
      'a bind was started while the page was backgrounded',
    ).toEqual([]);
  });
});
