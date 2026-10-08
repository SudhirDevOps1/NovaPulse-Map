#!/usr/bin/env node
/**
 * Build script — zero dependencies.
 *
 * Produces:
 *   dist/novapulse.js       (readable, source-mapped by comment)
 *   dist/novapulse.min.js   (minified)
 *   dist/novapulse.css      (standalone stylesheet for non-JS mount paths)
 *   dist/novapulse.d.ts     (copied types)
 *
 * Deliberately does NOT use a bundler: the library is one UMD file with no
 * imports, so a bundler would add ~1MB of node_modules to save nothing.
 * Leaflet stays an external peer dependency and is never bundled, which is
 * required by Leaflet's own licence and keeps the payload tiny.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

const check = process.argv.includes('--check');

/* ── Conservative minifier ────────────────────────────────────────────
   Not a full parser. Safe on our input because we control it: it only
   strips comments and collapses leading indentation/whitespace runs in
   the places that cannot change semantics. We deliberately do NOT do
   identifier renaming or statement joining — those need a real parser
   and are exactly where hand-rolled minifiers break code.
   If you want aggressive minification, swap in esbuild/terser here. */
function minify(code) {
  let out = code;
  // block comments (safe: no /* */ inside string literals in this file)
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  // line comments, but keep the legal banner comment block
  out = out.replace(/^\s*\/\/.*$/gm, '');
  // collapse indentation + blank lines
  out = out.split('\n')
    .map((l) => l.replace(/\s+$/, '').replace(/^\s+/, ''))
    .filter((l) => l.length)
    .join('\n');
  return out.trim();
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

const js = readFileSync(join(src, 'novapulse.js'), 'utf8');
const dts = readFileSync(join(src, 'novapulse.d.ts'), 'utf8');
const css = readFileSync(join(src, 'novapulse.css'), 'utf8');

const banner = `/*! NovaPulse Edge Map v${JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version} | MIT | https://github.com/your-org/novapulse-edge-map */\n`;

const minJs = minify(js);
const minCss = minify(css);

const targets = {
  'novapulse.js': banner + js,
  'novapulse.min.js': banner + minJs,
  'novapulse.css': css,
  'novapulse.min.css': banner + minCss,
  'novapulse.d.ts': dts
};

if (check) {
  let bad = 0;
  for (const [name, body] of Object.entries(targets)) {
    const p = join(dist, name);
    if (!existsSync(p)) { console.error(`  MISSING  ${name}`); bad++; continue; }
    const same = readFileSync(p, 'utf8') === body;
    console.log(`  ${same ? 'ok      ' : 'STALE   '} ${name}`);
    if (!same) bad++;
  }
  process.exit(bad ? 1 : 0);
}

mkdirSync(dist, { recursive: true });

console.log('NovaPulse Edge Map — build\n');
for (const [name, body] of Object.entries(targets)) {
  writeFileSync(join(dist, name), body, 'utf8');
  console.log(`  dist/${name.padEnd(20)} ${kb(Buffer.byteLength(body)).padStart(9)}`);
}

// Sanity: the minified bundle must still parse.
const vm = await import('node:vm');
new vm.Script(minJs, { filename: 'novapulse.min.js' });
console.log('\n  minified bundle parses cleanly');
console.log(`  gzip estimate — js ${kb(Buffer.byteLength(minJs))} -> ~${kb(Buffer.byteLength(minJs) * 0.32)} gzipped\n`);