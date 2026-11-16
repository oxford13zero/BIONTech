// ============================================================
// BION · Plataforma — aplicación principal
// ============================================================

// Claves de sesión (las mismas que usa la web actual, para convivir)
const TOKEN_KEY = 'bion_client_token';
const USER_KEY  = 'bion_client_user';

const S = {
  user: null,        // usuario con sesión iniciada
  loginError: '',
  loginBusy: false,
  data: null,        // { branches, systems } visibles para el usuario
  route: 'dashboard' // sección actual (#/ruta)
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
      loadData();
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
  S.data = null;
  S.loginError = '';
  history.replaceState(null, '', location.pathname);
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

// ── Datos del cliente ─────────────────────────────────────────
// Sistemas y divisiones visibles para el usuario (ya filtrados por rol en el servidor)
async function apiGet(url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadData() {
  try {
    // Sistemas con datos de riesgo y divisiones (el servidor filtra por rol)
    const [systems, branches] = await Promise.all([
      apiGet('/api/client-data?type=ai_systems_full'),
      apiGet('/api/client-data?type=branches')
    ]);
    S.data = { branches, systems };
  } catch (e) {
    if (!S.user) return;
    console.error('loadData', e);
    S.data = { branches: [], systems: [], error: true };
  }
  render();
}

// ── Menú ──────────────────────────────────────────────────────
const GROUPS = [1, 2, 3, 4];
const countGroup = g => (S.data?.systems || []).filter(s => Number(s.inventory_group) === g).length;

// Cada ítem: id = ruta (#/id), label = clave de texto, count opcional, kids opcional
function menu() {
  const items = [
    { id: 'dashboard', label: 'nav_dashboard' },
    { sec: 'nav_sec_inventory' },
    { id: 'inventario', label: 'nav_systems', count: () => (S.data?.systems || []).length,
      kids: GROUPS.map(g => ({ id: 'inventario/g' + g, label: 'group_' + g, count: () => countGroup(g) })) },
    { id: 'divisiones', label: 'nav_divisions', count: () => (S.data?.branches || []).length },
    { sec: 'nav_sec_risk' },
    { id: 'reportes', label: 'nav_reporting', kids: [
      { id: 'reportes/iso',  label: 'report_iso' },
      { id: 'reportes/nist', label: 'report_nist' },
      { id: 'reportes/eu',   label: 'report_eu' }
    ] }
  ];
  // Configuración: solo Super usuario empresa
  if (S.user.role === 'super_empresa') {
    items.push({ sec: 'nav_sec_settings' }, { id: 'equipo', label: 'nav_team' });
  }
  return items;
}

function findItem(items, id) {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.kids) { const r = findItem(it.kids, id); if (r) return r; }
  }
  return null;
}

// Padre de una ruta hija (para la ruta de navegación y abrir submenús)
function parentOf(id) {
  return menu().find(it => it.kids && it.kids.some(k => k.id === id)) || null;
}

function sideHtml(items, depth = 0) {
  return items.map(it => {
    if (it.sec) return `<div class="sec-title">${t(it.sec)}</div>`;
    const active = S.route === it.id;
    const open = it.kids && (active || it.kids.some(k => k.id === S.route));
    const count = it.count && S.data ? `<span class="badge">${it.count()}</span>` : '';
    const caret = it.kids ? `<span class="caret">${open ? '▾' : '▸'}</span>` : `<span class="caret"></span>`;
    return `<a class="item ${active ? 'active' : ''}" href="#/${it.id}" onclick="closeSide()">${depth ? '' : caret}<span>${t(it.label)}</span>${count}</a>
      ${it.kids && open ? `<div class="kids">${sideHtml(it.kids, depth + 1)}</div>` : ''}`;
  }).join('');
}

// ── Navegación ────────────────────────────────────────────────
function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function currentRoute() {
  const { path } = parseHash();
  return findItem(menu(), path) ? path : 'dashboard';
}

function openSide()  { document.body.classList.add('side-open'); }
function closeSide() { document.body.classList.remove('side-open'); }

// ── Vistas de la plataforma ───────────────────────────────────
function pageHead() {
  const it = findItem(menu(), S.route);
  const parent = parentOf(S.route);
  const crumb = [t('app_crumb_root'), parent && t(parent.label), t(it.label)].filter(Boolean).join(' · ');
  return `<h1>${t(it.label)}</h1><div class="crumb">${esc(crumb)}</div>`;
}

function viewPage() {
  if (S.route === 'dashboard') return pageHead() + viewDashboard();
  if (S.route.startsWith('inventario')) return pageHead() + viewInventory();
  return pageHead() + `<div class="card empty">${t('section_soon')}</div>`;
}

// ── Dashboard ─────────────────────────────────────────────────
const LEVELS = ['Critical', 'High', 'Medium', 'Low'];
const LEVEL_CLS = { Critical: 'l-crit', High: 'l-high', Medium: 'l-med', Low: 'l-low' };
const riskChip = l => l ? `<span class="chip ${LEVEL_CLS[l] || 'c-n'}">${t('risk_' + l)}</span>` : `<span class="chip c-n">—</span>`;

const today = () => new Date().toISOString().slice(0, 10);
const isUnassessed = s => !s.compliance_status || s.compliance_status === 'Sin evaluar';
const isOverdue = s => !!s.next_review_date && String(s.next_review_date).slice(0, 10) < today();
const isHighRisk = s => s.risk_level === 'Critical' || s.risk_level === 'High';

function viewDashboard() {
  if (!S.data) return `<div class="card empty">${t('loading')}</div>`;
  const sys = S.data.systems;
  const tiles = [
    ['dash_total',      sys.length,                         ''],
    ['dash_high_risk',  sys.filter(isHighRisk).length,      'high'],
    ['dash_unassessed', sys.filter(isUnassessed).length,    'unassessed'],
    ['dash_overdue',    sys.filter(isOverdue).length,       'overdue']
  ];

  // Mapa: divisiones × niveles de riesgo
  const rows = S.data.branches.map(b => {
    const list = sys.filter(s => String(s.branch_id) === String(b.id));
    return `<tr><td class="l">${esc(b.name)}</td>${LEVELS.map(l => {
      const n = list.filter(s => s.risk_level === l).length;
      return `<td class="n ${n ? LEVEL_CLS[l] + '-t' : ''}">${n || '·'}</td>`;
    }).join('')}<td class="n">${list.length}</td></tr>`;
  }).join('');

  // Requieren atención: revisión vencida, o Crítico sin evaluar
  const attention = sys
    .filter(s => isOverdue(s) || (s.risk_level === 'Critical' && isUnassessed(s)))
    .sort((a, b) => LEVELS.indexOf(a.risk_level) - LEVELS.indexOf(b.risk_level))
    .slice(0, 10);
  const attRows = attention.map(s => `
    <tr class="row" onclick="location.hash='#/inventario?q=${encodeURIComponent(s.system_code)}'">
      <td><b>${esc(s.name)}</b><small>${esc(s.system_code)}</small></td>
      <td>${esc(s.branch_name || '—')}</td>
      <td>${riskChip(s.risk_level)}</td>
      <td>${[isOverdue(s) ? `<span class="chip c-r">${t('reason_overdue')}</span>` : '',
             isUnassessed(s) ? `<span class="chip c-a">${t('reason_unassessed')}</span>` : ''].join(' ')}</td>
    </tr>`).join('');

  return `
    <div class="tiles">${tiles.map(([k, n, sc]) =>
      `<a class="tile" href="#/inventario${sc ? '?sc=' + sc : ''}"><b>${n}</b>${t(k)}</a>`).join('')}</div>
    <div class="dash-grid">
      <div class="card">
        <h3>${t('dash_map')}</h3>
        <div class="tbl-wrap"><table class="map">
          <thead><tr><th class="l">${t('division')}</th>${LEVELS.map(l => `<th>${t('risk_' + l)}</th>`).join('')}<th>${t('total')}</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty">${t('no_divisions')}</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h3>${t('dash_attention')}</h3>
        ${attRows ? `<div class="tbl-wrap"><table>
          <thead><tr><th>${t('system')}</th><th>${t('division')}</th><th>${t('risk')}</th><th>${t('reason')}</th></tr></thead>
          <tbody>${attRows}</tbody></table></div>`
        : `<div class="empty small">${t('dash_attention_none')}</div>`}
      </div>
    </div>`;
}


// ── Inventario: lista ─────────────────────────────────────────
// Filtros guardados en la dirección: #/inventario/g1?q=&div=&risk=&status=&sc=
const SHORTCUTS = { high: isHighRisk, unassessed: isUnassessed, overdue: isOverdue };
const statusLabel = s => isUnassessed(s) ? t('reason_unassessed') : s.compliance_status;

function invFilters() {
  const p = parseHash().params;
  return { q: p.q || '', div: p.div || '', risk: p.risk || '', status: p.status || '', sc: p.sc || '' };
}

function setInvFilter(key, value) {
  const f = invFilters();
  f[key] = value;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  history.replaceState(null, '', '#/' + S.route + (qs ? '?' + qs : ''));
  if (key === 'q') document.getElementById('invTable').innerHTML = invTable();  // conservar el foco al escribir
  else render();
}

function invList() {
  const f = invFilters();
  const g = S.route.match(/^inventario\/g(\d)$/);
  const q = f.q.toLowerCase();
  return (S.data?.systems || []).filter(s =>
    (!g || Number(s.inventory_group) === Number(g[1])) &&
    (!q || [s.name, s.system_code, s.vendor].join(' ').toLowerCase().includes(q)) &&
    (!f.div || String(s.branch_id) === f.div) &&
    (!f.risk || s.risk_level === f.risk) &&
    (!f.status || statusLabel(s) === f.status) &&
    (!f.sc || (SHORTCUTS[f.sc] && SHORTCUTS[f.sc](s)))
  );
}

function invTable() {
  const list = invList();
  const total = (S.data?.systems || []).length;
  const rows = list.map(s => `
    <tr>
      <td><b>${esc(s.name)}</b><small>${esc(s.system_code)}</small></td>
      <td>${esc(s.vendor || '—')}</td>
      <td>${t('group_' + s.inventory_group)}</td>
      <td>${esc(s.branch_name || '—')}</td>
      <td>${riskChip(s.risk_level)}</td>
      <td>${isUnassessed(s) ? `<span class="chip c-a">${t('reason_unassessed')}</span>` : `<span class="chip c-g">${esc(s.compliance_status)}</span>`}</td>
    </tr>`).join('');
  return `<div class="tbl-wrap"><table>
      <thead><tr><th>${t('system')}</th><th>${t('vendor')}</th><th>${t('group')}</th><th>${t('division')}</th><th>${t('risk')}</th><th>${t('status')}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty small">${t('inv_none')}</td></tr>`}</tbody>
    </table></div>
    <p class="count-note">${t('inv_count').replace('{n}', list.length).replace('{total}', total)}</p>`;
}

function viewInventory() {
  if (!S.data) return `<div class="card empty">${t('loading')}</div>`;
  const f = invFilters();
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  const statuses = [...new Set(S.data.systems.map(statusLabel).filter(Boolean))].sort();
  const multiDiv = S.data.branches.length > 1;
  const chips = Object.keys(SHORTCUTS).map(k =>
    `<button class="sc ${f.sc === k ? 'on' : ''}" onclick="setInvFilter('sc', '${f.sc === k ? '' : k}')">${t('sc_' + k)}</button>`).join('');

  return `
    <div class="toolbar">
      <input class="input search" type="text" placeholder="${t('inv_search')}" value="${esc(f.q)}" oninput="setInvFilter('q', this.value)">
      ${multiDiv ? `<select class="input" onchange="setInvFilter('div', this.value)">${opt('', t('all_divisions'), f.div)}${S.data.branches.map(b => opt(String(b.id), b.name, f.div)).join('')}</select>` : ''}
      <select class="input" onchange="setInvFilter('risk', this.value)">${opt('', t('all_risks'), f.risk)}${LEVELS.map(l => opt(l, t('risk_' + l), f.risk)).join('')}</select>
      <select class="input" onchange="setInvFilter('status', this.value)">${opt('', t('all_statuses'), f.status)}${statuses.map(x => opt(x, x, f.status)).join('')}</select>
    </div>
    <div class="shortcuts">${chips}</div>
    <div class="card" id="invTable">${invTable()}</div>`;
}

function viewShell() {
  const u = S.user;
  return `
  <div class="app">
    <div class="side-backdrop" onclick="closeSide()"></div>
    <aside class="side">
      <div class="brand">
        <img src="/Logobion99.png" alt="BION">
        <span>${esc(u.companyName)}</span>
      </div>
      <nav>${sideHtml(menu())}</nav>
      <div class="side-foot">
        <div class="who"><b>${esc(u.fullName || u.email)}</b><span>${t('role_' + u.role)}</span></div>
        <div class="foot-actions">
          <button class="lang-btn" onclick="toggleLang()">${t('lang_switch')}</button>
          <button class="btn btn-ghost btn-sm" onclick="logout()">${t('logout')}</button>
        </div>
      </div>
    </aside>
    <main>
      <div class="topbar">
        <button class="menu-btn" onclick="openSide()" aria-label="${t('open_menu')}">☰</button>
        <span>${esc(u.companyName)}</span>
      </div>
      ${S.data?.error ? `<div class="alert">${t('data_error')}</div>` : ''}
      ${viewPage()}
    </main>
  </div>`;
}

function render() {
  // Mantener lo escrito en el login al re-renderizar (cambio de idioma, errores)
  const email = document.getElementById('lgEmail')?.value;
  if (S.user) S.route = currentRoute();
  document.getElementById('root').innerHTML = S.user ? viewShell() : viewLogin();
  if (!S.user) {
    const el = document.getElementById('lgEmail');
    if (email) el.value = email;
    (email ? document.getElementById('lgPass') : el).focus();
  }
}

window.addEventListener('hashchange', () => { if (S.user) { render(); window.scrollTo(0, 0); } });

setLang(LANG);
S.user = loadSession();
render();
if (S.user) loadData();
