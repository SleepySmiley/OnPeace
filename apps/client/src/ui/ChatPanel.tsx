import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store';

const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });

/** Chat della partita, con l'orario di ogni messaggio. */
export function ChatPanel() {
  const chat = useSession((s) => s.online.chat);
  const me = useSession((s) => s.online.me);
  const send = useSession((s) => s.send);
  const markRead = useSession((s) => s.markChatRead);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    markRead();
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, markRead]);

  return (
    <div className="chat">
      <ul className="chat-lines">
        {chat.length === 0 && <li className="placeholder">Nessun messaggio.</li>}
        {chat.map((l) => (
          <li key={`${l.at}:${l.from}`} className={l.from === me ? 'mine' : ''}>
            <span className="chat-time num dim">{time.format(l.at)}</span>
            <b style={{ color: l.color }}>{l.name}</b> {l.text}
          </li>
        ))}
        <li ref={endRef} aria-hidden />
      </ul>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          send({ t: 'chat', text: t });
          setText('');
        }}
      >
        <input value={text} maxLength={300} placeholder="Scrivi…" aria-label="Messaggio" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="ghost" disabled={!text.trim()}>
          Invia
        </button>
      </form>
    </div>
  );
}
