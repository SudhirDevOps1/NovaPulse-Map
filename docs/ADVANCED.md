# NovaPulse Edge Map — v1.1.0 Advanced features

Everything on this page runs against a real JSON feed with no API key.
Start the dev server first:

```bash
npm run serve
# → http://127.0.0.1:5173/examples/05-advanced.html
```

---

## What's new in 1.1.0

Every feature below is **opt-in**. Defaults preserve the v1.0.0 behaviour
exactly, so upgrading is not a breaking change.

---

## 1. Latency history & sparklines

Each node keeps a bounded ring buffer of samples (`historyLength`, default 24)
and draws an inline SVG sparkline in its tooltip.

```js
new NovaPulseMap({
  container: '#map',
  showSparklines: true,
  historyLength: 48          // 24 | 720 max
});
```

**A missing latency records a gap, never a `0`.** Fabricated zeros are the
classic way a latency dashboard lies — they'd drag p95 down and make a broken
probe look like the fastest one on the map. `null` samples render as a break in
the line.

| Method | Returns |
|---|---|
| `getHistory(id)` | copy of the sample array, oldest first |
| `getPercentiles(id)` | `{ samples, min, p50, p95, p99, max, mean }` or `null` |
| `clearHistory()` | wipes samples and status memory |

---

## 2. p95 latency

Added as a stat card when `showSparklines` is on, plus a sortable column.

The mean hides tail latency. p95 is the number that matches an SLO, and it's
computed across **all** nodes' samples, not per-node.

```js
new NovaPulseMap({ container: '#m', showStats: true, showSparklines: true });
```

---

## 3. Trend indicators

`showTrend: true` compares the last 3 samples against the 6 before that and
shows `↑ 24%` / `↓ 8%` / `→` next to the latency.

- Needs at least 9 samples before it will show anything
- Suppressed below an 8% change, so it doesn't flicker on noise
- Rising latency is amber, falling is green — direction is relative to
  goodness, not magnitude

---

## 4. Live polling with exponential backoff

```js
const map = new NovaPulseMap({
  container: '#m',
  nodesUrl: '/api/probes.json',
  live: false,            // ← important when using a real feed
  refreshMs: 4000,
  refreshBackoff: true,
  pauseWhenHidden: true,
  onFeedError(err) { /* … */ }
});
```

| Method | Behaviour |
|---|---|
| `poll(url?)` | one fetch; returns a promise |
| `startPolling(url?)` | poll now, then on the current interval |
| `stopPolling()` | clear the pending timer |

**Backoff doubles on each failure** (capped at `refreshMs × 32`) and **resets
the instant a poll succeeds**. Polling gives up only after 8 consecutive
failures, and emits `feedstopped` when it does.

Set `live: false` when you supply your own data. Otherwise the built-in jitter
overwrites your real latency numbers every tick.

Events: `feed`, `error`, `feedstopped`.

---

## 5. Search, filter, sort

```js
map.setSearch('tokyo');        // matches name, region, country, id, provider
map.setFilter('Down');         // 'all' | 'Operational' | 'Degraded' | 'Down'
map.setSort('p95', -1);        // name | latency | p95 | status | region | uptime
```

Search and filters affect the table only. Markers always show every node —
hiding a failing probe because a search is active is how outages get missed.

The table keeps one cell per `<tr>` in lockstep with `_renderTable`; if you add
a column, add its header in the same place.

---

## 6. Sortable columns

`sortableTable: true` (default when a table is shown). Click, or focus with
Tab and press Enter/Space. `aria-sort` is maintained, and the header shows
↑/↓. Keyboard-sortable is not optional — drag-to-sort would fail keyboard
users entirely.

---

## 7. Live theme switch

`setTheme('light' | 'dark')` swaps the tile layer, updates the CSS custom
properties, and flips the invert filter. The invert filter belongs to the
**tile**, not the theme, so it is re-evaluated on switch.

---

## 8. Incident detection

```js
map.on('statuschange', d => console.log(d.name, d.from, '→', d.to));
map.on('recovered',    d => pageOnCall(d));
```

Fires **once per actual transition**, not on every poll — a no-op `setNodes()`
emits nothing. `recovered` fires specifically on a return to `Operational`,
which is the moment worth waking someone up for.

---

## 9. Feed health indicator

A line under the stat cards reads `✓ Updated 14:32:07`, `⚠ Feed unreachable`,
or `… Updating`. Without it, a silently dead feed looks identical to a healthy
network that simply hasn't changed.

The text colour follows the theme rather than the status palette: green and red
are marker colours sized for the dark map, and at 12px on a white card they
measured 2.27:1. State is carried by a glyph plus wording.

---

## 10. JSON export

The `↧` button downloads `{ generatedAt, state, history }`. `exportJSON()`
returns the same object, so you can POST it instead of downloading it.

---

## 11. Deep linking

`deepLink: true` watches `location.hash`; `#nrt` flies to Tokyo and zooms to 5.
`focusNode(id)` does it directly.

---

## 12. Persistence

`persistKey: 'my-status'` writes nodes and live state to `localStorage` after
every refresh. `restore()` reads it back. Wrapped in try/catch throughout —
storage throws in sandboxed iframes and when quota is exceeded, and none of
that should break a status page.

---

## 13. Extra node metadata

Optional fields carried straight through:

```json
{
  "id": "nrt", "name": "Tokyo", "region": "apac", "country": "JP",
  "provider": "Example Telecom", "lat": 35.6762, "lon": 139.6503,
  "status": "Operational", "latency": 204,
  "uptime": 99.97, "note": "Maintenance window Sunday 02:00 UTC"
}
```

`provider` and `country` widen the search index. `uptime` adds a column with
`showUptime`. `note` shows in the tooltip.

---

## 14. Background-tab handling

`pauseWhenHidden: true` drops the interval to ≥60s when the tab is hidden and
re-anchors it on return. A backgrounded tab still runs timers, and browsers
throttle them to roughly once a minute — without this the map would either
burn battery or fire a burst of catch-up refreshes.

---

## The dev server's flag API

The demo controls change what the **server** returns, so you see real feed
behaviour rather than a page-side fake.

```bash
curl "http://127.0.0.1:5175/api/flags?outage=1"   # force an outage
curl "http://127.0.0.1:5175/api/flags?jitter=1"    # widen latency spread
curl "http://127.0.0.1:5175/api/flags?broken=1"    # return HTTP 503
curl "http://127.0.0.1:5175/api/reset"             # clear all flags
```

To watch backoff work: click **break endpoint**, then watch the poll interval
grow 4s → 8s → 16s → 32s. Click again and it resets on the first success.

To watch recovery work: click **force outage**, leave it for a poll or two,
then click it off. Every `Down → Operational` transition is logged.

---

## Accessibility

Lighthouse 100 with all of the above enabled.

- Every control has a visible `focus-visible` ring
- Filter buttons use `aria-pressed`; sortable headers use `aria-sort`
- The feed indicator is `role="status" aria-live="polite"`, so a screen reader
  announces a feed failure without stealing focus
- Filter and action buttons are ≥32px tall (WCAG 2.5.8 floor is 24px)
- Sparklines are `aria-hidden` — the numbers beside them carry the meaning
- Trend arrows sit in `title` text, so the direction is available to a
  screen reader rather than being purely visual

---

## Known limitations

- **History is in-memory only.** A page reload loses it unless you use
  `persistKey`. There is no backend storage, by design.
- **Sparklines are per-node, not aggregated.** There is no fleet-wide latency
  timeline.
- **Trend detection is a simple slope.** No seasonality handling, no anomaly
  detection, no thresholds.
- **Backoff is exponential with a fixed cap.** No jitter, so multiple open tabs
  will retry in lockstep.
- **`setNodes` rebuilds all markers.** Fine for tens of nodes; would need
  diffing for thousands.