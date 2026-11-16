/**
 * Facce dei dadi a colpi: ogni faccia o ha lo scoppio (colpisce) o è liscia (va a vuoto), non ci
 * sono numeri da confrontare. Un dado ha tante facce con lo scoppio quante ne dicono le regole (da
 * `attackOn` in su: con 4, tre su sei); il numero uscito resta sotto e decide solo su quale faccia
 * si ferma il cubo. Lo scoppio è stato scelto su tre disegni (scoppio, mirino, pieno e vuoto).
 */
import './hitface.css';

/** Lo scoppio: otto punte un po' irregolari, come una vampa e non come una stella. */
const BURST = (() => {
  const outer = [8.6, 6.9, 8.3, 7.2, 8.7, 6.8, 8.2, 7.1];
  const inner = [3.9, 3.6, 4.0, 3.7, 3.8, 3.5, 4.0, 3.6];
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer[i / 2]! : inner[(i - 1) / 2]!;
    const a = ((-90 - 7 + i * 22.5) * Math.PI) / 180;
    pts.push(`${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

/**
 * Il segno di una faccia, nelle coordinate dei dadi (-12…12, la faccia è -11…11): lo scoppio se
 * colpisce, niente se va a vuoto. `deep`: inciso nel dado come i puntini dei dadi in 3D (un bordo
 * più scuro sotto a destra).
 */
export function HitGlyph({ hit, deep = false }: { hit: boolean; deep?: boolean }) {
  if (!hit) return null;
  return (
    <g className="hm">
      {deep && <path className="hm-shade" d={BURST} fill="currentColor" transform="translate(0.4 0.55)" />}
      <path d={BURST} fill="currentColor" />
    </g>
  );
}
