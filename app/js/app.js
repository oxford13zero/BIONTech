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
  data: null,        // { branches } visibles para el usuario
  route: 'dashboard', // sección actual (#/ruta)
  division: 'all',   // división elegida en el selector ('all' = todas)
  nav: null          // conteos del menú: { assets, models, pending }
};

const DIVISION_KEY = 'bion_app_division';

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
      initDivision();
      loadData();
      loadNav();
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
  S.nav = null;
  S.rep = null;
  S.division = 'all';
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
    // Divisiones visibles para el usuario (el servidor filtra por rol)
    const branches = await apiGet('/api/client-data?type=branches');
    S.divStats = null;   // recalcular instalaciones por división
    S.data = { branches };
    checkDivision();
  } catch (e) {
    if (!S.user) return;
    console.error('loadData', e);
    S.data = { branches: [], error: true };
  }
  render();
}

// ── Permisos (los entrega el login; misma tabla que el servidor) ─
// Respaldo para sesiones iniciadas antes de que el login enviara los permisos.
const FALLBACK_PERMISSIONS = {
  super_empresa:    { 'inventory.view': 'company', 'asset.write': 'company', 'instance.write': 'company', 'model.write': 'company',
                      'version.write': 'company', 'version.apply': 'company', 'incident.create': 'company', 'incident.write': 'company', 'report.generate': 'company' },
  super_division:   { 'inventory.view': 'division', 'asset.write': 'division', 'instance.write': 'division', 'version.apply': 'division',
                      'incident.create': 'division', 'incident.write': 'division', 'report.generate': 'division' },
  usuario_division: { 'inventory.view': 'division', 'incident.create': 'division', 'report.generate': 'division' }
};
function can(action) {
  const perms = S.user.permissions || FALLBACK_PERMISSIONS[S.user.role] || {};
  return perms[action] || null;
}

// ── Selector de división ──────────────────────────────────────
// Super usuario empresa elige ('all' o una división); los demás quedan fijos en la suya.
const canChooseDivision = () => S.user.role === 'super_empresa';

function initDivision() {
  if (!canChooseDivision()) { S.division = String(S.user.divisionId || 'all'); return; }
  S.division = storage(() => localStorage.getItem(DIVISION_KEY)) || 'all';
}

// División para las APIs nuevas (vacío = todas)
const divisionParam = () => (S.division && S.division !== 'all' ? S.division : '');

function setDivision(id) {
  S.division = id || 'all';
  storage(() => localStorage.setItem(DIVISION_KEY, S.division));
  S.rep = null;            // el Reporting Hub toma la nueva división
  render();
  loadNav();
}

// Si la división guardada ya no existe (o no es de esta empresa), volver a "todas"
function checkDivision() {
  if (!canChooseDivision() || S.division === 'all' || !S.data) return;
  if (!S.data.branches.some(b => String(b.id) === String(S.division))) {
    S.division = 'all';
    storage(() => localStorage.removeItem(DIVISION_KEY));
    loadNav();
  }
}

function divisionBar() {
  // Informes de gobernanza: la cobertura se elige dentro del informe
  if (S.route === 'reportes' || grIsConfigRoute(S.route)) return '';
  const branches = S.data?.branches || [];
  if (!canChooseDivision()) {
    const own = branches.find(b => String(b.id) === String(S.user.divisionId));
    return `<div class="divbar"><span class="divbar-label">${t('division')}:</span><b>${esc(own?.name || '—')}</b></div>`;
  }
  const opt = (v, label) => `<option value="${esc(v)}" ${String(v) === String(S.division) ? 'selected' : ''}>${esc(label)}</option>`;
  return `<div class="divbar">
    <label class="divbar-label" for="divSelect">${t('division')}:</label>
    <select class="input divbar-select" id="divSelect" onchange="setDivision(this.value)">
      ${opt('all', t('all_divisions'))}${branches.map(b => opt(b.id, b.name)).join('')}
    </select></div>`;
}

// Conteos del menú (activos, modelos y pendientes de la división elegida)
async function loadNav() {
  const div = divisionParam();
  const q = div ? '?division=' + encodeURIComponent(div) : '';
  try {
    const [assets, models, pending] = await Promise.all([
      apiGet('/api/assets' + q), apiGet('/api/models' + q), apiGet('/api/pending' + q)
    ]);
    S.nav = { assets: assets.length, models: models.length, pending: pending.counts.total };
  } catch (e) {
    if (!S.user) return;
    console.error('loadNav', e);
    S.nav = null;
  }
  render();
}

// ── Menú ──────────────────────────────────────────────────────

// Cada ítem: id = ruta (#/id), label = clave de texto, count opcional, kids opcional
function menu() {
  const navCount = k => (S.nav ? S.nav[k] : null);
  const items = [
    { id: 'dashboard', label: 'nav_dashboard' },
    { sec: 'nav_sec_inventory' },
    { id: 'activos', label: 'nav_assets', count: () => navCount('assets') },
    { id: 'modelos', label: 'nav_models', count: () => navCount('models') },
    { sec: 'nav_sec_risk' },
    { id: 'incidentes', label: 'nav_incidents' },
    { id: 'pendientes', label: 'nav_pending', count: () => navCount('pending'), alert: true },
    { id: 'reportes', label: 'nav_reporting', kids: [
      { id: 'reportes/iso',  label: 'report_iso' },
      { id: 'reportes/nist', label: 'report_nist' },
      { id: 'reportes/eu',   label: 'report_eu' }
    ] },
    { sec: 'nav_sec_settings' },
    { id: 'divisiones', label: 'nav_divisions' }
  ];
  // Equipo: solo Super usuario empresa
  if (S.user.role === 'super_empresa') items.push({ id: 'equipo', label: 'nav_team' });
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
    // Activo también en sus subpáginas (ej. activos/<id>), salvo los ítems con submenú
    const active = S.route === it.id || (!it.kids && S.route.startsWith(it.id + '/')) || (it.id === 'reportes' && grIsConfigRoute(S.route));
    const open = it.kids && (active || it.kids.some(k => k.id === S.route));
    const n = it.count ? it.count() : null;
    const count = n !== null && n !== undefined ? `<span class="badge ${it.alert && n > 0 ? 'badge-alert' : ''}">${n}</span>` : '';
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
  if (/^activos\/[\w-]+(\/editar)?$/.test(path)) return path;   // ficha, nuevo y editar activo
  if (/^modelos\/[\w-]+$/.test(path)) return path;                // ficha y nuevo modelo
  if (/^instancias\/[\w-]+$/.test(path)) return path;             // ficha de la instalación
  if (/^incidentes\/[\w-]+(\/editar)?$/.test(path)) return path; // registrar, ficha y editar incidente
  if (grIsConfigRoute(path)) return path;                         // configuración de un informe (reports.js)
  return findItem(menu(), path) ? path : 'dashboard';
}

function openSide()  { document.body.classList.add('side-open'); }
function closeSide() { document.body.classList.remove('side-open'); }

// ── Vistas de la plataforma ───────────────────────────────────
function pageHead() {
  const it = findItem(menu(), S.route) || { label: 'nav_dashboard' };
  const parent = parentOf(S.route);
  const crumb = [t('app_crumb_root'), parent && t(parent.label), t(it.label)].filter(Boolean).join(' · ');
  return `<h1>${t(it.label)}</h1><div class="crumb">${esc(crumb)}</div>`;
}

function viewPage() {
  if (S.route === 'dashboard') return pageHead() + viewDashboard();
  if (S.route === 'divisiones') return pageHead() + viewDivisions();
  if (S.route === 'reportes' || grIsConfigRoute(S.route)) return viewGovReports();   // informes de gobernanza (reports.js)
  if (S.route.startsWith('reportes')) return pageHead() + viewReports();             // informe con IA (ISO, NIST, EU)
  if (S.route === 'equipo') return pageHead() + viewTeam();
  if (S.route === 'activos') return pageHead() + viewAssets();
  if (S.route.startsWith('activos/')) return viewAssets();
  if (S.route === 'modelos') return pageHead() + viewModels();
  if (S.route.startsWith('modelos/')) return viewModels();
  if (S.route.startsWith('instancias/')) return viewInstance();
  if (S.route === 'incidentes') return pageHead() + viewIncidents();
  if (S.route === 'pendientes') return pageHead() + viewPending();
  if (S.route.startsWith('incidentes/')) return viewIncidents();
  // Activos, Modelos, Incidentes y Pendientes: se construyen en los pasos 3b a 3h
  return pageHead() + `<div class="card empty">${t('section_soon')}</div>`;
}

// ── Dashboard ─────────────────────────────────────────────────
const LEVELS = ['Critical', 'High', 'Medium', 'Low'];
const LEVEL_CLS = { Critical: 'l-crit', High: 'l-high', Medium: 'l-med', Low: 'l-low' };
const riskChip = l => l ? `<span class="chip ${LEVEL_CLS[l] || 'c-n'}">${t('risk_' + l)}</span>` : `<span class="chip c-n">—</span>`;

const today = () => new Date().toISOString().slice(0, 10);

async function loadDashboard(key) {
  S.dash = { key, loading: true };
  const q = divisionParam() ? '?division=' + encodeURIComponent(divisionParam()) : '';
  try { S.dash = { key, data: await apiGet('/api/dashboard' + q) }; }
  catch (e) { if (!S.user) return; S.dash = { key, error: true }; }
  if (S.route === 'dashboard') render();
}

function viewDashboard() {
  const key = S.division;
  if (!S.dash || S.dash.key !== key) loadDashboard(key);
  const d = S.dash;
  if (d.loading || (!d.data && !d.error)) return `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return `<div class="card empty">${t('data_error')}</div>`;
  const { counts: c, risk_map, attention: at, recent_incidents } = d.data;

  const tiles = [
    ['dash_assets', c.assets, '#/activos'],
    ['dash_models', c.models, '#/modelos'],
    ['dash_high_risk_inst', c.high_risk, '#/modelos'],
    ['dash_pending', c.pending, '#/pendientes'],
    ['dash_incidents_12m', c.incidents_12m, '#/incidentes?status=todos&from=' + new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)]
  ];
  const mapRows = risk_map.map(b => `<tr><td class="l">${esc(b.name)}</td>${LEVELS.map(l =>
      `<td class="n ${b[l] ? LEVEL_CLS[l] + '-t' : ''}">${b[l] || '·'}</td>`).join('')}<td class="n">${b.total}</td></tr>`).join('');

  const attItems = [
    ...at.serious_open_incidents.map(x => ({ href: '#/incidentes/' + x.id, main: esc(x.title),
      sub: `${esc(x.occurred_at)} · ${esc(x.asset_code)} · ${t('ist_' + x.status)}`, tag: sevChip(x.severity) })),
    ...at.reclassification_pending.map(i => ({ href: '#/instancias/' + i.id, main: esc(i.model_name),
      sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${verLabel(i.version)}`, tag: `<span class="chip c-a">${t('reclass_pending')}</span>` })),
    ...at.reviews_overdue.map(i => ({ href: '#/instancias/' + i.id, main: esc(i.model_name),
      sub: `${esc(i.asset_code || t('asset_unassigned'))}`, tag: `<span class="chip c-r">${t('review_was_due').replace('{d}', esc(i.next_review_date))}</span>` }))
  ];
  const more = (at.totals.reclassification_pending - at.reclassification_pending.length) + (at.totals.reviews_overdue - at.reviews_overdue.length);
  const recRows = recent_incidents.map(x => `
    <tr class="row" onclick="location.hash='#/incidentes/${esc(x.id)}'">
      <td>${esc(x.occurred_at)}</td><td><b>${esc(x.title)}</b><small>${esc(x.asset_code)}</small></td>
      <td>${x.model_name ? esc(x.model_name) + `<small>${verLabel(x.version)}</small>` : `<span class="chip c-a">${t('model_undetermined')}</span>`}</td>
      <td>${sevChip(x.severity)}</td></tr>`).join('');

  return `
    <div class="tiles tiles-5">${tiles.map(([k, n, href]) => `<a class="tile" href="${href}"><b>${n}</b>${t(k)}</a>`).join('')}</div>
    <div class="dash-grid">
      <div class="card">
        <h3>${t('dash_map_inst')}</h3>
        <div class="tbl-wrap"><table class="map">
          <thead><tr><th class="l">${t('division')}</th>${LEVELS.map(l => `<th>${t('risk_' + l)}</th>`).join('')}<th>${t('total')}</th></tr></thead>
          <tbody>${mapRows || `<tr><td colspan="6" class="empty">${t('no_divisions')}</td></tr>`}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h3>${t('dash_attention')}</h3>
        ${attItems.length ? `<div class="pend-list">${attItems.map(x => `
          <a class="pend-item" href="${x.href}"><span class="pend-main"><b>${x.main}</b><small>${x.sub}</small></span>${x.tag}<span class="arrow">›</span></a>`).join('')}</div>
          ${more > 0 ? `<p class="count-note"><a href="#/pendientes">${t('dash_more_pending').replace('{n}', more)}</a></p>` : ''}`
        : `<div class="empty small">${t('dash_attention_none')}</div>`}
      </div>
    </div>
    <div class="card mt">
      <h3>${t('dash_recent_incidents')}</h3>
      ${recRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('f_date')}</th><th>${t('f_title')}</th><th>${t('model')}</th><th>${t('f_severity')}</th></tr></thead>
        <tbody>${recRows}</tbody></table></div>` : `<div class="empty small">${t('no_incidents')}</div>`}
    </div>`;
}

// ── Ayudantes de campos (los usa la ficha de la instalación) ─
function fmtValue(v, fmt) {
  if (v === null || v === undefined || v === '') return null;
  if (fmt === 'bool' || typeof v === 'boolean') return v === true || v === 'true' ? t('yes') : t('no');
  if (fmt === 'scale5') return v + ' / 5';
  if (fmt === 'seconds') return v + ' s';
  if (fmt === 'pct') return v + ' %';
  if (fmt === 'usd') return 'USD ' + Number(v).toLocaleString(LANG === 'es' ? 'es-CL' : 'en-US');
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return String(v).slice(0, 10);
  return String(v);
}

const NUMBER_FMTS = ['scale5', 'seconds', 'pct', 'usd', 'number'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function controlType(col, fmt, value) {
  if (FIELD_OPTIONS[col]) return 'select';
  if (fmt === 'bool') return 'bool';
  if (NUMBER_FMTS.includes(fmt)) return 'number';
  if (DATE_FIELDS.includes(col)) return 'date';
  return 'text';
}

function inputHtml(col, fmt, raw) {
  const type = controlType(col, fmt, raw);
  const val = raw === null || raw === undefined ? '' : String(raw);
  const attrs = `class="input edit-input" data-col="${col}" data-type="${type}"`;
  if (type === 'bool') {
    const cur = raw === true || raw === 'true' ? 'true' : raw === false || raw === 'false' ? 'false' : '';
    return `<select ${attrs}><option value=""></option>
      <option value="true" ${cur === 'true' ? 'selected' : ''}>${t('yes')}</option>
      <option value="false" ${cur === 'false' ? 'selected' : ''}>${t('no')}</option></select>`;
  }
  if (type === 'select') {
    const opts = FIELD_OPTIONS[col];
    return `<select ${attrs}><option value=""></option>${opts.map(o =>
      `<option value="${esc(o)}" ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}
      ${val && !opts.includes(val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : ''}</select>`;
  }
  if (type === 'number') return `<input ${attrs} type="number" step="any" value="${esc(val)}">`;
  if (type === 'date') return `<input ${attrs} type="date" value="${esc(DATE_RE.test(val) ? val.slice(0, 10) : '')}">`;
  return `<textarea ${attrs} rows="${val.length > 80 ? 3 : 1}">${esc(val)}</textarea>`;
}

// Valor del control → valor para la BD (vacío = null)
function inputValue(el) {
  const v = el.value.trim();
  if (v === '') return null;
  if (el.dataset.type === 'bool') return v === 'true';
  if (el.dataset.type === 'number') return Number(v);
  return v;
}

function sameValue(a, b) {
  const norm = x => x === null || x === undefined || x === '' ? null
    : (typeof x === 'string' && DATE_RE.test(x)) ? x.slice(0, 10) : String(x);
  return norm(a) === norm(b);
}

// ── Divisiones ────────────────────────────────────────────────
// S.divForm = { id|null, values, error, busy } mientras se crea o edita
const isSuperEmpresa = () => S.user.role === 'super_empresa';

async function clientWrite(action, body) {
  const res = await fetch('/api/client-write?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!res.ok) { const e = new Error(data.error || 'HTTP ' + res.status); e.data = data; throw e; }
  return data;
}

function divFormHtml() {
  const f = S.divForm, v = f.values || {};
  return `<div class="card div-form">
    <h3>${f.id ? t('edit_division') : t('new_division')}</h3>
    ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}
    <div class="fields form">
      <div class="field"><label for="dv_name">${t('f_div_name')} *</label><input class="input" id="dv_name" value="${esc(v.name || '')}"></div>
      <div class="field"><label for="dv_address">${t('f_address')}</label><input class="input" id="dv_address" value="${esc(v.address || '')}"></div>
      <div class="field"><label for="dv_country">${t('f_country')}</label><input class="input" id="dv_country" value="${esc(v.country || 'Chile')}"></div>
    </div>
    <div class="edit-bar">
      <button class="btn btn-ghost" onclick="closeDivForm()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <button class="btn btn-primary" onclick="saveDivision()" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : t('save')}</button>
    </div>
  </div>`;
}

// Instalaciones por división (del mapa de riesgo del Dashboard)
async function loadDivStats() {
  S.divStats = { loading: true };
  try {
    const d = await apiGet('/api/dashboard');
    S.divStats = { byId: Object.fromEntries(d.risk_map.map(r => [String(r.id), r])) };
  } catch (e) { if (!S.user) return; S.divStats = { byId: {} }; }
  if (S.route === 'divisiones') render();
}

// Abrir los activos de una división (el Super usuario empresa cambia el selector a esa división)
function goDivision(id) {
  if (canChooseDivision()) {
    S.division = String(id);
    storage(() => localStorage.setItem(DIVISION_KEY, S.division));
    loadNav();
  }
  location.hash = '#/activos';
}

function viewDivisions() {
  if (!S.data) return `<div class="card empty">${t('loading')}</div>`;
  if (!S.divStats) loadDivStats();
  const admin = isSuperEmpresa();
  const rows = S.data.branches.map(b => {
    const st = S.divStats?.byId?.[String(b.id)];
    const crit = st ? st.Critical : 0, high = st ? st.High : 0;
    return `<tr class="row" onclick="goDivision('${esc(b.id)}')">
      <td><b>${esc(b.name)}</b>${b.address ? `<small>${esc(b.address)}</small>` : ''}</td>
      <td>${esc(b.country || '—')}</td>
      <td>${st ? st.total : (S.divStats?.loading ? '…' : 0)}</td>
      <td>${crit ? `<span class="chip l-crit">${crit} ${t('risk_Critical')}</span> ` : ''}${high ? `<span class="chip l-high">${high} ${t('risk_High')}</span>` : ''}${!crit && !high ? '<span class="no-info">—</span>' : ''}</td>
      ${admin ? `<td class="actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm" onclick="openDivForm('${esc(b.id)}')" ${S.divForm ? 'disabled' : ''}>${t('edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deactivateDivision('${esc(b.id)}')" ${S.divForm ? 'disabled' : ''}>${t('deactivate')}</button>
      </td>` : ''}
    </tr>`;
  }).join('');
  return `
    ${admin && !S.divForm ? `<div class="page-actions"><button class="btn btn-primary" onclick="openDivForm()">+ ${t('new_division')}</button></div>` : ''}
    ${S.divForm ? divFormHtml() : ''}
    ${S.divMsg ? `<div class="alert">${esc(S.divMsg)}</div>` : ''}
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>${t('division')}</th><th>${t('f_country')}</th><th>${t('installations')}</th><th>${t('high_risk_short')}</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty small">${t('no_divisions')}</td></tr>`}</tbody>
    </table></div></div>`;
}

function openDivForm(id) {
  const b = id ? S.data.branches.find(x => String(x.id) === String(id)) : null;
  S.divMsg = '';
  S.divForm = { id: id || null, values: b ? { name: b.name, address: b.address, country: b.country } : {} };
  render();
  document.getElementById('dv_name')?.focus();
}

function closeDivForm() { S.divForm = null; render(); }

async function saveDivision() {
  const f = S.divForm;
  f.values = {
    name: document.getElementById('dv_name').value.trim(),
    address: document.getElementById('dv_address').value.trim(),
    country: document.getElementById('dv_country').value.trim()
  };
  if (!f.values.name) { f.error = t('required_fields') + ' ' + t('f_div_name'); return render(); }
  f.busy = true; f.error = ''; render();
  try {
    if (f.id) await clientWrite('update_branch', { branch_id: f.id, ...f.values });
    else await clientWrite('insert_branch', f.values);
  } catch (e) {
    f.busy = false; f.error = t('save_error') + ' ' + e.message; return render();
  }
  S.divForm = null;
  loadData();
}

async function deactivateDivision(id) {
  const b = S.data.branches.find(x => String(x.id) === String(id));
  S.divMsg = '';
  if (!confirm(t('div_deactivate_confirm').replace('{name}', b.name))) return;
  try {
    await clientWrite('deactivate_branch', { branch_id: id });
  } catch (e) {
    const code = e.data && e.data.code;
    S.divMsg = code === 'has_systems' ? t('div_has_systems').replace('{n}', e.data.count)
             : code === 'has_users'   ? t('div_has_users').replace('{n}', e.data.count)
             : t('save_error') + ' ' + e.message;
    return render();
  }
  loadData();
}

// ── Reporting Hub ─────────────────────────────────────────────
// S.rep = { div, fw, busy, started, text, error } — el informe se genera por división
const FRAMEWORKS = [
  { id: 'iso',  api: 'ISO42001', name: 'ISO 42001',  desc: 'rep_iso_desc' },
  { id: 'nist', api: 'NIST',     name: 'NIST AI RMF', desc: 'rep_nist_desc' },
  { id: 'eu',   api: 'EUAI',     name: 'EU AI Act',  desc: 'rep_eu_desc' }
];

function repState() {
  const branches = S.data?.branches || [];
  S.rep = S.rep || {};
  const fwFromRoute = (S.route.match(/^reportes\/(\w+)$/) || [])[1];
  if (fwFromRoute && fwFromRoute !== S.rep.fw) { S.rep.fw = fwFromRoute; S.rep.text = ''; S.rep.error = ''; }
  if (!S.rep.fw) S.rep.fw = 'iso';
  if (!S.rep.div && S.division !== 'all') S.rep.div = S.division;
  if (!branches.some(b => String(b.id) === String(S.rep.div))) S.rep.div = branches[0]?.id || '';
  return S.rep;
}

async function loadRepPreview(div) {
  S.repPreview = { div, loading: true };
  try { S.repPreview = { div, data: await apiGet('/api/dashboard?division=' + encodeURIComponent(div)) }; }
  catch (e) { if (!S.user) return; S.repPreview = { div, error: true }; }
  if (S.route.startsWith('reportes')) render();
}

function setRepDivision(id) { S.rep.div = id; S.rep.text = ''; S.rep.error = ''; render(); }
function setRepFramework(fw) { location.hash = '#/reportes/' + fw; }

function viewReports() {
  if (!S.data) return `<div class="card empty">${t('loading')}</div>`;
  const r = repState();
  const branches = S.data.branches;
  if (!branches.length) return `<div class="card empty">${t('no_divisions')}</div>`;
  const div = branches.find(b => String(b.id) === String(r.div));
  const fw = FRAMEWORKS.find(f => f.id === r.fw) || FRAMEWORKS[0];
  // Vista previa con el inventario nuevo (activos, modelos e instalaciones) de la división del informe
  if (!S.repPreview || S.repPreview.div !== r.div) loadRepPreview(r.div);
  const pv = S.repPreview?.data?.counts;
  const opt = b => `<option value="${esc(b.id)}" ${String(b.id) === String(r.div) ? 'selected' : ''}>${esc(b.name)}</option>`;

  let result = '';
  if (r.busy) {
    const secs = Math.floor((Date.now() - r.started) / 1000);
    result = `<div class="card rep-wait"><div class="spinner"></div>
      <div><b>${t('rep_generating')}</b><p>${t('rep_wait_help')} (${secs} s)</p></div></div>`;
  } else if (r.error) {
    result = `<div class="form-error" role="alert">${esc(r.error)}</div>`;
  } else if (r.text) {
    result = `
      <div class="edit-bar rep-actions">
        <button class="btn btn-sm" onclick="downloadReport()">${t('rep_download')}</button>
        <button class="btn btn-sm" onclick="window.print()">${t('rep_print')}</button>
      </div>
      <article class="report-doc">${renderMarkdown(r.text)}</article>`;
  }

  return `
    <div class="toolbar">
      ${branches.length > 1 ? `<select class="input" onchange="setRepDivision(this.value)" ${r.busy ? 'disabled' : ''}>${branches.map(opt).join('')}</select>`
                            : `<span class="rep-div">${esc(div.name)}</span>`}
    </div>
    <div class="rep-grid">${FRAMEWORKS.map(f => `
      <button class="rep ${f.id === fw.id ? 'on' : ''}" onclick="setRepFramework('${f.id}')" ${r.busy ? 'disabled' : ''}>
        <b>${t('report')} ${f.name}</b><span>${t(f.desc)}</span></button>`).join('')}
    </div>
    <div class="card rep-preview">
      <div>
        <h3>${t('report')} ${fw.name} · ${esc(div.name)}</h3>
        ${pv ? `<ul>
          <li>${t('rep_inst_count').replace('{n}', pv.installations).replace('{a}', pv.assets)}</li>
          <li>${t('rep_high_count').replace('{n}', pv.high_risk)}</li>
          <li>${t('rep_pending_count').replace('{n}', pv.pending)}</li>
        </ul>` : `<p class="count-note">${t('loading')}</p>`}
      </div>
      <button class="btn btn-primary" onclick="generateReport()" ${r.busy ? 'disabled' : ''}>
        ${r.busy ? t('rep_generating') : t('rep_generate')}</button>
    </div>
    <div class="alert">${t('rep_legacy_notice')}</div>
    ${result}`;
}

// Markdown → HTML limpio (DOMPurify evita que el texto ejecute código)
function renderMarkdown(text) {
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(text));
  return `<pre>${esc(text)}</pre>`;
}

async function generateReport() {
  const r = S.rep;
  const fw = FRAMEWORKS.find(f => f.id === r.fw);
  r.busy = true; r.error = ''; r.text = ''; r.started = Date.now();
  render();
  const tick = setInterval(() => { if (S.route.startsWith('reportes')) render(); }, 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);
  try {
    const res = await fetch('/api/client-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
      body: JSON.stringify({ branch_id: r.div, framework: fw.api }),
      signal: controller.signal
    });
    const text = await res.text();
    if (res.status === 401) return logout();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).error || text; } catch (e) {}
      throw new Error(msg);
    }
    r.text = text;
  } catch (err) {
    r.error = err.name === 'AbortError' ? t('rep_timeout') : t('rep_error') + ' ' + err.message;
  } finally {
    clearTimeout(timeout);
    clearInterval(tick);
    r.busy = false;
    if (S.user) render();
  }
}

function downloadReport() {
  const r = S.rep;
  const fw = FRAMEWORKS.find(f => f.id === r.fw);
  const div = S.data.branches.find(b => String(b.id) === String(r.div));
  const name = `BION_${fw.api}_${(div?.name || 'division').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_')}_${today()}.md`;
  const url = URL.createObjectURL(new Blob([r.text], { type: 'text/markdown;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Equipo (solo Super usuario empresa) ──────────────────────
// S.team = { users, divisions, error } · S.teamForm = { id|null, values, error, busy }
async function teamApi(method, query, body) {
  const res = await fetch('/api/client-users' + (query || ''), {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function loadTeam() {
  S.team = { loading: true };
  try {
    const data = await teamApi('GET');
    S.team = { users: data.users || [], divisions: data.divisions || [] };
  } catch (e) {
    if (!S.user) return;
    S.team = { error: t('data_error') };
  }
  if (S.route === 'equipo') render();
}

function teamFormHtml() {
  const f = S.teamForm, v = f.values || {};
  const divs = S.team.divisions;
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur) ? 'selected' : ''}>${esc(label)}</option>`;
  return `<div class="card div-form">
    <h3>${f.id ? t('edit_user') : t('new_user')}</h3>
    ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}
    <div class="fields form">
      <div class="field"><label for="tu_name">${t('f_full_name')} *</label><input class="input" id="tu_name" value="${esc(v.full_name || '')}"></div>
      <div class="field"><label for="tu_email">${t('login_email')} *</label><input class="input" id="tu_email" type="email" value="${esc(v.email || '')}"></div>
      <div class="field"><label for="tu_role">${t('f_role')} *</label><select class="input" id="tu_role">
        ${opt('usuario_division', t('role_usuario_division') + ' · ' + t('role_read_only'), v.role || 'usuario_division')}
        ${opt('super_division', t('role_super_division') + ' · ' + t('role_read_edit'), v.role)}
      </select></div>
      <div class="field"><label for="tu_div">${t('division')} *</label><select class="input" id="tu_div">
        ${divs.length > 1 ? opt('', '', v.division_id) : ''}${divs.map(d => opt(d.id, d.name, v.division_id ?? (divs.length === 1 ? divs[0].id : ''))).join('')}
      </select></div>
      <div class="field"><label for="tu_pass">${f.id ? t('f_new_password') : t('login_password') + ' *'}</label>
        <input class="input" id="tu_pass" type="password" autocomplete="new-password" placeholder="${t('f_password_hint')}"></div>
    </div>
    <div class="edit-bar">
      <button class="btn btn-ghost" onclick="closeTeamForm()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <button class="btn btn-primary" onclick="saveTeamUser()" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : t('save')}</button>
    </div>
  </div>`;
}

function viewTeam() {
  if (!S.team) { loadTeam(); return `<div class="card empty">${t('loading')}</div>`; }
  if (S.team.loading) return `<div class="card empty">${t('loading')}</div>`;
  if (S.team.error) return `<div class="card empty">${esc(S.team.error)}</div>`;
  const busy = !!S.teamForm;
  const rows = S.team.users.map(u => `
    <tr>
      <td><b>${esc(u.full_name)}</b><small>${esc(u.email)}</small></td>
      <td>${t('role_' + u.role)}</td>
      <td>${u.role === 'super_empresa' ? `<span class="no-info">${t('all_divisions')}</span>` : esc(u.division_name || '—')}</td>
      <td><span class="chip ${u.status === 'active' ? 'c-g' : 'c-n'}">${t(u.status === 'active' ? 'st_active' : 'st_inactive')}</span></td>
      <td class="actions">${u.manageable ? (u.status === 'active'
        ? `<button class="btn btn-sm" onclick="openTeamForm('${esc(u.id)}')" ${busy ? 'disabled' : ''}>${t('edit')}</button>
           <button class="btn btn-sm btn-danger" onclick="setUserStatus('${esc(u.id)}', 'inactive')" ${busy ? 'disabled' : ''}>${t('deactivate')}</button>`
        : `<button class="btn btn-sm" onclick="setUserStatus('${esc(u.id)}', 'active')" ${busy ? 'disabled' : ''}>${t('reactivate')}</button>`) : ''}</td>
    </tr>`).join('');
  return `
    ${!S.teamForm ? `<div class="page-actions"><button class="btn btn-primary" onclick="openTeamForm()">+ ${t('new_user')}</button></div>` : ''}
    ${S.teamForm ? teamFormHtml() : ''}
    ${S.teamMsg ? `<div class="alert">${esc(S.teamMsg)}</div>` : ''}
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>${t('f_full_name')}</th><th>${t('f_role')}</th><th>${t('division')}</th><th>${t('status')}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty small">${t('no_users')}</td></tr>`}</tbody>
    </table></div></div>
    <p class="count-note">${t('team_help')}</p>`;
}

function openTeamForm(id) {
  const u = id ? S.team.users.find(x => x.id === id) : null;
  S.teamMsg = '';
  S.teamForm = { id: id || null, values: u ? { full_name: u.full_name, email: u.email, role: u.role, division_id: u.division_id } : {} };
  render();
  document.getElementById('tu_name')?.focus();
}

function closeTeamForm() { S.teamForm = null; render(); }

async function saveTeamUser() {
  const f = S.teamForm;
  const pass = document.getElementById('tu_pass').value;
  f.values = {
    full_name: document.getElementById('tu_name').value.trim(),
    email: document.getElementById('tu_email').value.trim(),
    role: document.getElementById('tu_role').value,
    division_id: document.getElementById('tu_div').value
  };
  const missing = [['full_name', 'f_full_name'], ['email', 'login_email'], ['division_id', 'division']]
    .filter(([k]) => !f.values[k]).map(([, key]) => t(key));
  if (!f.id && !pass) missing.push(t('login_password'));
  if (missing.length) { f.error = t('required_fields') + ' ' + missing.join(', '); return render(); }
  if (pass && pass.length < 8) { f.error = t('password_short'); return render(); }

  const body = { ...f.values };
  if (pass) body.password = pass;
  f.busy = true; f.error = ''; render();
  try {
    if (f.id) await teamApi('PUT', '?id=' + encodeURIComponent(f.id), body);
    else await teamApi('POST', '', body);
  } catch (e) {
    f.busy = false;
    f.error = /Email already exists/.test(e.message) ? t('email_exists') : t('save_error') + ' ' + e.message;
    return render();
  }
  S.teamForm = null;
  loadTeam();
}

async function setUserStatus(id, status) {
  const u = S.team.users.find(x => x.id === id);
  if (status === 'inactive' && !confirm(t('user_deactivate_confirm').replace('{name}', u.full_name))) return;
  S.teamMsg = '';
  try {
    if (status === 'inactive') await teamApi('DELETE', '?id=' + encodeURIComponent(id));
    else await teamApi('PUT', '?id=' + encodeURIComponent(id), { status: 'active' });
  } catch (e) {
    S.teamMsg = t('save_error') + ' ' + e.message;
    return render();
  }
  loadTeam();
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
      ${divisionBar()}
      ${S.data?.error ? `<div class="alert">${t('data_error')}</div>` : ''}
      ${viewPage()}
    </main>
  </div>`;
}

// ── Ventana modal (reutilizable) ──────────────────────────────
// close: nombre de la función global que la cierra (Cancelar, Esc o clic fuera del cuadro)
function modalHtml({ title, subtitle, body, footer, close, wide }) {
  return `<div class="modal-backdrop" data-close="${close}" onclick="if (event.target === this) ${close}()">
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h3 id="modalTitle">${esc(title)}</h3>${subtitle ? `<div class="crumb">${esc(subtitle)}</div>` : ''}
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${footer}</div>
    </div></div>`;
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const fn = document.querySelector('.modal-backdrop')?.dataset.close;
  if (fn && typeof window[fn] === 'function') window[fn]();
});

function render() {
  // Mantener lo escrito en el login al re-renderizar (cambio de idioma, errores)
  const email = document.getElementById('lgEmail')?.value;
  if (S.user) S.route = currentRoute();
  // Conservar el foco y el cursor del campo donde se está escribiendo (ej. búsquedas)
  const act = document.activeElement;
  const keep = act && act.id && /^(INPUT|TEXTAREA)$/.test(act.tagName)
    ? { id: act.id, start: act.selectionStart, end: act.selectionEnd } : null;
  document.getElementById('root').innerHTML = S.user ? viewShell() : viewLogin();
  if (S.user && keep) {
    const el = document.getElementById(keep.id);
    if (el) { el.focus(); try { el.setSelectionRange(keep.start, keep.end); } catch (e) {} }
  }
  if (!S.user) {
    const el = document.getElementById('lgEmail');
    if (email) el.value = email;
    (email ? document.getElementById('lgPass') : el).focus();
  }
}

window.addEventListener('hashchange', () => {
  if (!S.user) return;
  if (parseHash().path !== 'divisiones') { S.divForm = null; S.divMsg = ''; }
  if (parseHash().path !== 'equipo') { S.team = null; S.teamForm = null; S.teamMsg = ''; }
  if (!/^activos\/(nuevo|[\w-]+\/editar)$/.test(parseHash().path)) S.assetForm = null;
  S.retireAsset = false; S.installForm = null;
  S.modelEdit = null; S.modelMsg = ''; S.verForm = null; S.changeFilter = null;
  S.instEdit = null; S.instAction = null; S.integForm = null; S.instMsg = '';
  // Las fichas se vuelven a cargar al entrar, para mostrar siempre datos al día
  S.inst = null; S.assetDetail = null; S.modelDetail = null; S.assets = null; S.models = null;
  S.incDetail = null; S.incidents = null; S.cmp = null; S.pending = null; S.dash = null; S.repPreview = null; S.divStats = null; S.grPrev = null;
  if (S.gr) S.gr.dd = false;
  S.incEdit = null; S.incActForm = null; S.incClose = null;
  if (parseHash().path !== 'incidentes/nuevo') S.wiz = null;
  S.incMsg = S.incMsgNext || ''; S.incMsgNext = null;
  if (parseHash().path !== 'modelos/nuevo') S.modelNew = null;
  render(); window.scrollTo(0, 0);
});

setLang(LANG);
S.user = loadSession();
if (S.user) initDivision();
render();
if (S.user) { loadData(); loadNav(); }
