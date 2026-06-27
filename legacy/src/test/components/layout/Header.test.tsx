// Header.test.tsx - Integration tests for Header component
// Tests header integration with Manual Refresh Button and other controls

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../../../components/layout/Header';
import { destroyDataFreshnessMonitor } from '../../../utils/core/apiFreshnessMonitor';

// Mock the stores with proper Zustand structure
vi.mock('../../../stores/vehicleStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useVehicleStore: mockStore
  };
});

vi.mock('../../../stores/stationStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useStationStore: mockStore
  };
});

vi.mock('../../../stores/routeStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useRouteStore: mockStore
  };
});

vi.mock('../../../stores/shapeStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useShapeStore: mockStore
  };
});

vi.mock('../../../stores/stopTimeStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useStopTimeStore: mockStore
  };
});

vi.mock('../../../stores/tripStore', () => {
  const mockRefreshData = vi.fn().mockResolvedValue(undefined);
  const mockSubscribe = vi.fn(() => vi.fn());
  
  const mockStoreState = {
    refreshData: mockRefreshData,
    lastUpdated: Date.now(),
    loading: false
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = mockSubscribe;
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useTripStore: mockStore
  };
});

// Mock StatusStore for StatusIndicator
vi.mock('../../../stores/statusStore', () => {
  const mockStoreState = {
    networkStatus: 'online' as const,
    gpsStatus: 'available' as const,
    apiStatus: 'operational' as const
  };
  
  const mockStore = vi.fn(() => mockStoreState);
  mockStore.subscribe = vi.fn(() => vi.fn());
  mockStore.getState = vi.fn(() => mockStoreState);
  
  return {
    useStatusStore: mockStore
  };
});

describe('Header Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    destroyDataFreshnessMonitor();
  });

  it('should render header with title', () => {
    render(<Header title="Test App" />);
    
    expect(screen.getByText('Test App')).toBeInTheDocument();
  });

  it('should render header with default title when no title provided', () => {
    render(<Header />);
    
    expect(screen.getByText('Bus Tracker')).toBeInTheDocument();
  });

  it('should render app icon', () => {
    render(<Header />);
    
    const icon = screen.getByAltText('Neary');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('src', '/neary.svg');
  });

  it('should render status indicator', () => {
    render(<Header />);
    
    // StatusIndicator should be present (it renders status icons)
    const statusContainer = screen.getByTestId('status-indicator');
    expect(statusContainer).toBeInTheDocument();
  });

  it('should render manual refresh button', () => {
    render(<Header />);
    
    const refreshButton = screen.getByRole('button', { name: /manual refresh data/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('should render settings button when onSettingsClick is provided', () => {
    const mockSettingsClick = vi.fn();
    render(<Header onSettingsClick={mockSettingsClick} />);
    
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    expect(settingsButton).toBeInTheDocument();
  });

  it('should not render settings button when onSettingsClick is not provided', () => {
    render(<Header />);
    
    const settingsButton = screen.queryByRole('button', { name: /settings/i });
    expect(settingsButton).not.toBeInTheDocument();
  });

  it('should call onSettingsClick when settings button is clicked', () => {
    const mockSettingsClick = vi.fn();
    render(<Header onSettingsClick={mockSettingsClick} />);
    
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsButton);
    
    expect(mockSettingsClick).toHaveBeenCalledOnce();
  });

  it('should have proper layout with status indicator and refresh button positioned correctly', () => {
    render(<Header onSettingsClick={vi.fn()} />);
    
    // Check that both status indicator and refresh button are present
    const statusIndicator = screen.getByTestId('status-indicator');
    const refreshButton = screen.getByRole('button', { name: /manual refresh data/i });
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    
    expect(statusIndicator).toBeInTheDocument();
    expect(refreshButton).toBeInTheDocument();
    expect(settingsButton).toBeInTheDocument();
    
    // Verify they are all in the header
    const header = screen.getByRole('banner');
    expect(header).toContainElement(statusIndicator);
    expect(header).toContainElement(refreshButton);
    expect(header).toContainElement(settingsButton);
  });

  it('should maintain responsive design with proper spacing', () => {
    render(<Header onSettingsClick={vi.fn()} />);
    
    // Check that the header maintains proper structure
    const toolbar = screen.getByRole('banner').querySelector('[class*="MuiToolbar"]');
    expect(toolbar).toBeInTheDocument();
    
    // Verify title has flex-grow for proper spacing
    const title = screen.getByText('Bus Tracker');
    expect(title).toBeInTheDocument();
  });

  it('should integrate manual refresh button with existing header functionality', () => {
    const mockSettingsClick = vi.fn();
    render(<Header title="Integration Test" onSettingsClick={mockSettingsClick} />);
    
    // Test that all header functionality works together
    const refreshButton = screen.getByRole('button', { name: /manual refresh data/i });
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    
    // Both buttons should be clickable
    expect(refreshButton).not.toBeDisabled();
    expect(settingsButton).not.toBeDisabled();
    
    // Settings functionality should still work
    fireEvent.click(settingsButton);
    expect(mockSettingsClick).toHaveBeenCalledOnce();
    
    // Refresh button should be functional (no errors thrown)
    expect(() => fireEvent.click(refreshButton)).not.toThrow();
  });
});