/*
 * night-routes.spec.ts -- end-to-end cover for the post-midnight
 * service-day rollover (the "night routes vanish at midnight" bug).
 *
 * A GTFS service day is not a calendar day: it runs from 00:00 to as
 * much as 28:00, so trips can be published at "25:10" (01:10 the next
 * morning) and they belong to the PREVIOUS calendar date's service
 * day. The app resolved services for the calendar date, so between
 * midnight and the end of the night service the buses that were
 * actually running were invisible - they dropped off the station board
 * at exactly the moment they started running, and the ETA arithmetic
 * mixed two timelines (a 24 h error).
 *
 * The feed is the real published Cluj feed; the bus is the real night
 * line 25N:
 *
 *   now   = Monday 2026-10-26 00:30 Europe/Bucharest (UTC+2)
 *   bus   = route 25N, trip 15_0_D_4_2510, service "D" (Sunday-only),
 *           departs 25:10 -> Monday 01:10
 *
 * so at 00:30 the bus is 40 minutes away and MUST be on the board.
 * Its service day is Sunday 2026-10-25.
 *
 * The clock is passed EXPLICITLY to the query rather than faked in the
 * page: the worker runs in its own JS context, so a faked page clock
 * does not reach it (the worker stamps its own poll times). Driving
 * `repo.getStationBoard(stopId, nowMs, window)` with an explicit
 * nowMs exercises the real query path with a deterministic clock.
 *
 * Run: pnpm exec playwright test tests/night-routes.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

// Monday 2026-10-26 00:30 Europe/Bucharest. Bucharest is UTC+2 after
// the DST end on 2026-10-25 03:00 local.
const FAKED_NOW_MS = Date.parse('2026-10-25T22:30:00Z');
/** Monday 2026-10-26 12:00 local - the control: well outside the night
 *  window, so the previous service day is over. */
const MIDDAY_NOW_MS = Date.parse('2026-10-26T10:00:00Z');

/** The night line 25N's first stop ("Disp. Bucium"), where the 01:10
 *  departure of the Sunday service day is still ahead of us. */
const NIGHT_STOP_ID = '46';
const NIGHT_ROUTE_SHORT_NAME = '25N';
/** The Sunday-service-day trip that departs at 25:10 (Monday 01:10).
 *  Service "D" is Sunday-only, so this trip only exists in the board
 *  while Sunday's service day is still running. */
const NIGHT_TRIP_ID = '15_0_D_4_2510';
/** 24 h - the arrivals window the app asks the worker for. */
const ARRIVALS_WINDOW_MIN = 1440;

async function bindFeed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'neary-user-prefs',
      JSON.stringify({ feedId: 'cluj-napoca', theme: 'auto' }),
    );
  });
  await page.goto('/');
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as any).neary?.stores?.feedsStore?.boundFeedId ?? null,
        ),
      { timeout: 180_000, message: 'feed never bound' },
    )
    .toBe('cluj-napoca');
}

async function boardAt(
  page: Page,
  nowMs: number,
): Promise<Array<{ route: string; etaMinutes: number | null; tripId: string | null }>> {
  return page.evaluate(
    async ({ stopId, nowMs, windowMin }) => {
      const repo = (window as any).neary?.repo;
      if (!repo) throw new Error('window.neary.repo missing - app did not boot');
      const res = await repo.getStationBoard(stopId, nowMs, windowMin);
      return (res?.vehicles ?? []).map((v: any) => ({
        route: v.route?.shortName ?? '',
        etaMinutes: v.eta?.minutes ?? null,
        tripId: v.tripId ?? null,
      }));
    },
    { stopId: NIGHT_STOP_ID, nowMs, windowMin: ARRIVALS_WINDOW_MIN },
  );
}

test.describe('night routes across midnight', () => {
  test.slow(); // first bind downloads + imports the feed into OPFS

  test('a night bus running after midnight is on the board with a sane ETA', async ({
    page,
  }) => {
    await bindFeed(page);
    const board = await boardAt(page, FAKED_NOW_MS);

    const night = board.find((v) => v.tripId === NIGHT_TRIP_ID);
    if (!night) {
      throw new Error(
        `the 25N bus ${NIGHT_TRIP_ID} is missing from the board at 00:30 (board: ${JSON.stringify(board.filter((v) => v.route === NIGHT_ROUTE_SHORT_NAME))}). Its service day is Sunday, not Monday - the service day rolled over and the bus was dropped.`,
      );
    }
    // It departs at 01:10, so at 00:30 it is 40 minutes away. Before
    // the fix the arithmetic mixed timelines and produced ~24 h.
    expect(
      night.etaMinutes,
      `the 25N ETA is ${night.etaMinutes} minutes - the bus departs at 01:10, so it must be ~40`,
    ).toBeGreaterThan(35);
    expect(night.etaMinutes).toBeLessThan(45);
  });

  test('the same bus is gone once its service day is over (control)', async ({
    page,
  }) => {
    await bindFeed(page);
    const board = await boardAt(page, MIDDAY_NOW_MS);

    // At 12:00 Monday the Sunday service day is long over, so its
    // trips must not appear - if they did, the previous service day
    // would be pulled in unconditionally.
    expect(
      board.some((v) => v.tripId === NIGHT_TRIP_ID),
      'a past service day leaked into a mid-day board',
    ).toBe(false);
  });
});
