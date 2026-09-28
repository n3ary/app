// The planner hydrates on the client (map + GTFS worker); there's no
// server data and no literal hrefs for the crawler to resolve. Opt out
// of prerender the same way /favorites and /station/[id] do.
export const prerender = false;
