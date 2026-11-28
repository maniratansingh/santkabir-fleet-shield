// Local preview against the real production API.
//
// Serves the current `dist` build and proxies /api/* plus /api/ws to
// https://fleet.mrps.in, so the UI runs on real fleet and history data.
//
// Read-only by design: only safe methods are proxied. The history login and
// logout POSTs are allowed so you can authenticate locally; every write
// endpoint (track, remove, clear, history/delete) is blocked.
//
// Usage: npm run build && node scripts/preview-real.mjs [port]

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 4173);
const TARGET = 'fleet.mrps.in';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function cleanCookie(value) {
  return String(value)
    .replace(/;\s*Secure/gi, '')
    .replace(/;\s*Domain=[^;]+/gi, '');
}

// The real history cookie is HttpOnly + Secure. Browsers may reject it on
// http://localhost, so keep the session here and inject it upstream. The
// browser copy is still passed through for normal same-origin behaviour.
let previewSession = '';

function sessionFromSetCookie(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean);
  for (const cookie of list) {
    const match = /history_session=([^;]+)/.exec(String(cookie));
    if (match) return decodeURIComponent(match[1]);
  }
  return '';
}

function isAllowed(method, url) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  // Authentication and board management must reach the real store.
  return m === 'POST' && (
    url.startsWith('/api/history/login') ||
    url.startsWith('/api/history/logout') ||
    url.startsWith('/api/board/login') ||
    url.startsWith('/api/board/devices') ||
    url.startsWith('/api/board/revoke') ||
    url.startsWith('/api/board/share')
  );
}

function proxyApi(req, res) {
  if (!isAllowed(req.method, req.url)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Local preview is read-only',
      detail: 'Write endpoints are blocked so the real fleet cannot be modified from localhost.',
      path: req.url,
    }));
    return;
  }

  const headers = { ...req.headers, host: TARGET };
  delete headers['accept-encoding'];
  headers['accept-encoding'] = 'identity';
  if (previewSession) {
    const existing = String(req.headers.cookie || '');
    headers.cookie = /history_session=/.test(existing)
      ? existing
      : `${existing ? `${existing}; ` : ''}history_session=${encodeURIComponent(previewSession)}`;
  }

  const upstream = https.request(
    { hostname: TARGET, port: 443, path: req.url, method: req.method, headers },
    (upstreamRes) => {
      const out = { ...upstreamRes.headers };
      if (out['set-cookie']) {
        out['set-cookie'] = out['set-cookie'].map(cleanCookie);
        const session = sessionFromSetCookie(out['set-cookie']);
        if (session) previewSession = session;
      }
      if (req.url.startsWith('/api/history/logout')) previewSession = '';
      // Never let the browser cache a proxied API response.
      out['cache-control'] = 'no-store';
      res.writeHead(upstreamRes.statusCode || 502, out);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Upstream unreachable', detail: error.message }));
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  if (pathname === '/history' || pathname === '/history/') pathname = '/history.html';
  if (pathname === '/history-demo' || pathname === '/history-demo/') pathname = '/history-demo.html';

  const filePath = path.join(DIST, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found: ${pathname}`);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (
    req.url.startsWith('/api/') ||
    req.url === '/login' ||
    req.url.startsWith('/login?') ||
    req.url.startsWith('/d/') ||
    req.url.startsWith('/s/')
  ) {
    proxyApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/api/ws')) {
    socket.destroy();
    return;
  }
  const headers = { ...req.headers, host: TARGET };
  const upstream = https.request({
    hostname: TARGET,
    port: 443,
    path: req.url,
    method: 'GET',
    headers,
  });

  upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
    const lines = Object.entries(upstreamRes.headers).map(([key, value]) => `${key}: ${value}`);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
    if (upstreamHead?.length) socket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
    upstreamSocket.on('error', () => socket.destroy());
    socket.on('error', () => upstreamSocket.destroy());
  });

  upstream.on('error', () => socket.destroy());
  upstream.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local preview with real data: http://127.0.0.1:${PORT}`);
  console.log(`  live board : http://127.0.0.1:${PORT}/`);
  console.log(`  history    : http://127.0.0.1:${PORT}/history`);
  console.log(`  upstream   : https://${TARGET}`);
  console.log('  write endpoints are blocked; history login/logout are allowed');
});
