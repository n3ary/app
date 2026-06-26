# neary-gtfs — refactor plan (Transitous-aligned)

Status: **draft** — to be opened as a PR / branch on `ciotlosm/neary-gtfs`.
Date: 2026-06-26.
Lives in this repo (neary v2) because it directly informs Phase 4 / 5 of the
[v2 rebuild plan](plan.md) and the app cannot ship without the registry it
describes.

---

## 1. Goal

Reduce `neary-gtfs` to the **minimum unique work**:

1. The **CTP Cluj enhancement** — scrape `ctpcj.ro` official CSV timetables
   daily, produce a spec-compliant GTFS `.zip` that's fresher than the
   `mdb-2121` mirror everyone else uses.
2. A **SQLite conversion** of every feed we want the neary v2 app to load
   (ours-for-Cluj + a curated subset of Transitous's outputs for everything
   else).
3. An **app-facing index** (`feeds.json`) the neary app fetches on launch.

Stop maintaining: a custom registry schema, agency-shaped JSON outputs,
hash-based change-detection bookkeeping, Tranzy-syncing. Transitous already
does all of this better.

## 2. What goes away

| Today in neary-gtfs | Why it goes |
|---|---|
| `src/sync-tranzy.js` (daily Tranzy API mirror) | Tranzy's schedule data is lossy (no arrival/departure times); its live vehicles are now public via `cluj-rt-feed.gtfs.ro` |
| `data/agency.json` (Tranzy-shaped registry) | Transitous's `feeds/<iso>.json` is the standard. We project from it. |
| `data/<id>/{routes,stops,trips,stop_times,shapes}.json` | Redundant once the app consumes standard GTFS .zip + SQLite |
| `agency-2-schedule.json` (custom compact format) | Redundant once we ship `.sqlite3.gz` |
| Bespoke `hashes.json` cache-busting | GitHub raw URLs already serve `Last-Modified`/`ETag`; Transitous handles the same on upstream feeds |
| Per-agency `agencies/<id>/config.json` for non-Cluj agencies | Transitous's `ro.json` already lists those agencies; we curate via the country list, not per-agency |

## 3. What survives

| Today in neary-gtfs | New role |
|---|---|
| `agencies/2/config.json` — CTP URL patterns + service-day mappings | Move to `feeds/ctp-cluj/config.json` |
| `src/build.js` — ctpcj.ro CSV scraper | Move to `feeds/ctp-cluj/build.js`. **Only custom build script we keep.** |
| Daily GitHub Action | Rewritten — see §6 |

## 4. Tranzy.ai — disposition (revised)

**Demoted from required-or-removed to OPTIONAL advanced signal.** Default
neary v2 needs no Tranzy key at all — RT alone covers the baseline. Power
users who supply a key get higher-confidence vehicle reconciliation. Full
empirical comparison: [live-data-analysis.md](live-data-analysis.md).

### Default (no API key, all users)

The CTP GTFS-RT feed at `cluj-rt-feed.gtfs.ro` carries everything the
baseline UX needs:

| Tranzy capability | Replacement |
|---|---|
| Live vehicle positions | `vehiclePositions` (public, free, standard GTFS-RT, regenerates every 10 s) |
| Trip updates | `tripUpdates` (same) |
| Service alerts | `serviceAlerts` (same) |
| Schedule (lossy in Tranzy) | ctpcj.ro CSV → our GTFS |
| Route / stop / trip / shape JSON | Standard GTFS via the SQLite blob |

The canonical CTP `trip_id` format (e.g. `42_1_LV_2_0640`) is shared
between the RT feed and our SQLite — direct JOIN, no remapping. RT also
carries operational fields Tranzy lacks (`bearing`, `current_status`,
`current_stop_sequence`, `next stop_id`).

### Advanced (with API key, opt-in)

When a user pastes a Tranzy API key in **Settings → Advanced**, the live
worker polls Tranzy as a **second signal** in parallel with RT. The
reconciler then encodes the multi-source agreement in the Vehicle's
`sources` / `confidence` fields (see [plan.md §3](plan.md#3-architecture)).

What this buys the power user:

- **Higher confidence display**: vehicles confirmed by both sources show
  a small "2/2" badge; single-source ones don't. Useful for users who
  care whether the bus icon they see is "really" where it appears.
- **Faster freshness**: Tranzy median timestamp is ~60 s ahead of RT.
  When Tranzy says a bus is at position X and RT hasn't caught up, the
  reconciler trusts the fresher one for the displayed position.
- **Confirmed-ghost classification**: a scheduled run that's missing
  from RT *might* just be RT lag. If Tranzy also doesn't see it, the
  vehicle is a confirmed `ghost` rather than a probable one — the UI
  can render it with stronger styling.
- **Fleet-completeness debug** (separate Settings toggle, default off):
  show the ~251 yard / out-of-service buses Tranzy reports but RT
  filters. Pure debug surface for operators / curious users; not in
  the default station / route views.

### What does NOT change

- The default zero-config experience is unchanged from "RT-only".
- All app behaviour works without a Tranzy key.
- No Tranzy data is ever stored on disk — the key lives in `userPrefs`
  (localStorage); responses are kept in memory only.
- Tranzy is **only** consulted for the user's currently-selected
  agency, and only when the agency has a Tranzy `X-Agency-Id` mapping
  (Cluj = 2). For Romanian agencies outside Tranzy's coverage, the
  Advanced setting simply has no effect.

## 5. Repo structure (`refactor/feeds-from-transitous` branch)

```
neary-gtfs/
├─ countries.json                         # curated list of country codes from
│                                         # Transitous we expose to the neary app
│                                         # Initial: ["ro"]
├─ transitous-feeds/                      # git submodule -> public-transport/transitous
│                                         # gives us feeds/<iso>.json files as input
├─ feeds/
│  └─ ctp-cluj/                           # ONLY custom-built feed
│     ├─ build.js                         # ported from current src/build.js
│     └─ config.json                      # ctpcj.ro URL patterns & service days
├─ src/
│  └─ pipeline/
│     ├─ build-all.js                     # orchestrator (runs daily)
│     ├─ resolve-feeds.js                 # reads countries.json → walks transitous
│     │                                   # feeds/<iso>.json → flattens to a list
│     │                                   # of { name, gtfs_source, rt_sources, license }
│     ├─ fetch-gtfs.js                    # for each feed, fetch the .zip
│     │                                   # (api.transitous.org/gtfs/<name>.gtfs.zip
│     │                                   # for upstream feeds, OR our local
│     │                                   # build output for ctp-cluj)
│     ├─ make-sqlite.js                   # GTFS .zip → .sqlite3.gz
│     │                                   # (port of apps/web's scripts/build-sqlite)
│     ├─ derive-bbox.js                   # min/max lat,lon from stops.txt
│     │                                   # (replaces hand-curated per-feed bboxes)
│     └─ make-app-registry.js             # builds outputs/feeds.json from results
├─ outputs/                               # built artifacts (published to binaries)
│  ├─ feeds.json                          # THE single index the v2 app fetches
│  └─ feeds/
│     ├─ ctp-cluj.gtfs.zip                # standalone (publishable to Transitous)
│     ├─ ctp-cluj.sqlite3.gz
│     ├─ stb-bucuresti.sqlite3.gz         # derived from Transitous's STB mdb-2098
│     ├─ sctp-iasi.sqlite3.gz             # derived from Transitous's Iași mdb-2116
│     └─ ...                              # one per entry in resolved list
└─ .github/workflows/
   └─ daily.yml                           # cron 00:30 UTC → build-all.js → push binaries
```

## 6. Daily pipeline

```
00:30 UTC (chosen to be after Transitous's own ~00:00 UTC import finishes)
  └─ resolve-feeds.js
       ├─ reads countries.json → ["ro"]
       └─ for each iso, reads transitous-feeds/feeds/<iso>.json
            └─ flattens to list:
                 [{
                   id: "Cluj-Napoca",
                   gtfs_source: { type: "mobility-database", mdb-id: "mdb-2121" },
                   rt_sources: [ "vehicle_positions": "...", "trip_updates": "...", "service_alerts": "..." ],
                   license: "CC-BY-SA-4.0"
                 }, ...]
       
  └─ build-cluj.js                       # our unique pipeline
       ├─ scrape ctpcj.ro CSV files (per route, per service day)
       ├─ assemble standard GTFS .zip
       │     - agency.txt (single row, CTP Cluj)
       │     - routes/trips/stops/stop_times/calendar/calendar_dates/shapes
       │     - feed_info.txt with feed_publisher_name="neary-gtfs",
       │       feed_version=<date>, valid_from/until
       ├─ run canonical GTFS validator (MobilityData) → log warnings, fail on errors
       └─ output: outputs/feeds/ctp-cluj.gtfs.zip

  └─ for each resolved feed entry:
       ├─ if ctp-cluj: source = outputs/feeds/ctp-cluj.gtfs.zip (local)
       └─ else:         source = api.transitous.org/gtfs/<name>.gtfs.zip (cached upstream)
            └─ make-sqlite.js: GTFS .zip → <name>.sqlite3.gz
            └─ derive-bbox.js: read stops.txt → { minLat, minLon, maxLat, maxLon }

  └─ make-app-registry.js
       └─ outputs/feeds.json (see §7)

  └─ git commit + force-push to binaries branch (only if any output changed)
```

Output is published to the **`binaries`** branch — separate from
`releases` so the v1 neary app keeps working unchanged.

## 7. `outputs/feeds.json` schema (the app-facing index)

```jsonc
{
  "version": "2026-06-26T00:30:00Z",
  "generated_at": "2026-06-26T00:30:00Z",
  "feeds": [
    {
      "id": "ctp-cluj",                            // stable; what the app picks
      "name": "Cluj-Napoca",                       // human-facing
      "country": "RO",
      "region": "Cluj",
      "timezone": "Europe/Bucharest",
      "languages": ["ro"],
      "bbox": { "minLat": 46.71, "minLon": 23.50,  // derived from stops.txt
                "maxLat": 46.84, "maxLon": 23.74 },
      "center": { "lat": 46.770, "lon": 23.595 },  // bbox midpoint
      "agencies": [                                // pre-parsed from agency.txt
        { "agency_id": "2",
          "agency_name": "Compania de Transport Public Cluj-Napoca",
          "agency_url": "https://www.ctpcluj.ro/" }
      ],
      "source": {                                  // where the GTFS came from
        "type": "build",                           // "build" | "transitous" | "mobility-database"
        "publisher": "neary-gtfs",
        "upstream_url": null
      },
      "files": {
        "gtfs_zip":  "feeds/ctp-cluj.gtfs.zip",    // relative to binaries root
        "sqlite_gz": "feeds/ctp-cluj.sqlite3.gz"
      },
      "size_bytes": { "gtfs_zip": 1395000, "sqlite_gz": 4406857 },
      "hash": "sha256-abc…",                       // for cheap freshness checks
      "generated_at": "2026-06-26T00:30:00Z",
      "valid_from": "2025-11-01",                  // from feed_info.txt
      "valid_until": "2026-06-30",
      "realtime": {                                // copied straight from Transitous
        "vehicle_positions": "https://cluj-rt-feed.gtfs.ro/vehiclePositions",
        "trip_updates":      "https://cluj-rt-feed.gtfs.ro/tripUpdates",
        "service_alerts":    "https://cluj-rt-feed.gtfs.ro/serviceAlerts"
      },
      "license": {
        "spdx_identifier": "CC-BY-SA-4.0",
        "attribution_text": "© Compania de Transport Public Cluj-Napoca",
        "attribution_url": "https://www.ctpcluj.ro/"
      }
    },
    {
      "id": "stb-bucuresti",
      "name": "Bucharest",
      ...
      "source": {
        "type": "transitous",
        "publisher": "Transitous (mdb-2098)",
        "upstream_url": "https://api.transitous.org/gtfs/Bucuresti-Ilfov.gtfs.zip"
      },
      ...
    }
  ]
}
```

## 8. Publishing the Cluj feed for upstream Transitous consumption

Once `outputs/feeds/ctp-cluj.gtfs.zip` is being produced reliably, **open a
PR against `public-transport/transitous`** adding a new source to `ro.json`:

```jsonc
{
  "name": "Cluj-Napoca-CTP",
  "type": "http",
  "url": "https://raw.githubusercontent.com/ciotlosm/neary-gtfs/binaries/feeds/ctp-cluj.gtfs.zip",
  "license": {
    "spdx-identifier": "CC-BY-SA-4.0",
    "attribution-text": "© Compania de Transport Public Cluj-Napoca",
    "publisher": "neary-gtfs"
  },
  "fix": true
}
```

URL hosting choice: **GitHub raw on the `binaries` branch**. Reasoning:
- Free, public, HTTPS, CORS-open.
- Honors `Last-Modified` / `ETag` (Transitous's fetcher uses both).
- Same hosting pattern your current `data/<id>/*.json` already uses.
- Stable URL — branch refs don't change.

Once accepted upstream:
- Every Transitous downstream (KDE Itinerary, GNOME Maps, Bimba, Cartes,
  Railway, plus 100+ more contributors' apps) gets fresher Cluj data.
- Optionally we can either *keep* mdb-2121 as a fallback or have the
  Transitous maintainers drop it (their `skip` field) — that's a discussion
  on the PR.

## 9. Required v2 app changes (in this repo)

Tracked here because they need to land *with* the new `feeds.json` going
live, not before / after. All changes are on the v2 app (`apps/web/`),
nothing in `apps/legacy/`.

### 9.1 `apps/web/src/lib/data/`

| Today | Replacement |
|---|---|
| `agencies.ts` (fetches `data/agency.json`) | `feeds.ts` (fetches `feeds.json` from `binaries`); exposes `Feed[]` with `bbox`, `realtime` URLs, `files.sqlite_gz` |
| `AGENCIES_WITH_SQLITE = new Set([2])` hardcode | Removed — `hasSqlite` is now `feed.files.sqlite_gz != null` directly (always true; entries without SQLite simply aren't in `feeds.json`) |
| `gtfs/repo.ts` `setAgency(agencyId: number)` | `setFeed(feedId: string)` |
| `gtfs/types.ts` `Agency` | `Feed` (broader shape — see §7) |

### 9.2 `apps/web/src/lib/workers/gtfs.worker.ts`

- `seedUrlFor(agencyId)` / `manifestUrlFor(agencyId)` / `opfsFileFor(agencyId)`
  become `seedUrlFor(feed: Feed)` etc., reading
  `feed.files.sqlite_gz` directly.
- The hardcoded special-case for `agencyId === 2` (the dev `/dev-data/` path)
  is dropped — `feeds.json`'s `binaries` URL becomes the single source for
  every feed including Cluj (no more `apps/web/static/dev-data/`).
- Stays agency-parameterized — switching feeds = close current db, seed new
  OPFS file `/<feed-id>.sqlite3`, open.

### 9.3 `apps/web/src/lib/stores/userPrefs.svelte.ts`

| Today | Change |
|---|---|
| `agencyId: number \| null` | `feedId: string \| null` (e.g. `"ctp-cluj"`) |
| `apiKey: string \| null` | **Kept** but reframed in UI — the field stores the optional Tranzy API key for §4's "Advanced (with API key)" mode. Mentioned only in Advanced Settings; nothing in the default UX references it. |
| `showDropOffOnly`, `showGhostVehicles`, `theme` | Unchanged |
| (new) `showTranzyDebugFleet: boolean` | Default `false`. When `apiKey` is set, this toggles the fleet-completeness debug overlay (the ~251 yard buses Tranzy reports but RT filters). |

### 9.4 `apps/web/src/routes/settings/+page.svelte`

- Agency picker → **feed picker**, sorted by GPS proximity (auto-pick the
  bbox-containing feed by default; pick from list when no GPS).
- The "Live tracking" card stays at the **top** of Settings showing the
  current live-source status (RT always on; Tranzy on when key present).
- The Tranzy API key TextField moves into a new **Settings → Advanced**
  section, with copy framing it as an opt-in confidence booster, not as a
  requirement. New toggle "Show out-of-service fleet (debug)" gates the
  yard-buses overlay (§4).

### 9.5 `apps/web/src/lib/stores/locationStore.svelte.ts` (extension)

Add `pickFeed(feeds: Feed[]): Feed | null` helper that returns the first
feed whose `bbox` contains the current position. Called on first launch
when `userPrefs.feedId == null` and we have a GPS fix.
live sources, decodes
  payloads, runs the reconciler, pushes `Vehicle[]` updates through
  Comlink. **Two source channels**:

  - **`rt`** (always on for feeds that have `realtime.vehicle_positions`).
    GTFS-RT protobuf via `gtfs-realtime-bindings` (already installed).
    Poll **every 15 s** (server regenerates every 10 s — see §4 validation).
  - **`tranzy`** (active only when `userPrefs.apiKey` is set AND the
    current feed has a Tranzy agency mapping). JSON via
    `https://api.tranzy.ai/v1/opendata/vehicles` with `X-API-KEY` and
    `X-Agency-Id` headers. Poll **every 30 s** (gentler on the API and
    Tranzy is fresher by default, so doesn't need 15 s).

- **Reconciler** (`apps/web/src/lib/domain/reconcile.ts`) takes both
  channels + active scheduled trips and emits the `Vehicle[]` discriminated
  union. Source agreement encoded in `sources` and `confidence` per
  plan.md §3. Matching key across channels = the license plate
  (Tranzy `label` ≡ GTFS-RT `entity.id` ≡ `vehicle.licensePlate`).
- When only one channel is active (no Tranzy key), every confirmed
  vehicle gets `sources: ['rt']` and `confidence: 'medium'`. The UI is
  identical to today's design.
- **CORS workaround**: Tranzy already sends `Access-Control-Allow-Origin: *`
  (verified) so the worker can fetch directly. The GTFS-RT feed does NOT,
  so a Netlify Edge Function at `/rt/[feed]/[endpoint]` proxies it with
  a 5–10 s cache. Same-origin to the app, ~10 lines.
- Per-vehicle freshness rules (apply equally to both sources): >5 min
  stale → reclassify as `ghost`; >30 min → drop entirelyrkaround**: a Netlify Edge Function at `/rt/[feed]/[endpoint]`
  proxies the upstream RT URL with a 5–10 s cache (matching server
  regen). Lives in `apps/web/` edge config; same-origin to the app,
  ~10 lines.

### 9.7 Header status dots

- Schedule dot already wired (Phase 3) — works unchanged with `feedId`.
- Live dot starts reflecting real state in Phase 5 (driven by the live
  worker's last-success timestamp).
- API key dot mention is removed from the Settings copy.

### 9.8 Multi-feed data lifecycle (app side)

`feeds.json` is a **catalog** of many SQLite blobs, not one. The v2 app
therefore needs an explicit story for: which feed(s) are on-device,
when to swap, how to evict, and what happens offline. Owned by the
GTFS worker; the UI thread only sees high-level events (`seeding`,
`ready`, `evicted`, `offline-and-missing`).

#### 9.8.1 Storage model

Each feed lives as one OPFS file: `/<feedId>.sqlite3`. Multiple feeds
coexist in the same OPFS-SAHPool. A worker-owned metadata blob
`/feeds-meta.json` records per-feed bookkeeping:

```jsonc
{
  "version": 1,
  "feeds": {
    "ctp-cluj":      { "hash": "sha256-…", "generated_at": "...",
                       "size_bytes": 4406857, "last_used_at": "..." },
    "stb-bucuresti": { "hash": "sha256-…", "generated_at": "...",
                       "size_bytes": 9821000, "last_used_at": "..." }
  },
  "active": "ctp-cluj",
  "last_registry_check": "2026-06-26T08:14:00Z",
  "registry_etag": "W/\"abc…\""
}
```

#### 9.8.2 Switch flow

When `userPrefs.feedId` changes (from picker or auto-pick):

1. UI fires `setFeed(newId)` over Comlink. StatusBar shows
   `loading: "Switching to <Name>"`.
2. Worker closes the current `Database` handle (file stays in OPFS).
3. If `/<newId>.sqlite3` is **already in OPFS** *and* its `hash`
   matches `feeds.json[newId].hash` → open it; emit `ready`. Typical
   warm switch <100 ms.
4. Else (cold or stale): worker streams `feed.files.sqlite_gz` from
   `binaries`, decompresses, writes the OPFS file in place (overwrite
   if stale), updates `feeds-meta.json`, opens it. StatusBar shows
   percent done. Typical 4–20 MB → 1–5 s on a phone.
5. Old feed's OPFS file is **not deleted**. Kept for warm re-switch.
   Eviction handled in §9.8.4.

#### 9.8.3 Freshness check

Two-tier, cheap-by-default:

- **Tier A (every app launch + manual refresh)**: `GET feeds.json`
  with `If-None-Match: <registry_etag>`. 304 → no work. 200 → diff:
  for each on-device feed, compare its stored `hash` with the new one.
  Mismatch → mark that feed `stale: true` in `feeds-meta.json`.
- **Tier B (on stale-active-feed)**: surface the "Schedule" status
  dot as **yellow**. Clicking it opens a one-line update prompt
  ("Schedule update available · ~4 MB"). User confirms → §9.8.2 cold
  path runs in the background; current session keeps using the old
  blob until the new one is ready, then swaps. Never auto-evict
  mid-session.

This is the only network call against `feeds.json` after first launch.
The blobs themselves are immutable per `hash`, so re-seeding only
happens when the user opts in.

#### 9.8.4 Eviction policy

Goal: stay under **~100 MB total OPFS usage** for SQLite files, leave
headroom for the browser's own quota tasks.

Rules (run at end of every successful switch):

1. Never evict the **active** feed.
2. Never evict a feed marked `pinned: true` (offline-mode user
   intent — see §9.8.6).
3. If total OPFS GTFS bytes > 100 MB, evict by **least-recent
   `last_used_at`** until under budget.
4. When evicting a feed, also drop any favorites whose `feedId`
   equals that feed's id (§9.8.5). Soft-warn the user via StatusBar
   info ("Removed offline data for <Name>"); the user can re-pick
   that city to re-download.

100 MB / ~5 MB-per-feed gives ~20 cities cached without ever
evicting. The budget is intentionally generous because OPFS is
opt-in for the user (Safari shows an install prompt for PWAs > 50 MB
on iOS; the app stays under that by default since only one feed is
"hot" at a time).

#### 9.8.5 Favorites are feed-scoped

A stop_id like `1234` is meaningless without an agency context — the
same numeric ID in Cluj and Bucharest refers to different stops. The
favorites store therefore keys on `{ feedId, stopId }`, not bare
`stopId`:

```ts
// apps/web/src/lib/stores/favorites.svelte.ts
type FavoriteRef = { feedId: string; stopId: string };
type FavoritesByFeed = Record<string /* feedId */, string[] /* stopIds */>;
```

Switching feeds doesn't lose favorites; the UI just filters to the
active feed's slice. Evicting a feed (§9.8.4) *does* drop that
feed's favorites — they'd be unresolvable without the SQLite anyway.

#### 9.8.6 Pin for offline

Power-user gesture in the feed picker: long-press / context menu →
**"Keep available offline"**. Sets `feeds-meta.json[feedId].pinned =
true`. Pinned feeds:

- Are exempt from LRU eviction (§9.8.4).
- Pre-fetch their `.sqlite3.gz` on next freshness update without
  requiring an interactive prompt (still surfaces progress in
  StatusBar, just doesn't gate on user confirmation).

Use case: traveler downloads Bucharest before a trip, knows it'll
work without network on arrival.

#### 9.8.7 Offline behaviour

Decision matrix when `navigator.onLine === false`:

| State | UX |
|---|---|
| Active feed on-device, GPS inside its bbox | Full app works; live dot turns gray (RT unavailable); ghosts everywhere |
| Active feed on-device, GPS outside bbox | App works for the on-device feed; "You're outside <Name> — pick another city" banner; picker shows only feeds with `last_used_at != null` (i.e. previously cached) |
| Active feed not on-device | "Offline — <Name> isn't downloaded yet. Connect to download (~4 MB) or pick a downloaded city." StatusBar error severity |
| No feed ever picked, no GPS, no cached registry | "Offline — connect once to download a city" |

The PWA SW (already in place) handles app-shell caching; this section
covers only the GTFS-blob cache, which is OPFS not Cache Storage.

#### 9.8.8 Worker API additions

Extend `GtfsRepo` with:

```ts
interface GtfsRepo {
  // …existing methods…
  setFeed(feedId: string): Promise<void>;       // existing in §9.1
  listCachedFeeds(): Promise<CachedFeedMeta[]>; // for picker UI
  pinFeed(feedId: string, pinned: boolean): Promise<void>;
  evictFeed(feedId: string): Promise<void>;     // user-initiated
  checkRegistryFreshness(): Promise<RegistryDiff>;
}
```

The picker UI consumes `listCachedFeeds()` to decorate rows with
"📦 cached" / "📌 pinned" / "⬇ ~4 MB" labels and read offline-state.


## 10. Evolution roadmap

This refactor is large enough that it can't ship in a single weekend
without risking the v1 app. The roadmap below splits it into six
milestones, each independently shippable, each leaving the system in
a coherent state.

**Branching strategy**:
- `main` of `neary-gtfs` — keeps producing `releases` artifacts until
  M2 cutover. Don't touch v1 consumers.
- `refactor/feeds-from-transitous` — landing zone for M1; merged to
  `main` once M2 publishes cleanly.
- `releases` (v1) — **frozen** after M2 cutover, kept alive a few
  weeks so v1 PWAs in the wild don't break overnight, then deleted.
- `binaries` (v2) — force-push or appended commits per daily build
  (start with appended, switch later if too large).

### M0 — Today (baseline)

- Single agency. Cluj only. v1 app reads `releases/data/agency.json`
  and per-agency JSON files. v2 app reads
  `apps/web/static/dev-data/agency-2.sqlite3.gz` produced by
  `apps/web/scripts/build-sqlite`.
- `src/sync-tranzy.js` still pulls Tranzy daily.

**Done.** Reference point.

### M1 — Repo scaffold (no behaviour change for users)

Scope (in `refactor/feeds-from-transitous` branch of neary-gtfs):
- New layout per §5.
- Add `public-transport/transitous` as a git submodule under
  `transitous-feeds/`.
- Port `src/build.js` (ctpcj.ro scraper) → `feeds/ctp-cluj/build.js`
  unchanged in behaviour.
- Add `src/pipeline/{resolve-feeds,fetch-gtfs,make-sqlite,
  derive-bbox,make-app-registry,build-all}.js`. Skeletons.
- `countries.json = ["ro"]`.
- New daily workflow `.github/workflows/daily.yml` runs against the
  `refactor/` branch only; output goes to a `binaries-staging`
  branch (NOT `binaries` yet).

Success criteria:
- `binaries-staging` is force-pushed nightly with a valid
  `feeds.json` listing exactly one feed (ctp-cluj).
- `feeds.json` validates against a written JSON Schema (committed to
  the repo at `schemas/feeds.schema.json`) in CI.
- ctp-cluj GTFS .zip passes MobilityData's canonical validator with
  zero `ERROR`s.
- `releases` branch and v1 still work, untouched.

Risks: submodule pinning. Pin Transitous to a known-good commit;
bump explicitly, never tracking `HEAD`.

### M2 — First multi-feed publish + v2 app cutover

Scope (neary-gtfs):
- Add Bucuresti-Ilfov as the second feed (sourced from Transitous's
  `ro.json` → mdb-2098 mirror). Pure smoke test — proves the
  "non-Cluj" code path.
- Promote `binaries-staging` → `binaries` (rename the branch, keep
  history).
- Merge `refactor/feeds-from-transitous` → `main`.

Scope (neary app, this repo, single commit on a child branch):
- §9.1–9.4 changes: `agencies.ts` → `feeds.ts`, `agencyId` → `feedId`,
  hardcoded `AGENCIES_WITH_SQLITE = new Set([2])` gone, Settings
  picker uses `feeds.json`.
- `seedUrlFor` reads `feed.files.sqlite_gz` against the `binaries`
  raw URL — no more `/dev-data/` special case.
- Bare-minimum §9.8 lifecycle: cold-switch download, no eviction,
  no pinning yet (just enough to switch between Cluj and Bucharest
  for QA).

Success criteria:
- The v2 app in dev can switch between Cluj and Bucharest, with the
  Stations list re-populating from each city's SQLite.
- v1 app continues working from `releases` (nothing on its critical
  path changed).
- `apps/web/static/dev-data/` is deleted from the repo;
  `apps/web/scripts/build-sqlite` is deleted (its job has moved to
  neary-gtfs's `make-sqlite.js`).

Risks: GitHub raw URLs throttle aggressively if many PWA installs
hit them concurrently on launch. Mitigation: jsDelivr in front of
the raw URL (`https://cdn.jsdelivr.net/gh/ciotlosm/neary-gtfs@binaries/outputs/feeds.json`).

### M3 — RO coverage complete

Scope (neary-gtfs):
- Resolve every entry in `transitous-feeds/feeds/ro.json` (currently
  ~10 agencies including SCTP Iași, RATC Constanța, RATT Timișoara,
  TUS Sibiu, CFR rail, etc.). Build SQLite for each.
- `feeds.json` lists ~10 feeds with full bboxes.

Scope (neary app):
- Full §9.8 lifecycle: LRU eviction (§9.8.4), freshness Tier A
  check (§9.8.3), feed-scoped favorites (§9.8.5).
- `locationStore.pickFeed()` (§9.5) auto-picks by GPS bbox
  containment. Manual override always available.
- Picker UI shows ⬇ size + 📦 cached state per row (§9.8.8).

Success criteria:
- New user opens the app anywhere in Romania → correct city
  auto-picked or "no feed for your area" surfaced cleanly.
- A user who visits 5 cities ends up with all 5 in OPFS or LRU
  evicts the oldest. Total under 100 MB.

Risks: bbox overlaps (rail + city). Tie-break rule from §11: pick
smallest bbox. Document in picker copy.

### M4 — Upstream Transitous PR

Scope (out of neary-gtfs entirely):
- Open PR against `public-transport/transitous` adding
  `Cluj-Napoca-CTP` to `ro.json` per §8.
- Coordinate with Transitous maintainers on whether mdb-2121 stays
  as a fallback or gets `skip`-ed.

Success criteria:
- PR accepted and merged.
- Next Transitous build on `main` includes our feed; the
  ~100 downstream consumers (KDE Itinerary, GNOME Maps, Bimba, etc.)
  start serving up-to-date Cluj data without us doing anything.

Risks: validator strictness on the Transitous side surfaces issues
our local validator missed. Buffer a week here for back-and-forth.

### M5 — Geographic growth

Scope (neary-gtfs only — no app changes):
- Open `countries.json` from `["ro"]` to additional ISO codes as
  Romanian users actually travel and request them. First likely
  additions: `["hu", "de", "at", "it"]`.
- Add ops doc at `docs/adding-a-country.md` (one PR edit to
  `countries.json` + verify Transitous's `<iso>.json` is usable +
  manual feed-by-feed validator pass).

Success criteria:
- Adding a new country is a 10-line PR.
- App users opening the app abroad get a sensible feed or the
  documented "no feed for your area" UI.

Risks: storage growth. The §9.8.4 100 MB cap is the safety valve;
we never need to gate country growth on app-side work.

### Explicitly deferred (out of scope for M0–M5)

| Deferred | Why |
|---|---|
| Per-agency static map tiles | Adds a separate hosting story; not blocking schedule UX |
| Stop-shape simplification (Douglas-Peucker etc.) | Premature; the SQLite blob handles full geometry fine |
| Versioned `feeds.json` (`/v1/feeds.json` style) | One file, force-pushed; semver only if we break the schema |
| Multi-region SQLite sharding (e.g. per-route blobs) | OPFS easily handles 20 MB per feed; sharding is a problem we don't have |
| Replacing the daily cron with webhook-driven builds | Cron is fine; ctpcj.ro doesn't expose change notifications anyway |


## 11. Open items

- **Bbox derivation**: `derive-bbox.js` reads `stops.txt` and takes min/max
  of `stop_lat`/`stop_lon`. Edge case: feeds containing trips that leave
  the urban area (e.g. an intercity route) inflate the bbox. Acceptable
  trade — auto-pick is opinion-free, user can always pick manually.
- **Auto-pick when GPS is inside multiple bboxes** (e.g. rail feed +
  city feed overlap): pick the smallest bbox (= more specific). Document
  in the app picker as "Most-specific feed for this area".
- **Initial countries scope**: `["ro"]`. Adding `["hu", "de", ...]` later
  is one-line edits to `countries.json` plus disk space for more SQLite
  blobs. We grow this once neary v2 has Romanian users actually trying
  to use it abroad.
- **Force-push vs append** to `binaries`: I'd start with appending
  commits (clean diff history per build); switch to force-push later if
  the branch gets too large.

---

## Appendix: example flow for the v2 app's first user

1. User installs the PWA, lands on `/`.
2. App fetches `https://raw.githubusercontent.com/ciotlosm/neary-gtfs/binaries/outputs/feeds.json`.
3. App requests GPS (the location dot turns yellow then green).
4. App's `pickFeed()` finds `ctp-cluj`'s bbox contains the user → sets
   `userPrefs.feedId = "ctp-cluj"` automatically.
5. Worker downloads `feeds/ctp-cluj.sqlite3.gz` (~4 MB) into OPFS.
   StatusBar shows progress.
6. Stations view renders proximity-based station list using the SQLite.
7. Live worker spins up against `cluj-rt-feed.gtfs.ro` via the edge
   proxy. Vehicle dots turn green; ghosts appear for trips that don't
   yet have a live vehicle.

No setup wizard. No required API key. No agency dropdown. The user just
opens the app. A Tranzy API key can be pasted later in Advanced settings
to unlock the multi-source confidence boost (see §4) — entirely optional.
