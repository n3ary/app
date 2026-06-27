import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusIndicator } from '../../../../components/features/status/StatusIndicator';
import { useLocationStore } from '../../../../stores/locationStore';
import { useStatusStore } from '../../../../stores/statusStore';

// Mock the stores
vi.mock('../../../../stores/locationStore');
vi.mock('../../../../stores/statusStore');

const mockLocationStore = {
  currentPosition: null,
  permissionState: null,
  locationAccuracy: null,
  lastUpdated: null,
  requestLocation: vi.fn()
};

const mockStatusStore = {
  apiStatus: 'online' as const,
  networkOnline: true,
  lastApiCheck: Date.now(),
  responseTime: 150,
  setNetworkStatus: vi.fn()
};

describe('StatusIndicator', () => {
  beforeEach(() => {
    (useLocationStore as any).mockReturnValue(mockLocationStore);
    (useStatusStore as any).mockReturnValue(mockStatusStore);
  });

  it('renders both GPS and API status icons', () => {
    render(<StatusIndicator />);
    
    expect(screen.getByLabelText('GPS status')).toBeInTheDocument();
    expect(screen.getByLabelText('API connectivity status')).toBeInTheDocument();
  });

  it('shows GPS toast when GPS icon is clicked with showGpsDetails', async () => {
    render(<StatusIndicator showGpsDetails={true} />);
    
    const gpsIcon = screen.getByLabelText('GPS status');
    fireEvent.click(gpsIcon);
    
    await waitFor(() => {
      // Toast shows permission message since permissionState is null
      expect(screen.getByText('Location permission needed. Click to enable.')).toBeInTheDocument();
    });
  });

  it('shows API toast when API icon is clicked', async () => {
    render(<StatusIndicator />);
    
    const apiIcon = screen.getByLabelText('API connectivity status');
    fireEvent.click(apiIcon);
    
    await waitFor(() => {
      // Toast shows connected message with response time
      expect(screen.getByText('Connected (150ms)')).toBeInTheDocument();
    });
  });

  it('calls requestLocation when GPS icon is clicked', () => {
    render(<StatusIndicator />);
    
    const gpsIcon = screen.getByLabelText('GPS status');
    fireEvent.click(gpsIcon);
    
    expect(mockLocationStore.requestLocation).toHaveBeenCalled();
  });

  it('handles network events properly', () => {
    render(<StatusIndicator />);
    
    fireEvent(window, new Event('offline'));
    expect(mockStatusStore.setNetworkStatus).toHaveBeenCalledWith(false);
    
    fireEvent(window, new Event('online'));
    expect(mockStatusStore.setNetworkStatus).toHaveBeenCalledWith(true);
  });
});
