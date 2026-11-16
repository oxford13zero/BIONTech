// ============================================================
// BION · Plataforma — aplicación principal
// ============================================================

// Claves de sesión (las mismas que usa la web actual, para convivir)
const TOKEN_KEY = 'bion_client_token';
const USER_KEY  = 'bion_client_user';

const S = {
  user: null,        // usuario con sesión iniciada
  loginError: '',
  loginBusy: false
};

const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Sesión ────────────────────────────────────────────────────
function storage(fn) { try { return fn(); } catch (e) { return null; } }

function tokenPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch (e) { return null; }
}

// Sesión válida: token de cliente, no vencido
function loadSession() {
  const token = storage(() => localStorage.getItem(TOKEN_KEY));
  const user  = storage(() => JSON.parse(localStorage.getItem(USER_KEY) || 'null'));
  const p = token && tokenPayload(token);
  if (!p || p.type !== 'client' || !p.exp || p.exp * 1000 <= Date.now() || !user) {
    clearSession();
    return null;
  }
  return user;
}

function clearSession() {
  storage(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); });
}

function getToken() { return storage(() => localStorage.getItem(TOKEN_KEY)); }

async function login(e) {
  e.preventDefault();
  const email = document.getElementById('lgEmail').value.trim();
  const password = document.getElementById('lgPass').value;
  if (!email || !password) { S.loginError = t('login_required'); return render(); }

  S.loginBusy = true; S.loginError = ''; render();
  try {
    const res = await fetch('/api/client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      S.loginError = res.status === 401 ? t('login_invalid')
        : res.status === 503 ? t('login_no_db') : t('login_error');
    } else {
      storage(() => {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      });
      S.user = data.user;
    }
  } catch (err) {
    S.loginError = t('login_network');
  }
  S.loginBusy = false;
  render();
}

function logout() {
  clearSession();
  S.user = null;
  S.loginError = '';
  render();
}

// ── Vistas ────────────────────────────────────────────────────
function viewLogin() {
  return `
  <div class="login-page">
    <div class="login-top"><button class="lang-btn" onclick="toggleLang()">${t('lang_switch')}</button></div>
    <form class="login-card" onsubmit="login(event)" novalidate>
      <img class="login-logo" src="/Logobion99.png" alt="BION">
      <p class="login-sub">${t('app_subtitle')}</p>
      <h1 class="login-title">${t('login_title')}</h1>
      ${S.loginError ? `<div class="form-error" role="alert">${esc(S.loginError)}</div>` : ''}
      <label class="field-label" for="lgEmail">${t('login_email')}</label>
      <input class="input" id="lgEmail" type="email" autocomplete="username" ${S.loginBusy ? 'disabled' : ''}>
      <label class="field-label" for="lgPass">${t('login_password')}</label>
      <input class="input" id="lgPass" type="password" autocomplete="current-password" ${S.loginBusy ? 'disabled' : ''}>
      <button class="btn btn-primary btn-block" type="submit" ${S.loginBusy ? 'disabled' : ''}>
        ${S.loginBusy ? t('login_loading') : t('login_submit')}
      </button>
    </form>
    <a class="login-back" href="/">${t('back_to_site')}</a>
  </div>`;
}

function viewHome() {
  const u = S.user;
  return `
  <div class="placeholder">
    <b>${t('welcome')}, ${esc(u.fullName || u.email)}</b>
    <span>${esc(u.companyName)}</span>
    <span>${t('role_' + u.role)}</span>
    <span>${t('coming_soon')}</span>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="lang-btn" onclick="toggleLang()">${t('lang_switch')}</button>
      <button class="btn btn-ghost" onclick="logout()">${t('logout')}</button>
    </div>
  </div>`;
}

function render() {
  // Mantener lo escrito en el login al re-renderizar (cambio de idioma, errores)
  const email = document.getElementById('lgEmail')?.value;
  document.getElementById('root').innerHTML = S.user ? viewHome() : viewLogin();
  if (!S.user) {
    const el = document.getElementById('lgEmail');
    if (email) el.value = email;
    (email ? document.getElementById('lgPass') : el).focus();
  }
}

setLang(LANG);
S.user = loadSession();
render();
