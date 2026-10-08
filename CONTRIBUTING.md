# Contributing

Thanks for taking the time. This is a small, dependency-free library, so the
bar for changes is mostly *don't make it worse*.

## Ground rules

**Zero dependencies. Zero dev dependencies.** No bundler, no test framework, no
transpiler. A status-page widget should not drag a toolchain along, and every
dependency is one more thing to audit. If you think you need one, open an issue
first and make the case.

**`dist/` is committed.** The package is meant to work straight from GitHub or
unpkg with no install step. Run `npm run build` whenever you touch
`src/novapulse.js` or `src/novapulse.css`, and commit the result.

**Leaflet is never bundled.** It is a peer dependency under BSD-2-Clause.

**The OSM attribution stays.** Tile providers require it. Don't remove it,
don't hide it, don't style it out.

## Getting set up

```bash
git clone https://github.com/your-org/novapulse-edge-map.git
cd novapulse-edge-map
npm test          # 33 assertions, runs in about a second
npm run build     # regenerate dist/
npm run serve     # http://127.0.0.1:5173
```

No `npm install` is needed — there are no dependencies to install.

## Before you open a pull request

```bash
npm test
npm run build && npm run build:check
```

Then verify in a real browser across all four examples:

| Example | What it proves |
|---|---|
| `01-auto-init.html` | Attribute path, public API, teardown |
| `02-js-api.html` | Two independent maps, no shared state |
| `03-iframe-host.html` | `postMessage` both directions |
| `04-live-feed.html` | JSON feed, polling, error handling |

Check that:

- Every map renders tiles, and no marker sits outside its container
- Tooltips show name, latency and status
- `destroy()` leaves no timers running (`console` stays quiet)
- Keyboard tabbing reaches markers and the toggle
- Lighthouse accessibility stays at 100

## Style

- ES5 syntax in `src/novapulse.js` — the file must run untranspiled in old
  browsers. No arrow functions, no template literals, no `let`/`const`.
- Comments explain **why**, not what. If a line needs a comment to say what it
  does, the line is wrong.
- Two-space indent, semicolons, `var`.

## Things that have bitten us

Each of these caused a real bug. Please check them if you touch the relevant code.

- **`subdomains: undefined` crashes Leaflet.** Build the tile options object
  conditionally. A test asserts we never pass it.
- **Never animate `opacity` on the map container.** Contrast is audited at load,
  so fading in makes every control fail AA.
- **`Number(null) === 0`.** A null coordinate lands a node off the coast of
  Africa instead of being rejected. `_normalize()` guards this explicitly.
- **Height belongs on the surface, not the host.** The host holds the toggle and
  panel too.
- **`innerHTML` with user data is XSS.** Node names come from an API. Use
  `escapeHtml()` or build nodes with `createElement`.

## Reporting bugs

Open an issue with:

- What you expected, and what happened instead
- Browser and version
- A minimal reproduction — the test suite is the fastest place to prove one
- Console output, if any

## Pull requests

Keep them focused. One concern per PR, with a test where the behaviour is
testable without a browser. If you're changing rendering, include before/after
screenshots.

## License

By contributing you agree that your work is licensed under the MIT License,
the same as the project.