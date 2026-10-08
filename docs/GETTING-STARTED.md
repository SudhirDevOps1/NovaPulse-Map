# Getting started

Everything you need to put this on a page in under ten minutes, plus an honest
account of when you should *not* use it.

---

## What this actually is

A single-file JavaScript library that renders a world map of your edge-probe
vantage points on OpenStreetMap tiles. Nodes sit at their real coordinates,
pulse with their current status, and show latency on hover.

It is **not** a monitoring tool. It does not probe anything. It renders data you
already have - from your own probe fleet, a status API, or a static JSON file.

```
your probes --> your JSON endpoint --> NovaPulseMap --> map + table
```

---

## When to use it

Good fit:

- A public status page that needs a map rather than a list
- A docs page showing where your infrastructure lives
- An internal NOC view with several maps side by side
- A customer-facing "is it me or the network?" widget

Poor fit:

- **Live-fire geographic routing.** This is a status renderer, not a traceroute
  visualiser. There is no path display.
- **Thousands of nodes.** `setNodes()` rebuilds every marker. Tens of nodes is
  comfortable; thousands needs a diffing layer.
- **You need a true dark basemap for free.** The default raster is a light OSM
  tile tinted dark with a CSS filter. It looks good; it is not a purpose-built
  dark basemap. See [Tile sources](#tile-sources).

---

## Install

### As a script tag

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<div id="map" style="height:420px"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/novapulse-edge-map/dist/novapulse.min.js"></script>
<script>
  new NovaPulseMap({ container: '#map', nodes: [] });
</script>
```

### As a package

```bash
npm install novapulse-edge-map leaflet
```

Leaflet is a **peer dependency**. It is never bundled - that is both a licence
requirement and a payload decision.

---

## First render

The smallest useful configuration is a container and some nodes:

```js
const map = new NovaPulseMap({
  container: '#map',
  height: 420,
  nodes: [
    { id: 'iad', name: 'Ashburn', region: 'us-east',
      lat: 39.0438, lon: -77.4874, status: 'Operational', latency: 12 },
    { id: 'nrt', name: 'Tokyo', region: 'apac',
      lat: 35.6762, lon: 139.6503, status: 'Operational', latency: 204 }
  ]
});
```

Open the page. Two pulsing markers appear, tiles load, and hovering either one
shows name, latency and status.

### The one thing that will bite you

**Give the container a height.** Leaflet measures its container at
construction. A zero-height container produces a map with every marker parked
off-screen at `-17000px`, and no error.

```html
<!-- correct -->
<div id="map" style="height:420px"></div>

<!-- wrong: renders nothing -->
<div id="map"></div>
```

---

## Load real data

### Option A - static JSON (simplest)

Write `data/probes.json` next to your page and point at it. No server needed,
works on any static host including GitHub Pages.

```html
<div data-novapulse-map data-nodes-url="data/probes.json"></div>
```

```json
[
  { "id": "iad", "name": "Ashburn", "lat": 39.0438, "lon": -77.4874,
    "status": "Operational", "latency": 12 }
]
```

### Option B - poll your own endpoint

```js
const map = new NovaPulseMap({
  container: '#map',
  live: false,              // important: see below
  refreshMs: 5000,
  refreshBackoff: true
});

map.startPolling('/api/probes');
```

> **Set `live: false` when you supply your own data.** `live: true` animates a
> synthetic jitter to make the demo look alive. Against a real feed it will
> overwrite your actual latency numbers every tick.

### Option C - you push the data

If something else already knows your status - a WebSocket, SSE, or a mutation
observer - skip polling entirely:

```js
map.setNodes(nextNodes);
```

`setNodes` is idempotent and cheap at status-page scale.

---

## The data contract

```ts
interface EdgeNode {
  id?: string;        // stable; falls back to array index
  name?: string;
  region?: string;    // small caption in the tooltip
  country?: string;   // widens search
  provider?: string;  // widens search
  lat: number;        // required, -90..90
  lon: number;        // required, -180..180
  status?: 'Operational' | 'Degraded' | 'Down';
  latency?: number;   // ms
  ms?: number;        // alias
  uptime?: number;    // 0-100
  note?: string;
}
```

### Three rules that prevent most bugs

**1. Omitted `latency` means unknown, not zero.**

```js
{ id: 'iad', lat: 39.04, lon: -77.49 }             // renders "-", excluded from p95
{ id: 'iad', lat: 39.04, lon: -77.49, latency: 0 } // a real 0 ms reading
```

A fabricated zero is worse than a gap: it drags your p95 down and makes a dead
probe look like the fastest node on the map.

**2. Coordinates outside range are dropped, not clamped.**

`lat: 200` is dropped. It does not become `lat: 90` and silently pin your node to
the pole.

**3. Unknown statuses fall back to `Operational`.**

A typo becomes green, not undefined. Check your source strings.

Bad input never throws - a malformed row is skipped so it cannot take the map
down mid-incident.

---

## Turn on the useful parts

Everything beyond the bare map is opt-in:

```js
new NovaPulseMap({
  container: '#map',

  showControls: true,     // search + filters + theme + export
  showSparklines: true,   // per-node SVG sparkline + p95 column
  showTrend: true,        // latency direction vs prior samples
  showUptime: true,       // uptime column
  sortableTable: true,    // click / Tab+Enter to sort
  deepLink: true,         // #node-id in the URL focuses a node
  persistKey: 'my-status' // survive a reload via localStorage
});
```

---

## React to incidents

```js
map.on('statuschange', ({ name, from, to }) => {
  if (to === 'Down') pageOnCall(name);
});

map.on('recovered', ({ name }) => {
  notify(`#ops ${name} is back`);
});
```

`statuschange` fires **once per real transition**, not on every poll. A no-op
`setNodes()` emits nothing, so you will not get paged for a heartbeat.

---

## Clean up

```js
map.destroy();
```

Removes the interval, the `ResizeObserver`, the `postMessage` listener and the
Leaflet instance. Call it on unmount in React/Vue or the interval keeps running
against a detached DOM.

Mounting twice on the same container is safe - the constructor disposes the
previous instance automatically.

---

## Tile sources

| Preset | Key needed | Appearance |
|---|---|---|
| `osmDark` *(default)* | No | Dark, via CSS invert filter |
| `osmLight` | No | Native OSM light |
| `cartoDark` | **Yes** | True dark basemap |
| `none` | No | No network at all |

```js
new NovaPulseMap({ container: '#m', tile: 'osmLight' });
```

> **CartoDB Dark Matter now requires an API key.** Unauthenticated requests
> return a fixed 2,394-byte `API KEY REQUIRED` placeholder at every zoom level
> - verified across z2-z8. The `cartoDark` preset stays available for users who
> hold a key.

The default German OSM mirror suits a status page. It is a community server, so
for real production traffic, self-host tiles or use a commercial provider.

---

## Next steps

- [ADVANCED.md](ADVANCED.md) - every feature in depth, plus known limitations
- [DEPLOY.md](DEPLOY.md) - Pages, unpkg, Vercel, nginx, CSP headers, CI
- [FILE-MAP.md](FILE-MAP.md) - what every file in this repo is for
- `examples/01-auto-init.html` ... `05-advanced.html` - working code