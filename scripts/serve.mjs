#!/usr/bin/env node
/**
 * Zero-dependency dev server for the examples.
 *
 * Serves the repo root and exposes a simulated telemetry endpoint at
 * /api/probes.json so examples/04-live-feed.html works offline.
 *
 *   node scripts/serve.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

/* Toggleable behaviours, driven by the advanced example via /api/flags.
   Doing it server-side keeps the example honest: the page receives the
   same JSON any real feed would return. */
const flags = { outage: false, jitter: false, broken: false };

/* Simulated vantage points with a drifting baseline so the feed looks live. */
const NODES = [
  { id:'iad', name:'Ashburn',      region:'us-east',    lat: 39.0438, lon: -77.4874, base: 12 },
  { id:'ewr', name:'New York',     region:'us-east',    lat: 40.7128, lon: -74.0060, base: 18 },
  { id:'ord', name:'Chicago',      region:'us-central', lat: 41.8781, lon: -87.6298, base: 24 },
  { id:'dfw', name:'Dallas',       region:'us-central', lat: 32.7767, lon: -96.7970, base: 31 },
  { id:'sjc', name:'San Jose',     region:'us-west',    lat: 37.3541, lon:-121.9552, base: 42 },
  { id:'lhr', name:'London',       region:'eu-west',    lat: 51.5074, lon:  -0.1278, base: 78 },
  { id:'fra', name:'Frankfurt',    region:'eu-central', lat: 50.1109, lon:   8.6821, base: 84 },
  { id:'ams', name:'Amsterdam',    region:'eu-west',    lat: 52.3676, lon:   4.9041, base: 86 },
  { id:'dxb', name:'Dubai',        region:'me',         lat: 25.2048, lon:  55.2708, base:121 },
  { id:'bom', name:'Mumbai',       region:'apac',       lat: 19.0760, lon:  72.8777, base:148 },
  { id:'gru', name:'São Paulo',    region:'sa',         lat:-23.5505, lon: -46.6333, base:156 },
  { id:'sin', name:'Singapore',    region:'apac',       lat:  1.3521, lon: 103.8198, base:186 },
  { id:'nrt', name:'Tokyo',        region:'apac',       lat: 35.6762, lon: 139.6503, base:204 },
  { id:'syd', name:'Sydney',       region:'apac',       lat:-33.8688, lon: 151.2093, base:238 }
];

function payload() {
  return {
    generatedAt: new Date().toISOString(),
    nodes: NODES.map((n) => {
      let down = n.id === 'gru';
      let degraded = n.id === 'bom';

      /* Forced outage knocks out a third of the fleet, which is what a
         real regional failure looks like on a status page. */
      if (flags.outage && i3(n.id)) { down = true; degraded = false; }
      if (flags.outage && i3b(n.id)) { degraded = true; down = false; }

      /* Spread widens under "extra jitter" so the sparklines visibly react. */
      const spread = flags.jitter ? 0.48 : 0.24;
      const jitter = Math.round(n.base * (Math.random() * spread - spread / 2));

      return {
        id: n.id, name: n.name, region: n.region, lat: n.lat, lon: n.lon,
        status: down ? 'Down' : degraded ? 'Degraded' : 'Operational',
        latency: down ? 0 : Math.max(1, n.base + jitter),
        /* Optional fields the library carries straight through. */
        uptime: down ? 97.4 + Math.random() : 99.9 + Math.random() * 0.09,
        note: down ? 'Probe timeout — no response in 30s' : ''
      };
    })
  };
}

/* Deterministic subset by id, so repeated polls flip a stable set of
   nodes rather than a random one each time. */
function i3(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 3 === 0;
}
function i3b(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 5 === 0;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/probes.json') {
      /* Lets the advanced example demonstrate backoff: a 503 is a real
         failure, which is what makes the retry logic meaningful. */
      if (flags.broken) {
        res.writeHead(503, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: 'probe collector unavailable' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(payload()));
      return;
    }

    if (url.pathname === '/api/flags') {
      for (const key of ['outage', 'jitter', 'broken']) {
        const v = url.searchParams.get(key);
        if (v === '1' || v === '0') flags[key] = v === '1';
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify(flags));
      return;
    }

    if (url.pathname === '/api/reset') {
      flags.outage = flags.jitter = flags.broken = false;
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }).end();
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/examples/01-auto-init.html';

    /* Contain every request inside the repo root. */
    const target = normalize(join(root, pathname));
    if (!target.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(target).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + pathname);
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Server error: ' + err.message);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  NovaPulse Edge Map — dev server`);
  console.log(`  http://127.0.0.1:${PORT}/`);
  console.log(`  http://127.0.0.1:${PORT}/examples/01-auto-init.html`);
  console.log(`  http://127.0.0.1:${PORT}/examples/02-js-api.html`);
  console.log(`  http://127.0.0.1:${PORT}/examples/03-iframe-host.html`);
  console.log(`  http://127.0.0.1:${PORT}/examples/04-live-feed.html`);
  console.log(`  http://127.0.0.1:${PORT}/examples/05-advanced.html`);
  console.log(`\n  simulated feed: /api/probes.json`);
  console.log(`  toggle flags  : /api/flags?outage=1&jitter=1&broken=1`);
  console.log(`  reset flags   : /api/reset\n`);
});