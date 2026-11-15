import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@onpeace/conquista';
import { AUTO_MS, FLIP_MS, FLY_MS, HOLD_MS, cardsInScene, setDrawGate, useDraw } from '../src/play/draw';

const brasile: Card = { id: 'c_brasile', territory: 'brasile', symbol: 'cavalry' };
const perù: Card = { id: 'c_peru', territory: 'peru', symbol: 'infantry' };
const jolly: Card = { id: 'jolly_1', territory: null, symbol: 'joker' };

const draw = () => useDraw.getState();
const stage = () => draw().current?.stage ?? null;

let busy = false;

beforeEach(() => {
  vi.useFakeTimers();
  busy = false;
  setDrawGate(() => busy);
  draw().clear();
  useDraw.setState({ landed: 0 });
});

afterEach(() => {
  draw().clear();
  vi.useRealTimers();
});

describe('scena della pesca', () => {
  it('senza clic: il mazzo aspetta, poi la carta si gira, resta ferma e vola tra le carte', () => {
    draw().push(brasile);
    expect(stage()).toBe('offer');
    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(stage()).toBe('offer');
    vi.advanceTimersByTime(1);
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(FLIP_MS + HOLD_MS);
    expect(stage()).toBe('fly');
    expect(draw().landed).toBe(0);
    vi.advanceTimersByTime(FLY_MS);
    expect(draw().current).toBeNull();
    expect(draw().landed).toBeGreaterThan(0);
  });

  it('a metà giro il territorio della carta lampeggia sulla mappa; il jolly no', () => {
    draw().push(brasile);
    draw().take();
    expect(draw().spot).toBeNull();
    vi.advanceTimersByTime(FLIP_MS / 2);
    expect(draw().spot?.territory).toBe('brasile');

    draw().clear();
    draw().push(jolly);
    draw().take();
    vi.advanceTimersByTime(FLIP_MS);
    expect(draw().spot).toBeNull();
  });

  it('il clic sul mazzo gira subito la carta, il secondo la manda tra le carte finito il giro', () => {
    draw().push(brasile);
    draw().take();
    expect(stage()).toBe('reveal');
    draw().skip();
    // il giro non si taglia: la carta parte appena girata, senza la pausa per leggerla
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(FLIP_MS - 1);
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(1);
    expect(stage()).toBe('fly');
    // un clic in più durante il volo non cambia niente
    draw().take();
    draw().skip();
    expect(stage()).toBe('fly');
  });

  it('il clic a carta già girata la manda subito', () => {
    draw().push(brasile);
    draw().take();
    vi.advanceTimersByTime(FLIP_MS + 200);
    expect(stage()).toBe('reveal');
    draw().skip();
    expect(stage()).toBe('fly');
  });

  it('un clic a metà giro accorcia la pausa, non il giro (e il territorio lampeggia prima del volo)', () => {
    draw().push(brasile);
    draw().take();
    vi.advanceTimersByTime(FLIP_MS / 2 - 100);
    draw().skip();
    draw().skip();
    vi.advanceTimersByTime(100);
    expect(draw().spot?.territory).toBe('brasile');
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(FLIP_MS / 2 - 1);
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(1);
    expect(stage()).toBe('fly');
  });

  it('solo la carta appena arrivata fa il sobbalzo nel ventaglio', () => {
    expect(draw().landedId).toBeNull();
    draw().push(brasile);
    draw().take();
    vi.advanceTimersByTime(FLIP_MS + HOLD_MS + FLY_MS);
    expect(draw().landedId).toBe('c_brasile');
    draw().push(perù);
    draw().take();
    vi.advanceTimersByTime(FLIP_MS + HOLD_MS + FLY_MS);
    expect(draw().landedId).toBe('c_peru');
    draw().clear();
    expect(draw().landedId).toBeNull();
  });

  it('due carte di fila: la seconda aspetta che la prima arrivi', () => {
    draw().push(brasile);
    draw().push(perù);
    expect(draw().current?.card.id).toBe('c_brasile');
    expect(cardsInScene(draw())).toEqual(new Set(['c_brasile', 'c_peru']));
    draw().take();
    draw().skip();
    vi.advanceTimersByTime(FLIP_MS + FLY_MS);
    expect(draw().current?.card.id).toBe('c_peru');
    expect(stage()).toBe('offer');
    expect(cardsInScene(draw())).toEqual(new Set(['c_peru']));
  });

  it('con una battaglia propria in scena la carta aspetta; finita, parte', () => {
    busy = true;
    draw().push(brasile);
    expect(draw().current).toBeNull();
    expect(cardsInScene(draw())).toEqual(new Set(['c_brasile']));
    vi.advanceTimersByTime(AUTO_MS * 2);
    expect(draw().current).toBeNull();
    busy = false;
    draw().kick();
    expect(stage()).toBe('offer');
  });

  it('se ti attaccano mentre il mazzo aspetta, il mazzo si toglie e la carta torna dopo da capo', () => {
    draw().push(brasile);
    draw().push(perù);
    vi.advanceTimersByTime(AUTO_MS - 100);
    busy = true;
    draw().yieldToBattle();
    expect(draw().current).toBeNull();
    expect(draw().queue.map((c) => c.id)).toEqual(['c_brasile', 'c_peru']);
    // la pesca automatica non scatta durante la battaglia
    vi.advanceTimersByTime(AUTO_MS);
    expect(draw().current).toBeNull();
    busy = false;
    draw().kick();
    expect(draw().current?.card.id).toBe('c_brasile');
    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(stage()).toBe('offer');
  });

  it('se ti attaccano a carta già girata, la carta vola tra le carte appena finito il giro', () => {
    draw().push(brasile);
    draw().take();
    draw().yieldToBattle();
    expect(stage()).toBe('reveal');
    vi.advanceTimersByTime(FLIP_MS);
    expect(stage()).toBe('fly');
    vi.advanceTimersByTime(FLY_MS);
    expect(draw().current).toBeNull();
    expect(draw().landed).toBeGreaterThan(0);
  });

  it('uscendo dalla partita la scena si svuota e non riparte da sola', () => {
    draw().push(brasile);
    draw().push(perù);
    draw().clear();
    expect(draw().current).toBeNull();
    expect(draw().queue).toEqual([]);
    vi.advanceTimersByTime(AUTO_MS * 3);
    expect(draw().current).toBeNull();
  });
});
