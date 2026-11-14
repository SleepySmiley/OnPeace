/** Mazzo delle carte territorio e valore dei tris. */
import type { Rng } from '@onpeace/engine';
import type { CardSymbol, ConquestRules } from './schema';
import type { Card, GameContext } from './state';

const SYMBOLS: CardSymbol[] = ['infantry', 'cavalry', 'artillery'];

/** Una carta per territorio (simboli a rotazione, così sono in parti quasi uguali) più i jolly. */
export function buildDeck(ctx: GameContext): Card[] {
  const cards: Card[] = ctx.board.territories.map((t, i) => ({ id: `c_${t.id}`, territory: t.id, symbol: SYMBOLS[i % 3]! }));
  for (let j = 1; j <= ctx.rules.cards.jokers; j++) cards.push({ id: `jolly_${j}`, territory: null, symbol: 'joker' });
  return cards;
}

export function shuffle<T>(items: T[], rng: Pick<Rng, 'int'>): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Armate base di tre carte (senza il bonus dei territori posseduti); null se non è un tris valido. */
export function setValue(rules: ConquestRules, cards: readonly Card[]): number | null {
  if (cards.length !== 3) return null;
  const jokers = cards.filter((c) => c.symbol === 'joker').length;
  const symbols = cards.filter((c) => c.symbol !== 'joker').map((c) => c.symbol as CardSymbol);
  const sets = rules.cards.sets;
  if (jokers === 0) {
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) return sets.threeOfAKind[symbols[0]!];
    if (new Set(symbols).size === 3) return sets.oneOfEach;
    return null;
  }
  if (jokers === 1 && symbols[0] === symbols[1]) return sets.jokerPlusPair;
  return null;
}

/** Tutti i tris giocabili con una mano, dal più ricco al più povero (valore base). */
export function possibleSets(rules: ConquestRules, hand: readonly Card[]): { cards: [Card, Card, Card]; value: number }[] {
  const out: { cards: [Card, Card, Card]; value: number }[] = [];
  for (let i = 0; i < hand.length; i++)
    for (let j = i + 1; j < hand.length; j++)
      for (let k = j + 1; k < hand.length; k++) {
        const cards: [Card, Card, Card] = [hand[i]!, hand[j]!, hand[k]!];
        const value = setValue(rules, cards);
        if (value !== null) out.push({ cards, value });
      }
  return out.sort((a, b) => b.value - a.value);
}
