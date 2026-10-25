/*
 * favorites-tabswap.spec.ts -- Playwright probe for the scroll
 * preservation across a tab swap (issue #344).
 *
 * The requirement is user-facing: the rider is deep in a long list,
 * taps the other tab, and must NOT be thrown back to the top.
 *
 * The inactive tab panel is `display: none` (so the shorter tab leaves
 * no blank gap under it), which means the document height DOES change
 * across a swap. Scroll preservation therefore has to be explicit: the
 * page remembers each tab's scroll offset and restores the target
 * tab's own offset after the swap.
 *
 * Test note: the tab is activated from inside the page
 * (`button.click()`) rather than through Playwright's `click()`. Playwright
 * scrolls the target into view before clicking it, which would move the
 * page to the tab strip (scrollY = 0) before the app ever sees the
 * event - the app's own restore would then have nothing to restore.
 * The in-page click exercises the app's handler alone.
 *
 * The earlier probe asserted the document HEIGHT was stable, which
 * `display: none` makes impossible - it skipped whenever the stations
 * catalog failed to populate (no feed bound in CI) and therefore never
 * actually validated the behaviour it was written for. It now asserts
 * the scroll position, which is what the rider notices.
 */

import { test, expect, type Page } from '@playwright/test';

const FEEDS_URL = 'https://gtfs.n3ary.com/feeds.json';
const STATIONS_TAB = '/favorites?tab=stations';
const STATION_ROW_SELECTOR = '[data-testid="favorite-station-row"]';

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

async function waitForCatalog(page: Page): Promise<number> {
  try {
    await page.locator(STATION_ROW_SELECTOR).first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    return 0;
  }
  return await page.locator(STATION_ROW_SELECTOR).count();
}

/**
 * Activate a tab from inside the page, reproducing the browser's
 * event order for a control that is NOT in the viewport:
 *
 *   pointerdown -> focus -> the browser scrolls the focused control
 *   into view -> click
 *
 * The middle step is the one that matters: the tab strip sits at the
 * top of the page, so activating it scrolls the page to the top
 * BEFORE the app's click handler runs. The app therefore has to
 * remember the pre-tap offset itself (captured on pointerdown) - the
 * offset its handler reads is already 0.
 *
 * Playwright's own `click()` cannot be used here: it scrolls the
 * target into view before clicking, which would move the page for the
 * same reason but without the pointerdown the app listens for.
 */
async function activateTab(page: Page, label: string): Promise<void> {
  await page.evaluate((l) => {
    const btn = [...document.querySelectorAll('button[role="tab"]')].find((b) =>
      b.textContent?.includes(l),
    ) as HTMLElement | undefined;
    if (!btn) throw new Error(`tab "${l}" not found`);
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    window.scrollTo({ top: 0, behavior: 'auto' });
    btn.click();
  }, label);
  await page.waitForTimeout(800);
}

test.describe('favorites tabs -- scroll preserved across tab swap', () => {
  test('the scroll position survives a Stations <-> Routes swap', async ({ page }) => {
    test.setTimeout(120_000);
    const feedId = await selectFirstFeed(page);
    test.skip(feedId === null, `feeds.json unreachable or empty at ${FEEDS_URL}`);
    if (!feedId) return;

    await page.goto(STATIONS_TAB);
    await page.setViewportSize({ width: 393, height: 852 });

    const rowCount = await waitForCatalog(page);
    test.skip(rowCount === 0, 'stations catalog did not populate');
    if (rowCount === 0) return;

    // Scroll into the middle of the stations list.
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'auto' }));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'could not scroll the stations catalog').toBeGreaterThan(100);

    // Swap to the Routes tab (never visited before -> the rider's
    // current depth carries over).
    await activateTab(page, 'Routes');
    const after = await page.evaluate(() => window.scrollY);
    expect(
      after,
      `scroll jumped on tab swap (before=${before}, after=${after}) - the rider was thrown back to the top`,
    ).toBeGreaterThan(100);

    // Swap back: the Stations tab's own remembered offset comes back.
    await activateTab(page, 'Stations');
    const back = await page.evaluate(() => window.scrollY);
    expect(
      Math.abs(back - before),
      `returning to Stations did not restore the scroll (before=${before}, back=${back})`,
    ).toBeLessThan(40);
  });
});

