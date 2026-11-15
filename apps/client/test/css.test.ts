/**
 * Ogni foglio di stile del client passa dal minificatore del build (lightningcss, quello di Vite).
 * In sviluppo Vite non minifica e il browser scarta in silenzio quello che non capisce: una graffa
 * in più si scopriva solo con `npm run build`, cioè all'avvio della serata.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transform } from 'lightningcss';

const src = fileURLToPath(new URL('../src', import.meta.url));
const cssFiles = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.css')).map((f) => join(src, f));

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
});
