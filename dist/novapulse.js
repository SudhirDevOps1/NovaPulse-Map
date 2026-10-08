/*! NovaPulse Edge Map v1.1.0 | MIT | https://github.com/SudhirDevOps1/NovaPulse-Map */
/*!
 * NovaPulse Edge Map — v1.0.0
 * Embedded, keyless world map of edge-probe vantage points.
 * Built on Leaflet + OpenStreetMap. MIT licensed.
 *
 * Global namespace: window.NovaPulseMap
 * Auto-init:  <div data-novapulse-map></div>
 *             <script src="dist/novapulse.min.js" defer></script>
 *
 * This file is dependency-free. It expects Leaflet (window.L) to be
 * present; it does not bundle it. See README for CDN + npm setup.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.NovaPulseMap = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════
     Constants
     ══════════════════════════════════════════════════════════════════ */

  var VERSION = '1.1.0';

  /* Status → colour. Overridable per-instance via options.colors. */
  var STATUS_COLOR = {
    Operational: '#22C55E',
    Degraded: '#F59E0B',
    Down: '#EF4444'
  };

  /* Status precedence for cluster aggregation (worst wins). */
  var STATUS_RANK = { Operational: 0, Degraded: 1, Down: 2 };

  var OSM_ATTR =
    '&copy; <a href="https://www.openstreetmap.org/copyright" ' +
    'target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

  /* Tile presets. Every one is keyless and CORS-free.
     NOTE: CARTO's dark_all endpoint now serves a fixed 2,394-byte
     "API KEY REQUIRED" placeholder for unauthenticated requests. It is
     kept only as a documented option for users who hold a CARTO key. */
  var TILES = {
    /* Dark-native basemap. Requires a free CARTO API key. */
    cartoDark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
      invert: false,
      needsKey: true
    },
    /* Keyless light raster. Shell applies a CSS invert+re-tint filter so
       the map still reads dark. Verified working with no key. */
    osmDark: {
      url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
      maxZoom: 18,
      attribution: OSM_ATTR,
      invert: true
    },
    /* Keyless light raster, no filter. Best for light-theme hosts. */
    osmLight: {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      attribution: OSM_ATTR,
      invert: false
    },
    /* Fully offline / CSP-safe: no network, no attribution needed.
       Drawn client-side as a graticule on the shell background. */
    none: { url: null, attribution: '', invert: false, offline: true }
  };

  /* ══════════════════════════════════════════════════════════════════
     Small utilities
     ══════════════════════════════════════════════════════════════════ */

  function isEl(x) {
    return x && typeof x === 'object' && x.nodeType === 1;
  }

  function resolveContainer(input) {
    if (isEl(input)) return input;
    if (typeof input === 'string') {
      var el = document.querySelector(input);
      if (!el) throw new Error('[NovaPulseMap] container not found: ' + input);
      return el;
    }
    throw new Error('[NovaPulseMap] options.container is required');
  }

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  /* Integer option with a fallback when the value is absent or unusable.
     Number(undefined) is NaN, which would poison the value silently. */
  function clampInt(v, fallback, lo, hi) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return fallback;
    return clamp(n, lo, hi);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    return function () { target.removeEventListener(type, fn, opts); };
  }

  function prefersReducedMotion() {
    return (
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     Embedded styles
     Injected once into <head>. Kept deliberately small and namespaced
     under .nps-* so it cannot collide with a host page.
     ══════════════════════════════════════════════════════════════════ */

  var STYLE_ID = 'novapulse-edge-map-css';
  var CSS = [
    /* Host is a stack, not the map itself — it must NOT clip or fix a
       height, otherwise the toggle and stats panel get cut off. */
    '.nps{position:relative;background:var(--nps-ink,#0B0F14);',
    'border:1px solid var(--nps-line,#243244);border-radius:var(--nps-radius,16px);',
    'isolation:isolate;width:100%;}',
    /* The surface owns height + clipping + corners. */
    '.nps>div[data-nps-surface]{position:relative;overflow:hidden;',
    'border-radius:calc(var(--nps-radius,16px) - 1px);',
    'height:var(--nps-height,420px);width:100%;}',
    '.nps>div[data-nps-surface]>.leaflet-container{height:100%;width:100%;}',
    '.nps.nps-invert .leaflet-tile-pane{filter:invert(1) hue-rotate(185deg) brightness(.92) contrast(1.05) saturate(.55);}',
    '.nps .leaflet-container{font:inherit;background:var(--nps-ink,#0B0F14);}',
    '@keyframes nps-zoom-in{from{transform:scale(1.06)}to{transform:scale(1)}}',
    '.nps-anim .leaflet-container{animation:nps-zoom-in 1100ms cubic-bezier(.22,1,.36,1) both;transform-origin:50% 55%;}',

    /* markers */
    '.nps-icon{background:none!important;border:0!important;}',
    '.nps-icon>*{position:absolute;border-radius:9999px;}',
    '.nps-pulse{inset:0;border:2px solid var(--c);opacity:0;animation:nps-pulse 2.6s cubic-bezier(.22,1,.36,1) infinite;}',
    '.nps-dot{inset:8px;background:var(--c);box-shadow:0 0 0 2px var(--nps-ink,#0B0F14),0 0 10px 1px var(--c),0 0 22px 4px color-mix(in srgb,var(--c) 45%,transparent);}',
    '@keyframes nps-pulse{0%{transform:scale(.5);opacity:.85}70%{transform:scale(1.8);opacity:0}100%{transform:scale(1.8);opacity:0}}',
    '.nps-pulse.d1{animation-delay:.45s}.nps-pulse.d2{animation-delay:.9s}.nps-pulse.d3{animation-delay:1.35s}',
    '.nps-icon[data-status=Down] .nps-pulse{animation-duration:1.5s}',
    '.nps-icon[data-status=Down] .nps-pulse::after{content:"";position:absolute;inset:0;border-radius:9999px;border:2px solid var(--c);animation:nps-pulse 1.5s cubic-bezier(.22,1,.36,1) .75s infinite;}',
    '.nps-icon[data-status=Degraded] .nps-pulse{animation-duration:3.4s}',

    /* clusters */
    '.nps-cluster .nps-ring{inset:0;background:var(--nps-ink,#0B0F14);border:2px solid var(--c);box-shadow:0 0 0 1px var(--nps-ink,#0B0F14),0 0 18px 2px color-mix(in srgb,var(--c) 50%,transparent);}',
    '.nps-cluster .nps-count{inset:0;display:grid;place-items:center;font-size:11px;font-weight:800;line-height:1;color:var(--c);font-variant-numeric:tabular-nums;}',
    '.nps-cluster .nps-dot{display:none}',

    /* tooltip */
    '.nps-tip{background:rgba(17,24,35,.97)!important;border:1px solid var(--nps-line,#243244)!important;',
    'border-radius:12px!important;box-shadow:0 12px 32px rgba(0,0,0,.6)!important;color:var(--nps-fg,#E2E8F0)!important;',
    'padding:11px 14px!important;font-family:inherit!important;white-space:nowrap!important;margin-top:-4px!important;}',
    '.nps-tip::before{display:none!important}',
    '.nps-tip-name{font-weight:700;font-size:.875rem;letter-spacing:-.01em;}',
    '.nps-tip-city{font-size:.7rem;color:var(--nps-faint,#9FB0C6);margin-top:2px;text-transform:uppercase;letter-spacing:.07em;}',
    '.nps-tip-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:9px;}',
    '.nps-tip-k{font-size:.7rem;color:var(--nps-faint,#9FB0C6);text-transform:uppercase;letter-spacing:.06em;}',
    '.nps-tip-lat{font-size:.875rem;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.nps-tip-badge{display:inline-flex;align-items:center;gap:5px;font-size:.6875rem;font-weight:700;padding:3px 7px;border-radius:6px;',
    'background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);border:1px solid color-mix(in srgb,var(--c) 32%,transparent);}',
    '.nps-tip-badge i{width:6px;height:6px;border-radius:9999px;background:var(--c)}',

    /* controls — !important because leaflet.css may load later and
       .leaflet-bar rules tie on specificity. */
    '.nps .leaflet-control-attribution{background:var(--nps-ink,#0B0F14)!important;color:var(--nps-faint,#9FB0C6)!important;',
    'font-size:11px!important;line-height:1.5;padding:5px 8px!important;border-radius:6px 0 0 0;}',
    /* Links need inline-block + real padding to clear the 24x24 target-size
   floor; inline links otherwise render at text height (~21px) and fail
   WCAG 2.5.8. */
/* Link colour tracks the theme; a fixed value fails AA in one of them. */
'.nps .leaflet-control-attribution a{color:var(--nps-fg,#E2E8F0)!important;display:inline-block;padding:4px 2px;min-height:24px;line-height:16px;}',
    '.nps .leaflet-control-zoom{border:0!important;box-shadow:none!important;display:flex!important;flex-direction:column!important;gap:6px!important;}',
    '.nps .leaflet-control-zoom a,.nps .leaflet-bar a{width:36px!important;height:36px!important;display:grid!important;place-items:center!important;',
    'background:rgba(17,24,35,.94)!important;border:1px solid var(--nps-line,#243244)!important;border-radius:9px!important;',
    'color:#C7D4E2!important;font-size:1.05rem!important;font-weight:600!important;line-height:1!important;cursor:pointer!important;',
    'text-decoration:none!important;backdrop-filter:blur(8px);transition:background .18s ease,border-color .18s ease,color .18s ease;}',
    '.nps .leaflet-control-zoom a::before,.nps .leaflet-bar a::before{content:none!important}',
    '.nps .leaflet-control-zoom a:hover,.nps .leaflet-bar a:hover{background:#1B2634!important;border-color:#33455C!important;color:#fff!important}',
    '.nps .leaflet-control-zoom a:focus-visible{outline:2px solid #38BDF8!important;outline-offset:2px!important}',
    '.nps .leaflet-control-zoom a.leaflet-disabled{opacity:.35!important;cursor:default!important}',
    '.nps .leaflet-control-scale-line{background:var(--nps-ink,#0B0F14)!important;border-color:#33455C!important;',
    'color:var(--nps-faint,#9FB0C6)!important;font-size:11px!important;padding:3px 7px!important;}',

    /* legend + hint
       Both chips sit ON the map. With a translucent backdrop the effective
       background is unpredictable, and axe measured 1.98:1 over a light
       map — so they are opaque and theme-aware. */
    '.nps-legend{position:absolute;z-index:500;right:12px;top:12px;background:var(--nps-ink,#0B0F14);border:1px solid var(--nps-line,#243244);',
    'border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:5px;pointer-events:none;}',
    '.nps-legend div{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--nps-fg,#E2E8F0)}',
    '.nps-legend i{width:8px;height:8px;border-radius:9999px}',
    '.nps-hint{position:absolute;z-index:500;left:12px;bottom:34px;background:var(--nps-ink,#0B0F14);border:1px solid var(--nps-line,#243244);',
    'color:var(--nps-fg,#E2E8F0);font-size:11px;padding:5px 9px;border-radius:8px;',
    'pointer-events:none;transition:opacity .4s ease;font-family:inherit;}',

    /* stats */
    '.nps-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:10px 12px 0;}',
    '.nps-stat{background:var(--nps-soft,#111823);border:1px solid var(--nps-line,#243244);border-radius:12px;padding:12px 14px;}',
    '.nps-stat-k{margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--nps-faint,#9FB0C6);}',
    '.nps-stat-v{margin:4px 0 0;font-size:1.5rem;font-weight:700;font-variant-numeric:tabular-nums;color:var(--nps-fg,#E2E8F0);}',
    '.nps-stat-v small{font-size:.875rem;font-weight:500;color:var(--nps-faint,#9FB0C6);}',

    /* table */
    '.nps-table-wrap{margin:10px 12px 12px;overflow-x:auto;border:1px solid var(--nps-line,#243244);border-radius:12px;}',
    '.nps-table{width:100%;border-collapse:collapse;font-size:.875rem;text-align:left;}',
    '.nps-table th{background:rgba(255,255,255,.03);color:var(--nps-faint,#9FB0C6);font-size:11px;text-transform:uppercase;',
    'letter-spacing:.07em;font-weight:600;padding:12px 16px;white-space:nowrap;}',
    '.nps-table td,.nps-table tbody th{padding:12px 16px;border-top:1px solid rgba(255,255,255,.05);font-weight:600;color:var(--nps-fg,#E2E8F0);}',
    '.nps-table tbody tr:hover{background:rgba(255,255,255,.03)}',
    '.nps-table .nps-coord{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;font-variant-numeric:tabular-nums;',
    'color:var(--nps-faint,#9FB0C6);font-weight:400;white-space:nowrap;}',
    '.nps-table .nps-num{text-align:right;font-variant-numeric:tabular-nums;color:#CBD5E1;font-weight:400;}',
    '.nps-table .nps-stat-cell{text-align:right;}',
    '.nps-pill{display:inline-block;border-radius:6px;border:1px solid;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;}',
    '.nps-dotmark{display:inline-block;width:8px;height:8px;border-radius:9999px;margin-right:8px;vertical-align:middle;}',
    '.nps-toggle{display:inline-flex;align-items:center;gap:12px;cursor:pointer;user-select:none;background:var(--nps-soft,#111823);',
    'border:1px solid var(--nps-line,#243244);border-radius:12px;padding:10px 16px;margin-bottom:10px;font-family:inherit;}',
    '.nps-toggle-lbl{font-size:.875rem;font-weight:600;color:var(--nps-fg,#E2E8F0)}',
    '.nps-toggle.is-off .nps-toggle-lbl{color:var(--nps-faint,#9FB0C6)}',
    '.nps-switch{position:relative;width:44px;height:26px;flex:none;border:0;border-radius:999px;background:rgba(34,197,94,.8);cursor:pointer;padding:0;transition:background .2s ease;}',
    '.nps-switch.is-off{background:rgba(100,116,139,.45)}',
    '.nps-switch:focus-visible{outline:2px solid #38BDF8;outline-offset:2px}',
    '.nps-switch i{position:absolute;top:3px;left:2px;width:20px;height:20px;border-radius:999px;background:#fff;transition:transform .22s cubic-bezier(.22,1,.36,1)}',
    '.nps-switch.is-off i{transform:translateX(18px)}',
    '.nps-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',

    /* controls bar */
    '.nps-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 12px 10px}',
    '.nps-search{flex:1 1 180px;min-width:0;background:var(--nps-soft,#111823);border:1px solid var(--nps-line,#243244);',
    'border-radius:9px;padding:8px 11px;font:inherit;font-size:.85rem;color:var(--nps-fg,#E2E8F0)}',
    '.nps-search::placeholder{color:var(--nps-faint,#9FB0C6);opacity:1}',
    '.nps-search:focus-visible{outline:2px solid #38BDF8;outline-offset:1px}',
    '.nps-filters{display:flex;gap:4px;flex-wrap:wrap}',
    '.nps-filter{background:var(--nps-soft,#111823);border:1px solid var(--nps-line,#243244);',
    'border-radius:999px;padding:7px 12px;font:inherit;font-size:.78rem;font-weight:600;',
    'color:var(--nps-faint,#9FB0C6);cursor:pointer;min-height:32px;',
    'transition:background .16s ease,color .16s ease,border-color .16s ease}',
    '.nps-filter:hover{color:var(--nps-fg,#E2E8F0);border-color:#33455C}',
    '.nps-filter.is-active{background:#E2E8F0;color:#0B0F14;border-color:transparent}',
    '.nps-filter:focus-visible{outline:2px solid #38BDF8;outline-offset:2px}',
    '.nps-actions{display:flex;gap:4px;margin-left:auto}',
    '.nps-action{width:32px;height:32px;display:grid;place-items:center;',
    'background:var(--nps-soft,#111823);border:1px solid var(--nps-line,#243244);border-radius:9px;',
    'color:var(--nps-fg,#E2E8F0);font-size:.9rem;line-height:1;cursor:pointer;',
    'transition:background .16s ease,border-color .16s ease}',
    '.nps-action:hover{background:#1B2634;border-color:#33455C}',
    '.nps-action:focus-visible{outline:2px solid #38BDF8;outline-offset:2px}',

    /* feed status — theme-aware text, never the marker palette */
    '.nps-feed{margin:8px 12px 0;font-size:.75rem;color:var(--nps-fg,#E2E8F0)}',
    '.nps-feed.is-error{color:var(--nps-fg,#E2E8F0);font-weight:600}',

    /* trend + sparkline */
    '.nps-trend{font-size:.7rem;font-weight:700;margin-left:6px}',
    '.nps-trend.up{color:#F59E0B}.nps-trend.down{color:#22C55E}.nps-trend.flat{color:#9FB0C6}',
    '.nps-spark{margin-top:10px}',
    '.nps-spark svg{display:block;width:100%;height:28px;overflow:visible}',
    '.nps-spark-range{display:block;font-size:.65rem;color:var(--nps-faint,#9FB0C6);margin-top:3px}',
    '.nps-tip-note{margin-top:8px;font-size:.72rem;color:#CBD5E1;max-width:220px;white-space:normal}',

    /* table extras */
    '.nps-sub{display:block;font-size:.68rem;font-weight:400;color:var(--nps-faint,#9FB0C6);margin-top:1px}',
    '.nps-empty{text-align:center;color:var(--nps-faint,#9FB0C6);padding:20px 16px!important;font-weight:400!important}',
    '.nps-sortable{cursor:pointer;user-select:none;position:relative}',
    '.nps-sortable:hover{color:var(--nps-fg,#E2E8F0)}',
    '.nps-sortable:focus-visible{outline:2px solid #38BDF8;outline-offset:-2px}',
    '.nps-sortable[aria-sort=ascending]::after{content:" \\2191";font-size:.9em}',
    '.nps-sortable[aria-sort=descending]::after{content:" \\2193";font-size:.9em}',

    '@media (prefers-reduced-motion:reduce){',
    '.nps-anim .leaflet-container{animation:none}',
    '.nps-pulse{animation:none!important;opacity:.25;transform:scale(1.4)}',
    '.nps-icon[data-status=Down] .nps-pulse::after{animation:none!important;opacity:.25;transform:scale(1.4)}}',
    '@media (prefers-contrast:more){.nps-tip{border-width:2px!important}}'
  ].join('');

  function injectStyles(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(el);
  }

  /* ══════════════════════════════════════════════════════════════════
     Tiny event emitter
     ══════════════════════════════════════════════════════════════════ */

  function Emitter() {
    this._h = {};
  }
  /* Calling without new (NovaPulseMap({...})) reaches Emitter with
     `this` undefined under strict mode, which threw before _build. */
  Emitter.prototype.init = function () { this._h = {}; return this; };
  Emitter.prototype.on = function (type, fn) {
    (this._h[type] || (this._h[type] = [])).push(fn);
    var self = this;
    return function () { self.off(type, fn); };
  };
  Emitter.prototype.off = function (type, fn) {
    var a = this._h[type];
    if (!a) return;
    var i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  };
  Emitter.prototype.emit = function (type, detail) {
    var a = (this._h[type] || []).slice();
    for (var i = 0; i < a.length; i++) {
      try { a[i](detail); }
      catch (e) { console.error('[NovaPulseMap] handler error on "' + type + '"', e); }
    }
    if (type !== '*' && this._h['*']) this.emit('*', { type: type, detail: detail });
  };

  /* ══════════════════════════════════════════════════════════════════
     NovaPulseMap
     ══════════════════════════════════════════════════════════════════ */

  function NovaPulseMap(options) {
    if (!(this instanceof NovaPulseMap)) return new NovaPulseMap(options);
    Emitter.call(this);

    var o = options || {};
    var self = this;

    this.options = {
      container: o.container || null,
      nodes: o.nodes || [],
      nodesUrl: o.nodesUrl || null,
      theme: o.theme === 'light' ? 'light' : 'dark',
      tile: o.tile || (o.theme === 'light' ? 'osmLight' : 'osmDark'),
      tileUrl: o.tileUrl || null,
      height: o.height || 420,
      zoom: typeof o.zoom === 'number' ? o.zoom : 2,
      /* minZoom 1, not 2. fitBounds() silently clamps at minZoom, so a
         narrow/short container at minZoom 2 leaves world-edge nodes
         scrolled outside the viewport with no way to reach them.
         z1 gives it the room to always fit every node. */
      minZoom: typeof o.minZoom === 'number' ? o.minZoom : 1,
      maxZoom: typeof o.maxZoom === 'number' ? o.maxZoom : 8,
      cluster: o.cluster !== false,
      clusterRadius: typeof o.clusterRadius === 'number' ? o.clusterRadius : 34,
      live: o.live !== false,
      refreshMs: typeof o.refreshMs === 'number' ? o.refreshMs : 5000,
      jitter: typeof o.jitter === 'number' ? o.jitter : 0.14,
      showToggle: !!o.showToggle,
      showStats: !!o.showStats,
      showTable: !!o.showTable,
      showLegend: o.showLegend !== false,
      showScale: o.showScale !== false,
      showHint: o.showHint !== false,
      scrollWheelZoom: o.scrollWheelZoom !== false,
      emitStateToParent: o.emitStateToParent !== false,
      colors: Object.assign({}, STATUS_COLOR, o.colors || {}),
      onNodeClick: typeof o.onNodeClick === 'function' ? o.onNodeClick : null,

      /* ── Advanced ──────────────────────────────────────────────
         All opt-in. Defaults below preserve the v1.0.0 behaviour
         exactly, so upgrading is not a breaking change. */
      showControls: !!o.showControls,
      historyLength: clampInt(o.historyLength, 24, 1, 720),
      showSparklines: !!o.showSparklines,
      showSearch: !!o.showSearch,
      sortableTable: o.sortableTable !== false,
      showTrend: !!o.showTrend,
      showUptime: !!o.showUptime,
      autoRefresh: o.autoRefresh !== false,
      refreshBackoff: o.refreshBackoff !== false,
      pauseWhenHidden: o.pauseWhenHidden !== false,
      onFeedError: typeof o.onFeedError === 'function' ? o.onFeedError : null,
      onStatusChange: typeof o.onStatusChange === 'function' ? o.onStatusChange : null,
      persistKey: o.persistKey || null,
      deepLink: !!o.deepLink
    };

    this._destroyed = false;
    this._interacted = false;
    this._hinted = false;
    this._live = this.options.live;
    this._rendered = [];
    this._timer = null;
    this._offs = [];

    /* ── Advanced state ──────────────────────────────────────────── */
    this._history = {};      /* id -> [latency, …] ring buffer */
    this._prevStatus = {};   /* id -> status, for transition alerts */
    this._query = '';
    this._filter = 'all';    /* all | Operational | Degraded | Down */
    this._sort = { key: 'name', dir: 1 };
    this._consecutiveErrors = 0;
    this._backoffMs = this.options.refreshMs;
    this._pollTimer = null;   /* typed here so stopPolling() always has a handle */
    this._lastOk = null;
    this._feedStatus = 'idle';   /* idle | ok | error | loading */

    if (typeof window === 'undefined' || !window.L) {
      throw new Error('[NovaPulseMap] Leaflet (window.L) not found. Load Leaflet before this script.');
    }

    this._root = resolveContainer(this.options.container);

    /* Mounting twice on one element used to orphan the first instance:
       its interval, ResizeObserver and Leaflet map all stayed live and
       invisible, leaking on every re-init. Tear it down first. */
    var prior = this._root.__npsInstance;
    if (prior && prior !== this && typeof prior.destroy === 'function') {
      try { prior.destroy(); } catch (e) { console.error('[NovaPulseMap] failed to dispose previous instance', e); }
    }
    this._root.__npsInstance = this;

    this._build();
  }

  NovaPulseMap.prototype = Object.create(Emitter.prototype);
  NovaPulseMap.prototype.constructor = NovaPulseMap;

  /* ── Construction ─────────────────────────────────────────────────── */

  NovaPulseMap.prototype._build = function () {
    var self = this;
    var o = this.options;
    var host = this._root;

    injectStyles(host.ownerDocument || document);

    /* Host gets the theme vars. */
    host.classList.add('nps');
    host.style.setProperty('--nps-height', o.height + 'px');
    host.setAttribute('data-theme', o.theme === 'light' ? 'light' : 'dark');
    this._applyThemeVars(o.theme);

    host.innerHTML = '';

    /* The host is an in-flow stack: [toggle] [map surface] [stats/table].
       The SURFACE — not the host — must own the fixed height, clipping and
       rounded corners. Pinning the height to the host instead makes
       Leaflet measure a collapsed pane and park every marker at -17000px.
       Order is built explicitly: append the surface first, then insert the
       toggle BEFORE it, then append the panel after. */
    this._frame = document.createElement('div');
    this._frame.setAttribute('data-nps-surface', '');
    host.appendChild(this._frame);

    if (o.showToggle) this._buildToggle();
    if (o.showControls) this._buildControls();
    if (o.showStats || o.showTable) this._buildPanel();

    /* ── map ── */
    var map = L.map(this._frame, {
      center: o.nodes.length ? this._centerOf(o.nodes) : [24, 12],
      zoom: o.zoom,
      minZoom: o.minZoom,
      maxZoom: o.maxZoom,
      worldCopyJump: true,
      scrollWheelZoom: false, /* armed on hover; never traps page scroll */
      keyboard: true,
      zoomControl: false,
      attributionControl: true
    });
    this._map = map;

    var preset = TILES[o.tile] || TILES.osmDark;
    var url = o.tileUrl || preset.url;

    if (url) {
      /* Only pass keys the preset actually defines. Leaflet's
         _getSubdomain() throws on subdomains:undefined, so a conditional
         build is required rather than an object literal with holes. */
      var cfg = { attribution: preset.attribution || '' };
      if (preset.maxZoom) cfg.maxZoom = preset.maxZoom;
      if (preset.subdomains) cfg.subdomains = preset.subdomains;

      var layer = L.tileLayer(url, cfg);
      /* Follow the PRESET, not the theme. A host asking for theme:'dark'
         with tile:'osmLight' still wants that raster shown as-is. */
      if (preset.invert) host.classList.add('nps-invert');
      layer.on('tileerror', function () {
        self.emit('error', { code: 'tile-error', url: url });
      });
      layer.addTo(map);
      this._layer = layer;
    }

    if (o.showScale) {
      L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(map);
    }
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    if (o.showLegend) this._buildLegend();

    /* ── markers ── */
    this._markerLayer = L.layerGroup().addTo(map);

    /* ── interaction ── */
    map.on('zoomend', function () { self._renderMarkers(); self._refresh(); });
    map.on('dragstart', function () { self._interacted = true; self._dismissHint(); });
    map.on('zoomstart', function () { self._interacted = true; self._dismissHint(); });
    map.on('click', function () { self._dismissHint(); });

    if (o.scrollWheelZoom) {
      var c = map.getContainer();
      this._offs.push(on(c, 'mouseenter', function () { map.scrollWheelZoom.enable(); }));
      this._offs.push(on(c, 'mouseleave', function () { map.scrollWheelZoom.disable(); }));
      this._offs.push(on(c, 'wheel', function () { self._dismissHint(); }, { passive: true, once: true }));
    }

    /* ── responsiveness (never overflow the container) ── */
    var self2 = this;
    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(function () { self2.invalidateSize(); });
      this._ro.observe(host);
    }
    this._offs.push(on(window, 'orientationchange', function () {
      setTimeout(function () { self.invalidateSize(); }, 250);
    }));
    this._offs.push(on(document, 'visibilitychange', function () {
      if (document.hidden) {
        self.invalidateSize();
        /* A hidden tab still runs timers. Suspending saves the user's
           battery and avoids a thundering herd on the feed endpoint. */
        if (self.options.pauseWhenHidden) {
          self._wasLive = self._live;
          self._start();
        }
        return;
      }
      self.invalidateSize();
      if (self.options.pauseWhenHidden) {
        if (self._wasLive !== undefined) { self.setLive(self._wasLive); self._wasLive = undefined; }
        /* The interval may have been throttled to ~1/min by the browser
           while hidden; re-anchor it so it doesn't fire immediately. */
        self._start();
      }
    }));

    if (o.deepLink) {
      this._syncDeepLink();
      this._offs.push(on(window, 'hashchange', function () { self._syncDeepLink(); }));
    }

    if (o.showHint) this._buildHint();

    if (!prefersReducedMotion()) {
      host.classList.add('nps-anim');
      var pane = this._frame.querySelector('.leaflet-container');
      if (pane) {
        this._offs.push(on(pane, 'animationend', function () {
          host.classList.remove('nps-anim');
          self.invalidateSize();
        }, { once: true }));
      }
    }

    /* ── embed protocol ── */
    if (o.emitStateToParent && window.parent && window.parent !== window) {
      this._offs.push(on(window, 'message', function (ev) { self._onMessage(ev); }));
    }

    /* setNodes() samples the initial data and internally calls _refresh().
       While booting, _refresh must not sample again, or the first tick is
       recorded twice and the sparkline opens with a duplicated point. */
    this._booting = true;
    this.setNodes(o.nodes);
    this._fit();
    this._booting = false;

    this._start();
    this.emit('ready', this.getState());
  };

  NovaPulseMap.prototype._centerOf = function (nodes) {
    var lat = 0, lon = 0, n = 0;
    for (var i = 0; i < nodes.length; i++) {
      if (typeof nodes[i].lat === 'number' && typeof nodes[i].lon === 'number') {
        lat += nodes[i].lat; lon += nodes[i].lon; n++;
      }
    }
    return n ? [lat / n, lon / n] : [24, 12];
  };

  /* ── Chrome ───────────────────────────────────────────────────────── */

  NovaPulseMap.prototype._buildToggle = function () {
    var self = this;
    var host = this._root;

    /* Built node-by-node rather than via innerHTML, so the switch is a
       real element reference regardless of how the host page parses
       markup, and nothing user-supplied can reach innerHTML here. */
    var wrap = document.createElement('label');
    wrap.className = 'nps-toggle';

    var lbl = document.createElement('span');
    lbl.className = 'nps-toggle-lbl';
    lbl.setAttribute('data-lbl', '');
    lbl.textContent = 'Live Probing Active';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nps-switch';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', 'true');
    btn.setAttribute('aria-label', 'Live probing');

    var knob = document.createElement('i');
    btn.appendChild(knob);
    wrap.appendChild(lbl);
    wrap.appendChild(btn);
    host.insertBefore(wrap, this._frame);

    this._toggleEls = { wrap: wrap, btn: btn, knob: knob, lbl: lbl };

    btn.addEventListener('click', function () { self.setLive(!self._live); });
  };

  /* ── Controls bar: search, status filter, theme, expand ──────────── */
  NovaPulseMap.prototype._buildControls = function () {
    var self = this;
    var o = this.options;
    var bar = document.createElement('div');
    bar.className = 'nps-controls';

    if (o.showSearch) {
      var search = document.createElement('input');
      search.type = 'search';
      search.className = 'nps-search';
      search.placeholder = 'Search nodes…';
      search.setAttribute('aria-label', 'Search vantage points');
      search.value = this._query;
      search.addEventListener('input', function () { self.setSearch(search.value); });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { search.value = ''; self.setSearch(''); }
      });
      bar.appendChild(search);
      this._searchEl = search;
    }

    if (o.showTable) {
      var group = document.createElement('div');
      group.className = 'nps-filters';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Filter by status');

      [['all', 'All'], ['Operational', 'Operational'], ['Degraded', 'Degraded'], ['Down', 'Down']]
        .forEach(function (pair) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'nps-filter';
          b.dataset.filter = pair[0];
          b.textContent = pair[1];
          b.setAttribute('aria-pressed', pair[0] === self._filter ? 'true' : 'false');
          if (pair[0] === self._filter) b.classList.add('is-active');
          b.addEventListener('click', function () { self.setFilter(pair[0]); });
          group.appendChild(b);
        });
      bar.appendChild(group);
    }

    /* Theme + fit + export, grouped right. */
    var right = document.createElement('div');
    right.className = 'nps-actions';

    this._themeBtn = this._action(right, '◐', 'Toggle light / dark theme', function () {
      self.setTheme(self.options.theme === 'dark' ? 'light' : 'dark');
    });

    this._action(right, '⤢', 'Fit all nodes in view', function () { self.fit(); });

    this._action(right, '↧', 'Export node data as JSON', function () { self.exportJSON(); });
    this._action(right, '⨯', 'Clear latency history', function () { self.clearHistory(); });

    bar.appendChild(right);
    this._root.insertBefore(bar, this._frame);
    this._controlsEl = bar;
  };

  NovaPulseMap.prototype._action = function (parent, glyph, label, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'nps-action';
    b.textContent = glyph;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  };

  NovaPulseMap.prototype._applyThemeVars = function (theme) {
    var host = this._root;
    if (!host) return;
    var dark = theme !== 'light';
    host.setAttribute('data-theme', dark ? 'dark' : 'light');
    host.style.setProperty('--nps-ink',   dark ? '#0B0F14' : '#FFFFFF');
    host.style.setProperty('--nps-soft',  dark ? '#111823' : '#F1F5F9');
    host.style.setProperty('--nps-line',  dark ? '#243244' : '#CBD5E1');
    host.style.setProperty('--nps-fg',    dark ? '#E2E8F0' : '#0F172A');
    host.style.setProperty('--nps-faint', dark ? '#9FB0C6' : '#475569');
  };

  NovaPulseMap.prototype.setTheme = function (theme) {
    var host = this._root;
    if (!host) return this;
    var dark = theme !== 'light';

    this.options.theme = dark ? 'dark' : 'light';
    this._applyThemeVars(dark ? 'dark' : 'light');

    /* The invert filter is a property of the TILE, not the theme. Re-point
       the layer so the new theme renders correctly. */
    var preset = TILES[dark ? 'osmDark' : 'osmLight'];
    host.classList.toggle('nps-invert', !!preset.invert);

    if (this._layer && this._map) {
      this._map.removeLayer(this._layer);
      var cfg = { attribution: preset.attribution || '' };
      if (preset.maxZoom) cfg.maxZoom = preset.maxZoom;
      if (preset.subdomains) cfg.subdomains = preset.subdomains;
      this._layer = L.tileLayer(this.options.tileUrl || preset.url, cfg);
      this._layer.addTo(this._map);
    }

    this.emit('themechange', this.options.theme);
    return this;
  };

  /* Client-side export so a status page can offer its data without a
     round trip. Returns the object too, so callers can post it. */
  NovaPulseMap.prototype.exportJSON = function () {
    var payload = {
      generatedAt: new Date().toISOString(),
      state: this.getState(),
      history: this._history
    };
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'novapulse-probes.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      /* Revoke on the next tick; revoking synchronously cancels the
         download in some browsers. */
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { /* download is a convenience, not the contract */ }
    return payload;
  };

  /* ── Deep link: ?node=id or #node=id focuses a marker ─────────── */
  NovaPulseMap.prototype.focusNode = function (id) {
    var node = this.getNode(id);
    if (!node || !this._map) return this;
    this._interacted = true;
    this._map.setView([node.lat, node.lon], Math.max(this._map.getZoom(), 5), { animate: true });
    this.emit('focus', node);
    return this;
  };

  NovaPulseMap.prototype._syncDeepLink = function () {
    if (!this.options.deepLink || this._destroyed) return;
    try {
      var hash = (window.location.hash || '').replace(/^#/, '');
      var prev = this._deepNode;
      if (hash !== prev) {
        this._deepNode = hash;
        if (hash) this.focusNode(hash);
      }
    } catch (e) { /* cross-origin or sandboxed */ }
  };

  NovaPulseMap.prototype._buildLegend = function () {
    var el = document.createElement('div');
    el.className = 'nps-legend';
    el.setAttribute('aria-hidden', 'true');
    var self = this;
    ['Operational', 'Degraded', 'Down'].forEach(function (st) {
      var row = document.createElement('div');
      var dot = document.createElement('i');
      dot.style.background = self.options.colors[st];
      row.appendChild(dot);
      row.appendChild(document.createTextNode(st));
      el.appendChild(row);
    });
    this._frame.appendChild(el);
  };

  NovaPulseMap.prototype._buildHint = function () {
    var el = document.createElement('div');
    el.className = 'nps-hint';
    el.textContent = 'Scroll to zoom · drag to pan';
    this._frame.appendChild(el);
    this._hint = el;
  };

  NovaPulseMap.prototype._buildPanel = function () {
    var o = this.options;
    /* Needed by the sortable-header closure below. Without it, `self`
       resolved to window.self and every header click threw. */
    var self = this;
    var box = document.createElement('div');
    if (o.showStats) {
      var stats = document.createElement('div');
      stats.className = 'nps-stats';
      addCard(stats, 'Avg latency', 'npsAvg');
      if (o.showSparklines) {
        addCard(stats, 'p95 latency', 'npsP95');
        this._p95El = stats.querySelector('[data-npsP95]');
      }
      addCard(stats, 'Online', 'npsUp');
      addCard(stats, 'Degraded', 'npsWarn');
      addCard(stats, 'Down', 'npsDown');

      /* Feed health. Only meaningful when actually polling. */
      if (o.nodesUrl || o.autoRefresh) {
        var feed = document.createElement('p');
        feed.className = 'nps-feed';
        feed.setAttribute('role', 'status');
        feed.setAttribute('aria-live', 'polite');
        feed.textContent = 'Idle';
        this._feedEl = feed;
      }
      box.appendChild(stats);
      if (this._feedEl) box.appendChild(this._feedEl);
    }
    if (o.showTable) {
      var wrap = document.createElement('div');
      wrap.className = 'nps-table-wrap';

      var table = document.createElement('table');
      table.className = 'nps-table';

      var caption = document.createElement('caption');
      caption.className = 'nps-sr';
      caption.textContent = 'Edge probe vantage points, coordinates, latency and status';
      table.appendChild(caption);

      /* Column set depends on which optional metrics are enabled, and the
         header must stay in lockstep with _renderTable's cells. */
      var cols = ['Vantage point', 'Coordinates', 'Latency'];
      if (o.showSparklines) cols.push('p95');
      if (o.showUptime) cols.push('Uptime');
      cols.push('Status');

      var thead = document.createElement('thead');
      var hrow = document.createElement('tr');
      cols.forEach(function (label, i) {
        var th = document.createElement('th');
        th.setAttribute('scope', 'col');
        var numeric = label !== 'Vantage point' && label !== 'Coordinates';
        if (numeric) th.style.textAlign = 'right';
        th.textContent = label;

        if (o.sortableTable && label !== 'Vantage point') {
          var sortKey = { 'Latency': 'latency', 'p95': 'p95', 'Uptime': 'uptime',
                          'Status': 'status', 'Coordinates': 'region' }[label];
          if (sortKey) {
            th.className = 'nps-sortable';
            th.setAttribute('tabindex', '0');
            th.setAttribute('role', 'columnheader');
            th.setAttribute('aria-sort', 'none');
            var doSort = function () {
              var dir = (self._sort.key === sortKey && self._sort.dir === 1) ? -1 : 1;
              self.setSort(sortKey, dir);
              var heads = wrap.querySelectorAll('.nps-sortable');
              for (var i = 0; i < heads.length; i++) heads[i].setAttribute('aria-sort', 'none');
              th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
            };
            th.addEventListener('click', doSort);
            th.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSort(); }
            });
          }
        }
        hrow.appendChild(th);
      });
      thead.appendChild(hrow);
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      tbody.setAttribute('data-rows', '');
      table.appendChild(tbody);
      wrap.appendChild(table);
      box.appendChild(wrap);
      this._rows = tbody;
    }
    this._root.appendChild(box);
    this._panel = box;

    function addCard(parent, label, key) {
      var card = document.createElement('div');
      card.className = 'nps-stat';
      var k = document.createElement('p');
      k.className = 'nps-stat-k';
      k.textContent = label;
      var v = document.createElement('p');
      v.className = 'nps-stat-v';
      var span = document.createElement('span');
      span.setAttribute('data-' + key, '');
      span.textContent = '—';
      v.appendChild(span);
      card.appendChild(k);
      card.appendChild(v);
      parent.appendChild(card);
    }
  };

  /* ── Node data ────────────────────────────────────────────────────── */

  NovaPulseMap.prototype._normalize = function (nodes) {
    var self = this;
    var out = [];

    (nodes || []).forEach(function (n, i) {
      if (!n || typeof n !== 'object') return;

      /* Coerce, but reject anything that is not a real coordinate.
         Number(null) === 0 and Number('') === 0, so a null/blank field
         would otherwise land the node off the coast of Africa. */
      var lat = (n.lat === null || n.lat === '' || n.lat === undefined) ? NaN : Number(n.lat);
      var lon = (n.lon === null || n.lon === '' || n.lon === undefined) ? NaN : Number(n.lon);
      if (!isFinite(lat) || !isFinite(lon)) return;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      var status = n.status || 'Operational';
      if (!self.options.colors[status]) status = 'Operational';

      /* An absent latency is UNKNOWN, not 0 ms. Defaulting it to 0 faked a
         perfect reading in the table and poisoned p95 with a real zero.
         Keep it as null and let the display render an em dash. */
      var hasLatency = typeof n.latency === 'number' || typeof n.ms === 'number';
      var latency = hasLatency
        ? (typeof n.latency === 'number' ? n.latency : n.ms)
        : null;
      if (latency !== null && (!isFinite(latency) || latency < 0)) latency = null;

      out.push({
        id: n.id === undefined || n.id === null ? String(i) : String(n.id),
        name: n.name || ('Node ' + (i + 1)),
        region: n.region || '',
        /* Optional metadata carried straight through to the table. */
        provider: n.provider || '',
        country: n.country || '',
        uptime: isFinite(Number(n.uptime)) ? Number(n.uptime) : null,
        note: n.note || '',
        lat: lat,
        lon: lon,
        status: status,
        latency: latency,
        hasLatency: hasLatency
      });
    });

    /* Carry history and prior status forward across setNodes() so a
       live feed doesn't wipe the sparklines on every poll. */
    out.forEach(function (v) {
      var prev = self._history[v.id];
      if (prev) self._history[v.id] = prev;
      else self._history[v.id] = [];
    });

    /* Drop history for nodes that no longer exist, so the map cannot grow
       without bound when nodes churn. */
    var live = {};
    out.forEach(function (v) { live[v.id] = true; });
    Object.keys(self._history).forEach(function (id) {
      if (!live[id]) delete self._history[id];
    });

    return out;
  };

  NovaPulseMap.prototype.setNodes = function (nodes) {
    this._nodes = this._normalize(nodes);
    /* Sample incoming data too. History used to be recorded only while
       live:true, which meant a real polled feed (live:false, the
       recommended setting) produced empty sparklines forever. */
    this._nodes.forEach(function (v) { this._pushHistory(v); }, this);
    this._detectTransitions();
    this._renderTable();
    this._renderMarkers();
    this._refresh();
    this._persist();
    this._post({ type: 'nodes', count: this._nodes.length });
    return this;
  };

  /* ── Status transitions ────────────────────────────────────────────
     Fired when a node changes status, which is what an alerting hook
     wants — not on every poll. */
  NovaPulseMap.prototype._detectTransitions = function () {
    var self = this;
    this._nodes.forEach(function (v) {
      var was = self._prevStatus[v.id];
      self._prevStatus[v.id] = v.status;
      if (was === undefined || was === v.status) return;

      var detail = { id: v.id, name: v.name, from: was, to: v.status, at: Date.now() };
      self.emit('statuschange', detail);
      if (self.options.onStatusChange) self.options.onStatusChange(detail, self);

      /* Recovery is the case worth shouting about. */
      if (v.status === 'Operational' && was !== 'Operational') {
        self.emit('recovered', detail);
      }
    });
  };

  /* ── Latency history ─────────────────────────────────────────────── */

  /* Down and unknown-latency nodes both record null: the sparkline shows a
       gap rather than a fabricated 0 ms. */
  NovaPulseMap.prototype._pushHistory = function (v) {
    var h = this._history[v.id];
    if (!h) { h = this._history[v.id] = []; }
    var known = v.status !== 'Down' && v.hasLatency !== false &&
                v.latency !== null && isFinite(v.latency);
    h.push(known ? v.latency : null);
    var max = this.options.historyLength;
    while (h.length > max) h.shift();
  };

  NovaPulseMap.prototype.getHistory = function (id) {
    return (this._history[id] || []).slice();
  };

  NovaPulseMap.prototype.clearHistory = function () {
    this._history = {};
    this._prevStatus = {};
    this._renderTable();
    return this;
  };

  /* Percentiles need sorting; p50 is the median. Returns null when
     there is no usable sample. */
  NovaPulseMap.prototype.getPercentiles = function (id) {
    var samples = (this._history[id] || []).filter(function (x) {
      return x !== null && isFinite(x);
    });
    if (!samples.length) return null;
    var sorted = samples.slice().sort(function (a, b) { return a - b; });
    function at(p) {
      var idx = clampInt(Math.ceil((p / 100) * sorted.length) - 1, 0, 0, sorted.length - 1);
      return sorted[idx];
    }
    var sum = sorted.reduce(function (a, b) { return a + b; }, 0);
    return {
      samples: sorted.length,
      min: sorted[0],
      p50: at(50),
      p95: at(95),
      p99: at(99),
      max: sorted[sorted.length - 1],
      mean: Math.round(sum / sorted.length)
    };
  };

  /* ── Persistence ─────────────────────────────────────────────────── */

  NovaPulseMap.prototype._persist = function () {
    var key = this.options.persistKey;
    if (!key || this._destroyed) return;
    try {
      /* Deliberately not localStorage here: the caller may be in a
         sandboxed iframe where access throws. Guarded either way. */
      var store = (typeof window !== 'undefined') && window.localStorage;
      if (!store) return;
      store.setItem(key, JSON.stringify({
        nodes: this._nodes,
        live: this._live,
        at: Date.now()
      }));
    } catch (e) { /* quota or disabled storage — not fatal */ }
  };

  NovaPulseMap.prototype.restore = function () {
    var key = this.options.persistKey;
    if (!key) return null;
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.nodes)) {
        this.setNodes(data.nodes);
        this.setLive(data.live !== false);
        return data;
      }
    } catch (e) { /* corrupt payload — start clean */ }
    return null;
  };

  NovaPulseMap.prototype.getNodes = function () {
    return this._nodes.slice();
  };

  NovaPulseMap.prototype.getNode = function (id) {
    for (var i = 0; i < this._nodes.length; i++) {
      if (this._nodes[i].id === id) return Object.assign({}, this._nodes[i]);
    }
    return null;
  };

  /* ── Clustering ───────────────────────────────────────────────────── */

  NovaPulseMap.prototype._group = function () {
    var self = this;
    if (!this.options.cluster) {
      return this._nodes.map(function (v) { return [v]; });
    }
    var pts = this._nodes.map(function (v) {
      return { v: v, p: self._map.project([v.lat, v.lon], self._map.getZoom()) };
    });
    var used = new Array(pts.length).fill(false);
    var groups = [];
    var R = this.options.clusterRadius;

    for (var i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      var g = [pts[i].v];
      used[i] = true;
      for (var j = i + 1; j < pts.length; j++) {
        if (used[j]) continue;
        if (pts[i].p.distanceTo(pts[j].p) < R) { g.push(pts[j].v); used[j] = true; }
      }
      groups.push(g);
    }
    return groups;
  };

  NovaPulseMap.prototype._worst = function (list) {
    var worst = 'Operational';
    for (var i = 0; i < list.length; i++) {
      if ((STATUS_RANK[list[i].status] || 0) > (STATUS_RANK[worst] || 0)) worst = list[i].status;
    }
    return worst;
  };

  NovaPulseMap.prototype._renderMarkers = function () {
    if (!this._markerLayer || this._destroyed || !this._map) return;
    var self = this;
    this._markerLayer.clearLayers();
    this._rendered = [];

    this._group().forEach(function (group, i) {
      var status = self._worst(group);
      var solo = group.length === 1;

      var icon = solo
        ? L.divIcon({
            className: 'nps-icon',
            html: '<span class="nps-pulse d' + (i % 4) + '"></span><span class="nps-dot"></span>',
            iconSize: [24, 24], iconAnchor: [12, 12], tooltipAnchor: [0, -14]
          })
        : L.divIcon({
            className: 'nps-icon nps-cluster',
            html: '<span class="nps-pulse d' + (i % 4) + '"></span><span class="nps-ring"></span>' +
                  '<span class="nps-count">' + group.length + '</span>',
            iconSize: [32, 32], iconAnchor: [16, 16], tooltipAnchor: [0, -18]
          });

      var pos = solo
        ? [group[0].lat, group[0].lon]
        : [group.reduce(function (s, v) { return s + v.lat; }, 0) / group.length,
           group.reduce(function (s, v) { return s + v.lon; }, 0) / group.length];

      var m = L.marker(pos, {
        icon: icon,
        keyboard: true,
        riseOnHover: true,
        title: solo ? group[0].name : group.map(function (v) { return v.name; }).join(', ')
      });
      m.bindTooltip(solo ? self._tipNode(group[0]) : self._tipCluster(group, status), {
        direction: 'top', opacity: 1, sticky: true, className: 'nps-tip', interactive: false
      });
      m.addTo(self._markerLayer);

      var el = m.getElement();
      if (el) {
        el.dataset.status = status;
        el.style.setProperty('--c', self.options.colors[status]);
      }
      self._rendered.push({ marker: m, group: group, solo: solo });
    });
  };

  NovaPulseMap.prototype._tipNode = function (v) {
    var c = this.options.colors[v.status];
    var html = '<div style="--c:' + c + '">' +
      '<div class="nps-tip-name">' + escapeHtml(v.name) + '</div>' +
      ((v.region || v.country) ? '<div class="nps-tip-city">' +
        escapeHtml([v.country, v.region].filter(Boolean).join(' · ')) + '</div>' : '') +
      '<div class="nps-tip-row"><span class="nps-tip-k">Latency</span>' +
      '<span class="nps-tip-lat">' + (this._latencyText(v)) +
      this._trendArrow(v) + '</span></div>';

    if (this.options.showSparklines) html += this._sparkline(v);

    var p = this.options.showSparklines ? this.getPercentiles(v.id) : null;
    if (p) {
      html += '<div class="nps-tip-row"><span class="nps-tip-k">p50 / p95</span>' +
        '<span class="nps-tip-lat">' + p.p50 + ' / ' + p.p95 + ' ms</span></div>';
    }
    if (v.uptime !== null) {
      html += '<div class="nps-tip-row"><span class="nps-tip-k">Uptime 90d</span>' +
        '<span class="nps-tip-lat">' + v.uptime.toFixed(2) + '%</span></div>';
    }
    if (v.note) {
      html += '<div class="nps-tip-note">' + escapeHtml(v.note) + '</div>';
    }

    return html +
      '<div class="nps-tip-row"><span class="nps-tip-k">Status</span>' +
      '<span class="nps-tip-badge"><i></i>' + v.status + '</span></div></div>';
  };

  /* One place decides how a latency renders, so the table, tooltip and
     export can never disagree about whether a reading exists. */
  NovaPulseMap.prototype._latencyText = function (v) {
    if (v.status === 'Down') return '—';
    if (v.hasLatency === false || v.latency === null || !isFinite(v.latency)) return '—';
    return v.latency + ' ms';
  };

  NovaPulseMap.prototype._latencyValue = function (v) {
    if (v.status === 'Down') return Infinity;   /* sorts worst */
    if (v.hasLatency === false || v.latency === null || !isFinite(v.latency)) return Infinity;
    return v.latency;
  };

  /* Compares the last two samples. Kept cheap and honest — no fake
     precision, and no arrow when there isn't enough history. */
  NovaPulseMap.prototype._trendArrow = function (v) {
    var h = this._history[v.id];
    if (!this.options.showTrend || !h || h.length < 4) return '';
    var tail = h.filter(function (x) { return x !== null; });
    if (tail.length < 4) return '';
    var recent = tail.slice(-3).reduce(function (a, b) { return a + b; }, 0) / 3;
    var prior = tail.slice(-9, -3);
    if (!prior.length) return '';
    var base = prior.reduce(function (a, b) { return a + b; }, 0) / prior.length;
    var delta = ((recent - base) / Math.max(base, 1)) * 100;
    if (Math.abs(delta) < 8) return '<span class="nps-trend flat">→</span>';
    if (delta > 0) return '<span class="nps-trend up" title="' +
      Math.round(delta) + '% slower">↑ ' + Math.round(delta) + '%</span>';
    return '<span class="nps-trend down" title="' +
      Math.round(-delta) + '% faster">↓ ' + Math.round(-delta) + '%</span>';
  };

  /* Inline SVG sparkline. Uses preserveAspectRatio="none" so it stretches
     to the tooltip width without recomputing points per pixel. */
  NovaPulseMap.prototype._sparkline = function (v) {
    var h = (this._history[v.id] || []).filter(function (x) { return x !== null; });
    if (h.length < 2) return '';
    var W = 160, H = 28, PAD = 2;
    var min = Math.min.apply(null, h);
    var max = Math.max.apply(null, h);
    var span = (max - min) || 1;
    var step = W / (h.length - 1);

    var pts = h.map(function (y, i) {
      var x = +(i * step).toFixed(1);
      var yy = +(H - PAD - ((y - min) / span) * (H - PAD * 2)).toFixed(1);
      return x + ',' + yy;
    });

    var c = this.options.colors[v.status];
    return '<div class="nps-spark" aria-hidden="true">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + c + '" stroke-width="1.5" ' +
      'stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/>' +
      '</svg><span class="nps-spark-range">' + min + '–' + max + ' ms</span></div>';
  };

  NovaPulseMap.prototype._tipCluster = function (group, status) {
    var alive = group.filter(function (v) { return v.status !== 'Down'; });
    var avg = alive.length
      ? Math.round(alive.reduce(function (s, v) { return s + v.latency; }, 0) / alive.length)
      : null;
    var c = this.options.colors[status];
    return '<div style="--c:' + c + '">' +
      '<div class="nps-tip-name">' + group.length + ' vantage points</div>' +
      '<div class="nps-tip-city">' + escapeHtml(group.map(function (v) { return v.name; }).join(' · ')) + '</div>' +
      '<div class="nps-tip-row"><span class="nps-tip-k">Avg latency</span>' +
      '<span class="nps-tip-lat">' + (avg === null ? '—' : avg + ' ms') + '</span></div>' +
      '<div class="nps-tip-row"><span class="nps-tip-k">Status</span>' +
      '<span class="nps-tip-badge"><i></i>' + status + '</span></div></div>';
  };

  /* ── Data refresh ─────────────────────────────────────────────────── */

  NovaPulseMap.prototype._jitter = function (v) {
    var spread = v.status === 'Down' ? 0 : v.latency * this.options.jitter;
    return Math.max(1, Math.round(v.latency + (Math.random() * 2 - 1) * spread));
  };

  NovaPulseMap.prototype._refresh = function () {
    if (this._destroyed || !this._map) return;
    var self = this;

    /* Sample BEFORE jittering, so the sparkline plots the measurement that
       produced the displayed number. A Down node records null — a gap,
       not a zero, which would fake a healthy 0 ms reading.

       setNodes() records incoming samples too, so this is skipped while
       polling; otherwise every poll would be counted twice. */
    if (this._live && !this.options.nodesUrl && !this._booting) {
      this._nodes.forEach(function (v) {
        self._pushHistory(v);
        if (v.status !== 'Down' && v.hasLatency !== false) v.latency = self._jitter(v);
      });
    } else if (this._live && !this._booting) {
      this._nodes.forEach(function (v) {
        if (v.status !== 'Down' && v.hasLatency !== false) v.latency = self._jitter(v);
      });
    }

    this._rendered.forEach(function (r) {
      var status = self._worst(r.group);
      r.marker.setTooltipContent(r.solo ? self._tipNode(r.group[0]) : self._tipCluster(r.group, status));
      var el = r.marker.getElement();
      if (el) {
        el.dataset.status = status;
        el.style.setProperty('--c', self.options.colors[status]);
      }
      if (!r.solo) return;
      r.marker.off('click');
      r.marker.on('click', function () {
        self.emit('nodeclick', self.getNode(r.group[0].id));
        if (self.options.onNodeClick) self.options.onNodeClick(self.getNode(r.group[0].id), self);
      });
    });

    this._renderRows();
    this._renderStats();
    this._persist();
    this._post({ type: 'state', state: this.getState() });
  };

  /* ── Panels ───────────────────────────────────────────────────────── */

  /* ── Filtering, search, sorting ─────────────────────────────────── */

  NovaPulseMap.prototype._visible = function () {
    var q = this._query.toLowerCase();
    var f = this._filter;
    return this._nodes.filter(function (v) {
      if (f !== 'all' && v.status !== f) return false;
      if (!q) return true;
      return (v.name + ' ' + v.region + ' ' + v.country + ' ' + v.id + ' ' + v.provider)
        .toLowerCase().indexOf(q) !== -1;
    });
  };

  NovaPulseMap.prototype._sortNodes = function (list) {
    var s = this._sort;
    var self = this;
    var get = {
      name: function (v) { return (v.name || '').toLowerCase(); },
      latency: function (v) { return self._latencyValue(v); },
      status: function (v) { return STATUS_RANK[v.status] || 0; },
      region: function (v) { return (v.region || '').toLowerCase(); },
      uptime: function (v) { return v.uptime === null ? -1 : v.uptime; },
      p95: function (v) { var p = self.getPercentiles(v.id); return p ? p.p95 : -1; }
    };
    var key = get[s.key] || get.name;
    return list.slice().sort(function (a, b) {
      var A = key(a), B = key(b);
      if (A < B) return -1 * s.dir;
      if (A > B) return 1 * s.dir;
      return 0;
    });
  };

  NovaPulseMap.prototype.setFilter = function (status) {
    this._filter = status || 'all';
    this._renderTable();
    this._syncControls();
    return this;
  };

  NovaPulseMap.prototype.setSearch = function (q) {
    this._query = q || '';
    this._renderTable();
    if (this._searchEl) this._searchEl.value = this._query;
    return this;
  };

  NovaPulseMap.prototype.setSort = function (key, dir) {
    this._sort = { key: key || 'name', dir: dir === -1 ? -1 : 1 };
    this._renderTable();
    return this;
  };

  NovaPulseMap.prototype._syncControls = function () {
    if (!this._root || !this._root.querySelectorAll) return;
    var btns = this._root.querySelectorAll('.nps-filter');
    for (var i = 0; i < btns.length; i++) {
      var on = !!(btns[i].dataset && btns[i].dataset.filter === this._filter);
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };

  /* ── Stats ──────────────────────────────────────────────────────── */

  NovaPulseMap.prototype._renderStats = function () {
    if (!this.options.showStats) return;
    var self = this;
    var nodes = this._nodes;
    var up = 0, warn = 0, down = 0, alive = [];
    nodes.forEach(function (v) {
      if (v.status === 'Down') down++;
      else if (v.status === 'Degraded') { warn++; alive.push(v); }
      else { up++; alive.push(v); }
    });
    /* Mean over nodes that actually reported a number. A node with no
       reading yet must not drag the average toward zero. */
    var measured = alive.filter(function (v) { return isFinite(self._latencyValue(v)); });
    var avg = measured.length
      ? Math.round(measured.reduce(function (s, v) { return s + v.latency; }, 0) / measured.length)
      : 0;

    /* Global p95 — the number that matters more than a mean for a
       latency SLO, since means hide tail latency. */
    var all = [];
    nodes.forEach(function (v) {
      (self._history[v.id] || []).forEach(function (x) {
        if (x !== null && isFinite(x)) all.push(x);
      });
    });
    all.sort(function (a, b) { return a - b; });
    var p95 = all.length
      ? all[clampInt(Math.ceil(0.95 * all.length) - 1, 0, 0, all.length - 1)]
      : null;

    var set = function (key, val, color) {
      var el = this._root.querySelector('[data-' + key + ']');
      if (!el) return;
      el.textContent = val;
      if (color) el.style.color = color;
    };
    set.call(this, 'npsAvg', avg + ' <small>ms</small>');
    if (this._p95El) this._p95El.textContent = p95 === null ? '—' : p95 + ' ms';
    set.call(this, 'npsUp', (up + warn) + ' <small>/' + nodes.length + '</small>', this.options.colors.Operational);
    set.call(this, 'npsWarn', warn, this.options.colors.Degraded);
    set.call(this, 'npsDown', down, this.options.colors.Down);

    var banner = this._root.querySelector('[data-nps-banner]');
    if (banner) {
      var st = down ? 'Down' : warn ? 'Degraded' : 'Operational';
      var c = this.options.colors[st];
      banner.textContent = down ? 'Partial Outage' : warn ? 'Degraded Performance' : 'All Systems Operational';
      banner.style.color = c;
      banner.style.background = c + '22';
      banner.style.borderColor = c + '55';
    }

    /* Feed health, so a silent polling failure reads as a broken feed
       rather than a network that simply stopped changing.

       Colour comes from the theme's muted text, NOT the status palette:
       green/red are marker colours that sit on the dark map, and at
       12px on a white theme they measured 2.27:1. A leading glyph plus
       the wording carries the state; the text colour stays AA. */
    if (this._feedEl) {
      var fs = this._feedStatus;
      this._feedEl.textContent =
          fs === 'ok'       ? '\u2713 Updated ' + new Date(this._lastOk).toLocaleTimeString()
        : fs === 'error'   ? '\u26A0 Feed unreachable'
        : fs === 'loading' ? '\u2026 Updating'
        : 'Idle';
      this._feedEl.classList.toggle('is-error', fs === 'error');
      this._feedEl.classList.toggle('is-live', fs === 'ok');
    }
  };

  /* ── Live feed: polling with exponential backoff ────────────────── */

  NovaPulseMap.prototype.poll = function (url) {
    var self = this;
    var endpoint = url || this.options.nodesUrl;
    if (!endpoint || this._destroyed || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }

    this._feedStatus = 'loading';
    this._renderStats();

    return fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && data.nodes);
        if (!Array.isArray(list)) throw new Error('expected an array or { nodes: [] }');

        self._consecutiveErrors = 0;
        self._backoffMs = self.options.refreshMs;   /* recovered */
        self._feedStatus = 'ok';
        self._lastOk = Date.now();
        self.setNodes(list);
        self.emit('feed', { nodes: list.length, at: self._lastOk });
        return list;
      })
      .catch(function (err) {
        self._consecutiveErrors++;
        self._feedStatus = 'error';

        /* Hammering a failing endpoint earns a rate limit and makes
           recovery slower. Grow the interval, but cap the growth. */
        if (self.options.refreshBackoff) {
          self._backoffMs = Math.min(
            self.options.refreshMs * Math.pow(2, Math.min(self._consecutiveErrors, 6)),
            self.options.refreshMs * 32
          );
        }

        var detail = {
          error: err && err.message ? err.message : String(err),
          attempts: self._consecutiveErrors,
          url: endpoint
        };
        self.emit('error', detail);
        if (self.options.onFeedError) self.options.onFeedError(detail, self);
        self._renderStats();
        return null;
      });
  };

  NovaPulseMap.prototype.startPolling = function (url) {
    var self = this;
    this.stopPolling();
    var run = function () {
      self.poll(url).then(function () {
        if (self._destroyed) return;
        /* Give up only after sustained failure, so a blip never kills
           the feed permanently. */
        if (self._feedStatus === 'error' && self._consecutiveErrors > 8) {
          self.emit('feedstopped', { attempts: self._consecutiveErrors });
          return;
        }
        self._pollTimer = setTimeout(run, self._backoffMs || self.options.refreshMs);
      });
    };
    run();
    return this;
  };

  NovaPulseMap.prototype.stopPolling = function () {
    if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
    return this;
  };

  NovaPulseMap.prototype._renderTable = function () {
    if (!this._rows) return;
    var self = this;
    var sorted = this._sortNodes(this._visible());

    if (!sorted.length) {
      this._rows.innerHTML = '<tr><td colspan="6" class="nps-empty">' +
        (this._nodes.length ? 'No nodes match this filter.'
                            : 'No probe data.') + '</td></tr>';
      return;
    }

    this._rows.innerHTML = sorted.map(function (v) {
      var c = self.options.colors[v.status];
      var p = self.options.showSparklines ? self.getPercentiles(v.id) : null;

      return '<tr>' +
        '<th scope="row"><span class="nps-dotmark" style="background:' + c + '"></span>' +
          escapeHtml(v.name) +
          (v.country ? '<span class="nps-sub">' + escapeHtml(v.country) + '</span>' : '') +
        '</th>' +
        '<td class="nps-coord">' + v.lat.toFixed(4) + ', ' + v.lon.toFixed(4) + '</td>' +
        '<td class="nps-num" data-lat="' + v.id + '">—</td>' +
        (self.options.showSparklines
          ? '<td class="nps-num" data-p95="' + v.id + '">' +
            (p ? p.p95 + ' ms' : '—') + '</td>' : '') +
        (self.options.showUptime
          ? '<td class="nps-num" data-up="' + v.id + '">' +
            (v.uptime === null ? '—' : v.uptime.toFixed(2) + '%') + '</td>' : '') +
        '<td class="nps-stat-cell"><span class="nps-pill" data-badge="' + v.id +
          '" style="color:' + c + ';background:' + c + '22;border-color:' + c + '55">' +
          v.status + '</span></td>' +
      '</tr>';
    }).join('');
  };

  /* Cells are patched in place on every tick. Rebuilding the rows here
     would discard the user's sort order, scroll position and any in-cell
     selection roughly four times a minute. */
  NovaPulseMap.prototype._renderRows = function () {
    if (!this._rows) return;
    var self = this;

    /* Only rows currently in the DOM are visible, so only those can be
       stale — and a node hidden by the filter is intentionally skipped. */
    var visible = {};
    this._visible().forEach(function (v) { visible[v.id] = true; });

    this._nodes.forEach(function (v) {
      if (!visible[v.id]) return;

      var cell = self._rows.querySelector('[data-lat="' + v.id + '"]');
      if (cell) cell.textContent = self._latencyText(v);

      if (self.options.showSparklines) {
        var p95 = self._rows.querySelector('[data-p95="' + v.id + '"]');
        if (p95) {
          var p = self.getPercentiles(v.id);
          p95.textContent = p ? p.p95 + ' ms' : '—';
        }
      }

      var pill = self._rows.querySelector('[data-badge="' + v.id + '"]');
      if (pill) {
        var c = self.options.colors[v.status];
        pill.textContent = v.status;
        pill.style.color = c;
        pill.style.background = c + '22';
        pill.style.borderColor = c + '55';
      }
    });
  };

  /* ── Live toggle ──────────────────────────────────────────────────── */

  NovaPulseMap.prototype.setLive = function (on_) {
    this._live = !!on_;
    if (this._toggleEls) {
      var e = this._toggleEls;
      e.wrap.classList.toggle('is-off', !this._live);
      e.btn.classList.toggle('is-off', !this._live);
      e.btn.setAttribute('aria-checked', String(this._live));
      e.knob.style.transform = this._live ? 'translateX(0)' : 'translateX(18px)';
      e.lbl.textContent = this._live ? 'Live Probing Active' : 'Probing Paused';
    }
    this._start();
    this.emit('livechange', this._live);
    this._post({ type: 'live', live: this._live });
    return this;
  };

  NovaPulseMap.prototype.toggleLive = function () { return this.setLive(!this._live); };
  NovaPulseMap.prototype.isLive = function () { return this._live; };

  /* ── Timer ────────────────────────────────────────────────────────── */

  /* Interval is anchored by a deadline rather than chained .then() so a
     backgrounded tab can't cause a burst of catch-up refreshes when the
     browser throttles timers to once a minute. */
  NovaPulseMap.prototype._start = function () {
    var self = this;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._destroyed || !this.options.autoRefresh) return;

    /* Hidden tabs get a long interval instead of none: the map should
       still be roughly correct when the tab is backgrounded, and some
       users run a status page in a pinned tab all day. */
    if (typeof document !== 'undefined' && document.hidden) {
      this._timer = setInterval(function () { self._refresh(); },
        Math.max(this.options.refreshMs, 60000));
      return;
    }

    this._timer = setInterval(function () { self._refresh(); },
      this._live ? this.options.refreshMs : this.options.refreshMs * 3);
  };

  /* ── Sizing ───────────────────────────────────────────────────────── */

  NovaPulseMap.prototype._fit = function () {
    if (this._destroyed || !this._map) return;
    if (this._nodes.length < 2) return;
    /* LatLngBounds from two points spanning the antimeridian yields an
       empty/inverted box, and fitBounds on that throws. Fall back to a
       plain fit over the widest safe zoom. */
    var lats = this._nodes.map(function (v) { return v.lat; });
    var lons = this._nodes.map(function (v) { return v.lon; });
    var latSpan = Math.max.apply(null, lats) - Math.min.apply(null, lats);
    var lonSpan = Math.max.apply(null, lons) - Math.min.apply(null, lons);
    if (!(latSpan >= 0) || !(lonSpan >= 0)) return;
    var b = L.latLngBounds(this._nodes.map(function (v) { return [v.lat, v.lon]; }));
    var BLEED = 14;
    this._map.fitBounds(b, {
      paddingTopLeft: [BLEED, BLEED],
      paddingBottomRight: [BLEED, BLEED],
      animate: false
    });
  };

  NovaPulseMap.prototype.invalidateSize = function () {
    if (this._destroyed || !this._map) return this;
    /* Measure the SURFACE, not the host. The host is a stack that can be
       taller than the map (toggle + panel), and after destroy() Leaflet
       reports a zero size — either path produces a bogus fitBounds. */
    var surface = this._frame;
    if (!surface || !surface.clientWidth || !surface.clientHeight) return this;
    this._map.invalidateSize({ pan: false, animate: false });
    if (!this._interacted) this._fit();
    return this;
  };

  /* ── Map controls ─────────────────────────────────────────────────── */

  /* All guarded: Leaflet's remove() detaches the container, so calling
     into it afterwards throws inside Leaflet, not here. */
  NovaPulseMap.prototype.zoomIn = function () {
    if (!this._destroyed && this._map) this._map.zoomIn();
    return this;
  };
  NovaPulseMap.prototype.zoomOut = function () {
    if (!this._destroyed && this._map) this._map.zoomOut();
    return this;
  };
  NovaPulseMap.prototype.fit = function () {
    if (this._destroyed || !this._map) return this;
    this._interacted = false;
    this._fit();
    return this;
  };
  NovaPulseMap.prototype.setView = function (latlng, zoom) {
    if (this._destroyed || !this._map) return this;
    this._interacted = true;
    this._map.setView(latlng, zoom);
    return this;
  };
  NovaPulseMap.prototype.getZoom = function () {
    return (this._destroyed || !this._map) ? null : this._map.getZoom();
  };

  /* ── Hint ─────────────────────────────────────────────────────────── */

  NovaPulseMap.prototype._dismissHint = function () {
    if (this._hinted || !this._hint) return;
    this._hinted = true;
    this._hint.style.opacity = '0';
    var h = this._hint;
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 450);
  };

  /* ── Embed (postMessage) protocol ─────────────────────────────────── */

  NovaPulseMap.prototype._post = function (msg) {
    if (!this.options.emitStateToParent) return;
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(Object.assign({ __novaPulse: 1 }, msg), '*');
    } catch (e) { /* cross-origin parent blocks it; safe to ignore */ }
  };

  NovaPulseMap.prototype._onMessage = function (ev) {
    var d = ev && ev.data;
    if (!d || d.__novaPulse !== 1 || typeof d.type !== 'string') return;
    var self = this;
    switch (d.type) {
      case 'ping':  this._post({ type: 'ready', state: this.getState() }); break;
      case 'getState': this._post({ type: 'state', state: this.getState() }); break;
      case 'setNodes': this.setNodes(d.nodes || []); break;
      case 'setLive':  this.setLive(!!d.live); break;
      case 'resize':  this.invalidateSize(); break;
      case 'fit':     this.fit(); break;
      default: break;
    }
  };

  /* ── State ────────────────────────────────────────────────────────── */

  NovaPulseMap.prototype.getState = function () {
    if (this._destroyed) {
      return {
        version: VERSION, live: false, zoom: null, nodes: [],
        counts: { Operational: 0, Degraded: 0, Down: 0 },
        status: 'Operational', clusters: 0
      };
    }
    var counts = { Operational: 0, Degraded: 0, Down: 0 };
    this._nodes.forEach(function (v) { counts[v.status] = (counts[v.status] || 0) + 1; });
    var worst = this._worst(this._nodes);
    return {
      version: VERSION,
      live: this._live,
      zoom: this._map ? this._map.getZoom() : this.options.zoom,
      nodes: this.getNodes(),
      counts: counts,
      status: worst,
      clusters: this._rendered.filter(function (r) { return !r.solo; }).length
    };
  };

  /* ── Teardown ─────────────────────────────────────────────────────── */

  NovaPulseMap.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.stopPolling();
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    this._offs.forEach(function (off) { try { off(); } catch (e) {} });
    this._offs = [];
    if (this._map) { try { this._map.remove(); } catch (e) {} }
    this._root.innerHTML = '';
    this._root.classList.remove('nps', 'nps-invert', 'nps-anim');
    /* Only clear the back-reference if it still points at us, so a
       destroy() on a stale instance cannot unclaim a newer mount. */
    if (this._root.__npsInstance === this) delete this._root.__npsInstance;
    this._root.style.removeProperty('--nps-height');
    this._root.style.removeProperty('--nps-ink');
    this.emit('destroy', null);
    this._h = {};
  };

  /* ══════════════════════════════════════════════════════════════════
     Auto-init:  <div data-novapulse-map data-nodes='[...]'></div>
     ══════════════════════════════════════════════════════════════════ */

  function readOptionsFromAttrs(el) {
    var o = { container: el };
    var map = {
      'data-nodes': 'nodes', 'data-tile': 'tile', 'data-theme': 'theme',
      'data-tile-url': 'tileUrl', 'data-height': 'height', 'data-zoom': 'zoom',
      'data-nodes-url': 'nodesUrl', 'data-refresh': 'refreshMs'
    };
    Object.keys(map).forEach(function (attr) {
      var raw = el.getAttribute(attr);
      if (raw == null) return;
      var key = map[attr];
      if (key === 'nodes') { try { o.nodes = JSON.parse(raw); } catch (e) {} }
      else if (key === 'height' || key === 'zoom' || key === 'refreshMs') o[key] = Number(raw);
      else o[key] = raw;
    });
    ['cluster', 'showLegend', 'showScale', 'showHint', 'scrollWheelZoom'].forEach(function (k) {
      var raw = el.getAttribute('data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
      if (raw != null) o[k] = raw !== 'false';
    });
    ['showToggle', 'showStats', 'showTable'].forEach(function (k) {
      var raw = el.getAttribute('data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }));
      if (raw != null) o[k] = raw !== 'false';
    });
    return o;
  }

  function autoInit() {
    var nodes = document.querySelectorAll('[data-novapulse-map]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__npsInstance) continue;
      try {
        /* The constructor now records __npsInstance itself, so calling
           mount() again is a no-op instead of a double mount. */
        var inst = new NovaPulseMap(readOptionsFromAttrs(nodes[i]));
        /* A JSON source turns the widget into a live status embed. */
        if (inst.options.nodesUrl) {
          fetch(inst.options.nodesUrl, { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              inst.setNodes(Array.isArray(data) ? data : (data.nodes || []));
            })
            .catch(function () { inst.emit('error', { code: 'nodes-fetch' }); });
        }
      } catch (e) {
        console.error('[NovaPulseMap] auto-init failed', e);
      }
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      autoInit();
    }
  }

  /* ── Exports ──────────────────────────────────────────────────────── */

  NovaPulseMap.VERSION = VERSION;
  NovaPulseMap.TILES = TILES;
  NovaPulseMap.STATUS_COLOR = STATUS_COLOR;
  NovaPulseMap.create = function (o) { return new NovaPulseMap(o); };
  NovaPulseMap.mount = function (o) { return autoInit(); };
  NovaPulseMap.autoInit = autoInit;

  return NovaPulseMap;
});