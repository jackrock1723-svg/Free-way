import { useEffect, useMemo, useRef, useState } from 'react';
import { api, userMessage } from './api.js';
import ErrorBoundary, { CrashProbe } from './ErrorBoundary.jsx';
import { mergeRequestPayload } from './merge.js';
import { normalizePreviewPath, previewBaseFor, previewPathFromLocation } from './preview.js';
import { mergeProjectList } from './projects.js';
import { createChatStore } from './features/chat-history/chatStore.js';
import { isChitChatError } from './homeRouting.js';
import { ChatRowMenu } from './features/chat-history/ChatRowMenu.jsx';
import { ArchivedChats } from './features/chat-history/ArchivedChats.jsx';
import { settingsApi } from './features/settings/settingsApi.js';
import { SettingsNav } from './features/settings/SettingsNav.jsx';
import GeneralSettings from './features/settings/GeneralSettings.jsx';
import AppearanceSettings from './features/settings/AppearanceSettings.jsx';
import TokenSignIn, { NEEDS_TOKEN } from './features/auth/TokenSignIn.jsx';
import KeyboardSettings, { DEFAULT_SHORTCUTS, shortcutFromEvent } from './features/settings/KeyboardSettings.jsx';
import ProjectSettings from './features/settings/ProjectSettings.jsx';
import AccountSettings from './features/settings/AccountSettings.jsx';
import UsageSettings from './features/settings/UsageSettings.jsx';
import BillingSettings from './features/settings/BillingSettings.jsx';
import EarnSettings from './features/settings/EarnSettings.jsx';
import IntegrationsSettings from './features/settings/IntegrationsSettings.jsx';
import ProvidersSettings from './features/settings/ProvidersSettings.jsx';
import SkillsSettings from './features/settings/SkillsSettings.jsx';
import ArchivedSettings from './features/settings/ArchivedSettings.jsx';
import BrowserSettings from './features/settings/BrowserSettings.jsx';
import McpSettings from './features/settings/McpSettings.jsx';
import UpdatesSettings from './features/settings/UpdatesSettings.jsx';
import AdsPrivacySettings from './features/settings/AdsPrivacySettings.jsx';
import AdSlot from './features/ads/AdSlot.jsx';
import Composer from './features/composer/Composer.jsx';
import { pickFreeModels } from './features/composer/composerModel.js';

const sections = ['Home', 'Board', 'Apps', 'Preview', 'Me', 'Settings'];  // chats live in the sidebar and on Home
const iconPaths = {
  Home: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9 21v-6h6v6',
  Board: 'M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z',
  Chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-5.5 4v-4.2A2.5 2.5 0 0 1 4 13.5z',
  Apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  Preview: 'M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  Me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  Settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM19.4 13.5a7.8 7.8 0 0 0 0-3l1.5-1.2-1.5-2.6-1.8.7a7.5 7.5 0 0 0-2.6-1.5L14.7 4h-3.1l-.3 1.9a7.5 7.5 0 0 0-2.6 1.5l-1.8-.7-1.5 2.6 1.5 1.2a7.8 7.8 0 0 0 0 3l-1.5 1.2 1.5 2.6 1.8-.7a7.5 7.5 0 0 0 2.6 1.5l.3 1.9h3.1l.3-1.9a7.5 7.5 0 0 0 2.6-1.5l1.8.7 1.5-2.6-1.5-1.2Z',
};

function SectionIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={iconPaths[name]} /></svg>;
}

function errorText(error) {
  if (error?.message === 'network') return 'The local service could not complete that request.';
  if (error && !(error.name === 'ApiError') && typeof error.message === 'string' && error.message) return error.message;
  return userMessage(error);
}

function DetectedRuntimes({ projectId }) {
  const [result, setResult] = useState({ loading: true, runtimes: [], error: '' });

  useEffect(() => {
    let current = true;
    setResult({ loading: true, runtimes: [], error: '' });
    settingsApi.readProjectRuntimes(projectId || 'demo').then((document) => {
      if (!current) return;
      const runtimes = Array.isArray(document?.runtimes)
        ? document.runtimes.filter((runtime) => runtime && typeof runtime.language === 'string')
        : [];
      setResult({ loading: false, runtimes, error: '' });
    }).catch(() => {
      if (current) setResult({ loading: false, runtimes: [], error: 'Runtime availability could not be checked. No tools were installed.' });
    });
    return () => { current = false; };
  }, [projectId]);

  return (
    <section className="detected-runtimes" aria-label="Detected runtimes" aria-live="polite">
      <h3>Detected runtimes</h3>
      {result.loading
        ? <p className="subtle" role="status">Checking installed toolchains…</p>
        : result.error
          ? <p className="error-text" role="alert">{result.error}</p>
          : result.runtimes.length > 0
            ? <ul className="detected-runtime-list">{result.runtimes.map((runtime) => <li key={`${runtime.language}-${runtime.marker}`}><span><strong>{runtime.language}</strong><span className="subtle"> · {runtime.marker}</span></span><span className={runtime.available ? 'runtime-presence is-installed' : 'runtime-presence'}>{runtime.available ? `Installed (${runtime.toolchain})` : 'Not installed'}</span></li>)}</ul>
            : <p className="subtle">No supported runtime markers were found.</p>}
      <p className="subtle">No compiler or package manager is downloaded automatically. This status only checks local project markers and installed tools.</p>
    </section>
  );
}

function projectId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function statusName(state) {
  return ({ orchestrating: 'Specialists working', planned: 'Plan ready (no files changed)', needs_plan_approval: 'Plan approval required', needs_milestone_approval: 'Milestone awaiting approval', working: 'Working', fixing: 'Checking changes', review: 'Ready for review', merged: 'Merged', rejected: 'Rejected', cancelled: 'Cancelled', error: 'Error' })[state] || state || 'Loading';
}

const SPECIALIST_LABELS = {
  discover: 'Discover', plan: 'Plan', implement: 'Implement', verify: 'Verify',
  file_picker: 'File Picker', code_searcher: 'Code Searcher', researcher: 'Researcher', thinker: 'Thinker', planner: 'Planner',
  editor: 'Editor', editor_minimal: 'Editor: minimal', editor_robust: 'Editor: robust', editor_tests: 'Editor: test-first',
  selector: 'Selector', reviewer: 'Reviewer', basher: 'Basher',
};
const SPECIALIST_DESCRIPTIONS = {
  discover: 'Read-only review of bounded project context.',
  plan: 'Read-only planning; no files or commands are executed.',
  implement: 'May propose actions only; it cannot apply them.',
  verify: 'Read-only verification before the parent plan is shown.',
  file_picker: 'Maps the code locally and picks the most relevant files.',
  code_searcher: 'Searches project files for the task keywords; secrets are skipped.',
  researcher: 'Reads local docs such as README and AGENTS.md; no web access.',
  thinker: 'Works through the approach and risks; never writes files.',
  planner: 'Plan mode: writes an ordered plan only; no files or commands.',
  editor: 'Proposes code changes; nothing is applied until you approve.',
  editor_minimal: 'Max mode editor that changes as little as possible.',
  editor_robust: 'Max mode editor that handles edge cases and errors.',
  editor_tests: 'Max mode editor that includes a focused test.',
  selector: 'Compares the editor proposals and keeps the best one.',
  reviewer: 'Checks the proposal for bugs and unsafe paths before you see it.',
  basher: 'Proposes test commands for your approval; it never runs them itself.',
};
const SPECIALIST_STATUS = { pending: 'Waiting', running: 'Working', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };

function browserStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

function getInitialChatId(store) {
  let preferredId = '';
  try { preferredId = browserStorage()?.getItem('fc.chat.active') || ''; } catch {}
  const preferred = store.getChats().find((chat) => chat.id === preferredId && !chat.archived);
  return preferred?.id || store.list()[0]?.id || null;
}

function saveActiveChatId(id) {
  try { browserStorage()?.setItem('fc.chat.active', id || ''); } catch {}
}

function createChatId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const CHAT_STORAGE_WARNING = 'Chat history is available only in this session because browser storage is unavailable.';

export default function App() {
  const [view, setView] = useState('Home');
  const [config, setConfig] = useState(null);
  const [projects, setProjects] = useState([]);
  // No sample default: the user's own project (remembered) or none until they create one. The demo project still exists on the server.
  const [project, setProject] = useState(() => { try { return localStorage.getItem('fc.project') || ''; } catch { return ''; } });
  const realProjects = [...(project && !projects.some((item) => item.id === project) ? [{ id: project, name: project }] : []), ...projects.filter((item) => item.id !== 'demo' || item.id === project)];
  const [agents, setAgents] = useState([]);
  const [agent, setAgent] = useState(null);
  const [connectors, setConnectors] = useState([]);
  const [connectorsLoaded, setConnectorsLoaded] = useState(false);
  const [connectorsLoadError, setConnectorsLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [buildPrompt, setBuildPrompt] = useState('');
  const [composerMode, setComposerMode] = useState('build');
  const [composerModel, setComposerModel] = useState('auto');
  const [freeModels, setFreeModels] = useState([{ id: 'auto', name: 'Free way Auto' }]);
  const [skillsList, setSkillsList] = useState({ skills: [], reason: '' });
  const [composerSkill, setComposerSkill] = useState('');
  const [queue, setQueue] = useState([]);
  const chatAbortRef = useRef(null);
  const [building, setBuilding] = useState(false);
  const [projectDialog, setProjectDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [chatStore] = useState(() => createChatStore(browserStorage()));
  const [homeReply, setHomeReply] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return globalThis.localStorage?.getItem('fw.sidebar') === 'collapsed'; } catch { return false; } });
  function toggleSidebar() { setSidebarCollapsed((v) => { try { globalThis.localStorage?.setItem('fw.sidebar', v ? 'open' : 'collapsed'); } catch { /* storage optional */ } return !v; }); }
  const [chats, setChats] = useState(() => chatStore.getChats());
  const [activeChatId, setActiveChatId] = useState(() => getInitialChatId(chatStore));
  const activeChatIdRef = useRef(activeChatId);
  const [messages, setMessages] = useState(() => chatStore.getChat(getInitialChatId(chatStore))?.msgs || []);
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [diff, setDiff] = useState(null);
  const [review, setReview] = useState(null);
  const [previewPage, setPreviewPage] = useState('index.html');
  const [previewHistory, setPreviewHistory] = useState(['index.html']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [previewRefresh, setPreviewRefresh] = useState(0);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [settingsPreferences, setSettingsPreferences] = useState({});
  const settingsPreferencesRef = useRef({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const settingsSavingRef = useRef(false);
  const [settingsSection, setSettingsSection] = useState('General');
  const [settingsProjectId, setSettingsProjectId] = useState(project);
  const previewLocationRef = useRef({ history: ['index.html'], index: 0, page: 'index.html' });
  const previewFrameRef = useRef(null);

  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    let cancelled = false;
    Promise.allSettled([
      api.request('/api/config'), api.request('/api/projects'), api.request('/api/agents'), api.request('/api/connectors'),
    ]).then((results) => {
      if (cancelled) return;
      if (results[0].status === 'fulfilled') setConfig(results[0].value);
      if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
        setProjects((current) => mergeProjectList(results[1].value, current));
      }
      if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) setAgents(results[2].value);
      if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
        setConnectors(results[3].value);
        setConnectorsLoadError('');
      } else {
        setConnectorsLoadError(results[3].status === 'rejected' ? errorText(results[3].reason) : 'The connector catalog response was invalid.');
      }
      setConnectorsLoaded(true);
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) setError(errorText(failed.reason));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    settingsApi.read().then((document) => {
      if (cancelled) return;
      const preferences = document?.preferences && typeof document.preferences === 'object' ? document.preferences : {};
      settingsPreferencesRef.current = preferences;
      setSettingsPreferences(preferences);
      setSettingsLoadError('');
    }).catch((requestError) => {
      if (cancelled) return;
      setSettingsLoadError(errorText(requestError));
    }).finally(() => {
      if (!cancelled) setSettingsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const selectedProject = useMemo(() => projects.find((item) => item.id === project) || { id: project, name: project }, [projects, project]);
  const settingsProject = useMemo(() => projects.find((item) => item.id === settingsProjectId) || { id: settingsProjectId, name: settingsProjectId }, [projects, settingsProjectId]);
  const activeAgent = agent || agents[0] || null;
  const activeChat = useMemo(() => chats.find((item) => item.id === activeChatId) || null, [chats, activeChatId]);
  const activeChats = useMemo(() => chatStore.list(), [chatStore, chats]);
  const archivedChats = useMemo(() => chatStore.list({ archived: true }), [chatStore, chats]);
  const previewBase = previewBaseFor(activeAgent, typeof window === 'undefined' ? '' : window.location.origin);

  useEffect(() => {
    const handlePreviewLocation = (event) => {
      if (event.source !== previewFrameRef.current?.contentWindow) return;
      const path = previewPathFromLocation(event.data?.fcloc, previewBase);
      if (!path || path === previewLocationRef.current.page) return;
      const current = previewLocationRef.current;
      const history = [...current.history.slice(0, current.index + 1), path];
      const index = history.length - 1;
      previewLocationRef.current = { history, index, page: path };
      setPreviewHistory(history);
      setHistoryIndex(index);
      setPreviewPage(path);
    };
    window.addEventListener('message', handlePreviewLocation);
    return () => window.removeEventListener('message', handlePreviewLocation);
  }, [previewBase]);

  function chooseProject(value) {
    setProject(value);
    try { localStorage.setItem('fc.project', value); } catch { setNotice('Project selected for this session.'); }
    setNotice(`Project selected: ${value}`);
  }

  async function saveGlobalSettings(patch) {
    if (settingsSavingRef.current) throw new Error('Wait for the current settings save to finish.');
    const previous = settingsPreferencesRef.current;
    const optimistic = { ...previous, ...patch };
    settingsSavingRef.current = true;
    setSettingsSaving(true);
    settingsPreferencesRef.current = optimistic;
    setSettingsPreferences(optimistic);
    setSettingsLoadError('');
    try {
      const document = await settingsApi.update(patch);
      const saved = document?.preferences && typeof document.preferences === 'object' ? document.preferences : optimistic;
      settingsPreferencesRef.current = saved;
      setSettingsPreferences(saved);
      return saved;
    } catch (requestError) {
      settingsPreferencesRef.current = previous;
      setSettingsPreferences(previous);
      throw requestError;
    } finally {
      settingsSavingRef.current = false;
      setSettingsSaving(false);
    }
  }

  async function createProject(event) {
    event.preventDefault();
    const name = projectName.trim();
    const id = projectId(name);
    if (!id) { setError('Enter a project name.'); return; }
    setError('');
    try {
      await api.request('/api/projects', { method: 'POST', body: { id, name } });
      setProjects((current) => [...current.filter((item) => item.id !== id), { id, name }]);
      chooseProject(id);
      setProjectName('');
      setProjectDialog(false);
      setNotice(`Project created: ${id}`);
    } catch (requestError) {
      setError(errorText(requestError));
    }
  }

  const composerBusy = chatBusy || building || activeAgent?.state === 'orchestrating';

  function buildTask(event) {
    event.preventDefault();
    const prompt = buildPrompt.trim();
    if (!prompt) { setError('Describe what you want built.'); return; }
    const item = { prompt, mode: composerMode, model: composerModel, skill: composerSkill };
    setBuildPrompt('');
    if (composerBusy || queue.length) { setQueue((current) => [...current, item]); return; }  // runs in order once the agent is free
    runComposer(item);
  }

  async function runComposer({ prompt, mode, model, skill }) {
    if (mode === 'skills') {   // existing skills endpoint: the skill text rides along as file context on the normal chat backend
      try {
        const detail = await api.request(`/api/settings/skills/${encodeURIComponent(skill)}`);
        const info = detail?.skill;
        if (!info?.instructions) throw new Error('That skill could not be loaded.');
        await sendChat(null, prompt, { model, files: [{ name: `skill ${info.name}`, kind: 'skill', size: info.instructions.length, text: info.instructions }] });
      } catch (requestError) { setError(errorText(requestError)); }
      return;
    }
    if (!project) {
      if (mode === 'build') { await sendChat(null, prompt, { model }); return; }  // never build without a project
      setError('Choose or create a project first.'); return;
    }
    setBuilding(true); setError(''); setNotice('');
    try {
      const created = mode === 'mission'
        ? await api.request('/api/agents', { method: 'POST', body: { project, prompt, mission: true, model, sync: true } })
        : await api.createOrchestration({ project, prompt, model, mode: mode === 'plan' ? 'plan' : (settingsPreferencesRef.current.agent_mode || 'base2'), request_id: `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}` });
      setAgent(created);
      setAgents((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setView('Board'); setDiff(null); setReview(null);
    } catch (requestError) {
      if (isChitChatError(requestError)) { setBuilding(false); await sendChat(null, prompt, { model }); }
      else setError(errorText(requestError));
    }
    finally { setBuilding(false); }
  }

  function stopComposer() {
    if (chatBusy) chatAbortRef.current?.abort();
    else if (activeAgent?.state === 'orchestrating') cancelOrchestration();
  }

  useEffect(() => {
    if (composerBusy || !queue.length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    runComposer(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerBusy, queue]);

  useEffect(() => {
    let live = true;
    api.request('/api/models').then((list) => { const free = pickFreeModels(list); if (live && free.length) setFreeModels(free); }).catch(() => {});
    api.request('/api/settings/skills').then((result) => {
      if (!live) return;
      const skills = Array.isArray(result?.skills) ? result.skills : [];
      setSkillsList({ skills, reason: result?.reason || (skills.length ? '' : 'No local skills found') });
      if (skills[0]) setComposerSkill((current) => current || skills[0].id);
    }).catch(() => { if (live) setSkillsList({ skills: [], reason: 'Skills could not be loaded' }); });
    return () => { live = false; };
  }, []);

  // Greeting/question typed on Home: answer inline with the normal chat backend and keep it in chat history.
  async function replyOnHome(text) {
    const chatId = createChatId();
    const outgoing = [{ role: 'user', content: text }];
    setHomeReply({ chatId, question: text, answer: '', pending: true });
    persistChatMessages(chatId, [...outgoing, { role: 'assistant', content: '', pending: true }]);
    let answer = '';
    const finish = (content) => {
      setHomeReply({ chatId, question: text, answer: content, pending: false });
      persistChatMessages(chatId, [...outgoing, { role: 'assistant', content }]);
    };
    try {
      await api.streamChat({ mode: 'chat', model: 'auto', messages: outgoing }, {
        onDelta: (delta) => { answer += delta; setHomeReply({ chatId, question: text, answer, pending: true }); },
        onComplete: (result) => finish(answer || result?.reply || 'The reply was empty.'),
        onError: (streamError) => { setError(errorText(streamError)); },
      });
    } catch (streamError) {
      setError(errorText(streamError));
      finish(answer || 'The reply stopped before completion.');
    }
  }

  async function refreshAgent(id = activeAgent?.id) {
    if (!id) return null;
    const updated = await api.request(`/api/agents/${id}`);
    setAgent(updated);
    setAgents((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
    return updated;
  }

  useEffect(() => {
    const id = activeAgent?.id;
    if (!id || activeAgent?.state !== 'orchestrating') return undefined;
    let stopped = false;
    let busy = false;
    const poll = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const updated = await api.request(`/api/agents/${id}`);
        if (!stopped) {
          setAgent(updated);
          setAgents((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
        }
      } catch {
        // Keep the last safe progress snapshot visible; the next poll may recover.
      } finally {
        busy = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, 500);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [activeAgent?.id, activeAgent?.state]);

  async function cancelOrchestration() {
    if (!activeAgent?.id) return;
    try {
      const updated = await api.cancelOrchestration(activeAgent.id);
      setAgent(updated);
      setAgents((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
    } catch (requestError) { setError(errorText(requestError)); }
  }

  async function approvePlan() {
    if (!activeAgent) return;
    try { await api.request(`/api/agents/${activeAgent.id}/approve_plan`, { method: 'POST', body: { policy: 'ask' } }); await refreshAgent(); }
    catch (requestError) { setError(errorText(requestError)); }
  }

  async function decideAction(index, decision) {
    if (!activeAgent) return;
    try { await api.request(`/api/agents/${activeAgent.id}/actions/${index}/${decision}`, { method: 'POST', body: {} }); await refreshAgent(); }
    catch (requestError) { setError(errorText(requestError)); }
  }

  async function approveMilestone() {
    const pending = activeAgent?.mission?.pending_approval_index;
    if (!Number.isInteger(pending)) return;
    try { await api.request(`/api/agents/${activeAgent.id}/approve_milestone`, { method: 'POST', body: { completed_milestone_index: pending } }); await refreshAgent(); }
    catch (requestError) { setError(errorText(requestError)); }
  }

  async function loadDiff() {
    if (!activeAgent) return;
    try { setDiff(await api.request(`/api/agents/${activeAgent.id}/diff`)); setReview(null); }
    catch (requestError) { setError(errorText(requestError)); }
  }

  async function runReview() {
    if (!activeAgent) return;
    setError('');
    try {
      const result = await api.request(`/api/agents/${activeAgent.id}/review`, { method: 'POST', body: { browser: false } });
      setAgent(result); setReview(result.review || null);
    } catch (requestError) { setError(errorText(requestError)); }
  }

  async function mergeAgent() {
    if (!activeAgent) return;
    try { const result = await api.request(`/api/agents/${activeAgent.id}/merge`, { method: 'POST', body: mergeRequestPayload(activeAgent) }); setAgent(result); setMergeConfirm(false); setNotice('Changes merged.'); }
    catch (requestError) { setError(errorText(requestError)); }
  }

  function saveChatRecord(chat) {
    const result = chatStore.upsert(chat);
    setChats(chatStore.getChats());
    if (!result.ok) setNotice(CHAT_STORAGE_WARNING);
    return result;
  }

  function persistChatMessages(id, nextMessages) {
    const existing = chatStore.getChat(id);
    const firstUserMessage = nextMessages.find((message) => message.role === 'user');
    return saveChatRecord({
      ...(existing || {}),
      id,
      mode: existing?.mode || 'chat',
      title: existing?.title || (firstUserMessage?.content || 'New chat').slice(0, 80),
      at: Date.now(),
      msgs: nextMessages,
      pinned: existing?.pinned === true,
      archived: existing?.archived === true,
      project: existing?.project || project,
    });
  }

  function selectChat(id) {
    const selected = chatStore.getChat(id);
    if (!selected) return;
    activeChatIdRef.current = id;
    setActiveChatId(id);
    setMessages(selected.msgs.map((message) => ({ ...message, pending: false })));
    setChatText('');
    setShowArchived(false);
    saveActiveChatId(id);
  }

  function startNewChat() {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setMessages([]);
    setChatText('');
    setError('');
    setShowArchived(false);
    saveActiveChatId('');
  }

  function reportChatAction(result, successMessage) {
    setChats(chatStore.getChats());
    setNotice(result.ok ? successMessage : CHAT_STORAGE_WARNING);
  }

  function pinChat(id, pinned) {
    reportChatAction(chatStore.pin(id, pinned), pinned ? 'Chat pinned.' : 'Chat unpinned.');
  }

  function archiveChat(id) {
    const result = chatStore.archive(id);
    setChats(chatStore.getChats());
    if (activeChatIdRef.current === id) {
      activeChatIdRef.current = null;
      setActiveChatId(null);
      setMessages([]);
      saveActiveChatId('');
    }
    setShowArchived(false);
    setNotice(result.ok ? 'Chat archived.' : CHAT_STORAGE_WARNING);
  }

  function restoreChat(id) {
    const result = chatStore.restore(id);
    setChats(chatStore.getChats());
    setNotice(result.ok ? 'Chat restored.' : CHAT_STORAGE_WARNING);
    selectChat(id);
  }

  function openRenameChat(chat) {
    setRenameTarget(chat);
    setRenameValue(chat.title);
    setError('');
  }

  function saveRenameChat(event) {
    event.preventDefault();
    if (!renameTarget || !renameValue.trim()) {
      setError('Enter a chat title.');
      return;
    }
    const result = chatStore.rename(renameTarget.id, renameValue);
    setChats(chatStore.getChats());
    setRenameTarget(null);
    setRenameValue('');
    setNotice(result.ok ? 'Chat renamed.' : CHAT_STORAGE_WARNING);
  }

  function requestDeleteChat(chat) {
    setDeleteTarget(chat);
  }

  function confirmDeleteChat() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const result = chatStore.remove(id);
    setChats(chatStore.getChats());
    if (activeChatIdRef.current === id) {
      activeChatIdRef.current = null;
      setActiveChatId(null);
      setMessages([]);
      saveActiveChatId('');
    }
    setDeleteTarget(null);
    setNotice(result.ok ? 'Chat deleted.' : CHAT_STORAGE_WARNING);
  }

  function deleteArchivedChat(chat) {
    const stored = chatStore.getChat(chat?.id);
    if (!stored?.archived) return;
    const result = chatStore.remove(stored.id);
    setChats(chatStore.getChats());
    if (activeChatIdRef.current === stored.id) {
      activeChatIdRef.current = null;
      setActiveChatId(null);
      setMessages([]);
      saveActiveChatId('');
    }
    setNotice(result.ok ? 'Chat deleted.' : CHAT_STORAGE_WARNING);
  }

  async function sendChat(event, override, options = {}) {
    event?.preventDefault();
    const text = (typeof override === 'string' ? override : chatText).trim();
    if (!text || chatBusy || activeChat?.archived) return;
    const chatId = activeChatId || createChatId();
    const currentMessages = messages.filter((message) => !message.pending);
    const userMessage = { role: 'user', content: text };
    const outgoingMessages = [...currentMessages, userMessage];
    const initialMessages = [...outgoingMessages, { role: 'assistant', content: '', pending: true }];
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
    saveActiveChatId(chatId);
    setMessages(initialMessages);
    setChatText(''); setChatBusy(true); setError(''); setNotice('');
    persistChatMessages(chatId, initialMessages);
    const buffer = { value: '' };
    const body = { mode: 'chat', model: options.model || 'auto', messages: outgoingMessages.map(({ role, content }) => ({ role, content })) };
    if (options.files?.length) body.files = options.files;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    try {
      await api.streamChat(body, {
        signal: controller.signal,
        onDelta: (delta) => {
          buffer.value += delta;
          const nextMessages = [...outgoingMessages, { role: 'assistant', content: buffer.value, pending: true }];
          if (activeChatIdRef.current === chatId) setMessages(nextMessages);
          persistChatMessages(chatId, nextMessages);
        },
        onComplete: (result) => {
          const completedMessages = [...outgoingMessages, { role: 'assistant', content: buffer.value || result?.reply || 'The reply was empty.' }];
          if (activeChatIdRef.current === chatId) setMessages(completedMessages);
          persistChatMessages(chatId, completedMessages);
        },
        onError: (streamError) => { setError(errorText(streamError)); },
      });
    } catch (streamError) {
      const stopped = controller.signal.aborted;
      if (!stopped) setError(errorText(streamError));
      const failedMessages = [...outgoingMessages, { role: 'assistant', content: buffer.value || (stopped ? 'Stopped.' : 'The reply stopped before completion.') }];
      if (activeChatIdRef.current === chatId) setMessages(failedMessages);
      persistChatMessages(chatId, failedMessages);
    } finally { setChatBusy(false); if (chatAbortRef.current === controller) chatAbortRef.current = null; }
  }

  function navigatePreview(path) {
    let clean;
    try { clean = normalizePreviewPath(path); }
    catch { setError('That path is outside the active preview.'); return; }
    const current = previewLocationRef.current;
    const history = [...current.history.slice(0, current.index + 1), clean];
    const index = history.length - 1;
    previewLocationRef.current = { history, index, page: clean };
    setPreviewHistory(history); setHistoryIndex(index); setPreviewPage(clean); setError('');
  }

  function goBack() {
    const current = previewLocationRef.current;
    if (current.index > 0) {
      const index = current.index - 1; const page = current.history[index];
      previewLocationRef.current = { ...current, index, page };
      setHistoryIndex(index); setPreviewPage(page);
    }
  }
  function goForward() {
    const current = previewLocationRef.current;
    if (current.index < current.history.length - 1) {
      const index = current.index + 1; const page = current.history[index];
      previewLocationRef.current = { ...current, index, page };
      setHistoryIndex(index); setPreviewPage(page);
    }
  }

  function go(section) {
    setView(section); setError('');
    if (section === 'Preview') {
      const history = ['index.html'];
      previewLocationRef.current = { history, index: 0, page: 'index.html' };
      setPreviewHistory(history); setHistoryIndex(0); setPreviewPage('index.html');
    }
  }

  const openSettingsShortcut = settingsPreferences.keyboard_shortcuts?.open_settings || DEFAULT_SHORTCUTS.open_settings;
  useEffect(() => {
    function handleSettingsShortcut(event) {
      if (event.defaultPrevented || event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (shortcutFromEvent(event) !== openSettingsShortcut) return;
      event.preventDefault();
      setError('');
      setSettingsSection('General');
      setView('Settings');
    }
    window.addEventListener('keydown', handleSettingsShortcut);
    return () => window.removeEventListener('keydown', handleSettingsShortcut);
  }, [openSettingsShortcut]);

  const previewReady = Boolean(previewBase && activeAgent?.actions?.some((action) => action.status === 'done'));
  const previewUrl = previewBase ? `${previewBase}${previewPage}` : '';
  const allConnectors = Array.isArray(connectors) ? connectors : [];

  return (
    <div className={`workspace-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} data-theme={settingsPreferences.appearance_preset || 'auto'} data-appearance-style={settingsPreferences.appearance_style || 'flat'}>
      <aside className="sidebar" aria-label="Free way workspace">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); go('Home'); }} aria-label="Free way home"><img src="/icon.svg" alt="" width="34" height="34" /><span>Free way</span></a>
        <button type="button" className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}>{sidebarCollapsed ? '»' : '«'}</button>
        <div className="sidebar-actions">
          <button type="button" className="sidebar-action" aria-label="Start a new chat" onClick={() => { startNewChat(); go('Home'); }}><span aria-hidden="true">+</span><span className="sidebar-label">New chat</span></button>
          <button type="button" className="sidebar-action" aria-label="Start a new project" onClick={() => setProjectDialog(true)}><span aria-hidden="true">▣</span><span className="sidebar-label">New project</span></button>
        </div>
        <p className="nav-caption">Workspace</p>
        <nav className="side-nav" aria-label="Primary navigation">
          {sections.map((section) => <button className={`nav-item ${view === section ? 'is-current' : ''}`} type="button" aria-current={view === section ? 'page' : undefined} onClick={() => go(section)} key={section}><SectionIcon name={section} /><span>{section}</span></button>)}
        </nav>
        <section className="sidebar-projects" aria-label="Projects">
          <p className="nav-caption">Projects</p>
          {realProjects.length === 0 && <p className="sidebar-empty">No projects yet</p>}
          {realProjects.map((item) => {
            const projectChats = activeChats.filter((chat) => (chat.project || '') === item.id);
            const current = item.id === project;
            return <div className={`sidebar-project${current ? ' is-current' : ''}`} key={item.id}>
              <button type="button" className="sidebar-project-name" aria-current={current ? 'true' : undefined} onClick={() => chooseProject(item.id)}>{item.name || item.id}<span className="sidebar-count">{projectChats.length}</span></button>
              {current && <ul className="sidebar-chats" aria-label={`Chats in ${item.name || item.id}`}>
                {projectChats.length === 0 ? <li className="sidebar-empty">No chats yet</li> : projectChats.slice(0, 30).map((chat) => <li key={chat.id}><button type="button" className={`sidebar-chat${chat.id === activeChatId ? ' is-current' : ''}`} onClick={() => { selectChat(chat.id); go('Home'); }}>{chat.title || 'Untitled chat'}</button></li>)}
              </ul>}
            </div>;
          })}
          {activeChats.some((chat) => !chat.project || !realProjects.some((item) => item.id === chat.project)) && <button type="button" className="sidebar-project-name" onClick={() => go('Chat')}>Other chats<span className="sidebar-count">{activeChats.filter((chat) => !chat.project || !realProjects.some((item) => item.id === chat.project)).length}</span></button>}
        </section>
        <button type="button" className="text-button sidebar-manage" onClick={() => go('Chat')}>Manage chats</button>
        <div className="sidebar-footer">
          <button type="button" className="profile-button" aria-label="Profile" onClick={() => go('Me')}>P</button>
          <div className="sidebar-session"><span><span className="local-dot" aria-hidden="true" /> {config?.mode === 'cloud' ? 'Cloud workspace' : 'Local workspace'}</span><small>{agents.length} sessions · {activeChats.length} chats</small></div>
        </div>
      </aside>

      <main id="main" className="main-view" tabIndex={-1}>
        <header className="topbar"><p>{view}</p><div className="server-state" role="status"><span className="server-state-dot" aria-hidden="true" />{config?.mode === 'cloud' ? 'Cloud workspace' : 'Local server'}</div></header>
        <div className="page-content">
          <ErrorBoundary compact key={view}>
          <CrashProbe />
          {error && NEEDS_TOKEN.test(error) ? <TokenSignIn /> : error && <div className="alert" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>Dismiss</button></div>}
          {notice && <p className="toast" role="status">{notice}</p>}
          {loading && <p className="loading-note" role="status">Loading workspace…</p>}

          {view === 'Home' && <section className="landing" aria-labelledby="welcome-title">
            <div className="landing-copy">
              {messages.length === 0 && <><p className="eyebrow"><span aria-hidden="true" />Free way workspace</p>
              <h1 id="welcome-title">Build with clear intent.</h1>
              <p className="lead">Describe a change. Review the plan. Approve each action before it runs.</p></>}
              {messages.length > 0 && <div className="messages home-messages" aria-live="polite" aria-label="Conversation">{messages.map((message, index) => <article className={`message message-${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === 'user' ? 'You' : 'Free way'}</strong><p>{message.content || (message.pending ? 'Thinking…' : '')}</p></article>)}</div>}
              <div className="build-form">
                <label htmlFor="active-project">Project</label>
                {realProjects.length === 0 && !project
                  ? <div className="project-row project-empty"><p>Create your first project to start building. You can still chat without one.</p><button type="button" className="button button-secondary" onClick={() => setProjectDialog(true)}>New project</button></div>
                  : <div className="project-row"><select id="active-project" aria-label="Active project" value={project} onChange={(event) => chooseProject(event.target.value)}>{!project && <option value="">Choose a project</option>}{realProjects.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select><button type="button" className="button button-secondary" onClick={() => setProjectDialog(true)}>New project</button></div>}
              </div>
              {!chatBusy && messages.length > 1 && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.pending && <AdSlot variant="strip" placement="chat" project={project} context={messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ')} runKey={`home-${activeChatId || ''}-${messages.length}`} />}
              <Composer value={buildPrompt} onChange={setBuildPrompt} onSubmit={buildTask} onStop={stopComposer} busy={composerBusy} stoppable={chatBusy || activeAgent?.state === 'orchestrating'} queued={queue.length}
                mode={composerMode} onMode={setComposerMode} models={freeModels} model={composerModel} onModel={setComposerModel}
                skills={skillsList.skills} skill={composerSkill} onSkill={setComposerSkill} skillsReason={skillsList.reason}
                location={config?.mode === 'cloud' ? { label: 'Cloud', title: 'Runs on the Free way cloud server. Switching to Local is not available here.' } : { label: 'Local', title: 'Runs on this computer\'s Free way server.' }} />
            </div>
            
          </section>}

          {view === 'Board' && <section className="workspace-page"><div className="section-heading"><div><h1>Board</h1><p>Plans, actions, and reviews stay in their current state until you decide.</p></div></div>
            {!activeAgent ? <p className="empty-state">No agent sessions yet. Start a build from Home.</p> : <div className="agent-panel"><div className="agent-title-row"><div><p className="eyebrow">{activeAgent.project || project}</p><h2>{activeAgent.title || activeAgent.prompt || 'Build session'}</h2></div><span className="state-badge" role="status">{statusName(activeAgent.state)}</span></div>
              <div className="agent-meta"><span>Model: {activeAgent.model || 'auto'}</span><span>State: {activeAgent.state}</span>{activeAgent.checks && <span>Checks: {activeAgent.checks}</span>}</div>
              <DetectedRuntimes projectId={activeAgent.project || project} />
              {activeAgent.orchestration && <section className="specialist-progress" aria-label="Specialist workflow progress"><h3>Specialist workflow</h3><p className="subtle">One bounded specialist runs at a time. No proposed action is applied until you approve the parent plan and that action.</p><ol>{activeAgent.orchestration.children.map((child) => <li className={`specialist-step specialist-${child.status}`} key={child.role}><div className="specialist-step-heading"><strong>{SPECIALIST_LABELS[child.role] || child.role}</strong><span className="subtle">{SPECIALIST_STATUS[child.status] || child.status}</span></div><p>{SPECIALIST_DESCRIPTIONS[child.role] || 'Bounded specialist step.'}</p>{child.result?.summary && <p>{child.result.summary}</p>}{child.result?.findings?.length > 0 && <ul>{child.result.findings.map((finding, index) => <li key={`${child.role}-${index}`}>{finding}</li>)}</ul>}{child.error && <p className="error-text">{child.error}</p>}</li>)}</ol>{activeAgent.state === 'orchestrating' && <button className="button button-secondary" type="button" onClick={cancelOrchestration}>Cancel specialist workflow</button>}{activeAgent.orchestration.error && <p className="error-text">{activeAgent.orchestration.error}</p>}</section>}
              {activeAgent.plan && <div className="plan-block"><h3>Plan</h3><p>{activeAgent.plan.summary}</p><ol>{(activeAgent.plan.steps || []).map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></div>}
              {activeAgent.state === 'needs_plan_approval' && <div className="approval-block"><p>Plan approval required. No action has started.</p><button className="button button-primary" type="button" onClick={approvePlan}>Approve plan</button><p className="subtle">Approval uses ask mode; each eligible action will still wait for its own decision.</p></div>}
              {activeAgent.mission?.milestones?.length > 0 && <section className="milestone-list"><h3>Mission milestones</h3><ol>{activeAgent.mission.milestones.map((item, index) => <li key={`${index}-${item}`}><span>Milestone {index + 1} of {activeAgent.mission.milestones.length}</span><span>{activeAgent.mission.completed_indices?.includes(index) ? 'Complete' : index === activeAgent.mission.pending_approval_index ? 'Awaiting approval' : index === activeAgent.mission.current_index ? 'Current' : 'Planned'}</span><p>{item}</p></li>)}</ol>{activeAgent.state === 'needs_milestone_approval' && <button className="button button-primary" type="button" onClick={approveMilestone}>Approve milestone {(activeAgent.mission.pending_approval_index ?? 0) + 1}</button>}</section>}
              {(activeAgent.actions || []).length > 0 && <section className="action-list"><h3>Actions</h3>{activeAgent.actions.map((action, index) => <article className="action-row" key={`${index}-${action.path || action.command}`}><div><strong>{action.path || action.command || action.type}</strong><span className="subtle">{action.status || 'pending'}{action.risk?.startsWith('blocked') ? ' · blocked' : ''}</span>{action.result?.error && <p className="error-text">{action.result.error}</p>}{action.result?.output && <pre>{action.result.output}</pre>}</div>{activeAgent.state === 'working' && action.status === 'pending' && !action.risk?.startsWith('blocked') && <div className="action-buttons"><button type="button" className="button button-secondary" aria-label={`Approve action ${index + 1}`} onClick={() => decideAction(index, 'approve')}>Approve</button><button type="button" className="text-button" aria-label={`Reject action ${index + 1}`} onClick={() => decideAction(index, 'reject')}>Reject</button></div>}</article>)}</section>}
              {activeAgent.state === 'review' && <div className="review-actions"><button type="button" className="button button-secondary" onClick={loadDiff}>View diff</button><button type="button" className="button button-secondary" onClick={runReview}>Run code review</button>{activeAgent.checks !== 'failed' && <button type="button" className="button button-primary" onClick={() => setMergeConfirm(true)}>Merge to main</button>}{activeAgent.checks === 'failed' && <button type="button" className="button button-warning" onClick={() => setMergeConfirm(true)}>Merge anyway</button>}</div>}
              {diff && <section className="diff-panel"><h3>Diff</h3>{(diff.files || []).length ? (diff.files || []).map((file) => <div className="diff-file" key={file.path}><strong>{file.path}</strong><span>+{file.added || 0} / −{file.removed || 0}</span><pre>{file.patch || diff.patch || ''}</pre></div>) : <pre>{diff.patch || 'No changed files.'}</pre>}</section>}
              {(activeAgent.state === 'review' || activeAgent.state === 'merged') && <AdSlot placement="board" project={activeAgent.project || project} agentId={activeAgent.id} agentState={activeAgent.state} />}
              {review && <section className="review-panel" aria-live="polite"><h3>Review verdict</h3><p><strong>{review.verdict || 'Review complete'}</strong></p><p>{review.summary}</p>{review.findings?.length > 0 && <ul>{review.findings.map((finding, index) => <li key={index}>{finding.title || finding.summary || String(finding)}</li>)}</ul>}</section>}
            </div>}
            {agents.length > 1 && <div className="session-list"><h2>Other sessions</h2>{agents.filter((item) => item.id !== activeAgent?.id).map((item) => <button className="session-row" type="button" key={item.id} onClick={() => { setAgent(item); setDiff(null); setReview(null); }}><span>{item.title || item.prompt || item.id}</span><span>{statusName(item.state)}</span></button>)}</div>}
          </section>}

          {view === 'Chat' && <section className="workspace-page chat-page">
            <div className="section-heading"><div><h1>Chat</h1><p>Ask a question in a separate conversation; chat does not start a build.</p></div><button type="button" className="button button-secondary" onClick={startNewChat} disabled={chatBusy}>New chat</button></div>
            <div className="chat-layout">
              <aside className="chat-history-panel" aria-label="Chat history">
                <div className="chat-history-header"><h2>History</h2><button type="button" className="button button-secondary" onClick={() => setShowArchived((current) => !current)}>{showArchived ? 'Back to chats' : 'Archived'}</button></div>
                {showArchived
                  ? <ArchivedChats chats={archivedChats} busyChatId={chatBusy ? activeChatId : null} onOpen={selectChat} onRestore={restoreChat} onDelete={requestDeleteChat} />
                  : activeChats.length === 0
                    ? <p className="empty-state">No saved chats yet.</p>
                    : <ol className="chat-history-list" aria-label="Active chats">
                      {activeChats.map((chat) => <li className="chat-history-row" data-chat-id={chat.id} key={chat.id}>
                        <div className="chat-history-row-main">
                          <button className="chat-history-open" type="button" aria-label={`Open chat ${chat.title}`} aria-current={chat.id === activeChatId ? 'true' : undefined} onClick={() => selectChat(chat.id)}>{chat.title}</button>
                          {chat.pinned && <span className="chat-pinned-label">Pinned</span>}
                        </div>
                        <ChatRowMenu chat={chat} disabled={chatBusy && chat.id === activeChatId} onPin={pinChat} onRename={openRenameChat} onArchive={archiveChat} onRestore={restoreChat} onDelete={requestDeleteChat} />
                      </li>)}
                    </ol>}
              </aside>
              <div className="chat-conversation">
                <div className="messages" aria-live="polite">{messages.length === 0 ? <p className="empty-state">Start a conversation. Replies use the selected provider route; chat never approves or runs agent actions.</p> : messages.map((message, index) => <article className={`message message-${message.role}`} key={`${index}-${message.role}`}><strong>{message.role === 'user' ? 'You' : 'Free way'}</strong><p>{message.content || (message.pending ? 'Thinking…' : '')}</p></article>)}</div>
                {!chatBusy && messages.length > 1 && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.pending && <AdSlot placement="chat" project={project} context={messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ')} runKey={`${activeChatId || ''}-${messages.length}`} />}
                {activeChat?.archived && <p className="chat-readonly-note" role="status">Restore this chat before sending another message.</p>}
                <form className="chat-composer" onSubmit={sendChat}><label htmlFor="chat-message">Message</label><textarea id="chat-message" aria-label="New message" value={chatText} onChange={(event) => setChatText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } }} placeholder="Write a message" rows="3" disabled={chatBusy || activeChat?.archived === true} /><button className="button button-primary" type="submit" disabled={chatBusy || activeChat?.archived === true}>{chatBusy ? 'Replying…' : 'Send'}</button></form>
              </div>
            </div>
            {renameTarget && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="rename-chat-title"><h2 id="rename-chat-title">Rename chat</h2><form onSubmit={saveRenameChat}><label htmlFor="chat-title">Chat title</label><input id="chat-title" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} required autoFocus /><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setRenameTarget(null)}>Cancel</button><button className="button button-primary" type="submit">Save title</button></div></form></section></div>}
            {deleteTarget && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title"><h2 id="delete-chat-title">Delete chat permanently?</h2><p>This removes <strong>{deleteTarget.title}</strong> and its transcript from this device. This cannot be undone.</p><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button button-warning" type="button" onClick={confirmDeleteChat}>Delete permanently</button></div></section></div>}
          </section>}

          {view === 'Settings' && <section className="settings-page" aria-labelledby="settings-title">
            <div className="settings-page-heading"><div><p className="eyebrow">Workspace preferences</p><h1 id="settings-title">Settings</h1><p>Choose supported local preferences. Features that are not connected are clearly marked.</p></div></div>
            <div className="settings-layout">
              <SettingsNav activeSection={settingsSection} onSelectSection={setSettingsSection} projects={projects} projectId={settingsProjectId} onSelectProject={setSettingsProjectId} />
              <div className="settings-content">
                {settingsLoadError && <p className="settings-inline-error" role="alert">{settingsLoadError}</p>}
                {!settingsLoaded
                  ? <p className="settings-save-status" role="status">Loading settings…</p>
                  : settingsSection === 'General'
                    ? <GeneralSettings preferences={settingsPreferences} onSave={saveGlobalSettings} disabled={settingsSaving} />
                    : settingsSection === 'Account'
                      ? <AccountSettings />
                      : settingsSection === 'Usage'
                        ? <UsageSettings />
                        : settingsSection === 'Billing' || settingsSection === 'Developer API'
                          ? <BillingSettings section={settingsSection} />
                          : settingsSection === 'Earn'
                            ? <EarnSettings />
                            : settingsSection === 'Ads & privacy'
                              ? <AdsPrivacySettings />
                            : settingsSection === 'Integrations'
                              ? <IntegrationsSettings connectors={allConnectors} loading={!connectorsLoaded} error={connectorsLoadError} />
                              : settingsSection === 'Model Providers'
                                ? <ProvidersSettings />
                    : settingsSection === 'Appearance'
                      ? <AppearanceSettings preferences={settingsPreferences} onSave={saveGlobalSettings} disabled={settingsSaving} />
                      : settingsSection === 'Keyboard shortcuts'
                        ? <KeyboardSettings preferences={settingsPreferences} onSave={saveGlobalSettings} disabled={settingsSaving} />
                        : settingsSection === 'Skills'
                          ? <SkillsSettings />
                          : settingsSection === 'Archived'
                            ? <ArchivedSettings chats={archivedChats} busyChatId={chatBusy ? activeChatId : null} onOpen={(id) => { selectChat(id); setView('Chat'); }} onRestore={restoreChat} onDelete={deleteArchivedChat} />
                            : settingsSection === 'Browser'
                              ? <BrowserSettings />
                              : settingsSection === 'MCP'
                                ? <McpSettings />
                                : settingsSection === 'Updates'
                                  ? <UpdatesSettings version={config?.version} />
                                  : <ProjectSettings key={settingsProjectId} project={settingsProject} />}
              </div>
            </div>
          </section>}

          {view === 'Apps' && <section className="workspace-page"><div className="section-heading"><div><h1>Apps</h1><p>Connector status from this local workspace. No external account is contacted here.</p></div></div><p className="apps-notice">Connections are not configured through this mock workspace.</p><div className="connector-list">{allConnectors.map((connector) => <article className="connector-row" key={connector.id}><div><h2>{connector.name}</h2><p>{connector.blurb}</p></div><span className={`state-badge ${connector.connected ? 'is-connected' : ''}`}>{connector.connected ? 'Connected' : 'Not connected'}</span></article>)}</div></section>}

          {view === 'Preview' && <section className="workspace-page preview-page"><div className="section-heading"><div><h1>Preview</h1><p>Preview is read-only and cannot approve or run pending actions.</p></div></div>{!activeAgent ? <p className="empty-state">Start a build to create a preview.</p> : !previewBase ? <p className="alert" role="alert">Preview unavailable: this session did not provide a valid same-origin preview URL.</p> : !previewReady ? <p className="approval-block">Approve a plan and complete a file action before the preview opens.</p> : <><div className="preview-toolbar"><button className="button button-secondary" type="button" aria-label="Back" onClick={goBack} disabled={historyIndex <= 0}>Back</button><button className="button button-secondary" type="button" aria-label="Forward" onClick={goForward} disabled={historyIndex >= previewHistory.length - 1}>Forward</button><button className="button button-secondary" type="button" aria-label="Refresh preview" onClick={() => setPreviewRefresh((value) => value + 1)}>Refresh</button><form onSubmit={(event) => { event.preventDefault(); navigatePreview(event.currentTarget.elements.address.value); }}><label className="sr-only" htmlFor="preview-address">Preview address</label><input id="preview-address" aria-label="Preview address" defaultValue={previewPage} key={previewPage} name="address" /><button className="button button-secondary" type="submit">Go</button></form></div><iframe ref={previewFrameRef} title="Live preview" className="preview-frame" key={`${previewUrl}-${previewRefresh}`} src={previewUrl} sandbox="allow-scripts" referrerPolicy="no-referrer" /></>}</section>}

          {view === 'Me' && <section className="workspace-page" data-view="me"><div className="section-heading"><div><h1>Me</h1><p>This build reports workspace facts only; it does not have a profile identity.</p></div></div><dl className="runtime-facts"><div><dt>Identity</dt><dd>Local workspace</dd></div><div><dt>Runtime</dt><dd>{config?.mode || 'Loading'}</dd></div><div><dt>Version</dt><dd>{config?.version || 'Unavailable'}</dd></div><div><dt>Google Sign-In</dt><dd>Off</dd></div></dl></section>}
          </ErrorBoundary>
        </div>
      </main>

      {projectDialog && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><h2 id="project-dialog-title">New project</h2><form onSubmit={createProject}><label htmlFor="project-name">Project name</label><input id="project-name" aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} autoFocus /><p className="subtle">A local project folder and initial Git repository will be created.</p><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setProjectDialog(false)}>Cancel</button><button className="button button-primary" type="submit">Create project</button></div></form></section></div>}
      {mergeConfirm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="merge-title"><h2 id="merge-title">{activeAgent?.checks === 'failed' ? 'Override failed checks and merge?' : 'Merge changes?'}</h2><p>{activeAgent?.checks === 'failed' ? 'Checks failed. This explicit override applies reviewed changes to the project branch; it does not deploy them.' : 'This applies reviewed changes to the project branch. It does not deploy them.'}</p><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setMergeConfirm(false)}>Cancel</button><button className="button button-primary" type="button" onClick={mergeAgent}>{activeAgent?.checks === 'failed' ? 'Confirm override and merge' : 'Confirm merge'}</button></div></section></div>}
    </div>
  );
}
