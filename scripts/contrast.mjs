/**
 * Pick a foreground colour that clears WCAG AA against the card background.
 * Run when a colour fails an audit rather than eyeballing a new hex.
 *
 *   node scripts/contrast.mjs <hex> <bgHex> [required]
 */
const lum = (hex) => {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
};

const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const [, , fg, bg, need = '4.5'] = process.argv;

if (fg && bg) {
  const r = ratio(fg, bg);
  console.log(`${fg} on ${bg} = ${r.toFixed(2)}:1  (need ${need})  ${r >= Number(need) ? 'PASS' : 'FAIL'}`);
} else {
  /* No args: audit every colour pair the design system actually uses. */
  const PAIRS = [
    ['#9FB0C6', '#111823', 'faint on card'],
    ['#8FB4D4', '#111823', 'candidate blue on card'],
    ['#94A3B8', '#111823', 'dim on card'],
    ['#7BA3C4', '#111823', 'candidate blue on card'],
    ['#5C7C99', '#111823', 'current .num on card'],
    ['#8FA8C4', '#111823', 'candidate blue on card'],
    ['#E2E8F0', '#111823', 'fg on card'],
    ['#22C55E', '#111823', 'ok on card'],
    ['#F59E0B', '#111823', 'warn on card'],
    ['#EF4444', '#111823', 'bad on card'],
  ];
  for (const [f, b, label] of PAIRS) {
    const r = ratio(f, b);
    console.log(`  ${r >= 4.5 ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  ${label}  (${f} on ${b})`);
  }
}