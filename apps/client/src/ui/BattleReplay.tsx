/**
 * Replay di una battaglia scambio per scambio, come il pannello Combattimento di atWar:
 * barre degli HP, chi colpisce e chi incassa, tiri e critici, caduti.
 */
import { useEffect, useMemo, useState } from 'react';
import type { GameState, TurnEvent } from '@onpeace/engine';
import { cityName, playerName, unitName } from '../game/describe';
import { sfx } from '../audio/sfx';
import { ctx } from '../game/store';

type BattleEvent = Extract<TurnEvent, { kind: 'battle' }>;

interface Props {
  game: GameState;
  battle: BattleEvent;
  onClose: () => void;
}

export function BattleReplay({ game, battle, onClose }: Props) {
  const [step, setStep] = useState(0); // scambi già mostrati
  const [playing, setPlaying] = useState(true);
  const total = battle.exchanges.length;

  useEffect(() => {
    if (!playing || step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), 750);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // a ogni scambio mostrato: colpo, critico o unità eliminata
  useEffect(() => {
    const x = step > 0 ? battle.exchanges[step - 1] : undefined;
    if (!x) return;
    if (x.hits.some((h) => h.hp <= 0)) sfx.play('kill');
    else sfx.play(x.attackCrit || x.defenceCrit ? 'crit' : 'hit');
  }, [battle, step]);

  // HP di ogni unità dopo `step` scambi
  const hp = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of [...battle.attackers, ...battle.defenders]) m.set(u.uid, u.hp);
    for (const x of battle.exchanges.slice(0, step)) for (const h of x.hits) m.set(h.uid, h.hp);
    return m;
  }, [battle, step]);

  const current = step > 0 ? battle.exchanges[step - 1] : undefined;
  const front = new Set(current ? [current.attacker, current.defender] : []);
  const where = battle.city ? cityName(battle.city) : 'in campo aperto';
  const finished = step >= total;

  const side = (title: string, owner: string | null, units: BattleEvent['attackers']) => {
    const color = owner ? game.players.find((p) => p.id === owner)?.color : '#9aa3a8';
    return (
      <section className="replay-side">
        <h3>
          <span className="swatch small" style={{ background: color }} /> {title}: {playerName(game, owner)}
        </h3>
        <ul>
          {units.map((u) => {
            const max = u.maxHp ?? ctx.catalog.typeStats(u.type).hp;
            const now = hp.get(u.uid) ?? 0;
            const dead = now <= 0;
            return (
              <li key={u.uid} className={`${dead ? 'dead' : ''} ${front.has(u.uid) ? 'front' : ''}`}>
                <span className="replay-name">{unitName(u.type)}</span>
                <span className="hp-bar" aria-label={`${now} HP su ${max}`}>
                  <span style={{ width: `${(100 * Math.max(0, now)) / max}%` }} />
                </span>
                <span className="num dim">{Math.max(0, now)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal replay" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Replay della battaglia">
        <div className="panel-kicker">
          Battaglia {where} {battle.mutual && '· attacco reciproco'}
        </div>
        <h1>
          {finished ? `Vince ${playerName(game, battle.winner === 'attacker' ? battle.attacker : battle.defender)}` : 'Combattimento'}
        </h1>
        <div className="replay-grid">
          {side('Attacco', battle.attacker, battle.attackers)}
          {side('Difesa', battle.defender, battle.defenders)}
        </div>
        <div className="replay-log" aria-live="polite">
          {current ? (
            <>
              <b>{unitName(battle.attackers.concat(battle.defenders).find((u) => u.uid === current.attacker)?.type ?? '')}</b> tira{' '}
              <b className="num">{current.attackRoll}</b>
              {current.attackCrit && <span className="crit"> critico</span>} ·{' '}
              <b>{unitName(battle.attackers.concat(battle.defenders).find((u) => u.uid === current.defender)?.type ?? '')}</b> risponde{' '}
              <b className="num">{current.defenceRoll}</b>
              {current.defenceCrit && <span className="crit"> critico</span>}
              {current.killed.length > 0 && <span className="dead-text"> · {current.killed.length} cadut{current.killed.length > 1 ? 'i' : 'o'}</span>}
            </>
          ) : (
            <span className="dim">Inizio della battaglia</span>
          )}
        </div>
        <div className="button-row replay-controls">
          <button type="button" className="ghost" onClick={() => setStep(0)}>
            ⏮
          </button>
          <button type="button" className="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ◀
          </button>
          <button type="button" className="primary" onClick={() => setPlaying((p) => !p)} disabled={finished}>
            {playing && !finished ? 'Pausa' : 'Riproduci'}
          </button>
          <button type="button" className="ghost" onClick={() => setStep((s) => Math.min(total, s + 1))} disabled={finished}>
            ▶
          </button>
          <button type="button" className="ghost" onClick={() => setStep(total)} disabled={finished}>
            ⏭
          </button>
          <span className="dim num">
            {step}/{total}
          </span>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
