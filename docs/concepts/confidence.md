# Confidence

A single bit-of-information per vehicle that drives UI dimming and badges.

Source: [src/lib/domain/types.ts](../../src/lib/domain/types.ts) is authoritative.

## Tiers

| Tier | Meaning | UI |
|---|---|---|
| `high` | Two live sources agree (`verified`) | Full opacity, check-circle pip |
| `medium` | One live source matched to schedule (`tracked`), or schedule at trip origin where the bus is parked | Full opacity |
| `low` | Schedule-only at an intermediate stop (no GPS to corroborate) | `opacity-60` (dimmed) |

## Why one field instead of UI-side derivation

The UI used to compute `dim = kind === 'scheduled' && !isFirstStop`. Two
problems: it duplicated information the domain already had, and it would
drift the moment a new kind needed a different rule. Consolidated into
`confidence` set by `scheduleScanner` and `reconcile`. The card reads
one bit: `vehicle.confidence === 'low'`.

## Setting confidence

- `scheduleScanner` sets `medium` at the trip origin (`isFirstStop === true`),
  `low` at intermediate stops.
- `reconcile` upgrades matched rows to `medium` (becoming `tracked`).
- Two-source agreement sets `high` (becoming `verified`; only when
  Tranzy + GTFS-RT both run).
