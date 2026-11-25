// ============================================================
// BION · Plataforma — Informes de gobernanza (Reporting Hub)
// Rutas: #/reportes (catálogo) · #/reportes/<n> (configuración del informe n)
// API: /api/reports (ver api/reports.js y docs/informes.md)
// El informe con IA (ISO, NIST, EU) sigue en #/reportes/iso|nist|eu (app.js).
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

const GR_LEVELS = ['company', 'division', 'system'];
const GR_DEFAULTS = { divs: [], period: '3m', from: '', to: '', status: 'all', severity: 'all' };
const grIsConfigRoute = r => /^reportes\/[1-7]$/.test(r);

// Fecha AAAA-MM-DD → DD-MM-AAAA
const grDate = s => (s ? s.split('-').reverse().join('-') : '');
const grToday = () => new Date().toISOString().slice(0, 10);

// Catálogo y divisiones elegibles (se cargan una vez por usuario)
async function grLoadBase(key) {
  S.grBase = { key, loading: true };
  try {
    const [cat, opt] = await Promise.all([apiGet('/api/reports?action=catalog'), apiGet('/api/reports?action=options')]);
    S.grBase = { key, reports: cat.reports, divisions: opt.divisions, fixed: opt.fixed };
  } catch (e) { if (!S.user) return; S.grBase = { key, error: true }; }
  if (S.route.startsWith('reportes')) render();
}

// Filtros del informe en pantalla; se reinician al cambiar de informe
function grState(id) {
  if (!S.gr || S.gr.report !== id) S.gr = { report: id, dd: false, ...GR_DEFAULTS, divs: [] };
  return S.gr;
}

// Mismo cálculo que el servidor (api/reports.js · resolvePeriod)
function grRange(g) {
  if (g.period === 'custom') return { from: g.from, to: g.to };
  const to = grToday();
  const d = new Date(to + 'T00:00:00Z');
  if (g.period === '1m') d.setUTCMonth(d.getUTCMonth() - 1);
  if (g.period === '3m') d.setUTCMonth(d.getUTCMonth() - 3);
  if (g.period === 'year') d.setUTCMonth(0, 1);
  return { from: d.toISOString().slice(0, 10), to };
}

// Error de las fechas personalizadas (o '' si están bien)
function grDateError(g) {
  if (g.period !== 'custom') return '';
  if (!g.from || !g.to) return t('gr_dates_missing');
  if (g.from > g.to) return t('gr_dates_order');
  if (g.to > grToday()) return t('gr_dates_future');
  return '';
}

// Parámetros para la API según el informe y los filtros elegidos
function grQuery(r, g) {
  const p = new URLSearchParams({ report: r.id });
  if (r.level === 'division' && g.divs.length) p.set('divisions', g.divs.join(','));
  if (r.filters.includes('period')) {
    p.set('period', g.period);
    if (g.period === 'custom') { p.set('from', g.from); p.set('to', g.to); }
  }
  if (r.filters.includes('status')) p.set('status', g.status);
  if (r.filters.includes('severity')) p.set('severity', g.severity);
  return p.toString();
}

async function grLoadPreview(key) {
  S.grPrev = { key, loading: true };
  try { S.grPrev = { key, data: await apiGet('/api/reports?action=preview&' + key) }; }
  catch (e) { if (!S.user) return; S.grPrev = { key, error: true, notReady: /501/.test(e.message) }; }
  if (grIsConfigRoute(S.route)) render();
}

// ── Acciones de la pantalla ───────────────────────────────────
function grSet(field, value) { S.gr[field] = value; render(); }
function grToggleMenu(ev) { ev.stopPropagation(); S.gr.dd = !S.gr.dd; render(); }
function grAllDivisions() { S.gr.divs = []; render(); }
function grToggleDiv(id) {
  const g = S.gr;
  g.divs = g.divs.includes(id) ? g.divs.filter(d => d !== id) : [...g.divs, id];
  // Todas marcadas = toda la empresa
  if (g.divs.length === S.grBase.divisions.length) g.divs = [];
  render();
}
function grReset() { Object.assign(S.gr, GR_DEFAULTS, { divs: [], dd: false }); render(); }

// Cerrar la lista de divisiones al hacer clic fuera o con Esc
document.addEventListener('click', e => {
  if (S.gr && S.gr.dd && !e.target.closest('.gr-dd')) { S.gr.dd = false; render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.gr && S.gr.dd) { S.gr.dd = false; render(); }
});

// ── Vistas ────────────────────────────────────────────────────
function viewGovReports() {
  const key = S.user.email + '|' + S.user.role;
  if (!S.grBase || S.grBase.key !== key) grLoadBase(key);
  const b = S.grBase;
  const head = `<h1>${t('nav_reporting')}</h1>`;
  if (!b || b.loading) return head + `<div class="card empty">${t('loading')}</div>`;
  if (b.error) return head + `<div class="card empty">${t('data_error')}</div>`;
  if (S.route === 'reportes') return pageHead() + grCatalogHtml(b);
  const r = b.reports.find(x => 'reportes/' + x.id === S.route);
  if (!r || !r.allowed || r.level === 'system') { location.hash = '#/reportes'; return head; }
  return grConfigHtml(b, r);
}

function grCatalogHtml(b) {
  const groups = GR_LEVELS.map(lv => {
    const help = lv === 'division' && b.fixed
      ? t('gr_lvl_division_fixed').replace('{d}', esc(b.divisions[0] ? b.divisions[0].name : ''))
      : t('gr_lvl_' + lv + '_help');
    return `<div class="gr-lvl">${t('gr_lvl_' + lv)} <small>· ${help}</small></div>
      <div class="gr-grid">${b.reports.filter(r => r.level === lv).map(grCard).join('')}</div>`;
  }).join('');
  return `<p class="gr-intro">${t('gr_intro')}</p>${groups}`;
}

function grCard(r) {
  const note = !r.allowed ? `<div class="gr-note">🔒 ${t('gr_only_company')}</div>`
    : (!r.ready && r.level !== 'system') ? `<div class="gr-note">${t('gr_soon')}</div>` : '';
  const body = `<b>${r.id}. ${t('gr_r' + r.id)}</b><p>${t('gr_r' + r.id + '_desc')}</p>
    <div class="gr-fw">${r.frameworks.map(esc).join(' · ')}</div>${note}`;
  if (!r.allowed) return `<div class="gr-card off" aria-disabled="true">${body}</div>`;
  // El informe 8 se genera desde la ficha de un incidente
  return `<a class="gr-card" href="${r.level === 'system' ? '#/incidentes' : '#/reportes/' + r.id}">${body}</a>`;
}

function grConfigHtml(b, r) {
  const g = grState(r.id);
  const dateErr = grDateError(g);
  const key = grQuery(r, g);
  if (!dateErr && r.ready && (!S.grPrev || S.grPrev.key !== key)) grLoadPreview(key);
  const opt = (list, cur, label) => list.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label(v)}</option>`).join('');
  const fields = [`<div class="gr-f"><label>${t('gr_divisions')}</label>${grDivisionsField(b, r, g)}</div>`];
  if (r.filters.includes('period')) {
    fields.push(`<div class="gr-f"><label for="grPeriod">${t('gr_period')}</label>
      <select id="grPeriod" class="input" onchange="grSet('period', this.value)">${opt(['1m', '3m', 'year', 'custom'], g.period, v => t('gr_period_' + v))}</select>
      ${g.period === 'custom' ? `<div class="gr-dates">
          <input id="grFrom" type="date" class="input" max="${grToday()}" value="${esc(g.from)}" aria-label="${t('gr_from')}" onchange="grSet('from', this.value)">
          <span>${t('gr_to_short')}</span>
          <input id="grTo" type="date" class="input" max="${grToday()}" value="${esc(g.to)}" aria-label="${t('gr_to')}" onchange="grSet('to', this.value)"></div>`
        : `<p class="gr-help">${t('gr_custom_help')}</p>`}</div>`);
  }
  if (r.filters.includes('status')) fields.push(`<div class="gr-f"><label for="grStatus">${t('gr_status')}</label>
    <select id="grStatus" class="input" onchange="grSet('status', this.value)">${opt(['all', 'abierto', 'cerrado'], g.status, v => t('gr_status_' + v))}</select></div>`);
  if (r.filters.includes('severity')) fields.push(`<div class="gr-f"><label for="grSeverity">${t('gr_severity')}</label>
    <select id="grSeverity" class="input" onchange="grSet('severity', this.value)">${opt(['all', 'graves'], g.severity, v => t('gr_severity_' + v))}</select></div>`);

  return `<button class="back" onclick="location.hash='#/reportes'">← ${t('gr_back')}</button>
    <h1>${t('nav_reporting')}</h1>
    <div class="crumb">${t('gr_report_n').replace('{n}', r.id)} · ${t('gr_r' + r.id)} · ${r.frameworks.map(esc).join(' · ')}</div>
    <div class="card mt"><div class="gr-cfg">${fields.join('')}</div>
      ${dateErr ? `<div class="form-error" role="alert">${dateErr}</div>` : ''}</div>
    ${grSelBarHtml(b, r, g)}
    ${grPreviewHtml(r, dateErr)}`;
}

function grDivisionsField(b, r, g) {
  if (r.level === 'company') return `<div class="gr-fixed">${t('gr_all_company')} <span>· ${t('gr_company_breakdown')}</span></div>`;
  if (b.fixed) return `<div class="gr-fixed">${esc(b.divisions[0].name)} <span>· ${t('gr_fixed_role')}</span></div>`;
  const label = !g.divs.length ? t('gr_all_company')
    : g.divs.length === 1 ? esc(b.divisions.find(d => String(d.id) === g.divs[0]).name)
    : t('gr_n_divisions').replace('{n}', g.divs.length);
  const item = (checked, text, onchange, cls = '') => `<label class="gr-dd-i ${cls} ${checked ? 'on' : ''}">
    <input type="checkbox" ${checked ? 'checked' : ''} onchange="${onchange}"> ${text}</label>`;
  return `<div class="gr-dd">
    <button type="button" class="input gr-dd-btn ${g.dd ? 'open' : ''}" aria-expanded="${g.dd}" onclick="grToggleMenu(event)">
      <span>${label}</span><span aria-hidden="true">▾</span></button>
    ${g.dd ? `<div class="gr-dd-menu" onclick="event.stopPropagation()">
      ${item(!g.divs.length, `<b>${t('gr_all_company')}</b>`, 'grAllDivisions()', 'all')}
      ${b.divisions.map(d => item(g.divs.includes(String(d.id)), esc(d.name), `grToggleDiv('${esc(String(d.id))}')`)).join('')}
    </div>` : ''}</div>`;
}

// Barra "Seleccionado": solo texto, separado por puntos
function grSelBarHtml(b, r, g) {
  const items = [];
  if (r.level === 'company' || (!b.fixed && !g.divs.length)) items.push(esc(t('gr_all_company')));
  else if (b.fixed) items.push(`${esc(b.divisions[0].name)} <i>(${t('gr_fixed')})</i>`);
  else g.divs.forEach(id => items.push(`${esc(b.divisions.find(d => String(d.id) === id).name)}
    <button type="button" class="gr-x" aria-label="${t('gr_remove')}" onclick="grToggleDiv('${esc(id)}')">✕</button>`));
  if (r.filters.includes('period')) {
    const rg = grRange(g);
    const dates = rg.from && rg.to ? ` (${grDate(rg.from).slice(0, 5)} ${t('gr_to_short')} ${grDate(rg.to)})` : '';
    items.push(esc(t('gr_period_' + g.period).replace('…', '')) + dates);
  }
  if (r.filters.includes('status')) items.push(t('gr_status_' + g.status));
  if (r.filters.includes('severity')) items.push(t('gr_severity_' + g.severity));
  const isDefault = !g.divs.length && ['period', 'status', 'severity'].every(k => g[k] === GR_DEFAULTS[k]);
  return `<div class="gr-selbar"><b>${t('gr_selected')}</b>
    <span class="gr-items">${items.map(x => `<span class="gr-sel">${x}</span>`).join('')}</span>
    ${isDefault ? '' : `<button type="button" class="gr-clear" onclick="grReset()">${t('gr_clear')}</button>`}</div>`;
}

function grPreviewHtml(r, dateErr) {
  let body;
  if (!r.ready) body = `<p class="count-note">${t('gr_not_ready')}</p>`;
  else if (dateErr) body = `<p class="count-note">${t('gr_fix_dates')}</p>`;
  else if (!S.grPrev || S.grPrev.loading) body = `<p class="count-note">${t('loading')}</p>`;
  else if (S.grPrev.error) body = `<p class="count-note">${S.grPrev.notReady ? t('gr_not_ready') : t('data_error')}</p>`;
  else body = `<div class="gr-pv">${Object.entries(S.grPrev.data.counts).map(([k, n]) =>
      `<div><b>${n}</b><small>${t('gr_pv_' + k)}</small></div>`).join('')}</div>`;
  // Generar e informe en pantalla y PDF: etapa 3
  return `<div class="card mt"><h3>${t('gr_preview')}</h3>${body}
    <div class="gr-foot"><span class="gr-help">${t('gr_format_pdf')}</span>
      <button class="btn btn-primary" disabled title="${t('gr_soon')}">${t('rep_generate')}</button></div></div>`;
}
