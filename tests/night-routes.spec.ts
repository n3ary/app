/*
 * night-routes.spec.ts -- end-to-end cover for the post-midnight
 * service-day rollover (the "night routes vanish at midnight" bug).
 *
 * A GTFS service day is not a calendar day: it runs from 00:00 to as
 * much as 28:00, so trips can be published at "25:10" (01:10 the next
 * morning) and they belong to the PREVIOUS calendar date's service
 * day. The app resolved services for the calendar date, so between
 * midnight and the end of the night service the buses that were
 * actually running were invisible -- they dropped off the station board
 * at exactly the moment they started running, and the ETA arithmetic
 * mixed two timelines (a 24 h error).
 *
 * The feed is the real published Cluj feed; the bus is the real night
 * line 25N.
 *
 * WHY THE FIXTURE IS DERIVED, NOT HARDCODED
 * -----------------------------------------
 * The upstream feed is regenerated regularly and its calendar window
 * STARTS at the regeneration date (calendar.start_date == the feed's
 * generated_at date). Every hardcoded service day therefore goes stale
 * within days -- this test used to pin 2026-10-25 and broke the next
 * time the publisher ran. So the test now reads the published feed's
 * own calendar and picks the first Sunday inside the window, and it
 * resolves the night trip + its first stop from the same source. The
 * invariant under test is stable ("a Sunday-only night line runs past
 * midnight and its ETA is sane"); the identifiers are not.
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
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FEEDS_URL = 'https://gtfs.n3ary.com/feeds.json';
const BINARIES_BASE = 'https://gtfs.n3ary.com';
const FEED_ID = 'cluj-napoca';
/** The night line's published short name. */
const NIGHT_ROUTE_SHORT_NAME = '25N';
const TIME_ZONE = 'Europe/Bucharest';
/** 24 h -- the arrivals window the app asks the worker for. */
const ARRIVALS_WINDOW_MIN = 1440;
/** Minutes past midnight of the "now" the night bus is queried at. */
const NIGHT_QUERY_MIN = 0 * 60 + 30; // 00:30 local, the day after the service day
const MIDDAY_QUERY_MIN = 12 * 60; // 12:00 local, the day after the service day

/**
 * The night bus as published: the trip, the stop it leaves from, and
 * the departure time in minutes past the SERVICE day's midnight (a
 * GTFS "25:10" is 1510).
 */
interface NightService {
  tripId: string;
  stopId: string;
  departureMinutes: number;
  /** YYYY-MM-DD -- a Sunday inside the feed's own calendar window. */
  serviceDay: string;
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function tzOffsetMs(timestamp: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(timestamp));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - timestamp;
}

/** A wall-clock time in `timeZone` (YYYY-MM-DD + minutes) as a UTC ms instant. */
function zonedMs(dateIso: string, minutes: number, timeZone: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  // One correction pass is enough: the offset is looked up at the
  // naive instant, and Bucharest has no DST transition within a few
  // hours of any wall-clock time this test uses.
  return naive - tzOffsetMs(naive, timeZone);
}

/** The same calendar date, in UTC, as YYYY-MM-DD. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The first Sunday on or after `startIso`, as YYYY-MM-DD. */
function firstSundayOnOrAfter(startIso: string): string {
  const [y, m, d] = startIso.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  while (cursor.getUTCDay() !== 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return isoDate(cursor);
}

/** The day after `dateIso`, as YYYY-MM-DD. */
function nextDay(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  return isoDate(cursor);
}

/** "25:10:00" -> 1510 (minutes past the service day's midnight). */
function gtfsTimeToMinutes(value: string): number {
  const [h, min] = value.split(':').map(Number);
  return h * 60 + min;
}

/**
 * Read the published feed's calendar + night line out of its sqlite.
 * The publisher also ships the same feed as a .gtfs.zip, but a zip
 * reader is a dependency this repo does not have, while Node 24+
 * ships `node:sqlite` and `node:zlib` in core.
 */
async function resolveNightService(): Promise<NightService> {
  const registryRes = await fetch(FEEDS_URL);
  if (!registryRes.ok) throw new Error(`feeds.json: HTTP ${registryRes.status}`);
  const registry = (await registryRes.json()) as {
    feeds: Array<{ id: string; files: { sqlite_gz: string } }>;
  };
  const feed = registry.feeds.find((f) => f.id === FEED_ID);
  if (!feed) throw new Error(`feed "${FEED_ID}" is not in the published registry`);

  const binRes = await fetch(`${BINARIES_BASE}/${feed.files.sqlite_gz}`);
  if (!binRes.ok) throw new Error(`seed download: HTTP ${binRes.status}`);
  const dir = mkdtempSync(join(tmpdir(), 'neary-night-feed-'));
  const path = join(dir, 'feed.sqlite3');
  writeFileSync(path, gunzipSync(Buffer.from(await binRes.arrayBuffer())));

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      // Night trips of the night line: the ones that depart AFTER
      // midnight, i.e. at 24:xx or later on the service day. Ordered by
      // departure, so the first row is the last one out of the depot --
      // the one that is still running at 00:30.
      const rows = db
        .prepare(
          `SELECT t.trip_id AS tripId,
                  st.stop_id AS stopId,
                  st.departure_time AS departureTime,
                  c.start_date AS startDate,
                  c.end_date AS endDate
             FROM trips t
             JOIN stop_times st ON st.trip_id = t.trip_id AND st.stop_sequence = 0
             JOIN routes r ON r.route_id = t.route_id
             JOIN calendar c ON c.service_id = t.service_id
            WHERE r.route_short_name = ?
              AND c.sunday = 1
            ORDER BY st.departure_time DESC`,
        )
        .all(NIGHT_ROUTE_SHORT_NAME) as Array<{
        tripId: string;
        stopId: string;
        departureTime: string;
        startDate: string;
        endDate: string;
      }>;

      const night = rows.find((r) => gtfsTimeToMinutes(r.departureTime) >= 24 * 60);
      if (!night) {
        throw new Error(
          `the published ${FEED_ID} feed has no after-midnight trip on route ${NIGHT_ROUTE_SHORT_NAME}`,
        );
      }
      // calendar dates are YYYYMMDD.
      const startIso = `${night.startDate.slice(0, 4)}-${night.startDate.slice(4, 6)}-${night.startDate.slice(6, 8)}`;
      return {
        tripId: night.tripId,
        stopId: night.stopId,
        departureMinutes: gtfsTimeToMinutes(night.departureTime),
        serviceDay: firstSundayOnOrAfter(startIso),
      };
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** node:sqlite is stable from Node 24; skip rather than fail below that. */
const HAS_NODE_SQLITE = await (async (): Promise<boolean> => {
  try {
    await import('node:sqlite');
    return true;
  } catch {
    return false;
  }
})();

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
  stopId: string,
  nowMs: number,
): Promise<Array<{ route: string; etaMinutes: number | null; tripId: string | null }>> {
  return page.evaluate(
    async ({ stopId, nowMs, windowMin }) => {
      const repo = (window as any).neary?.repo;
      if (!repo) throw new Error('window.neary.repo missing — app did not boot');
      const res = await repo.getStationBoard(stopId, nowMs, windowMin);
      return (res?.vehicles ?? []).map((v: any) => ({
        route: v.route?.shortName ?? '',
        etaMinutes: v.eta?.minutes ?? null,
        tripId: v.tripId ?? null,
      }));
    },
    { stopId, nowMs, windowMin: ARRIVALS_WINDOW_MIN },
  );
}

test.describe('night routes across midnight', () => {
  test.slow(); // first bind downloads + imports the feed into OPFS

  test.skip(!HAS_NODE_SQLITE, 'needs node:sqlite (Node 24+) to read the published calendar');

  test('a night bus running after midnight is on the board with a sane ETA', async ({
    page,
  }) => {
    const night = await resolveNightService();
    await bindFeed(page);

    // The query happens on the day AFTER the service day: the trip
    // belongs to the previous service day, which is the whole point of
    // the bug this test guards.
    const queryDay = nextDay(night.serviceDay);
    const board = await boardAt(
      page,
      night.stopId,
      zonedMs(queryDay, NIGHT_QUERY_MIN, TIME_ZONE),
    );

    const bus = board.find((v) => v.tripId === night.tripId);
    if (!bus) {
      throw new Error(
        `the ${NIGHT_ROUTE_SHORT_NAME} bus ${night.tripId} is missing from the board at 00:30 (board: ${JSON.stringify(board.filter((v) => v.route === NIGHT_ROUTE_SHORT_NAME))}). Its service day is ${night.serviceDay}, not ${queryDay} — the service day rolled over and the bus was dropped.`,
      );
    }
    // The trip departs at, say, 25:10 -- 1510 minutes past the SERVICE
    // day's midnight. "Now" is 00:30 on the next calendar day, which
    // is 1470 minutes past the same service day's midnight.
    const expected = night.departureMinutes - (24 * 60 + NIGHT_QUERY_MIN);
    expect(
      bus.etaMinutes,
      `the ${NIGHT_ROUTE_SHORT_NAME} ETA is ${bus.etaMinutes} minutes — the bus departs at ${Math.floor(night.departureMinutes / 60) - 24}:${String(night.departureMinutes % 60).padStart(2, '0')}, so it must be ~${expected}`,
    ).toBeGreaterThan(35);
    expect(bus.etaMinutes).toBeLessThan(45);
    expect(bus.etaMinutes).toBeCloseTo(expected, 0);
  });

  test('the same bus is gone once its service day is over (control)', async ({
    page,
  }) => {
    const night = await resolveNightService();
    await bindFeed(page);

    // At 12:00 on the day after the service day the service day is
    // long over, so its trips must not appear — if they did, the
    // previous service day would be pulled in unconditionally.
    const queryDay = nextDay(night.serviceDay);
    const board = await boardAt(
      page,
      night.stopId,
      zonedMs(queryDay, MIDDAY_QUERY_MIN, TIME_ZONE),
    );

    expect(
      board.some((v) => v.tripId === night.tripId),
      'a past service day leaked into a mid-day board',
    ).toBe(false);
  });
});
