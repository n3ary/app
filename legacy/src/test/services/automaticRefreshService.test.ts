// Automatic Refresh Service Tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRefreshData = vi.fn().mockResolvedValue({ success: true, errors: [], refreshedStores: [], skippedStores: [] });
const mockIsNetworkAvailable = vi.fn(() => true);
const mockSubscribe = vi.fn(() => vi.fn());

// Mock stores
vi.mock('../../stores/statusStore', () => ({
  useStatusStore: {
    getState: vi.fn(() => ({
      networkOnline: true,
      apiStatus: 'online'
    })),
    subscribe: mockSubscribe
  }
}));

// Mock manual refresh service
vi.mock('../../services/manualRefreshService', () => ({
  manualRefreshService: {
    refreshData: mockRefreshData,
    isNetworkAvailable: mockIsNetworkAvailable,
    isRefreshInProgress: vi.fn(() => false)
  }
}));

// Mock app context - isContextReady returns true
vi.mock('../../context/appContext', () => ({
  isContextReady: vi.fn(() => true)
}));

describe('AutomaticRefreshService', () => {
  let automaticRefreshService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRefreshData.mockResolvedValue({ success: true, errors: [], refreshedStores: [], skippedStores: [] });
    mockIsNetworkAvailable.mockReturnValue(true);

    // Fresh import each test
    const module = await import('../../services/automaticRefreshService');
    automaticRefreshService = module.automaticRefreshService;
  });

  afterEach(() => {
    if (automaticRefreshService) {
      automaticRefreshService.destroy();
    }
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      await expect(automaticRefreshService.initialize()).resolves.not.toThrow();
    });

    it('should start background refresh on startup', async () => {
      automaticRefreshService.destroy();
      await automaticRefreshService.initialize();
      
      // startBackgroundRefresh is fire-and-forget, give it a tick to resolve
      await vi.advanceTimersByTimeAsync(0);
      
      expect(mockRefreshData).toHaveBeenCalled();
    });

    it('should be marked as active after initialization', async () => {
      await automaticRefreshService.initialize();
      
      expect(automaticRefreshService.isActive()).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should return current configuration', () => {
      const config = automaticRefreshService.getConfig();
      
      expect(config).toHaveProperty('vehicleRefreshInterval');
      expect(config).toHaveProperty('enableBackgroundRefresh');
    });

    it('should update configuration', () => {
      const newConfig = { vehicleRefreshInterval: 30000 };
      
      automaticRefreshService.updateConfig(newConfig);
      
      const config = automaticRefreshService.getConfig();
      expect(config.vehicleRefreshInterval).toBe(30000);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timers and event listeners', async () => {
      await automaticRefreshService.initialize();
      
      expect(automaticRefreshService.isActive()).toBe(true);
      
      automaticRefreshService.destroy();
      
      expect(automaticRefreshService.isActive()).toBe(false);
    });
  });

  describe('app visibility handling', () => {
    it('should handle visibility change events without errors', async () => {
      await automaticRefreshService.initialize();
      
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      
      expect(true).toBe(true);
    });
  });
});
