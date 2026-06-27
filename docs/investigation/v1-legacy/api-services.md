# Data Services

## Architecture

Static transit data (routes, stops, trips, stop_times, shapes) is served from the `neary-gtfs` releases branch on GitHub. The Tranzy API is used only for live vehicle positions.

## Data Sources

| Data | Source | Refresh |
|------|--------|---------|
| Routes, Stops, Trips, Stop times, Shapes | `raw.githubusercontent.com/ciotlosm/neary-gtfs/releases/data/<agency>/` | Daily (hash-checked) |
| Schedule | `raw.githubusercontent.com/ciotlosm/neary-gtfs/releases/agency-<id>-schedule.json` | Daily |
| Vehicles (live GPS) | Tranzy API `/vehicles` | Every 2 minutes |
| Agency list | `raw.githubusercontent.com/ciotlosm/neary-gtfs/releases/data/agency.json` | On setup |

## Services

| Service | Purpose |
|---------|---------|
| `staticDataService` | Orchestrates all static data fetching with hash-based freshness |
| `vehicleService` | Live vehicle positions + enhancement (predictions, position interpolation) |
| `agencyService` | Agency list (static source primary, Tranzy API fallback) |
| `arrivalService` | Real-time arrival estimates (computed client-side) |
| `locationService` | GPS location with retry logic |

## Hash-based Freshness

The `staticDataService` fetches a manifest (`data/hashes.json`) containing SHA-256 hashes per endpoint. If the remote hash matches the locally stored hash, the full download is skipped. This means:
- First load: downloads all data (~few MB)
- Subsequent loads: downloads only the ~1 KB manifest, skips unchanged data
- Agency switch: invalidates cache, downloads new agency's data

See `src/services/staticDataService.ts` for implementation.
