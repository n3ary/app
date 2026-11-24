/**
 * sw/handshake.ts — the reply channel for the app <-> service worker
 * version handshake.
 *
 * The app asks the worker "is your version newer than mine?" with a
 * MessageChannel port transferred alongside the message:
 *
 *   worker.postMessage({ type: 'CHECK_VERSION', appVersion }, [port2])
 *
 * and listens for the reply on the other end of that channel
 * (`port1.onmessage`). The worker has to answer ON THAT PORT.
 *
 * Replying with `event.source.postMessage(...)` instead delivers the
 * message to the page's `navigator.serviceWorker` 'message' event -- a
 * channel the app never listens on. The RELOAD_APP reply would then
 * never arrive, so the app would detect the new deploy, show "update
 * available", and never actually update itself.
 *
 * Kept as a separate module so it can be unit tested without a browser:
 * the worker's own module has top-level `self.addEventListener` side
 * effects and reads the build-time `__APP_VERSION__` define.
 */

/** A message the worker sends back to the app. */
export interface SwHandshakeReply {
  type: 'RELOAD_APP' | 'VERSION_CHECKED';
  timestamp?: number;
  swVersion?: string;
}

/** The parts of a worker's `message` event this needs. */
export interface SwMessageEventLike {
  /** Ports transferred with the message. The first one is the handshake channel. */
  ports: readonly MessagePort[];
  /** The client that sent the message, if any. */
  source: { postMessage: (message: unknown) => void } | null;
}

/**
 * Send a handshake reply on the channel the app is actually listening on.
 *
 * Uses the transferred port when there is one, and falls back to the
 * client for callers that do not transfer a port.
 */
export function replyOnHandshakeChannel(
  event: SwMessageEventLike,
  reply: SwHandshakeReply,
): void {
  const port = event.ports[0];
  if (port) {
    port.postMessage(reply);
    return;
  }
  event.source?.postMessage(reply);
}
