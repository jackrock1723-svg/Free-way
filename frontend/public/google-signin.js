/* Owner-only Google Identity Services popup client. Disabled unless same-origin config opts in. */
(function () {
  'use strict';

  var state = { mode: 'pending', clientId: null, csrf: null, authenticated: false, error: null };
  var generation = 0;
  var gisPromise = null;
  var activeChallenge = null;
  var onUnauthorized = null;

  function parseJson(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) { var error = new Error('Authentication request rejected'); error.status = response.status; throw error; }
      return body;
    });
  }

  function sameOrigin(path) {
    try { return new URL(path, location.href).origin === location.origin; } catch (_) { return false; }
  }

  function stripTokenQuery() {
    var url = new URL(location.href);
    if (!url.searchParams.has('token')) return;
    url.searchParams.delete('token');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  function bootstrap() {
    if (location.protocol === 'file:' || location.origin === 'null') {
      state.mode = 'disabled';
      return Promise.resolve(state);
    }
    return fetch('/api/auth/config', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(parseJson)
      .then(function (config) {
        if (!config || typeof config.enabled !== 'boolean' ||
            Object.keys(config).sort().join(',') !== 'client_id,enabled' ||
            (config.enabled && (typeof config.client_id !== 'string' || !/^[^\s]+\.apps\.googleusercontent\.com$/.test(config.client_id))) ||
            (!config.enabled && config.client_id !== null)) throw new Error('Authentication configuration unavailable');
        state.mode = config.enabled ? 'enabled' : 'disabled';
        state.clientId = config.enabled ? config.client_id : null;
        return fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
          .then(parseJson).then(function (session) {
            if (!session || typeof session.authenticated !== 'boolean' ||
                Object.keys(session).sort().join(',') !== 'authenticated,csrf' ||
                (session.authenticated ? typeof session.csrf !== 'string' || !session.csrf : session.csrf !== null)) {
              throw new Error('Authentication session unavailable');
            }
            state.authenticated = session.authenticated;
            state.csrf = session.csrf;
            if (state.mode === 'enabled') stripTokenQuery();
            return state;
          });
      })
      .catch(function () {
        state.mode = 'unknown';
        state.clientId = null;
        state.csrf = null;
        state.authenticated = false;
        state.error = 'Sign-in status could not be checked. Check your connection and try again.';
        return state;
      });
  }

  var ready = bootstrap();

  function loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve(window.google.accounts.id);
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = function () {
        if (window.google && window.google.accounts && window.google.accounts.id) resolve(window.google.accounts.id);
        else reject(new Error('Google sign-in could not be loaded. Try again.'));
      };
      script.onerror = function () { reject(new Error('Google sign-in could not be loaded. Try again.')); };
      document.head.appendChild(script);
    }).catch(function (error) {
      var failedScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (failedScript && failedScript.parentNode) failedScript.parentNode.removeChild(failedScript);
      gisPromise = null;
      throw error;
    });
    return gisPromise;
  }

  function gateMarkup(message) {
    return '<section class="google-gate" aria-labelledby="google-gate-title"><div class="google-gate-card card">' +
      '<svg class="fcmark" viewBox="0 0 64 64" aria-hidden="true"><path d="M19 48V16h25M19 31h15M34 31l12 17"/></svg>' +
      '<h1 id="google-gate-title" tabindex="-1">Sign in to Free way</h1>' +
      '<p class="google-gate-copy">This private workspace is available to its configured owner.</p>' +
      '<p class="google-gate-status" id="google-status" role="status" aria-live="polite">' + (message || 'Sign in to continue. No public accounts are created.') + '</p>' +
      '<button class="btn primary google-start" id="google-start" type="button" data-google-start>Continue with Google</button>' +
      '<div id="google-button" class="google-button" hidden></div>' +
      '<p class="google-gate-note">Google opens only after you choose to continue.</p></div></section>';
  }

  function mountGate(target, message) {
    if (!target) return;
    target.innerHTML = gateMarkup(message);
    var title = document.getElementById('google-gate-title');
    if (title) title.focus({ preventScroll: true });
  }

  function gateError(message) {
    var status = document.getElementById('google-status');
    if (status) status.textContent = message || 'Sign-in was not completed. Try again.';
    var start = document.getElementById('google-start');
    var button = document.getElementById('google-button');
    if (start) { start.hidden = false; start.disabled = false; start.textContent = 'Try again'; }
    if (button) { button.hidden = true; button.replaceChildren(); }
    activeChallenge = null;
  }

  function startLogin() {
    if (state.mode !== 'enabled' || state.authenticated) return;
    var attempt = ++generation;
    activeChallenge = null;
    var start = document.getElementById('google-start');
    var button = document.getElementById('google-button');
    var status = document.getElementById('google-status');
    if (start) { start.disabled = true; start.textContent = 'Preparing sign-in…'; }
    if (button) { button.hidden = true; button.replaceChildren(); }
    if (status) status.textContent = 'Preparing a secure sign-in…';
    fetch('/api/auth/challenge', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}'
    }).then(parseJson).then(function (challenge) {
      if (attempt !== generation) return;
      if (!challenge || typeof challenge.nonce !== 'string' || !challenge.nonce || typeof challenge.csrf !== 'string' || !challenge.csrf) {
        throw new Error('Authentication request rejected');
      }
      var captured = { nonce: challenge.nonce, csrf: challenge.csrf, used: false, attempt: attempt };
      activeChallenge = captured;
      return loadGis().then(function (gis) {
        if (attempt !== generation || activeChallenge !== captured) return;
        gis.initialize({
          client_id: state.clientId,
          ux_mode: 'popup',
          nonce: captured.nonce,
          auto_select: false,
          callback: function (response) { submitCredential(response, captured); }
        });
        if (button) {
          button.hidden = false;
          gis.renderButton(button, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' });
        }
        if (start) start.hidden = true;
        if (status) status.textContent = 'Choose the Google account for this private workspace.';
      });
    }).catch(function () {
      if (attempt === generation) gateError('Sign-in could not be prepared. Check your connection and try again.');
    });
  }

  function submitCredential(response, captured) {
    if (!response || typeof response.credential !== 'string' || !response.credential ||
        captured !== activeChallenge || captured.attempt !== generation || captured.used) return;
    captured.used = true;
    var status = document.getElementById('google-status');
    if (status) status.textContent = 'Checking sign-in…';
    fetch('/api/auth/google', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-FC-LOGIN-CSRF': captured.csrf },
      body: JSON.stringify({ credential: response.credential })
    }).then(parseJson).then(function (session) {
      if (captured !== activeChallenge || captured.attempt !== generation) return;
      if (!session || session.authenticated !== true || typeof session.csrf !== 'string' || !session.csrf) throw new Error('Authentication request rejected');
      state.authenticated = true;
      state.csrf = session.csrf;
      activeChallenge = null;
      location.reload();
    }).catch(function () {
      if (captured.attempt === generation) gateError('Sign-in was not completed. Try again.');
    });
  }

  function settingsCard() {
    if (state.mode !== 'enabled') return '';
    return '<section class="google-owner-card card" aria-labelledby="google-owner-title"><h3 id="google-owner-title">Owner access</h3>' +
      '<p class="google-owner-status" role="status">' + (state.authenticated ? 'Signed in to this private workspace.' : 'Sign-in is required for this workspace.') + '</p>' +
      (state.authenticated ? '<button class="btn ghost" type="button" data-google-signout>Sign out</button>' : '<button class="btn" type="button" data-google-start>Continue with Google</button>') +
      '</section>';
  }

  function signOut() {
    if (state.mode !== 'enabled' || !state.authenticated || !state.csrf) return;
    fetch('/api/auth/logout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-FC-CSRF': state.csrf }, body: '{}'
    }).then(parseJson).then(function () { location.reload(); }).catch(function () {
      var status = document.querySelector('.google-owner-status');
      if (status) status.textContent = 'Sign-out could not be completed. Check your connection and try again.';
    });
  }

  function prepare(path, method, headers) {
    return ready.then(function () {
      var next = {};
      Object.keys(headers || {}).forEach(function (key) { next[key] = headers[key]; });
      var same = sameOrigin(path);
      if (state.mode === 'unknown') {
        var error = new Error('Authentication status is unavailable'); error.status = 503; throw error;
      }
      if (state.mode === 'enabled') {
        Object.keys(next).forEach(function (key) { if (key.toLowerCase() === 'authorization') delete next[key]; });
        if (!state.authenticated) { var denied = new Error('Sign in to continue.'); denied.status = 401; throw denied; }
        if (same && /^(POST|PUT|DELETE)$/i.test(method || 'GET')) next['X-FC-CSRF'] = state.csrf;
      }
      return { headers: next, credentials: 'same-origin' };
    });
  }

  function handleUnauthorized() {
    if (state.mode !== 'enabled') return;
    state.authenticated = false;
    state.csrf = null;
    activeChallenge = null;
    generation++;
    mountGate(document.getElementById('main'), 'Your sign-in has expired. Sign in again to continue.');
  }

  document.addEventListener('click', function (event) {
    var start = event.target.closest && event.target.closest('[data-google-start]');
    if (start) { event.preventDefault(); startLogin(); return; }
    var out = event.target.closest && event.target.closest('[data-google-signout]');
    if (out) { event.preventDefault(); signOut(); }
  });

  window.GoogleSignIn = {
    ready: ready,
    get mode() { return state.mode; },
    get enabled() { return state.mode === 'enabled'; },
    get authenticated() { return state.authenticated; },
    get error() { return state.error; },
    prepare: prepare,
    mountGate: mountGate,
    settingsCard: settingsCard,
    handleUnauthorized: handleUnauthorized
  };
})();
