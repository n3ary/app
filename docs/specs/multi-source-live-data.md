# Multi-source live data

Goal: let neary consume a **clean, already-merged** GTFS-RT stream
per feed. The producer is responsible for merging across multiple
upstream sources — the consumer treats each
`realtime.vehicle_positions` URL as a single, deduped
`FeedMessage` source.

## Scope note

Per [gtfs-rt-contract.md](gtfs-rt-contract.md), the cross-source
**merge step** lives in the producer's RT adapter, not in this
consumer. This doc describes what the consumer expects from the
producer: a single, deduplicated `FeedMessage` per fetch. The
producer-side spec (the merge semantics, source priority, etc.) lives
in the producer's repo.

## Why this spec exists

The contract between the consumer and the producer on
multi-source semantics: when the producer publishes one URL that
already merges N upstreams, the consumer just consumes that URL.
This doc captures what the consumer assumes and what happens on
failure.

## What we want

A feed config can declare multiple `realtime.vehicle_positions` URLs.
The worker fetches each in parallel, decodes them as **plain GTFS-RT
protobuf**, merges the observations, and feeds the merged set to
`reconcileWithLive`. No source is special: each is just bytes that
parse as `FeedMessage`.

For agencies that don't publish GTFS-RT natively (e.g. operators
exposing a custom JSON API), a separate adapter service converts
that API to GTFS-RT and exposes a URL. That adapter is **out of
scope for this repo** — it can live anywhere (a Worker / Lambda /
Cloud Function on any host). From neary's POV it's just another
GTFS-RT URL in `realtime.vehicle_positions[]`.

## What we explicitly will NOT do

- **No API keys in the client.** If a source needs a key, the adapter
  service holds it; neary fetches a plain unauthenticated URL.
- **No provider-specific clients in neary.** No per-operator SDKs,
  no per-operator JSON shape, no per-operator auth. The worker only
  speaks GTFS-RT protobuf.
- **No client-side per-source reconciliation.** Merging across sources
  for the same physical vehicle is the reconciler's job (already in
  [src/lib/domain/reconcile.ts](../../src/lib/domain/reconcile.ts)),
  not the fetch layer.

## Config shape

`feeds.json` per-feed `realtime.vehicle_positions` is a **single
URL** that points at the producer's already-merged, clean
`FeedMessage` source. The producer owns the list of upstream URLs;
the consumer doesn't see them.

```jsonc
{
  "realtime": {
    "vehicle_positions": "https://gtfs.n3ary.com/rt/cluj-napoca/vehiclePositions",
    "trip_updates":      "…",
    "service_alerts":    "…"
  }
}
```

The URL is the producer's adapter endpoint. Behind that endpoint, the
producer may have merged N upstream sources and applied per-feed
quirks before serving the response.

## Consumer behaviour

Per tick (every 15 s today, see
[live-data-pipeline.md](live-data-pipeline.md)):

1. **Fetch the single URL.** Standard `fetch()` with the existing
   timeout budget. A 5xx, malformed protobuf, or timeout is logged
   and the tick proceeds without RT observations for this cycle.
2. **Decode as GTFS-RT.** Standard `FeedMessage` decode via
   `gtfs-realtime-bindings`.
3. **Pass observations to the reconciler.** Per
   [live-data-pipeline.md](live-data-pipeline.md#reconciler-algorithm):
   matches live observations to scheduled trips by
   `(routeId, directionId, startTime)` with adaptive tolerance.

## Failure modes

| Failure | Behaviour |
|---|---|
| The URL returns 5xx / times out | Tick proceeds with empty observations. UI shows schedule-only data for this tick. |
| The URL returns malformed protobuf | Same as 5xx — logged, tick proceeds empty. |
| The URL returns data where `direction_id` / `start_time` are wrong or missing | The reconciler can't match the observation to a scheduled trip; the vehicle shows up as `kind: 'gps-only'`. Per [gtfs-rt-contract.md](gtfs-rt-contract.md), this is a producer-side fix, not a consumer-side workaround. |

No backoff state, no retry logic, no per-source health flag — the
producer's adapter handles its own retry / backoff against upstream
feeds.

## Out of scope

- The producer-side adapter implementation. Live in
  [`neary-gtfs`](https://github.com/ciotlosm/neary-gtfs).
- Multi-URL `realtime.vehicle_positions` in the consumer's
  `feeds.json` schema. The list of upstream URLs is producer-side
  config.
- Per-source health UI / "source X is down" indicators.
- Source attribution badges in the UI.
- Trip updates / service alerts multi-source. Single-URL stays for
  those until there's a real consumer.

## References

- [gtfs-rt-contract.md](gtfs-rt-contract.md) — producer/consumer split
  on RT cleanup
- [Live data pipeline](live-data-pipeline.md) — reconciler algorithm
- [feeds.json](feeds-json.md) — manifest contract
