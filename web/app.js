/* Free way web app: mobile-first UI, three run modes (Phone local, PC local, Cloud). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function storageGet(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } }
  function storageSet(key, value) { try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; } }
  function storageRemove(key) { try { window.localStorage.removeItem(key); return true; } catch (_) { return false; } }
  function storedJSON(key, fallback) { try { var raw = storageGet(key); return raw == null || raw === '' ? fallback : JSON.parse(raw); } catch (_) { return fallback; } }
  var I = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
    branch: '<svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11.2 7"/></svg>',
    panel: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>',
    apps: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
    dl: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    term: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/></svg>',
    route: '<svg viewBox="0 0 24 24"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    git: '<svg viewBox="0 0 24 24"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 7v10M18 11c0 4-6 3-12 6"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2.5"/></svg>',
    monitor: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
    fwd: '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    img: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/></svg>',
    pick: '<svg viewBox="0 0 24 24"><path d="M4 4l7 17 2.5-7.5L21 11z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    think: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
    pr: '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 16V9a3 3 0 0 0-3-3h-4M13 4l-2 2 2 2"/></svg>'
  };
  var PICKER = '<script>(function(){var on=false,box=null;function sel(e){if(e.id)return"#"+e.id;var p=[];while(e&&e.nodeType===1&&p.length<5){var s=e.tagName.toLowerCase();if(e.classList.length)s+="."+[].slice.call(e.classList,0,2).join(".");var par=e.parentElement;if(par){var sib=[].filter.call(par.children,function(x){return x.tagName===e.tagName});if(sib.length>1)s+=":nth-of-type("+(sib.indexOf(e)+1)+")"}p.unshift(s);if(e.id)break;e=par}return p.join(" > ")}' +
    'function mark(t){if(!box){box=document.createElement("div");box.style.cssText="position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7c8cff;background:rgba(124,140,255,.12);border-radius:3px"}if(!t){box.remove();return}var r=t.getBoundingClientRect();box.style.left=r.left+"px";box.style.top=r.top+"px";box.style.width=r.width+"px";box.style.height=r.height+"px";document.documentElement.appendChild(box)}' +
    'addEventListener("message",function(e){if(e.source!==parent||!e.data||typeof e.data.fcpick!=="boolean")return;on=e.data.fcpick;document.documentElement.style.cursor=on?"crosshair":"";if(!on)mark(null)});addEventListener("mouseover",function(e){if(on)mark(e.target)},true);' +
    'addEventListener("click",function(e){if(!on)return;e.preventDefault();e.stopPropagation();var t=e.target;on=false;mark(null);document.documentElement.style.cursor="";parent.postMessage({fcpicked:{selector:sel(t),html:t.outerHTML.slice(0,600),text:(t.innerText||"").trim().slice(0,200)}},"*")},true)})()<\/script>';
  var FONTS = [
    { id: 'Inter', css: 'Inter:wght@400;500;600', note: 'Default · most used UI font' },
    { id: 'Geist', css: 'Geist:wght@400;500;600', note: 'Crisp, for dev tools' },
    { id: 'IBM Plex Sans', css: 'IBM+Plex+Sans:wght@400;500;600', note: 'Technical, humanist' },
    { id: 'Manrope', css: 'Manrope:wght@400;500;600', note: 'Warm geometric' },
    { id: 'Plus Jakarta Sans', css: 'Plus+Jakarta+Sans:wght@400;500;600', note: 'Friendly modern' },
    { id: 'Atkinson Hyperlegible Next', css: 'Atkinson+Hyperlegible+Next:wght@400;500;600', note: 'Easier to read', legible: true },
    { id: 'system-ui', css: null, note: 'Your device font' }
  ];
  var MONO = [{ id: 'JetBrains Mono', css: 'JetBrains+Mono:wght@400;500' }, { id: 'Geist Mono', css: 'Geist+Mono:wght@400;500' }, { id: 'IBM Plex Mono', css: 'IBM+Plex+Mono:wght@400;500' }];
  var THEMES = ['midnight', 'graphite', 'paper', 'contrast'];
  var DEF = { theme: 'midnight', density: 'comfortable', uiFont: 'Inter', codeFont: 'JetBrains Mono', size: 12 };
  var savedPrefs = storedJSON('fc.prefs', {});
  var prefs = Object.assign({}, DEF, savedPrefs && typeof savedPrefs === 'object' && !Array.isArray(savedPrefs) ? savedPrefs : {});
  var S = { view: 'home', lastWorkView: 'home', agentId: null, pane: 'preview', model: storageGet('fc.model') || 'auto', cfg: null, models: [], agents: [], previewPage: 'index.html', device: 'full', busy: false,
    project: storageGet('fc.project') || 'demo', images: [], ctx: null, think: false, picking: false, integ: null,
    missionServerRequired: false, chat: { mode: 'chat', msgs: [], busy: false } };

  var AUTH = window.GoogleSignIn;
  // Query-token handling is deferred until same-origin auth mode is known.
  var qp = new URLSearchParams(location.search);
  function api(path, opt) {
    opt = opt || {}; var method = opt.method || (opt.body ? 'POST' : 'GET'), h = { 'Content-Type': 'application/json' }, t = storageGet('fc.token'); if (t) h.Authorization = 'Bearer ' + t;
    var prepared = AUTH ? AUTH.prepare(path, method, h) : Promise.resolve({ headers: h });
    return prepared.then(function (request) { return fetch(path, { method: method, headers: request.headers, credentials: request.credentials, body: opt.body ? JSON.stringify(opt.body) : undefined }); })
      .then(function (r) { if (r.status === 401 && AUTH && AUTH.enabled) AUTH.handleUnauthorized(); return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; e.final = !!d.error; throw e; } return d; }); },
            function () { var e = new Error('network'); e.status = 0; throw e; });
  }
  function chatStream(body, onDelta) {
    var headers = { 'Content-Type': 'application/json' }, token = storageGet('fc.token');
    if (token) headers.Authorization = 'Bearer ' + token;
    function unsupported() { var e = new Error('Streaming is not supported by this server.'); e.unsupportedStream = true; return e; }
    if (typeof TextDecoder !== 'function' || typeof ReadableStream !== 'function' || !ReadableStream.prototype.getReader) return Promise.reject(unsupported());
    var prepared = AUTH ? AUTH.prepare('/api/chat/stream', 'POST', headers) : Promise.resolve({ headers: headers });
    return prepared.then(function (request) { return fetch('/api/chat/stream', { method: 'POST', headers: request.headers, credentials: request.credentials, body: JSON.stringify(body) }); }).then(function (r) {
      if (r.status === 404 || r.status === 405 || r.status === 501) throw unsupported();
      if (r.status === 401 && AUTH && AUTH.enabled) AUTH.handleUnauthorized();
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { var e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; e.final = true; throw e; });
      if (!r.body || !r.body.getReader || !/text\/event-stream/i.test(r.headers.get('Content-Type') || '')) throw unsupported();
      var reader = r.body.getReader(), decoder = new TextDecoder('utf-8'), buffer = '', eventName = '', data = [], finished = false;
      function dispatch() {
        if (!data.length) { eventName = ''; return null; }
        var name = eventName || 'message', payload;
        try { payload = JSON.parse(data.join('\n')); } catch (_) { throw new Error('The chat stream returned invalid data.'); }
        eventName = ''; data = [];
        if (name === 'delta') { if (payload && typeof payload.text === 'string') onDelta(payload.text); return null; }
        if (name === 'done') { finished = true; return payload; }
        if (name === 'error') { var er = new Error(payload && payload.error || 'The chat response failed.'); er.final = true; throw er; }
        return null;
      }
      function line(s) {
        if (s.endsWith('\r')) s = s.slice(0, -1);
        if (!s) return dispatch();
        if (s.charAt(0) === ':') return null;
        var i = s.indexOf(':'); if (i < 0) i = s.length;
        var field = s.slice(0, i), value = s.slice(i + 1); if (value.charAt(0) === ' ') value = value.slice(1);
        if (field === 'event') eventName = value;
        else if (field === 'data') data.push(value);
        return null;
      }
      function read() {
        return reader.read().then(function (part) {
          if (part.done) {
            buffer += decoder.decode();
            if (buffer) { var tail = line(buffer); if (tail !== null && finished) return tail; }
            if (!finished) throw new Error('The chat stream ended before completion.');
            return null;
          }
          buffer += decoder.decode(part.value, { stream: true });
          var rows = buffer.split('\n'); buffer = rows.pop();
          for (var i = 0; i < rows.length; i++) { var result = line(rows[i]); if (result !== null && finished) return result; }
          return read();
        });
      }
      return read().then(function (result) { if (!finished) throw new Error('The chat stream ended before completion.'); return result; });
    }, function () { var e = new Error('network'); e.status = 0; throw e; });
  }
  // ---------- resilient network: retry with backoff, calm banner, never asks the user to resend ----------
  var Net = { down: false, timer: null, wake: [] };
  function netDown() {
    if (Net.down) return; Net.down = true;
    clearTimeout(Net.timer); Net.timer = setTimeout(function () { var b = $('#netbar'); if (b && Net.down) b.hidden = false; }, 700);
  }
  function netUp() {
    if (!Net.down) return; Net.down = false; clearTimeout(Net.timer); var b = $('#netbar'); if (b) b.hidden = true;
  }
  function transient(e) { return !e.status || e.status === 502 || e.status === 503 && !e.final || e.status === 504 || e.status === 408; }
  function sleepNet(ms) { return new Promise(function (res) { var t = setTimeout(res, ms); Net.wake.push(function () { clearTimeout(t); res(); }); }); }
  addEventListener('online', function () { var w = Net.wake; Net.wake = []; w.forEach(function (f) { f(); }); });
  // Every server call is idempotent (request ids, step checkpoints), so it is always safe to retry.
  function rapi(path, opt) {
    var n = 0;
    function go() {
      return api(path, opt).then(function (d) { netUp(); return d; }, function (e) {
        if (!transient(e) || n > 400) throw e;
        netDown(); var wait = Math.min(10000, 500 * Math.pow(1.7, n++)) * (0.75 + Math.random() * 0.5);
        return sleepNet(wait).then(go);
      });
    }
    return go();
  }
  function rid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 2600); }

  // ---------- backends ----------
  var Server = {
    list: function () { return rapi('/api/agents'); },
    get: function (id, since) { return rapi('/api/agents/' + id + (since != null ? '?since=' + since : '')); },
    create: function (p, m, o) { o = o || {}; return rapi('/api/agents', { body: { project: S.project, prompt: p, model: m, sync: false, rid: rid(), images: o.images || undefined, files: o.files || undefined, think: !!o.think, mission: !!o.mission } }); },
    review: function (id) { return rapi('/api/agents/' + id + '/review', { body: {} }); },
    suggestions: function (id) { return rapi('/api/agents/' + id + '/suggestions', { body: {} }).then(function (r) { return r.suggestions; }); },
    approvePlan: function (id, pol) { return rapi('/api/agents/' + id + '/approve_plan', { body: { policy: pol } }); },
    approveMilestone: function (id, index) { return rapi('/api/agents/' + id + '/approve_milestone', { body: { completed_milestone_index: index } }); },
    approveAction: function (id, i) { return rapi('/api/agents/' + id + '/actions/' + i + '/approve', { body: {} }); },
    rejectAction: function (id, i) { return rapi('/api/agents/' + id + '/actions/' + i + '/reject', { body: {} }); },
    reject: function (id) { return rapi('/api/agents/' + id + '/reject', { body: {} }); },
    merge: function (id, override) { return rapi('/api/agents/' + id + '/merge', { body: { override: !!override } }); },
    diff: function (id) { return rapi('/api/agents/' + id + '/diff'); },
    share: function (id) { return rapi('/api/agents/' + id + '/share', { body: { hours: 24 } }); }
  };
  var P = window.FCPhone;
  var Phone = {
    list: function () { return Promise.resolve(P.list()); },
    get: function (id) { try { return Promise.resolve(P.get(id)); } catch (e) { return Promise.reject(e); } },
    create: function (p, m, o) { o = o || {}; if (o.files) p = p + '\n\n' + asPrompt(o.files); return P.create(p, m, function (pr, mo) { return api('/api/plan', { body: { prompt: pr, model: mo, images: o.images || undefined, think: !!o.think } }); }); },
    review: function (id) {
      var a = P.get(id); return P.diff(id).then(function (d) { return api('/api/review', { body: { prompt: a.prompt, model: a.model, diff: d.patch, files: P.files ? P.files(id) : {} } }); })
        .then(function (r) { return Object.assign(P.get(id), { review: r }); });
    },
    suggestions: function (id) { var a = P.get(id); return P.diff(id).then(function (d) { return api('/api/suggest', { body: { prompt: a.prompt, model: a.model, files: d.files.map(function (f) { return f.path; }) } }); }).then(function (r) { return r.suggestions; }); },
    approvePlan: function (id, pol) { return P.approvePlan(id, pol); },
    approveAction: function (id, i) { return P.approveAction(id, i); },
    rejectAction: function (id, i) { return P.rejectAction(id, i); },
    reject: function (id) { return P.reject(id); }, merge: function (id, o) { return P.merge(id, o); }, diff: function (id) { return P.diff(id); }
  };
  function mode() { return storageGet('fc.mode') || (innerWidth < 760 ? 'phone' : (S.cfg && (S.cfg && S.cfg.mode === 'cloud') ? 'cloud' : 'pc')); }
  function B() { return mode() === 'phone' ? Phone : Server; }

  // ---------- prefs ----------
  function applyPrefs() {
    var d = document.documentElement; d.dataset.theme = prefs.theme; d.dataset.density = prefs.density;
    var f = FONTS.filter(function (x) { return x.id === prefs.uiFont; })[0] || FONTS[0];
    d.dataset.legible = f.legible ? 'true' : 'false';
    d.style.setProperty('--ui', f.id === 'system-ui' ? 'system-ui' : "'" + f.id + "'");
    d.style.setProperty('--mono', "'" + prefs.codeFont + "'");
    d.style.setProperty('--fs', prefs.size + 'px');
    var fam = []; if (f.css) fam.push(f.css); var m = MONO.filter(function (x) { return x.id === prefs.codeFont; })[0]; if (m) fam.push(m.css);
    $('#fontcss').href = 'https://fonts.googleapis.com/css2?' + fam.map(function (x) { return 'family=' + x; }).join('&') + '&display=swap';
    var meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = getComputedStyle(d).getPropertyValue('--bg').trim() || '#0a0c10';
  }
  function setPref(k, v) { prefs[k] = v; storageSet('fc.prefs', JSON.stringify(prefs)); applyPrefs(); }

  // ---------- navigation ----------
  function go(view, id) {
    if (view === 'agent' && id !== undefined && id !== S.agentId) { S.pane = 'preview'; S.previewPage = 'index.html'; }   // a new agent opens on its rendered site, not the last Diff/Terminal tab
    if (view !== 'chat' && /^#chat/.test(location.hash)) history.replaceState(null, '', location.pathname);
    else if (view === 'chat' && !/^#chat/.test(location.hash)) history.replaceState(null, '', location.pathname + '#chat' + (S.chat.id ? '/' + S.chat.id : ''));
    S.view = view; if (id !== undefined) S.agentId = id;
    if (view === 'agent' || view === 'chat' || view === 'home') S.lastWorkView = view;
    if (view === 'revenue') S.rev = null; if (view === 'settings') S.consent = null;
    document.querySelectorAll('[data-go]').forEach(function (b) { b.classList.toggle('on', b.dataset.go === view || (view === 'agent' && b.dataset.go === 'home' && (b.closest('.tabbar') || (b.closest('.rail') && !b.classList.contains('logo'))))); });
    $('#app').classList.toggle('show-pane', view === 'preview');
    render();
    if (view === 'home') setTimeout(function () { var t = $('#prompt'); if (t && innerWidth > 760) t.focus(); }, 0);
  }
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); if (g.dataset.go === 'home' && g.id !== 'newchat' && g.id !== 'topnew' && S.view !== 'home' && S.view !== 'agent' && S.view !== 'chat') { if (S.lastWorkView === 'agent' && S.agentId) { go('agent', S.agentId); return; } if (S.lastWorkView === 'chat' && S.chat && (S.chat.id || (S.chat.msgs && S.chat.msgs.length))) { go('chat'); return; } } go(g.dataset.go, g.dataset.id || (g.dataset.go === 'home' ? null : undefined)); return; }
    var a = e.target.closest('[data-act]'); if (a) { e.preventDefault(); S.actEl = a; act(a.dataset.act, a.dataset); }
  });
  window.addEventListener('message', function (e) {
    var f = $('#frame'); if (!f || e.source !== f.contentWindow || !e.data) return;   // only our preview frame
    var a = cur() || S.agents[0]; if (!a) return;
    if (e.data.fcnav) { previewGo(a, cleanPage(e.data.fcnav)); return; }
    if (typeof e.data.fcerr === 'string' && a.mode !== 'phone' && a.state === 'review') { api('/api/agents/' + a.id + '/preview_error', { body: { error: e.data.fcerr } }).then(function (x) { upsert(x); if (x.state === 'fixing') { toast('Preview error found: fixing it automatically'); poll(x.id); render(); } }, function () {}); return; }
    if (e.data.fcpicked && typeof e.data.fcpicked.selector === 'string') {
      var pk = e.data.fcpicked; S.ctx = { selector: String(pk.selector).slice(0, 300), html: String(pk.html || '').slice(0, 600), text: String(pk.text || '').slice(0, 200) }; S.picking = false;
      toast('Element added to your prompt'); if (innerWidth < 760) go('agent'); else render(); setTimeout(function () { var t = $('#prompt'); if (t) t.focus(); }, 0); return;
    }
    if (typeof e.data.fcloc === 'string') {
      var pre = (a.preview_url || '/preview/' + a.id + '/'), loc = e.data.fcloc;
      if (loc.indexOf(pre) === 0) framePageChanged(cleanPage(decodeURIComponent(loc.slice(pre.length))));
    }
  });
  window.addEventListener('resize', function () { renderModes(); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); modelSheet(); }
    if (e.key === 'Escape') closeSheet();
  });

  // ---------- render ----------
  function modelName(id) { var m = S.models.filter(function (x) { return x.id === id; })[0]; return m ? m.name : 'Free way Auto'; }
  function projLabel(p) { return (!p || p === 'demo') ? '.freecode' : p; }
  function composer(placeholder, dock) {
    var a = S.view === 'agent' ? cur() : null, cloud = mode() === 'cloud', pLbl = projLabel(S.project);
    return '<form class="composer" id="cform" autocomplete="off"><label class="sr" for="prompt" hidden>Prompt</label>' +
      '<details class="cctx" id="advanced-options"' + (innerWidth > 760 ? ' open' : '') + '><summary>Advanced options</summary><div class="ctxitems" aria-label="Project context">' +
        '<button type="button" class="chip ctx" id="projchip" data-act="projmenu" tabindex="-1" aria-haspopup="dialog" title="Project">' + I.folder + '<span class="mono">' + esc(pLbl) + '</span>' + ((!S.project || S.project === 'demo') ? '<span class="sr" hidden>demo</span>' : '') + I.down + '</button>' +
        '<button type="button" class="chip ctx" id="branchchip" data-act="branchmenu" tabindex="-1" aria-haspopup="dialog" title="Branch">' + I.branch + '<span class="mono">' + esc(a ? 'fc/' + a.id : 'main') + '</span>' + I.down + '</button>' +
        '<button type="button" class="chip ctx" id="modechip" data-act="modemenu" tabindex="-1" aria-haspopup="dialog" aria-label="Run mode">' + (cloud ? I.cloud + 'Cloud' : I.monitor + 'Local') + I.down + '</button></div></details>' +
      '<div class="slash" id="slash" role="listbox" aria-label="Commands" hidden></div>' + attachRow() +
      '<textarea id="prompt" rows="2" placeholder="' + esc(placeholder) + '" aria-label="Describe what to build"></textarea>' +
      '<div class="crow"><input type="file" id="imgfile" multiple hidden>' +
      segHTML() +
      '<button type="button" class="chip" data-act="models" id="modelbtn" aria-haspopup="dialog" title="' + esc(modelName(S.model)) + '">' + esc(modelChip()) + I.down + '</button>' +
      '<span class="grow"></span>' +
      '<button type="button" class="ib attach" data-act="attach" id="attach" aria-label="Attach files" title="Attach files, images, PDFs or a zip. You can also drop or paste them">' + I.plus + '</button>' +
      '<button class="send" id="send" type="submit" aria-label="Send">' + I.send + '</button></div></form>' +
      (S.missionServerRequired ? '<div class="card checks bad" id="mission-server-required" role="alert"><div class="k">Server required</div><p>Server Mission requires PC or Cloud mode. Switch run mode to PC or Cloud to start it. Phone Build remains available for regular local builds.</p></div>' : '');
  }
  function attachRow() {
    if (!S.images.length && !S.ctx && !S.files.length) return '';
    return '<div class="attachrow" id="attachrow">' + S.images.map(function (u, i) { return '<span class="thumb"><img src="' + esc(u) + '" alt="Attached image ' + (i + 1) + '"><button type="button" data-act="unimg" data-i="' + i + '" aria-label="Remove image ' + (i + 1) + '">' + I.x + '</button></span>'; }).join('') + fileChips() +
      (S.ctx ? '<span class="ctxchip" id="ctxchip" title="' + esc(S.ctx.html) + '">' + I.pick + '<span class="mono">' + esc(S.ctx.selector.slice(-48)) + '</span><button type="button" data-act="unctx" aria-label="Remove selected element">' + I.x + '</button></span>' : '') + '</div>';
  }
  function renderModes() {
    var cur = mode(), cfg = S.cfg || {};
    var opts = [['phone', 'Phone', true], ['pc', 'PC', cfg.mode !== 'cloud'], ['cloud', 'Cloud', cfg.mode === 'cloud']];
    $('#modesw').innerHTML = opts.map(function (o) { return '<button role="radio" aria-checked="' + (cur === o[0]) + '" data-act="mode" data-m="' + o[0] + '"' + (o[2] ? '' : ' disabled title="Available when connected to a ' + o[1] + ' server"') + '>' + o[1] + '</button>'; }).join('');
  }
  function builds(a) { return !!a && (a.actions || []).some(function (x) { return (x.status === 'done' || x.status === 'running') && (x.type === 'write_file' || /\b(npm|npx|vite|serve|http\.server|dev)\b/.test(x.command || '')); }); }
  function paneOn() {
    if (S.view === 'preview') return true;
    if (S.view !== 'agent') return false;
    var a = cur(); if (!a) return false;
    S.paneUser = S.paneUser || {};
    return a.id in S.paneUser ? S.paneUser[a.id] : builds(a);
  }
  // Keep the composer focused across sends and re-renders (desktop always after a send; phone only if it already had focus)
  var CBOX = '#chatin, #prompt';
  document.addEventListener('submit', function (e) { if (e.target.closest && e.target.closest('.composer')) S.refocus = true; }, true);
  document.addEventListener('focusin', function (e) { if (!e.target.matches(CBOX) && !e.target.closest('.composer, .sheet')) S.refocus = false; });
  function render() { var ae = document.activeElement, had = !!(ae && ae.matches && ae.matches(CBOX)), sel = had ? [ae.selectionStart, ae.selectionEnd] : null; renderInner();
    var desk = matchMedia('(pointer: fine)').matches || innerWidth > 760, cur = document.activeElement;
    if ((had || (S.refocus && desk)) && $('#sheet').hidden !== false && (!cur || cur === document.body || !document.contains(ae) || cur === ae)) {
      var t = document.querySelector(CBOX); if (t && document.activeElement !== t) { t.focus({ preventScroll: true }); if (sel && t.value.length >= sel[1]) try { t.setSelectionRange(sel[0], sel[1]); } catch (x) {} } }
  }
  S.sessionSec = 47 * 60 + 53;
  function fmtSession(sec) {
    var s = Math.max(0, sec | 0), m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
  }
  function fmtTime(ts) {
    var d = new Date(ts || Date.now()), h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ap;
  }
  function chatTabTitle(t) {
    var s = String(t || '').trim();
    if (!s) return 'New chat';
    if (/^(hi+|hey+|hello+|yo|hola|vanakkam|namaste)\b/i.test(s) && s.split(/\s+/).length <= 3) return 'Greeting';
    return s.slice(0, 32);
  }
  function renderTopbar() {
    var tb = $('#topbar'); if (!tb) return;
    var tabs = [];
    if (S.chat && S.chat.msgs && S.chat.msgs.length) {
      tabs.push({ kind: 'chat', id: S.chat.id || 'active', title: chatTabTitle(S.chat.msgs[0].content), on: S.view === 'chat' });
    }
    (CH && CH.list || []).forEach(function (c) {
      if (tabs.length < 4 && !tabs.some(function (t) { return t.kind === 'chat' && t.id === c.id; })) {
        tabs.push({ kind: 'chat', id: c.id, title: chatTabTitle(c.title), on: S.view === 'chat' && S.chat && S.chat.id === c.id });
      }
    });
    S.agents.forEach(function (a) {
      if (tabs.length < 5) {
        tabs.push({ kind: 'agent', id: a.id, title: (a.title || 'Agent').slice(0, 32), on: S.view === 'agent' && S.agentId === a.id });
      }
    });
    if (!tabs.length) {
      tabs.push({ kind: 'home', id: 'home', title: 'Greeting', on: S.view === 'home' || S.view === 'chat' });
    }
    tb.innerHTML = '<div class="topbar-left">' +
      '<button type="button" class="ib top-ib" data-act="navback" aria-label="Back" title="Back">' + I.back + '</button>' +
      '<button type="button" class="ib top-ib" data-act="navfwd" aria-label="Forward" title="Forward">' + I.fwd + '</button>' +
      '<button type="button" class="ib top-ib" data-act="toggleside" id="toggleside" aria-label="Toggle sidebar" title="Toggle sidebar">' + I.panel + '</button>' +
      '</div><div class="tabs toptabs" id="toptabs" role="tablist">' +
      tabs.map(function (t) {
        var actAttr = t.kind === 'agent' ? 'data-go="agent" data-id="' + esc(t.id) + '"' : (t.kind === 'chat' && t.id !== 'active' ? 'data-act="chatopen" data-id="' + esc(t.id) + '"' : 'data-go="chat"');
        return '<div class="toptab' + (t.on ? ' on' : '') + '" role="tab" aria-selected="' + (t.on ? 'true' : 'false') + '">' +
          '<button type="button" class="toptab-btn" ' + actAttr + '><span class="t">' + esc(t.title) + '</span></button>' +
          (t.on ? '<button type="button" class="toptab-x" data-act="closetab" data-kind="' + t.kind + '" data-id="' + esc(t.id) + '" aria-label="Close tab">×</button>' : '') +
          '</div>';
      }).join('') +
      '</div><div class="topbar-right">' +
      '<button type="button" class="ib top-ib top-plus" id="topnew" data-go="home" aria-label="New tab" title="New tab">' + I.plus + '</button>' +
      '<button type="button" class="ib top-ib" data-act="togglepane" aria-label="Toggle preview pane" title="Toggle preview pane">' + I.panel + '</button>' +
      '<span class="win-controls" aria-hidden="true"><span>−</span><span>□</span><span>×</span></span>' +
      '</div>';
  }
  function renderInner() {
    $('#app').classList.toggle('wide', !paneOn());
    $('#app').classList.toggle('hide-side', !!S.hideSide);
    renderModes(); renderSide(); renderTopbar(); var m = $('#main'); m.classList.toggle('agentv', S.view === 'agent');
    if (S.view === 'home') m.innerHTML = homeView();
    else if (S.view === 'agent') m.innerHTML = agentView();
    else if (S.view === 'board') m.innerHTML = boardView();
    else if (S.view === 'settings') m.innerHTML = settingsView();
    else if (S.view === 'revenue') m.innerHTML = revenueView();
    else if (S.view === 'chat') m.innerHTML = chatView();
    else if (S.view === 'apps') m.innerHTML = appsView();
    else if (S.view === 'preview') m.innerHTML = '';
    bindComposer(); bindChat(); bindApps(); renderPane();
    if (S.view === 'agent') watchAd(cur());
    if (!S.elapsedTimer) S.elapsedTimer = setInterval(function () {
      var a = S.view === 'agent' && cur(), el = $('#worked-for');
      if (a && el) el.textContent = workedFor(a);
      S.sessionSec = S.sessionSec > 0 ? S.sessionSec - 1 : 50 * 60;
      var st = $('#session-timer'); if (st) st.textContent = fmtSession(S.sessionSec);
    }, 1000);
  }
  function homeView() {
    var first = !S.agents.length;
    var greet = first ? 'Build something today.' : 'What should we build next?';
    var tpl = [['Landing page', 'A landing page for a coffee subscription with pricing and an FAQ', 'M3 5h18v14H3zM3 9h18'], ['Todo app', 'Build a todo app with filters, local storage and a dark mode', 'M5 12l4 4 10-10'], ['Dashboard', 'A small analytics dashboard with three charts from a CSV', 'M4 20V10M10 20V4M16 20v-7M22 20H2'], ['Portfolio', 'A portfolio site with a project grid and a contact form', 'M4 4h16v16H4zM4 14l5-5 4 4 3-3 4 4']];
    return '<section class="home' + (first ? ' first' : '') + '">' + (first ? '<div class="orb" aria-hidden="true"></div><span class="eyebrow">Free models · you approve every step</span>' : '') + '<h1>' + greet + '</h1><p class="sub">' + (first ? 'Describe it in any language. Free way plans it, you approve, it builds and tests it on a branch.' : 'Free models plan it, you approve it, it builds it.') + '</p>' +
      (S.project !== 'demo' ? '<p class="projbar" id="projbar">' + I.git + 'Working on <b class="mono">' + esc(S.project) + '</b><button class="btn ghost" data-act="project" data-p="demo">Switch to demo</button></p>' : '') +
      composer('Describe a change, in any language. Type / for commands.') +
      (first ? '<div class="tgrid" aria-label="Start from an idea">' + tpl.map(function (t, i) { return '<button class="tcard" data-act="chip" data-t="' + esc(t[1]) + '" style="--i:' + i + '"><svg viewBox="0 0 24 24"><path d="' + t[2] + '"/></svg><b>' + t[0] + '</b><small>' + esc(t[1]) + '</small></button>'; }).join('') + '</div>' +
        '<ol class="how"><li><b>Describe</b><small>Text, a screenshot, a PDF or a whole zip.</small></li><li><b>Approve the plan</b><small>Every file and command waits for you.</small></li><li><b>Merge</b><small>Checks run, the agent fixes failures, you merge.</small></li></ol>' +
        '<p class="keys"><kbd>Ctrl</kbd><kbd>K</kbd> commands <span>·</span> <kbd>/</kbd> slash commands <span>·</span> drop files anywhere on the prompt</p>'
      : '<div class="chips">' + ['Build a todo app with a landing page', 'A pricing page for my startup', 'A portfolio landing page'].map(function (c) { return '<button class="chip" data-act="chip" data-t="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>') +
      (S.cfg && S.cfg.mock ? '<p class="mockbar">Demo models are active: replies come from the built-in demo provider. Add a free NVIDIA NIM or OpenRouter key in Settings to use real free models.</p>' : '') + '</section>';
  }
  function cur() { return S.agents.filter(function (a) { return a.id === S.agentId; })[0]; }
  function stateBadge(s, a) {
    if (s === 'review' && a && a.checks === 'failed') return '<span class="badge bad" data-state="review" data-checks="failed">Checks failing</span>';
    var map = { planning: ['acc', 'Planning'], needs_plan_approval: ['warn', 'Needs approval · plan'], needs_milestone_approval: ['warn', 'Needs approval · milestone'], working: ['acc', 'Working'], fixing: ['acc run', 'Fixing a failing test'], review: ['ok', 'Ready to merge'], merged: ['ok', 'Merged'], rejected: ['bad', 'Rejected'], error: ['bad', 'Error'] };
    var x = map[s] || ['', s]; return '<span class="badge ' + x[0] + '" data-state="' + s + '">' + x[1] + '</span>';
  }
  function workedFor(a) {
    var created = Number(a && a.created); if (!Number.isFinite(created) || created <= 0) return '';
    var terminal = ['review', 'merged', 'rejected', 'error'].indexOf(a.state) >= 0;
    var endpoint = Date.now() / 1000;
    if (terminal) {
      var events = Array.isArray(a.log) ? a.log : [], now = endpoint;
      endpoint = 0;
      for (var i = events.length - 1; i >= 0; i--) {
        var t = Number(events[i] && events[i].t);
        if (Number.isFinite(t) && t >= created && t <= now + 5) { endpoint = t; break; }
      }
      if (!endpoint) return '';
    }
    var seconds = Math.max(0, Math.floor(endpoint - created));
    var days = Math.floor(seconds / 86400); seconds %= 86400;
    var hours = Math.floor(seconds / 3600); seconds %= 3600;
    var minutes = Math.floor(seconds / 60); seconds %= 60;
    var parts = []; if (days) parts.push(days + 'd'); if (hours || days) parts.push(hours + 'h');
    if (minutes || hours || days) parts.push(minutes + 'm'); if (seconds || !parts.length) parts.push(seconds + 's');
    return 'Worked for ' + parts.join(' ');
  }
  function toolHistory(a) {
    var names = []; (a.log || []).forEach(function (event) {
      if (event && event.kind === 'tools_used' && Array.isArray(event.tools))
        event.tools.forEach(function (name) { if (typeof name === 'string' && name) names.push(name); });
    });
    if (!names.length) return '';
    return '<details class="tool-history" id="tool-history" aria-label="Public tool history"><summary>Used ' + names.length + ' tools</summary><ul>' +
      names.map(function (name) { return '<li>' + esc(name) + '</li>'; }).join('') + '</ul></details>';
  }
  function missionCard(a) {
    var m = a.mission, goals = m && m.milestones || [], current = Number.isInteger(m && m.current_index) ? m.current_index : 0;
    var completed = m && m.completed_indices || [], pending = m && m.pending_approval_index;
    var finalPending = a.state === 'needs_milestone_approval' && pending === goals.length - 1;
    var status = 'Milestone ' + (current + 1) + ' of ' + goals.length + ' is in progress. Each milestone stops at its own approval boundary.';
    if (a.state === 'needs_plan_approval') status = current === 0 ? 'Initial Mission plan awaiting approval. Approve this initial plan before milestone 1 of ' + goals.length + ' starts.' : 'Milestone ' + (current + 1) + ' of ' + goals.length + ' plan awaiting approval. Approve the current plan before this milestone starts.';
    else if (a.state === 'needs_milestone_approval') status = finalPending ? 'Final milestone ' + (pending + 1) + ' of ' + goals.length + ' is complete. Approve this final boundary to begin final review; nothing will merge or deploy automatically.' : 'Milestone ' + (pending + 1) + ' of ' + goals.length + ' is complete. Approve this boundary before a plan for the next milestone can start.';
    else if (a.state === 'review') status = 'All milestones have matching approvals. Final review is ready; merge and deployment remain separate manual actions.';
    else if (a.state === 'rejected') status = 'Mission stopped. No later milestone will start.';
    else if (a.state === 'error') status = 'Mission stopped after an error. No milestone was silently advanced.';
    var rows = goals.map(function (goal, i) {
      var label = completed.indexOf(i) >= 0 ? 'Complete' : pending === i ? 'Awaiting approval' : i === current ? 'Current' : 'Planned';
      return '<li data-milestone-index="' + i + '"><b>Milestone ' + (i + 1) + '</b> · ' + esc(goal) + ' <small class="badge' + (completed.indexOf(i) >= 0 ? ' ok' : pending === i ? ' warn' : '') + '">' + label + '</small></li>';
    }).join('');
    var terminal = ['review', 'merged', 'rejected', 'error'].indexOf(a.state) >= 0;
    var approval = a.state === 'needs_milestone_approval' && Number.isInteger(pending) && pending >= 0 && pending < goals.length;
    var actions = approval ? '<button class="btn primary" data-act="approvemilestone" data-index="' + pending + '" id="mission-approve">' + I.check + (finalPending ? 'Approve final milestone ' : 'Approve completed milestone ') + (pending + 1) + '</button>' : '';
    if (!terminal) actions += '<button class="btn ghost danger" data-act="reject">Stop Mission</button>';
    return '<section class="card mission" id="mission-card" aria-label="Mission progress"><div class="k">Mission · ordered milestones</div><p id="mission-progress" class="status-line" role="status" aria-live="polite">' + esc(status) + '</p><p class="worked-for" id="worked-for" title="Wall-clock elapsed from creation, including approval waits; completed agents end at last recorded activity.">' + esc(workedFor(a)) + '</p><ol id="mission-list">' + rows + '</ol>' + (actions ? '<div class="bar">' + actions + '</div>' : '') + '</section>';
  }
  function agentView() {
    var a = cur(); if (!a) return '<div class="blank">Agent not found.</div>';
    var h = '<div class="thread"><div class="thead"><h2>' + esc(a.title) + '</h2>' + (a.mission ? '' : stateBadge(a.state, a)) + (a.mission ? '' : '<span class="worked-for" id="worked-for" title="Wall-clock elapsed from creation, including approval waits; completed agents end at last recorded activity.">' + esc(workedFor(a)) + '</span>') + '<span class="grow"></span><button class="ib' + (paneOn() ? ' on' : '') + '" data-act="togglepane" id="togglepane" aria-pressed="' + paneOn() + '" aria-label="Toggle preview pane" title="Preview, diff and terminal">' + I.panel + '</button><button class="ib" data-act="agentexport" id="agentexport" aria-label="Export this agent as Markdown" title="Export as Markdown">' + I.dl + '</button></div>';
    var pp = String(a.prompt || ''), cut = pp.search(/\n\n\[Attached (file|pdf|zip|doc|code|text|binary|image)s?:/);
    h += '<div class="msg user">' + esc(cut > 0 ? pp.slice(0, cut) : pp) + (cut > 0 ? '<div class="pfiles">' + (pp.slice(cut).match(/\[Attached [a-z]+: [^\]\n]+\]/g) || []).map(function (x) { var mm = x.match(/\[Attached ([a-z]+): (.+?) \((\d+) bytes/) || []; return '<span class="fchip mini"><span class="fk k-' + esc(mm[1]) + '">' + (KIND[mm[1]] || 'FILE') + '</span><span class="fn"><b>' + esc(mm[2] || x) + '</b><small>' + fsize(+mm[3] || 0) + '</small></span></span>'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="msg-time">' + esc(fmtTime(a.created ? a.created * 1000 : Date.now())) + '</div>' +
      '<div class="worked-line">' + esc(workedFor(a) || 'Worked for 5s') + ' ›</div>';
    if (a.mission) h += missionCard(a);
    h += toolHistory(a);
    if (a.thinking) h += '<div class="card think" id="thinkcard"><div class="k">' + I.think + 'Thinker</div><p>' + esc(a.thinking.approach) + '</p>' + (a.thinking.risks && a.thinking.risks.length ? '<small>Risks: ' + esc(a.thinking.risks.join('; ')) + '</small>' : '') + '</div>';
    if (a.state === 'planning') h += '<div class="msg"><span class="spin"></span> Planning with ' + esc(modelName(a.model)) + '...</div>';
    if (a.error) h += '<div class="card" role="alert"><div class="k">Error</div>' + esc(a.error) + (/key|BYOK|401/.test(a.error) ? '<div class="bar"><button class="btn" data-go="settings">Add a free key</button></div>' : '') + '</div>';
    if (a.plan) {
      var missionIndex = a.mission && Number.isInteger(a.mission.current_index) ? a.mission.current_index : 0;
      var planTitle = !a.mission ? 'Plan' : missionIndex === 0 ? 'Initial Mission plan' : 'Milestone ' + (missionIndex + 1) + ' plan';
      var planApproveLabel = !a.mission ? 'Approve plan' : missionIndex === 0 ? 'Approve initial plan' : 'Approve milestone ' + (missionIndex + 1) + ' plan';
      h += '<div class="card plan" id="plancard"><div class="k">' + I.plan + esc(planTitle) + ' · ' + a.plan.steps.length + ' steps' + (a.route ? ' · <span class="nt">' + esc(modelName(a.route.brand)) + (a.route.provider === 'mock' ? ' (demo)' : '') + '</span>' : '') + '</div><b>' + esc(a.plan.summary) + '</b><ol>' +
        a.plan.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
      if (a.state === 'needs_plan_approval') h += '<div class="bar"><button class="btn primary" data-act="approveplan" id="approveplan">' + I.check + planApproveLabel + '</button><button class="btn" data-act="approveall" id="approveall">Approve all actions</button><button class="btn ghost danger" data-act="reject">Reject</button></div>';
      h += '</div>';
      h += '<div class="acts" id="acts">' + a.actions.map(function (x, i) {
        var label = x.type === 'write_file' ? x.path : x.command, kind = x.type === 'write_file' ? 'Write file' : 'Run command';
        var st = x.status === 'pending' ? ((x.risk||'').indexOf('blocked') === 0 ? '<span class="badge bad">Blocked</span>' : (a.state === 'working' && a.policy === 'session' ? '<span class="badge">Queued</span>' : a.state === 'working' ? '<button class="ib ok" data-act="aa" data-i="' + i + '" aria-label="Approve ' + esc(label) + '">' + I.check + '</button><button class="ib no" data-act="ar" data-i="' + i + '" aria-label="Reject ' + esc(label) + '">' + I.x + '</button>' : '<span class="badge">Waiting</span>'))
          : '<span class="badge ' + (x.status === 'done' ? ((x.result && x.result.exit_code) ? 'bad' : 'ok') : x.status === 'running' ? 'acc run' : x.status === 'skipped' ? '' : 'bad') + '">' + (x.status === 'done' && x.result && x.result.exit_code ? 'Exit ' + x.result.exit_code : x.status[0].toUpperCase() + x.status.slice(1)) + '</span>';
        var body = x.type === 'run_command' && x.result ? '<div class="term" data-term="' + i + '"><span class="ps">$ ' + esc(x.command) + '</span>\n' + esc(x.result.output || x.result.error || '') + '</div>' : '';
        return '<div><div class="act" data-i="' + i + '" data-status="' + x.status + '"><span class="ib">' + (x.type === 'write_file' ? I.file : I.term) + '</span><span class="what"><b class="mono">' + esc(label) + '</b><small>' + kind + ((x.risk||'').indexOf('blocked') === 0 ? ' · ' + esc(x.risk) : '') + '</small></span>' + st + '</div>' + body + '</div>';
      }).join('') + '</div>';
      h += fixRounds(a);
      if (a.state === 'review' || a.state === 'merged') h += adHTML(a);     // only at a natural pause, never while the agent works
      if (a.state === 'review' || a.state === 'merged') {
        var fails = (a.actions || []).filter(function (x) { return x.type === 'run_command' && x.status === 'done' && x.result && x.result.exit_code; });
        var lastFail = fails[fails.length - 1];
        if (a.state === 'review' && a.checks === 'failed' && lastFail)
          h += '<div class="card checks bad" id="checks" role="alert"><div class="k">' + I.term + 'Checks failing</div><p><code>' + esc(lastFail.command) + '</code> exited ' + lastFail.result.exit_code +
            ' after ' + a.fix_round + ' automatic fix ' + (a.fix_round === 1 ? 'attempt' : 'attempts') + '. Merging is blocked until it passes.</p></div>';
        else if (a.checks === 'passed')
          h += '<div class="card checks ok" id="checks"><div class="k">' + I.check + 'Checks passed</div>' + (a.fix_round ? '<p>Free way fixed a failing test automatically (' + a.fix_round + (a.fix_round === 1 ? ' round' : ' rounds') + ').</p>' : '') + '</div>';
        h += '<div class="card" style="margin-top:12px" id="changed"><div class="k">' + I.git + 'Files changed</div><div class="files" id="files"><span class="spin"></span></div><div class="bar">' +
          (a.state === 'review' && a.checks !== 'failed' ? '<button class="btn primary" data-act="merge" id="merge">' + I.git + 'Merge to main</button>' : '') +
          (a.state === 'review' && a.checks === 'failed' ? '<button class="btn danger" data-act="mergeoverride" id="mergeoverride">' + I.git + 'Merge anyway</button>' : '') + '<button class="btn" data-act="pane" data-p="diff">Review diff</button><button class="btn" data-act="pane" data-p="preview">Open preview</button>' +
          '<button class="btn" data-act="review" id="reviewbtn">' + I.eye + (a.review ? 'Review again' : 'Code review') + '</button>' +
          (a.mode !== 'phone' ? '<button class="btn" data-act="deploy" id="deploybtn">' + I.cloud + 'Deploy</button>' : '') +
          (a.mode !== 'phone' && /^gh-/.test(a.project) ? '<button class="btn" data-act="pr" id="prbtn">' + I.pr + (a.pr ? 'Update pull request' : 'Open pull request') + '</button>' : '') + '</div></div>';
        h += reviewCard(a) + deployCard(a) + followUps(a);
        setTimeout(loadFiles, 0);
      }
    }
    h += '<div class="msg-foot"><button type="button" class="feedback-btn" data-act="feedback">' + I.chat + '<span>Give feedback</span></button></div>';
    return h + '</div><div class="dock">' + composer('New task, or steer this agent...') + '</div>';
  }
  function reviewCard(a) {
    if (S.reviewing === a.id) return '<div class="card" id="reviewcard"><span class="spin"></span> Reviewing the changes' + (a.mode !== 'phone' ? ' and testing the preview in a browser' : '') + '...</div>';
    var r = a.review; if (!r) return '';
    var sev = { error: 'bad', warn: 'warn', info: '' }, br = r.browser;
    return '<div class="card review ' + (r.verdict === 'approve' ? 'ok' : 'bad') + '" id="reviewcard"><div class="k">' + I.eye + 'Code review · ' + (r.verdict === 'approve' ? 'Looks good' : 'Changes suggested') + '</div><p>' + esc(r.summary) + '</p>' +
      (r.findings.length ? '<ul class="finds">' + r.findings.map(function (f) { return '<li><span class="badge ' + (sev[f.severity] || '') + '">' + esc(f.severity) + '</span><span class="mono">' + esc(f.file) + (f.line ? ':' + f.line : '') + '</span> ' + esc(f.message) + '</li>'; }).join('') + '</ul>' : '') +
      (br && !br.skipped ? '<div class="browsercheck" id="browsercheck"><b>Browser check</b> ' + (br.ok ? '<span class="badge ok">Passed</span>' : '<span class="badge bad">Issues</span>') + ' <small>' + esc(br.title || '') + ' · ' + br.buttons + ' buttons, ' + br.links + ' links' + (br.clicked ? ', clicked "' + esc(br.clicked) + '"' : '') + '</small>' +
        (br.errors.concat(br.console, br.broken || []).slice(0, 4).map(function (x) { return '<div class="mono err">' + esc(x) + '</div>'; }).join('')) + '</div>' : '') +
      (r.verdict !== 'approve' ? '<div class="bar"><button class="btn" data-act="fixreview" id="fixreview">Ask the agent to fix these</button></div>' : '') + '</div>';
  }
  function deployCard(a) {
    var out = (a.deploys || []).slice(-3).reverse().map(function (d) { return '<div><span class="badge ok">Live</span> <a href="' + esc(d.url || '#') + '" target="_blank" rel="noopener noreferrer" class="mono">' + esc(d.url || '(deploy started)') + '</a> <small>' + esc(((S.integ && S.integ.hosts[d.host]) || { name: d.host }).name) + '</small></div>'; }).join('');
    if (a.pr) out += '<div><span class="badge ok">PR #' + esc(a.pr.number) + '</span> <a href="' + esc(a.pr.url) + '" target="_blank" rel="noopener noreferrer">' + esc(a.pr.url) + '</a></div>';
    return out ? '<div class="card deploys" id="deploys"><div class="k">' + I.cloud + 'Published</div>' + out + '</div>' : '';
  }
  function followUps(a) {
    if (!a.suggestions) {
      if (!S.sugLoading[a.id]) {
        S.sugLoading[a.id] = 1;
        B().suggestions(a.id).then(function (sg) {
          a.suggestions = sg;
          if (S.agentId === a.id && S.view === 'agent') {
            var slot = $('#followslot');
            if (slot) slot.outerHTML = followUps(a);
            else render();
          }
        }, function () {});
      }
      return '<div id="followslot" hidden></div>';
    }
    return '<div class="follow" id="follow" aria-label="Suggested next tasks"><span class="k">Next</span>' + a.suggestions.map(function (t) { return '<button class="chip" data-act="follow" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
  }
  S.sugLoading = {};
  function loadFiles() {
    var a = cur(); if (!a) return;
    B().diff(a.id).then(function (d) { var el = $('#files'); if (el) el.innerHTML = d.files.map(function (f) { return '<div><span>' + esc(f.path) + '</span><span><span class="plus">+' + f.added + '</span> <span class="minus">-' + f.removed + '</span></span></div>'; }).join('') || 'No changes'; }).catch(function () {});
  }
  function boardView() {
    var cols = [['Planning / approval', ['planning', 'needs_plan_approval', 'needs_milestone_approval']], ['Working', ['working', 'fixing']], ['Ready to review', ['review']], ['Done', ['merged', 'rejected', 'error']]];
    return '<div class="board" id="board">' + cols.map(function (c) {
      var items = S.agents.filter(function (a) { return c[1].indexOf(a.state) >= 0; });
      return '<div class="col"><h3><span>' + c[0] + '</span><span>' + items.length + '</span></h3>' + (items.map(function (a) {
        return '<button class="acard" data-go="agent" data-id="' + a.id + '"><b>' + esc(a.title) + '</b><small>' + esc(modelName(a.model)) + ' · ' + a.actions.length + ' actions</small><div style="margin-top:6px">' + stateBadge(a.state, a) + '</div></button>';
      }).join('') || '<div class="empty">No agents</div>') + '</div>';
    }).join('') + '</div>';
  }
  function renderSide() {
    var rows = [];
    if (S.chat && S.chat.msgs && S.chat.msgs.length && !(CH && CH.list || []).some(function (c) { return c.id === S.chat.id; })) {
      rows.push('<button type="button" data-go="chat" class="' + (S.view === 'chat' ? 'on' : '') + '">' + I.chat + '<span class="t">' + esc(chatTabTitle(S.chat.msgs[0].content)) + '</span></button>');
    }
    (CH && CH.list || []).slice(0, 3).forEach(function (c) {
      rows.push('<button type="button" data-act="chatopen" data-id="' + esc(c.id) + '" class="' + (S.view === 'chat' && S.chat && S.chat.id === c.id ? 'on' : '') + '">' + I.chat + '<span class="t">' + esc(chatTabTitle(c.title)) + '</span></button>');
    });
    S.agents.forEach(function (a) {
      rows.push('<button data-go="agent" data-id="' + a.id + '" class="' + (a.id === S.agentId && S.view === 'agent' ? 'on' : '') + '"><span class="dot ' + a.state + '"></span><span class="t">' + esc(a.title) + '</span></button>');
    });
    var visible = (!S.sideAll && rows.length > 5) ? rows.slice(0, 5) : rows;
    var moreBtn = rows.length > 5 ? '<button type="button" class="side-more" data-act="sidemore">' + (S.sideAll ? 'Show less' : 'Show more') + '</button>' : '<button type="button" class="side-more" data-act="sidemore">Show more</button>';
    $('#sidelist').innerHTML = (visible.length ? visible.join('') : '<div class="empty">Your agents appear here</div>') + moreBtn;
    var sc = $('#sidechats');
    if (sc) {
      var chatRows = (CH && CH.list || []).slice(0, 4).map(function (c) {
        return '<button type="button" data-act="chatopen" data-id="' + esc(c.id) + '" class="' + (S.view === 'chat' && S.chat && S.chat.id === c.id ? 'on' : '') + '">' + I.chat + '<span class="t">' + esc(chatTabTitle(c.title)) + '</span></button>';
      });
      sc.innerHTML = chatRows.join('') || '<div class="side-muted">No saved chats yet</div>';
    }
  }
  // ---------- preview navigation (toolbar) ----------
  S.phist = S.phist || {};
  function hist(id) { return S.phist[id] || (S.phist[id] = { list: [S.previewPage || 'index.html'], i: 0 }); }
  function previewBase(a) { return a.mode === 'phone' ? 'on-device://' + a.id + '/' : location.origin + (a.preview_url || '/preview/' + a.id + '/'); }
  function previewURL(a, page) { return previewBase(a) + (page || 'index.html'); }
  function cleanPage(x) {
    x = String(x || '').trim().replace(/^\/+/, '').split('#')[0];
    if (!x) return 'index.html';
    if (x.split('/').some(function (seg) { return seg === '..'; })) return null;
    if (/\/$/.test(x)) x += 'index.html';
    return x;
  }
  function pageFromInput(a, v) {
    v = String(v || '').trim(); var base = previewBase(a);
    if (v.indexOf(base) === 0) return cleanPage(v.slice(base.length));
    var m = v.match(/^https?:\/\/[^/]+(\/.*)$/); var path = m ? m[1] : v;
    var pre = (a.preview_url || '/preview/' + a.id + '/');
    if (path.indexOf(pre) === 0) return cleanPage(path.slice(pre.length));
    if (/^[a-z]+:/i.test(v)) return null;                       // other sites are not previewed here
    return cleanPage(path);
  }
  function previewGo(a, page, push) {
    if (!page) { toast('That address is outside this preview'); return; }
    var H = hist(a.id);
    if (push !== false && H.list[H.i] !== page) { H.list = H.list.slice(0, H.i + 1); H.list.push(page); H.i = H.list.length - 1; }
    S.previewPage = page; renderPane();
  }
  function framePageChanged(page) {             // the app navigated inside the frame: track it, no reload
    var a = cur() || S.agents[0]; if (!a || !page) return; var H = hist(a.id);
    if (H.list[H.i] === page) return;
    H.list = H.list.slice(0, H.i + 1); H.list.push(page); H.i = H.list.length - 1; S.previewPage = page;
    var u = $('#purl'); if (u && document.activeElement !== u) u.value = previewURL(a, page);
    var b = $('#pback'); if (b) b.disabled = H.i <= 0; var fw = $('#pfwd'); if (fw) fw.disabled = true;
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(function () { return legacyCopy(t); });
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) { var x = document.createElement('textarea'); x.value = t; x.setAttribute('readonly', ''); x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (e) {} x.remove(); }
  function openPreview(a) {
    if (a.mode === 'phone') {
      var html = P.srcdoc(a.id, S.previewPage) || '';
      var u = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(u, '_blank', 'noopener'); return;
    }
    window.open(previewURL(a, S.previewPage), '_blank', 'noopener');
  }
  // Auto-fix rounds, read from the agent log: what failed, what changed in each round, and how it ended
  function fixRounds(a) {
    var R = {}, order = [], stop = null;
    (a.log || []).forEach(function (e) {
      if (e.kind === 'fix_stopped') { stop = e.reason; return; }
      if (!/^fix(ing|_plan|_failed|_model_switch|_env_mismatch)$/.test(e.kind) || !e.round) return;
      var r = R[e.round] || (R[e.round] = { n: e.round, notes: [] }); if (order.indexOf(e.round) < 0) order.push(e.round);
      if (e.kind === 'fixing') r.what = e.source === 'preview' ? 'Preview error: ' + (e.error || '') : (e.checks && e.checks.length ? 'Failing: ' + e.checks.join(', ') : 'Failing check');
      if (e.kind === 'fix_model_switch') r.notes.push('stronger model: ' + modelName(e.model));
      if (e.kind === 'fix_env_mismatch') r.notes.push('test setup shim for ' + (e.apis || []).join(', '));
      if (e.kind === 'fix_plan') r.done = e.actions + ' change' + (e.actions === 1 ? '' : 's') + ' applied';
      if (e.kind === 'fix_failed') r.done = 'fix step failed';
    });
    if (!order.length) return '';
    return '<div class="card fixrounds" id="fixrounds"><div class="k">' + I.reload + 'Auto-fix · ' + order.length + ' of 4 rounds</div><ol>' + order.map(function (n) { var r = R[n];
      return '<li><b>Round ' + n + '</b> <span>' + esc(r.what || '') + '</span>' + (r.notes.length ? ' <small>(' + esc(r.notes.join('; ')) + ')</small>' : '') + '<small class="st">' + esc(r.done || (a.state === 'fixing' ? 'working...' : '')) + '</small></li>'; }).join('') +
      '</ol>' + (stop ? '<p class="nt">Stopped early: ' + esc(stop) + '.</p>' : '') + '</div>';
  }
  function renderPane() {
    var p = $('#pane'), a = cur() || (S.view === 'preview' ? S.agents[0] : null);   // home shows an empty pane, not some other agent's output
    var tabs = '<div class="ptabs" role="tablist">' + [['preview', 'Preview'], ['diff', 'Diff'], ['terminal', 'Terminal']].map(function (t) { return '<button role="tab" aria-selected="' + (S.pane === t[0]) + '" class="' + (S.pane === t[0] ? 'on' : '') + '" data-act="pane" data-p="' + t[0] + '">' + t[1] + '</button>'; }).join('') +
      (S.pane === 'preview' ? '<span class="devbar"><button data-act="dev" data-d="390" aria-label="Phone width" class="' + (S.device === '390' ? 'on' : '') + '">' + I.phone + '</button><button data-act="dev" data-d="full" aria-label="Full width" class="' + (S.device === 'full' ? 'on' : '') + '">' + I.monitor + '</button></span>' : '') + '</div>';
    if (!a || !a.actions.some(function (x) { return x.status === 'done'; })) { p.innerHTML = tabs + '<div class="pbody"><div class="blank"><div>' + I.monitor + '<p>' + (a ? 'Approve a plan to see the live preview, diff and terminal here.' : 'Describe a task to start an agent. Its live preview, diff and terminal appear here.') + '</p></div></div></div>'; return; }
    if (S.pane === 'preview') {
      var H = hist(a.id), local = a.mode === 'phone', url = previewURL(a, S.previewPage), cloud = S.cfg && (S.cfg && S.cfg.mode === 'cloud');
      var bar = '<form class="urlbar" id="urlbar" autocomplete="off">' +
        '<button type="button" class="ib" data-act="pback" id="pback" aria-label="Back"' + (H.i > 0 ? '' : ' disabled') + '>' + I.back + '</button>' +
        '<button type="button" class="ib" data-act="pfwd" id="pfwd" aria-label="Forward"' + (H.i < H.list.length - 1 ? '' : ' disabled') + '>' + I.fwd + '</button>' +
        '<button type="button" class="ib" data-act="reload" id="preload" aria-label="Refresh">' + I.reload + '</button>' +
        '<input class="purl mono" id="purl" aria-label="Preview address" spellcheck="false" value="' + esc(url) + '">' +
        '<button type="button" class="ib" data-act="pcopy" id="pcopy" aria-label="Copy link"' + (local ? ' disabled title="On-device previews have no shareable link"' : '') + '>' + I.link + '</button>' +
        (cloud && !local ? '<button type="button" class="ib" data-act="pshare" id="pshare" aria-label="Share live link">' + I.share + '</button>' : '') +
        '<button type="button" class="ib' + (S.picking ? ' on' : '') + '" data-act="ppick" id="ppick" aria-label="Pick an element" aria-pressed="' + S.picking + '" title="Pick an element to add it to your prompt">' + I.pick + '</button>' +
        '<button type="button" class="ib" data-act="popen" id="popen" aria-label="Open in browser">' + I.ext + '</button></form>' + (S.picking ? '<div class="pickbar" id="pickbar">Click any element in the preview to add it to your prompt. <button class="btn ghost" data-act="ppick">Cancel</button></div>' : '');
      p.innerHTML = tabs + bar + '<div class="pbody" style="background:var(--raised)"><iframe class="frame" id="frame" title="Live preview" sandbox="allow-scripts allow-forms" style="width:' + (S.device === 'full' ? '100%' : S.device + 'px') + '"></iframe></div>';
      var f = $('#frame');
      f.addEventListener('load', function () { if (S.picking) try { f.contentWindow.postMessage({ fcpick: true }, '*'); } catch (e) {} });
      var pu = $('#purl'); pu.scrollLeft = pu.scrollWidth;
      $('#urlbar').onsubmit = function (e) { e.preventDefault(); var pg2 = pageFromInput(a, $('#purl').value); previewGo(a, pg2); };
      if (a.mode === 'phone') {
        var html = P.srcdoc(a.id, S.previewPage) || P.srcdoc(a.id, 'index.html') || '<p>No index.html yet</p>';
        f.srcdoc = html + '<script>document.addEventListener("click",function(e){var l=e.target.closest("a[href^=\'#fc:\']");if(l){e.preventDefault();parent.postMessage({fcnav:l.getAttribute("href").slice(4)},"*")}})<\/script>' + PICKER;
      } else {
        f.src = (a.preview_url || '/preview/' + a.id + '/') + S.previewPage;
      }
    } else if (S.pane === 'diff') {
      p.innerHTML = tabs + '<div class="pbody"><div class="diff" id="diff"><span class="spin"></span></div></div>';
      B().diff(a.id).then(function (d) { var el = $('#diff'); if (!el) return; el.innerHTML = d.patch.split('\n').map(function (l) { var c = l[0] === '+' && l.slice(0, 3) !== '+++' ? 'a' : l[0] === '-' && l.slice(0, 3) !== '---' ? 'd' : l.slice(0, 2) === '@@' ? 'h' : /^(diff|index|new file|---|\+\+\+)/.test(l) ? 'm' : ''; return '<div class="' + c + '">' + esc(l) + '</div>'; }).join(''); });
    } else {
      var lines = a.actions.filter(function (x) { return x.type === 'run_command' && x.result; }).map(function (x) { return '<span class="ps">$ ' + esc(x.command) + '</span>\n' + esc(x.result.output) + '\n[exit ' + x.result.exit_code + ']'; });
      p.innerHTML = tabs + '<div class="pbody"><div class="term" style="margin:12px;max-height:none" id="terminal">' + (lines.join('\n\n') || 'No commands yet') + '</div></div>';
    }
  }
  function settingsView() {
    var c = S.cfg || { keys: {} };
    if (!S.conn) loadConn();
    var secs = [['s-look', 'Appearance'], ['s-keys', 'Models'], ['s-apps', 'Apps'], ['s-notify', 'Notifications'], ['s-deploy', 'Deploy'], ['s-mode', 'Run mode'], ['s-data', 'Data'], ['s-about', 'About']];
    return '<div class="settings"><div class="shero"><h2>Settings</h2><p>Everything stays on this ' + (c.mode === 'cloud' ? 'workspace' : 'device') + ' unless you connect it.</p></div>' +
      '<nav class="snav" aria-label="Settings sections">' + secs.map(function (x) { return '<button class="chip" data-act="sjump" data-t="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</nav>' +
      (AUTH && AUTH.enabled ? AUTH.settingsCard() : '') +
      '<h3 id="s-look">Appearance</h3>' +
      '<div class="row"><span class="lbl">Theme</span><div class="seg" role="radiogroup" aria-label="Theme">' + THEMES.map(function (t) { return '<button role="radio" aria-checked="' + (prefs.theme === t) + '" data-act="pref" data-k="theme" data-v="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>'; }).join('') + '</div></div>' +
      '<div class="row"><span class="lbl">Density</span><div class="seg" role="radiogroup" aria-label="Density">' + ['compact', 'comfortable'].map(function (t) { return '<button role="radio" aria-checked="' + (prefs.density === t) + '" data-act="pref" data-k="density" data-v="' + t + '">' + t[0].toUpperCase() + t.slice(1) + '</button>'; }).join('') + '</div></div>' +
      '<div class="row" style="display:block"><span class="lbl">Interface font</span><small>Fallbacks cover every script worldwide.</small><div class="fontgrid" id="fontgrid">' + FONTS.map(function (f) {
        return '<button class="fopt ' + (prefs.uiFont === f.id ? 'on' : '') + '" data-act="pref" data-k="uiFont" data-v="' + esc(f.id) + '" aria-pressed="' + (prefs.uiFont === f.id) + '" style="font-family:' + (f.id === 'system-ui' ? 'system-ui' : "'" + esc(f.id) + "'") + ',system-ui"><span class="aa">Aa</span><b>' + esc(f.id === 'system-ui' ? 'System' : f.id) + '</b><small>' + esc(f.note) + '</small></button>'; }).join('') + '</div></div>' +
      '<div class="row"><span class="lbl">Code font</span><div class="seg" role="radiogroup" aria-label="Code font">' + MONO.map(function (f) { return '<button role="radio" aria-checked="' + (prefs.codeFont === f.id) + '" data-act="pref" data-k="codeFont" data-v="' + f.id + '" style="font-family:\'' + f.id + '\'">' + f.id + '</button>'; }).join('') + '</div></div>' +
      '<div class="row"><label for="size">Text size <small>' + prefs.size + ' px</small></label><input class="range" id="size" type="range" min="12" max="18" step="1" value="' + prefs.size + '"></div>' +
      '<div class="prev"><div class="k">Live preview</div><div>Plan ready: 4 steps, 3 files. Approve to start building.</div><div style="color:var(--faint)">Works in any language.</div><code style="color:var(--accent)">const ok = await agent.run(plan) // 0O 1lI</code></div>' +
      '<h3 id="s-keys">Free model keys (BYOK)</h3><p style="color:var(--muted);margin:0 0 6px">Keys stay on this ' + (c.mode === 'cloud' ? 'cloud workspace' : 'computer') + ' and are never shown again. Both are free to create.</p>' +
      [['nim', 'NVIDIA NIM · evaluation only', 'Trial-backed GLM 5.3 and DeepSeek routes are for evaluation, not public production candidates'], ['openrouter', 'OpenRouter', 'Existing :free models plus optional Laguna XS 2.1 and North Mini Code; strict zero-price/privacy filters, fail closed'], ['groq', 'Groq', 'console.groq.com: free-plan BYOK routes'], ['mistral', 'Mistral', 'console.mistral.ai: free-plan BYOK route'], ['cloudflare', 'Cloudflare Workers AI', 'Free 10,000 Neurons a day. Paste account id:token, for Nemotron 3.5 Lightning']].map(function (p) {
        return '<div class="row"><span><span class="lbl">' + p[1] + '</span><small>' + p[2] + '</small></span><span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + (c.keys[p[0]] ? '<span class="badge ok">Connected</span>' : '<span class="badge">Not set</span>') +
          '<input class="input" type="password" id="key-' + p[0] + '" placeholder="Paste key" autocomplete="off" aria-label="' + p[1] + ' key"><button class="btn" data-act="savekey" data-p="' + p[0] + '">Save</button></span></div>'; }).join('') +
      connSettings() + notifySettings() + '<span id="s-deploy"></span>' + integrationsSettings() +
      '<h3 id="s-mode">Run mode</h3><div class="row"><span><span class="lbl">Where code runs</span><small>Phone keeps files on this device. PC runs on your computer. Cloud runs in a hosted sandbox.</small></span><div class="seg">' + ['phone', 'pc', 'cloud'].map(function (m) { var dis = (m === 'pc' && c.mode === 'cloud') || (m === 'cloud' && c.mode !== 'cloud'); return '<button role="radio" aria-checked="' + (mode() === m) + '" data-act="mode" data-m="' + m + '"' + (dis ? ' disabled' : '') + '>' + (m === 'pc' ? 'PC' : m[0].toUpperCase() + m.slice(1)) + '</button>'; }).join('') + '</div></div>' +
      adsSettings() + dataSettings() +
      '<h3 id="s-about">About</h3><div class="row"><span><span class="lbl">Free way ' + esc(c.version || '') + '</span><small>Server mode: ' + esc(c.mode || '') + (c.mock ? ' · demo models' : '') + '. Built with patterns from Kilo Code and OpenCode (MIT), Emdash, Omnara and Codebuff (Apache-2.0). Fonts under SIL OFL-1.1.</small></span></div></div>';
  }
  // ---------- integrations: deploy hosts, GitHub App, research keys (values are never sent back) ----------
  function loadInteg() { if (S.integLoading) return; S.integLoading = true; api('/api/integrations').then(function (x) { S.integ = x; S.integLoading = false; if (S.view === 'settings' || (S.view === 'agent' && cur() && (cur().state === 'review' || cur().state === 'merged'))) render(); }, function () { S.integLoading = false; }); }
  var FIELD = { token: 'API token', account_id: 'Account ID', api_token: 'API token', deploy_hook: 'Deploy hook URL', app_id: 'App ID', private_key: 'Private key (.pem)', tavily: 'Tavily API key', jina: 'Jina API key' };
  function integRow(kind, title, note, fields) {
    var st = S.integ[kind] || { configured: false, fields: {} };
    return '<div class="row integ" data-kind="' + esc(kind) + '"><span><span class="lbl">' + esc(title) + '</span><small>' + esc(note) + '</small></span><span class="integf">' + (st.configured ? '<span class="badge ok">Connected</span>' : '<span class="badge">Not set</span>') +
      fields.map(function (f) { return f === 'private_key' ? '<textarea class="input mono" rows="2" id="ig-' + esc(kind) + '-' + f + '" placeholder="' + FIELD[f] + '" aria-label="' + esc(title) + ' ' + FIELD[f] + '"></textarea>' : '<input class="input" type="password" autocomplete="off" id="ig-' + esc(kind) + '-' + f + '" placeholder="' + (st.fields[f] ? 'Saved. Paste to replace' : FIELD[f]) + '" aria-label="' + esc(title) + ' ' + FIELD[f] + '">'; }).join('') +
      '<button class="btn" data-act="saveinteg" data-k="' + esc(kind) + '">Save</button>' + (st.configured ? '<button class="btn ghost" data-act="clearinteg" data-k="' + esc(kind) + '">Remove</button>' : '') + '</span></div>';
  }
  function integrationsSettings() {
    if (!S.integ) { loadInteg(); return '<h3>Deploy, GitHub and research</h3><div class="row"><span class="spin"></span></div>'; }
    var hosts = S.integ.hosts, order = ['cloudflare', 'github', 'netlify', 'vercel', 'render'];
    return '<h3>One-click deploy</h3><p style="color:var(--muted);margin:0 0 6px">Use your own free accounts. Tokens stay on this ' + ((S.cfg && S.cfg.mode === 'cloud') ? 'workspace' : 'computer') + ' and are never shown again.</p>' +
      order.map(function (h) { return integRow('deploy:' + h, hosts[h].name, hosts[h].note, hosts[h].fields); }).join('') +
      '<h3>GitHub cloud agent</h3><p style="color:var(--muted);margin:0 0 6px">Create your own GitHub App (Contents and Pull requests: read and write), install it on your repos, then paste its App ID and private key. Free way imports a repo, works on a branch and opens a pull request.</p>' +
      integRow('github_app', 'Your GitHub App', 'github.com/settings/apps/new', ['app_id', 'private_key']) +
      (S.integ.github_app.configured ? '<div class="row"><span><span class="lbl">Import a repository</span><small>owner/name. Agents then work on it from Home.</small></span><span class="integf"><input class="input mono" id="ghrepo" placeholder="owner/repo" aria-label="Repository"><button class="btn" data-act="ghimport" id="ghimport">Import</button></span></div>' : '') +
      '<h3>Research</h3><p style="color:var(--muted);margin:0 0 6px">Research mode searches with Tavily (free 1,000 searches a month) and reads pages with Jina Reader. Without a Tavily key it falls back to DuckDuckGo instant answers.</p>' +
      integRow('search', 'Search and reader keys', 'Both optional: app.tavily.com, jina.ai', ['tavily', 'jina']);
  }
  // ---------- chat and research ----------
  function chatView() {
    var C = S.chat;
    var empty = '<div class="cempty"><div class="orb sm" aria-hidden="true"></div><b>' + (C.mode === 'research' ? 'Research with sources' : 'Ask anything') + '</b><p>' + (C.mode === 'research' ? 'Free way searches the web, reads the top pages and cites them.' : 'Drop in a file, a PDF or a zip and ask about it. Mention an app, like @github, to search it.') + '</p><div class="chips">' +
      (C.mode === 'research' ? ['What is the newest stable Node.js LTS?', 'Compare SQLite and Postgres for a small app'] : ['Explain CSS grid like I am new to it', 'Review this file for bugs', '@github what is open on my repos?']).map(function (t) { return '<button class="chip" data-act="chatchip" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>';
    return '<div class="chatwrap"><section class="chatv"><div class="thead"><h2>' + (C.mode === 'research' ? 'Research' : 'Chat') + '</h2><div class="seg" role="radiogroup" aria-label="Chat mode">' +
      [['chat', 'Chat'], ['research', 'Research']].map(function (m) { return '<button role="radio" aria-checked="' + (C.mode === m[0]) + '" data-act="chatmode" data-m="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div><span class="grow"></span>' +
      '<button class="ib" data-act="chatexport" id="chatexport" aria-label="Export chat as Markdown" title="Export as Markdown"' + (C.msgs.length ? '' : ' disabled') + '>' + I.dl + '</button><button class="ib" data-act="chatnew" aria-label="New chat" title="New chat">' + I.plan + '</button></div>' +
      '<div class="msgs" id="chatmsgs" aria-live="polite">' + (C.msgs.map(function (m) {
        if (m.role === 'user') {
          return '<div class="msg user">' + fmt(m.content || '') + (m.files && m.files.length ? '<div class="pfiles">' + m.files.map(function (f) { return '<span class="fchip mini"><span class="fk k-' + esc(f.kind) + '">' + (KIND[f.kind] || 'FILE') + '</span><span class="fn"><b>' + esc(f.name) + '</b><small>' + fsize(f.size) + '</small></span></span>'; }).join('') + '</div>' : '') + '</div><div class="msg-time">' + esc(fmtTime(m.at)) + '</div>';
        }
        var wsec = m.workedSec || Math.max(1, Math.round(((m.route && m.route.ms) || 5000) / 1000));
        return '<div class="msg bot' + (m.error ? ' err' : '') + '">' +
          '<div class="worked-line">Worked for ' + wsec + 's ›</div>' +
          '<div class="msg-body">' + fmt(m.content || '') + '</div>' +
          (m.files && m.files.length ? '<div class="pfiles">' + m.files.map(function (f) { return '<span class="fchip mini"><span class="fk k-' + esc(f.kind) + '">' + (KIND[f.kind] || 'FILE') + '</span><span class="fn"><b>' + esc(f.name) + '</b><small>' + fsize(f.size) + '</small></span></span>'; }).join('') + '</div>' : '') +
          (m.sources && m.sources.length ? '<ol class="sources">' + m.sources.map(function (x) { return '<li value="' + x.n + '"><a href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a> <small class="mono">' + esc(x.url.replace(/^https?:\/\//, '').slice(0, 60)) + '</small></li>'; }).join('') + '</ol>' : '') +
          (m.items && m.items.length ? '<div class="citems">' + m.items.slice(0, 6).map(function (it) { return '<span class="citem">' + cicon(it.connector) + '<span><b>' + esc(it.title || it.id) + '</b><small>' + esc((it.snippet || '').slice(0, 90)) + '</small></span></span>'; }).join('') + '</div>' : '') +
          (m.route ? '<small class="nt">' + esc(m.route.provider === 'local' ? 'Instant reply' : modelName(m.route.brand)) + (m.route.ms ? ' · ' + (m.route.ms / 1000).toFixed(1) + ' s' : '') + (m.search ? ' · ' + esc(m.search) : '') + '</small>' : '') +
          (m.build ? '<button type="button" class="btn primary sm" data-act="buildthis" data-t="' + esc(m.build) + '">Build this with an agent</button>' : '') +
          '<div class="msg-foot"><button type="button" class="feedback-btn" data-act="feedback">' + I.chat + '<span>Give feedback</span></button></div>' +
          '</div>';
      }).join('') || empty) +
      (C.busy ? '<div class="msg bot"><span class="typing" aria-label="Working"><i></i><i></i><i></i></span> ' + (C.mode === 'research' ? 'Searching and reading sources' : 'Thinking') + '</div>' : '') + '</div>' +
      '<form class="composer" id="chatform" autocomplete="off">' + (S.cfiles.length ? '<div class="attachrow">' + fileChips() + '</div>' : '') + '<textarea id="chatin" rows="2" placeholder="' + (C.mode === 'research' ? 'Ask a research question...' : 'Message Free way Chat. Drop files here.') + '" aria-label="Message"></textarea><div class="crow">' +
      '<input type="file" id="chatfile" multiple hidden>' + segHTML() + '<button type="button" class="ib attach" data-act="chatattach" aria-label="Attach files" title="Attach files">' + I.clip + '</button>' +
      '<button type="button" class="chip" data-act="models" aria-haspopup="dialog">' + I.route + esc(modelName(S.model)) + I.down + '</button><span class="grow"></span>' +
      '<button class="send" id="chatsend" type="submit" aria-label="Send"' + (C.busy ? ' disabled' : '') + '>' + I.send + '</button></div></form></section></div>';
  }
  function fmt(t) { return esc(t).replace(/```([\s\S]*?)```/g, function (_, c) { return '<pre class="code">' + c.replace(/^[a-z]*<br>|^[a-z]*\n/, '') + '</pre>'; }).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[(\d+)\]/g, '<sup>[$1]</sup>').replace(/\n/g, '<br>'); }
  function bindChat() {
    var hs = $('#hsearch'); if (hs) hs.addEventListener('input', function () { S.hq = hs.value; var pos = hs.selectionStart; var h = $('#hist'); var tmp = document.createElement('div'); tmp.innerHTML = chatHistory(); h.replaceWith(tmp.firstChild); var n = $('#hsearch'); n.focus(); n.setSelectionRange(pos, pos); bindChat.h = 1; });
    var f = $('#chatform'); if (!f) return; var t = $('#chatin'); var ms = $('#chatmsgs'); if (ms) ms.scrollTop = ms.scrollHeight;
    dropzone(f); var cf = $('#chatfile'); if (cf) cf.addEventListener('change', function () { addFiles(cf.files); cf.value = ''; });
    t.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && innerWidth > 760) { e.preventDefault(); f.requestSubmit(); } });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var v = t.value.trim(); if (!v || S.chat.busy) return;
      var files = readyFiles(); if (!files) return; chatAsk(v, files);
    });
  }
  var BUILD_RE = /\b(make|build|create|develop|code|design)\b[\s\S]{0,60}\b(website|web ?site|app|page|site|game|api|dashboard|landing|portfolio|store|bot)\b/i;
  function chatAsk(v, files) {
      var C = S.chat, historyGeneration = chatHistoryGeneration; files = files || [];
      var priorGreets = C.msgs.filter(function (m) { return m.role === 'user' && isChitChat(m.content) && !isIdentity(m.content); }).length;
      C.msgs.push({ role: 'user', content: v, at: Date.now(), files: files.map(function (x) { return { name: x.name, kind: x.kind, size: x.size }; }) }); C.busy = true; S.cfiles = []; render(); storeChat();
      var requestBody = { mode: C.mode, model: S.model, files: files.length ? files : undefined, messages: C.msgs.filter(function (m) { return !(m.role === 'assistant' && m.error); }).map(function (m) { return { role: m.role, content: m.content }; }) };
      var streamed = '', streamNode = null;
      function onDelta(text) {
        streamed += text;
        if (S.chat !== C || S.view !== 'chat') return;
        var list = $('#chatmsgs'); if (!list) return;
        if (!streamNode) {
          var typing = list.querySelector('.typing'); if (typing && typing.closest('.msg')) typing.closest('.msg').remove();
          streamNode = document.createElement('div'); streamNode.className = 'msg bot'; list.appendChild(streamNode);
        }
        streamNode.innerHTML = fmt(streamed); list.scrollTop = list.scrollHeight;
      }
      chatStream(requestBody, onDelta).catch(function (er) {
        if (er && er.unsupportedStream && !streamed) return api('/api/chat', { body: requestBody });
        throw er;
      })
        .then(function (r) {
            if (!r || typeof r.reply !== 'string' || !r.reply.trim()) throw new Error('No reply came back from the model. Please try again, or pick another model.');
            var rep = (C.mode === 'chat' && !files.length && (isChitChat(v) || isIdentity(v))) ? greetReply(v, priorGreets > 0) : r.reply;
            var wsec = isIdentity(v) ? 7 : (isChitChat(v) ? (priorGreets > 0 ? 5 : 10) : Math.max(1, Math.round(((r.route && r.route.ms) || 5000) / 1000)));
            C.msgs.push({ role: 'assistant', content: rep, workedSec: wsec, sources: r.sources, route: r.route, search: r.search, items: r.items, build: BUILD_RE.test(v) ? v : undefined }); })
        .catch(function (er) {
          var msg = (er && er.message) || 'Something went wrong. Please try again.';
          if (streamed) msg = streamed + '\n\nResponse interrupted: ' + msg;
          C.msgs.push({ role: 'assistant', content: msg, error: true, build: BUILD_RE.test(v) ? v : undefined });
        })
        .then(function () {
          C.busy = false;
          if (historyGeneration === chatHistoryGeneration) storeChat(C);
          if (S.chat === C) {
            if (S.view === 'chat') {
              var input = $('#chatin'), draft = input ? input.value : '', focused = !!(input && document.activeElement === input);
              render(); var next = $('#chatin');
              if (next) { next.value = draft; if (focused) next.focus(); }
            }
          }
        });
  }
  // Greetings and small talk are not build tasks; sending them to an agent makes the model invent a placeholder app.
  var CHAT_WORDS = {}; 'hi hii hey hello hallo yo sup hiya howdy greetings thanks thank thx ty you ok okay k cool nice great good morning afternoon evening night bye goodbye cheers lol test testing ping there all how are is it going what\'s up whats wassup yes no yep nope sure hmm please'.split(' ').forEach(function (w) { CHAT_WORDS[w] = 1; });
  var IDENTITY_RE = /\b(who\s+(is|are)\s+your\s+(developer|creator|maker|author|builder|owner|team)s?|who\s+(made|built|created|developed|wrote|owns)\s+you|what\s+are\s+you|who\s+are\s+you|what\s+is\s+your\s+name|what's\s+your\s+name)\b/i;
  function isIdentity(t) { return IDENTITY_RE.test(t || ''); }
  function greetReply(t, repeat) {
    var w = (t || '').toLowerCase();
    if (isIdentity(w)) return "I'm Free way, the coding agent built into **Free way** \u2014 I run inside the Free way app and work on code in your project.";
    if (/\b(thanks|thank|thx|ty|cheers)\b/.test(w)) return 'You are welcome! What would you like to work on next?';
    if (/\b(bye|goodbye|night)\b/.test(w)) return 'See you soon. Your agents and chats are saved here when you come back.';
    if (repeat) return 'Hi again! What would you like to work on today?';
    return "Hi! I'm Free way, ready to help you with coding tasks in this project. What would you like to work on?";
  }
  function isChitChat(t) { if (isIdentity(t)) return true; var w = (t || '').toLowerCase().match(/[a-z']+/g); if (!w) return !/[0-9a-z]/i.test(t || ''); return w.length <= 4 && w.every(function (x) { return CHAT_WORDS[x]; }); }
  function bindApps() {
    var c = $('#csearch'); if (!c) return;
    c.addEventListener('input', function () { S.cq = c.value; var pos = c.selectionStart; render(); var n = $('#csearch'); n.focus(); n.setSelectionRange(pos, pos); });
  }
  // ---------- images: downscale on the device before upload ----------
  function addImages(files) {
    var left = 4 - S.images.length; files = [].slice.call(files || []).filter(function (f) { return /^image\/(png|jpeg|webp|gif)$/.test(f.type); }).slice(0, Math.max(0, left));
    if (!files.length) { if (left <= 0) toast('Attach at most 4 images'); return; }
    Promise.all(files.map(shrink)).then(function (urls) { S.images = S.images.concat(urls.filter(Boolean)); keepDraft(render); }, function () { toast('Could not read that image'); });
  }
  function shrink(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onerror = rej; r.onload = function () {
        var img = new Image(); img.onerror = rej; img.onload = function () {
          var k = Math.min(1, 1280 / Math.max(img.width, img.height)); if (k === 1 && file.size < 900000 && file.type !== 'image/gif') return res(r.result);
          var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85));
        }; img.src = r.result;
      }; r.readAsDataURL(file);
    });
  }
  function keepDraft(fn) { var t = $('#prompt'), v = t ? t.value : ''; fn(); var t2 = $('#prompt'); if (t2) { t2.value = v; t2.focus(); } }
  // ---------- slash commands ----------
  var SLASH = [['/plan', 'Think it through first, then plan'], ['/review', 'Code review of this agent\'s changes'], ['/interview', 'Answer 3 quick questions before planning']];
  function slashMenu(v) {
    var m = $('#slash'); if (!m) return; var q = /^\/[a-z]*$/.test(v) ? v : null;
    var items = q ? SLASH.filter(function (c) { return c[0].indexOf(q) === 0; }) : [];
    m.hidden = !items.length; m.innerHTML = items.map(function (c, i) { return '<button type="button" role="option" class="srow' + (i === 0 ? ' on' : '') + '" data-act="slash" data-c="' + c[0] + '"><b class="mono">' + c[0] + '</b><small>' + esc(c[1]) + '</small></button>'; }).join('');
  }
  function pickSlash(c) {
    var t = $('#prompt'); if (!t) return; var m = $('#slash'); if (m) m.hidden = true;
    if (c === '/review') { t.value = ''; return act('review', {}); }
    if (c === '/plan') { S.think = true; keepDraft(render); var t3 = $('#prompt'); t3.value = ''; return toast('Think first is on for the next task'); }
    t.value = '/interview '; t.focus();
  }
  function withContext(v) {
    if (!S.ctx) return v;
    return v + '\n\nSelected element in the preview: ' + S.ctx.selector + (S.ctx.text ? ' (text: "' + S.ctx.text + '")' : '') + '\n```html\n' + S.ctx.html + '\n```';
  }
  function interviewSheet(task) {
    sheet('<h4>A few quick questions</h4><div id="ivbody" style="margin:0 10px 10px"><span class="spin"></span> Preparing questions...</div>');
    api('/api/interview', { body: { prompt: task, model: S.model } }).then(function (r) {
      var b = $('#ivbody'); if (!b) return;
      b.innerHTML = '<form id="ivform">' + r.questions.map(function (q, i) { return '<label class="ivq" for="iv' + i + '">' + esc(q) + '</label><input class="input" id="iv' + i + '" placeholder="Your answer (optional)">'; }).join('') +
        '<div class="bar"><button type="button" class="btn" id="ivskip">Skip</button><button class="btn primary" id="ivgo">' + I.check + 'Plan with these answers</button></div></form>';
      var go2 = function (useAnswers) {
        var extra = useAnswers ? r.questions.map(function (q, i) { var a2 = $('#iv' + i).value.trim(); return a2 ? 'Q: ' + q + '\nA: ' + a2 : ''; }).filter(Boolean).join('\n') : '';
        closeSheet(); start(task + (extra ? '\n\nAnswers to clarifying questions:\n' + extra : ''));
      };
      $('#ivform').onsubmit = function (e) { e.preventDefault(); go2(true); }; $('#ivskip').onclick = function () { go2(false); }; $('#iv0').focus();
    }, function (e) { closeSheet(); toast(e.message); });
  }
  // ---------- deploy sheet ----------
  function deploySheet(a) {
    if (!S.integ) { loadInteg(); return toast('Loading deploy settings...'); }
    var order = ['cloudflare', 'github', 'netlify', 'vercel', 'render'], H = S.integ.hosts;
    sheet('<h4>Deploy this version</h4><p style="color:var(--muted);margin:0 10px 10px">Publishes the files on this agent\'s branch. Free hosts first.</p><div id="dlist">' + order.map(function (h) {
      var ok = S.integ['deploy:' + h].configured;
      return '<button class="mrow' + (ok ? '' : ' dim') + '" data-host="' + h + '"><span class="mi">' + I.cloud + '</span><span class="mn"><b>' + esc(H[h].name) + '</b><small>' + esc(H[h].note) + '</small></span>' + (ok ? '<span class="badge ok">Ready</span>' : '<span class="badge">Set up</span>') + '</button>';
    }).join('') + '</div>');
    $('#dlist').onclick = function (e) {
      var r = e.target.closest('[data-host]'); if (!r) return; var h = r.dataset.host;
      if (!S.integ['deploy:' + h].configured) { closeSheet(); go('settings'); return toast('Add your ' + H[h].name + ' token first'); }
      $('#dlist').innerHTML = '<div style="margin:0 10px 10px"><span class="spin"></span> Deploying to ' + esc(H[h].name) + '...</div>';
      api('/api/agents/' + a.id + '/deploy', { body: { host: h } }).then(function (x) { upsert(x); closeSheet(); render(); var d = x.deploys[x.deploys.length - 1]; toast(d.url ? 'Live at ' + d.url : 'Deploy started'); }, function (er) { closeSheet(); toast(er.message); });
    };
  }
  // ---------- ads (contextual by default; personalised only after explicit opt-in) ----------
  S.ads = {};
  function adPlacement() { return innerWidth < 760 ? 'phone' : 'chat'; }
  function adHTML(a) {
    if (!S.cfg || !S.cfg.ads) return '';          // build without the ads module
    var r = S.ads[a.id];
    if (r === undefined) { S.ads[a.id] = 'loading'; setTimeout(function () { loadAd(a); }, 0); }
    if (!r || r === 'loading' || !r.ad) return '<div class="adslot" id="adslot" hidden></div>';
    var x = r.ad;
    return '<aside class="adcard ' + esc(x.placement) + '" id="adcard" data-placement="' + esc(x.placement) + '" aria-label="Sponsored">' +
      '<div class="adtop"><span class="adlbl">Sponsored</span><span class="adv">' + esc(x.advertiser || '') + '</span><span class="grow"></span>' +
      '<button class="adbtn" data-act="adwhy" id="adwhy">Why this ad</button><button class="adbtn" data-act="adhide" id="adhide" aria-label="Hide this ad">' + I.x + '</button></div>' +
      '<a class="adlink" id="adlink" href="' + esc(x.url) + '" target="_blank" rel="sponsored noopener noreferrer">' + esc(x.title) + '</a>' +
      (x.text ? '<p class="adtext">' + esc(x.text) + '</p>' : '') + '</aside>';
  }
  function loadAd(a) {
    var body = a.mode === 'phone' ? { context: (a.prompt || '') + ' ' + ((a.plan && a.plan.summary) || ''), run: a.id, state: a.state, placement: adPlacement() } : { agent: a.id, placement: adPlacement() };
    api('/api/ads/next', { body: body }).then(function (r) {
      S.ads[a.id] = r; if (!r.ad || S.view !== 'agent' || S.agentId !== a.id) return;
      var slot = $('#adslot'); if (slot) { slot.outerHTML = adHTML(a); watchAd(a); }
    }).catch(function () { S.ads[a.id] = { ad: null }; });
  }
  function watchAd(a) {
    var el = $('#adcard'), r = a && S.ads[a.id]; if (!el || !r || !r.ad) return;
    var link = $('#adlink'); if (link) link.addEventListener('click', function () { adEvent(r, 'click'); });
    if (r.viewed) return;
    var fire = function () { if (r.viewed) return; r.viewed = true; adEvent(r, 'view'); };
    if (!('IntersectionObserver' in window)) return fire();
    var t, io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) t = setTimeout(function () { fire(); io.disconnect(); }, 1000); else clearTimeout(t); }); }, { threshold: 0.5 });
    io.observe(el);
  }
  function adEvent(r, kind) { if (kind === 'click') r.viewed = true; api('/api/ads/event', { body: { id: r.ad.id, sig: r.ad.sig, kind: kind } }).catch(function () {}); }
  function adsSettings() {
    if (!S.cfg || !S.cfg.ads) return '';
    var c = S.consent;
    if (!c) { api('/api/ads/consent').then(function (x) { S.consent = x; if (S.view === 'settings') render(); }).catch(function () {}); return '<h3>Ads and rewards</h3><div class="row"><span class="spin"></span></div>'; }
    var intro = c.available
      ? (c.benefits ? 'Explicit mock mode uses deterministic test ads and demo benefits only; these are not production rewards.' : 'A configured publisher may show a labelled ad. No credits or extra runs are promised by this service.')
      : 'No ad publisher is configured. No ads or rewards are served; you can still export or delete stored ad data.';
    var needsRenewal = !c.personalized && c.version && c.version !== c.current_version;
    var status = c.available
      ? (c.personalized ? 'On since ' + esc(new Date(c.at * 1000).toLocaleDateString()) + '. Interest categories: ' + esc(c.interests.length ? c.interests.join(', ').replace(/_/g, ' ') : 'none yet') + '.' : (needsRenewal ? 'Your previous consent is out of date. Personalised ads remain off until you review the updated notice.' : (c.benefits ? 'Off. Review the mock-only demo benefits before enabling test ads.' : 'Off. No bonus credits or extra runs are offered by this service.')))
      : (c.personalized ? 'Previously enabled, but no publisher is configured, so no ads or interest data are shared. Turn off to delete stored interests.' : 'Unavailable. No publisher is configured, so ads and rewards are not served.');
    var state = c.available ? (c.personalized ? 'On' : 'Off') : 'Unavailable';
    var action = c.personalized ? '<button class="btn" data-act="adoff" id="adoff">Turn off</button>' : (c.available ? '<button class="btn" data-act="adon" id="adon">Review and turn on</button>' : '');
    var credits = c.credits === null || c.credits === undefined ? '' : '<div class="row"><span><span class="lbl">Mock credits</span><small>Demo-only value; not purchasing power or a funded reward.</small></span><b id="credits">' + c.credits + '</b></div>';
    var revenue = c.available
      ? '<div class="row"><span><span class="lbl">Revenue</span><small>Owner dashboard for configured ad-service activity.</small></span><button class="btn" data-go="revenue" id="gorevenue">Open dashboard</button></div>'
      : '<div class="row"><span><span class="lbl">Revenue</span><small>Unavailable until an ad publisher is configured.</small></span><span class="badge">Unavailable</span></div>';
    return '<h3>Ads and rewards</h3><p style="color:var(--muted);margin:0 0 6px">' + intro + '</p>' +
      '<div class="row" id="adconsent"><span><span class="lbl">Personalised ads</span><small>' + status + (c.gpc ? ' Your browser sends Global Privacy Control, so interests are not shared.' : '') + '</small></span>' +
      '<span style="display:flex;gap:8px;align-items:center"><span class="badge ' + (c.available && c.personalized ? 'ok' : '') + '" id="adstate">' + state + '</span>' + action + '</span></div>' + credits +
      '<div class="row"><span><span class="lbl">Your ad data</span><small>Interest categories and ad counts only. No prompts, code or contact details.</small></span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="adexport" id="adexport">Download</button><button class="btn ghost danger" data-act="aderase" id="aderase">Delete</button></span></div>' + revenue;
  }
  function consentSheet() {
    var c = S.consent;
    if (!c || !c.available) {
      sheet('<h4>Personalised ads unavailable</h4><div class="consent" id="consenttext"><p>' + esc(c ? c.text : 'No ad publisher is configured. No ads or rewards are available.') + '</p></div><div class="bar eq" style="margin:0 10px 6px"><button class="btn" id="cs-no">Close</button></div>');
      $('#cs-no').onclick = closeSheet;
      return;
    }
    var benefits = c.benefits
      ? '<ul><li>' + c.benefits.bonus_credits + ' mock demo credits once (not real purchasing power)</li><li>' + c.benefits.bonus_daily_runs + ' mock extra runs in test mode only</li><li>Test offers from deterministic mock inventory</li></ul>'
      : '<ul><li>No bonus credits or extra runs are offered by this service.</li></ul>';
    sheet('<h4>Personalised ads</h4><div class="consent" id="consenttext"><p>' + esc(c.text) + '</p>' + benefits + '<p class="fine">Shared with the configured publisher: up to 5 interest categories, such as hosting or testing. Never shared: prompts, code, files, email, contacts. Consent version ' + esc(c.current_version) + '.</p></div>' +
      '<div class="bar eq" style="margin:0 10px 6px"><button class="btn" id="cs-no">Not now</button><button class="btn" id="cs-yes">Turn on personalised ads</button></div>');
    $('#cs-no').onclick = closeSheet;
    $('#cs-yes').onclick = function () { api('/api/ads/consent', { body: { personalized: true, version: c.current_version } }).then(function (x) { S.consent = x; closeSheet(); render(); toast('Personalised ads on.'); }).catch(function (e) { toast(e.message); }); };
  }
  function money(v) { return '$' + Number(v || 0).toFixed(v >= 100 ? 0 : 2); }
  function revenueView() {
    var d = S.rev;
    if (!d) { api('/api/admin/revenue').then(function (x) { S.rev = x; if (S.view === 'revenue') render(); }).catch(function (e) { toast(e.message); }); return '<div class="settings"><h2>Revenue</h2><span class="spin"></span></div>'; }
    if (d.available === false) return '<div class="settings revenue"><h2>Revenue</h2><p style="color:var(--muted)">' + esc(d.reason || 'Revenue is unavailable until an ad publisher is configured.') + '</p></div>';
    var pct = d.pool_target_usd ? Math.min(100, Math.round(d.pool_usd / d.pool_target_usd * 100)) : 100;
    var stat = function (k, v, id) { return '<div class="stat card" id="' + id + '"><small>' + k + '</small><b>' + v + '</b></div>'; };
    return '<div class="settings revenue"><h2>Revenue</h2><p style="color:var(--muted);margin:0">' + (d.network_configured && d.network !== 'mock' ? 'Network: ' + esc(d.network) + '.' : 'Demo demand: no ad network account is connected yet, so these numbers come from the mock adapter.') + '</p>' +
      '<div class="stats">' + stat('Ad revenue', money(d.revenue_usd), 'st-rev') + stat('Impressions', d.impressions, 'st-imp') + stat('Clicks', d.clicks + ' <small>' + (d.ctr * 100).toFixed(1) + '% CTR</small>', 'st-clk') + stat('eCPM', money(d.ecpm_usd), 'st-ecpm') + '</div>' +
      '<div class="card pool" id="poolcard"><div class="k">Model-cost pool</div><div class="meter" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Pool funded"><i style="width:' + pct + '%"></i></div>' +
      '<p><b id="poolbal">' + money(d.pool_usd) + '</b> of ' + money(d.pool_target_usd) + ' target. Spent on models: ' + money(d.model_spend_usd) + '.</p></div>' +
      '<div class="card" id="profitcard"><div class="k">Profit account</div><p><b id="profitbal">' + money(d.profit_usd) + '</b></p><small style="color:var(--muted)">Revenue fills the model-cost pool to its target first. Above the target, ' + Math.round(d.config.surplus_pool_share * 100) + '% still goes to the pool and the rest to profit.</small></div>' +
      '<h3>Split and frequency</h3>' +
      [['pool_target_usd', 'Pool target (USD)', d.config.pool_target_usd, 1], ['surplus_pool_share', 'Surplus share to pool (0 to 1)', d.config.surplus_pool_share, 0.05], ['min_gap_s', 'Minimum seconds between ads', d.config.min_gap_s, 10], ['max_per_day', 'Ads per user per day', d.config.max_per_day, 1]].map(function (f) {
        return '<div class="row"><label for="cfg-' + f[0] + '">' + f[1] + '</label><input class="input" type="number" step="' + f[3] + '" min="0" id="cfg-' + f[0] + '" value="' + f[2] + '" style="width:120px"></div>'; }).join('') +
      '<div class="bar"><button class="btn primary" data-act="revsave" id="revsave">Save</button></div>' +
      '<h3>Daily</h3><table class="tbl" id="revdays"><thead><tr><th>Day (UTC+7)</th><th>Revenue</th><th>Impressions</th><th>Clicks</th><th>Model spend</th></tr></thead><tbody>' +
      (d.days.length ? d.days.map(function (r) { return '<tr><td>' + esc(r.day) + '</td><td>' + money(r.revenue) + '</td><td>' + r.impressions + '</td><td>' + r.clicks + '</td><td>' + money(r.spend) + '</td></tr>'; }).join('') : '<tr><td colspan="5" style="color:var(--muted)">No ad activity yet.</td></tr>') +
      '</tbody></table><p style="color:var(--muted)">Opted in to personalised ads: ' + d.opted_in_users + ' of ' + d.users + ' users.</p></div>';
  }
  function bindComposer() {
    var sz = $('#size'); if (sz) sz.addEventListener('input', function () { setPref('size', +sz.value); var l = sz.parentNode.querySelector('small'); if (l) l.textContent = sz.value + ' px'; });
    var f = $('#cform'); if (!f) return; var t = $('#prompt');
    t.addEventListener('keydown', function (e) {
      var sm = $('#slash');
      if (sm && !sm.hidden && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); var first = sm.querySelector('[data-c]'); if (first) pickSlash(first.dataset.c); return; }
      if (e.key === 'Escape' && sm && !sm.hidden) { sm.hidden = true; return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (!e.shiftKey && innerWidth > 760))) { e.preventDefault(); f.requestSubmit(); }
    });
    t.addEventListener('input', function () { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 240) + 'px'; slashMenu(t.value); });
    var fi = $('#imgfile'); if (fi) fi.addEventListener('change', function () { addFiles(fi.files); fi.value = ''; });
    dropzone(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var v = t.value.trim(); if (!v || S.busy) return;
      var m = v.match(/^\/(plan|review|interview)\b\s*([\s\S]*)$/);
      if (m && m[1] === 'review') { t.value = ''; return act('review', {}); }
      if (m && m[1] === 'plan') { if (!m[2].trim()) { S.think = true; t.value = ''; return keepDraft(render); } S.think = true; v = m[2].trim(); }
      if (m && m[1] === 'interview') { if (!m[2].trim()) return toast('Describe the task after /interview'); t.value = ''; return interviewSheet(withContext(m[2].trim())); }
      t.value = ''; start(withContext(v));
    });
  }
  function start(prompt) {
    if (curMode() === 'mission' && mode() === 'phone') {
      var draft = $('#prompt') && $('#prompt').value;
      S.missionServerRequired = true; render();
      var restored = $('#prompt'); if (restored) { restored.value = draft || ''; restored.focus(); }
      return;
    }
    S.missionServerRequired = false;
    if (S.view === 'home' && isChitChat(prompt) && !S.images.length && !S.files.length) {
      storeChat(); S.chat = { mode: 'chat', msgs: [], busy: false }; S.chat.msgs.push({ role: 'user', content: prompt, at: Date.now() }, { role: 'assistant', content: greetReply(prompt, false), workedSec: isIdentity(prompt) ? 7 : 10 }); storeChat(); go('chat'); return;
    }
    S.busy = true; $('#send') && ($('#send').disabled = true);
    var files = readyFiles(); if (!files) { S.busy = false; $('#send') && ($('#send').disabled = false); return; }
    var opts = { images: S.images.length ? S.images.slice() : null, think: S.think, mission: curMode() === 'mission', files: files.length ? files : null };
    if (opts.images) toast('Reading ' + opts.images.length + ' image' + (opts.images.length > 1 ? 's' : '') + ' with a free vision model...');
    B().create(prompt, S.model, opts).then(function (a) { S.busy = false; S.images = []; S.files = []; S.ctx = null; S.think = false; S.cmode = null; upsert(a); S.previewPage = 'index.html'; go('agent', a.id); poll(a.id); })
      .catch(function (e) { S.busy = false; toast(e.message); render(); });
  }
  function upsert(a) { var i = S.agents.findIndex(function (x) { return x.id === a.id; }); if (i >= 0) { notifyChange(S.agents[i], a); S.agents[i] = a; } else S.agents.unshift(a); }
  var LIVE = { planning: 1, working: 1, fixing: 1 }; S.polling = S.polling || {};
  function poll(id) {
    // Follows a run until it settles; survives disconnects (rapi retries) and resumes from the last seen step.
    var a = S.agents.filter(function (x) { return x.id === id; })[0];
    if (!a || !LIVE[a.state] || S.polling[id]) return; S.polling[id] = 1;
    (function tick() {
      setTimeout(function () {
        var cur0 = S.agents.filter(function (x) { return x.id === id; })[0];
        B().get(id, cur0 && cur0.seq).then(function (b) {
          var changed = !cur0 || b.seq !== cur0.seq || b.state !== cur0.state; upsert(b);
          if (changed && S.agentId === id) render();
          if (LIVE[b.state]) tick(); else delete S.polling[id];
        }, function () { delete S.polling[id]; });
      }, 600);
    })();
  }
  function refresh() { return B().list().then(function (l) { S.agents = l; l.forEach(function (a) { if (LIVE[a.state]) poll(a.id); }); }).catch(function () { S.agents = []; }); }
  function act(k, d) {
    var a = cur(), b = B(), done = function (x) { upsert(x); render(); poll(x.id); }, fail = function (e) { toast(e.message); };
    if (k === 'chip') { var t = $('#prompt'); t.value = d.t; t.focus(); return; }
    if (k === 'follow') { var tf = $('#prompt'); if (tf) { tf.value = d.t; tf.focus(); } return; }
    if (k === 'attach') { var fi = $('#imgfile'); if (fi) fi.click(); return; }
    if (k === 'chatattach') { var cfi = $('#chatfile'); if (cfi) cfi.click(); return; }
    if (k === 'chatchip') { var ci = $('#chatin'); if (ci) { ci.value = d.t; ci.focus(); } return; }
    if (k === 'histtoggle') { S.showHist = !S.showHist; render(); return; }
    if (k === 'unfile') { FL().splice(+d.i, 1); keepDraft(render); return; }
    if (k === 'cgroup') { S.cgroup = d.g; render(); return; }
    if (k === 'cmanage') return connSheet(d.id);
    if (k === 'dreview') return approveSendSheet(d.id);
    if (k === 'ddiscard') return api('/api/drafts/' + d.id + '/discard', { body: {} }).then(function () { S.conn = null; loadConn(); toast('Draft discarded'); }, fail);
    if (k === 'buildthis') { S.cmode = 'build'; S.think = false; go('home'); return start(d.t); }
    if (k === 'chatnew') { storeChat(); S.chat = { mode: S.chat.mode, msgs: [], busy: false }; storageRemove('fc.chat.active'); history.replaceState(null, '', location.pathname + '#chat'); S.hq = ''; render(); return; }
    if (k === 'chatopen') { S.showHist = false; storeChat(); var cc = CH.list.filter(function (x) { return x.id === d.id; })[0]; if (cc) S.chat = { id: cc.id, mode: cc.mode || 'chat', msgs: cc.msgs.slice(), busy: false }; if (S.view !== 'chat') go('chat'); else render(); return; }
    if (k === 'palette') { palette(); return; }
    if (k === 'profile') { go('settings'); return; }
    if (k === 'toggleside') { S.hideSide = !S.hideSide; render(); return; }
    if (k === 'sidemore') { S.sideAll = !S.sideAll; renderSide(); return; }
    if (k === 'feedback') { toast('Thanks for your feedback'); return; }
    if (k === 'dailyhours') { toast('Daily free allowance: 5 hrs remaining today'); return; }
    if (k === 'wallet') { toast('Wallet balance: 4 hrs bonus compute'); return; }
    if (k === 'upgrade') { go('settings'); return; }
    if (k === 'navback') { history.back(); return; }
    if (k === 'navfwd') { history.forward(); return; }
    if (k === 'closetab') { if (d.kind === 'agent') { S.agentId = null; go('home', null); } else { storeChat(); S.chat = { mode: 'chat', msgs: [], busy: false }; go('home', null); } return; }
    if (k === 'chatexport') { if (!S.chat.msgs.length) return; storeChat(); download('freeway-chat-' + slug(S.chat.msgs[0].content) + '.md', chatMarkdown(S.chat)); return toast('Chat exported'); }
    if (k === 'agentexport') { if (a) { download('freeway-' + slug(a.title) + '.md', agentMarkdown(a)); toast('Agent exported'); } return; }
    if (k === 'exportall') { download('freeway-export.json', JSON.stringify({ exported: new Date().toISOString(), agents: S.agents, chats: CH.list }, null, 2), 'application/json'); return toast('Exported ' + S.agents.length + ' agents and ' + CH.list.length + ' chats'); }
    if (k === 'clearchats') return confirmSheet('Clear chat history?', 'Deletes the ' + CH.list.length + ' saved chats on this device. Agents are not affected.', 'Clear', function () { chatHistoryGeneration++; CH.list = []; saveChats(); S.chat = { mode: S.chat.mode, msgs: [], busy: false }; render(); toast('Chat history cleared'); });
    if (k === 'notify') {
      if (d.v === '1' && 'Notification' in window && Notification.permission !== 'granted') { Notification.requestPermission().then(function (pm) { setPref('notify', pm === 'granted'); render(); toast(pm === 'granted' ? 'Notifications on' : 'Notifications were not allowed'); }); return; }
      setPref('notify', d.v === '1'); render(); toast(d.v === '1' ? 'Notifications on' : 'Notifications off'); return;
    }
    if (k === 'sjump') { var se = document.getElementById(d.t); if (se) se.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (k === 'unimg') { S.images.splice(+d.i, 1); keepDraft(render); return; }
    if (k === 'unctx') { S.ctx = null; keepDraft(render); return; }
    if (k === 'cmode') {
      if (d.m === 'skills') return skillSheet();
      S.missionServerRequired = false;
      S.cmode = d.m; S.think = d.m !== 'build';
      if (S.view === 'chat' && d.m !== 'skills') { var cv = ($('#chatin') || {}).value || ''; go('home'); setTimeout(function () { var p = $('#prompt'); if (p && cv) p.value = cv; if (p) p.focus(); }, 0); toast(d.m === 'mission' ? 'Mission: describe the long goal' : 'Agent mode: ' + d.m); return; }
      keepDraft(render); return; }
    if (k === 'useskill') { var sk = skillList()[+d.i], inp = composerInput(); closeSheet(); if (inp && sk) { inp.value = (inp.value ? inp.value + '\n' : '') + sk[1]; inp.focus(); } return; }
    if (k === 'saveskill') { var ci = composerInput(), tx = ci && ci.value.trim(); if (!tx) return toast('Type the prompt first'); var mine = JSON.parse(storageGet('fc.skills') || '[]'); mine.push([tx.slice(0, 40), tx]); storageSet('fc.skills', JSON.stringify(mine)); closeSheet(); return toast('Skill saved'); }
    if (k === 'think') { S.think = true; S.cmode = 'plan'; keepDraft(render); return; }
    if (k === 'nothink') { S.think = false; S.cmode = 'build'; keepDraft(render); return; }
    if (k === 'slash') { pickSlash(d.c); return; }
    if (k === 'ppick') { S.picking = !S.picking; if (S.picking && innerWidth < 760 && S.view !== 'preview') go('preview'); else renderPane(); return; }
    if (k === 'chatmode') { S.chat.mode = d.m; render(); return; }
    if (k === 'chatclear_legacy') { S.chat.msgs = []; render(); return; }
    if (k === 'project' || k === 'pickproj') { S.project = d.p || 'demo'; storageSet('fc.project', S.project); closeSheet(); render(); return; }
    if (k === 'projmenu') { projMenuSheet(S.actEl); return; }
    if (k === 'branchmenu') { branchMenuSheet(S.actEl); return; }
    if (k === 'modemenu') { modeMenuSheet(S.actEl); return; }
    if (k === 'pickbranch') { closeSheet(); if (d.aid) go('agent', d.aid); else go('home', null); return; }
    if (k === 'pickmode') { closeSheet(); act('mode', { m: d.m }); return; }
    if (k === 'projchat') { closeSheet(); S.chat.mode = 'chat'; go('chat'); return; }
    if (k === 'projnew') { newProjectSheet(); return; }
    if (k === 'projfolder') { openFolderSheet(); return; }
    if (k === 'ghsheet') { githubImportSheet(); return; }
    if (k === 'projtpl') { templateSheet(); return; }
    if (k === 'saveinteg' || k === 'clearinteg') {
      var vals = null;
      if (k === 'saveinteg') { vals = {}; document.querySelectorAll('[id^="ig-' + d.k + '-"]').forEach(function (el) { var v2 = el.value.trim(); if (v2) vals[el.id.slice(('ig-' + d.k + '-').length)] = v2; }); if (!Object.keys(vals).length) return toast('Paste a value first'); }
      return api('/api/integrations', { body: { kind: d.k, values: vals } }).then(function (x) { S.integ = x; render(); toast(k === 'saveinteg' ? 'Saved' : 'Removed'); }, fail);
    }
    if (k === 'ghimport') { var rp = $('#ghrepo').value.trim(); if (!rp) return toast('Enter owner/repo'); toast('Importing ' + rp + '...');
      return api('/api/github/import', { body: { repo: rp } }).then(function (x) { S.project = x.project; storageSet('fc.project', x.project); toast('Imported. New agents work on ' + x.repo); go('home'); }, fail); }
    if (k === 'models') return modelSheet(S.actEl);
    if (k === 'mode') { storageSet('fc.mode', d.m); refresh().then(function () { S.agentId = null; go(S.view === 'agent' ? 'home' : S.view); toast((d.m === 'pc' ? 'PC' : d.m[0].toUpperCase() + d.m.slice(1)) + ' mode'); }); return; }
    if (k === 'pref') { setPref(d.k, d.v); render(); return; }
    if (k === 'togglepane') { var ta = cur(); if (!ta) return; if (innerWidth < 760) return go('preview'); S.paneUser = S.paneUser || {}; S.paneUser[ta.id] = !paneOn(); render(); return; }
    if (k === 'pane') { S.pane = d.p; if (innerWidth < 760) go('preview'); else renderPane(); return; }
    if (k === 'dev') { S.device = d.d; renderPane(); return; }
    if (k === 'reload') { renderPane(); return; }
    if (k === 'pback' || k === 'pfwd') { var H = hist(a.id); H.i = Math.max(0, Math.min(H.list.length - 1, H.i + (k === 'pback' ? -1 : 1))); previewGo(a, H.list[H.i], false); return; }
    if (k === 'popen') { openPreview(a); return; }
    if (k === 'pcopy') { copyText(previewURL(a, S.previewPage)).then(function () { toast('Preview link copied'); }); return; }
    if (k === 'pshare') return b.share(a.id).then(function (r) {
      var u = location.origin + r.url + S.previewPage, when = new Date(r.expires * 1000);
      copyText(u); sheet('<h4>Live link ready</h4><p style="color:var(--muted);margin:0 10px 10px">Anyone with this link can view the preview (read-only) until ' + esc(when.toLocaleString()) + '. It was copied to your clipboard.</p><input class="input mono" id="sharelink" readonly value="' + esc(u) + '" style="margin:0 10px 10px;width:calc(100% - 20px)"><div class="bar" style="margin:0 10px 6px"><button class="btn primary" id="sh-done">Done</button></div>');
      $('#sh-done').onclick = closeSheet;
    }, fail);
    if (k === 'adon') return consentSheet();
    if (k === 'adoff') return api('/api/ads/consent', { body: { personalized: false } }).then(function (x) { S.consent = x; render(); toast('Personalised ads off. Your interest profile was deleted'); }, fail);
    if (k === 'adexport') return api('/api/ads/data').then(function (x) { var u = URL.createObjectURL(new Blob([JSON.stringify(x, null, 2)], { type: 'application/json' })), l = document.createElement('a'); l.href = u; l.download = 'freecode-ad-data.json'; l.click(); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); }, fail);
    if (k === 'aderase') {
      var eraseCopy = S.consent && S.consent.benefits
        ? 'This turns off personalised ads and deletes your interest profile and ad history. Any displayed mock credits are demo values, not real rewards.'
        : 'This turns off personalised ads and deletes your interest profile and ad history. No unfunded rewards are promised.';
      return confirmSheet('Delete your ad data?', eraseCopy, 'Delete', function () { api('/api/ads/data', { method: 'DELETE' }).then(function (x) { S.consent = x; render(); toast('Ad data deleted'); }, fail); });
    }
    if (k === 'revsave') { var cfg = {}; ['pool_target_usd', 'surplus_pool_share', 'min_gap_s', 'max_per_day'].forEach(function (f) { cfg[f] = Number($('#cfg-' + f).value); }); return api('/api/admin/revenue/config', { body: cfg }).then(function (x) { S.rev = x; render(); toast('Saved'); }, fail); }
    if (k === 'adhide') { if (a) { S.ads[a.id] = { ad: null, hidden: true }; render(); } return; }
    if (k === 'adwhy') { var r = a && S.ads[a.id]; if (r && r.ad) { sheet('<h4>Why this ad</h4><p style="color:var(--muted);margin:0 10px 12px" id="whytext">' + esc(r.ad.why) + ' Ads never change what the agent writes.</p><div class="bar" style="margin:0 10px 6px"><button class="btn" id="why-ok">Close</button><button class="btn" id="why-set">Ad settings</button></div>'); $('#why-ok').onclick = closeSheet; $('#why-set').onclick = function () { closeSheet(); go('settings'); }; } return; }
    if (k === 'savekey') { var v = $('#key-' + d.p).value.trim(); api('/api/keys', { body: { provider: d.p, key: v } }).then(function (keys) { if (S.cfg) S.cfg.keys = keys; toast('Key saved'); render(); }).catch(fail); return; }
    if (!a) { if (k === 'review') toast('Open an agent that is ready to merge, then use /review'); return; }
    if (k === 'review') {
      if (a.state !== 'review' && a.state !== 'merged') return toast('Review is available when the agent has finished building');
      S.reviewing = a.id; if (S.view !== 'agent') go('agent', a.id); else render();
      return b.review(a.id).then(function (x) { S.reviewing = null; upsert(x); render(); var rc = $('#reviewcard'); if (rc && rc.scrollIntoView) rc.scrollIntoView({ block: 'nearest' }); }, function (e) { S.reviewing = null; render(); fail(e); });
    }
    if (k === 'fixreview') { var tr = $('#prompt'); if (tr) { tr.value = 'Fix these review findings:\n' + a.review.findings.filter(function (f) { return f.severity !== 'info'; }).map(function (f) { return '- ' + f.file + (f.line ? ':' + f.line : '') + ': ' + f.message; }).join('\n'); tr.focus(); } return; }
    if (k === 'deploy') return deploySheet(a);
    if (k === 'pr') { toast('Pushing the branch and opening a pull request...'); return api('/api/agents/' + a.id + '/pr', { body: {} }).then(function (x) { upsert(x); render(); toast('Pull request #' + x.pr.number + ' opened'); }, fail); }
    if (k === 'approveplan') return b.approvePlan(a.id, 'ask').then(done, fail);
    if (k === 'approveall') return approveSheet(a);
    if (k === 'approvemilestone') {
      var pendingIndex = Number(d.index);
      if (!Number.isInteger(pendingIndex) || String(d.index) !== String(pendingIndex)) return toast('Mission approval index is missing. Refresh the agent before approving.');
      return b.approveMilestone(a.id, pendingIndex).then(function (x) {
        upsert(x); render(); poll(x.id);
        toast(x.state === 'review' ? 'Final milestone approved. Final review is ready; nothing was merged or deployed.' : 'Milestone ' + (pendingIndex + 1) + ' approved. The next plan still needs separate approval.');
      }, fail);
    }
    if (k === 'aa') return b.approveAction(a.id, +d.i).then(done, fail);
    if (k === 'ar') return b.rejectAction(a.id, +d.i).then(done, fail);
    if (k === 'reject') return b.reject(a.id).then(done, fail);
    if (k === 'merge') return b.merge(a.id).then(function (x) { done(x); toast('Merged to main'); }, fail);
    if (k === 'mergeoverride') return confirmSheet('Merge with failing checks?', 'The failing test stays failing on main. You can fix it later.', 'Merge anyway', function () { b.merge(a.id, true).then(function (x) { done(x); toast('Merged with failing checks'); }, fail); });
  }
  // ---------- sheets ----------
  function confirmSheet(title, body, okLabel, onOk) {
    sheet('<h4>' + esc(title) + '</h4><p style="color:var(--muted);margin:0 10px 12px">' + esc(body) + '</p><div class="bar" style="margin:0 10px 6px"><button class="btn" id="cf-cancel">Cancel</button><button class="btn danger" id="cf-ok">' + esc(okLabel) + '</button></div>');
    $('#cf-cancel').onclick = closeSheet; $('#cf-ok').onclick = function () { closeSheet(); onOk(); };
  }
  function sheet(html, cls) { var w = $('#sheet'); w.className = 'sheet-wrap' + (cls ? ' ' + cls + '-wrap' : ''); w.innerHTML = '<div class="sheet' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>'; w.hidden = false; w.onclick = function (e) { if (e.target === w) closeSheet(); }; }
  // Anchor the desktop popover to its chip: above when there is room, else below; left-aligned; clamped to the viewport.
  function placePop(pop, btn) {
    if (!pop) return; var st = pop.style;
    if (innerWidth <= 760 || !btn || !btn.isConnected) { st.left = st.top = st.bottom = st.maxHeight = ''; return; }
    var r = btn.getBoundingClientRect(), W = Math.min(320, innerWidth - 16), up = r.top - 16, down = innerHeight - r.bottom - 16;
    st.width = W + 'px'; st.right = 'auto'; st.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + 'px';
    if (up >= 420 || up >= down) { st.top = 'auto'; st.bottom = Math.max(8, innerHeight - r.top + 8) + 'px'; st.maxHeight = Math.max(160, Math.min(560, up)) + 'px'; pop.dataset.side = 'above'; }
    else { st.bottom = 'auto'; st.top = Math.min(innerHeight - 168, r.bottom + 8) + 'px'; st.maxHeight = Math.max(160, Math.min(560, down)) + 'px'; pop.dataset.side = 'below'; }
  }
  // Freebuff-style mode control, shared by every composer
  var CMODES = [['build', 'Build', 'Plan, approve, then build'], ['plan', 'Plan', 'Think through the approach first'], ['mission', 'Mission', 'A long goal: milestones run one by one, you approve each'], ['skills', 'Skills', 'Insert a saved skill or prompt']];
  var SKILLS0 = [['Landing page', 'Build a responsive landing page with hero, features, pricing and FAQ.'], ['Fix failing tests', 'Run the tests, find why they fail, and fix the code (not the tests).'], ['Add dark mode', 'Add a dark mode toggle that remembers the choice.'], ['Write tests', 'Add unit tests for the main logic and make them pass.'], ['Explain code', 'Explain how this project is structured and where the main logic lives.']];
  function curMode() { return S.cmode || (S.think ? 'plan' : 'build'); }
  function segHTML() {
    var m = curMode();
    return '<div class="seg cmode" role="radiogroup" aria-label="Mode">' + CMODES.map(function (c) {
      var id = c[0] === 'build' ? 'cbuild' : c[0] === 'plan' ? (S.think && m === 'plan' ? 'thinkchip' : 'cplan') : 'c' + c[0];
      return '<button type="button" role="radio" aria-checked="' + (c[0] === m && c[0] !== 'skills') + '" data-act="cmode" data-m="' + c[0] + '" id="' + id + '" title="' + c[2] + '">' + c[1] + '</button>'; }).join('') + '</div>';
  }
  function skillList() { try { return SKILLS0.concat(JSON.parse(storageGet('fc.skills') || '[]')); } catch (e) { return SKILLS0; } }
  function projMenuSheet(anchor) {
    var drawList = function () {
      var el = $('#projlist'); if (!el) return;
      var raw = (S.projects && S.projects.length) ? S.projects.slice() : ['demo'];
      if (raw.indexOf('demo') < 0) raw.unshift('demo');
      if (S.project && raw.indexOf(S.project) < 0) raw.push(S.project);
      var curP = S.project || 'demo';
      el.innerHTML = raw.map(function (pid) {
        var isCur = curP === pid, lbl = projLabel(pid);
        var sub = pid === 'demo' ? '~/.freecode/projects/default' : '~/.freecode/projects/' + pid;
        return '<button type="button" class="mrow pmrow projitem' + (isCur ? ' on' : '') + '" data-act="pickproj" data-p="' + esc(pid) + '" role="option" aria-selected="' + isCur + '">' +
          I.folder +
          '<span class="pmeta"><b>' + esc(lbl) + '</b><small class="mono">' + esc(sub) + '</small></span>' +
          (isCur ? '<span class="pcheck">' + I.check + '</span>' : '') +
        '</button>';
      }).join('');
    };
    sheet(
      '<div class="pmenu" id="projmenu">' +
        '<button type="button" class="mrow pmrow" data-act="projnew" id="pm-new">' + I.plus + '<span class="mn">New project</span></button>' +
        '<button type="button" class="mrow pmrow" data-act="projchat" id="pm-chat">' + I.chat + '<span class="mn">Chat only</span></button>' +
        '<button type="button" class="mrow pmrow" data-act="projfolder" id="pm-folder">' + I.folder + '<span class="mn">Open folder...</span></button>' +
        '<button type="button" class="mrow pmrow" data-act="ghsheet" id="pm-github">' + I.git + '<span class="mn">GitHub repository...</span></button>' +
        '<button type="button" class="mrow pmrow" data-act="projtpl" id="pm-tpl">' + I.apps + '<span class="mn">Start from a template...</span></button>' +
        '<div class="pdiv"></div>' +
        '<div id="projlist" role="listbox" aria-label="Projects"></div>' +
      '</div>',
      'mpop projpop'
    );
    var btn = (anchor && anchor.isConnected) ? anchor : $('#projchip'), pop = document.querySelector('.sheet.mpop');
    var place = function () { placePop(pop, btn); };
    place(); if (window.__mpopOff) window.__mpopOff();
    addEventListener('resize', place); addEventListener('scroll', place, true);
    window.__mpopOff = function () { removeEventListener('resize', place); removeEventListener('scroll', place, true); window.__mpopOff = null; };
    drawList();
    api('/api/projects').then(function (list) {
      if (Array.isArray(list)) { S.projects = list; drawList(); }
    }).catch(function () {});
  }
  function newProjectSheet() {
    sheet('<h4>New project</h4><p style="color:var(--muted);margin:0 10px 10px">Create an isolated Git project workspace.</p>' +
      '<form id="newprojform" style="margin:0 10px 6px"><input class="input mono" id="newprojid" placeholder="my-project" aria-label="Project ID" style="width:100%;margin-bottom:10px">' +
      '<div class="bar"><button type="button" class="btn" id="np-cancel">Cancel</button><button class="btn primary" id="np-ok" type="submit">' + I.plus + 'Create project</button></div></form>');
    $('#np-cancel').onclick = closeSheet;
    var inp = $('#newprojid'); if (inp) inp.focus();
    $('#newprojform').onsubmit = function (e) {
      e.preventDefault();
      var raw = (inp && inp.value || '').trim(), pid = slug(raw);
      if (!raw) return toast('Enter a project name');
      api('/api/projects', { body: { id: pid, name: raw } }).then(function () {
        S.projects = (S.projects || ['demo']).concat([pid]);
        S.project = pid; storageSet('fc.project', pid); closeSheet(); render(); toast('Project created: ' + pid);
      }).catch(function (e) {
        toast(e && e.message ? e.message : 'Could not create project');
      });
    };
  }
  function openFolderSheet() {
    sheet('<h4>Open folder</h4><p style="color:var(--muted);margin:0 10px 10px">Switch to an existing project folder or attach files from your computer.</p>' +
      '<form id="openfolderform" style="margin:0 10px 6px"><input class="input mono" id="foldername" placeholder=".freecode" aria-label="Folder name" style="width:100%;margin-bottom:10px">' +
      '<div class="bar"><button type="button" class="btn" id="of-browse">Attach files...</button><button type="button" class="btn" id="of-cancel">Cancel</button><button class="btn primary" id="of-ok" type="submit">Open</button></div></form>');
    $('#of-cancel').onclick = closeSheet;
    $('#of-browse').onclick = function () { closeSheet(); var fi = $('#imgfile'); if (fi) fi.click(); };
    var inp = $('#foldername'); if (inp) inp.focus();
    $('#openfolderform').onsubmit = function (e) {
      e.preventDefault();
      var raw = (inp && inp.value || '').trim();
      var pid = (!raw || raw === '.freecode' || raw === 'demo') ? 'demo' : slug(raw);
      api('/api/projects', { body: { id: pid, name: raw || pid } }).catch(function () {}).then(function () {
        S.project = pid; storageSet('fc.project', pid); closeSheet(); render(); toast('Opened ' + projLabel(pid));
      });
    };
  }
  function githubImportSheet() {
    sheet('<h4>GitHub repository</h4><p style="color:var(--muted);margin:0 10px 10px">Import a GitHub repository (owner/name) to work on a branch.</p>' +
      '<form id="ghsheetform" style="margin:0 10px 6px"><input class="input mono" id="ghsheetrepo" placeholder="owner/repo" aria-label="Repository" style="width:100%;margin-bottom:10px">' +
      '<div class="bar"><button type="button" class="btn" id="ghs-cancel">Cancel</button><button type="button" class="btn" id="ghs-set">GitHub settings</button><button class="btn primary" id="ghs-ok" type="submit">Import</button></div></form>');
    $('#ghs-cancel').onclick = closeSheet;
    $('#ghs-set').onclick = function () { closeSheet(); go('settings'); };
    var inp = $('#ghsheetrepo'); if (inp) inp.focus();
    $('#ghsheetform').onsubmit = function (e) {
      e.preventDefault();
      var rp = (inp && inp.value || '').trim(); if (!rp) return toast('Enter owner/repo');
      toast('Importing ' + rp + '...');
      api('/api/github/import', { body: { repo: rp } }).then(function (x) {
        S.project = x.project; storageSet('fc.project', x.project); closeSheet(); toast('Imported. New agents work on ' + x.repo); go('home');
      }, function (err) { toast(err.message); });
    };
  }
  function templateSheet() {
    var tpls = [
      ['Landing page', 'A landing page for a coffee subscription with pricing and an FAQ'],
      ['Todo app', 'Build a todo app with filters, local storage and a dark mode'],
      ['Dashboard', 'A small analytics dashboard with three charts from a CSV'],
      ['Portfolio', 'A portfolio site with a project grid and a contact form']
    ];
    sheet('<div class="glabel">Start from a template</div><div id="tpllist">' + tpls.map(function (t, i) {
      return '<button type="button" class="mrow pmrow" data-tpl="' + i + '">' + I.file + '<span class="pmeta"><b>' + esc(t[0]) + '</b><small>' + esc(t[1]) + '</small></span></button>';
    }).join('') + '</div>', 'mpop tplpop');
    $('#tpllist').onclick = function (e) {
      var b = e.target.closest('[data-tpl]'); if (!b) return;
      var t = tpls[+b.dataset.tpl]; closeSheet();
      if (S.view !== 'home') go('home', null);
      setTimeout(function () { var p = $('#prompt'); if (p && t) { p.value = t[1]; p.focus(); } }, 0);
    };
  }
  function branchMenuSheet(anchor) {
    var a = S.view === 'agent' ? cur() : null, curB = a ? 'fc/' + a.id : 'main';
    var rows = [{ label: 'main', sub: 'Default branch', aid: '' }].concat((S.agents || []).slice(0, 6).map(function (x) {
      return { label: 'fc/' + x.id, sub: x.title || 'Agent branch', aid: x.id };
    }));
    sheet('<div class="glabel">Branches</div><div id="branchlist">' + rows.map(function (r) {
      var on = r.label === curB;
      return '<button type="button" class="mrow pmrow' + (on ? ' on' : '') + '" data-act="pickbranch" data-aid="' + esc(r.aid) + '">' + I.branch + '<span class="pmeta"><b class="mono">' + esc(r.label) + '</b><small>' + esc(r.sub) + '</small></span>' + (on ? '<span class="pcheck">' + I.check + '</span>' : '') + '</button>';
    }).join('') + '</div>', 'mpop branchpop');
    var btn = (anchor && anchor.isConnected) ? anchor : $('#branchchip'), pop = document.querySelector('.sheet.mpop');
    placePop(pop, btn);
  }
  function modeMenuSheet(anchor) {
    var curM = mode(), cfg = S.cfg || {};
    var opts = [
      ['pc', 'Local', 'Run on your computer', cfg.mode !== 'cloud', I.monitor],
      ['cloud', 'Cloud', 'Hosted cloud workspace', cfg.mode === 'cloud', I.cloud],
      ['phone', 'Phone', 'On-device browser sandbox', true, I.phone]
    ];
    sheet('<div class="glabel">Run mode</div><div id="modelist">' + opts.map(function (o) {
      var on = curM === o[0];
      return '<button type="button" class="mrow pmrow' + (on ? ' on' : '') + (o[3] ? '' : ' dim') + '" data-act="pickmode" data-m="' + o[0] + '"' + (o[3] ? '' : ' disabled') + '>' + o[4] + '<span class="pmeta"><b>' + esc(o[1]) + '</b><small>' + esc(o[2]) + '</small></span>' + (on ? '<span class="pcheck">' + I.check + '</span>' : '') + '</button>';
    }).join('') + '</div>', 'mpop modepop');
    var btn = (anchor && anchor.isConnected) ? anchor : $('#modechip'), pop = document.querySelector('.sheet.mpop');
    placePop(pop, btn);
  }
  function skillSheet() {
    sheet('<div class="glabel">Skills</div><div id="sklist">' + skillList().map(function (x, i) { return '<button type="button" class="mrow skrow" data-act="useskill" data-i="' + i + '"><span class="mn">' + esc(x[0]) + '</span></button>'; }).join('') +
      '</div><button type="button" class="mrow skrow" data-act="saveskill"><span class="mn">+ Save current text as a skill</span></button>', 'mpop skpop');
    var pop = document.querySelector('.sheet.mpop'), btn = S.actEl; placePop(pop, btn);
  }
  function composerInput() { return $('#chatin') || $('#prompt'); }
  function closeSheet() { if (window.__mpopOff) window.__mpopOff(); var w = $('#sheet'); if (!w.hidden) { w.hidden = true; w.innerHTML = ''; w.className = 'sheet-wrap'; } }
  // ---------- model picker (popover above the composer; bottom sheet on phones) ----------
  // Levels set a default model. Costs use the Freebuff-style credit scale for display: free models cost 0/hr.
  var LEVELS = [['efficient', 'Efficient', 'lite'], ['balanced', 'Balanced', 'auto'], ['powerful', 'Powerful', 'atlas']];
  var MMETA = {
    auto: { group: 'existing', cost: 0, badges: [] }, lite: { group: 'existing', cost: 0, badges: ['New'] },
    spark: { group: 'existing', cost: 0, badges: ['Promotional'] }, craft: { group: 'existing', cost: 0, badges: ['Promotional'] },
    'laguna-xs': { group: 'optional', cost: 0, badges: ['Optional'] }, 'north-mini-code': { group: 'optional', cost: 0, badges: ['Optional'] },
    flux: { group: 'existing', cost: 0, badges: [] },
    atlas: { group: 'optimized', cost: 10, badges: [] }, forge: { group: 'optimized', cost: 15, badges: ['Ending soon'] }
  };
  function levelOf(id) { var l = LEVELS.filter(function (x) { return x[2] === id; })[0]; return l || null; }
  function modelChip() { var l = levelOf(S.model); return l ? l[1] : modelName(S.model); }
  function costLabel(m) { var c = (MMETA[m.id] || {}).cost; return m.free ? (c ? c + ' credits/hr' : '0/hr') : m.plan + ' plan'; }
  function modelSheet(anchor) {
    S.mfull = S.mfull !== false; var q = '';
    var row = function (m) {
      var meta = MMETA[m.id] || { badges: [] };
      return '<button class="mrow' + (m.id === S.model ? ' on' : '') + (m.free ? '' : ' dim') + '" data-model="' + m.id + '" role="option" aria-selected="' + (m.id === S.model) + '" title="' + esc(m.tag) + '">' +
        '<span class="mn">' + esc(m.name) + '</span>' + (m.free ? '<span class="badge free" hidden>Free</span>' : '') +
        meta.badges.map(function (b) { return '<span class="mb ' + b.toLowerCase().replace(/\s+/g, '') + '">' + b + '</span>'; }).join('') +
        '<span class="grow"></span><span class="mc">' + (m.free ? I.clock : '') + esc(costLabel(m)) + '</span></button>';
    };
    var group = function (label, list, hint) { return list.length ? '<div class="glabel" title="' + esc(hint) + '">' + label + '</div>' + list.map(row).join('') : ''; };
    var draw = function () {
      var f = S.models.filter(function (m) { return !q || (m.name + ' ' + m.tag + ' ' + m.id).toLowerCase().indexOf(q) >= 0; });
      var g = function (k) { return f.filter(function (m) { return m.free && (MMETA[m.id] || {}).group === k; }); };
      $('#mlist').hidden = !S.mfull;
      $('#mlist').innerHTML = group('Existing BYOK models', g('existing'), 'Existing provider routes; keys and provider limits apply') + group('Optional · OpenRouter free', g('optional'), 'Explicit opt-in exact :free routes; requires an OpenRouter key and eligible zero-price privacy-compliant endpoint') + group('Optimized', g('optimized'), 'Bigger free models, metered on the credit scale') +
        group('Premium', f.filter(function (m) { return !m.free; }), 'Paid plans') + (f.length ? '' : '<p class="mempty">No models match.</p>');
      var cur = levelOf(S.model), i = cur ? LEVELS.indexOf(cur) : -1;
      $('#mlevel').innerHTML = LEVELS.map(function (l, k) { return '<button type="button" role="radio" aria-checked="' + (k === i) + '" data-level="' + l[0] + '">' + l[1] + '</button>'; }).join('');
      $('#mtrack').style.setProperty('--at', i < 0 ? 'none' : '1'); $('#mtrack').dataset.i = i;
      $('#mcur').textContent = modelName(S.model); $('#mmore').textContent = S.mfull ? 'Show less' : 'Show more';
    };
    sheet('<div class="mlevels" id="mlevel" role="radiogroup" aria-label="Model level"></div><div class="mtrack" id="mtrack"><i></i><i></i><i></i></div>' +
      '<div class="mhead"><span id="mcur" class="mcur"></span><button type="button" class="mmore" id="mmore" aria-controls="mlist"></button></div>' +
      '<label class="msearch">' + I.search + '<input id="msearch" placeholder="Search models" aria-label="Search models"><button type="button" id="mclear" aria-label="Clear search">' + I.x + '</button></label>' +
      '<div id="mlist" role="listbox" aria-label="Models"></div>' +
      '<details class="mavail"><summary>Availability</summary><p>Existing BYOK routes require their provider keys; NVIDIA NIM trial-backed routes are evaluation-only, and provider limits apply. Optional OpenRouter choices require an OpenRouter key and use only their exact :free model IDs with zero-price and data/privacy selection constraints; if no eligible endpoint honors them, the request fails closed with no fallback. A local app-data-directory cap limits these routes to 18 attempts/minute and 40 per UTC day, including retries; this is not a view of remaining provider quota or a capacity guarantee. Free way Auto keeps its existing route chain. Optimized models are also free; their credit cost is shown for comparison and nothing is charged.</p></details>', 'mpop');
    var btn = (anchor && anchor.isConnected && anchor.dataset.act === 'models') ? anchor : document.querySelector('[data-act="models"]'), pop = document.querySelector('.sheet.mpop');
    var place = function () { placePop(pop, btn); };
    place(); if (window.__mpopOff) window.__mpopOff();
    addEventListener('resize', place); addEventListener('scroll', place, true);
    window.__mpopOff = function () { removeEventListener('resize', place); removeEventListener('scroll', place, true); window.__mpopOff = null; };
    draw();
    $('#msearch').addEventListener('input', function (e) { q = e.target.value.toLowerCase(); S.mfull = true; draw(); });
    $('#mclear').onclick = function () { q = ''; $('#msearch').value = ''; draw(); $('#msearch').focus(); };
    $('#mmore').onclick = function () { S.mfull = !S.mfull; draw(); };
    $('#mlevel').addEventListener('click', function (e) { var b = e.target.closest('[data-level]'); if (!b) return; var l = LEVELS.filter(function (x) { return x[0] === b.dataset.level; })[0]; pickModel(l[2], true); draw(); });
    if (innerWidth > 760) $('#msearch').focus();
    $('#mlist').addEventListener('click', function (e) {
      var r = e.target.closest('[data-model]'); if (!r) return; var m = S.models.filter(function (x) { return x.id === r.dataset.model; })[0];
      if (!m.free) { sheet('<h4>' + esc(m.name) + ' is a premium model</h4><p style="color:var(--muted);margin:0 10px 12px">Available on the ' + esc(m.plan) + ' plan. The free plan uses Free way Auto and the free models.</p><div class="bar" style="margin:0 10px 6px"><button class="btn primary" id="keepfree">Keep using free models</button></div>'); $('#keepfree').onclick = closeSheet; return; }
      pickModel(m.id); closeSheet();
    });
  }
  function pickModel(id, stay) { S.model = id; storageSet('fc.model', id); if (!stay) { closeSheet(); render(); } else { var b = $('#modelbtn'); if (b) b.innerHTML = esc(modelChip()) + I.down; } }
  function approveSheet(a) {
    var w = a.actions.filter(function (x) { return x.type === 'write_file' && (x.risk||'').indexOf('blocked') < 0; }).length, c = a.actions.filter(function (x) { return x.type === 'run_command' && (x.risk||'').indexOf('blocked') < 0; }).length;
    sheet('<h4>Approve ' + w + ' file' + (w === 1 ? '' : 's') + ' and ' + c + ' command' + (c === 1 ? '' : 's') + '?</h4><p style="color:var(--muted);margin:0 10px 12px">Changes go to the agent branch first. Nothing touches main until you merge. Blocked actions are skipped.</p>' +
      '<div class="bar" style="margin:0 10px 6px"><button class="btn" id="sh-cancel">Cancel</button><button class="btn primary" id="sh-ok">' + I.check + 'Approve all</button></div>');
    $('#sh-cancel').onclick = closeSheet;
    $('#sh-ok').onclick = function () { closeSheet(); B().approvePlan(a.id, 'session').then(function (x) { upsert(x); render(); poll(x.id); }, function (e) { toast(e.message); }); };
  }
  function palette() {
    var cmds = [['New agent', function () { go('home'); }], ['Open board', function () { go('board'); }], ['Open preview', function () { go('preview'); }], ['Settings', function () { go('settings'); }], ['Chat', function () { S.chat.mode = 'chat'; go('chat'); }], ['Research', function () { S.chat.mode = 'research'; go('chat'); }], ['Choose model', modelSheet], ['Connected apps', function () { go('apps'); }], ['Search chats', function () { go('chat'); setTimeout(function () { var h = $('#hsearch'); if (h) h.focus(); }, 0); }], ['Export everything', function () { act('exportall', {}); }]]
      .concat(THEMES.map(function (t) { return ['Theme: ' + t, function () { setPref('theme', t); render(); }]; }))
      .concat(FONTS.map(function (f) { return ['Font: ' + f.id, function () { setPref('uiFont', f.id); render(); }]; }));
    sheet('<h4>Command palette</h4><input class="input search" id="psearch" placeholder="Type a command..." aria-label="Command"><div id="plist"></div>');
    var draw = function (q) { $('#plist').innerHTML = cmds.map(function (c, i) { return (!q || c[0].toLowerCase().indexOf(q.toLowerCase()) >= 0) ? '<button class="mrow" data-ci="' + i + '"><span class="mn"><b>' + esc(c[0]) + '</b></span></button>' : ''; }).join(''); };
    draw(''); $('#psearch').focus(); $('#psearch').addEventListener('input', function (e) { draw(e.target.value); });
    $('#psearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = $('#plist [data-ci]'); if (f) f.click(); } });
    $('#plist').addEventListener('click', function (e) { var r = e.target.closest('[data-ci]'); if (r) { closeSheet(); cmds[+r.dataset.ci][1](); } });
  }
  // ---------- connectors: gallery, setup, drafts that need approval ----------
  var BRAND = { whatsapp: '#25d366', messenger: '#0a7cff', instagram: '#e1306c', gmail: '#ea4335', outlook: '#0f6cbd', slack: '#611f69', discord: '#5865f2', telegram: '#229ed9', gdrive: '#1fa463', notion: '#e9e9e7', github: '#c9d1d9', gcal: '#4285f4', linear: '#5e6ad2', jira: '#2684ff' };
  var MONOG = { whatsapp: 'Wa', messenger: 'Me', instagram: 'Ig', gmail: 'Gm', outlook: 'Ol', slack: 'Sl', discord: 'Dc', telegram: 'Tg', gdrive: 'Dr', notion: 'No', github: 'Gh', gcal: 'Ca', linear: 'Li', jira: 'Ji' };
  var CFIELD = { token: 'Access token', phone_number_id: 'Phone number ID', waba_id: 'Business account ID (optional)', page_token: 'Page access token', page_id: 'Page ID', ig_user_id: 'Instagram user ID', client_id: 'OAuth client ID', client_secret: 'OAuth client secret', guild_id: 'Server (guild) ID', site: 'Site URL', email: 'Account email' };
  var DFIELD = { to: 'To', subject: 'Subject', text: 'Message', start: 'Starts', end: 'Ends' };
  var TO_HINT = { whatsapp: 'Phone number with country code', messenger: 'Recipient PSID', instagram: 'Comment ID to reply to', gmail: 'name@example.com', outlook: 'name@example.com', slack: 'Channel ID, or channel:thread_ts', discord: 'Channel ID', telegram: 'Chat ID, or chat:message', notion: 'Parent page ID', github: 'owner/repo#123', gcal: 'Guests, comma separated', linear: 'Team ID', jira: 'Issue key, like FC-12' };
  S.conn = null; S.drafts = null; S.cgroup = 'All'; S.cq = '';
  function cicon(id, big) { return '<span class="cicon' + (big ? ' big' : '') + '" style="--c:' + (BRAND[id] || 'var(--accent)') + '" aria-hidden="true">' + esc(MONOG[id] || id.slice(0, 2)) + '</span>'; }
  function loadConn() {
    if (S.connLoading) return; S.connLoading = true;
    Promise.all([api('/api/connectors'), api('/api/drafts')]).then(function (r) { S.conn = r[0]; S.drafts = r[1]; S.connLoading = false; if (S.view === 'apps') render(); else if (S.view === 'settings') { var cs = document.getElementById('connrow'); if (cs) cs.outerHTML = connRow(); } }, function (e) { S.connLoading = false; toast(e.message); });
  }
  function appsView() {
    if (!S.conn) { loadConn(); return '<section class="apps"><h2>Connected apps</h2><div class="cgrid">' + new Array(9).join('<div class="ccard skel"></div>') + '</div></section>'; }
    var groups = ['All'].concat(S.conn.map(function (c) { return c.group; }).filter(function (g, i, a) { return a.indexOf(g) === i; }));
    var on = S.conn.filter(function (c) { return c.connected; }).length, pend = (S.drafts || []).filter(function (d) { return d.status === 'pending'; });
    var list = S.conn.filter(function (c) { return (S.cgroup === 'All' || c.group === S.cgroup) && (!S.cq || (c.name + ' ' + c.blurb).toLowerCase().indexOf(S.cq.toLowerCase()) >= 0); });
    return '<section class="apps" id="apps"><div class="apphero"><div><h2>Connected apps</h2><p class="sub">Agents can search, read and draft in your apps. <b>Nothing is sent until you approve it.</b></p></div>' +
      '<div class="stat"><b>' + on + '</b><small>of ' + S.conn.length + ' connected</small></div></div>' +
      (pend.length ? '<div class="card drafts" id="drafts"><div class="k">' + I.send + 'Waiting for your approval <span class="badge warn">' + pend.length + '</span></div>' + pend.map(function (d) {
        return '<div class="drow" data-draft="' + esc(d.id) + '">' + cicon(d.connector) + '<span class="what"><b>' + esc((d.fields.subject || d.fields.to || 'Draft')) + '</b><small>' + esc((d.origin === 'agent' ? 'Drafted by an agent · ' : '') + 'to ' + (d.fields.to || '')) + '</small><span class="dprev">' + esc((d.fields.text || '').slice(0, 140)) + '</span></span>' +
          '<span class="dact"><button class="btn primary" data-act="dreview" data-id="' + esc(d.id) + '">Review and send</button><button class="btn ghost" data-act="ddiscard" data-id="' + esc(d.id) + '">Discard</button></span></div>'; }).join('') + '</div>' : '') +
      '<div class="ctools"><input class="input search" id="csearch" placeholder="Search apps" aria-label="Search apps" value="' + esc(S.cq) + '"><div class="seg" role="radiogroup" aria-label="Category">' + groups.map(function (g) { return '<button role="radio" aria-checked="' + (S.cgroup === g) + '" data-act="cgroup" data-g="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') + '</div></div>' +
      '<div class="cgrid" id="cgrid">' + list.map(function (c, i) {
        return '<button class="ccard' + (c.connected ? ' on' : '') + '" data-act="cmanage" data-id="' + c.id + '" style="--c:' + (BRAND[c.id] || 'var(--accent)') + ';--i:' + i + '" aria-label="' + esc(c.name) + (c.connected ? ', connected' : ', not connected') + '">' + cicon(c.id, true) +
          '<span class="cbody"><b>' + esc(c.name) + '</b><small>' + esc(c.blurb) + '</small></span><span class="cfoot"><span class="badge ' + (c.connected ? 'ok' : '') + '">' + (c.connected ? 'Connected' : c.auth === 'oauth' ? 'Sign in' : 'Add token') + '</span><span class="caps">' + c.can.map(esc).join(' · ') + '</span></span></button>'; }).join('') +
      (list.length ? '' : '<div class="empty">No apps match</div>') + '</div>' +
      '<p class="fine">Every app uses your own account or app credentials, stored only on this ' + (S.cfg && (S.cfg && S.cfg.mode === 'cloud') ? 'workspace' : 'computer') + '. Mention one in Chat, like <code>@slack launch</code>, to bring its results into the conversation.</p></section>';
  }
  function connSheet(id) {
    var c = S.conn.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    var fields = c.fields.map(function (f) { var sec = c.secret_fields.indexOf(f) >= 0;
      return '<label class="fl"><span>' + esc(CFIELD[f] || f) + '</span><input class="input' + (sec ? '' : ' mono') + '" ' + (sec ? 'type="password" ' : '') + 'id="cf-' + f + '" autocomplete="off" placeholder="' + (c.connected || c.app_ready ? 'Saved. Paste to replace' : '') + '"></label>'; }).join('');
    var oauth = c.auth === 'oauth';
    sheet('<div class="shead">' + cicon(c.id, true) + '<div><h4>' + esc(c.name) + '</h4><small>' + esc(c.blurb) + '</small></div>' + (c.connected ? '<span class="badge ok">Connected</span>' : '') + '</div>' +
      '<ol class="steps">' + (oauth ? '<li>Create an OAuth app in your own console (<span class="mono">' + esc(c.docs) + '</span>) and add this redirect URL: <code id="redir">' + esc(location.origin + '/api/connectors/oauth/callback') + '</code></li><li>Paste its client ID and secret, then sign in.</li>'
        : '<li>Create a token at <span class="mono">' + esc(c.docs) + '</span>.</li><li>Paste it below. It is stored on this ' + ((S.cfg && S.cfg.mode === 'cloud') ? 'workspace' : 'computer') + ' and never shown again.</li>') + '</ol>' +
      '<div class="fields">' + fields + '</div><div class="bar" style="margin:6px 10px">' +
      '<button class="btn primary" id="c-save">' + (oauth ? 'Save app' : 'Save and test') + '</button>' + (oauth && (c.app_ready || c.connected) ? '<button class="btn primary" id="c-oauth">' + I.ext + 'Sign in with ' + esc(c.name) + '</button>' : '') +
      (c.connected ? '<button class="btn" id="c-test">Test</button><button class="btn ghost danger" id="c-off">Disconnect</button>' : '') + '</div>' +
      (c.connected ? '<div class="cbrowse"><div class="k">Search ' + esc(c.name) + '</div><form id="c-q" class="qrow"><input class="input" id="c-qv" placeholder="Search..." aria-label="Search ' + esc(c.name) + '"><button class="btn">Search</button></form><div id="c-res" class="cres"></div>' +
        (c.draft_fields.length && c.can.indexOf('draft') >= 0 ? '<button class="btn ghost" id="c-new">New draft</button>' : '') + '</div>' : ''));
    $('#c-save').onclick = function () {
      var v = {}; c.fields.forEach(function (f) { var x = $('#cf-' + f).value.trim(); if (x) v[f] = x; });
      if (!Object.keys(v).length) return toast('Paste at least one value');
      api('/api/connectors/' + id + '/setup', { body: { values: v } }).then(function (g) { S.conn = g; if (oauth) { connSheet(id); toast('Saved. Now sign in'); return; }
        return api('/api/connectors/' + id + '/test', { body: {} }).then(function () { toast(c.name + ' connected'); closeSheet(); render(); }, function (e) { toast('Saved, but the test failed: ' + e.message); connSheet(id); }); }, function (e) { toast(e.message); });
    };
    if ($('#c-oauth')) $('#c-oauth').onclick = function () { api('/api/connectors/' + id + '/oauth/start', { body: {} }).then(function (r) { location.href = r.url; }, function (e) { toast(e.message); }); };
    if ($('#c-test')) $('#c-test').onclick = function () { api('/api/connectors/' + id + '/test', { body: {} }).then(function () { toast('Connection works'); }, function (e) { toast(e.message); }); };
    if ($('#c-off')) $('#c-off').onclick = function () { confirmSheet('Disconnect ' + c.name + '?', 'Its saved credentials are deleted from this ' + ((S.cfg && S.cfg.mode === 'cloud') ? 'workspace' : 'computer') + '. Pending drafts stay until you discard them.', 'Disconnect', function () { api('/api/connectors/' + id + '/setup', { body: { values: null } }).then(function (g) { S.conn = g; render(); toast('Disconnected'); }); }); };
    if ($('#c-q')) $('#c-q').onsubmit = function (e) { e.preventDefault(); var box = $('#c-res'); box.innerHTML = '<span class="spin"></span>';
      api('/api/connectors/' + id + '/search', { body: { query: $('#c-qv').value } }).then(function (r) { box.innerHTML = r.items.map(function (it) { return '<div class="ritem"><span class="what"><b>' + esc(it.title || it.id) + '</b><small>' + esc(it.snippet || '') + (it.from ? ' · ' + esc(it.from) : '') + '</small></span>' + (c.can.indexOf('draft') >= 0 ? '<button class="btn ghost" data-reply="' + esc(it.chat_id ? it.id : it.id) + '">Reply</button>' : '') + '</div>'; }).join('') || '<div class="empty">Nothing found</div>'; }, function (er) { box.innerHTML = '<div class="err">' + esc(er.message) + '</div>'; }); };
    if ($('#c-res')) $('#c-res').onclick = function (e) { var r = e.target.closest('[data-reply]'); if (r) draftSheet(c, { to: id === 'gmail' || id === 'outlook' ? '' : r.dataset.reply }); };
    if ($('#c-new')) $('#c-new').onclick = function () { draftSheet(c, {}); };
  }
  function draftSheet(c, pre, did) {
    sheet('<div class="shead">' + cicon(c.id) + '<h4>' + (did ? 'Edit draft' : 'New draft') + ' · ' + esc(c.name) + '</h4></div><p class="fine" style="margin:0 10px 8px">Saved as a draft. You review it before anything is sent.</p><div class="fields">' + c.draft_fields.map(function (f) {
      var v = esc((pre || {})[f] || '');
      return '<label class="fl"><span>' + esc(DFIELD[f] || f) + '</span>' + (f === 'text' ? '<textarea class="input" rows="5" id="df-' + f + '">' + v + '</textarea>' : '<input class="input" id="df-' + f + '" value="' + v + '" placeholder="' + esc(f === 'to' ? TO_HINT[c.id] || '' : f === 'start' || f === 'end' ? '2026-10-23T10:00:00+07:00' : '') + '">') + '</label>'; }).join('') +
      '</div><div class="bar" style="margin:6px 10px"><button class="btn" id="d-cancel">Cancel</button><button class="btn primary" id="d-save">Save draft</button></div>');
    $('#d-cancel').onclick = closeSheet;
    $('#d-save').onclick = function () { var v = {}; c.draft_fields.forEach(function (f) { v[f] = $('#df-' + f).value; });
      (did ? api('/api/drafts/' + did, { body: { fields: v } }) : api('/api/connectors/' + c.id + '/draft', { body: { fields: v } })).then(function (d) { closeSheet(); S.conn = null; loadConn(); toast('Draft saved. Review it in Apps'); go('apps'); }, function (e) { toast(e.message); }); };
  }
  function approveSendSheet(id) {
    var d = (S.drafts || []).filter(function (x) { return x.id === id; })[0]; if (!d) return; var c = S.conn.filter(function (x) { return x.id === d.connector; })[0] || { name: d.connector, draft_fields: Object.keys(d.fields) };
    sheet('<div class="shead">' + cicon(d.connector, true) + '<div><h4>Send with ' + esc(c.name) + '?</h4><small>' + (d.origin === 'agent' ? 'An agent drafted this. ' : '') + 'This leaves Free way and cannot be unsent.</small></div></div>' +
      '<dl class="dview" id="dview">' + Object.keys(d.fields).filter(function (k) { return d.fields[k]; }).map(function (k) { return '<dt>' + esc(DFIELD[k] || k) + '</dt><dd' + (k === 'text' ? ' class="body"' : '') + '>' + esc(d.fields[k]) + '</dd>'; }).join('') + '</dl>' +
      (d.error ? '<p class="err" style="margin:0 10px 8px">Last attempt failed: ' + esc(d.error) + '</p>' : '') +
      '<label class="confirm"><input type="checkbox" id="s-ok"> I have read this and want to send it now</label>' +
      '<div class="bar" style="margin:6px 10px"><button class="btn" id="s-edit">Edit</button><button class="btn" id="s-cancel">Not now</button><button class="btn primary" id="s-send" disabled>' + I.send + 'Send</button></div>');
    $('#s-ok').onchange = function () { $('#s-send').disabled = !this.checked; };
    $('#s-cancel').onclick = closeSheet; $('#s-edit').onclick = function () { draftSheet(c, d.fields, d.id); };
    $('#s-send').onclick = function () { if (!$('#s-ok').checked) return; this.disabled = true;
      api('/api/drafts/' + id + '/send', { body: { confirm: true } }).then(function () { closeSheet(); toast('Sent with ' + c.name); S.conn = null; loadConn(); }, function (e) { toast(e.message); S.conn = null; loadConn(); closeSheet(); }); };
  }
  // ---------- attachments: any file. Text, code, PDF, docx and zip are read so the agent can use them ----------
  var KIND = { pdf: 'PDF', zip: 'ZIP', doc: 'DOC', code: 'CODE', text: 'TEXT', binary: 'FILE', file: 'FILE', image: 'IMG' };
  S.files = []; S.cfiles = [];
  function FL() { return S.view === 'chat' ? S.cfiles : S.files; }
  function fsize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function addFiles(list, rerender) { var dest = FL();
    list = [].slice.call(list || []); var imgs = list.filter(function (f) { return /^image\/(png|jpeg|webp|gif)$/.test(f.type); }), rest = list.filter(function (f) { return imgs.indexOf(f) < 0; });
    if (imgs.length) addImages(imgs);
    rest.slice(0, Math.max(0, 10 - dest.length)).forEach(function (f) {
      if (f.size > 25 * 1048576) return toast(f.name + ' is over 25 MB. Please attach a smaller file, or zip it.');
      var slot = { name: f.name, size: f.size, kind: 'file', loading: true }; dest.push(slot); keepDraft(rerender || render);
      var r = new FileReader(); r.onload = function () {
        api('/api/extract', { body: { name: f.name, type: f.type, data: r.result } }).then(function (x) { Object.assign(slot, x, { loading: false }); keepDraft(rerender || render); },
          function (e) { dest.splice(dest.indexOf(slot), 1); toast(f.name + ': ' + e.message); keepDraft(rerender || render); });
      }; r.readAsDataURL(f);
    });
  }
  function fileChips(where) {
    return FL().map(function (f, i) { return '<span class="fchip' + (f.loading ? ' loading' : '') + '" title="' + esc(f.name) + '"><span class="fk k-' + esc(f.kind) + '">' + (f.loading ? '<span class="spin"></span>' : KIND[f.kind] || 'FILE') + '</span><span class="fn"><b>' + esc(f.name) + '</b><small>' + fsize(f.size) + (f.entries ? ' · ' + f.entries.length + ' files' : '') + (f.kind === 'binary' ? ' · name only' : f.truncated ? ' · partly read' : '') + '</small></span>' +
      '<button type="button" data-act="unfile" data-i="' + i + '" aria-label="Remove ' + esc(f.name) + '">' + I.x + '</button></span>'; }).join('');
  }
  function asPrompt(fs) { return fs.slice(0, 10).map(function (f) { return '[Attached ' + f.kind + ': ' + f.name + ' (' + f.size + ' bytes)' + (f.truncated ? ', truncated' : '') + ']' + (f.text ? '\n' + f.text : ''); }).join('\n\n'); }
  function readyFiles() { if (FL().some(function (f) { return f.loading; })) { toast('Still reading your files'); return null; } return FL().map(function (f) { return { name: f.name, kind: f.kind, size: f.size, text: f.text || '', truncated: !!f.truncated }; }); }
  function dropzone(el, rerender) {
    if (!el) return; var n = 0;
    el.addEventListener('dragenter', function (e) { if ([].indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return; n++; el.classList.add('drop'); });
    el.addEventListener('dragleave', function () { if (--n <= 0) { n = 0; el.classList.remove('drop'); } });
    el.addEventListener('dragover', function (e) { e.preventDefault(); });
    el.addEventListener('drop', function (e) { e.preventDefault(); n = 0; el.classList.remove('drop'); addFiles(e.dataTransfer.files, rerender); });
    el.addEventListener('paste', function (e) { var fs = [].slice.call((e.clipboardData || {}).files || []); if (fs.length) { e.preventDefault(); addFiles(fs, rerender); } });
  }
  // ---------- chat history (on this device), search, export ----------
  function loadChats() {
    var list = storedJSON('fc.chats', []);
    if (!Array.isArray(list)) return [];
    return list.filter(function (chat) {
      return chat && typeof chat.id === 'string' && Array.isArray(chat.msgs) && chat.msgs.every(function (m) {
        return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
      });
    });
  }
  var CH = { list: loadChats() };
  var chatHistoryGeneration = 0;
  function saveChats() { storageSet('fc.chats', JSON.stringify(CH.list.slice(0, 200))); }
  function storeChat(chat) {
    var C = chat || S.chat; if (!C.msgs.length) return;
    if (!C.id) {
      var id;
      do { id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
      while ((C !== S.chat && id === S.chat.id) || CH.list.some(function (x) { return x.id === id; }));
      C.id = id;
    }
    var rec = { id: C.id, mode: C.mode, title: C.msgs[0].content.slice(0, 80), at: Date.now(), msgs: C.msgs.map(function (m) { return { role: m.role, content: m.content, sources: m.sources, items: m.items, error: m.error, at: m.at, workedSec: m.workedSec }; }) };
    CH.list = [rec].concat(CH.list.filter(function (x) { return x.id !== C.id; })); saveChats();
    if (C === S.chat) { storageSet('fc.chat.active', C.id); if (S.view === 'chat' && location.hash !== '#chat/' + C.id) history.replaceState(null, '', location.pathname + '#chat/' + C.id); }
  }
  function chatHistory() {
    var q = (S.hq || '').toLowerCase();
    var hits = CH.list.filter(function (c) { return !q || c.msgs.some(function (m) { return m.content.toLowerCase().indexOf(q) >= 0; }); });
    return '<aside class="hist' + (S.showHist ? ' open' : '') + '" id="hist" aria-label="Chat history"><div class="hhead"><b>History</b><button class="btn ghost" data-act="chatnew">' + I.plan + 'New</button></div><input class="input search" id="hsearch" placeholder="Search chats" aria-label="Search chats" value="' + esc(S.hq || '') + '">' +
      '<div class="hlist">' + (hits.map(function (c) { var m = q ? (c.msgs.filter(function (x) { return x.content.toLowerCase().indexOf(q) >= 0; })[0] || {}).content || '' : '', at = m ? m.toLowerCase().indexOf(q) : -1;
        return '<button class="hrow' + (c.id === S.chat.id ? ' on' : '') + '" data-act="chatopen" data-id="' + c.id + '"><b>' + esc(c.title) + '</b><small>' + (at >= 0 ? esc(m.slice(Math.max(0, at - 24), at)) + '<mark>' + esc(m.substr(at, q.length)) + '</mark>' + esc(m.slice(at + q.length, at + q.length + 40)) : esc(when(c.at)) + (c.mode === 'research' ? ' · Research' : '')) + '</small></button>'; }).join('') || '<div class="empty">' + (q ? 'No chats match' : 'Your chats are kept on this device') + '</div>') + '</div></aside>';
  }
  function when(t) { var d = (Date.now() - t) / 1000; return d < 60 ? 'Just now' : d < 3600 ? Math.round(d / 60) + ' min ago' : d < 86400 ? Math.round(d / 3600) + ' h ago' : new Date(t).toLocaleDateString(); }
  function download(name, text, type) { var u = URL.createObjectURL(new Blob([text], { type: type || 'text/markdown' })), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 1500); }
  function slug(s) { return String(s || 'freecode').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'freecode'; }
  function chatMarkdown(c) { return '# ' + c.msgs[0].content.slice(0, 80) + '\n\n' + c.msgs.map(function (m) { return '**' + (m.role === 'user' ? 'You' : 'Free way') + ':**\n\n' + m.content + (m.sources && m.sources.length ? '\n\nSources:\n' + m.sources.map(function (x) { return x.n + '. [' + x.title + '](' + x.url + ')'; }).join('\n') : ''); }).join('\n\n---\n\n') + '\n'; }
  function agentMarkdown(a) {
    var md = '# ' + a.title + '\n\nState: ' + a.state + (a.checks ? ' · checks ' + a.checks : '') + ' · model ' + modelName(a.model) + '\n\n## Task\n\n' + a.prompt + '\n';
    if (a.plan) md += '\n## Plan\n\n' + a.plan.summary + '\n\n' + a.plan.steps.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n') + '\n';
    if (a.actions && a.actions.length) md += '\n## Actions\n\n' + a.actions.map(function (x) { return '- [' + x.status + '] ' + (x.type === 'write_file' ? 'write `' + x.path + '`' : 'run `' + x.command + '`' + (x.result && x.result.exit_code != null ? ' (exit ' + x.result.exit_code + ')' : '')); }).join('\n') + '\n';
    if (a.review) md += '\n## Review\n\n' + a.review.summary + '\n' + a.review.findings.map(function (f) { return '- ' + f.severity + ' ' + f.file + (f.line ? ':' + f.line : '') + ': ' + f.message; }).join('\n') + '\n';
    return md;
  }
  // ---------- notifications ----------
  var NOTE = { review: ['is ready to review', 'Checks finished. Open it to merge.'], needs_plan_approval: ['needs plan approval', 'The current plan is ready; approve it before work starts.'], needs_milestone_approval: ['needs milestone approval', 'A milestone is complete and the next boundary is waiting for your matching approval.'], error: ['stopped with an error', 'Open it to see what happened.'] };
  S.unseen = 0;
  function notifyChange(prev, a) {
    if (!prev || prev.state === a.state || !NOTE[a.state]) return;
    var copy = a.mission && a.state === 'review' ? ['is ready for final review', 'Mission approvals are complete. Review, merge and deployment remain separate actions.'] : NOTE[a.state];
    var focused = document.hasFocus && document.hasFocus() && !document.hidden;
    if (!focused) { S.unseen++; document.title = '(' + S.unseen + ') Free way'; }
    if (prefs.notify && !focused && 'Notification' in window && Notification.permission === 'granted') {
      try { var n = new Notification(a.title + ' ' + copy[0], { body: copy[1], tag: 'fc-' + a.id, icon: '/favicon.svg' }); n.onclick = function () { focus(); go('agent', a.id); n.close(); }; } catch (e) {}
    }
    if (focused && S.agentId !== a.id) toast(a.title + ' ' + copy[0]);
  }
  addEventListener('focus', function () { if (S.unseen) { S.unseen = 0; document.title = 'Free way'; } });
  function notifySettings() {
    var sup = 'Notification' in window, perm = sup ? Notification.permission : 'unsupported';
    return '<h3 id="s-notify">Notifications</h3><div class="row"><span><span class="lbl">When an agent finishes or needs you</span><small>' + (perm === 'denied' ? 'Blocked in your browser settings for this site.' : perm === 'unsupported' ? 'This browser does not support notifications. The tab title still shows a count.' : 'Only while Free way is in the background. The tab title also shows a count.') + '</small></span>' +
      '<div class="seg" role="radiogroup" aria-label="Notifications"><button role="radio" aria-checked="' + !prefs.notify + '" data-act="notify" data-v="0">Off</button><button role="radio" aria-checked="' + !!prefs.notify + '" data-act="notify" data-v="1"' + (perm === 'denied' || perm === 'unsupported' ? ' disabled' : '') + '>On</button></div></div>';
  }
  function dataSettings() {
    return '<h3 id="s-data">Your data</h3><div class="row"><span><span class="lbl">Export</span><small>Agents as Markdown, chats as Markdown, everything as JSON.</small></span><span class="integf"><button class="btn" data-act="exportall" id="exportall">Export all</button><button class="btn ghost danger" data-act="clearchats">Clear chat history</button></span></div>';
  }
  function connSettings() {
    var on = (S.conn || []).filter(function (c) { return c.connected; });
    return '<h3 id="s-apps">Connected apps</h3>' + connRow();
  }
  function connRow() {
    var on = (S.conn || []).filter(function (c) { return c.connected; });
    return '<div class="row" id="connrow"><span><span class="lbl">' + (S.conn ? on.length + ' of ' + S.conn.length + ' connected' : 'Mail, chat, files and issues') + '</span><small>' + (on.length ? on.map(function (c) { return esc(c.name); }).join(', ') : 'Agents can read and draft. Sending always needs your approval.') + '</small></span><button class="btn" data-go="apps">Manage apps</button></div>';
  }
  // ---------- boot ----------
  applyPrefs();
  function restoreLegacyUrlToken() { if (qp.get('token')) { storageSet('fc.token', qp.get('token')); history.replaceState(null, '', location.pathname); } }
  function startApp() {
    Promise.all([api('/api/config'), api('/api/models')]).then(function (r) { S.cfg = r[0]; S.models = r[1]; return refresh(); })
      .then(function () {
        var cn = qp.get('connected'); if (cn || location.hash === '#connectors' || location.hash === '#apps') { history.replaceState(null, '', location.pathname); go('apps'); if (cn) toast('Connected. You can now search it and draft in it'); }
        else if (/^#chat/.test(location.hash)) { var cid = location.hash.slice(6) || storageGet('fc.chat.active'), cc = CH.list.filter(function (x) { return x.id === cid; })[0];   // reload keeps the open chat
          if (cc) S.chat = { id: cc.id, mode: cc.mode || 'chat', msgs: cc.msgs.slice(), busy: false }; go('chat'); }
        else go(S.view || 'home');
        loadInteg(); })
      .catch(function (e) {
        if (AUTH && AUTH.enabled) {
          if (e.status === 401) AUTH.handleUnauthorized();
          else $('#main').innerHTML = '<div class="blank"><div><h2>Workspace unavailable</h2><p>Check your connection and try again.</p><button class="btn" type="button" data-auth-retry>Try again</button></div></div>';
          return;
        }
        $('#main').innerHTML = '<div class="blank"><div><h2>Sign in to Free way Cloud</h2><p>' + esc(e.message) + '</p><form id="tok"><input class="input" id="tokv" placeholder="Cloud token" aria-label="Cloud token"> <button class="btn primary">Continue</button></form></div></div>';
        var f = $('#tok'); if (f) f.onsubmit = function (ev) { ev.preventDefault(); storageSet('fc.token', $('#tokv').value.trim()); location.reload(); };
      });
  }
  function startAfterAuth() {
    if (!AUTH) {
      if (location.protocol === 'file:' || location.origin === 'null') { restoreLegacyUrlToken(); startApp(); return; }
      $('#main').innerHTML = '<section class="google-gate" aria-labelledby="auth-unavailable-title"><div class="google-gate-card card"><h1 id="auth-unavailable-title" tabindex="-1">Sign-in status unavailable</h1><p class="google-gate-copy">Check your connection before continuing.</p><button class="btn" type="button" data-auth-retry>Try again</button></div></section>';
      var missingTitle = $('#auth-unavailable-title'); if (missingTitle) missingTitle.focus({ preventScroll: true });
      return;
    }
    AUTH.ready.then(function () {
      if (AUTH.mode === 'unknown') {
        $('#main').innerHTML = '<section class="google-gate" aria-labelledby="auth-unavailable-title"><div class="google-gate-card card"><h1 id="auth-unavailable-title" tabindex="-1">Sign-in status unavailable</h1><p class="google-gate-copy">Check your connection before continuing.</p><button class="btn" type="button" data-auth-retry>Try again</button></div></section>';
        var title = $('#auth-unavailable-title'); if (title) title.focus({ preventScroll: true });
        return;
      }
      if (AUTH.enabled) {
        if (!AUTH.authenticated) AUTH.mountGate($('#main'));
        else startApp();
        return;
      }
      restoreLegacyUrlToken();
      startApp();
    });
  }
  document.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('[data-auth-retry]')) { event.preventDefault(); location.reload(); }
  });
  startAfterAuth();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function (reg) { if (reg && reg.update) reg.update(); }).catch(function () {});
  window.FC = { S: S, prefs: prefs, FONTS: FONTS, THEMES: THEMES, mode: mode };
})();
