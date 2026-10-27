// Freebuff-style collapsible left panel. Numbers are real: streak and "today" come from this browser's chat records;
// Free way has no hour meter or paid wallet, so those rows say so plainly instead of inventing balances.
import { useEffect, useMemo, useState } from 'react';
import { chatsToday, groupChats, matchesSearch, streakDays } from './sidebarModel.js';

const SHOW = 5;
const paths = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  chat: 'M5 5h14v10H10l-5 4z',
  project: 'M4 6h6l2 2h8v10H4z',
  hours: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9',
  wallet: 'M4 7h15v12H4zM4 7l11-3v3M15 13h4',
  up: 'M12 19V5M6 11l6-6 6 6',
  chevron: 'M9 6l6 6-6 6',
  desktop: 'M3 5h18v11H3zM8 20h8M12 16v4',
  terminal: 'M4 6l5 5-5 5M11 18h9',
};
const Glyph = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} /></svg>;

export default function LeftPanel({ projects, chats, project, activeChatId, mode, onChooseProject, onSelectChat, onNewChat, onNewProject, onManageChats, onOpenPlans }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [more, setMore] = useState(() => new Set());
  const [installEvent, setInstallEvent] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setInstallEvent(event); };
    globalThis.addEventListener?.('beforeinstallprompt', onPrompt);
    return () => globalThis.removeEventListener?.('beforeinstallprompt', onPrompt);
  }, []);

  const streak = useMemo(() => streakDays(chats), [chats]);
  const today = useMemo(() => chatsToday(chats), [chats]);
  const { byProject, loose } = useMemo(() => groupChats(chats, projects), [chats, projects]);
  const flip = (setter, id) => setter((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function chatRow(chat) {
    return <li key={chat.id}><button type="button" className={`sidebar-chat${chat.id === activeChatId ? ' is-current' : ''}`} onClick={() => onSelectChat(chat.id)}><Glyph d={paths.chat} /><span>{chat.title || 'Untitled chat'}</span></button></li>;
  }
  function list(items, key) {
    const shown = items.filter((c) => matchesSearch(c, query));
    const all = more.has(key) || query;
    return <>
      {(all ? shown : shown.slice(0, SHOW)).map(chatRow)}
      {!all && shown.length > SHOW && <li><button type="button" className="fw-show-more" onClick={() => flip(setMore, key)}>Show more</button></li>}
    </>;
  }
  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* dismissed */ }
    setInstallEvent(null);
  }
  async function copyCli() {
    try { await globalThis.navigator?.clipboard?.writeText('python -m freecode'); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); }
  }

  return (
    <div className="fw-panel">
      <div className="fw-panel-head">
        <span className="brand fw-brand"><img src="/icon.svg" alt="" width="22" height="22" /><span>Free way</span></span>
        <button type="button" className="fw-icon-btn" aria-label="Search chats" aria-pressed={searching} onClick={() => { setSearching((v) => !v); setQuery(''); }}><Glyph d={paths.search} /></button>
      </div>
      {searching && <input className="fw-search" type="search" aria-label="Search chats" placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />}
      <p className="fw-streak" title="Days in a row with chat activity in this browser">{streak > 0 ? `${streak} day streak` : 'No streak yet'}<span>· {today} {today === 1 ? 'chat' : 'chats'} today</span></p>

      <div className="sidebar-actions fw-rows">
        <button type="button" className="sidebar-action fw-row" aria-label="Start a new chat" onClick={onNewChat}><Glyph d={paths.chat} /><span className="sidebar-label">New chat</span></button>
        <button type="button" className="sidebar-action fw-row" aria-label="Start a new project" onClick={onNewProject}><Glyph d={paths.project} /><span className="sidebar-label">New project</span></button>
        <div className="fw-row fw-stat" title="Free way does not meter hours. Free model providers apply their own rate limits."><Glyph d={paths.hours} /><span>Daily hours</span><b className="fw-badge">Provider limits</b></div>
        <div className="fw-row fw-stat" title="Nothing is charged, so there is no wallet balance. Free way is free and ad-supported."><Glyph d={paths.wallet} /><span>Wallet</span><b className="fw-badge">Free</b></div>
        <button type="button" className="fw-row" onClick={onOpenPlans}><Glyph d={paths.up} /><span>Free models &amp; limits</span></button>
      </div>

      <section className="sidebar-projects" aria-label="Projects">
        <p className="nav-caption">Projects</p>
        {projects.length === 0 && <p className="sidebar-empty">No projects yet</p>}
        {projects.map((item) => {
          const current = item.id === project;
          const expanded = current || open.has(item.id) || Boolean(query);
          const items = byProject.get(item.id) || [];
          return <div className={`sidebar-project${current ? ' is-current' : ''}`} key={item.id}>
            <div className="fw-folder">
              <button type="button" className="fw-chevron" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.name || item.id}`} aria-expanded={expanded} onClick={() => flip(setOpen, item.id)} disabled={current}><Glyph d={paths.chevron} /></button>
              <button type="button" className="sidebar-project-name" aria-current={current ? 'true' : undefined} onClick={() => onChooseProject(item.id)}><Glyph d={paths.project} /><span>{item.name || item.id}</span><span className="sidebar-count">{items.length}</span></button>
            </div>
            {expanded && <ul className="sidebar-chats" aria-label={`Chats in ${item.name || item.id}`}>
              {items.length === 0 ? <li className="sidebar-empty">No chats yet</li> : list(items, item.id)}
            </ul>}
          </div>;
        })}
        <p className="nav-caption">Chats</p>
        <ul className="sidebar-chats fw-loose" aria-label="Chats without a project">
          {loose.length === 0 ? <li className="sidebar-empty">No other chats</li> : list(loose, '__loose')}
        </ul>
        <button type="button" className="text-button sidebar-manage" onClick={onManageChats}>Manage chats</button>
      </section>

      <div className="fw-apps">
        <p className="nav-caption">Apps &amp; downloads</p>
        <button type="button" className="fw-row" onClick={install} disabled={!installEvent} title={installEvent ? 'Install Free way as an app' : 'Already installed, or use your browser menu > Install app'}><Glyph d={paths.desktop} /><span>Desktop app</span></button>
        <button type="button" className="fw-row" onClick={copyCli} title="Copy the command that runs Free way locally"><Glyph d={paths.terminal} /><span>{copied ? 'Copied: python -m freecode' : 'Command line'}</span></button>
        <p className="fw-mode">{mode === 'cloud' ? 'Cloud workspace' : 'Local workspace'}</p>
      </div>
    </div>
  );
}
