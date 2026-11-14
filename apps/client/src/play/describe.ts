/** Testi della partita: fasi, carte ed eventi raccontati in italiano. */
import type { Card, GameEvent, GameView, Phase } from '@onpeace/conquista';

export const PHASES: { id: Exclude<Phase, 'over'>; label: string }[] = [
  { id: 'setup', label: 'Piazzamento' },
  { id: 'reinforce', label: 'Rinforzi' },
  { id: 'attack', label: 'Attacco' },
  { id: 'fortify', label: 'Spostamento' },
];

export const SYMBOL_NAME: Record<Card['symbol'], string> = {
  infantry: 'Fanteria',
  cavalry: 'Cavalleria',
  artillery: 'Artiglieria',
  joker: 'Jolly',
};

export interface Names {
  player(id: string): string;
  territory(id: string): string;
}

export function namesFor(view: GameView, territoryName: (id: string) => string): Names {
  return {
    player: (id) => view.players.find((p) => p.id === id)?.name ?? id,
    territory: territoryName,
  };
}

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
const armies = (n: number) => (n === 1 ? '1 armata' : `${n} armate`);

/** Una riga del registro. `me`: chi legge (per "tu", "peschi"…). */
export function describeEvent(e: GameEvent, n: Names, me: string | null): string {
  const who = (id: string) => (id === me ? 'Tu' : n.player(id));
  switch (e.type) {
    case 'setup-place':
      return e.hidden
        ? `${who(e.player)}: armate piazzate (coperte fino alla fine)`
        : `${who(e.player)}: ${armies(sum(e.placements))} in ${Object.keys(e.placements).map(n.territory).join(', ')}`;
    case 'setup-reveal':
      return 'Si scoprono le armate di tutti: comincia la partita';
    case 'turn':
      return `Turno ${e.number}: tocca a ${e.player === me ? 'te' : n.player(e.player)} (+${armies(e.reinforcements)})`;
    case 'set':
      return `${who(e.player)}: tris ${e.cards.map((c) => SYMBOL_NAME[c.symbol].toLowerCase()).join(', ')} → +${armies(e.armies)}`;
    case 'reinforce':
      return `${who(e.player)}: rinforzi in ${Object.keys(e.placements).map(n.territory).join(', ')}`;
    case 'battle': {
      const lost = [
        e.attackerLosses > 0 ? `${who(e.player)} −${e.attackerLosses}` : null,
        e.defenderLosses > 0 ? `${who(e.defender)} −${e.defenderLosses}` : null,
      ]
        .filter(Boolean)
        .join(', ');
      const head = `${n.territory(e.from)} → ${n.territory(e.to)}: ${e.attack.join('·')} contro ${e.defense.join('·')} (${lost})`;
      if (!e.conquered) return head;
      return `${head}. ${e.player === me ? 'Conquisti' : `${n.player(e.player)} conquista`} ${n.territory(e.to)}`;
    }
    case 'occupy':
      return `${who(e.player)}: ${e.armies === 1 ? '1 armata entra' : `${e.armies} armate entrano`} in ${n.territory(e.to)}`;
    case 'fortify':
      return `${who(e.player)}: ${armies(e.armies)} da ${n.territory(e.from)} a ${n.territory(e.to)}`;
    case 'card':
      return e.card
        ? `Peschi una carta: ${e.card.territory ? n.territory(e.card.territory) : 'jolly'} (${SYMBOL_NAME[e.card.symbol].toLowerCase()})`
        : `${who(e.player)} pesca una carta`;
    case 'eliminated':
      if (e.by === me) return `Elimini ${n.player(e.player)}${e.cardsTaken > 0 ? ` e prendi le sue ${e.cardsTaken} carte` : ''}`;
      return `${n.player(e.by)} elimina ${e.player === me ? 'te' : n.player(e.player)}${e.cardsTaken > 0 ? ` e prende ${e.cardsTaken} carte` : ''}`;
    case 'objective-changed':
      return 'Il tuo bersaglio l’ha eliminato qualcun altro: hai un nuovo obiettivo';
    case 'victory': {
      const why = e.reason === 'objective' ? 'obiettivo raggiunto' : e.reason === 'conquest' ? 'ha conquistato il mondo' : 'non è rimasto nessun altro';
      return `${e.player === me ? 'Hai vinto' : `Vince ${n.player(e.player)}`}: ${why}`;
    }
  }
}

/** Gli eventi da mostrare in evidenza (gli altri restano solo nel registro). */
export function isHighlight(e: GameEvent): boolean {
  return e.type === 'battle' || e.type === 'eliminated' || e.type === 'victory' || e.type === 'set' || e.type === 'setup-reveal';
}
