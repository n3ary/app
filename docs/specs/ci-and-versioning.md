# CI and versioning

How PR validation, version bumps, and production deploys work — and the
reasoning that isn't obvious from the YAML.

## Workflows

- [.github/workflows/pr-check.yml](../../.github/workflows/pr-check.yml) — runs on PRs targeting `main`.
- [.github/workflows/deploy-pwa.yml](../../.github/workflows/deploy-pwa.yml) — runs on push to `main` (release bot only, see [Deploy guard](#deploy-guard)).

## PR validation flow

PR validation has two jobs in `pr-check.yml`:

1. **`pr-check`** — a shared workflow from `n3ary/actions` that runs
   the org-wide checks (ASCII-only commit messages, `n3ary/standards`
   drift). The shared action is the source of truth for the
   ASCII-only rule and the standards-sync contract.
2. **`validate`** — the local job. Runs the repo-specific check,
   test, and build. Dependabot PRs skip this job: GitHub blocks the
   `dependabot[bot]` actor from repo secrets, so the `@n3ary`
   GH Packages auth step would fail. Dependabot only bumps version
   refs in this repo, so the heavy validation adds no signal here.
   The shared checks (ASCII, standards drift) still run.

```
Open PR (target=main)
  ├─ shared: n3ary/actions pr-check.yml
  │    ├─ ASCII-only commit messages
  │    └─ n3ary/standards drift check
  └─ local: validate
       ├─ checkout PR branch
       ├─ setup-pnpm-gh-packages-auth  (n3ary/actions shared action)
       ├─ pnpm install --no-frozen-lockfile
       ├─ pnpm run check  (svelte-kit sync && svelte-check)
       ├─ pnpm test
       └─ pnpm run build
```

`--no-frozen-lockfile` instead of `--frozen-lockfile`: pnpm 11's
lockfile supply-chain re-verification can fail on stale entries from
registry republishes. A clean re-resolve keeps the install robust.
The lockfile is still authoritative for production (`--frozen-lockfile`
in the deploy workflow) — only PR validation relaxes it.

## Version bumps

Version bumps are produced by `n3ary-release-bot` (a separate GitHub
App), NOT by the PR validation workflow. When a non-workflow PR
merges to main, the release bot opens a `release/calver-*` PR that
bumps `package.json#version` and auto-merges it. The PR validation
flow has no auto-bump step.

The version scheme is `YY.M.D-N` (calver: year.month.day + patch
counter), not semver. The project has no API consumers, so minor /
major distinctions carry no meaning. Calver is human-readable and
self-dating, and pairs naturally with the release-bot model (every
day gets its own version line).

## Deploy flow

```
Push to main
  └─ deploy-pwa.yml
       ├─ checkout
       ├─ setup node v24 (setup-node@v6.4.0)
       ├─ setup pnpm (auto-detected from packageManager field)
       ├─ pnpm install --frozen-lockfile  (NPM_TOKEN for @n3ary GH Packages scope)
       ├─ pnpm run build
       ├─ cloudflare/wrangler-action@v4 → wrangler pages deploy build --project-name=neary --branch=main
       ├─ Cloudflare API: purge zone cache for /_app/immutable/* + service-worker.js
       └─ Smoke test: cf-cache-status == MISS for a hashed worker file
```

Concurrency: `production-deploy` with `cancel-in-progress` so a fast-second
merge doesn't run two deploys.

## Deploy guard

The deploy job runs only when the actor is `n3ary-release-bot[bot]`
(PR #283). The bot opens `release/calver-*` PRs against main; when
GitHub auto-merges them, the resulting `push` event has that actor.
That push IS the official deploy event — every deploy is tied to a
version bump, so the deploy log matches the version history.

Human PR pushes and workflow-only changes (docs, standards sync, CI
config) skip the deploy because their build artefact is either a
duplicate of an imminent version-bump deploy, or not user-facing.
Several non-deploy PRs can merge in a row without piling up
redundant Cloudflare Pages rebuilds.

Hotfix escape hatch: `workflow_dispatch` (unchanged) — manual trigger
from the GH UI or `gh workflow run` for a critical code fix that
doesn't touch the version.

## Post-deploy cache purge — why it exists

The static `static/_headers` file is read at deploy time. The headers
(including `Content-Security-Policy`) get baked into the response and
**cached at the Cloudflare edge** on first request. Any subsequent change
to `_headers` does NOT reach files that are already in the edge cache --
they keep serving the OLD response headers (with the OLD CSP) until the
cache TTL expires (`max-age=14400` = 4 hours for hashed `/_app/immutable/*`).

The concrete failure mode (observed on 2026-07-11, post PR #291):

1. PR #291 added `gtfs-rt.n3ary.com` to `connect-src` in `static/_headers`.
2. The deploy shipped new files. Documents (`/`) and chunks whose hashes
   changed got the new headers on the next request. But
   `gtfs.worker-C9WVoLDT.js` did not change (worker source unchanged
   between deploys), so Cloudflare served the previously-cached response
   with the OLD headers (e.g. the OLD CSP).
3. Workers inherit their CSP from the response that loaded them
   (verified in WebKit 26.5 / Safari 17). The worker tried to call
   `gtfs-rt.n3ary.com/...` and got blocked by the old CSP, even though
   the document was on the new CSP.

The fix: after every deploy, purge the edge cache for the relevant URL
prefixes via the Cloudflare API. The next request re-fetches from origin
with the current `_headers` and the new headers reach the browser.

The purge is followed by a smoke test that asserts
`cf-cache-status: MISS` for a hashed worker file. A MISS is the only
signal that the purge actually invalidated the cache entry for that
URL — HIT or REVALIDATED would mean an edge node is still serving a
stale entry, which is the failure mode PR #291 demonstrated. The
check is general by design: it does not assert any specific response
header value, so it stays useful regardless of which `_headers`
directive is the active concern. A 3-attempt retry with 2s backoff
absorbs purge-to-edge propagation lag (the purge API returns success
before every edge node has processed the invalidation).

A previous version of the check hard-coded a CSP-origin assertion
(`grep "${EXPECTED_ORIGIN}"` for `gtfs-rt.n3ary.com`). That worked
when CSP was the active concern but rotted the moment we stopped
touching CSP — the check would have continued to "pass" against the
unchanging, already-correct CSP without ever exercising the purge
mechanism. Asserting the cache state instead of the response
content decouples the check from any specific header.

**Required secrets:** `CLOUDFLARE_ZONE_ID` (zone ID for `n3ary.com`, get
from the Cloudflare dashboard → n3ary.com → Overview → Zone ID on the
right). The existing `CLOUDFLARE_API_TOKEN` must have `Zone: Purge` (or
`Zone: Edit`) on the zone; if it was created with `Cloudflare Pages: Edit`
only, rotate it via the dashboard to add the zone permission.

## Branch protection assumptions

- "Require branches to be up to date" must be on. With the release bot
  model, the release PR must see the latest `main` (including the
  human PR it depends on) before the bump + auto-merge.
- PR validation is required to pass.

## Why this is documented separately from the workflows

The workflow YAML expresses the steps; this doc expresses **why** each
step exists. Future agents editing the workflows should read this first
to avoid removing a safety they don't recognize.
