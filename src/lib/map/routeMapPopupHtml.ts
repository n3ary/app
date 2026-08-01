// Pure HTML builders for Leaflet `divIcon` payloads and popups on the
// route map. Extracted from the route map +page.svelte so the page
// (and the <RouteMap> component) can stay focused on data flow and
// Leaflet lifecycle, and so the HTML rendering of popups / icons is
// one file you can edit without scrolling past 1000 lines of map logic.
//
// All functions are pure: they take their inputs as arguments and
// return a string. Nothing here touches the DOM, reads from stores, or
// knows about Leaflet. The `Route` and `VehicleMarker` types are
// imported from their owners; the VehicleMarker shape mirrors the
// derivation in useRouteMapView (kept structurally identical — that
// derivation is the only producer, and this file is the only consumer
// of the shape for rendering).

import {
  formatHHMM,
  formatRelativeMin,
  pickContrastingText,
  type Route,
} from '$lib/domain/types';

/** Render-ready vehicle for the current nowMin. Mirrors the shape
 *  produced by useRouteMapView's `markers` derivation. Kept here too
 *  (rather than only in the composable) so this file is self-contained
 *  — the only producer in the app produces a shape that matches
 *  exactly. */
export type VehicleMarker = {
  tripId: string;
  headsign: string | null;
  lat: number;
  lon: number;
  opacity: number;
  selected: boolean;
  tripStartMin: number;
  /** True for 'before' (next only) and 'at-origin' — no movement prediction. */
  scheduled: boolean;
  /** Set when the vehicle has a live GPS match.
   *   - 'good':       fresh fix (< 3 min) — high trust.
   *   - 'stale':      3–5 min old — reduced trust (yellow border).
   *   - 'very-stale': 5–15 min old — low trust (red border).
   *   - null:         schedule-estimated. */
  gpsConfidence: 'good' | 'stale' | 'very-stale' | null;
  /** Reconciled vehicle kind. */
  kind: 'scheduled' | 'tracked' | 'verified' | 'gps-only';
  /** GTFS direction_id (0 / 1), or -1 when unknown. */
  directionId: 0 | 1 | -1;
  /** Unix ms of the last GPS observation, or null for schedule-only. */
  gpsAsOfMs: number | null;
  /** True when tripStartMin is a real origin-departure time. */
  hasOriginTime: boolean;
  /** Minutes until this vehicle reaches the from-stop, or null. */
  arrivingInMin: number | null;
};

const CLOCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const SCHED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="14" r="1" fill="currentColor"/><circle cx="12" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="14" r="1" fill="currentColor"/><circle cx="8" cy="18" r="1" fill="currentColor"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>`;
const EXTERNAL_LINK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;

/** HTML escape. Use on every user-supplied string before splicing into
 *  a template literal that ends up in `innerHTML`. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Popup body for a vehicle marker. Renders the headsign + kind dot
 *  + schedule link, plus three optional info rows: countdown (only
 *  for scheduled-at-origin bubbles), left-at (only for departed
 *  vehicles with a real origin time), and arriving-in (only when a
 *  from-stop is selected and the vehicle is still on its way). */
export function vehiclePopupHtml(
  m: VehicleMarker,
  rId: string,
  dir: 0 | 1,
  nowMinVal: number,
  routeHasSchedule: boolean,
): string {
  // Kind dot beside the headsign, matching the VehicleCard one on
  // the station view so the visual language stays consistent across
  // surfaces. Green for any kind backed by GPS (tracked / verified /
  // gps-only), grey for schedule-only. Replaces the dedicated
  // "est." / "gps" info row that used to live below — same signal
  // in less vertical space.
  const dotColor = m.kind === 'scheduled' ? '#888' : '#22c55e';
  const dotTitle = m.kind === 'scheduled' ? 'Scheduled'
    : m.kind === 'tracked' ? 'Tracked'
    : m.kind === 'verified' ? 'Verified'
    : 'GPS only';
  const dot = `<span title="${dotTitle}" aria-label="${dotTitle}" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>`;
  // Headsign + kind dot + schedule button on the same row.
  const headsignText = m.headsign
    ? `<span style="font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.headsign)}</span>`
    : `<span style="flex:1;"></span>`;
  // Routes with no usable schedule (adapter-emitted live-only
  // `_NT*` fallback trips: empty arrival_time on every stop_time
  // row) skip the schedule shortcut — /schedule/route would have
  // nothing to show.
  const schedLink = routeHasSchedule
    ? `<a href="/schedule/route/${escapeHtml(rId)}_${dir}" title="View schedule" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:4px;background:rgba(0,0,0,0.07);color:#555;text-decoration:none;flex-shrink:0;">${SCHED_SVG}</a>`
    : '';
  const topRow = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">${headsignText}${dot}${schedLink}</div>`;
  // Shared row template for every line below `topRow`. Three callers:
  // countdown (scheduled-at-origin "in X min"), leftAt (departed
  // bus's wall-clock origin time), arrivingIn (ETA to the rider's
  // ?from-stop). Same flex / icon / coloured-label layout, just
  // different colour + label. Factor here so adding a fourth info
  // line is one line of code.
  const popupRow = (color: string, label: string): string =>
    `<div style="display:flex;align-items:center;gap:2px;color:${color};font-size:11px;margin-top:3px;">${CLOCK_SVG}<span style="margin-left:2px;">${label}</span></div>`;
  // Countdown row, kept only for scheduled-at-origin / scheduled-
  // before bubbles: green clock + "in X min". Tells the rider when
  // the parked / not-yet-departed bus is expected to leave. On-route
  // vehicles don't get this line — their dot already conveys "live".
  const countdownHtml = m.scheduled
    ? popupRow(
        '#16a34a',
        (() => {
          const minsUntil = m.tripStartMin - nowMinVal;
          return minsUntil <= 0 ? 'now' : formatRelativeMin(minsUntil);
        })(),
      )
    : '';
  // For vehicles that have ALREADY departed origin (everything but
  // the scheduled-at-origin / scheduled-before bubbles, which the
  // 'in X min' label above already covers), append the wall-clock
  // time the trip left its first stop. Lets a rider on the map
  // map a moving bubble back to a specific scheduled departure
  // without opening the schedule view. Suppressed for orphans whose
  // tripStartMin is a fallback (hasOriginTime === false) — rendering
  // 'left at <now>' there would be a lie.
  const leftAtHtml = !m.scheduled && m.hasOriginTime
    ? popupRow('#888', `left at ${formatHHMM(m.tripStartMin)}`)
    : '';
  // 'arriving in N min' line, surfaced only when the URL carries a
  // `?from=<stopId>` (green-painted target station) AND the vehicle
  // is still on its way toward that stop. predictArrivalAlongShape
  // returns negative minutes once the vehicle passes the target;
  // the marker setter (`computeArrivingInMin` in the markers
  // derivation) drops the value to null in that case, so this
  // string is empty for everything that's no longer 'incoming' to
  // the rider's origin. Green to match the green stop highlight.
  const arrivingHtml = m.arrivingInMin != null
    ? popupRow('#16a34a', `arriving in ${m.arrivingInMin} min`)
    : '';
  return `<div style="font:13px/1.3 ui-sans-serif,system-ui;min-width:150px;">${topRow}${countdownHtml}${leftAtHtml}${arrivingHtml}</div>`;
}

/** `divIcon` HTML for a vehicle badge. Inner ring colour reflects GPS
 *  data source so the same green / yellow / red signal a rider reads
 *  from any vehicle stays visible when the vehicle is selected. When
 *  unselected this is the only ring; selection adds a dark outer ring
 *  around it as the "you tapped this one" highlight.
 *    good        → green   stale       → yellow   very-stale → red
 *    null (schedule-only): white. */
export function vehicleHtml(
  shortName: string,
  bg: string,
  fg: string,
  selected: boolean,
  opacity: number,
  scheduled: boolean,
  gpsConfidence: 'good' | 'stale' | 'very-stale' | null,
  debugId: string,
): string {
  const inner =
    gpsConfidence === 'good' ? '#22c55e' :
    gpsConfidence === 'stale' ? '#eab308' :
    gpsConfidence === 'very-stale' ? '#ef4444' :
    '#fff';
  const ring = selected
    ? `box-shadow:0 0 0 3px ${inner}, 0 0 0 5px #111;`
    : gpsConfidence != null
      ? `box-shadow:0 0 0 2.5px ${inner};`
      : 'box-shadow:0 0 0 2px #fff;';
  // Scheduled vehicles (at-origin / next 'before'): outlined badge so
  // the user can distinguish "waiting to depart" from "en route".
  const colors = scheduled
    ? `background:rgba(255,255,255,0.92);color:${bg};border:1.5px solid ${bg};`
    : `background:${bg};color:${fg};`;
  // Pulsing CSS class for the selected badge — the keyframe lives
  // in the page-level style block and animates an additional
  // box-shadow on top of the static one above, so the dark outer
  // ring breathes outward without the badge moving. The
  // `--neary-inner` custom property carries the GPS-confidence
  // ring colour into the animation so the inner ring stays at its
  // semantic colour through the pulse.
  const selectedClass = selected ? ' neary-vehicle-selected' : '';
  const selectedVar = selected ? `--neary-inner:${inner};` : '';
  return `<div style="position:relative;"><div class="neary-vehicle-badge${selectedClass}" style="
    display:inline-flex;align-items:center;justify-content:center;
    min-width:32px;height:22px;padding:0 6px;border-radius:6px;
    ${colors}font:600 12px/1 ui-sans-serif,system-ui;
    opacity:${opacity};${ring}${selectedVar}
  ">${escapeHtml(shortName)}</div>${debugId ? `<div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 9px/1.1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;background:rgba(255,255,255,0.9);border-radius:3px;padding:1px 3px;pointer-events:none;">${escapeHtml(debugId)}</div>` : ''}</div>`;
}

/** `divIcon` HTML for a small route badge (used in stop popups to
 *  show the routes serving a stop). */
export function routeBadgeHtml(r: Route): string {
  const fg = pickContrastingText(r.color);
  return `<span style="
    display:inline-flex;align-items:center;justify-content:center;
    padding:1px 5px;border-radius:4px;
    background:${r.color};color:${fg};
    font:600 10px/1.4 ui-sans-serif,system-ui;white-space:nowrap;
  ">${escapeHtml(r.shortName)}</span>`;
}

/** Popup body for a stop. Shows the stop name + an "open station"
 *  shortcut, plus a row of route badges for every route serving
 *  this stop. */
export function stopPopupHtml(
  stopId: string,
  name: string,
  routes: Route[],
): string {
  const badgesHtml = routes.length > 0
    ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;">${routes.map((r) => routeBadgeHtml(r)).join('')}</div>`
    : '';
  return `<div style="font:13px/1.3 ui-sans-serif,system-ui;min-width:160px;">
    <div style="display:flex;align-items:center;gap:5px;">
      <span style="font-weight:600;flex:1;min-width:0;">${escapeHtml(name)}</span>
      <a href="/station/${stopId}" title="Open station" aria-label="Open station ${escapeHtml(name)}" style="
        display:inline-flex;align-items:center;justify-content:center;
        color:#555;text-decoration:none;flex-shrink:0;">
        ${EXTERNAL_LINK_SVG}
      </a>
    </div>${badgesHtml}
  </div>`;
}
