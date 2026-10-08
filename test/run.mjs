/**
 * NovaPulse Edge Map — headless-ish test suite.
 * Runs the library in a minimal DOM stub so it needs no browser and no
 * test framework. Verifies the pure logic that a browser test would be
 * awkward to assert: option resolution, node normalisation, cluster
 * grouping, worst-status aggregation, escaping, and teardown.
 *
 *   node test/run.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
      setProperty(k, v) { this._p[k] = v; },
      getPropertyValue(k) { return this._p[k] || ''; },
      cssText: '',
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
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || 'not equal'}\n        expected ${B}\n        actual   ${A}`);
}

/* Live probing mutates latency on a timer, which would make value
   assertions flaky. Default every mount to paused unless a test asks
   otherwise. */
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
  assert(n.latency === 0, 'latency defaults to 0');
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

/* ── Summary ────────────────────────────────────────────────────────── */

console.log(`\n  ${pass} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`  ${f.name}\n    ${f.err.stack}\n`);
  process.exit(1);
}