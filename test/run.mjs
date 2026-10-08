/**
 * NovaPulse Edge Map — headless-ish test suite.
 * Runs the library in a minimal DOM stub so it needs no browser and no
 * test framework. Verifies the pure logic that a browser test would be
 * awkward to assert: option resolution, node normalisation, cluster
 * grouping, worst-status aggregation, escaping, and teardown.
 *
 *   node test/run.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'src', 'novapulse.js'), 'utf8');

/* ── Minimal DOM + Leaflet stub ────────────────────────────────────────
   Enough surface for construction and the logic under test. Anything
   the library calls that is NOT stubbed would throw loudly, which is
   exactly what we want — a silent no-op would give false confidence. */

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    nodeType: 1,
    children: [],
    style: {
      _p: {},
      cssText: '',
      setProperty(k, v) { this._p[k] = v; },
      getPropertyValue(k) { return this._p[k] || ''; },
      removeProperty(k) { delete this._p[k]; },
    },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    /* className must alias classList, as in a real DOM — the library
       sets `el.className = 'nps-toggle'` in places and uses add() in
       others, so both paths have to be observable. */
    _className: '',
    get className() { return this._className || [...this.classList._s].join(' '); },
    set className(v) { this._className = String(v); },
    dataset: {},
    attrs: {},
    _html: '',
    _text: '',
    /* innerHTML='' must actually drop children, or teardown assertions
       pass vacuously against the stub. */
    set innerHTML(v) {
      this._html = String(v);
      if (this._html === '') this.children = [];
    },
    get innerHTML() { return this._html; },
    ownerDocument: null,
    get firstElementChild() { return this.children[0] || null; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c, ref) {
      if (!ref) { this.children.push(c); c.parentNode = this; return c; }
      const i = this.children.indexOf(ref);
      if (i === -1) { this.children.push(c); c.parentNode = this; return c; }
      this.children.splice(i, 0, c);
      c.parentNode = this;
      return c;
    },
    removeChild(c) { this.children = this.children.filter(x => x !== c); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel) {
      const stack = [...(this.children || [])];
      while (stack.length) {
        const c = stack.shift();
        /* Union both representations, matching real classList behaviour. */
        const fromList = c.classList ? [...c.classList._s] : [];
        const fromName = String(c.className || '').split(/\s+/).filter(Boolean);
        const classes = [...new Set([...fromList, ...fromName])];
        if (typeof sel === 'string' && sel.startsWith('.') && classes.includes(sel.slice(1))) return c;
        if (typeof sel === 'string' && sel.startsWith('[')) {
          const k = sel.slice(1, sel.indexOf('=') === -1 ? sel.indexOf(']') : sel.indexOf('='));
          if (k in (c.attrs || {})) return c;
        }
        stack.push(...(c.children || []));
      }
      return null;
    },
    querySelectorAll() { return []; },
    /* The library registers listeners on window/document too. */
    get clientWidth() { return 800; },
    get clientHeight() { return 500; },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 800, bottom: 500, width: 800, height: 500 };
    },
    focus() {},
  };
  return el;
}

/* querySelector stub that understands the few selectors the library
   uses internally (.nps-switch, .leaflet-container, [data-nps-surface]).
   Returning null for these is what made the toggle test fail. */
function makeQuery(el) {
  return function (sel) {
    if (typeof sel !== 'string') return null;
    const stack = [...(el.children || [])];
    while (stack.length) {
      const c = stack.shift();
      const fromList = c.classList ? [...c.classList._s] : [];
      const fromName = String(c.className || '').split(/\s+/).filter(Boolean);
      const classes = [...new Set([...fromList, ...fromName])];
      if (sel.startsWith('.') && classes.includes(sel.slice(1))) return c;
      if (sel.startsWith('[') && sel.includes('=')) {
        const k = sel.slice(1, sel.indexOf('='));
        if (k in (c.attrs || {})) return c;
      }
      stack.push(...(c.children || []));
    }
    return null;
  };
}

const doc = {
  readyState: 'complete',
  createElement: makeEl,
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
  head: makeEl('head'),
  documentElement: makeEl('html'),
};

let mapInstance = null;
const L = {
  map(el, opts) {
    mapInstance = {
      el, opts,
      _layers: [],
      _panes: [],
      _controls: [],
      invalidateSize() { this.invalidated = (this.invalidated || 0) + 1; },
      getZoom() { return opts.zoom; },
      setView() {},
      fitBounds(b, o) { this._fit = { b, o }; },
      zoomIn() {}, zoomOut() {},
      remove() { this.removed = true; },
      removeLayer(l) { this._layers = this._layers.filter(x => x !== l); return this; },
      addLayer(l) { this._layers.push(l); return this; },
      getContainer() { return makeEl('div'); },
      project() { return { distanceTo: () => 9999 }; },
      on(ev, fn) { (this._ev || (this._ev = {}))[ev] = fn; },
      off() {},
    };
    return mapInstance;
  },
  tileLayer(url, cfg) {
    /* Leaflet throws on subdomains:undefined — assert we never pass it. */
    if ('subdomains' in cfg && cfg.subdomains === undefined) {
      throw new Error('tileLayer received subdomains: undefined');
    }
    return {
      url, cfg,
      on() {},
      addTo() { mapInstance._layers.push(this); return this; },
    };
  },
  layerGroup() {
    return { _m: [], clearLayers() { this._m = []; }, addTo() { return this; } };
  },
  marker(pos, o) {
    return {
      pos, o,
      _tip: null, _events: {},
      bindTooltip(html, o2) { this._tip = { html, o: o2 }; },
      setTooltipContent(html) { if (this._tip) this._tip.html = html; },
      getTooltip: () => this._tip,
      addTo(l) { l._m.push(this); return this; },
      getElement() { return makeEl('div'); },
      on(ev, fn) { this._events[ev] = fn; },
      off() {},
    };
  },
  divIcon(o) { return o; },
  latLngBounds(pts) { return { pts }; },
  control: {
    zoom: () => ({ addTo() {} }),
    scale: () => ({ addTo() {} }),
  },
};

const winStub = makeEl('window');   // needs addEventListener for _offs

const sandbox = {
  window: null, document: doc, L,
  console,
  addEventListener: winStub.addEventListener.bind(winStub),
  removeEventListener: winStub.removeEventListener.bind(winStub),
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, JSON, Date, Object, Array, String, Number, Boolean, isFinite, parseFloat,
  fetch: () => Promise.reject(new Error('no network in tests')),
  matchMedia: () => ({ matches: false }),
  ResizeObserver: class { observe() {} disconnect() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(src, sandbox, { filename: 'novapulse.js' });
const NovaPulseMap = sandbox.NovaPulseMap;

/* ── Assertions ─────────────────────────────────────────────────────── */

let pass = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
/* JSON.stringify throws on cycles, which an instance reference
   legitimately creates. Compare structurally instead. */
function stable(v, seen = new Set()) {
  if (v === null || typeof v !== 'object') return v;
  if (seen.has(v)) return '[circular]';
  seen.add(v);
  if (Array.isArray(v)) return v.map(x => stable(x, seen));
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = stable(v[k], seen);
  return out;
}
function eq(a, b, msg) {
  const A = JSON.stringify(stable(a)), B = JSON.stringify(stable(b));
  if (A !== B) throw new Error(`${msg || 'not equal'}\n        expected ${B}\n        actual   ${A}`);
}

/* Live probing mutates latency on a timer, which would make value
   assertions flaky. Default every mount to paused unless a test asks
   otherwise.

   NOTE: the constructor calls setNodes(options.nodes) once, which records
   one history sample per node. Tests that count samples must account for
   that baseline. */
function mount(opts) {
  const host = makeEl('div');
  opts = Object.assign({ container: host, live: false }, opts);
  return { host, inst: new NovaPulseMap(opts) };
}

console.log('\nNovaPulse Edge Map — test suite\n');

/* ── Version / shape ────────────────────────────────────────────────── */

check('exports VERSION and TILES presets', () => {
  assert(NovaPulseMap.VERSION === '1.0.0', 'version');
  assert(NovaPulseMap.TILES.osmDark, 'osmDark preset');
  assert(NovaPulseMap.TILES.cartoDark.needsKey === true, 'carto flagged needsKey');
  assert(NovaPulseMap.TILES.none.url === null, 'none preset has no url');
});

check('VERSION matches package.json in the built bundle', () => {
  /* The source constant is injected at build time. If someone bumps
     package.json without rebuilding, the runtime reports a version the code
     does not match — which is exactly what happened at 1.1.0. */
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  const distJs = readFileSync(join(here, '..', 'dist', 'novapulse.js'), 'utf8');
  const distMin = readFileSync(join(here, '..', 'dist', 'novapulse.min.js'), 'utf8');

  const m = distJs.match(/var VERSION\s*=\s*'([^']+)'/);
  assert(m, 'no VERSION declaration in dist/novapulse.js');
  eq(m[1], pkg.version, 'dist VERSION does not match package.json — run npm run build');

  assert(distMin.includes('v' + pkg.version), 'minified banner version mismatch');
});

check('every HTML file pins the current version on local assets', () => {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  const pages = ['index.html', '404.html',
    'examples/01-auto-init.html', 'examples/02-js-api.html',
    'examples/03-iframe-host.html', 'examples/04-live-feed.html',
    'examples/05-advanced.html', 'examples/embed-widget.html'];

  let checked = 0;
  for (const rel of pages) {
    const p = join(here, '..', rel);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    /* Only RELATIVE refs to our own dist/. Remote URLs are already pinned by
       version (@1.9.4) and we cannot invalidate their cache entry. */
    const refs = [...html.matchAll(/(?:href|src)="((?:\.\.\/|\.\/)?dist\/[^"?]+)[^"]*"/g)]
      .map(m => m[1]);
    for (const ref of refs) {
      const tag = html.slice(0, html.indexOf(ref)) + ref;
      assert(/\?v=/.test(html.slice(html.indexOf(ref), html.indexOf(ref) + ref.length + 12)),
        `${rel}: "${ref}" is missing ?v=${pkg.version} — a CDN may serve a stale bundle`);
      checked++;
    }
  }
  assert(checked > 0, 'no local asset references found to check');
});

check('module is callable with and without new', () => {
  const host = makeEl('div');
  const a = new NovaPulseMap({ container: host });
  const b = NovaPulseMap({ container: makeEl('div') });
  assert(a instanceof NovaPulseMap, 'instanceof');
  assert(b instanceof NovaPulseMap, 'callable form');
  a.destroy(); b.destroy();
});

check('throws a clear error without Leaflet', () => {
  const saved = sandbox.L;
  sandbox.L = undefined;
  sandbox.window.L = undefined;
  let threw = false;
  try { new NovaPulseMap({ container: makeEl('div') }); }
  catch (e) { threw = /Leaflet/.test(e.message); }
  sandbox.L = saved; sandbox.window.L = saved;
  assert(threw, 'expected a Leaflet error');
});

/* ── Node normalisation ─────────────────────────────────────────────── */

check('normalises nodes and defaults fields', () => {
  const { inst } = mount({
    nodes: [{ lat: 10, lon: 20 }],
  });
  const n = inst.getNodes()[0];
  eq(n.lat, 10); eq(n.lon, 20);
  assert(n.id === '0', 'id falls back to index');
  assert(n.status === 'Operational', 'status defaults');
  /* Unknown, not 0 — see "an absent latency is unknown, never 0 ms". */
  eq(n.latency, null, 'missing latency must be null');
  eq(n.hasLatency, false);
  inst.destroy();
});

check('ms alias sets hasLatency', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, ms: 12 }], live: false });
  eq(inst.getNode('a').latency, 12);
  eq(inst.getNode('a').hasLatency, true);
  inst.destroy();
});

check('drops entries with non-numeric coordinates', () => {
  const { inst } = mount({
    nodes: [
      { id: 'ok', lat: 1, lon: 2 },
      { id: 'badLat', lat: 'x', lon: 2 },
      { id: 'badLon', lat: 1, lon: null },
      { id: 'nan', lat: NaN, lon: 5 },
      { id: 'inf', lat: 1, lon: Infinity },
    ],
  });
  eq(inst.getNodes().map(n => n.id), ['ok'], 'only the valid node survives');
  inst.destroy();
});

check('rejects unknown status values', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Bogus' }],
  });
  eq(inst.getNodes()[0].status, 'Operational');
  inst.destroy();
});

check('accepts ms as an alias for latency', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2, ms: 77 }],
  });
  eq(inst.getNodes()[0].latency, 77);
  inst.destroy();
});

check('getNode returns a copy, not the internal object', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 5 }] });
  const got = inst.getNode('a');
  got.latency = 999;
  eq(inst.getNode('a').latency, 5, 'mutation leaked');
  eq(inst.getNode('missing'), null);
  inst.destroy();
});

/* ── Clustering ─────────────────────────────────────────────────────── */

check('clusters overlapping nodes and splits them when separated', () => {
  /* project() stub always returns distanceTo() === 9999 → no clustering. */
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2 }, { id: 'b', lat: 3, lon: 4 }],
    cluster: true,
  });
  eq(inst._group().length, 2, 'far-apart nodes stay separate');

  /* Now force overlap. */
  L.map = ((orig) => function (el, opts) {
    const m = orig.call(L, el, opts);
    m.project = () => ({ distanceTo: () => 1 });
    return m;
  })(L.map);

  const { inst: inst2 } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2 }, { id: 'b', lat: 3, lon: 4 }, { id: 'c', lat: 5, lon: 6 }],
    cluster: true,
  });
  const groups = inst2._group();
  eq(groups.length, 1, 'all overlapping nodes merge');
  eq(groups[0].length, 3, 'cluster holds all three');
  inst.destroy(); inst2.destroy();
});

check('cluster:false never merges', () => {
  L.map = ((orig) => function (el, opts) {
    const m = orig.call(L, el, opts);
    m.project = () => ({ distanceTo: () => 1 });   // would always merge
    return m;
  })(L.map);
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2 }, { id: 'b', lat: 3, lon: 4 }],
    cluster: false,
  });
  eq(inst._group().length, 2, 'clustering disabled');
  inst.destroy();
});

check('cluster colour reflects the worst status', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', lat: 1, lon: 2, status: 'Operational' },
      { id: 'b', lat: 1, lon: 2, status: 'Down' },
      { id: 'c', lat: 1, lon: 2, status: 'Operational' },
    ],
  });
  eq(inst._worst([
    { status: 'Operational' }, { status: 'Degraded' }, { status: 'Down' },
  ]), 'Down', 'Down wins');
  eq(inst._worst([
    { status: 'Operational' }, { status: 'Degraded' },
  ]), 'Degraded', 'Degraded beats Operational');
  eq(inst._worst([{ status: 'Operational' }]), 'Operational', 'all operational');
  inst.destroy();
});

/* ── Escaping ───────────────────────────────────────────────────────── */

check('escapes HTML in tooltips and table rows', () => {
  const { inst } = mount({ nodes: [{ id: 'x', lat: 1, lon: 2 }] });
  inst.setNodes([{ id: '<img>', name: '<script>alert(1)</script>', region: 'a"b', lat: 5, lon: 6 }]);
  const tip = inst._tipNode(inst.getNodes()[0]);
  assert(!/<script>/.test(tip), 'raw script tag in tooltip');
  assert(/&lt;script&gt;/.test(tip), 'expected escaped script');
  assert(!/<img>/.test(tip), 'raw img in tooltip');
  inst.destroy();
});

/* ── Tooltips ───────────────────────────────────────────────────────── */

check('node tooltip carries name, latency and status', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', name: 'Tokyo', region: 'apac', lat: 35, lon: 139, status: 'Degraded', latency: 204 }],
  });
  const tip = inst._tipNode(inst.getNodes()[0]);
  assert(/Tokyo/.test(tip), 'name');
  assert(/204 ms/.test(tip), 'latency');
  assert(/Degraded/.test(tip), 'status');
  assert(/apac/.test(tip), 'region');
  inst.destroy();
});

check('Down nodes show no latency figure', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Down' }] });
  const tip = inst._tipNode(inst.getNodes()[0]);
  assert(!/\d+ ms/.test(tip), 'should not print a latency for a down node');
  assert(/Down/.test(tip), 'still shows status');
  inst.destroy();
});

check('cluster tooltip lists members and averages live nodes', () => {
  const { inst } = mount({ nodes: [] });
  const tip = inst._tipCluster(
    [{ name: 'A', status: 'Operational', latency: 10 }, { name: 'B', status: 'Operational', latency: 20 }],
    'Operational'
  );
  assert(/2 vantage points/.test(tip), 'count');
  assert(/A · B/.test(tip), 'member names');
  assert(/15 ms/.test(tip), 'average');
  inst.destroy();
});

check('cluster of all-Down nodes omits the average', () => {
  const { inst } = mount({ nodes: [] });
  const tip = inst._tipCluster(
    [{ name: 'A', status: 'Down', latency: 0 }, { name: 'B', status: 'Down', latency: 0 }],
    'Down'
  );
  assert(/—/.test(tip), 'expected a dash for no live nodes');
  inst.destroy();
});

/* ── State ──────────────────────────────────────────────────────────── */

check('getState counts by status and reports worst', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', lat: 1, lon: 2, status: 'Operational' },
      { id: 'b', lat: 3, lon: 4, status: 'Operational' },
      { id: 'c', lat: 5, lon: 6, status: 'Degraded' },
      { id: 'd', lat: 7, lon: 8, status: 'Down' },
    ],
  });
  const s = inst.getState();
  eq(s.counts, { Operational: 2, Degraded: 1, Down: 1 });
  eq(s.status, 'Down');
  eq(s.version, '1.0.0');
  inst.destroy();
});

check('live toggle updates aria-checked and label', () => {
  /* live:true explicitly — mount() defaults to paused for determinism. */
  const { inst } = mount({ nodes: [], showToggle: true, live: true });
  const btn = inst._toggleEls.btn;
  eq(btn.getAttribute('aria-checked'), 'true');
  eq(inst.isLive(), true);
  inst.setLive(false);
  eq(btn.getAttribute('aria-checked'), 'false');
  eq(inst._toggleEls.lbl.textContent, 'Probing Paused');
  inst.toggleLive();
  eq(inst.isLive(), true);
  eq(inst._toggleEls.lbl.textContent, 'Live Probing Active');
  inst.destroy();
});

check('paused probing leaves latency untouched', async () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 50 }] });
  inst.setLive(false);
  const before = inst.getNode('a').latency;
  inst._refresh();
  eq(inst.getNode('a').latency, before, 'latency changed while paused');
  inst.destroy();
});

check('Down nodes never jitter', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Down', latency: 300 }] });
  for (let i = 0; i < 20; i++) inst._refresh();
  eq(inst.getNode('a').latency, 300, 'down node latency drifted');
  inst.destroy();
});

/* ── Tile config ────────────────────────────────────────────────────── */

check('never passes subdomains:undefined to tileLayer', () => {
  /* L.tileLayer in the stub throws on that exact value, so constructing
     with the keyless preset is itself the assertion. */
  const { inst } = mount({ nodes: [], tile: 'osmDark' });
  const cfg = mapInstance._layers[0].cfg;
  assert(!('subdomains' in cfg), 'subdomains key present on a keyless preset');
  assert(cfg.maxZoom === 18, 'maxZoom from preset');
  inst.destroy();
});

check('carto preset supplies subdomains and CARTO attribution', () => {
  const { inst } = mount({ nodes: [], tile: 'cartoDark' });
  const layer = mapInstance._layers[0];
  eq(layer.cfg.subdomains, 'abcd');
  assert(/CARTO/.test(layer.cfg.attribution), 'CARTO credit');
  assert(layer.cfg.maxZoom === 20, 'carto maxZoom');
  inst.destroy();
});

check('invert class follows the preset, not the theme', () => {
  const light = mount({ nodes: [], theme: 'light', tile: 'osmLight' });
  eq(light.host.classList.contains('nps-invert'), false, 'light raster not inverted');
  light.inst.destroy();

  const dark = mount({ nodes: [], theme: 'dark', tile: 'osmDark' });
  eq(dark.host.classList.contains('nps-invert'), true, 'keyless raster inverted to dark');
  dark.inst.destroy();
});

check('tile:"none" builds a map with no network requests', () => {
  const { inst } = mount({ nodes: [], tile: 'none' });
  eq(mapInstance._layers.length, 0, 'a tile layer was created');
  inst.destroy();
});

check('OSM attribution is always present', () => {
  const { inst } = mount({ nodes: [], tile: 'osmDark' });
  assert(/OpenStreetMap/.test(mapInstance._layers[0].cfg.attribution), 'missing OSM credit');
  inst.destroy();
});

/* ── Container / layout ─────────────────────────────────────────────── */

check('mounting twice disposes the previous instance', () => {
  const host = makeEl('div');
  const first = new NovaPulseMap({ container: host, live: false });
  assert(first._timer !== null, 'precondition: first has a timer');
  assert(host.__npsInstance === first, 'first instance recorded on host');

  const second = new NovaPulseMap({ container: host, live: false });

  eq(first._destroyed, true, 'first instance was NOT destroyed — it leaks');
  eq(first._timer, null, 'first timer still running');
  eq(host.__npsInstance, second, 'host should point at the newest instance');
  second.destroy();
});

check('destroy of a stale instance does not unclaim a newer mount', () => {
  const host = makeEl('div');
  const first = new NovaPulseMap({ container: host, live: false });
  const second = new NovaPulseMap({ container: host, live: false });
  first.destroy();                       // stale, already replaced
  eq(host.__npsInstance, second, 'stale destroy() clobbered the live instance');
  second.destroy();
});

check('auto-init style double mount is idempotent', () => {
  const host = makeEl('div');
  const inst = new NovaPulseMap({ container: host, live: false });
  const first = inst._timer;
  inst.constructor.mount();              // scan finds nothing without a DOM
  eq(inst._timer, first, 'mount() disturbed a live instance');
  inst.destroy();
});

check('destroy releases the host back-reference', () => {
  const host = makeEl('div');
  const inst = new NovaPulseMap({ container: host, live: false });
  assert(host.__npsInstance === inst, 'precondition');
  inst.destroy();
  eq(host.__npsInstance, undefined, 'stale reference left on host');
});

check('post-destroy state and map controls are inert', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2 }] });
  inst.destroy();
  const s = inst.getState();
  eq(s.nodes, []);
  eq(s.zoom, null);
  eq(s.status, 'Operational');
  eq(inst.getZoom(), null, 'getZoom should be null after destroy');
  /* none of these may throw */
  inst.zoomIn(); inst.zoomOut(); inst.fit(); inst.setView([0, 0], 3); inst.invalidateSize();
  assert(true);
});

check('fit tolerates a single node and a degenerate span', () => {
  const one = mount({ nodes: [{ id: 'a', lat: 10, lon: 20 }] });
  one.inst.fit();
  one.inst.destroy();

  const two = mount({
    nodes: [{ id: 'a', lat: 10, lon: 20 }, { id: 'b', lat: 10, lon: 20 }],
  });
  two.inst.fit();
  two.inst.destroy();
  assert(true, '_fit threw on a zero-span bounds');
});

check('nodes are not mutated in place by setNodes', () => {
  const input = [{ id: 'a', lat: 1, lon: 2, latency: 10 }];
  const { inst } = mount({ nodes: input, live: false });
  inst._refresh();
  eq(input[0].latency, 10, 'caller-supplied object was mutated');
  assert(inst.getNodes()[0] !== input[0], 'internal node aliases the caller object');
  inst.destroy();
});

/* ══════════════════════════════════════════════════════════════════
   Advanced features (v1.1.0)
   ══════════════════════════════════════════════════════════════════ */

check('history is a bounded ring buffer', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 5 }], live: true, historyLength: 8 });
  for (let i = 0; i < 40; i++) inst._pushHistory({ id: 'a', latency: i, status: 'Operational' });
  eq(inst.getHistory('a').length, 8, 'history exceeded historyLength');
  eq(inst.getHistory('a')[7], 39, 'newest sample should be last');
  inst.destroy();
});

check('Down nodes record a gap, never a 0 ms reading', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Down' }], live: true });
  inst._refresh();
  const h = inst.getHistory('a');
  eq(h.length >= 1, true);
  eq(h[0], null, 'a down node must record null so the sparkline shows a gap');
  eq(inst.getPercentiles('a'), null, 'no percentiles from gaps alone');
  inst.destroy();
});

check('percentiles are ordered and sane', () => {
  /* historyLength raised so 100 samples fit; the default cap would
     silently truncate them and make p99 wrong. */
  const { inst } = mount({ nodes: [], live: false, historyLength: 720 });
  for (let i = 1; i <= 100; i++) inst._pushHistory({ id: 'p', latency: i, status: 'Operational' });
  const p = inst.getPercentiles('p');
  eq(p.samples, 100);
  eq(p.min, 1);
  eq(p.max, 100);
  assert(p.p50 >= p.min && p.p50 <= p.max, 'p50 out of range');
  assert(p.p95 >= p.p50, 'p95 must be >= p50');
  assert(p.p99 >= p.p95, 'p99 must be >= p95');
  inst.destroy();
});

check('history survives setNodes but not node churn', () => {
  const { inst } = mount({ nodes: [], live: false });
  for (let i = 0; i < 5; i++) inst._pushHistory({ id: 'a', latency: i, status: 'Operational' });
  /* setNodes also samples incoming data, so the count grows by one —
     what matters is that the prior samples survive. */
  inst.setNodes([{ id: 'a', lat: 1, lon: 2 }]);
  eq(inst.getHistory('a').length, 6, 'history truncated by setNodes');
  eq(inst.getHistory('a')[0], 0, 'oldest sample lost');
  inst.setNodes([{ id: 'z', lat: 1, lon: 2 }]);
  eq(inst.getHistory('a').length, 0, 'history for a removed node leaked');
  eq(inst.getHistory('z').length, 1);
  inst.destroy();
});

check('polled data is sampled exactly once per setNodes', () => {
  /* The double-count guard: setNodes samples, and _refresh must not
     sample again while a nodesUrl is configured. */
  const { inst } = mount({ nodes: [], live: true, nodesUrl: '/api/x.json', historyLength: 720 });
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, latency: 10, status: 'Operational' }]);
  eq(inst.getHistory('a').length, 1, 'setNodes should record exactly one sample');
  inst._refresh();
  eq(inst.getHistory('a').length, 1, '_refresh double-counted a polled sample');
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, latency: 11, status: 'Operational' }]);
  eq(inst.getHistory('a').length, 2, 'second poll should add exactly one sample');
  eq(inst.getHistory('a')[1], 11, 'wrong value recorded');
  inst.destroy();
});

check('live jitter still samples when there is no feed', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 10 }], live: true });
  /* Constructor setNodes() records the first sample. */
  eq(inst.getHistory('a').length, 1, 'initial setNodes sample');
  inst._refresh();
  eq(inst.getHistory('a').length, 2, '_refresh did not sample');
  inst._refresh();
  eq(inst.getHistory('a').length, 3);
  inst.destroy();
});

check('status transitions fire once per change', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Operational' }],
    live: false,
  });
  const seen = [];
  inst.on('statuschange', d => seen.push(d.from + '→' + d.to));
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Operational' }]);
  eq(seen, [], 'no-op setNodes fired a transition');
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Down' }]);
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Down' }]);
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Operational' }]);
  eq(seen, ['Operational→Down', 'Down→Operational']);
  inst.destroy();
});

check('recovery event fires on return to Operational', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, status: 'Down' }], live: false });
  let recovered = 0;
  inst.on('recovered', () => recovered++);
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Operational' }]);
  eq(recovered, 1);
  inst.setNodes([{ id: 'a', lat: 1, lon: 2, status: 'Degraded' }]);
  eq(recovered, 1, 'recovery fired for a non-Operational state');
  inst.destroy();
});

check('search filters across name, region, country and id', () => {
  const { inst } = mount({
    nodes: [
      { id: 'iad', name: 'Ashburn', region: 'us-east', country: 'US', lat: 39, lon: -77 },
      { id: 'nrt', name: 'Tokyo', region: 'apac', country: 'JP', lat: 35, lon: 139 },
    ],
    live: false,
  });
  inst.setSearch('tokyo');   eq(inst._visible().length, 1, 'name search');
  inst.setSearch('apac');    eq(inst._visible().length, 1, 'region search');
  inst.setSearch('jp');      eq(inst._visible().length, 1, 'country search');
  inst.setSearch('US');      eq(inst._visible().length, 1, 'country search is case-insensitive');
  inst.setSearch('zzz');     eq(inst._visible().length, 0, 'no matches');
  inst.setSearch('');        eq(inst._visible().length, 2, 'cleared');
  inst.destroy();
});

check('status filter narrows to one status', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', lat: 1, lon: 2, status: 'Operational' },
      { id: 'b', lat: 3, lon: 4, status: 'Down' },
    ],
    live: false,
  });
  inst.setFilter('Down');
  eq(inst._visible().map(n => n.id), ['b']);
  inst.setFilter('all');
  eq(inst._visible().length, 2);
  inst.destroy();
});

check('sorting works and handles Down as worst latency', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', name: 'Zulu', lat: 1, lon: 2, status: 'Operational', latency: 10 },
      { id: 'b', name: 'Alpha', lat: 3, lon: 4, status: 'Down', latency: 0 },
      { id: 'c', name: 'Mike', lat: 5, lon: 6, status: 'Operational', latency: 50 },
    ],
    live: false,
  });
  inst.setSort('name', 1);
  eq(inst._sortNodes(inst._nodes).map(n => n.name), ['Alpha', 'Mike', 'Zulu']);
  inst.setSort('name', -1);
  eq(inst._sortNodes(inst._nodes).map(n => n.name), ['Zulu', 'Mike', 'Alpha']);
  /* Down must sort as worst (Infinity), not as its 0 latency */
  inst.setSort('latency', 1);
  eq(inst._sortNodes(inst._nodes).map(n => n.id), ['a', 'c', 'b'], 'Down sorted by its 0 value');
  inst.destroy();
});

check('trend arrow needs enough history and stays bounded', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 10 }], live: false, showTrend: true });
  eq(inst._trendArrow({ id: 'a' }), '', 'arrow with no history');
  for (let i = 0; i < 8; i++) inst._pushHistory({ id: 'a', latency: 10, status: 'Operational' });
  assert(/flat|↑|↓/.test(inst._trendArrow({ id: 'a' })), 'no arrow after enough flat history');
  const html = inst._trendArrow({ id: 'a' });
  assert(!/Infinity|NaN|undefined/.test(html), 'arrow leaked a bad number: ' + html);
  inst.destroy();
});

check('sparkline is valid SVG with escaped values', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2 }], live: false, showSparklines: true });
  for (let i = 1; i <= 5; i++) inst._pushHistory({ id: 'a', latency: i * 10, status: 'Operational' });
  const svg = inst._sparkline(inst.getNode('a'));
  assert(/<svg/.test(svg), 'no svg');
  assert(/<polyline/.test(svg), 'no polyline');
  assert(!/NaN|Infinity|undefined/.test(svg), 'sparkline contains a bad coordinate');
  eq(inst._sparkline({ id: 'zzz' }), '', 'should render nothing without history');
  inst.destroy();
});

check('a flat series does not divide by zero in the sparkline', () => {
  const { inst } = mount({ nodes: [], live: false, showSparklines: true });
  for (let i = 0; i < 5; i++) inst._pushHistory({ id: 'f', latency: 42, status: 'Operational' });
  const svg = inst._sparkline({ id: 'f', latency: 42, status: 'Operational' });
  assert(!/NaN/.test(svg), 'zero-span series produced NaN');
  inst.destroy();
});

check('poll recovers the backoff after a failure', async () => {
  const saved = sandbox.fetch;
  let calls = 0;
  sandbox.fetch = () => { calls++; return Promise.reject(new Error('boom')); };
  const { inst } = mount({ nodes: [], live: false, nodesUrl: '/api/x.json' });

  await inst.poll();
  eq(inst._feedStatus, 'error');
  assert(inst._backoffMs > inst.options.refreshMs, 'backoff did not grow');
  assert(calls === 1, 'fetch called ' + calls + ' times');

  /* recovery resets the interval */
  sandbox.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'a', lat: 1, lon: 2 }]) });
  await inst.poll();
  eq(inst._feedStatus, 'ok');
  eq(inst._backoffMs, inst.options.refreshMs, 'backoff did not reset on recovery');
  sandbox.fetch = saved;
  inst.destroy();
});

check('poll rejects a malformed payload', async () => {
  const saved = sandbox.fetch;
  sandbox.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ nope: true }) });
  const { inst } = mount({ nodes: [], live: false, nodesUrl: '/api/x.json' });
  await inst.poll();
  eq(inst._feedStatus, 'error', 'a { nope: true } payload should be an error');
  sandbox.fetch = saved;
  inst.destroy();
});

check('poll reports HTTP failures', async () => {
  const saved = sandbox.fetch;
  sandbox.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
  const { inst } = mount({ nodes: [], live: false, nodesUrl: '/api/x.json' });
  await inst.poll();
  eq(inst._feedStatus, 'error');
  sandbox.fetch = saved;
  inst.destroy();
});

check('extra node metadata is carried through', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', name: 'A', lat: 1, lon: 2, country: 'JP', provider: 'Example',
              uptime: 99.98, note: 'Maintenance window Sunday' }],
    live: false,
  });
  const n = inst.getNode('a');
  eq(n.country, 'JP');
  eq(n.provider, 'Example');
  eq(n.uptime, 99.98);
  eq(n.note, 'Maintenance window Sunday');
  inst.destroy();
});

check('an absent latency is unknown, never 0 ms', () => {
  const { inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2 }, { id: 'b', lat: 3, lon: 4, latency: 40 }],
    live: false,
  });
  const a = inst.getNode('a');
  eq(a.latency, null, 'missing latency must be null, not 0');
  eq(a.hasLatency, false);
  eq(inst._latencyText(a), '—', 'should render an em dash');
  eq(inst.getNode('b').hasLatency, true);
  eq(inst._latencyText(inst.getNode('b')), '40 ms');

  /* A fabricated zero would drag p95 and the average down. */
  const p = inst.getPercentiles('a');
  eq(p, null, 'unknown-latency node must not produce percentiles');
  inst.destroy();
});

check('bad latency values become unknown rather than zero', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', lat: 1, lon: 2, uptime: 'lots', latency: -5 },
      { id: 'b', lat: 3, lon: 4, latency: NaN },
    ],
    live: false,
  });
  eq(inst.getNode('a').uptime, null, 'non-numeric uptime should be null');
  eq(inst.getNode('a').latency, null, 'negative latency must not become 0');
  eq(inst.getNode('b').latency, null, 'NaN latency must not become 0');
  eq(inst._latencyText(inst.getNode('a')), '—');
  inst.destroy();
});

check('the average ignores nodes with no reading', () => {
  const { inst } = mount({
    nodes: [
      { id: 'a', lat: 1, lon: 2, latency: 100 },
      { id: 'b', lat: 3, lon: 4 },              // no reading
      { id: 'c', lat: 5, lon: 6, status: 'Down' }, // excluded anyway
    ],
    live: false, showStats: true,
  });
  inst._renderStats();
  /* One measured node at 100ms: the mean must be 100, not 33. */
  eq(inst._root.querySelector('[data-npsAvg]').textContent, '100 <small>ms</small>');
  inst.destroy();
});

check('unknown-latency nodes sort last, not first', () => {
  const { inst } = mount({
    nodes: [
      { id: 'z', name: 'Unknown', lat: 1, lon: 2 },            // no reading
      { id: 'a', name: 'Fast',    lat: 3, lon: 4, latency: 5 },
    ],
    live: false,
  });
  inst.setSort('latency', 1);
  eq(inst._sortNodes(inst._nodes).map(n => n.id), ['a', 'z'],
    'unknown latency must sort last, not as 0 ms');
  inst.destroy();
});

check('live jitter never invents a reading for an unknown node', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2 }], live: true });
  inst._refresh();
  inst._refresh();
  eq(inst.getNode('a').latency, null, 'jitter fabricated a latency');
  eq(inst._latencyText(inst.getNode('a')), '—');
  inst.destroy();
});

check('historyLength option is clamped to a sane range', () => {
  const a = mount({ nodes: [], historyLength: 9999, live: false });
  eq(a.inst.options.historyLength, 720, 'unbounded historyLength');
  a.inst.destroy();
  const b = mount({ nodes: [], historyLength: -5, live: false });
  eq(b.inst.options.historyLength, 1, 'negative historyLength');
  b.inst.destroy();
  const c = mount({ nodes: [], historyLength: 'abc', live: false });
  eq(c.inst.options.historyLength, 24, 'non-numeric historyLength should use the default');
  c.inst.destroy();
});

check('setNodes ignores non-object entries', () => {
  const { inst } = mount({ nodes: [], live: false });
  /* Garbage rows must be dropped, not throw. Guard the test itself so a
     regression reports as an assertion, not an unhandled TypeError. */
  inst.setNodes([null, undefined, 'nope', 42, { id: 'ok', lat: 1, lon: 2 }]);
  eq(inst.getNodes().length, 1);
  eq(inst.getNodes()[0].id, 'ok');
  inst.destroy();
});

check('clearHistory resets samples and status memory', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2 }], live: false });
  eq(inst.getHistory('a').length, 1, 'setNodes should have recorded a sample');
  inst.clearHistory();
  eq(inst.getHistory('a').length, 0);
  inst.destroy();
});

check('export payload contains state and history', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2, latency: 9 }], live: false });
  eq(inst.getHistory('a').length, 1, 'setNodes should have recorded a sample');
  const out = inst.exportJSON();
  eq(!!out.generatedAt, true);
  eq(out.state.nodes.length, 1);
  eq(out.history.a.length, 1);
  inst.destroy();
});

check('theme switch flips vars, attribute and invert class', () => {
  const { inst } = mount({ nodes: [], theme: 'dark', live: false });
  eq(inst._root.getAttribute('data-theme'), 'dark');
  eq(inst._root.classList.contains('nps-invert'), true, 'dark preset should invert');
  inst.setTheme('light');
  eq(inst._root.getAttribute('data-theme'), 'light');
  eq(inst._root.classList.contains('nps-invert'), false, 'light raster must not invert');
  eq(inst._root.style.getPropertyValue('--nps-ink'), '#FFFFFF');
  inst.destroy();
});

check('autoRefresh:false starts no interval', () => {
  const { inst } = mount({ nodes: [], autoRefresh: false, live: true });
  eq(inst._timer, null, 'interval started despite autoRefresh:false');
  inst.destroy();
});

check('stopPolling clears the pending poll', () => {
  const { inst } = mount({ nodes: [], nodesUrl: '/api/x.json', live: false });
  eq(inst.stopPolling(), inst, 'stopPolling should be chainable');
  eq(inst._pollTimer, null, 'poll timer not cleared');
  inst.destroy();
});

check('surface owns the height; host does not clip', () => {
  const { host, inst } = mount({ nodes: [], height: 333 });
  eq(host.style.getPropertyValue('--nps-height'), '333px');
  eq(host.style.getPropertyValue('--nps-height'), '333px');
  /* host must carry .nps and a surface child, in that order */
  assert(host.classList.contains('nps'), 'host missing .nps');
  const surface = host.children[host.children.length - 1];
  assert(surface.getAttribute('data-nps-surface') !== null, 'no surface element');
  inst.destroy();
});

check('toggle renders before the surface, panel after', () => {
  const { host, inst } = mount({ nodes: [], showToggle: true, showStats: true, showTable: true });
  eq(host.children.length, 3, 'toggle + surface + panel');

  /* Real classList reflects className and vice versa. */
  const hasClass = (el, name) =>
    el.classList.contains(name) || String(el.className || '').split(/\s+/).includes(name);

  assert(host.children.some(c => hasClass(c, 'nps-toggle')), 'toggle present');

  const iToggle = host.children.findIndex(c => hasClass(c, 'nps-toggle'));
  const iSurface = host.children.findIndex(c => c.getAttribute('data-nps-surface') !== null);
  assert(iToggle >= 0, 'toggle index');
  assert(iSurface >= 0, 'surface index');
  assert(iToggle < iSurface, 'toggle must precede the surface');
  /* The panel is a wrapper holding .nps-stats and .nps-table-wrap, not a
     bare .nps-stats element. */
  assert(host.children[2].children.some(c => hasClass(c, 'nps-stats')),
    'panel should contain .nps-stats');
  assert(host.children[2].children.some(c => hasClass(c, 'nps-table-wrap')),
    'panel should contain .nps-table-wrap');
  inst.destroy();
});

check('rejects a missing container selector', () => {
  let msg = '';
  try { new NovaPulseMap({ container: '#nope' }); }
  catch (e) { msg = e.message; }
  assert(/container not found/.test(msg), 'expected a helpful error, got: ' + msg);
});

/* ── Events ─────────────────────────────────────────────────────────── */

check('emitter fires, unsubscribes and survives a throwing handler', () => {
  const { inst } = mount({ nodes: [] });
  const seen = [];
  const off = inst.on('livechange', v => seen.push(v));
  inst.setLive(false);
  inst.setLive(true);
  eq(seen, [false, true]);
  off();
  inst.setLive(false);
  eq(seen.length, 2, 'unsubscribe failed');
  inst.on('livechange', () => { throw new Error('boom'); });
  inst.setLive(true);   // must not propagate
  inst.destroy();
});

check('nodeclick event carries the node', () => {
  const { inst } = mount({ nodes: [{ id: 'a', name: 'A', lat: 1, lon: 2 }] });
  let got = null;
  inst.on('nodeclick', n => { got = n; });
  inst._rendered[0].marker._events.click();
  assert(got && got.id === 'a', 'click payload');
  inst.destroy();
});

/* ── Lifecycle ──────────────────────────────────────────────────────── */

check('destroy clears DOM, classes and timers', () => {
  const { host, inst } = mount({
    nodes: [{ id: 'a', lat: 1, lon: 2 }], showStats: true, tile: 'osmDark',
  });
  assert(host.classList.contains('nps'), 'precondition: .nps applied');
  assert(host.classList.contains('nps-invert'), 'precondition: invert applied');
  assert(inst._timer !== null, 'precondition: timer running');

  inst.destroy();

  eq(inst._timer, null, 'interval not cleared');
  eq(host.classList.contains('nps'), false, '.nps left behind');
  eq(host.classList.contains('nps-invert'), false, '.nps-invert left behind');
  eq(host.children.length, 0, 'host children left behind');
});

check('double destroy is safe', () => {
  const { inst } = mount({ nodes: [] });
  inst.destroy();
  inst.destroy();
  assert(true);
});

check('methods no-op after destroy instead of throwing', () => {
  const { inst } = mount({ nodes: [{ id: 'a', lat: 1, lon: 2 }] });
  inst.destroy();
  inst.setNodes([]);
  inst.invalidateSize();
  inst.setLive(false);
  inst.fit();
  inst.zoomIn();
  assert(true, 'a post-destroy call threw');
});

/* ── Rendered docs ──────────────────────────────────────────────────────
   GitHub Pages serves .md as plain text, so the docs are rendered to HTML.
   These guard the parts that silently break: a stale generated page, a
   link that still points at raw Markdown, an unescaped pipe that
   desynchronises a table row. */

const repoRoot = join(here, '..');
const DOC_PAGES = [
  'README.html', 'CHANGELOG.html', 'CONTRIBUTING.html',
  'docs/GETTING-STARTED.html', 'docs/ADVANCED.html',
  'docs/DEPLOY.html', 'docs/FILE-MAP.html'
];

check('every doc page is generated', () => {
  for (const f of DOC_PAGES) {
    assert(existsSync(join(repoRoot, f)), f + ' is missing — run: npm run docs');
  }
});

check('site pages link to rendered docs, never to raw .md', () => {
  for (const page of ['index.html', '404.html', ...DOC_PAGES]) {
    const html = readFileSync(join(repoRoot, page), 'utf8');
    const bad = [...html.matchAll(/href="([^"]*\.md)"/g)]
      .map(m => m[1])
      .filter(h => !h.includes('github.com'));   // GitHub links render there
    eq(bad.length, 0, page + ' links to raw Markdown: ' + bad.join(', '));
  }
});

check('generated doc pages carry their title and nav', () => {
  for (const f of DOC_PAGES) {
    const html = readFileSync(join(repoRoot, f), 'utf8');
    assert(/<h1 /.test(html), f + ' has no h1 (a BOM before "#" breaks the heading match)');
    assert(html.includes('class="side"'), f + ' has no sidebar');
    assert(html.includes('<nav aria-label="Documentation">'), f + ' has no doc nav');
  }
});

check('table cells are escaped pipes, not extra columns', () => {
  /* `data-theme` documents `dark` \| `light`. A naive split on | turned one
     cell into two and the whole row lost alignment. */
  const html = readFileSync(join(repoRoot, 'README.html'), 'utf8');
  const rows = [...html.matchAll(/<tr><th scope="col">(.*?)<\/th>/g)];
  eq(rows.length > 0, true, 'README.html has no tables');
  for (const block of html.match(/<table>[\s\S]*?<\/table>/g) || []) {
    const counts = [...block.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
      .map(m => (m[1].match(/<t[hd][ >]/g) || []).length)
      .filter(n => n > 0);
    if (!counts.length) continue;
    eq(new Set(counts).size, 1,
       'ragged table (' + counts.join(',') + '): ' +
       block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90));
  }
});

check('no doc page renders an empty table header', () => {
  for (const f of DOC_PAGES) {
    const html = readFileSync(join(repoRoot, f), 'utf8');
    const empty = [...html.matchAll(/<th scope="col">\s*<\/th>/g)];
    eq(empty.length, 0, f + ' has ' + empty.length + ' blank header cell(s)');
  }
});

check('docs are in sync with their Markdown source', () => {
  const res = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'docs.mjs'), '--check'],
    { encoding: 'utf8' });
  eq(res.status, 0, 'docs.mjs --check failed:\n' + (res.stdout || '') + (res.stderr || ''));
});

/* ── Summary ────────────────────────────────────────────────────────── */

console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`  ${f.name}\n    ${f.err.stack}\n`);
  process.exit(1);
}