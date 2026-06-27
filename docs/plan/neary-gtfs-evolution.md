# neary-gtfs evolution

Roadmap for the separate [neary-gtfs](https://github.com/ciotlosm/neary-gtfs)
data pipeline repo. Tracked here because every milestone has an
app-side consumer change.

## M0–M2 (history)

- **M0** — baseline. Single agency (Cluj). v1 app read per-agency JSON. *Historical.*
- **M1** — repo scaffold per the [neary-gtfs README](https://github.com/ciotlosm/neary-gtfs). *Done.*
- **M2** — first multi-feed publish. Cluj (enhanced) + Bucharest (Transitous mirror) live on `binaries` branch. *Done on the pipeline side.*

Currently shipped on the app side: cold-switch download, no eviction.

## M3 — RO coverage complete

Scope (neary-gtfs):
- Resolve every entry in Transitous `ro.json` (~10 agencies including SCTP
  Iași, RATC Constanța, RATT Timișoara, TUS Sibiu, CFR rail, etc.).
- Build SQLite for each. `feeds.json` lists ~10 feeds.

Scope (app):
- Full lifecycle per [../specs/multi-feed-data-lifecycle.md](../specs/multi-feed-data-lifecycle.md): LRU eviction, Tier A registry ETag check, feed-scoped favorites.
- `locationStore.pickFeed()` auto-picks by GPS bbox containment. Manual override always available.
- Picker UI shows download size + cached state per row.

Success criteria:
- New user anywhere in Romania → correct city auto-picked or "no feed for your area" surfaced cleanly.
- A user who visits 5 cities ends up with 5 in OPFS or LRU evicts the oldest. Under 100 MB.

Risk: bbox overlaps (rail + city). Tie-break: pick smallest bbox (most specific).

## M4 — Upstream Transitous PR

Out of neary-gtfs entirely:
- Open PR against `public-transport/transitous` adding `Cluj-Napoca-CTP` to `ro.json`.
- Coordinate on whether `mdb-2121` stays as fallback or gets `skip`-ed.

Success criteria:
- PR accepted and merged.
- ~100 downstream Transitous consumers (KDE Itinerary, GNOME Maps, etc.) start serving fresh Cluj data.

Risk: validator strictness on the Transitous side surfaces issues our local validator missed. Buffer a week.

## M5 — Geographic growth

Scope (neary-gtfs only):
- Open `countries.json` from `["ro"]` to additional ISO codes as users actually request them. Likely: `["hu", "de", "at", "it"]`.
- Add `docs/adding-a-country.md` in neary-gtfs (one-PR change to `countries.json` + verify Transitous's `<iso>.json` + manual validator pass).

Success criteria:
- Adding a new country is a 10-line PR.
- Users opening the app abroad get a sensible feed or the documented "no feed for your area" UI.

Risk: storage growth. The ~100 MB cap is the safety valve; country
growth never needs to gate on app-side work.

## Deferred (out of scope for M0–M5)

| Deferred | Why |
|---|---|
| Per-agency static map tiles | Separate hosting story; not blocking schedule UX |
| Stop-shape simplification (Douglas-Peucker) | SQLite handles full geometry fine |
| Versioned `feeds.json` (`/v1/...`) | One file, force-pushed; semver only if schema breaks |
| Multi-region SQLite sharding | OPFS handles 20 MB easily; sharding is a problem we don't have |
| Webhook-driven builds | Cron is fine; ctpcj.ro doesn't expose change notifications |

## Open questions

- **Bbox edge case**: intercity routes inflate the bbox. Acceptable; auto-pick is opinion-free, user can manually override.
- **Force-push vs append to `binaries`**: start appending (clean diff per build); switch to force-push if branch grows too large.
