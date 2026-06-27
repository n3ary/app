# Neary — User Guide

## What is Neary?

A real-time bus tracking app showing live bus locations, GTFS schedules, smart route suggestions, and arrival confidence indicators — all via Tranzy API.

## First Time Setup

1. Open the app
2. **Step 1**: Enter your Tranzy API key (get one at [tranzy.ai](https://tranzy.ai)) and test it
3. **Step 2**: Select your city
4. Done — optionally set home/work locations later in Settings for smarter suggestions

## Navigation

- **Stations tab** — buses arriving at stations near you
- **Favorites tab** — your saved routes
- **Settings** — API key, locations, preferences (header button)

## Stations View

- Finds all stations within 100m of your closest station
- Shows direction indicators: 🟢 "Arriving in Xmin" / 🟠 "Departed Xmin ago"
- Tap "Show stops" to see full route with current bus position
- Tap 🗺️ map icon for interactive route view with live vehicle tracking
- Favorite routes are highlighted

## Interactive Map

- Full route visualization with live bus positions
- Route shape (actual path, not straight lines)
- Target station and destination markers
- Map controls: Vehicle Tracking, Route Overview, Station Centered

## Status Indicators (Header)

| Indicator | Green | Yellow | Red |
|-----------|-------|--------|-----|
| Internet | Connected | — | No Internet |
| GPS | Active | Inactive | Disabled |

## Confidence Indicators

- 🔴 **LIVE** — real-time GPS tracking (most accurate)
- ⏱️ **ESTIMATED** — GTFS schedule data (less reliable)

## Settings

### Common
- **Refresh Rate** (5-300s, default 30s) — how often bus data updates
- **Stale Data Threshold** (1-30min, default 2min) — when data is considered outdated
- **Max Vehicles Per Station** (1-20, default 5) — vehicles shown per station
- **Theme** — dark/light mode, respects system preference

### Locations
Three location types, used in priority order:
1. **Current GPS** — real-time device location
2. **Home / Work** — saved locations for smart direction detection
3. **Fallback** — used when GPS unavailable, defaults to city center

### Cache Management
Tap the 🔄 icon in Settings header for:
- Version info and update checks
- **Force Refresh Cache** — clears cached app data (keeps settings/favorites), fixes stale content issues

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No buses found | Check route number, verify operating hours, refresh |
| Location not available | Enable browser location permissions, check GPS |
| API key invalid | Re-check key, verify at tranzy.ai |
| Stale data | Pull to refresh, or Force Refresh Cache in Settings |

More help: [troubleshooting guide](troubleshooting/README.md)

## Mobile Tips

- Add to home screen for app-like experience
- Use landscape for map view
- Reduce refresh rate to save battery
