// Second chat pane for split view: pick any other saved chat and read it side by side, or open it.
import { useState } from 'react';
import { routeLabel } from './routeLabel.js';

export default function SplitPane({ chats, activeChatId, models, onOpen, onClose }) {
  const others = (chats || []).filter((chat) => chat.id !== activeChatId);
  const [chosen, setChosen] = useState('');
  const chat = others.find((item) => item.id === chosen) || null;
  return (
    <section className="fw-split-pane" aria-label="Second chat">
      <header className="fw-split-head">
        <select aria-label="Choose chat" value={chat ? chosen : ''} onChange={(event) => setChosen(event.target.value)}>
          <option value="">Choose chat</option>
          {others.map((item) => <option key={item.id} value={item.id}>{item.title || 'Untitled chat'}</option>)}
        </select>
        {chat && <button type="button" className="text-button" onClick={() => onOpen(chat.id)}>Open</button>}
        <button type="button" className="fw-top-toggle" aria-label="Close split view" title="Close split view" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      {!chat
        ? <p className="fw-split-empty">{others.length ? 'Choose a chat to read it side by side.' : 'No other chats yet.'}</p>
        : <div className="messages home-messages" aria-label="Second chat messages">{(chat.msgs || []).map((message, index) => (
          <article className={`message message-${message.role}`} key={`${index}-${message.role}`}>
            <strong>{message.role === 'user' ? 'You' : 'Free way'}</strong>
            {message.role === 'assistant' && message.stopped && <span className="fw-meta is-stopped">Stopped</span>}
            {message.role === 'assistant' && !message.stopped && (() => { const label = routeLabel(message.route, models); return label && <span className={`fw-meta${label.fallback ? ' is-fallback' : ''}`}>{label.text}</span>; })()}
            {!(message.stopped && message.content === 'Stopped.') && <p>{message.content}</p>}
          </article>))}</div>}
    </section>
  );
}
