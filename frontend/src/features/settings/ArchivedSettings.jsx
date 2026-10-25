import { useState } from 'react';
import { ArchivedChats } from '../chat-history/ArchivedChats.jsx';

export default function ArchivedSettings({ chats, onOpen, onRestore, onDelete, busyChatId = null }) {
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const query = search.trim().toLocaleLowerCase();
  const filteredChats = chats.filter((chat) => !query || chat.title.toLocaleLowerCase().includes(query));

  function confirmDelete() {
    if (!deleteTarget) return;
    onDelete(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <section className="settings-section" aria-labelledby="archived-settings-title">
      <div className="settings-section-heading">
        <h2 id="archived-settings-title">Archived</h2>
        <p>Search conversations saved on this device. Restoring keeps the transcript; permanent deletion requires confirmation.</p>
      </div>
      <label className="settings-search-field" htmlFor="archived-chats-search">
        <span>Search archived chats</span>
        <input id="archived-chats-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <ArchivedChats chats={filteredChats} busyChatId={busyChatId} onOpen={onOpen} onRestore={onRestore} onDelete={setDeleteTarget} />
      {deleteTarget && <div className="modal-backdrop">
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="archived-delete-title">
          <h2 id="archived-delete-title">Delete chat permanently?</h2>
          <p>This removes <strong>{deleteTarget.title}</strong> and its transcript from this device. This cannot be undone.</p>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="button button-warning" type="button" onClick={confirmDelete}>Delete permanently</button>
          </div>
        </section>
      </div>}
    </section>
  );
}
