/* Phone-local runtime: files live on the device (localStorage), commands run in a sandboxed Web Worker.
   Free cloud models do the thinking via POST /api/plan. Same agent shape as the server. */
(function (g) {
  'use strict';
  var KEY = 'fc.phone.v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{"agents":{}}'); } catch (e) { return { agents: {} }; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function safePath(p) {
    if (typeof p !== 'string' || !p.trim()) throw new Error('empty path');
    p = p.replace(/\\/g, '/').trim();
    if (p[0] === '/' || /^[A-Za-z]:/.test(p) || p[0] === '~') throw new Error('absolute path');
    var parts = p.split('/').filter(function (x) { return x && x !== '.'; });
    if (!parts.length || parts.indexOf('..') >= 0) throw new Error('path traversal');
    if (parts.indexOf('.git') >= 0) throw new Error('git internals are protected');
    return parts.join('/');
  }
  var ALLOWED = ['ls', 'cat', 'node', 'echo', 'pwd'];
  function checkCommand(c) {
    if (typeof c !== 'string' || !c.trim()) throw new Error('empty command');
    if (/[`|;&><\n]|\$\(/.test(c)) throw new Error('shell operators are not allowed');
    var argv = c.trim().split(/\s+/);
    if (ALLOWED.indexOf(argv[0]) < 0) throw new Error("'" + argv[0] + "' needs PC or Cloud mode");
    return argv;
  }
  function runNode(files, entry, timeoutMs) {
    return new Promise(function (resolve) {
      var src = "var out=[];var files=" + JSON.stringify(files) + ";var cache={};" +
        "function req(n){n=n.replace(/^\\.\\//,'');if(n==='assert'){var a=function(v,m){if(!v)throw new Error(m||'assertion failed')};a.ok=a;a.strictEqual=function(x,y,m){if(x!==y)throw new Error(m||(x+' !== '+y))};a.deepStrictEqual=function(x,y,m){if(JSON.stringify(x)!==JSON.stringify(y))throw new Error(m||'not deep equal')};a.equal=a.strictEqual;return a}" +
        "if(!/\\.js$/.test(n))n+='.js';if(cache[n])return cache[n].exports;if(!(n in files))throw new Error('Cannot find module '+n);var m={exports:{}};cache[n]=m;new Function('module','exports','require','console',files[n])(m,m.exports,req,con);return m.exports}" +
        "var con={log:function(){out.push([].slice.call(arguments).join(' '))},error:function(){out.push([].slice.call(arguments).join(' '))}};con.warn=con.error;con.info=con.log;" +
        "try{req(" + JSON.stringify(entry) + ");postMessage({code:0,out:out.join('\\n')})}catch(e){out.push(String(e&&e.message||e));postMessage({code:1,out:out.join('\\n')})}";
      var w;
      try { w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); }
      catch (e) { return resolve({ code: 1, out: 'worker unavailable: ' + e.message }); }
      var t = setTimeout(function () { w.terminate(); resolve({ code: 124, out: 'timed out after ' + timeoutMs / 1000 + 's' }); }, timeoutMs);
      w.onmessage = function (e) { clearTimeout(t); w.terminate(); resolve(e.data); };
      w.onerror = function (e) { clearTimeout(t); w.terminate(); resolve({ code: 1, out: e.message || 'error' }); e.preventDefault(); };
    });
  }
  function riskOf(x) {
    try { if (x.type === 'write_file') { safePath(x.path); return 'write'; } checkCommand(x.command); return 'command'; }
    catch (e) { return 'blocked: ' + e.message; }
  }
  function now() { return Date.now() / 1000; }
  var Phone = {
    name: 'phone', safePath: safePath, checkCommand: checkCommand, runNode: runNode,
    list: function () { var s = load(); return Object.keys(s.agents).map(function (k) { return s.agents[k]; }).sort(function (a, b) { return b.created - a.created; }); },
    get: function (id) { var a = load().agents[id]; if (!a) throw new Error('not found'); return a; },
    put: function (a) { var s = load(); s.agents[a.id] = a; save(s); return a; },
    create: function (prompt, model, planFn) {
      Phone.planFn = planFn;
      var a = { id: 'p' + Math.random().toString(16).slice(2, 10), project: 'phone', prompt: prompt, model: model,
        title: prompt.trim().split('\n')[0].slice(0, 60), state: 'planning', plan: null, actions: [], files: {}, log: [], route: null, error: null, created: now(), policy: 'ask', mode: 'phone' };
      Phone.put(a);
      return planFn(prompt, model).then(function (r) {
        a.plan = { summary: r.plan.summary, steps: r.plan.steps }; a.route = r.route;
        a.actions = r.plan.actions.map(function (x) { var y = Object.assign({}, x, { status: 'pending', result: null }); y.risk = riskOf(y); return y; });
        a.state = 'needs_plan_approval'; a.log.push({ t: now(), kind: 'plan_ready' }); return Phone.put(a);
      }, function (e) { a.state = 'error'; a.error = e.message; return Phone.put(a); });
    },
    approvePlan: function (id, policy) {
      var a = Phone.get(id); if (a.state !== 'needs_plan_approval') return Promise.reject(new Error('cannot approve plan now'));
      a.state = 'working'; a.policy = policy === 'session' ? 'session' : 'ask'; Phone.put(a);
      if (a.policy !== 'session') return Promise.resolve(Phone.finish(id));
      var chain = Promise.resolve();
      a.actions.forEach(function (x, i) { if (x.status === 'pending' && x.risk.indexOf('blocked') !== 0) chain = chain.then(function () { return Phone.approveAction(id, i); }); });
      return chain.then(function () { return Phone.finish(id); });
    },
    approveAction: function (id, i) {
      var a = Phone.get(id), x = a.actions[i];
      if (a.state !== 'working') return Promise.reject(new Error('cannot run actions now'));
      if (!x || x.status !== 'pending') return Promise.reject(new Error('action already handled'));
      if (x.risk.indexOf('blocked') === 0) return Promise.reject(new Error(x.risk));
      if (x.type === 'write_file') {
        var p = safePath(x.path); var created = !(p in a.files); a.files[p] = x.content;
        x.result = { path: p, created: created, bytes: x.content.length }; x.status = 'done'; Phone.put(a); return Promise.resolve(Phone.finish(id));
      }
      var argv = checkCommand(x.command);
      var done = function (code, out) { var b = Phone.get(id); b.actions[i].result = { command: x.command, exit_code: code, output: out }; b.actions[i].status = 'done'; Phone.put(b); return Phone.finish(id); };
      if (argv[0] === 'ls') return Promise.resolve(done(0, Object.keys(a.files).sort().join('\n')));
      if (argv[0] === 'pwd') return Promise.resolve(done(0, '/phone/' + a.id));
      if (argv[0] === 'echo') return Promise.resolve(done(0, argv.slice(1).join(' ')));
      if (argv[0] === 'cat') { var f = argv[1] && a.files[argv[1]]; return Promise.resolve(f == null ? done(1, 'cat: ' + argv[1] + ': no such file') : done(0, f)); }
      return runNode(a.files, argv[1] || 'index.js', 8000).then(function (r) { return done(r.code, r.out); });
    },
    rejectAction: function (id, i) { var a = Phone.get(id); if (!a.actions[i] || a.actions[i].status !== 'pending') return Promise.reject(new Error('action already handled')); a.actions[i].status = 'rejected'; Phone.put(a); return Promise.resolve(Phone.finish(id)); },
    failing: function (a) {
      var last = {};
      a.actions.forEach(function (x) { if (x.type === 'run_command' && x.status === 'done' && x.result) last[x.command] = x; });
      return Object.keys(last).filter(function (c) { return last[c].result.exit_code; }).map(function (c) { return { command: c, exit_code: last[c].result.exit_code, output: String(last[c].result.output || '').slice(-4000) }; });
    },
    FIX_ROUNDS: 2,
    finish: function (id) {
      var a = Phone.get(id);
      if (a.state === 'working' && a.actions.every(function (x) { return x.status !== 'pending' || x.risk.indexOf('blocked') === 0; })) {
        a.actions.forEach(function (x) { if (x.status === 'pending') x.status = 'skipped'; });
        var failing = Phone.failing(a);
        if (failing.length && (a.fix_round || 0) < Phone.FIX_ROUNDS && Phone.planFn) return Phone.fix(a, failing);
        a.checks = failing.length ? 'failed' : (a.actions.some(function (x) { return x.type === 'run_command' && x.status === 'done'; }) ? 'passed' : null);
        a.state = 'review'; a.log.push({ t: now(), kind: 'ready_for_review', checks: a.checks });
      }
      return Phone.put(a);
    },
    fix: function (a, failing) {
      // Same auto-fix loop as the server: send the failing output and current files back to the model.
      a.fix_round = (a.fix_round || 0) + 1; a.state = 'fixing'; a.log.push({ t: now(), kind: 'fixing', round: a.fix_round }); Phone.put(a);
      var files = Object.keys(a.files).map(function (p) { return '--- ' + p + ' ---\n' + String(a.files[p]).slice(0, 8000); }).join('\n').slice(0, 40000);
      var req = 'FIX REQUEST. Task: ' + a.prompt + '\nThe plan ran but these checks failed:\n' + failing.map(function (c) { return '$ ' + c.command + ' (exit ' + c.exit_code + ')\n' + c.output; }).join('\n') +
        '\n\nCurrent files:\n' + files + '\n\nReturn a plan whose actions rewrite only the files that need changes (full contents), then re-run the failing command(s) last.';
      var id = a.id;
      return Phone.planFn(req, a.model).then(function (r) {
        var b = Phone.get(id), cmds = failing.map(function (c) { return c.command; });
        var acts = r.plan.actions.slice();
        if (!acts.some(function (x) { return x.type === 'run_command' && cmds.indexOf(x.command) >= 0; })) cmds.forEach(function (c) { acts.push({ type: 'run_command', command: c }); });
        b.actions = b.actions.concat(acts.map(function (x) { var y = Object.assign({}, x, { status: 'pending', result: null, fix: b.fix_round }); y.risk = riskOf(y); return y; }));
        b.state = 'working'; Phone.put(b);
        if (b.policy !== 'session') return Phone.finish(id);
        var chain = Promise.resolve();
        b.actions.forEach(function (x, i) { if (x.status === 'pending' && x.risk.indexOf('blocked') !== 0) chain = chain.then(function () { return Phone.approveAction(id, i); }); });
        return chain.then(function () { return Phone.finish(id); });
      }, function (e) { var b = Phone.get(id); b.fix_round = Phone.FIX_ROUNDS; b.state = 'working'; b.log.push({ t: now(), kind: 'fix_failed', error: e.message }); Phone.put(b); return Phone.finish(id); });
    },
    reject: function (id) { var a = Phone.get(id); a.state = 'rejected'; return Promise.resolve(Phone.put(a)); },
    merge: function (id, override) { var a = Phone.get(id); if (a.state !== 'review') return Promise.reject(new Error('cannot merge now'));
      if (a.checks === 'failed' && !override) return Promise.reject(new Error('checks are failing: fix them, or merge anyway')); a.state = 'merged'; return Promise.resolve(Phone.put(a)); },
    diff: function (id) {
      var a = Phone.get(id), files = [], patch = '';
      Object.keys(a.files).sort().forEach(function (p) { var lines = a.files[p].split('\n'); files.push({ path: p, added: lines.length, removed: 0 });
        patch += 'diff --git a/' + p + ' b/' + p + '\nnew file\n--- /dev/null\n+++ b/' + p + '\n' + lines.map(function (l) { return '+' + l; }).join('\n') + '\n'; });
      return Promise.resolve({ files: files, patch: patch });
    },
    srcdoc: function (id, page) {
      var a = Phone.get(id), f = a.files; page = page || 'index.html';
      var html = f[page]; if (html == null) return null;
      html = html.replace(/<link[^>]*href=["']?([^"' >]+\.css)["']?[^>]*>/gi, function (m, h) { return f[h] != null ? '<style>' + f[h] + '</style>' : m; });
      html = html.replace(/<script[^>]*src=["']?([^"' >]+\.js)["']?[^>]*><\/script>/gi, function (m, h) { return f[h] != null ? '<script>' + f[h].replace(/<\/script/gi, '<\\/script') + '<\/script>' : m; });
      html = html.replace(/href=["']?([a-z0-9_\-\/]+\.html)["']?/gi, function (m, h) { return 'href="#fc:' + h + '"'; });
      return html;
    },
    clear: function () { save({ agents: {} }); }
  };
  g.FCPhone = Phone;
  if (typeof module !== 'undefined') module.exports = Phone;
})(this);
