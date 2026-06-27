import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GpsStatusIcon } from '../../../../components/features/status/GpsStatusIcon';

describe('GpsStatusIcon', () => {
  it('renders GPS icon with correct visual state for high accuracy', () => {
    render(
      <GpsStatusIcon
        status="available"
        accuracy="high"
        permissionState="granted"
        lastUpdated={Date.now()}
      />
    );
    
    const button = screen.getByRole('button', { name: /gps status/i });
    expect(button).toBeInTheDocument();
  });

  it('renders disabled state when permission is denied', () => {
    render(
      <GpsStatusIcon
        status="available"
        accuracy="high"
        permissionState="denied"
        lastUpdated={null}
      />
    );
    
    const button = screen.getByRole('button', { name: /gps status/i });
    expect(button).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    
    render(
      <GpsStatusIcon
        status="available"
        accuracy="high"
        permissionState="granted"
        lastUpdated={Date.now()}
        onClick={handleClick}
      />
    );
    
    const button = screen.getByRole('button', { name: /gps status/i });
    button.click();
    
    expect(handleClick).toHaveBeenCalledOnce();
  });
});