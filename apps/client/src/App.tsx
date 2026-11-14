/**
 * OnPeace nel browser: pagina iniziale (crea o entra), sala d'attesa, partita. Il tabellone
 * resta sullo sfondo anche prima di cominciare.
 */
import { useEffect, useState } from 'react';
import { BoardCanvas } from './board/BoardCanvas';
import type { BoardState } from './board/common';
import { useLook } from './look';
import { GameScreen } from './play/GameScreen';
import { fetchDefaultBoard, useSession, type LoadedBoard } from './store';
import { Home } from './ui/Home';
import { Lobby } from './ui/Lobby';

const EMPTY: BoardState = { owners: new Map(), armies: new Map(), hover: null, selected: null, arrows: null, tokens: false };
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export function App() {
  const online = useSession((s) => s.online);
  const view = useSession((s) => s.view);
  const board = useSession((s) => s.board);
  const notice = useSession((s) => s.notice);
  const style = useLook((s) => s.style);
  const [backdrop, setBackdrop] = useState<LoadedBoard | null>(null);

  // all'avvio: se il browser ricorda una partita (e il link non ne indica un'altra), si rientra
  useEffect(() => {
    useSession.getState().resume();
  }, []);

  // il tabellone sullo sfondo della pagina iniziale e della sala d'attesa
  useEffect(() => {
    if (board || backdrop) return;
    let alive = true;
    void fetchDefaultBoard().then((b) => alive && setBackdrop(b));
    return () => {
      alive = false;
    };
  }, [board, backdrop]);

  useEffect(() => {
    if (!notice || (view && board)) return;
    const id = setTimeout(() => useSession.getState().setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice, view, board]);

  const lobby = online.lobby;
  if (lobby && lobby.phase !== 'lobby' && view && board) return <GameScreen />;

  const bg = board ?? backdrop;
  return (
    <div className="shell">
      {bg && <BoardCanvas geo={bg.geo} style={style} state={EMPTY} insets={NO_INSETS} />}
      <div className="veil" />
      {online.game ? <Lobby /> : <Home />}
      {notice && (
        <div className="toast" role="status" onClick={() => useSession.getState().setNotice(null)}>
          {notice}
        </div>
      )}
    </div>
  );
}
