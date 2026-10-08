# File map

What every file in this repository is for, and what to read when.

---

## At a glance

```
novapulse-edge-map/
├── index.html              Landing page / live showcase
├── 404.html                GitHub Pages not-found page
│
├── src/                    SOURCE. This is what you edit.
│   ├── novapulse.js        The entire library
│   ├── novapulse.css       Component styles
│   └── novapulse.d.ts      TypeScript definitions
│
├── dist/                   BUILD OUTPUT. Generated. Committed on purpose.
│   ├── novapulse.js        Readable build
│   ├── novapulse.min.js    Minified build
│   ├── novapulse.css / .min.css
│   └── novapulse.d.ts      Types, copied through
│
├── *.html (generated)      Rendered docs. Do not hand-edit; edit the .md.
│   ├── README.html
│   ├── CHANGELOG.html
│   └── CONTRIBUTING.html
│
├── examples/               Runnable demos
│   ├── 01-auto-init.html   Declarative, no page JS
│   ├── 02-js-api.html     Two independent maps
│   ├── 03-iframe-host.html Host side of an embed
│   ├── 04-live-feed.html   Polling a JSON endpoint
│   ├── 05-advanced.html   Every feature, live feed
│   ├── embed-widget.html   The bare embeddable frame
│   └── probe-sim.js        Shared fallback data source
│
├── scripts/                Dev tooling. Not shipped in the package.
│   ├── build.mjs           Generates dist/ from src/
│   ├── docs.mjs            Renders the .md docs into .html pages
│   ├── doc-style.css       CSS for those pages (inlined by docs.mjs)
│   ├── doc-client.js       Highlighter + copy buttons (inlined by docs.mjs)
│   ├── stamp-version.mjs   Pins ?v= on asset URLs
│   ├── serve.mjs           Dev server + simulated API
│   └── contrast.mjs        WCAG contrast calculator
│
├── test/
│   └── run.mjs             79 assertions, no browser needed
│
├── docs/                   Markdown source, plus its rendered .html twin
│   ├── GETTING-STARTED.md  Start here
│   ├── ADVANCED.md         Feature reference + limitations
│   ├── DEPLOY.md           Hosting, CSP, live feeds
│   └── FILE-MAP.md         This file
│
├── .github/workflows/
│   ├── ci.yml              Tests + Lighthouse gate
│   └── pages.yml           Deploys to GitHub Pages
│
├── .gitignore              See "Why .gitignore is like this" below
├── .gitattributes          Forces LF endings so diffs stay clean
├── .editorconfig           Same, for editors that read it
├── CHANGELOG.md            What changed and why
├── CONTRIBUTING.md         How to contribute
├── LICENSE                 MIT + third-party attributions
└── package.json            Package metadata and npm scripts
```

---

## Read this first

| If you want to... | Read |
|---|---|
| Put it on a page | [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md) |
| Understand every option | [docs/ADVANCED.md](docs/ADVANCED.md) |
| Host it somewhere | [docs/DEPLOY.md](docs/DEPLOY.md) |
| Know what a file does | this file |
| Change the behaviour | `src/novapulse.js` |
| Change the look | `src/novapulse.css` |

---

## `src/` — the source

### `novapulse.js` — the entire library

One UMD file, ~1,600 lines, ES5 syntax so it runs untranspiled anywhere. It has
no imports. Sections, top to bottom:

| Section | What it holds |
|---|---|
| Constants | Version, status colours, tile presets |
| Utilities | `escapeHtml`, `clamp`, event helpers |
| Embedded CSS | The same rules as `novapulse.css`, injected once per page |
| `Emitter` | `on` / `off` / `emit`, with throwing-handler isolation |
| `NovaPulseMap` | Constructor and options |
| `_build` | DOM construction, layer setup, listeners |
| `_normalize` | Input validation and coercion |
| `_group` / `_worst` | Clustering and status precedence |
| Tooltip builders | Node and cluster tooltips, sparklines, trends |
| `_refresh` / `_render*` | The tick: markers, rows, stats |
| Polling | `poll`, `startPolling`, `stopPolling`, backoff |
| Events | `statuschange`, `recovered`, `feed`, `themechange` |
| Lifecycle | `destroy`, postMessage protocol, deep links |

### `novapulse.css` — component styles

Namespaced under `.nps-*` so it cannot collide with a host page. Kept in sync by
hand with the copy inside `novapulse.js`.

You only need this file if you want your bundler to manage the CSS instead of
having the library inject it:

```js
import 'novapulse-edge-map/style.css';
```

### `novapulse.d.ts` — types

Ships with the package. Covers options, node shape, methods, events and the
`postMessage` protocol.

---

## `dist/` — build output

**Generated. Do not hand-edit.** Run `npm run build`.

Committed deliberately: the package must work straight from GitHub or a CDN with
no install and no toolchain. See [DEPLOY.md](DEPLOY.md).

| File | Use |
|---|---|
| `novapulse.min.js` | CDN / unpkg. What most people want. |
| `novapulse.js` | Readable. Easier to debug in production. |
| `novapulse.min.css` | Only if you import CSS manually. |
| `novapulse.css` | Readable CSS. |

---

## `examples/` — runnable demos

Each is self-contained and works offline (the feed falls back to
`probe-sim.js`).

| Example | Demonstrates |
|---|---|
| `01-auto-init` | Attribute-driven mount, then the API from the console |
| `02-js-api` | Two independent instances, no shared state, both themes |
| `03-iframe-host` | `postMessage` host side |
| `04-live-feed` | Polling, error handling, honest failure states |
| `05-advanced` | Everything, plus backoff and incident recovery |
| `embed-widget` | The frame a third party would point an iframe at |
| `probe-sim.js` | Shared simulator. Same shape as a real endpoint. |

Run them with:

```bash
npm run serve      # http://127.0.0.1:5173
```

---

## `scripts/` — dev tooling

Not published in the package (`files` in `package.json` excludes them).

| Script | Does |
|---|---|
| `build.mjs` | Generates `dist/`, injects the version, verifies the minified output parses |
| `docs.mjs` | Renders the Markdown docs into styled HTML pages |
| `doc-style.css` | Styles for those pages, inlined by `docs.mjs` |
| `doc-client.js` | Highlighter and copy buttons, inlined by `docs.mjs` |
| `stamp-version.mjs` | Appends `?v=<version>` to local asset URLs so CDNs cannot serve a stale bundle |
| `serve.mjs` | Static server plus `/api/probes.json` and `/api/flags`. Path-traversal guarded. |
| `contrast.mjs` | WCAG contrast calculator. Run it instead of guessing a hex. |

```bash
npm run build       # regenerate dist/, render the docs, stamp asset URLs
npm run docs        # just re-render the docs
npm run build:check # fail if dist/, docs or asset URLs are stale (used by CI)
npm test            # 79 assertions
npm run serve       # dev server
```

### Why the docs are rendered to HTML

GitHub Pages serves `*.md` as `text/plain`, so linking a reader at `README.md
dumped raw Markdown at them. `docs.mjs` converts the Markdown into real pages
with a sidebar, syntax highlighting and copy buttons, so documentation is
browsable on the site itself. Each page still links back to its source on
GitHub for editing.

The `.md` files stay the source of truth. The generated `.html` twins are
committed for the same reason `dist/` is: Pages has no build step. `docs.mjs
--check` makes CI fail if they drift from the Markdown.

`docs.mjs` is a deliberately small CommonMark+GFM subset — headings, lists,
tables, code fences, blockquotes, rules and inline marks. It is not a complete
parser, and it warns loudly on an unclosed code fence rather than silently
truncating the page.

---

## `test/run.mjs`

Runs the library against a hand-written DOM and Leaflet stub in Node. No test
framework, no browser, no dev dependencies.

It covers the logic that a browser makes awkward to assert: option resolution,
input coercion, clustering, percentiles, backoff recovery, HTML escaping, and
teardown.

Two checks exist specifically to stop version drift:

- `dist/novapulse.js` VERSION must equal `package.json`
- every HTML file must pin `?v=<version>` on its local assets

---

## Why `.gitignore` is like this

The obvious-looking line is commented out:

```gitignore
# dist/
# dist/*.map
```

**`dist/` is committed.** Three reasons:

1. **GitHub Pages serves the repo directly.** With no build step on Pages, an
   uncommitted `dist/` means a 404.
2. **unpkg and jsDelivr serve the repo.** The package has to work from a raw
   git ref with no install.
3. **It makes the repo a working example.** Someone who clones it can open
   `index.html` immediately.

The cost is noisy diffs on `dist/`, which is the usual argument for ignoring it.
That is a fair trade only because there is no build toolchain here: the "build"
is two Node scripts with zero dependencies.

### The rest of the file

| Entry | Why |
|---|---|
| `node_modules/` | Never commit installed packages |
| `.cache/`, `.turbo/`, `.parcel-cache/` | Tool caches, in case you add a bundler |
| `.eslintcache` | Lint cache |
| `.DS_Store`, `Thumbs.db`, `desktop.ini` | OS cruft, especially `desktop.ini` on Windows |
| `.idea/`, `.vscode/*` | Editor state, but `extensions.json` is kept since it is shareable |
| `*.log` | Runtime noise |
| `.env`, `.env.*` | **Never commit secrets.** `.env.example` is kept |
| `coverage/`, `.nyc_output/` | Test output |
| `screenshots/` | Local verification artefacts |
| `*.local.html` | Scratch pages while debugging |

### `.gitattributes` and `.editorconfig`

Both exist to force **LF** line endings. Without them, Windows checkouts rewrite
every file to CRLF and produce whole-file diffs that hide real changes.

---

## `.github/workflows/`

| Workflow | Does |
|---|---|
| `ci.yml` | Syntax check, tests, `build:check`, serves the examples, asserts the served bundle version matches, runs Lighthouse across all six pages with accessibility pinned at 100 |
| `pages.yml` | Verifies the site files exist, then deploys to GitHub Pages |

Both fail the build rather than warning. A status-page library that ships a
broken bundle should not be able to go green.

---

## Things deliberately absent

| Not present | Why |
|---|---|
| `node_modules/` | Zero dependencies. Nothing to install. |
| Bundler config | The library is one UMD file with no imports; a bundler would add ~1 MB to save nothing. |
| Source maps | `build.mjs` does not emit `.map` files, so the minified bundle has no stack-trace mapping. |
| Test framework | 79 assertions in one Node file. A runner would be the largest dependency in the repo. |
| ESlint / Prettier config | Style is enforced by review. Adding config files to a zero-dependency repo is a poor trade. |

If a feature above ever earns its cost, the constraint that keeps saying no is
in [CONTRIBUTING.md](../CONTRIBUTING.md).