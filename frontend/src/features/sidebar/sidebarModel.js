// Pure helpers for the Freebuff-style left panel. Every number shown comes from real chat records.
const DAY = 86400000;

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function times(chat) {
  const out = [];
  if (Number.isFinite(chat?.at)) out.push(chat.at);
  for (const m of Array.isArray(chat?.msgs) ? chat.msgs : []) if (Number.isFinite(m?.at)) out.push(m.at);
  return out;
}

export function activityDays(chats) {
  const days = new Set();
  for (const chat of Array.isArray(chats) ? chats : []) for (const t of times(chat)) days.add(dayKey(t));
  return days;
}

// Consecutive active days ending today (or yesterday, so the streak is not lost before today's first message).
export function streakDays(chats, now = Date.now()) {
  const days = activityDays(chats);
  let start = now;
  if (!days.has(dayKey(start))) start -= DAY;
  let n = 0;
  for (let t = start; days.has(dayKey(t)); t -= DAY) n += 1;
  return n;
}

export function chatsToday(chats, now = Date.now()) {
  const today = dayKey(now);
  return (Array.isArray(chats) ? chats : []).filter((c) => times(c).some((t) => dayKey(t) === today)).length;
}

export function groupChats(chats, projects) {
  const ids = new Set((Array.isArray(projects) ? projects : []).map((p) => p.id));
  const byProject = new Map();
  const loose = [];
  for (const chat of Array.isArray(chats) ? chats : []) {
    if (chat.project && ids.has(chat.project)) {
      if (!byProject.has(chat.project)) byProject.set(chat.project, []);
      byProject.get(chat.project).push(chat);
    } else loose.push(chat);
  }
  return { byProject, loose };
}

export function matchesSearch(chat, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || String(chat?.title || '').toLowerCase().includes(q);
}
