/** Dati della partita già pronti per i pannelli: chi sono, cosa posso fare, colori e nomi nello stile in uso. */
import { useMemo } from 'react';
import type { GameView } from '@onpeace/conquista';
import type { LobbyInfo } from '@onpeace/protocol';
import { styleColor, useLook } from '../look';
import { territoryName, useSession, type LoadedBoard } from '../store';
import { myMove, type MyMove } from './logic';

export interface Game {
  view: GameView;
  lobby: LobbyInfo;
  board: LoadedBoard;
  me: string | null;
  move: MyMove;
  colorOf(player: string): string;
  playerName(player: string): string;
  territory(id: string): string;
}

/** Solo dentro la schermata di gioco (partita, sala e tabellone già arrivati). */
export function useGame(): Game {
  const view = useSession((s) => s.view)!;
  const lobby = useSession((s) => s.online.lobby)!;
  const board = useSession((s) => s.board)!;
  const me = useSession((s) => s.online.me);
  const style = useLook((s) => s.style);
  return useMemo(() => {
    const left = lobby.players.find((p) => p.id === me)?.left ?? false;
    const byId = new Map(view.players.map((p) => [p.id, p]));
    return {
      view,
      lobby,
      board,
      me,
      move: myMove(view, me, lobby.rules, left),
      colorOf: (id) => styleColor(style, byId.get(id)?.color ?? '#888888'),
      playerName: (id) => byId.get(id)?.name ?? id,
      territory: (id) => territoryName(board, id),
    };
  }, [view, lobby, board, me, style]);
}
