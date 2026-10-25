export const CHAT_STORAGE_KEY = 'fc.chats.v2';
export const LEGACY_CHAT_STORAGE_KEY = 'fc.chats';

const SCHEMA_VERSION = 2;
const MAX_CHATS = 200;
const SAVE_ERROR = 'Chat history could not be saved.';

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  if (!['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return null;
  const normalized = { ...message };
  delete normalized.pending;
  return normalized;
}

function normalizeChat(chat) {
  if (!chat || typeof chat !== 'object' || typeof chat.id !== 'string' || !chat.id.trim()) return null;
  const msgs = Array.isArray(chat.msgs) ? chat.msgs.map(normalizeMessage).filter(Boolean) : [];
  if (msgs.length === 0) return null;
  const firstUserMessage = msgs.find((message) => message.role === 'user')?.content || '';
  return {
    id: chat.id,
    mode: typeof chat.mode === 'string' && chat.mode ? chat.mode : 'chat',
    title: typeof chat.title === 'string' ? chat.title : firstUserMessage.slice(0, 80),
    at: Number.isFinite(chat.at) && chat.at >= 0 ? chat.at : 0,
    msgs,
    pinned: chat.pinned === true,
    archived: chat.archived === true,
    project: typeof chat.project === 'string' ? chat.project : '',
  };
}

function normalizeChats(chats) {
  if (!Array.isArray(chats)) return [];
  const seen = new Set();
  const result = [];
  for (const candidate of chats) {
    const chat = normalizeChat(candidate);
    if (!chat || seen.has(chat.id)) continue;
    seen.add(chat.id);
    result.push(chat);
    if (result.length >= MAX_CHATS) break;
  }
  return result;
}

function readItem(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return { ok: false, value: null };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

function readVersioned(storage) {
  const raw = readItem(storage, CHAT_STORAGE_KEY);
  if (!raw.ok || raw.value === null) return { ...raw, present: false, valid: false, chats: [] };
  try {
    const parsed = JSON.parse(raw.value);
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.chats)) {
      return { ok: true, present: true, valid: false, chats: [] };
    }
    return { ok: true, present: true, valid: true, chats: normalizeChats(parsed.chats) };
  } catch {
    return { ok: true, present: true, valid: false, chats: [] };
  }
}

function readLegacy(storage) {
  const raw = readItem(storage, LEGACY_CHAT_STORAGE_KEY);
  if (!raw.ok || raw.value === null) return { ...raw, chats: [] };
  try {
    const parsed = JSON.parse(raw.value);
    return { ok: Array.isArray(parsed), chats: Array.isArray(parsed) ? normalizeChats(parsed) : [] };
  } catch {
    return { ok: false, chats: [] };
  }
}

function cloneChat(chat) {
  return { ...chat, msgs: chat.msgs.map((message) => ({ ...message })) };
}

function compareChats(left, right) {
  return Number(right.pinned) - Number(left.pinned)
    || right.at - left.at
    || left.id.localeCompare(right.id);
}

function saveToStorage(storage, chats) {
  if (!storage || typeof storage.setItem !== 'function' || !Array.isArray(chats)) {
    return { ok: false, error: SAVE_ERROR };
  }
  try {
    const versioned = { schemaVersion: SCHEMA_VERSION, chats: normalizeChats(chats) };
    storage.setItem(CHAT_STORAGE_KEY, JSON.stringify(versioned));
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_ERROR };
  }
}

function loadFromStorage(storage) {
  const versioned = readVersioned(storage);
  if (versioned.valid) return versioned.chats.map(cloneChat);

  const legacy = readLegacy(storage);
  if (legacy.chats.length > 0) {
    saveToStorage(storage, legacy.chats);
    return legacy.chats.map(cloneChat);
  }
  return [];
}

export const chatStore = Object.freeze({
  load: loadFromStorage,
  save: saveToStorage,
});

export function createChatStore(storage) {
  let chats = loadFromStorage(storage);
  let lastResult = { ok: true };

  function save(nextChats) {
    if (!Array.isArray(nextChats)) return { ok: false, error: 'Chat history is invalid.' };
    chats = normalizeChats(nextChats);
    lastResult = saveToStorage(storage, chats);
    return lastResult;
  }

  function update(id, transform) {
    if (!chats.some((chat) => chat.id === id)) return { ok: false, error: 'Chat not found.' };
    return save(chats.map((chat) => chat.id === id ? transform(chat) : chat));
  }

  return Object.freeze({
    getChats() {
      return chats.map(cloneChat);
    },
    getChat(id) {
      const chat = chats.find((item) => item.id === id);
      return chat ? cloneChat(chat) : null;
    },
    list({ archived = false } = {}) {
      return chats.filter((chat) => chat.archived === archived).sort(compareChats).map(cloneChat);
    },
    save,
    upsert(chat) {
      const normalized = normalizeChat(chat);
      if (!normalized) return { ok: false, error: 'Chat is invalid.' };
      return save([normalized, ...chats.filter((item) => item.id !== normalized.id)]);
    },
    rename(id, title) {
      if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Enter a chat title.' };
      return update(id, (chat) => ({ ...chat, title: title.trim() }));
    },
    pin(id, pinned) {
      if (typeof pinned !== 'boolean') return { ok: false, error: 'Pin state is invalid.' };
      return update(id, (chat) => ({ ...chat, pinned }));
    },
    archive(id) {
      return update(id, (chat) => ({ ...chat, archived: true }));
    },
    restore(id) {
      return update(id, (chat) => ({ ...chat, archived: false }));
    },
    remove(id) {
      if (!chats.some((chat) => chat.id === id)) return { ok: false, error: 'Chat not found.' };
      return save(chats.filter((chat) => chat.id !== id));
    },
    get lastResult() {
      return lastResult;
    },
  });
}
