/**
 * Build browsable HTML from the Markdown docs.
 *
 * WHY: GitHub Pages serves *.md as text/plain, so every doc link on the site
 * dumped raw Markdown at the reader. The options were (a) link out to GitHub,
 * which throws them off the site, or (b) render the docs into real pages.
 * This does (b).
 *
 * It is a deliberately small CommonMark+GFM subset — headings, paragraphs,
 * lists, tables, code fences, blockquotes, rules and the usual inline marks.
 * That covers every construct actually used in this repo.
 *
 * No dependency is added on purpose. Pulling in `marked` would be the single
 * largest thing in a project whose whole premise is having none.
 *
 * The page CSS and client JS live in scripts/doc-style.css and
 * scripts/doc-client.js and are read and inlined here, so their regexes stay
 * literals instead of escaped template-literal soup.
 *
 *   node scripts/docs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CSS = readFileSync(join(root, 'scripts', 'doc-style.css'), 'utf8');
const JS = readFileSync(join(root, 'scripts', 'doc-client.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/* ── Inline markdown ──────────────────────────────────────────────────── */

const SLUG = (s) => s.toLowerCase().trim()
  .replace(/[`*_~]/g, '')
  .replace(/[^\w\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-');

/* Rewrites a .md link to its generated .html page, preserving any anchor. */
function fixLinks(href) {
  if (!href) return href;
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
  return href.replace(/\.md(?=$|[)#])/, '.html');
}

const escHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Files saved by Windows editors can carry a UTF-8 BOM. It is invisible but
   it breaks every /^#/ heading match — the page renders with a literal
   "# Changelog" paragraph instead of an <h1>. Strip it on read. */
function readMd(file) {
  return readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

/* Many fences in these docs are unlabelled, which means no highlighting.
   Guessing from content is cheap and beats colouring nothing. */
function guessLang(body) {
  const b = body.trim();
  if (!b) return 'text';
  if (/^[-\w.]+ (install|run|serve|test|build|git|npm|npx)\b/m.test(b) ||
      /^(npm|node|git|curl|cd|mkdir)\s/m.test(b)) return 'bash';
  if (/^\s*[[{]/.test(b) && /"[\w-]+"\s*:/.test(b)) return 'json';
  if (/^\s*(interface|type)\s+\w+/m.test(b) || /\brequired\??:/.test(b)) return 'ts';
  if (/^\s*</.test(b) && /<\/[\w-]+>|\/>\s*$/.test(b)) return 'html';
  if (/=>|\bconst\b|\blet\b|\bfunction\b|^\s*import\b/.test(b)) return 'js';
  return 'text';
}

function inline(src) {
  /* Code spans are extracted first so their contents are never treated as
     markup — inline code in these docs contains things like `<div>`. */
  const codes = [];
  let s = escHtml(src).replace(/`([^`]+)`/g, (m, c) => {
    codes.push(c);
    return '' + (codes.length - 1) + '';
  });

  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src2) =>
      `<img src="${src2}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, text, href) =>
      `<a href="${fixLinks(href)}">${text}</a>`)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\\\|/g, '|');

  /* Restore code spans, escaping their contents again. */
  return s.replace(/(\d+)/g, (m, i) => `<code>${escHtml(codes[Number(i)])}</code>`);
}

/* ── Block markdown ───────────────────────────────────────────────────── */

/* Splits on unescaped pipes only. A cell may legitimately contain a literal
   pipe written as \| (for example `dark` \| `light`), and splitting naively
   turns that one cell into two and desynchronises the whole row. */
function tableRow(line) {
  return line
    .trim()
    .replace(/^\||(?<!\\)\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

const RE = {
  fence:  /^```(\w*)\s*$/,
  head:   /^(#{1,6})\s+(.*)$/,
  rule:   /^\s*(-{3,}|\*{3,}|_{3,})\s*$/,
  quote:  /^\s*>/,
  list:   /^(\s*)([-*+]|\d+\.)\s+(.*)$/,
  tRow:   /\|/,
  tSep:   /^\s*\|?[\s:*-]*-[\s:|-]*\|/
};

function render(md, srcName) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* ---- fenced code ---- */
    const fence = line.match(RE.fence);
    if (fence) {
      const declared = fence[1] || '';
      const buf = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (/^\x60\x60\x60\s*$/.test(lines[i])) { closed = true; break; }
        buf.push(lines[i]);
        i++;
      }
      if (!closed) {
        /* An unclosed fence swallows the rest of the document into one code
           block. Warn loudly rather than shipping a page that ends early. */
        console.warn(`  WARNING unclosed code fence in ${srcName} at line ${i}`);
        /* Do not consume the remaining lines: treat them as normal markdown. */
      } else {
        i++;
      }
      const body = buf.join('\n');
      const lang = declared || guessLang(body);
      out.push(
        '<div class="code">' +
        `<div class="code-bar"><span>${escHtml(lang)}</span>` +
        '<button class="copy" type="button" data-copy>Copy</button></div>' +
        `<pre><code data-lang="${escHtml(lang)}">${escHtml(body)}</code></pre></div>`
      );
      continue;
    }

    /* ---- heading ---- */
    const h = line.match(RE.head);
    if (h) {
      const lvl = h[1].length;
      const raw = h[2].trim();
      out.push(`<h${lvl} id="${SLUG(raw)}">${inline(raw)}</h${lvl}>`);
      i++;
      continue;
    }

    /* ---- rule ---- */
    if (RE.rule.test(line)) { out.push('<hr>'); i++; continue; }

    /* ---- blockquote ---- */
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && RE.quote.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + render(buf.join('\n'), srcName) + '</blockquote>');
      continue;
    }

    /* ---- table ---- */
    if (RE.tRow.test(line) && i + 1 < lines.length && RE.tSep.test(lines[i + 1])) {
      const head = tableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && RE.tRow.test(lines[i]) && lines[i].trim()) {
        rows.push(tableRow(lines[i]));
        i++;
      }
      /* scope="col" is not decoration: without it axe flags every <td> in a
         table three-plus cells wide as having no header, and a screen reader
         announces the cells with no idea which column they belong to. */
      out.push(
        '<div class="tw"><table><thead><tr>' + head.map((c) => `<th scope="col">${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    /* ---- list (with one level of nesting) ---- */
    const li = line.match(RE.list);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const base = li[1].length;
      const items = [];

      while (i < lines.length) {
        const m = lines[i].match(RE.list);
        if (!m) {
          /* continuation of the previous item */
          if (items.length && /^\s{2,}\S/.test(lines[i])) {
            items[items.length - 1].text += '\n' + lines[i].replace(/^\s{2,}/, '');
            i++;
            continue;
          }
          break;
        }
        const ind = m[1].length;
        if (ind < base) break;
        if (ind > base) {
          /* nested block: recurse on the de-indented remainder */
          const nested = [];
          while (i < lines.length && /^\s{2,}\S/.test(lines[i])) {
            nested.push(lines[i].replace(new RegExp('^\\s{' + (base + 2) + '}'), ''));
            i++;
          }
          items[items.length - 1].text += '\n\n' + render(nested.join('\n'), srcName);
          continue;
        }
        items.push({ text: m[3] });
        i++;
      }

      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag}>` +
        items.map((it) => '<li>' + inline(it.text) + '</li>').join('') +
        `</${tag}>`
      );
      continue;
    }

    /* ---- blank ---- */
    if (!line.trim()) { i++; continue; }

    /* ---- paragraph ---- */
    const buf = [];
    while (
      i < lines.length && lines[i].trim() &&
      !RE.head.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !RE.quote.test(lines[i]) &&
      !RE.list.test(lines[i]) &&
      !RE.rule.test(lines[i]) &&
      !(RE.tRow.test(lines[i]) && i + 1 < lines.length && RE.tSep.test(lines[i + 1]))
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>');
  }

  return out.join('\n');
}

/* ── Page assembly ────────────────────────────────────────────────────── */

const NAV = [
  { sep: 'Start here' },
  { href: '../README.html', label: 'README' },
  { href: 'GETTING-STARTED.html', label: 'Getting started' },
  { sep: 'Reference' },
  { href: 'ADVANCED.html', label: 'Advanced' },
  { href: 'DEPLOY.html', label: 'Deploy' },
  { href: 'FILE-MAP.html', label: 'File map' },
  { sep: 'Project' },
  { href: '../CHANGELOG.html', label: 'Changelog' },
  { href: '../CONTRIBUTING.html', label: 'Contributing' }
];

function page({ md, crumb, repoPath, depth }) {
  const up = depth ? '../' : '';
  const body = render(md, repoPath);
  const title = (md.match(/^#\s+(.*)$/m) || [, 'Docs'])[1].trim();

  const nav = NAV.map((n) => {
    if (n.sep) return `<span class="sep">${n.sep}</span>`;
    return `<a href="${n.href}">${n.label}</a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="${escHtml(title)} - NovaPulse Edge Map: a free, keyless edge-probe status map built on Leaflet and OpenStreetMap." />
<meta name="theme-color" content="#0B0F14" />
<title>${escHtml(title)} - NovaPulse Edge Map</title>
<link rel="stylesheet" href="${up}dist/novapulse.min.css?v=${pkg.version}" />
<style>
${CSS}
</style>
</head>
<body>
<div class="layout">

  <aside class="side">
    <a href="${up}index.html" class="mark" aria-label="NovaPulse Edge Map home">N</a>
    <h2>NovaPulse Edge Map</h2>
    <p class="ver">v${pkg.version} &middot; MIT</p>
    <nav aria-label="Documentation">${nav}</nav>
    <div class="ext">
      <a href="${up}index.html">Back to showcase</a>
      <a href="https://github.com/SudhirDevOps1/NovaPulse-Map/blob/main/${repoPath}" target="_blank" rel="noopener noreferrer">View source on GitHub</a>
      <a href="https://github.com/SudhirDevOps1/NovaPulse-Map/issues" target="_blank" rel="noopener noreferrer">Report an issue</a>
    </div>
  </aside>

  <main>
    <p class="crumb"><a href="${up}index.html">NovaPulse Edge Map</a> &rsaquo; ${escHtml(crumb)}</p>
    <article class="md">
${body}
    </article>
    <div class="editbar">
      <span>Spotted something wrong or unclear?</span>
      <a href="https://github.com/SudhirDevOps1/NovaPulse-Map/edit/main/${repoPath}" target="_blank" rel="noopener noreferrer">Edit this page on GitHub</a>
      <a href="https://github.com/SudhirDevOps1/NovaPulse-Map/issues/new" target="_blank" rel="noopener noreferrer">Open an issue</a>
    </div>
  </main>

</div>
<script>
${JS}
</script>
</body>
</html>
`;
}

const TARGETS = [
  { md: 'README.md', out: 'README.html', crumb: 'README', depth: 0 },
  { md: 'CHANGELOG.md', out: 'CHANGELOG.html', crumb: 'Changelog', depth: 0 },
  { md: 'CONTRIBUTING.md', out: 'CONTRIBUTING.html', crumb: 'Contributing', depth: 0 },
  { md: 'docs/GETTING-STARTED.md', out: 'docs/GETTING-STARTED.html', crumb: 'Getting started', depth: 1 },
  { md: 'docs/ADVANCED.md', out: 'docs/ADVANCED.html', crumb: 'Advanced', depth: 1 },
  { md: 'docs/DEPLOY.md', out: 'docs/DEPLOY.html', crumb: 'Deploy', depth: 1 },
  { md: 'docs/FILE-MAP.md', out: 'docs/FILE-MAP.html', crumb: 'File map', depth: 1 }
];

const check = process.argv.includes('--check');

console.log('NovaPulse Edge Map - docs\n');
let count = 0;
let stale = 0;

for (const t of TARGETS) {
  const src = join(root, t.md);
  if (!existsSync(src)) {
    console.log(`  SKIP    ${t.md}`);
    continue;
  }
  const html = page({ md: readMd(src), crumb: t.crumb, repoPath: t.md, depth: t.depth });
  const out = join(root, t.out);

  if (check) {
    /* Regenerating during a check would hide drift: CI would overwrite stale
       committed HTML and pass. Compare instead. */
    const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (current === html) {
      console.log(`  ok      ${t.out}`);
    } else {
      console.log(`  STALE   ${t.out}  (run: npm run docs)`);
      stale++;
    }
  } else {
    writeFileSync(out, html, 'utf8');
    console.log(`  ${t.out.padEnd(28)} ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
  }
  count++;
}

if (check) {
  if (stale) {
    console.log(`\n  ${stale} page(s) out of date. Run: npm run docs\n`);
    process.exit(1);
  }
  console.log(`\n  ${count} page(s) up to date\n`);
} else {
  console.log(`\n  ${count} page(s) generated\n`);
}