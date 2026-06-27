// Test for error recovery functionality
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleApiError } from '../../../services/error/errorHandlers';
import axios from 'axios';

describe('Error Recovery', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;
  
  beforeEach(() => {
    // Mock window.dispatchEvent
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should trigger navigation to settings on 401 error', () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { message: 'Unauthorized' }
      }
    };
    
    // Mock axios.isAxiosError
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    
    try {
      handleApiError(error, 'fetch data');
    } catch (e) {
      // Expected to throw
    }
    
    // Verify navigation event was dispatched
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate-to-settings',
        detail: { reason: 'invalid-credentials' }
      })
    );
  });
  
  it('should not trigger navigation for non-401 errors', () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 500,
        data: { message: 'Server error' }
      }
    };
    
    // Mock axios.isAxiosError
    vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    
    try {
      handleApiError(error, 'fetch data');
    } catch (e) {
      // Expected to throw
    }
    
    // Verify navigation event was NOT dispatched
    expect(dispatchEventSpy).not.toHaveBeenCalled();
  });
});
