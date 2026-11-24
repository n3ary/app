/*
 * pwa-update.spec.ts — regression test for "the app never updates itself".
 *
 * THE BUG
 * -------
 * Two independent breaks meant the app could detect a new deploy but
 * never apply it:
 *
 * 1. The handshake was triggered by a one-shot `if (!reg?.waiting) return;`
 *    check that ran immediately after `navigator.serviceWorker.register()`
 *    resolved. `register()` resolves as soon as the registration exists,
 *    but the browser's update algorithm (fetch the script, compare bytes,
 *    install the new worker) runs in the background, and
 *    `registration.waiting` is only set once the new worker reaches the
 *    `installed` state. The check almost always saw null and bailed out.
 *    The new worker then installed, parked itself in `waiting` (the app's
 *    SW deliberately does not call skipWaiting), and nothing ever asked it
 *    to compare versions.
 *
 * 2. The worker replied to `event.source` instead of to the MessageChannel
 *    port the app transferred with the request. The app listens on the
 *    port, so the RELOAD_APP reply never arrived. (That one is covered by
 *    the unit test in src/lib/sw/handshake.test.ts.)
 *
 * THE TEST
 * --------
 * A worker double is served at /service-worker.js that:
 *   - takes 5 s to finish installing, so it is still `installing` when the
 *     app's register() call resolves -- exactly the window in which the
 *     old code looked at `reg.waiting` and gave up;
 *   - never calls skipWaiting, so it parks in `waiting` behind the active
 *     worker (the real app SW does the same);
 *   - answers CHECK_VERSION with RELOAD_APP on the transferred port,
 *     exactly like the fixed worker does when the versions differ.
 *
 * The app then reloads with the `__sw_reload` param. That param is only
 * ever set by the reload path, so its presence in the URL is proof that
 * the handshake went all the way through.
 *
 * The double answers RELOAD_APP only once, so the post-reload app (which
 * asks again) does not loop.
 *
 * WHY A TEST-OWNED SERVER
 * -----------------------
 * The double has to be a genuinely served script. Playwright's
 * `context.route` cannot be used: routing the SW script makes Chromium
 * discard the registration entirely (verified -- the registration list
 * comes back empty). And `vite preview` serves the build from an in-memory
 * cache, so rewriting `build/service-worker.js` on disk does not change
 * what is served. So the test starts its own static server that reads
 * from disk on every request.
 *
 * Run: `pnpm run build && pnpm exec playwright test tests/pwa-update.spec.ts`
 */

import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const BUILD_DIR = resolve(process.cwd(), 'build');
const SW_PATH = join(BUILD_DIR, 'service-worker.js');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

/** The worker double. Parks in `waiting` and answers the handshake. */
const WAITING_WORKER = `
const INSTALL_DELAY_MS = 5000;
let replied = false;

self.addEventListener('install', (event) => {
  // No skipWaiting: the worker parks in 'waiting' behind the active one.
  event.waitUntil(new Promise((resolve) => setTimeout(resolve, INSTALL_DELAY_MS)));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_VERSION' && !replied) {
    replied = true;
    const msg = { type: 'RELOAD_APP', timestamp: Date.now() };
    // Reply on the transferred port, like the fixed worker does.
    const port = event.ports[0];
    if (port) port.postMessage(msg);
    else event.source?.postMessage(msg);
  }
});
`;

/** Static file server over the build directory. Reads from disk on every
 *  request (no in-memory cache), so a test can swap a file mid-run. */
async function startStaticServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
      let file = join(BUILD_DIR, safe);
      try {
        const info = await stat(file);
        if (info.isDirectory()) file = join(file, 'index.html');
      } catch {
        // SPA fallback: any unknown path serves the app shell.
        file = join(BUILD_DIR, 'index.html');
      }
      try {
        const body = await readFile(file);
        const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': type,
          // The service worker script must never be cached by the browser,
          // and the shell must always be revalidated.
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    })();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

test.describe('pwa update activation', () => {
  let server: { url: string; close: () => Promise<void> };
  let realSw: Buffer;

  test.beforeAll(async () => {
    realSw = await readFile(SW_PATH);
    server = await startStaticServer();
  });

  test.afterAll(async () => {
    await writeFile(SW_PATH, realSw);
    await server.close();
  });

  test('the app handshakes with a worker that parks in waiting after registration', async ({
    page,
  }) => {
    // The real worker is in place for the first load, so it installs and
    // becomes the ACTIVE worker. Without an active worker a new worker
    // activates straight away instead of parking in `waiting`, and there
    // would be no race to reproduce.
    await page.goto(`${server.url}/`);
    await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return Boolean(reg?.active);
      },
      null,
      { timeout: 15_000 },
    );
    // Let the worker settle: a navigation that happens in the same tick
    // as the worker's activation is not controlled by it, and Chrome only
    // runs the service worker update check for controlled clients.
    await page.waitForTimeout(1500);

    // Swap in the double. On the next navigation the browser fetches the
    // script, sees different bytes, and installs it -- and that install
    // takes 5 s, so it is still installing when the app registers.
    await writeFile(SW_PATH, WAITING_WORKER);

    await page.goto(`${server.url}/`);

    // The handshake must reach the waiting worker even though it was not
    // yet waiting when register() resolved. The worker answers RELOAD_APP
    // and the app reloads with the `__sw_reload` param.
    await page.waitForURL(/__sw_reload=/, { timeout: 30_000 });
  });
});
