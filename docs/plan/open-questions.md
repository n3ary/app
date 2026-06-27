# Open questions

Deferred decisions. Each entry has a forcing function (what we need to see
before deciding).

## Domain layer as shared npm package

- **Question**: Should [src/lib/domain/](../../src/lib/domain/) ship as a
  reusable npm package so a future native wrapper or sibling app can consume it?
- **Decide after**: Phase 4 work has stabilized the domain shape and we have
  a second consumer in mind. Until then, keep it in-tree.

## Leaflet vs MapLibre GL

- **Question**: Swap Leaflet for MapLibre GL for vector tiles and richer styling?
- **Decide after**: a real iOS-Safari rendering bottleneck appears. Leaflet
  handles current load fine.

## SSR vs prerender

- **Question**: Switch SvelteKit from static prerender to per-route server rendering?
- **Decide after**: a route shows a real need for server-side data fetching
  that prerender can't serve. Default stays prerender (cheaper hosting, faster TTI).

## Per-route speed profile

- **Question**: Should the prediction speed cascade be per-route instead of per-feed?
- **Decide after**: more cities are live (M3) and we have data showing per-route variance matters.
- **Current**: per-feed (decided 2026-06-27 — see [prediction-v2.md §7 Q.1](prediction-v2.md)).

## Per-stop dwell vs flat dwell

- **Question**: Estimate dwell per-stop from historical observation, or keep a flat 20 s default?
- **Decide after**: historical observation pipeline (calibration option C) ships data we can analyze. See [prediction-v2.md §7 Q.2](prediction-v2.md).

## Reconciliation GPS tie-break

- **Question**: Should reconciliation use GPS position for tie-breaks when two scheduled rows match within tolerance?
- **Decide after**: we see real ambiguity in production data. See [prediction-v2.md §7 Q.5](prediction-v2.md).

## Test corpus for predicted vs observed

- **Question**: How do we measure prediction accuracy systematically?
- **Decide after**: historical observation pipeline produces enough captured-vs-predicted pairs. See [prediction-v2.md §7 Q.7](prediction-v2.md).
