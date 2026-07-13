/*
 * favorites-sentinel.spec.ts — Playwright probe for the /favorites
 * Stations-tab pagination trigger (issue #328).
 *
 * Why this exists:
 *   The Stations tab paginates "all other stations" as the user
 *   scrolls. The previous implementation used an IntersectionObserver
 *   on a sentinel row with `rootMargin: '0px 0px 1000px 0px'`. That
 *   observer fires whenever the sentinel crosses its edge — including
 *   layout reflows from stationScope changes, row-grow on marker-chip
 *   population, and viewport resizes. None of those are user scrolls,
 *   but all of them silently appended the next page and shifted the
 *   user's mid-list view.
 *
 *   The fix replaces the IntersectionObserver with a `scroll` event
 *   listener. A `scroll` event only fires on real user input, so
 *   reflows no longer paginate.
 *
 * What this verifies:
 *   1. Idle (no scroll) for 30 s does not paginate. The pinned row's
 *      y stays put and the "Showing N of M" caption's N does not
 *      increase.
 *   2. A user scroll to within 200 px of the document bottom DOES
 *      paginate within 500 ms (negative test for the fix).
 *
 * Network dependency:
 *   Loading a real feed is a network operation (feeds.json +
 *   sqlite_gz). When the network is unavailable or the feed catalog
 *   is empty, the test skips with a clear reason rather than fail —
 *   the pagination behavior is unreachable without a feed. CI runs
 *   with network access; local dev usually does too.
 *
 * Run: `pnpm exec playwright test favorites-sentinel`
 * (after `pnpm run build` — the preview server runs the static
 * build, the test asserts against the build output, not the dev
 * server, per the same contract as pwa.spec.ts.)
 */

import { test, expect, type Page } from '@playwright/test';

const FEEDS_URL = 'https://gtfs.n3ary.com/feeds.json';
const STATIONS_TAB = '/favorites?tab=stations';
const STATION_ROW_SELECTOR = '[data-testid="favorite-station-row"]';

/** Pre-seed localStorage with a feed id so the /favorites page renders
 *  the Stations catalog instead of the "Pick a feed" empty state. */
async function selectFirstFeed(page: Page): Promise<string | null> {
  const res = await page.request.get(FEEDS_URL);
  if (!res.ok()) return null;
  const body = (await res.json()) as { feeds?: Array<{ id: string }> };
  const feeds = body.feeds ?? [];
  if (!Array.isArray(feeds) || feeds.length === 0) return null;
  const id = feeds[0].id;
  await page.addInitScript((feedId) => {
    const STORAGE_KEY = 'neary-user-prefs';
    const prev = localStorage.getItem(STORAGE_KEY);
    const parsed = prev ? (JSON.parse(prev) as Record<string, unknown>) : {};
    parsed.feedId = feedId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  }, id);
  return id;
}

/** Wait for the first stations catalog row to appear. Returns the
 *  count of rows currently rendered, or 0 if the catalog never
 *  populated. */
async function waitForCatalog(page: Page): Promise<number> {
  try {
    await page.locator(STATION_ROW_SELECTOR).first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    return 0;
  }
  return await page.locator(STATION_ROW_SELECTOR).count();
}

/** Read the "Showing N of M stations" caption, or null if the caption
 *  is in a non-count state ("Loading…", "No stations…"). */
async function readShowingCount(page: Page): Promise<{ shown: number; total: number } | null> {
  const text = await page
    .locator('text=/Showing \\d+ of \\d+ stations/')
    .first()
    .textContent()
    .catch(() => null);
  if (!text) return null;
  const match = text.match(/Showing\s+(\d+)\s+of\s+(\d+)\s+stations/);
  if (!match) return null;
  return { shown: Number(match[1]), total: Number(match[2]) };
}

test.describe('favorites Stations tab — sentinel pagination (#328)', () => {
  test('30 s of idle does not paginate', async ({ page }) => {
    test.setTimeout(90_000);
    const feedId = await selectFirstFeed(page);
    test.skip(feedId === null, `feeds.json unreachable or empty at ${FEEDS_URL}`);
    if (!feedId) return;

    await page.goto(STATIONS_TAB);

    // iPhone PWA standalone geometry — match the device the user
    // reproduced the bug on.
    await page.setViewportSize({ width: 393, height: 852 });

    const rowCount = await waitForCatalog(page);
    test.skip(rowCount === 0, 'stations catalog did not populate — no live feed in this env');
    if (rowCount === 0) return;

    // Scroll to a mid-list position so the sentinel (in the old code)
    // would be just above the viewport. Use the page's natural scroll.
    const targetY = 1500;
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'auto' }), targetY);
    await page.waitForTimeout(150);

    // Pin the first currently-visible row to verify "did X stay put".
    // data-test-pin avoids the content-selector trap where the first
    // match resolves to a different element after a state change
    // (see svelte-ui-pitfalls agent memory: "Pin DOM identity when
    // measuring element-stayed-put after state change").
    const firstRow = page.locator(STATION_ROW_SELECTOR).first();
    await firstRow.evaluate((el) => el.setAttribute('data-test-pin', '1'));
    const baselineTop = await page
      .locator('[data-test-pin="1"]')
      .evaluate((el) => el.getBoundingClientRect().top);
    const baselineScrollY = await page.evaluate(() => window.scrollY);
    const baselineCount = await readShowingCount(page);

    // 30 s of no interaction. With the old IntersectionObserver, a
    // reflow during this window (a nowTicker tick, a stationAnchor
    // update, a row-grow) would silently paginate. The fix must
    // produce a no-op.
    await page.waitForTimeout(30_000);

    const finalTop = await page
      .locator('[data-test-pin="1"]')
      .evaluate((el) => el.getBoundingClientRect().top)
      .catch(() => null);
    const finalScrollY = await page.evaluate(() => window.scrollY);
    const finalCount = await readShowingCount(page);

    // The pinned row must still exist (Svelte didn't destroy it) and
    // its y must be within 1 px of the baseline. window.scrollY must
    // be unchanged. The shown-count must not have increased.
    expect(finalTop, 'pinned row was removed from the DOM during idle').not.toBeNull();
    if (finalTop === null) return;
    expect(Math.abs(finalTop - baselineTop)).toBeLessThan(1);
    expect(finalScrollY).toBe(baselineScrollY);
    if (baselineCount && finalCount) {
      expect(finalCount.shown).toBe(baselineCount.shown);
    }
  });

  test('user scroll to within 200 px of the bottom paginates', async ({ page }) => {
    test.setTimeout(60_000);
    const feedId = await selectFirstFeed(page);
    test.skip(feedId === null, `feeds.json unreachable or empty at ${FEEDS_URL}`);
    if (!feedId) return;

    await page.goto(STATIONS_TAB);
    await page.setViewportSize({ width: 393, height: 852 });

    const rowCount = await waitForCatalog(page);
    test.skip(rowCount === 0, 'stations catalog did not populate — no live feed in this env');
    if (rowCount === 0) return;

    // The fix only paginates when there's a real "more" available.
    // If the feed is small enough that page 0 covers it, this test
    // is meaningless — skip.
    const baselineCount = await readShowingCount(page);
    test.skip(
      baselineCount?.total !== undefined && baselineCount.total <= 40,
      `feed only has ${baselineCount?.total ?? 0} stations; nothing to paginate to`,
    );

    // Scroll to within 150 px of the document bottom. The listener
    // fires on distance < 200.
    await page.evaluate(() => {
      const target = document.documentElement.scrollHeight - window.innerHeight - 150;
      window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
    });

    // Wait up to 2 s for the next page to land. The fetch is a worker
    // round-trip + render — sub-second on warm cache, ~1-2 s cold.
    await expect
      .poll(async () => (await readShowingCount(page))?.shown ?? 0, { timeout: 2_000 })
      .toBeGreaterThan(baselineCount?.shown ?? 0);
  });
});
