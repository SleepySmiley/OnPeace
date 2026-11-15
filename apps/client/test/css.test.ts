/**
 * Ogni foglio di stile del client passa dal minificatore del build (lightningcss, quello di Vite).
 * In sviluppo Vite non minifica e il browser scarta in silenzio quello che non capisce: una graffa
 * in più si scopriva solo con `npm run build`, cioè all'avvio della serata.
 * Lo stesso silenzio per un'animazione che nomina @keyframes che non ci sono più: non parte e basta.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from 'lightningcss';

const src = fileURLToPath(new URL('../src', import.meta.url));
const cssFiles = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.css')).map((f) => join(src, f));

/** Le parole di `animation` che non sono nomi (durate e numeri si riconoscono a parte). */
const NOT_NAMES = new Set([
  'none',
  'infinite',
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
  'auto',
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
]);

/** I nomi delle @keyframes usati da `animation` e `animation-name` in un foglio (senza commenti). */
function animationNames(css: string): string[] {
  const names: string[] = [];
  for (const m of css.matchAll(/(?:^|[{;])\s*(?:-webkit-)?animation(?:-name)?\s*:([^;}]+)/g)) {
    // via le funzioni (var, calc, cubic-bezier, steps…), anche annidate, e !important
    let value = m[1]!.replace(/!important/g, '');
    for (let before = ''; before !== value; ) {
      before = value;
      value = value.replace(/[\w-]*\([^()]*\)/g, ' ');
    }
    for (const word of value.split(/[\s,]+/)) {
      if (word && !NOT_NAMES.has(word) && !/^[-+]?[\d.]+(m?s)?$/.test(word)) names.push(word);
    }
  }
  return names;
}

describe('fogli di stile', () => {
  it('ci sono', () => {
    expect(cssFiles.length).toBeGreaterThan(3);
  });

  it.each(cssFiles.map((f) => [relative(src, f), f]))('%s si minifica senza errori né regole scartate', (_name, file) => {
    const code = readFileSync(file);
    // errorRecovery: le regole non valide diventano avvisi invece di fermare tutto, così si vedono tutte
    const { warnings } = transform({ filename: file, code, minify: true, errorRecovery: true });
    expect(warnings.map((w) => `${w.loc.line}:${w.loc.column} ${w.message}`)).toEqual([]);
    expect(() => transform({ filename: file, code, minify: true })).not.toThrow();
  });

  it('ogni animazione ha le sue @keyframes (in uno qualsiasi dei fogli)', () => {
    const defined = new Set<string>();
    const used: { file: string; name: string }[] = [];
    for (const file of cssFiles) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)) defined.add(m[1]!);
      for (const name of animationNames(css)) used.push({ file: relative(src, file), name });
    }
    expect(used.length).toBeGreaterThan(10);
    const missing = used.filter((u) => !defined.has(u.name)).map((u) => `${u.file}: ${u.name}`);
    expect([...new Set(missing)]).toEqual([]);
  });

  it('il controllo delle animazioni legge anche le forme scritte con var() e calc()', () => {
    const css = '.a { animation: uno var(--t) cubic-bezier(0.2, 0, 0, 1) calc(var(--t) * 0.5) both, due 0.2s ease-out infinite; } .b{animation-name:tre !important}';
    expect(animationNames(css)).toEqual(['uno', 'due', 'tre']);
  });
});
