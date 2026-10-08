# Deploying NovaPulse Edge Map

Everything here is **100% free**. No account, no API key, no credit card.

---

## Option A — GitHub Pages (recommended, $0)

The repository already has everything Pages needs.

### 1. Enable Pages

1. Repo → **Settings** → **Pages**
2. **Source:** Deploy from a branch
3. **Branch:** `main` / **folder:** `/ (root)`
4. Save

Your status page is live at:

```
https://sudhirdevops1.github.io/NovaPulse-Map/examples/01-auto-init.html
```

The examples use **relative paths** (`../dist/…`), so they work from a
subpath — no configuration needed.

### 2. Embed the widget on any site

```html
<iframe
  src="https://sudhirdevops1.github.io/NovaPulse-Map/examples/embed-widget.html"
  width="100%" height="620"
  title="NovaPulse edge status"
  loading="lazy"
  referrerpolicy="no-referrer">
</iframe>
```

Or load the library from Pages directly:

```html
<link rel="stylesheet" href="https://sudhirdevops1.github.io/NovaPulse-Map/dist/novapulse.css">
<script src="https://sudhirdevops1.github.io/NovaPulse-Map/dist/novapulse.min.js"></script>

<div data-novapulse-map
     data-nodes-url="https://your-api.example/probes.json"
     data-height="420"
     data-show-stats="true"
     data-show-table="true"></div>
```

> **Relative paths matter.** If you fork this repo and use absolute
> (`/dist/…`) paths, Pages will 404 them. The examples are already correct.

### 3. Use the iframe message API

```js
const frame = document.querySelector('iframe');
const send = (m) => frame.contentWindow.postMessage({ __novaPulse: 1, ...m }, '*');

send({ type: 'getState' });
send({ type: 'setLive', live: false });
send({ type: 'setNodes', nodes: [...] });

addEventListener('message', (ev) => {
  if (ev.data?.__novaPulse === 1 && ev.data.type === 'state') {
    render(ev.data.state);
  }
});
```

---

## Option B — unpkg / jsDelivr (free CDN, no deploy)

Once the repo is public, the CDN mirrors it automatically — no build step.

```html
<script src="https://unpkg.com/novapulse-edge-map/dist/novapulse.min.js"></script>
```

Or pin a commit so a future release can't break your page:

```html
<script src="https://unpkg.com/novapulse-edge-map@1.0.0/dist/novapulse.min.js"></script>
```

---

## Option C — Vercel (free tier)

```bash
npm i -g vercel
vercel --prod
```

No config needed; `dist/` is static. For a monorepo, add `vercel.json`:

```json
{
  "cleanUrls": true,
  "headers": [
    {
      "source": "/dist/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

Long immutable caching on `dist/` is safe **only because the filename has no
hash**. Bump the version on every release, or adopt hashed filenames if you
want to skip that discipline.

---

## Option D — Netlify (free tier)

Drag the repo folder onto <https://app.netlify.com/drop>. Done.

---

## Option E — Plain nginx / Apache / caddy

It's static files. Copy and serve:

```bash
cp -r dist /var/www/novapulse
```

```nginx
location /novapulse/ {
  alias /var/www/novapulse/;
  add_header Cache-Control "public, max-age=31536000, immutable";
}
```

---

## The live feed

The map polls JSON. Any host works, including free ones.

### GitHub Pages has no server — use a static JSON file

```json
// ./data/probes.json
{
  "generatedAt": "2026-10-08T18:04:11Z",
  "nodes": [
    { "id": "iad", "name": "Ashburn", "region": "us-east",
      "lat": 39.0438, "lon": -77.4874,
      "status": "Operational", "latency": 12 }
  ]
}
```

```html
<div data-novapulse-map data-nodes-url="/data/probes.json"></div>
```

Update it from CI with a GitHub Actions step:

```yaml
- run: curl -s "$PROBE_API" > data/probes.json
- run: git add data/probes.json
- run: git commit -m "chore: probe data" || exit 0
```

`|| exit 0` matters — a no-change commit would fail the job.

### Free serverless options

| Service | Free tier | Notes |
|---|---|---|
| **Cloudflare Workers** | 100k req/day | Best fit; add caching at the edge |
| **Vercel Functions** | Hobby, generous | Already needed for static hosting |
| **Deno Deploy** | 100k req/day | TS-native |
| **GitHub Actions → JSON** | 2,000 min/mo | Simplest; poll interval limited |

A Cloudflare Worker that reads a KV binding:

```js
export default {
  async fetch(req, env) {
    const nodes = await env.PROBES.get('json', 'json');
    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), nodes }),
      { headers: { 'content-type': 'application/json',
                   'access-control-allow-origin': '*',
                   'cache-control': 'public, max-age=10' } });
  }
};
```

---

## CSP headers

If your host sends a Content-Security-Policy, allow these:

```
script-src  'self' https://unpkg.com
style-src   'self' https://unpkg.com 'unsafe-inline'
img-src     'self' data: https://*.basemaps.cartocdn.com https://tile.openstreetmap.de
connect-src 'self' https://unpkg.com
```

`style-src` needs `'unsafe-inline'` because the library sets CSS custom
properties inline on the host element.

For a **fully self-hosted, zero-external** setup:

```js
new NovaPulseMap({
  container: '#m',
  tile: 'none'      // no network requests at all
});
```

---

## Offline / air-gapped

Download the tiles once, or point at your own tile server:

```js
new NovaPulseMap({
  container: '#m',
  tileUrl: 'https://tiles.internal.example/osm/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors'
});
```

`attribution` is **not optional** — tile providers require it, and it is
rendered in the bottom-left of every map by default.

---

## Pre-launch checklist

- [ ] `npm test` — 71 assertions pass
- [ ] `npm run build && npm run build:check` — `dist/` is current
- [ ] Load the page, confirm tiles render and no markers sit outside the map
- [ ] Hover a marker — name, latency, status all present
- [ ] Point `data-nodes-url` at your real feed; verify `live: false`
- [ ] Click the toggle, run `destroy()`, confirm the console stays quiet
- [ ] Lighthouse accessibility is 100
- [ ] Attribution is visible in the bottom-left
- [ ] Tab through: markers reachable, toggle and controls operable
- [ ] Pin the CDN version (`@1.0.0`), don't use `latest`

---

## Licence reminder

Map data Â© OpenStreetMap contributors, **ODbL**. Attribution must not be
removed. The default tile server is a community mirror suitable for a status
page; for production traffic, self-host tiles or use a commercial provider.