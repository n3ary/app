// Compressed localStorage adapter for Zustand's persist middleware.
//
// Architecture note (issue #29):
// The codebase persists large store data in localStorage using gzip compression
// (`compressionUtils.ts`). Historically each large store (e.g. `shapeStore`)
// re-implemented its own compress-on-write / decompress-on-read storage object.
// This factory consolidates that pattern into a single reusable async
// `StateStorage`, so every large store uses the SAME mechanism instead of
// introducing bespoke adapters (it replaces the one-off IndexedDB adapter that
// previously backed the schedule store).
//
// Usage:
//   storage: createJSONStorage(() => createCompressedStorage('[ScheduleStore]'))
//
// `createJSONStorage` handles JSON (de)serialization; this adapter only deals in
// strings, transparently compressing on write and decompressing on read. The
// gzip marker (`gzip:` prefix) is produced/recognized by `compressionUtils`, so
// previously-stored uncompressed values are still read correctly.
//
// All operations fail soft: read errors return null and write/remove errors are
// logged but never thrown, so storage being unavailable or over-quota degrades
// to in-memory-only state rather than breaking the app.

import type { StateStorage } from 'zustand/middleware';
import { compressData, decompressData } from './compressionUtils.ts';

/**
 * Creates a {@link StateStorage} backed by localStorage with transparent gzip
 * compression (via {@link compressData}/{@link decompressData}).
 *
 * @param logPrefix - Prefix used for non-fatal warnings (e.g. `[ScheduleStore]`)
 */
export function createCompressedStorage(
  logPrefix = '[CompressedStorage]'
): StateStorage {
  const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

  return {
    getItem: async (name: string): Promise<string | null> => {
      try {
        if (!hasLocalStorage()) return null;
        const raw = localStorage.getItem(name);
        if (raw == null) return null;
        // decompressData returns the input unchanged when it is not gzip-marked,
        // so this transparently handles both compressed and legacy plain values.
        return await decompressData(raw);
      } catch (error) {
        console.warn(`${logPrefix} compressed read failed:`, error);
        return null;
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      try {
        if (!hasLocalStorage()) return;
        // compressData only compresses when it actually reduces size (and skips
        // very small payloads), returning the original string otherwise.
        const toStore = await compressData(value);
        localStorage.setItem(name, toStore);
      } catch (error) {
        console.warn(`${logPrefix} compressed write failed:`, error);
        // Best-effort fallback: try storing uncompressed before giving up.
        try {
          if (hasLocalStorage()) localStorage.setItem(name, value);
        } catch (fallbackError) {
          console.warn(`${logPrefix} uncompressed write also failed:`, fallbackError);
        }
      }
    },

    removeItem: async (name: string): Promise<void> => {
      try {
        if (hasLocalStorage()) localStorage.removeItem(name);
      } catch (error) {
        console.warn(`${logPrefix} remove failed:`, error);
      }
    },
  };
}
