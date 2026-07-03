# Producer monorepo plan (neary-gtfs)

Future work — architectural sketch for consolidating the GTFS producer
(static + live RT) into a single monorepo. Not yet implemented. Affects
the **producer** repo (`ciotlosm/neary-gtfs`); this consumer repo
(`ciotlosm/neary`) is the read-only beneficiary.

## Why

The current producer (separate repo `neary-gtfs`) handles one job:
build the offline `sqlite3.gz` blob for each feed and publish to R2.
The consumer in `neary` reads those blobs.

For live RT we currently proxy upstream feeds through a Cloudflare Pages
Function with no transformation (just passthrough). That's fine for
GTFS-RT-spec-clean feeds but breaks for feeds whose operators don't
publish canonical fields. The Cluj case (`direction_id=0` always,
`start_time=""` always) is the worked example — it needs per-feed
recovery logic, but the feed-agnostic standard
(`docs/standards/feed-agnostic.md`) forbids that logic from living in
the consumer.

So the work splits naturally into:

| job                       | where it should live                |
|---------------------------|-------------------------------------|
| Build offline GTFS blobs  | producer (neary-gtfs), cron          |
| Clean / merge RT feeds    | producer (neary-gtfs), always-on    |
| Per-feed quirks           | producer (neary-gtfs), one file/feed|
| Consume clean data        | consumer (neary, this repo)          |

The producer becomes the single owner of "what does clean data look like
for this feed"; the consumer stops carrying feed-specific facts.

## Static vs live RT have different shapes

|                       | static pipeline              | live RT adapter                |
|-----------------------|------------------------------|--------------------------------|
| Compute pattern       | burst (build time), dormant  | constant (always-on)           |
| Output                | immutable content-addressed blobs (`<id>-<hash>.sqlite3.gz`) | per-feed clean protobuf (`/rt/<id>/<endpoint>.pb`) |
| Schedule              | daily cron                   | continuous (poll every 15–30 s)|
| Cost driver           | R2 storage + build minutes   | compute uptime + R2 egress     |
| Run-time infra        | GitHub Actions (free cron)   | Hetzner CX22 (€4.50/month, fixed)|
| Failure isolation     | per-feed cached client-side  | schedule-only fallback in UI   |

The shapes differ enough that combining them under a single deploy
target wastes the always-on infra on the static build's idle hours, or
forces the static build to share an always-on VM it doesn't need.
**They get separate deploy targets but share one source tree.**

## Monorepo vs multi-repo

Three options, in order of preference:

1. **Monorepo with two deploy targets** — `packages/gtfs-static` and
   `packages/gtfs-rt` under one repo. Shared library lives in
   `packages/shared`. Two CI workflows (one for each). Single repo to
   read when adding a new feed.

2. **Two repos + one shared lib** — `neary-gtfs-shared` (library) +
   `neary-gtfs-static` (cron) + `neary-gtfs-rt` (always-on). Three
   repos to read.

3. **Two repos, copy-pasted shared code** — cheap now, drift surface
   later.

**Recommendation: option 1.** Single source of truth, atomic changes,
one CI. Three repos is overkill for one maintainer; copy-paste is a
debt trap. The split into packages is real but lives at the package
boundary, not the repo boundary.

## Proposed folder structure

```
neary-gtfs/                                # monorepo root
├── .github/
│   ├── workflows/
│   │   ├── static-build.yml              # daily cron — runs gtfs-static
│   │   ├── rt-adapter.yml                # build + deploy adapter to Hetzner
│   │   └── shared-checks.yml             # PR checks (lint, test, schema validate)
│   └── dependabot.yml
├── packages/
│   ├── shared/                           # library — used by both pipelines
│   │   ├── pyproject.toml
│   │   ├── src/neary_gtfs_shared/
│   │   │   ├── __init__.py
│   │   │   ├── gtfs/
│   │   │   │   ├── csv_parser.py         # GTFS CSV → typed records
│   │   │   │   └── sqlite_writer.py     # typed records → sqlite3 blob
│   │   │   ├── rt/
│   │   │   │   ├── proto_decoder.py     # GTFS-RT protobuf decode
│   │   │   │   └── proto_encoder.py     # clean protobuf encode
│   │   │   ├── feeds_json/
│   │   │   │   ├── schema.py            # feeds.json schema + validation
│   │   │   │   └── emitter.py           # write feeds.json manifest
│   │   │   └── r2/
│   │   │       └── client.py            # R2 put/get wrapper
│   │   └── tests/
│   ├── gtfs-static/                      # offline pipeline (cron)
│   │   ├── pyproject.toml
│   │   ├── src/neary_gtfs_static/
│   │   │   ├── __init__.py
│   │   │   ├── pipeline.py              # main entry: fetch upstream → build → emit
│   │   │   └── feed_registry.py         # which feeds to build + from where
│   │   └── tests/
│   │       └── test_pipeline.py
│   └── gtfs-rt/                          # live RT adapter (always-on)
│       ├── pyproject.toml
│       ├── src/neary_gtfs_rt/
│       │   ├── __init__.py
│       │   ├── adapter.py                # HTTP server: serves /rt/<feed>/<endpoint>
│       │   ├── poller.py                 # upstream fetch on interval
│       │   ├── merge.py                  # multi-source merge + dedupe
│       │   ├── quirks/                   # PER-FEED CLEANUP LIVES HERE
│       │   │   ├── __init__.py
│       │   │   ├── base.py               # shared cleanup helpers
│       │   │   ├── cluj.py               # Cluj: fix direction_id + start_time
│       │   │   ├── swiss.py              # Swiss SBB (auth proxy / 404 normalisation)
│       │   │   └── generic.py            # field-by-field patcher from config
│       │   └── cache.py                  # in-memory + R2 read-through cache
│       ├── Dockerfile
│       └── tests/
│           ├── test_cluj_quirks.py
│           └── test_adapter.py
├── config/
│   ├── feeds.example.yaml                # per-feed config (upstream URLs,
│   │                                   # quirk modules to apply, poll cadence)
│   └── feeds.local.yaml.example
├── ops/
│   ├── terraform/                         # optional — Hetzner + R2 + DNS
│   │   └── hcloud/
│   │       ├── main.tf
│   │       └── variables.tf
│   └── systemd/
│       └── neary-gtfs-rt.service         # systemd unit for the adapter
├── docs/
│   ├── README.md                          # monorepo overview
│   ├── architecture.md                    # how static + rt interact (data flow)
│   ├── quirks-guide.md                    # how to add a new feed's quirks
│   └── ops/
│       ├── deployment.md                  # how to deploy to Hetzner + CF
│       └── runbook.md                     # common incidents + fixes
├── .gitignore
├── .pre-commit-config.yaml
├── pyproject.toml                         # workspace metadata (uv / pdm / poetry)
├── uv.lock                                # or poetry.lock / pdm.lock
├── README.md
└── LICENSE
```

### Why this shape

- **`packages/shared`** — every per-feed detail (e.g. the `cluj.py`
  quirks module) sits in `gtfs-rt/quirks/`, not in the consumer. The
  consumer never branches on `feed.id` again. `packages/shared` exists
  so static + rt can share the protobuf decode/encode and the
  `feeds.json` schema/emit logic without duplication.
- **Two CI workflows, one source tree** — `static-build.yml` is a
  GitHub Actions cron that runs `packages/gtfs-static` and pushes
  results to R2. `rt-adapter.yml` builds the Docker image and deploys
  it to Hetzner. Both share `packages/shared`; changes to one workflow
  can ship through the other without coordination.
- **No tests for `gtfs-static` beyond the pipeline glue** — the static
  build is mostly orchestration. Heavy lifting (CSV parse, sqlite
  write) lives in `packages/shared` and gets tested there. The static
  pipeline itself gets one or two smoke tests against a fixture feed.
- **`ops/`** — terraform for Hetzner provisioning lives next to the
  service it provisions; systemd unit file lives with the adapter it
  runs. Keeps ops next to the code that owns it.

### Why Python

- Better ecosystem for GTFS work (`gtfs-kit`, `partridge`, pandas,
  protobuf tooling).
- Static pipeline is mostly I/O + transforms — fits pandas / polars
  cleanly.
- Adapter server uses `fastapi` + `uvicorn` (or just `aiohttp`); both
  are first-class for protobuf streaming.
- This consumer repo stays in JS; producer can be Python without any
  cross-repo coupling (the contract is the wire format).

### Why not Node

- Would work but doesn't pull its weight here. The adapter's "merge
  multiple RT sources" step is way easier with pandas-style dataframes
  than JS arrays.
- Static pipeline is also easier with pandas (multi-feed CSVs in one
  pass).

## Deploy shape

```
                ┌─────────────────────────────────────────┐
                │ Hetzner CX22 (€4.50/mo, fixed)         │
                │                                         │
                │   packages/gtfs-rt                      │
                │   ┌──────────────┐                      │
                │   │ adapter.py   │                      │
                │   │ (uvicorn)    │◀──── polls upstream  │
                │   └──────┬───────┘     every 15–30 s    │
                │          │                              │
                │          ▼                              │
                │   ┌──────────────┐                      │
                │   │ cache.py     │                      │
                │   │ (R2 cache    │                      │
                │   │  read-through│                      │
                │   └──────────────┘                      │
                └────────────┬────────────────────────────┘
                             │ cache miss only
                             ▼
                ┌─────────────────────────────────────────┐
                │ Cloudflare (free CDN egress)            │
                │                                         │
                │   Worker on edge POP                    │
                │     ├─ cache hit   → serve (~free)       │
                │     └─ cache miss  → fetch from Hetzner │
                │                          (cold path)    │
                └────────────┬────────────────────────────┘
                             │
                             ▼
                       User (every 15 s)
```

- **Hetzner VM** runs the adapter as a systemd-managed Docker
  container. Polls upstream every 30 s, keeps the clean protobuf in
  memory, writes through to R2 on success. Per-feed quirks applied
  before encoding.
- **CF Worker** is a thin cache-and-passthrough. Receives request,
  checks CF edge cache (TTL set by adapter's response header),
  on miss fetches from Hetzner. Logs the cold-path latency.
- **Static blobs** stay on R2 + CF Pages CDN exactly as today; no
  change needed.

## R2 layout (post-monorepo)

```
gtfs.n3ary.com/
├── feeds.json                            # manifest (one entry per feed)
├── <id>-<hash>.sqlite3.gz                # static blob (content-addressed)
└── rt/
    ├── <id>/
    │   ├── vehiclePositions.pb           # cleaned RT, cached
    │   ├── tripUpdates.pb
    │   └── serviceAlerts.pb
    └── ...
```

The consumer (`neary`) doesn't change. `feeds.json` still has the same
schema; the `realtime.*` URLs now point at the adapter's clean feed
(rather than upstream directly).

## Migration plan

Order matters. Each step is independently shippable.

1. **Stand up the monorepo skeleton** on a new repo (`neary-gtfs` →
   reorganised as monorepo, or new repo with the same name and old
   `neary-gtfs-static` content migrated). No behaviour change yet;
   the static pipeline just moves to its new home.
2. **Extract `packages/shared`** — pull the existing CSV-parse and
   sqlite-write code out of the current pipeline into the shared lib.
   Static pipeline imports from it. CI green; static pipeline still
   produces the same blobs.
3. **Stand up `packages/gtfs-rt`** with the Cluj quirk as the pilot.
   Deploy to Hetzner. Configure the CF Pages Function (or Worker)
   that already exists to proxy the request — point it at the
   Hetzner origin. Verify clean feed is published and the consumer
   picks up correct `direction_id` and `start_time` automatically.
4. **Hold PR #159** in the consumer until step 3 ships and the clean
   feed has been live for a week without orphan-regression. Then
   merge; `feedQuirks.ts` deletion becomes the consumer's last
   feed-agnostic action.
5. **Add per-feed quirk files** as new feeds need them. Each quirk
   is its own small module (`< 50 lines`), added under
   `packages/gtfs-rt/src/neary_gtfs_rt/quirks/`. Document the pattern
   in `docs/quirks-guide.md`.
6. **Multi-source merging** — when a feed needs combining two
   upstream sources, extend `merge.py` + add per-source config. The
   consumer stays identical.

## Open questions

- **Language**: I'm proposing Python. If you'd rather keep this repo's
  tooling (Node/TS) or use Go (Hetzner is famously Go-friendly),
  that's a bigger conversation — say the word.
- **Hetzner vs alternatives**: this plan assumes Hetzner for the
  always-on VM. Alternatives if Hetzner pricing changes or you want
  more edge presence: Deno Deploy ($/req), Fly.io (similar shape to
  Hetzner + edge), Render (managed VMs). The architecture is the
  same; only the deploy target changes.
- **R2 vs KV for the adapter cache**: R2 is cheaper for binary blobs;
  KV is cheaper for small frequently-read JSON. The adapter writes
  protobuf → R2 wins.
- **Polling cadence**: 30 s is a guess. With the CF cache in front
  the user sees 15 s freshness regardless. Adapter polls upstream at
  30 s for cost / upstream respect.
- **Auth-required upstreams** (e.g. Swiss SBB): the producer's adapter
  needs to hold credentials. Standard secrets-via-env-vars on the
  Hetzner VM. The consumer never sees them.

## What this repo (the consumer) needs to do

Likely **nothing** once the adapter is shipping clean feeds. The
existing reconciler handles correctly-populated `direction_id` /
`start_time` without any quirks module.

The only consumer-side change left after #159 is documentation: add a
note to `docs/specs/` saying "the RT feed is expected to be
pre-cleaned by the producer; the consumer treats it as
GTFS-RT-spec-compliant and does not branch on `feed.id` for RT
behavior."

## Status

Plan only — no implementation yet. Tracked under issue: TBD.