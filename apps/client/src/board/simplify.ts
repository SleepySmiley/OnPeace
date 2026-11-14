/**
 * Semplificazione dei contorni (Douglas-Peucker): toglie i punti che si discostano dalla linea
 * meno di `tol`. Serve a disegnare il tabellone con il dettaglio che lo schermo può mostrare:
 * a mappa intera decine di migliaia di vertici finiscono sotto lo stesso pixel.
 */
type Pt = readonly [number, number];

/** Linea aperta: estremi sempre tenuti. */
export function simplifyLine<P extends Pt>(pts: readonly P[], tol: number): P[] {
  if (pts.length <= 2 || tol <= 0) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const t2 = tol * tol;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i]!;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const ex = x - ax - t * dx;
      const ey = y - ay - t * dy;
      const d = ex * ex + ey * ey;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > t2) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/**
 * Anello chiuso (senza il punto finale ripetuto). I punti `fixed` restano sempre: sono quelli
 * dove cambia il vicino, così il tratto in comune tra due territori si semplifica uguale da
 * entrambe le parti e tra i due riempimenti non si apre una fessura.
 */
export function simplifyRing<P extends Pt>(ring: readonly P[], tol: number, fixed?: ArrayLike<number>): P[] {
  const n = ring.length;
  if (n <= 3 || tol <= 0) return [...ring];
  const anchors: number[] = [];
  for (let i = 0; i < n; i++) if (fixed?.[i]) anchors.push(i);
  if (anchors.length === 0) {
    // nessun punto obbligato: si tengono il primo e quello più lontano da lui
    const [x0, y0] = ring[0]!;
    let far = 1;
    let best = -1;
    for (let i = 1; i < n; i++) {
      const d = (ring[i]![0] - x0) ** 2 + (ring[i]![1] - y0) ** 2;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    anchors.push(0, far);
  }
  const out: P[] = [];
  for (let k = 0; k < anchors.length; k++) {
    const from = anchors[k]!;
    const to = anchors[(k + 1) % anchors.length]!;
    const piece: P[] = [];
    for (let i = from; ; i = (i + 1) % n) {
      piece.push(ring[i]!);
      if (i === to && piece.length > 1) break;
    }
    const s = simplifyLine(piece, tol);
    s.pop(); // l'ultimo punto è il primo del pezzo dopo
    out.push(...s);
  }
  return out.length >= 3 ? out : [...ring];
}
