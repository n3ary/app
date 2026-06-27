// StationCacheStore - Cache filtered stations by location
// Persists across component unmounts for instant view switching

import { create } from 'zustand';
import type { FilteredStation } from '../types/stationFilter';

interface LocationCacheEntry {
  stations: FilteredStation[];
  timestamp: number;
}

interface StationCacheStore {
  // Cache by location key (lat,lon rounded to 3 decimals)
  cache: Map<string, LocationCacheEntry>;
  
  // Get cached stations for a location
  get: (locationKey: string, maxAgeMs?: number) => FilteredStation[] | null;
  
  // Set cached stations for a location
  set: (locationKey: string, stations: FilteredStation[]) => void;
  
  // Clear old entries
  cleanup: () => void;
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 minutes

export const useStationCacheStore = create<StationCacheStore>((set, get) => ({
  cache: new Map(),
  
  get: (locationKey: string, maxAgeMs = DEFAULT_MAX_AGE) => {
    const entry = get().cache.get(locationKey);
    if (!entry) return null;
    
    // Check if cache is stale
    const age = Date.now() - entry.timestamp;
    if (age > maxAgeMs) {
      return null;
    }
    
    return entry.stations;
  },
  
  set: (locationKey: string, stations: FilteredStation[]) => {
    set((state) => {
      const newCache = new Map(state.cache);
      
      newCache.set(locationKey, {
        stations,
        timestamp: Date.now()
      });
      
      return { cache: newCache };
    });
  },
  
  cleanup: () => {
    set((state) => {
      const newCache = new Map(state.cache);
      const now = Date.now();
      
      // Remove entries older than 10 minutes
      for (const [key, entry] of newCache.entries()) {
        if (now - entry.timestamp > 10 * 60 * 1000) {
          newCache.delete(key);
        }
      }
      
      return { cache: newCache };
    });
  }
}));
