/**
 * Stamp the current version onto every local asset URL in the HTML files.
 *
 * Why this exists: a static host and every CDN in front of it will happily
 * serve a stale bundle to a returning visitor. During the 1.1.0 rollout the
 * live site reported VERSION 1.0.0 to the browser while the file on disk was
 * already 1.1.0 — the library and its data feed can disagree in ways that are
 * genuinely hard to debug.
 *
 * Appending ?v=<version> makes each release a distinct cache key, so an old
 * bundle can never be handed to someone on a newer page.
 *
 *   node scripts/stamp-version.mjs            # stamp
 *   node scripts/stamp-version.mjs --check    # fail if stale
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/* Only local assets need stamping. Remote URLs are versioned by their own
   provider (unpkg pins with @1.1.0), and pinning a remote URL we don't control
   would just add a cache entry that can never be invalidated. */
const LOCAL_ASSETS = [
  './dist/novapulse.js',
  './dist/novapulse.min.js',
  './dist/novapulse.css',
  './dist/novapulse.min.css',
  'dist/novapulse.js',
  'dist/novapulse.min.js',
  'dist/novapulse.css',
  'dist/novapulse.min.css',
  '../dist/novapulse.js',
  '../dist/novapulse.min.js',
  '../dist/novapulse.css',
  '../dist/novapulse.min.css',
];

/* Prefixes are handled separately so we don't rewrite a bare "../dist/" that
   appears in prose or an example snippet. */
const PREFIXES = ['./dist/', 'dist/', '../dist/'];

function htmlFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, acc);
    else if (entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

/* Rewrites href/src of <script> and <link> only. Anchors and inline code
   blocks mention dist/ paths as documentation and must stay untouched. */
function stamp(src) {
  let out = src;
  for (const prefix of PREFIXES) {
    const re = new RegExp(
      '((?:href|src)=")' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^"]+?)(")',
      'g'
    );
    out = out.replace(re, (m, before, asset, after) => {
      const clean = asset.replace(/\?v=[\w.\-]+/, '');
      const dir = prefix.replace(/\/?$/, '');
      return before + dir + '/' + clean + '?v=' + version + after;
    });
  }
  return out;
}

const files = htmlFiles(root);
let stale = 0;

for (const f of files) {
  const rel = f.slice(root.length + 1).replace(/\\/g, '/');
  const before = readFileSync(f, 'utf8');
  const after = stamp(before);

  /* Skip files with no local asset references at all. */
  if (before === after) continue;

  if (check) {
    stale++;
    console.log(`  STALE  ${rel}`);
  } else {
    writeFileSync(f, after, 'utf8');
    console.log(`  ${rel}`);
  }
}

if (check) {
  if (stale) {
    console.log(`\n  ${stale} file(s) not stamped for v${version}. Run: npm run build\n`);
    process.exit(1);
  }
  console.log(`  all HTML stamped for v${version}\n`);
} else {
  console.log(`\n  stamped ${version} into ${files.length} file(s) scanned\n`);
}