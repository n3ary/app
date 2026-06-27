/**
 * Test Constants
 * Centralized constants for testing configuration and mock data
 */

export const TEST_CONFIG = {
  TIMEOUT: 5000,
  MAX_CONCURRENCY: 4,
  MIN_WORKERS: 2,
  MAX_WORKERS: 4
} as const;

export const MOCK_DATA = {
  COORDINATES: {
    CLUJ: { lat: 46.7712, lon: 23.6236 },
    BUCHAREST: { lat: 44.4268, lon: 26.1025 }
  },
  ACCURACY: 10
} as const;