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
  const i = css.lastIndexOf(selector);
  assert.ok(i >= 0, `missing ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}
function checkTheme(name, t) {
  for (const fg of ['text', 'muted', 'faint']) {
    for (const bg of ['canvas', 'sidebar', 'surface', 'surface-raised']) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= 4.5, `${name}: --${fg} ${t[fg]} on --${bg} ${t[bg]} is ${ratio.toFixed(2)} (< 4.5)`);
    }
  }
}

test('default theme is white with black text and a pink accent', () => {
  const root = vars(tokens);
  assert.equal(root.canvas, '#ffffff');
  assert.equal(root.text, '#0a0a0a');
  assert.match(tokens, /color-scheme:\s*light/);
  const def = vars(themeBlock('.workspace-shell[data-theme="light"] {'));
  assert.equal(def.canvas, '#ffffff');
  assert.equal(def.accent, '#db2777');
  assert.match(css, /\.workspace-shell\[data-theme="auto"\],\s*\n\.workspace-shell\[data-theme="light"\] \{/, 'Auto (the default) must use the white theme on every OS');
});

test('theme text tokens meet WCAG AA (4.5:1) on every surface', () => {
  checkTheme('default', vars(tokens));
  checkTheme('auto/light', vars(themeBlock('.workspace-shell[data-theme="light"] {')));
  checkTheme('dark', vars(themeBlock('.workspace-shell[data-theme="dark"] { --canvas')));
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
});
