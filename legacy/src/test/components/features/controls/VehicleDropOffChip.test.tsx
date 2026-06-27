/**
 * VehicleDropOffChip Component Tests
 * Tests rendering and interaction behavior
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VehicleDropOffChip } from '../../../../components/features/controls/VehicleDropOffChip';

describe('VehicleDropOffChip', () => {
  it('should not render when isDropOffOnly is false', () => {
    const { container } = render(<VehicleDropOffChip isDropOffOnly={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render chip when isDropOffOnly is true', () => {
    render(<VehicleDropOffChip isDropOffOnly={true} />);
    expect(screen.getByText('Drop off only')).toBeInTheDocument();
  });

  it('should show toast message when chip is clicked', async () => {
    render(<VehicleDropOffChip isDropOffOnly={true} />);
    
    const chip = screen.getByText('Drop off only');
    fireEvent.click(chip);
    
    await waitFor(() => {
      expect(screen.getByText('This vehicle terminates here. Do not board.')).toBeInTheDocument();
    });
  });

  it('should call onInfoClick callback when chip is clicked', () => {
    const onInfoClick = vi.fn();
    render(<VehicleDropOffChip isDropOffOnly={true} onInfoClick={onInfoClick} />);
    
    const chip = screen.getByText('Drop off only');
    fireEvent.click(chip);
    
    expect(onInfoClick).toHaveBeenCalledTimes(1);
  });

  it('should close toast when close button is clicked', async () => {
    render(<VehicleDropOffChip isDropOffOnly={true} />);
    
    // Open toast
    const chip = screen.getByText('Drop off only');
    fireEvent.click(chip);
    
    await waitFor(() => {
      expect(screen.getByText('This vehicle terminates here. Do not board.')).toBeInTheDocument();
    });
    
    // Close toast
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    
    await waitFor(() => {
      expect(screen.queryByText('This vehicle terminates here. Do not board.')).not.toBeInTheDocument();
    });
  });
});
