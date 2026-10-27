import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../frontend/src/styles.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../../frontend/src/styles/tokens.css', import.meta.url), 'utf8');

function lum(hex) {
  const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
function vars(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));
}
function themeBlock(selector) {
  let i = css.lastIndexOf(selector);
  while (i >= 0) {
    const end = css.indexOf('}', i);
    const block = css.slice(i, end);
    if (block.includes('--canvas:') && block.includes('--surface:')) return block;
    i = css.lastIndexOf(selector, i - 1);
  }
  assert.fail(`missing complete theme variables for ${selector}`);
}
function checkTheme(name, t) {
  for (const fg of ['text', 'muted', 'faint']) {
    for (const bg of ['canvas', 'sidebar', 'surface', 'surface-raised']) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= 4.5, `${name}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${ratio.toFixed(2)} (< 4.5)`);
    }
  }
}

test('default theme is Freebuff-style dark with a pink accent; white stays as Light', () => {
  const root = vars(tokens);
  assert.equal(root.canvas, '#0a0a0a');
  assert.equal(root.sidebar, '#0f0f0f');
  assert.equal(root.surface, '#171717');
  assert.equal(root.text, '#ebebeb');
  assert.match(tokens, /color-scheme:\s*dark/);
  const def = vars(themeBlock('.workspace-shell:is([data-theme="auto"], [data-theme="dark"]) {'));
  assert.equal(def.canvas, '#0a0a0a');
  assert.equal(def.accent, '#f472b6');
  const light = vars(themeBlock('.workspace-shell[data-theme="light"] {'));
  assert.equal(light.canvas, '#ffffff');
  assert.ok(contrast(def.line, def.canvas) >= 1.6 && contrast(def.line, def.surface) >= 1.4, 'card/table borders must stay visible');
});

test('theme text tokens meet WCAG AA (4.5:1) on every surface', () => {
  checkTheme('default', vars(tokens));
  checkTheme('auto/light', vars(themeBlock('.workspace-shell[data-theme="light"] {')));
  checkTheme('dark default', vars(themeBlock('.workspace-shell:is([data-theme="auto"], [data-theme="dark"]) {')));
});

test('pink primary button, alert and error colours are readable', () => {
  assert.ok(contrast('#ffffff', '#be185d') >= 4.5, 'white on pink button');
  assert.ok(contrast('#ffffff', '#9d174d') >= 4.5, 'white on pink button hover');
  assert.ok(contrast('#881337', '#fff1f5') >= 4.5, 'light alert');
  assert.ok(contrast('#b91c1c', '#ffffff') >= 4.5, 'light error text');
  assert.ok(contrast('#9f1239', '#ffffff') >= 4.5, 'light text button');
  assert.ok(contrast('#7c2d12', '#fff7ed') >= 4.5, 'light warning button');
  assert.ok(contrast('#be185d', '#ffffff') >= 4.5, 'focus/badge pink on white');
  assert.ok(contrast('#831843', '#fce7f3') >= 4.5, 'current nav item');
  assert.ok(contrast('#0a0a0a', '#f472b6') >= 4.5, 'dark: black on pink button');
  assert.ok(contrast('#fecdd3', '#2a0f1a') >= 4.5, 'dark alert');
  assert.ok(contrast('#fbcfe8', '#3b1730') >= 4.5, 'dark badge');
  assert.ok(contrast('#ebebeb', '#1c1c1c') >= 4.5, 'dark user bubble');
});
