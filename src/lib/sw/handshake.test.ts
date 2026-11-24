/**
 * sw/handshake.test.ts — unit tests for the app <-> service worker
 * version handshake reply channel.
 *
 * The regression these guard: the worker used to reply with
 * `event.source.postMessage(...)`, which delivers to the page's
 * `navigator.serviceWorker` 'message' event. The app listens on the
 * MessageChannel port it transferred with the request, so the reply
 * never arrived and the app detected updates without ever applying
 * them.
 */

import { describe, it, expect, vi } from 'vitest';

import { replyOnHandshakeChannel } from './handshake.js';

describe('replyOnHandshakeChannel', () => {
  it('replies on the transferred port when the app sent one', () => {
    const port = { postMessage: vi.fn() } as unknown as MessagePort;
    const source = { postMessage: vi.fn() };

    replyOnHandshakeChannel(
      { ports: [port], source },
      { type: 'RELOAD_APP', timestamp: 1234 },
    );

    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'RELOAD_APP',
      timestamp: 1234,
    });
    // The client is a different channel; the app does not listen there.
    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('falls back to the client when no port was transferred', () => {
    const source = { postMessage: vi.fn() };

    replyOnHandshakeChannel(
      { ports: [], source },
      { type: 'VERSION_CHECKED', swVersion: '26.11.24-9' },
    );

    expect(source.postMessage).toHaveBeenCalledWith({
      type: 'VERSION_CHECKED',
      swVersion: '26.11.24-9',
    });
  });

  it('does nothing when there is neither a port nor a client', () => {
    expect(() =>
      replyOnHandshakeChannel({ ports: [], source: null }, { type: 'RELOAD_APP' }),
    ).not.toThrow();
  });
});
