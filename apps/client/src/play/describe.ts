/** Testi della partita: fasi, carte ed eventi raccontati in italiano. */
import { diceAfter, type Card, type ConquestRules, type GameEvent, type GameView, type Phase } from '@onpeace/conquista';

export const PHASES: { id: Exclude<Phase, 'over'>; label: string }[] = [
  { id: 'briefing', label: 'Obiettivo' },
  { id: 'draft', label: 'Scelta territori' },
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
    case 'ready':
      return `${who(e.player)}: obiettivo letto`;
    case 'pick':
      return `${who(e.player)}: ${e.player === me ? 'prendi' : 'prende'} ${n.territory(e.territory)}`;
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
      if (e.volleys) {
        // a turno: quanti tiri e quanti colpi in tutto, i dadi sarebbero troppi
        const hits = (by: 'attack' | 'defense') => e.volleys!.filter((v) => v.by === by).reduce((t, v) => t + v.hits, 0);
        const tiri = e.volleys.length === 1 ? '1 tiro' : `${e.volleys.length} tiri`;
        const head = `${n.territory(e.from)} → ${n.territory(e.to)}: ${tiri} a turno, colpi ${hits('attack')} a ${hits('defense')} (${lost || 'nessuna perdita'})`;
        if (!e.conquered) return head;
        return `${head}. ${e.player === me ? 'Conquisti' : `${n.player(e.player)} conquista`} ${n.territory(e.to)}`;
      }
      // a coppie si scrivono i dadi che hanno deciso (dopo i pari ritirati), a colpi anche quanti colpi
      const final = diceAfter(e);
      const how = e.hits ? `, ${e.hits.attack} ${e.hits.attack === 1 ? 'colpo' : 'colpi'} a ${e.hits.defense}` : e.rerolls ? ', pari ritirati' : '';
      const head = `${n.territory(e.from)} → ${n.territory(e.to)}: ${final.attack.join('·')} contro ${final.defense.join('·')}${how} (${lost || 'nessuna perdita'})`;
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
    case 'eliminated': {
      // objectiveChanged arriva solo a chi doveva eliminarlo lui (vedi eventsFor)
      const changed = e.objectiveChanged ? '. Era il tuo bersaglio: hai un nuovo obiettivo' : '';
      if (e.by === me) return `Elimini ${n.player(e.player)}${e.cardsTaken > 0 ? ` e prendi le sue ${e.cardsTaken} carte` : ''}${changed}`;
      return `${n.player(e.by)} elimina ${e.player === me ? 'te' : n.player(e.player)}${e.cardsTaken > 0 ? ` e prende ${e.cardsTaken} carte` : ''}${changed}`;
    }
    // partite salvate prima: ora il cambio di obiettivo sta in 'eliminated'
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

/** "4, 5 o 6": le facce da `from` in su. */
function facesFrom(from: number): string {
  const f = Array.from({ length: 7 - from }, (_, i) => String(from + i));
  return f.length === 1 ? f[0]! : `${f.slice(0, -1).join(', ')} o ${f.at(-1)}`;
}

/** Le regole dei dadi in parole, per la sala d'attesa e la guida. */
export function diceRules(d: ConquestRules['dice']): string {
  if (d.combat === 'alternate') {
    const h = d.hits;
    const on = h.attackOn === h.defenseOn ? `con ${facesFrom(h.attackOn)}` : `con ${facesFrom(h.attackOn)} per chi attacca, ${facesFrom(h.defenseOn)} per chi difende`;
    return (
      `A colpi, a turno: chi attacca sceglie quante armate mandare (una resta a casa). Tira prima chi difende, un dado per armata ` +
      `fino a ${h.max}: ogni dado ${on} toglie subito un'armata a chi attacca. Poi tira chi attacca con le armate che gli restano, ` +
      `e così via. Si va fino in fondo: vince chi resta con delle armate in campo, e chi conquista entra con quelle sopravvissute.`
    );
  }
  if (d.combat === 'hits') {
    const h = d.hits;
    const on = h.attackOn === h.defenseOn ? `con ${facesFrom(h.attackOn)}` : `con ${facesFrom(h.attackOn)} per chi attacca, ${facesFrom(h.defenseOn)} per chi difende`;
    return (
      `A colpi: chi attacca tira fino a ${h.max} dadi (uno in meno delle armate che ha), chi difende uno per armata, fino a ${h.max}. ` +
      `Ogni dado ${on} è un colpo e toglie un'armata all'altro, da tutte e due le parti insieme. Chi attacca perde al massimo ` +
      `le armate che ha mandato; se cadono tutti, il territorio resta a chi difende con un'armata.`
    );
  }
  const ties = {
    defender: 'a pari vince chi difende',
    attacker: 'a pari vince chi attacca',
    'reroll-pair': 'se due dadi sono pari si ritirano, finché non sono diversi',
    'reroll-all': "se c'è un pari si ritira tutto il lancio",
  }[d.tiesTo];
  return (
    `A coppie: chi attacca tira fino a ${d.attackMax} dadi (uno in meno delle armate che ha), chi difende fino a ${d.defenseMax}. ` +
    `Si confrontano il più alto con il più alto, poi il secondo: chi perde il confronto perde un'armata; ${ties}.`
  );
}
