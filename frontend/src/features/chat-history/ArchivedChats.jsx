import { ChatRowMenu } from './ChatRowMenu.jsx';

export function ArchivedChats({ chats, onOpen, onRestore, onDelete, busyChatId = null }) {
  return (
    <section className="archived-chats" aria-label="Archived chats">
      <h2>Archived chats</h2>
      {chats.length === 0
        ? <p className="empty-state">No archived chats.</p>
        : <ol className="chat-history-list" aria-label="Archived chat history">
          {chats.map((chat) => <li className="chat-history-row" data-chat-id={chat.id} key={chat.id}>
            <div className="chat-history-row-main">
              <button className="chat-history-open" type="button" aria-label={`Open chat ${chat.title}`} onClick={() => onOpen(chat.id)}>{chat.title}</button>
              <span className="chat-archived-label">Archived</span>
            </div>
            <ChatRowMenu chat={chat} archived disabled={chat.id === busyChatId} onRestore={onRestore} onDelete={onDelete} />
          </li>)}
        </ol>}
    </section>
  );
}
