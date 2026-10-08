# Changelog

All notable changes to this project are documented here.
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-10-08

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

### Notes on decisions

- **`osmDark` is the default tile preset, not CartoDB Dark Matter.** CartoDB now
  requires an API key; unauthenticated requests return a fixed 2,394-byte
  `API KEY REQUIRED` placeholder at every zoom (verified z2–z8, byte-identical
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
the toggle with live `aria-checked`, ≥24×24px targets, AA contrast throughout, a
real `<table>` mirroring all map data, plus `prefers-reduced-motion` and
`prefers-contrast` support.

[1.0.0]: https://github.com/your-org/novapulse-edge-map/releases/tag/v1.0.0