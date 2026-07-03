# Live RT sources per feed

Each feed has **one** `realtime.vehicle_positions` URL in `feeds.json`. That URL points at a single, clean, deduplicated `FeedMessage` source produced by the producer's RT adapter.

## Why one URL

The consumer does not support multi-URL fan-out. The contract between
the two repos is: the consumer fetches one URL per feed; the producer
takes responsibility for any merging or dedup across multiple upstream
sources in its own adapter. This keeps the consumer feed-agnostic and
simple. See [gtfs-rt-contract.md](gtfs-rt-contract.md) for the full
producer/consumer split.

## What the consumer does

Per tick (every 15 s):

1. Fetch the single URL in `realtime.vehicle_positions`.
2. Decode as GTFS-RT protobuf via `gtfs-realtime-bindings`.
3. Pass observations to `reconcileWithLive` (see [live-data-pipeline.md](live-data-pipeline.md) for the reconciler algorithm).

## Failure modes

| Failure | Behaviour |
|---|---|
| The URL returns 5xx / times out | Tick proceeds with empty observations. UI shows schedule-only data for this tick. |
| The URL returns malformed protobuf | Same as 5xx — logged, tick proceeds empty. |
| The URL returns data where `direction_id` / `start_time` are wrong or missing | The reconciler can't match the observation to a scheduled trip; the vehicle shows up as `kind: 'gps-only'`. This is a producer-side fix per [gtfs-rt-contract.md](gtfs-rt-contract.md), not a consumer-side workaround. |

No backoff state, no retry logic, no per-source health flag in the
consumer. The producer's adapter handles its own retry / backoff
against upstream feeds.

## Out of scope

- Multi-URL `realtime.vehicle_positions` in `feeds.json` — not planned.
- Per-source health UI / "source X is down" indicators.
- Source attribution badges in the UI.
- Trip updates / service alerts multi-source. Single-URL stays for those until there's a real consumer.

## References

- [gtfs-rt-contract.md](gtfs-rt-contract.md) — producer / consumer split on RT cleanup
- [live-data-pipeline.md](live-data-pipeline.md) — reconciler algorithm
- [feeds-json.md](feeds-json.md) — manifest contract