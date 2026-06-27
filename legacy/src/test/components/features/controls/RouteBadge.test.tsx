// RouteBadge.test.tsx - Tests for RouteBadge component
// Tests rendering with different station role indicators

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteBadge } from '../../../../components/features/controls/RouteBadge';

describe('RouteBadge', () => {
  it('should render route number', () => {
    render(<RouteBadge routeNumber="35" />);
    
    const badge = screen.getByText('35');
    expect(badge).toBeTruthy();
  });

  it('should render without icons for standard station', () => {
    const { container } = render(<RouteBadge routeNumber="35" />);
    
    // Check that no icons are rendered
    const playIcon = container.querySelector('[data-testid="PlayArrowIcon"]');
    const stopIcon = container.querySelector('[data-testid="StopIcon"]');
    
    expect(playIcon).toBeNull();
    expect(stopIcon).toBeNull();
  });

  it('should render Start icon when isStart is true', () => {
    const { container } = render(<RouteBadge routeNumber="35" isStart={true} />);
    
    // Check that Play icon is rendered
    const playIcon = container.querySelector('[data-testid="PlayArrowIcon"]');
    expect(playIcon).toBeTruthy();
  });

  it('should render End icon when isEnd is true', () => {
    const { container } = render(<RouteBadge routeNumber="35" isEnd={true} />);
    
    // Check that Stop icon is rendered
    const stopIcon = container.querySelector('[data-testid="StopIcon"]');
    expect(stopIcon).toBeTruthy();
  });

  it('should render both icons for turnaround station', () => {
    const { container } = render(<RouteBadge routeNumber="35" isStart={true} isEnd={true} />);
    
    // Check that both icons are rendered
    const playIcon = container.querySelector('[data-testid="PlayArrowIcon"]');
    const stopIcon = container.querySelector('[data-testid="StopIcon"]');
    
    expect(playIcon).toBeTruthy();
    expect(stopIcon).toBeTruthy();
  });

  it('should accept all props without errors', () => {
    expect(() => {
      render(
        <RouteBadge
          routeNumber="35"
          routeColor="FF0000"
          isStart={true}
          isEnd={false}
          size="medium"
          onClick={() => {}}
          selected={true}
          isFavorite={false}
        />
      );
    }).not.toThrow();
  });

  it('should apply custom route color', () => {
    const { container } = render(<RouteBadge routeNumber="35" routeColor="FF0000" />);
    
    const avatar = container.querySelector('.MuiAvatar-root');
    expect(avatar).toBeTruthy();
  });

  it('should handle different sizes', () => {
    const { rerender, container } = render(<RouteBadge routeNumber="35" size="small" />);
    let avatar = container.querySelector('.MuiAvatar-root');
    expect(avatar).toBeTruthy();

    rerender(<RouteBadge routeNumber="35" size="medium" />);
    avatar = container.querySelector('.MuiAvatar-root');
    expect(avatar).toBeTruthy();

    rerender(<RouteBadge routeNumber="35" size="large" />);
    avatar = container.querySelector('.MuiAvatar-root');
    expect(avatar).toBeTruthy();
  });
});
