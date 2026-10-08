<div align="center">

# NovaPulse Edge Map

**An embeddable, keyless, production-grade world map of edge-probe vantage points.**

[![npm version](https://img.shields.io/badge/npm-v1.0.0-22c55e)](https://www.npmjs.com/package/novapulse-edge-map)
[![license](https://img.shields.io/badge/license-MIT-38a169)](LICENSE)
[![size](https://img.shields.io/badge/gzip-~11%20KB-5c7cfa)](dist/)
[![a11y](https://img.shields.io/badge/a11y-Lighthouse%20100-22c55e)](https://developer.chrome.com/docs/lighthouse/accessibility)
[![no key](https://img.shields.io/badge/API%20key-required%3F-no-38a169)](https://www.openstreetmap.org/copyright)

No API key. No credit card. No tracking. No build step required.

</div>

---

A drop-in replacement for the abstract SVG map most status pages ship with. Real
OpenStreetMap geography, pulsing status markers at true coordinates, latency
tooltips, and zoom-aware clustering so dense regions stay tappable.

- **~11 KB gzipped**, zero runtime dependencies beyond Leaflet
- **Works everywhere** — plain `<script>`, npm, React, Vue, Svelte, or `<iframe>`
- **Accessible by default** — Lighthouse 100, keyboard-navigable, screen-reader safe
- **No global state** — any number of independent maps on one page

---

## Table of contents

- [Quick start](#quick-start)
- [Usage](#usage)
  - [1. Auto-init (no JS)](#1-auto-init-no-js)
  - [2. JavaScript API](#2-javascript-api)
  - [3. React](#3-react)
  - [4. Vue](#4-vue)
  - [5. iframe embed](#5-iframe-embed)
  - [6. npm](#6-npm)
- [API](#api)
  - [Options](#options)
  - [Methods](#methods)
  - [Events](#events)
  - [State](#state)
- [Data format](#data-format)
- [Tile sources](#tile-sources)
- [Theming](#theming)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/novapulse-edge-map/dist/novapulse.min.js"></script>

<div data-novapulse-map data-height="420" data-nodes='[
  {"id":"iad","name":"Ashburn","lat":39.0438,"lon":-77.4874,"status":"Operational","latency":12}
]'></div>
```

That's the whole integration. The map mounts itself on `DOMContentLoaded`.

---

## Usage

### 1. Auto-init (no JS)

Add `data-novapulse-map` to any element. Every `data-*` attribute maps to an option,
camelCased and kebab-cased.

```html
<div
  data-novapulse-map
  data-height="440"
  data-zoom="2"
  data-cluster="true"
  data-show-toggle="true"
  data-show-stats="true"
  data-show-table="true"
  data-nodes='[{"id":"iad","name":"Ashburn","lat":39.0438,"lon":-77.4874,"latency":12}]'
></div>
```

| Attribute | Type | Notes |
|---|---|---|
| `data-nodes` | JSON array | Inline node list |
| `data-nodes-url` | URL string | Fetch nodes on init |
| `data-theme` | `dark` \| `light` | Chooses the default tile preset |
| `data-tile` | preset name | See [Tile sources](#tile-sources) |
| `data-tile-url` | URL template | Full override |
| `data-height` | number | Container height in px |
| `data-zoom` | number | Initial zoom |
| `data-refresh` | number | Refresh interval in ms |
| `data-cluster` | boolean | `"false"` disables |
| `data-show-toggle` | boolean | Live-probing switch |
| `data-show-stats` | boolean | Summary cards |
| `data-show-table` | boolean | Sortable node table |
| `data-show-legend` | boolean | Defaults to `true` |
| `data-show-scale` | boolean | Scale bar, defaults to `true` |
| `data-show-hint` | boolean | "scroll to zoom" chip, defaults to `true` |
| `data-scroll-wheel-zoom` | boolean | Defaults to `true` |

### 2. JavaScript API

```js
const map = new NovaPulseMap({
  container: '#probe-map',
  height: 440,
  theme: 'dark',
  nodes: [
    { id: 'iad', name: 'Ashburn', region: 'us-east',
      lat: 39.0438, lon: -77.4874, status: 'Operational', latency: 12 }
  ],
  showStats: true,
  showTable: true,
  onNodeClick(node, map) {
    console.log(node.name, node.status, node.latency + 'ms');
  }
});

// Later
map.setNodes(newNodes);
map.toggleLive();
map.getState();
map.destroy();
```

Works with or without `new` — `NovaPulseMap({...})` returns an instance.

### 3. React

The library owns its own DOM, so a ref is the right integration — not JSX children.

```jsx
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import 'novapulse-edge-map/style.css';
import NovaPulseMap from 'novapulse-edge-map';

export function ProbeMap({ nodes }) {
  const host = useRef(null);

  useEffect(() => {
    const map = new NovaPulseMap({
      container: host.current,
      nodes,
      height: 440,
      showStats: true,
      showTable: true,
    });
    return () => map.destroy();   // essential: clears timers + listeners
  }, []);                          // mount once

  useEffect(() => { mapRef.current?.setNodes(nodes); }, [nodes]);

  return <div ref={host} />;
}
```

> **Do not** put `data-novapulse-map` on the same element React manages. React would
> fight the library over the DOM. Pick one: auto-init **or** the JS API.

### 4. Vue

```vue
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import 'leaflet/dist/leaflet.css';
import 'novapulse-edge-map/style.css';
import NovaPulseMap from 'novapulse-edge-map';

const props = defineProps({ nodes: { type: Array, required: true } });

const host = ref(null);
let map = null;

onMounted(() => {
  map = new NovaPulseMap({ container: host.value, nodes: props.nodes, height: 440 });
});
watch(() => props.nodes, (n) => map?.setNodes(n));
onBeforeUnmount(() => map?.destroy());
</script>

<template><div ref="host" /></template>
```

### 5. iframe embed

For a third-party host, a docs site, or anywhere CSS would collide. Copy
[`examples/embed-widget.html`](examples/embed-widget.html) to your server:

```html
<iframe src="https://your-cdn.example/widget.html" width="100%" height="620"
        title="Edge status" loading="lazy"></iframe>
```

The widget talks to its parent over `postMessage`:

```js
const frame = document.querySelector('iframe');
const send = (msg) => frame.contentWindow.postMessage({ __novaPulse: 1, ...msg }, '*');

send({ type: 'getState' });
send({ type: 'setLive', live: false });
send({ type: 'setNodes', nodes: [...] });
send({ type: 'fit' });
send({ type: 'resize' });

window.addEventListener('message', (ev) => {
  if (ev.data?.__novaPulse === 1 && ev.data.type === 'state') {
    console.log(ev.data.state.status, ev.data.state.counts);
  }
});
```

**Host → widget:** `ping`, `getState`, `setNodes`, `setLive`, `resize`, `fit`
**Widget → host:** `ready`, `state`, `nodes`, `live`

### 6. npm

```bash
npm install novapulse-edge-map leaflet
```

```js
import NovaPulseMap from 'novapulse-edge-map';
import 'novapulse-edge-map/style.css';
import 'leaflet/dist/leaflet.css';
```

Leaflet is a **peer dependency** — we never bundle it, per its licence.

---

## API

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `HTMLElement` \| `string` | *required* | Target element or selector |
| `nodes` | `EdgeNode[]` | `[]` | Initial node list |
| `nodesUrl` | `string` | `null` | Fetch nodes as JSON on init |
| `theme` | `'dark'` \| `'light'` | `'dark'` | Sets the default tile preset |
| `tile` | `TilePreset` | per theme | Named basemap preset |
| `tileUrl` | `string` | `null` | Full tile URL template override |
| `height` | `number` | `420` | Container height in px |
| `zoom` | `number` | `2` | Initial zoom |
| `minZoom` | `number` | `1` | Lower zoom bound |
| `maxZoom` | `number` | `8` | Upper zoom bound |
| `cluster` | `boolean` | `true` | Merge overlapping nodes |
| `clusterRadius` | `number` | `34` | Merge threshold in screen px |
| `live` | `boolean` | `true` | Animate latency jitter |
| `refreshMs` | `number` | `5000` | Refresh interval while live |
| `jitter` | `number` | `0.14` | Jitter as a fraction of latency |
| `showToggle` | `boolean` | `false` | Live-probing switch |
| `showStats` | `boolean` | `false` | Summary cards |
| `showTable` | `boolean` | `false` | Node table |
| `showLegend` | `boolean` | `true` | Status legend |
| `showScale` | `boolean` | `true` | Scale bar |
| `showHint` | `boolean` | `true` | Interaction hint chip |
| `scrollWheelZoom` | `boolean` | `true` | Arms on hover, never traps page scroll |
| `emitStateToParent` | `boolean` | `true` | `postMessage` state when iframed |
| `colors` | `object` | see below | Status colour overrides |
| `onNodeClick` | `function` | `null` | Node click handler |

### Methods

| Method | Returns | Description |
|---|---|---|
| `setNodes(nodes)` | `this` | Replace all nodes |
| `getNodes()` | `EdgeNode[]` | Copy of current nodes |
| `getNode(id)` | `EdgeNode \| null` | One node by id |
| `setLive(on)` | `this` | Pause or resume probing |
| `toggleLive()` | `this` | Flip live state |
| `isLive()` | `boolean` | Current live state |
| `zoomIn()` / `zoomOut()` | `this` | Zoom one step |
| `fit()` | `this` | Re-fit all nodes |
| `setView(latlng, zoom)` | `this` | Jump to a coordinate |
| `getZoom()` | `number` | Current zoom |
| `invalidateSize()` | `this` | Re-measure after a layout change |
| `getState()` | `MapState` | Full serialisable state |
| `destroy()` | `void` | Full teardown |
| `on(event, fn)` | `function` | Subscribe; returns an unsubscribe fn |
| `off(event, fn)` | `void` | Unsubscribe |

Every method is safe to call after `destroy()` — it becomes a no-op rather than throwing.

### Events

```js
const off = map.on('nodeclick', (node) => console.log(node));
off();  // unsubscribe
```

| Event | Payload | Fires when |
|---|---|---|
| `ready` | `MapState` | Construction finished |
| `nodeclick` | `EdgeNode` | A marker is clicked |
| `livechange` | `boolean` | Live state changes |
| `error` | `{ code, url? }` | Tile or fetch failure |
| `destroy` | `null` | Teardown complete |
| `*` | `{ type, detail }` | Any event (catch-all) |

A throwing handler is caught and logged; it never breaks other subscribers.

### State

```js
map.getState();
// {
//   version: '1.0.0',
//   live: true,
//   zoom: 2,
//   nodes: [...],
//   counts: { Operational: 12, Degraded: 1, Down: 1 },
//   status: 'Down',        // worst across all nodes
//   clusters: 2
// }
```

---

## Data format

```ts
interface EdgeNode {
  id?: string;                          // defaults to array index
  name?: string;
  region?: string;                      // small caption in the tooltip
  lat: number;                          // required, −90…90
  lon: number;                          // required, −180…180
  status?: 'Operational' | 'Degraded' | 'Down';
  latency?: number;                     // ms
  ms?: number;                          // alias for latency
}
```

Malformed input is dropped rather than throwing — a bad row can't take the map down:

```js
map.setNodes([
  { id: 'ok',  lat: 39.04, lon: -77.48 },
  { id: 'bad', lat: 'x',   lon: -77.48 },   // dropped
  { id: 'off', lat: 200,   lon: 400 },       // dropped — out of range
  { id: 'null',lat: null,  lon: 5 },         // dropped
]);
map.getNodes().length;   // 1
```

Names and regions are HTML-escaped before reaching a tooltip or the table, so
node names from an untrusted API cannot inject markup.

### Live feed

Point `nodesUrl` at your telemetry endpoint, or poll `setNodes()` yourself.
Return either a bare array or a wrapped object:

```json
{ "generatedAt": "2026-10-08T18:04:11Z", "nodes": [ { "id": "iad", "lat": 39.04, "lon": -77.48, "status": "Operational", "latency": 12 } ] }
```

> Set `live: false` when you supply your own data. Otherwise the built-in jitter
> will overwrite your real latency numbers every 5 seconds.

---

## Tile sources

| Preset | URL | Key needed | Dark by default |
|---|---|---|---|
| `osmDark` *(default)* | `tile.openstreetmap.de` | No | Yes, via CSS filter |
| `osmLight` | `tile.openstreetmap.org` | No | No |
| `cartoDark` | `basemaps.cartocdn.com/dark_all` | **Yes** | Yes |
| `none` | — | No | Renders on the shell background |

### Why the default isn't CartoDB

CartoDB's Dark Matter tiles **now require an API key**. Unauthenticated requests
return a fixed 2,394-byte placeholder reading `API KEY REQUIRED` at every zoom
level — measured across z2–z8 on `a.basemaps.cartocdn.com`, `basemaps.cartocdn.com`
and `dark_nolabels`, all byte-identical.

`osmDark` is therefore the default: it is a real, keyless raster, and the shell
applies `filter: invert(1) hue-rotate(185deg) …` to render it dark. That costs one
CSS filter, no extra request, and no key.

If you obtain a CARTO key:

```js
new NovaPulseMap({ container: '#m', tile: 'cartoDark', tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' });
```

The OSM attribution is always rendered, as their tile usage policy requires.
Attribution may not be removed. Public OSM tile servers expect low-volume,
interactive use; for production traffic, self-host tiles or use a commercial
provider.

---

## Theming

Override CSS custom properties on the host element:

```css
#probe-map {
  --nps-ink:    #0B0F14;   /* map background + tile pane */
  --nps-soft:   #111823;   /* cards, toggle */
  --nps-line:   #243244;   /* borders */
  --nps-fg:     #E2E8F0;   /* primary text */
  --nps-faint:  #9FB0C6;   /* secondary text */
  --nps-radius: 16px;
}
```

Status colours:

```js
new NovaPulseMap({
  container: '#m',
  colors: { Operational: '#00E676', Degraded: '#FFC400', Down: '#FF1744' }
});
```

Tailwind projects can use their palette values directly — the library reads plain
CSS variables, so no config is required.

---

## Accessibility

Verified with Lighthouse **100** on the accessibility audit.

- Markers are keyboard-focusable (`tabindex="0"`, `role="button"`) with real names
- Tooltips are readable by assistive tech; the table mirrors all data as a real `<table>`
- Live toggle uses `role="switch"` with a live `aria-checked`
- Attribution and controls meet WCAG AA contrast (≥4.5:1)
- Interactive targets are ≥24×24px
- `prefers-reduced-motion` disables the entrance animation and all pulses
- `prefers-contrast: more` thickens tooltip borders

---

## Performance

| | |
|---|---|
| Bundle | 33 KB raw, ~11 KB gzipped |
| Dependencies | Leaflet only (peer) |
| Clustering | Built in, ~35 lines — no markercluster plugin |
| DOM nodes | One marker per visible node; clusters merge the rest |

Clustering matters more than it sounds. At world zoom, Ashburn and New York sit
**11 px** apart and London and Amsterdam **15 px** — overlapping into a single
unusable tap target that also fails WCAG 2.5.8. The library groups nodes closer than
`clusterRadius` into one marker at their centroid, and splits them apart as soon as
zoom separates them. Turning clustering off will reintroduce the overlap.

---

## Troubleshooting

**Blank map, no tiles**
Check the console for `error` events. Common causes: Leaflet loaded after this
library, or a Content-Security-Policy blocking tile hosts.

**Markers stuck at the top-left corner**
A zero-height container. Give the element a height — via the `height` option or
`--nps-height`. Never set `height` on the host with `position: absolute` children.

**Map clipped or unreachable edges**
Raise `minZoom` *down*, not up. `fitBounds` clamps at `minZoom`, so a container too
small to fit every node at z2 needs z1.

**React "NotFoundError: removeChild"**
Two libraries are managing the same node. Remove `data-novapulse-map` from any
element React renders, and call `destroy()` in the effect cleanup.

**Auto-init found nothing**
Auto-init runs on `DOMContentLoaded`. In a non-deferred inline script, wait for that
event before touching `element.__npsInstance`.

**Jitter overwrites my real data**
Set `live: false`.

---

## Contributing

```bash
git clone https://github.com/your-org/novapulse-edge-map.git
cd novapulse-edge-map

npm test          # 40 assertions, no browser needed
npm run build     # regenerate dist/
npm run serve     # dev server + simulated /api/probes.json
```

Then open <http://127.0.0.1:5173/examples/01-auto-init.html>.

The project has **zero runtime and zero dev dependencies** — by design. Please keep
it that way; a status-page widget should never drag a toolchain along.

---

## License

MIT © NovaPulse Labs

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors,
available under the [ODbL](https://opendatacommons.org/licenses/odbl/). Tiles are
served by third parties under their own terms.

[`leaflet`](https://leafletjs.com) is BSD-2-Clause and is a peer dependency, not
bundled.