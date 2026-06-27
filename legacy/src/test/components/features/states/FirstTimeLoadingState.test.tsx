// FirstTimeLoadingState.test.tsx - Tests for first-time loading component

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FirstTimeLoadingState } from '../../../../components/features/states/FirstTimeLoadingState';

describe('FirstTimeLoadingState', () => {
  it('should render default loading message', () => {
    render(<FirstTimeLoadingState />);
    
    expect(screen.getByText('Loading transit data...')).toBeInTheDocument();
    expect(screen.getByText('This may take a moment on first load')).toBeInTheDocument();
  });

  it('should render custom messages when provided', () => {
    render(
      <FirstTimeLoadingState 
        message="Custom loading message"
        subMessage="Custom sub message"
      />
    );
    
    expect(screen.getByText('Custom loading message')).toBeInTheDocument();
    expect(screen.getByText('Custom sub message')).toBeInTheDocument();
  });

  it('should display loading spinner', () => {
    render(<FirstTimeLoadingState />);
    
    // Check for CircularProgress component (it should have role="progressbar")
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});