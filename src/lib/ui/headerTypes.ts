export type HealthState = 'ok' | 'stale' | 'error' | 'idle';

export interface HeaderHealth {
  gps: { state: HealthState; tooltip?: string };
  connection: { state: HealthState; tooltip?: string };
  schedule: { state: HealthState; tooltip?: string };
  live: { state: HealthState; tooltip?: string };
}
