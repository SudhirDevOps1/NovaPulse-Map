# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-10-08

Documentation is now rendered as HTML instead of being linked as raw
Markdown.

### Added

- `scripts/docs.mjs` renders every Markdown doc into a real page with a
  sidebar, syntax highlighting and copy buttons. It is a small
  CommonMark+GFM subset and adds no dependency.
- `scripts/doc-style.css` and `scripts/doc-client.js` hold the page CSS and
  the inlined highlighter, so the regexes stay literals instead of escaped
  template-literal soup.
- `npm run docs` re-renders the docs. `docs.mjs --check` fails if the
  committed HTML has drifted from its Markdown, and CI runs it.
- `README.html`, `CHANGELOG.html`, `CONTRIBUTING.html` and `docs/*.html`
  are committed for the same reason `dist/` is — Pages has no build step.
- Six test assertions covering the docs: page generation, links never
  pointing at raw `.md`, headings surviving a BOM, tables not going ragged
  on an escaped pipe, no blank header cells, and docs/Markdown sync.

### Fixed

- Every footer and README link on the site pointed at a `.md` file, which
  GitHub Pages serves as `text/plain`, so the reader got a wall of Markdown
  source instead of the documentation.
- `CHANGELOG.md`, `README.md` and `docs/DEPLOY.md` each carried a UTF-8
  BOM. The invisible character stopped the first `#` from matching its
  heading regex, so those pages rendered a literal `# Changelog` paragraph
  with no `<h1>`.
- An orphaned ``` fence in `README.md` swallowed the prose that followed
  it into a code block, stealing the language tag for the next block.
- Table cells containing an escaped pipe (`` `dark` \| `light` ``) were
  split into extra columns, leaving those rows ragged.
- The Performance table in `README.md` had an empty header row, which axe
  reports as a large table whose cells have no headers.
- Generated tables now emit `scope="col"`, and the horizontal scroll
  container is a wrapper element. `display:block` on the `<table>` itself
  was stripping its table semantics.

## [1.1.0] - 2026-10-08

Advanced feature set. Everything is **opt-in** - v1.0.0 defaults are preserved
exactly, so upgrading is not a breaking change.

### Added

- **Latency history & sparklines** - a bounded per-node ring buffer
  (`historyLength`, default 24) rendered as an inline SVG in the tooltip.
  `getHistory(id)` and `getPercentiles(id)` expose the raw samples.
- **p95 latency** - a stat card plus a sortable column, computed across all
  nodes' samples. The mean hides tail latency; p95 matches an SLO.
- **Trend indicators** - up/down/flat versus the previous samples, suppressed
  below an 8% change so it does not flicker on noise.
- **Live polling with exponential backoff** - `poll()`, `startPolling()`,
  `stopPolling()`. The interval doubles on failure (capped at
  `refreshMs x 32`) and resets the instant a poll succeeds. Gives up after 8
  consecutive failures and emits `feedstopped`.
- **Search, status filter and sorting** - `setSearch`, `setFilter`,
  `setSort`. Search spans name, region, country, id and provider. Filters and
  search affect the table only; markers always show every node, because hiding
  a failing probe behind an active search is how outages get missed.
- **Sortable table columns** - click, or Tab then Enter/Space, with
  `aria-sort` maintained. Keyboard-sortable is not optional.
- **Live theme switch** - `setTheme()` swaps the tile layer, the CSS custom
  properties and the invert filter.
- **Incident detection** - `statuschange` fires once per real transition (a
  no-op `setNodes()` emits nothing), and `recovered` fires specifically on a
  return to `Operational`.
- **Feed health indicator** - as an `aria-live` status region. Without it a
  silently dead feed looks identical to a healthy network.
- **JSON export** - `exportJSON()` returns `{ generatedAt, state, history }`
  and triggers a download; callers can POST it instead.
- **Deep linking** - `deepLink: true` reads `location.hash` and flies to a node.
- **Persistence** - `persistKey` writes state to `localStorage`; `restore()`
  reads it back. Guarded throughout, since storage throws in sandboxed frames.
- **Extra node metadata** - `country`, `provider`, `uptime` and `note` are
  carried through. `country` and `provider` widen the search index.
- **Background-tab handling** - `pauseWhenHidden` drops the interval to 60s or
  more when hidden and re-anchors it on return, avoiding a burst of catch-up
  refreshes after browser throttling.
- **Controls bar** - `showControls` adds search, status filters, theme, fit,
  export and clear-history.
- **Example 5 (advanced)** - every feature enabled against a live feed.
- **Dev server flag API** - `/api/flags` and `/api/reset`, so the demo
  exercises real feed behaviour rather than faking it in the page.
- **docs/ADVANCED.md** and **docs/DEPLOY.md**.
- **71 tests**, up from 40.

### Fixed

- **Sortable headers threw on every click.** `_buildPanel` never declared
  `var self`, so the sort closure resolved `self` to `window.self`. Caught
  in-browser, not by the test suite.
- **A polled feed produced empty sparklines forever.** History was recorded
  only while `live: true`, which is exactly what you should not use with a real
  feed. `setNodes` now samples incoming data too.
- **The first sample was recorded twice.** `setNodes` calls `_refresh`
  internally, so both sampled the same data. Added a `_booting` guard.
- **Polled samples were double-counted.** With a `nodesUrl`, each poll would
  have recorded two samples. Guarded, with a test asserting exactly one.
- **A missing `latency` became `0 ms`.** Fabricated zeros dragged p95 down and
  made a broken probe look like the fastest node on the map. Latency is now
  null when unknown: it renders as a dash, records a sparkline gap, and is
  excluded from the average and p95.
- **The average counted unmeasured nodes.** A node with no reading yet pulled
  the mean toward zero. Now averaged over measured nodes only.
- **Unknown-latency nodes sorted as 0 ms.** They now sort last.
- **Live jitter fabricated a reading** for a node that had never reported one.
- **Feed text failed AA contrast** (2.27:1) on a light theme - it used the
  status palette, whose colours are sized for the dark map. Now uses
  theme-aware text with a glyph carrying the state.
- **Attribution links failed contrast in light theme** (1.5:1) for the same
  reason. Colour now follows `--nps-fg`.
- **The legend and hint chips failed contrast** (1.98:1) over a light map;
  their translucent backdrops also made the effective background
  unpredictable. Both are now opaque and theme-aware.
- **`_pollTimer` was never initialised**, so `stopPolling()` on a fresh
  instance reported a stale value.

### Notes on decisions

- **Filters hide table rows, never markers.** A search that also removed
  failing markers would quietly hide the reason someone opened the page.
- **Sparklines are `aria-hidden`.** The numbers beside them carry the meaning;
  announcing a polyline would be noise.
- **Search indexes provider and country**, not just name, because status pages
  are usually searched by carrier or region.

---

## [1.0.0] - 2026-10-08

First stable release.

### Added

- **Auto-init** — mount with a `data-novapulse-map` attribute and no JavaScript.
- **JavaScript API** — `new NovaPulseMap(options)` with `setNodes`, `getNode`,
  `setLive`, `fit`, `getState`, `destroy` and 20+ other methods. Callable with or
  without `new`.
- **TypeScript definitions** — `novapulse.d.ts` ships with the package.
- **Zoom-aware clustering** — nodes closer than `clusterRadius` merge into one
  marker at their centroid and split apart on zoom. Implemented directly (~35
  lines) instead of depending on `leaflet.markercluster` (~40 KB).
- **iframe embed support** — `postMessage` protocol in both directions:
  host sends `ping`, `getState`, `setNodes`, `setLive`, `resize`, `fit`;
  widget emits `ready`, `state`, `nodes`, `live`.
- **Live JSON feed** — `nodesUrl` fetches and normalises nodes from a telemetry
  endpoint, accepting a bare array or a wrapped `{ nodes: [...] }`.
- **Optional panels** — live-probing toggle, summary stat cards, and a full node
  table, each independently toggleable.
- **Event emitter** — `ready`, `nodeclick`, `livechange`, `error`, `destroy`,
  plus a `*` catch-all. A throwing handler is contained, never propagated.
- **Two keyless tile presets** — `osmDark` (CSS-inverted to dark) and `osmLight`,
  plus `none` for fully offline or CSP-strict environments.
- **Hardened input handling** — non-numeric and out-of-range coordinates are
  dropped instead of throwing; unknown statuses fall back to `Operational`;
  all node-supplied text is HTML-escaped before rendering.
- **Four examples** — auto-init, JS API with two simultaneous instances, iframe
  host/widget pair, and a live JSON feed.
- **Test suite** — 33 assertions against a DOM + Leaflet stub. No browser, no test
  framework, no dev dependencies.
- **Zero-dependency dev server** (`scripts/serve.mjs`) with a simulated
  `/api/probes.json` endpoint, and path containment against directory traversal.

### Fixed

Bugs found and fixed during the pre-release audit. Each has a regression test.

- **Instance leak on re-mount.** Constructing a second `NovaPulseMap` on the same
  container left the first one running: its interval, `ResizeObserver` and Leaflet
  map all stayed live and invisible, leaking on every re-initialisation. The
  constructor now disposes any prior instance on that container and records itself
  as `container.__npsInstance`. Verified in-browser: `firstDestroyed: true`,
  `firstTimer: null`, one `.leaflet-container` instead of two.
- **Stale `destroy()` could unclaim a live mount.** The back-reference is now only
  cleared when it still points at the instance being destroyed.
- **`destroy()` leaked inline CSS variables.** `--nps-height` and `--nps-ink` were
  left on the host element, so a re-mount inherited stale values. Both are removed.
- **Post-destroy calls threw inside Leaflet.** `zoomIn`, `zoomOut`, `fit`,
  `setView`, `getZoom`, `invalidateSize`, `setNodes`, `_renderMarkers`, `_refresh`
  and `getState` now no-op or return safe defaults once destroyed, instead of
  reaching into a detached map container.
- **`getZoom()` returned a stale value after destroy.** Now returns `null`.
- **`getState()` after destroy returned live-looking data.** Now returns an empty,
  explicitly-inert state.
- **`invalidateSize()` measured the wrong element.** It read the host, which is a
  stack taller than the map (toggle + panel). It now measures the map surface, so
  the bounds fit matches the actual viewport.
- **`fitBounds` could throw on a degenerate bounds box.** A single node, or a set of
  nodes with zero span, produced an inverted `LatLngBounds`. The span is now checked
  before fitting.
- **Attribution links failed WCAG 2.5.8.** They rendered at text height (~21px),
  below the 24x24 target-size floor. Now `inline-block` with padding and a
  `min-height`, measured at 24px.
- **Caller-supplied node objects were mutated in place.** Live probing wrote the
  jittered latency back into the caller's own object. Nodes are now always copied
  during normalisation.

### Notes on decisions

- **`osmDark` is the default tile preset, not CartoDB Dark Matter.** CartoDB now
  requires an API key; unauthenticated requests return a fixed 2,394-byte
  `API KEY REQUIRED` placeholder at every zoom (verified z2-z8, byte-identical
  across all three host variants). The `cartoDark` preset remains available for
  users who hold a key.
- **`minZoom` defaults to 1.** `fitBounds` clamps at `minZoom`, so a narrow or
  short container at z2 leaves world-edge nodes outside the viewport with no way
  to reach them. z1 guarantees every node fits.
- **The map surface owns the container height, not the host.** The host also
  contains the toggle and panel, so applying `height` and `overflow: hidden`
  there clipped the panel and made Leaflet measure a collapsed pane, parking every
  marker at `-17000px`.
- **The entrance animation scales but never fades.** Contrast is audited at load;
  animating `opacity` from `0.35` composited the attribution text down to a 2.04:1
  ratio and failed WCAG AA.
- **No bundler.** The library is a single UMD file with no imports, so a bundler
  would add a megabyte of `node_modules` to save nothing. `scripts/build.mjs`
  strips comments and indentation, then verifies the minified output parses.
- **Leaflet is a peer dependency and is never bundled**, per its BSD-2-Clause
  licence.

### Accessibility

Lighthouse accessibility **100**. Keyboard-focusable markers, `role="switch"` on
the toggle with live `aria-checked`, ≥24x24px targets, AA contrast throughout, a
real `<table>` mirroring all map data, plus `prefers-reduced-motion` and
`prefers-contrast` support.

[1.0.0]: https://github.com/SudhirDevOps1/NovaPulse-Map/releases/tag/v1.0.0