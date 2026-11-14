/** Formato e controlli del tabellone: il file vero li supera, quelli rotti vengono spiegati. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BoardDef, boardNeighbours, checkBoard } from '../src';

const mondo = () =>
  BoardDef.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/territori/mondo.json', import.meta.url)), 'utf8')));

const triangle = (x: number): [number, number][][] => [
  [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
  ],
];

/** Tre territori in fila (a–b–c) in un solo continente. */
function tiny(): BoardDef {
  return BoardDef.parse({
    id: 'prova',
    name: 'Prova',
    description: '',
    width: 10,
    height: 10,
    continents: [{ id: 'uno', name: 'Uno', bonus: 2 }],
    territories: ['a', 'b', 'c'].map((id, i) => ({ id, name: id, continent: 'uno', anchor: [i, 0], label: [i, 0], shape: [triangle(i)] })),
    links: [
      { a: 'a', b: 'b', sea: false },
      { a: 'b', b: 'c', sea: false },
    ],
  });
}

describe('tabellone', () => {
  it('il mondo supera i controlli', () => {
    const board = mondo();
    expect(checkBoard(board)).toEqual([]);
    const neighbours = boardNeighbours(board);
    expect(neighbours.size).toBe(board.territories.length);
    // i confini valgono nei due sensi
    for (const [id, list] of neighbours) for (const n of list) expect(neighbours.get(n)).toContain(id);
  });

  it('un tabellone giusto non ha errori', () => {
    expect(checkBoard(tiny())).toEqual([]);
    expect(boardNeighbours(tiny()).get('b')).toEqual(['a', 'c']);
  });

  it('id ripetuti e continenti inesistenti', () => {
    const board = tiny();
    board.territories[2]!.id = 'a';
    board.territories[1]!.continent = 'due';
    const errors = checkBoard(board);
    expect(errors).toContain('territorio "a" ripetuto');
    expect(errors).toContain('territorio "b": continente "due" inesistente');
  });

  it('territori isolati o irraggiungibili', () => {
    const board = tiny();
    board.links = [{ a: 'a', b: 'b', sea: false }];
    const errors = checkBoard(board);
    expect(errors).toContain('territorio "c" senza confinanti');
    expect(errors).toContain('territori irraggiungibili: c');
  });

  it('collegamenti sbagliati', () => {
    const board = tiny();
    board.links.push({ a: 'b', b: 'a', sea: false }, { a: 'c', b: 'x', sea: false }, { a: 'a', b: 'c', sea: true });
    const errors = checkBoard(board);
    expect(errors).toContain('collegamento b–a ripetuto');
    expect(errors).toContain('collegamento c–x: territorio inesistente');
    expect(errors).toContain('collegamento via mare a–c senza linea');
  });
});
