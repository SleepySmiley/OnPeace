import { describe, expect, it } from 'vitest';
import { parseClientMsg } from '../src';

const attack = (dice: number) => JSON.stringify({ t: 'act', action: { kind: 'attack', from: 'italia', to: 'balcani', dice }, n: 4 });

describe('messaggi del client', () => {
  it('a colpi si attacca fino a 9 dadi: il messaggio passa, il limite vero lo controlla il motore', () => {
    expect(parseClientMsg(attack(9))).toEqual({ t: 'act', action: { kind: 'attack', from: 'italia', to: 'balcani', dice: 9 }, n: 4 });
    expect(parseClientMsg(attack(6))).not.toHaveProperty('error');
    expect(parseClientMsg(attack(3))).not.toHaveProperty('error');
  });

  it('dadi fuori da ogni regola possibile: rifiutato', () => {
    expect(parseClientMsg(attack(0))).toHaveProperty('error');
    expect(parseClientMsg(attack(21))).toHaveProperty('error');
    expect(parseClientMsg(attack(2.5))).toHaveProperty('error');
  });
});
