// ============================================================
// BION · Plataforma — Informes de gobernanza (Reporting Hub)
// Rutas: #/reportes (catálogo) · #/reportes/<n> (configuración del informe n)
//        #/reportes/<n>/ver?<filtros> (informe generado, listo para PDF)
// API: /api/reports (ver api/reports.js y docs/informes.md)
// El informe con IA (ISO, NIST, EU) sigue en #/reportes/iso|nist|eu (app.js).
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

const GR_LEVELS = ['company', 'division', 'system'];
const GR_DEFAULTS = { divs: [], period: '3m', from: '', to: '', status: 'all', severity: 'all' };
// Configuración o informe generado (app.js lo usa para rutas, menú y selector de división)
const grIsConfigRoute = r => /^reportes\/[1-7](\/ver)?$/.test(r);
const grIsDocRoute = r => /^reportes\/[1-7]\/ver$/.test(r);

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
  const r = b.reports.find(x => S.route.split('/')[1] === String(x.id));
  if (!r || !r.allowed || r.level === 'system') { location.hash = '#/reportes'; return head; }
  return grIsDocRoute(S.route) ? grDocHtml(r) : grConfigHtml(b, r);
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
  return `<div class="card mt"><h3>${t('gr_preview')}</h3>${body}
    <div class="gr-foot"><span class="gr-help">${t('gr_format_pdf')}</span>
      <button class="btn btn-primary" ${r.ready && !dateErr ? '' : 'disabled'} onclick="grGenerate()">${t('rep_generate')}</button></div></div>`;
}

// ── Informe generado ──────────────────────────────────────────
// Los filtros viajan en la dirección (#/reportes/<n>/ver?...) para poder recargar o compartir el enlace
function grGenerate() {
  const r = S.grBase.reports.find(x => x.id === S.gr.report);
  location.hash = '#/reportes/' + r.id + '/ver?' + grQuery(r, S.gr);
}

// Al abrir un informe desde la dirección, la configuración toma los mismos filtros
function grStateFromParams(r, q) {
  const g = grState(r.id);
  Object.assign(g, GR_DEFAULTS, {
    divs: q.divisions && q.divisions !== 'all' ? q.divisions.split(',') : [],
    period: q.period || GR_DEFAULTS.period, from: q.from || '', to: q.to || '',
    status: q.status || GR_DEFAULTS.status, severity: q.severity || GR_DEFAULTS.severity
  });
}

async function grLoadDoc(key) {
  S.grDoc = { key, loading: true };
  try { S.grDoc = { key, data: await apiGet('/api/reports?action=generate&' + key) }; }
  catch (e) { if (!S.user) return; S.grDoc = { key, error: true }; }
  if (grIsDocRoute(S.route)) render();
}

// Fecha y hora local DD-MM-AAAA HH:MM
function grDateTime(iso) {
  const d = new Date(iso), z = n => String(n).padStart(2, '0');
  return `${z(d.getDate())}-${z(d.getMonth() + 1)}-${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// PDF: el navegador abre la impresión y el usuario elige "Guardar como PDF"
function grPrint() {
  const m = S.grDoc.data.meta, prev = document.title;
  document.title = `BION_${t('gr_report_n').replace('{n}', m.report).replace(/\s+/g, '')}_${t('gr_r' + m.report)}_${m.generated_at.slice(0, 10)}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');
  window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
  window.print();
}

function grDocHtml(r) {
  const q = parseHash().params;
  const key = new URLSearchParams(q).toString();
  if (!S.grDoc || S.grDoc.key !== key) { grStateFromParams(r, q); grLoadDoc(key); }
  const back = `<button class="back gr-noprint" onclick="location.hash='#/reportes/${r.id}'">← ${t('gr_back_config')}</button>
    <h1>${t('nav_reporting')}</h1><div class="crumb">${t('gr_report_n').replace('{n}', r.id)} · ${t('gr_r' + r.id)}</div>`;
  const d = S.grDoc;
  if (!d || d.loading) return back + `<div class="card empty">${t('gr_generating')}</div>`;
  if (d.error) return back + `<div class="card empty">${t('data_error')}</div>`;
  const body = { 1: grDocGlobal, 2: grDocRiskMap, 3: grDocInventory, 4: grDocIncidents, 5: grDocActions, 6: grDocChanges, 7: grDocGaps }[r.id];
  return back + `
    <div class="gr-actions gr-noprint"><span class="gr-help">${t('gr_pdf_help')}</span>
      <button class="btn btn-sm" onclick="grPrint()">${t('gr_pdf')}</button></div>
    <article class="gr-doc">${grDocHead(d.data.meta)}${body ? body(d.data.data) : ''}
      <footer class="gr-doc-foot">${t('gr_doc_foot')}</footer></article>`;
}

// Encabezado de trazabilidad (ISO 42001 7.5)
function grDocHead(m) {
  const f = m.filters, parts = [];
  if (f.period) parts.push(`${t('gr_period_' + f.period).replace('…', '')} (${grDate(f.from)} ${t('gr_to_short')} ${grDate(f.to)})`);
  if (f.status) parts.push(t('gr_status_' + f.status));
  if (f.severity) parts.push(t('gr_severity_' + f.severity));
  const cell = (k, v) => `<div><b>${t(k)}</b>${v}</div>`;
  return `<h2>${t('gr_r' + m.report)}</h2>
    <div class="gr-doc-sub">${esc(m.company || '')} · ${m.frameworks.map(esc).join(' · ')}</div>
    <div class="gr-meta">
      ${cell('gr_m_coverage', m.coverage.all ? t('gr_all_company') : m.coverage.divisions.map(esc).join(', '))}
      ${cell('gr_m_filters', parts.join(' · ') || '—')}
      ${cell('gr_m_generated', grDateTime(m.generated_at))}
      ${cell('gr_m_by', `${esc(m.generated_by.email || '')} (${t('role_' + m.generated_by.role)})`)}
      ${cell('gr_m_data', t('gr_m_data_v'))}
      ${cell('gr_m_report', `${t('gr_report_n').replace('{n}', m.report)} · ${t('gr_lvl_' + m.level)}`)}
    </div>`;
}

// Tabla simple; filas = arreglos de celdas (HTML ya escapado)
function grTable(cols, rows, numeric = []) {
  return `<table class="gr-tbl"><thead><tr>${cols.map((c, i) => `<th class="${numeric.includes(i) ? 'n' : ''}">${t(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numeric.includes(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const grSev = s => `<span class="gr-tag gr-${esc(s)}">${t('sev_' + s)}</span>`;
const grKpi = (n, k) => `<div><b>${n}</b>${t(k)}</div>`;
const grSec = (n, k, html) => `<h3>${n}. ${t(k)}</h3>${html}`;
const grNote = html => `<p class="gr-note-doc">${html}</p>`;
const grNw = v => `<span class="gr-nw">${v}</span>`;
const grTrunc = (flag, n) => flag ? grNote(t('gr_truncated_rows').replace('{n}', n)) : '';

// Informe 4: Incidentes del período
function grDocIncidents(x) {
  const s = x.summary;
  const kpi = (n, k) => `<div><b>${n}</b>${t(k)}</div>`;
  const sec = (n, k, html) => `<h3>${n}. ${t(k)}</h3>${html}`;
  const model = m => m ? esc(m) : `<i>${t('gr_model_undetermined')}</i>`;
  if (!s.incidents) return sec(1, 'gr_s_summary', `<p class="gr-empty">${t('gr_empty_incidents')}</p>`);
  return sec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${kpi(s.incidents, 'gr_k_incidents')}${kpi(s.serious, 'gr_k_serious')}${kpi(s.open, 'gr_k_open')}
      ${kpi(s.hazards, 'gr_k_hazards')}${kpi(s.avg_close_days === null ? '—' : t('gr_days').replace('{n}', s.avg_close_days), 'gr_k_avg_close')}
      ${kpi(s.actions_overdue, 'gr_k_actions_overdue')}</div>
      ${s.model_undetermined ? `<p class="gr-note-doc">${t('gr_undetermined_note').replace('{n}', s.model_undetermined)}</p>` : ''}`)
    + sec(2, 'gr_s_severity', grTable(['gr_c_severity', 'gr_c_incidents'],
        x.by_severity.map(r => [grSev(r.severity), r.incidents]), [1]))
    + sec(3, 'gr_s_division', grTable(['gr_c_division', 'gr_c_incidents', 'gr_c_serious', 'gr_c_open', 'gr_model_undetermined'],
        x.by_division.map(r => [esc(r.division), r.incidents, r.serious, r.open, r.model_undetermined]), [1, 2, 3, 4]))
    + sec(4, 'gr_s_model', grTable(['gr_c_model', 'gr_c_incidents', 'gr_c_behavior', 'gr_c_max_sev'],
        x.by_model.map(r => [model(r.model), r.incidents, r.main_behavior ? t('behavior_' + r.main_behavior) : '—', grSev(r.max_severity)]), [1]))
    + sec(5, 'gr_s_detail', grTable(['gr_c_date', 'gr_c_title', 'gr_c_asset', 'gr_c_model', 'gr_c_division', 'gr_c_severity', 'gr_c_status'],
        x.detail.map(r => [`<span class="gr-nw">${grDate(r.occurred_at)}</span>`, esc(r.title) + (r.kind === 'peligro' ? ` <small>(${t('kind_peligro')})</small>` : ''),
          `<span class="gr-nw">${esc(r.asset_code)}</span>`, model(r.model), esc(r.division), grSev(r.severity), t('ist_' + r.status)])))
    + (x.detail_truncated ? `<p class="gr-note-doc">${t('gr_truncated').replace('{n}', x.detail.length)}</p>` : '');
}

// Informe 3: Inventario de IA
function grDocInventory(x) {
  const s = x.summary;
  const risk = l => l === 'none' ? t('gr_risk_none') : t('risk_' + l);
  const info = r => {
    const parts = [];
    if (r.gaps) parts.push(t('gr_n_to_complete').replace('{n}', r.gaps));
    if (r.model_gap) parts.push(t('gr_vendor_gap'));
    return parts.length ? parts.join(' · ') : `<span class="gr-ok">${t('gr_info_ok')}</span>`;
  };
  return grSec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${grKpi(s.assets, 'gr_k_assets')}${grKpi(s.models, 'gr_k_models')}${grKpi(s.installations, 'gr_k_installations')}
      ${grKpi(s.high_risk, 'gr_k_high_risk')}${grKpi(s.risk_to_review, 'gr_k_risk_to_review')}${grKpi(s.reviews_overdue, 'gr_k_reviews_overdue')}</div>
      ${s.assets_unknown ? grNote(t('gr_assets_unknown_note').replace('{n}', s.assets_unknown)) : ''}
      ${s.without_asset ? grNote(t('gr_without_asset_note').replace('{n}', s.without_asset)) : ''}`)
    + grSec(2, 'gr_s_risk', grTable(['gr_c_risk', 'gr_c_installations'], x.by_risk.map(r => [risk(r.risk_level), r.installations]), [1]))
    + grSec(3, 'gr_s_division', grTable(['gr_c_division', 'gr_c_assets', 'gr_c_installations', 'gr_c_high_risk', 'gr_c_risk_to_review'],
        x.by_division.map(r => [esc(r.division), r.assets, r.installations, r.high_risk, r.risk_to_review]), [1, 2, 3, 4]))
    + grSec(4, 'gr_s_installations', x.installations.length ? grTable(['gr_c_asset', 'gr_c_model', 'gr_c_version', 'gr_c_risk', 'gr_c_next_review', 'gr_c_division', 'gr_c_info'],
        x.installations.map(r => [grNw(r.asset_code ? esc(r.asset_code) : `<i>${t('asset_unassigned')}</i>`),
          `${esc(r.model)} <small>${esc(r.vendor)}</small>`, grNw(verLabel(r.version)),
          `${r.risk_level ? t('risk_' + r.risk_level) : t('gr_risk_none')}${r.reclassification_pending ? ` <small>(${t('gr_to_review')})</small>` : ''}`,
          r.next_review_date ? grNw(grDate(r.next_review_date)) : '—', esc(r.division), info(r)]))
        + grTrunc(x.installations_truncated, x.installations.length)
      : `<p class="gr-empty">${t('gr_empty_installations')}</p>`)
    + (x.assets_unknown.length ? grSec(5, 'gr_s_assets_unknown', grTable(['gr_c_asset', 'gr_c_name', 'gr_c_ai_usage', 'gr_c_division'],
        x.assets_unknown.map(a => [grNw(esc(a.code)), esc(a.name), t('usage_' + a.ai_usage), esc(a.division)])) + grTrunc(x.assets_unknown_truncated, x.assets_unknown.length)) : '');
}

// Informe 5: Acciones correctivas
function grDocActions(x) {
  const s = x.summary;
  if (!s.actions) return grSec(1, 'gr_s_summary', `<p class="gr-empty">${t('gr_empty_actions')}</p>`);
  const state = r => r.status === 'pendiente'
    ? (r.overdue ? `<span class="gr-tag gr-incidente_grave">${t('gr_overdue_days').replace('{n}', r.days_late)}</span>` : t('gr_act_pendiente'))
    : t('gr_act_terminada') + (r.days_late ? ` <small>(${t('gr_late_days').replace('{n}', r.days_late)})</small>` : '');
  return grSec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${grKpi(s.actions, 'gr_k_actions')}${grKpi(s.pending, 'gr_k_pending')}${grKpi(s.overdue, 'gr_k_actions_overdue')}
      ${grKpi(s.done, 'gr_k_done')}${grKpi(s.on_time_pct === null ? '—' : s.on_time_pct + '%', 'gr_k_on_time')}${grKpi(s.done_late, 'gr_k_done_late')}</div>`)
    + grSec(2, 'gr_s_owner', grTable(['gr_c_owner', 'gr_c_actions', 'gr_c_pending', 'gr_c_overdue'],
        x.by_owner.map(r => [esc(r.owner), r.actions, r.pending, r.overdue]), [1, 2, 3]))
    + grSec(3, 'gr_s_division', grTable(['gr_c_division', 'gr_c_actions', 'gr_c_pending', 'gr_c_overdue', 'gr_c_done'],
        x.by_division.map(r => [esc(r.division), r.actions, r.pending, r.overdue, r.done]), [1, 2, 3, 4]))
    + grSec(4, 'gr_s_actions', grTable(['gr_c_action', 'gr_c_owner', 'gr_c_due', 'gr_c_status', 'gr_c_incident', 'gr_c_division'],
        x.detail.map(r => [esc(r.action), esc(r.owner), grNw(grDate(r.due_date)), state(r),
          `${esc(r.incident)} <small>${esc(r.asset_code)} · ${t('sev_' + r.severity)}</small>`, esc(r.division)]))
      + grTrunc(x.detail_truncated, x.detail.length));
}

// Informe 6: Gestión del cambio
function grDocChanges(x) {
  const s = x.summary;
  if (!s.changes) return grSec(1, 'gr_s_summary', `<p class="gr-empty">${t('gr_empty_changes')}</p>`);
  const review = r => r.reviewed
    ? `${grNw(grDate(r.reviewed_at))} <small>${esc(r.reviewed_by_email || '')}</small>`
    : `<span class="gr-tag gr-incidente_grave">${t('gr_not_reviewed')}</span>`;
  const watch = r => !r.reviewed ? '—'
    : r.reopened ? `<span class="gr-tag gr-incidente_grave">${t('rv_reopened')}</span>`
    : `${t('n_days').replace('{n}', r.monitoring_days)} · ${r.in_monitoring ? t('gr_watch_on') : t('gr_watch_done')}`;
  // Decisión de la revisión: riesgo y si el cambio es sustancial
  const decision = r => r.reviewed ? `${t('risk_' + r.review_risk)} <small>${t('rv_q2_short')}: ${t('yn_' + r.substantial)}</small>` : '—';
  const inc = r => r.reviewed
    ? `${r.before_n} → ${r.after_n}${r.after_serious ? ` <small>(${t('gr_n_serious').replace('{n}', r.after_serious)})</small>` : ''}`
    : `${r.before_n} → —`;
  return grSec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${grKpi(s.changes, 'gr_k_changes')}${grKpi(s.reviewed, 'gr_k_reviewed')}${grKpi(s.pending_review, 'gr_k_pending_review')}
      ${grKpi(s.substantial, 'gr_k_substantial')}${grKpi(s.in_monitoring, 'gr_k_in_monitoring')}${grKpi(s.reopened, 'gr_k_reopened')}</div>
      ${s.changes_unknown ? grNote(t('gr_changes_unknown_note').replace('{n}', s.changes_unknown)) : ''}`)
    + grSec(2, 'gr_s_model', grTable(['gr_c_model', 'gr_c_changes', 'gr_c_reviewed', 'gr_c_pending_review'],
        x.by_model.map(r => [esc(r.model), r.changes, r.reviewed, r.pending_review]), [1, 2, 3]))
    + grSec(3, 'gr_s_changes', grTable(['gr_c_date', 'gr_c_asset', 'gr_c_model', 'gr_c_change', 'gr_c_review', 'gr_c_decision', 'gr_c_watch', 'gr_c_before_after'],
        x.detail.map(r => [grNw(grDate(r.changed_at)), grNw(r.asset_code ? esc(r.asset_code) : esc(r.code)), esc(r.model),
          `${grNw(`${verLabel(r.from_version)} → ${verLabel(r.to_version)}`)}${r.changes_unknown ? ` <small>(${t('gr_changes_unknown')})</small>` : ''}`,
          review(r), decision(r), watch(r), grNw(inc(r))]))
      + grNote(t('gr_before_after_help')) + grTrunc(x.detail_truncated, x.detail.length));
}

// Informe 7: Brechas de información
function grDocGaps(x) {
  const s = x.summary;
  const labels = (cols, fn) => cols.length ? cols.map(c => esc(fn(c))).join(', ') : '—';
  const quest = m => m.vendor_questionnaire_received ? t('questionnaire_answered')
    : m.vendor_questionnaire_sent_at ? t('questionnaire_waiting').replace('{d}', grDate(m.vendor_questionnaire_sent_at)) : t('questionnaire_not_sent');
  if (!x.models.length && !x.installations.length) return grSec(1, 'gr_s_summary', `<p class="gr-empty">${t('gr_empty_gaps')}</p>`);
  return grSec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${grKpi(s.models_with_gaps, 'gr_k_models_with_gaps')}${grKpi(s.black_box, 'gr_k_black_box')}${grKpi(s.vendor_fields_not_provided, 'gr_k_vendor_not_provided')}
      ${grKpi(s.questionnaire_not_sent, 'gr_k_questionnaire_not_sent')}${grKpi(s.installations_with_gaps, 'gr_k_installations_with_gaps')}${grKpi(s.internal_fields_pending, 'gr_k_internal_pending')}</div>`)
    + grSec(2, 'gr_s_vendor', x.models.length ? grTable(['gr_c_model', 'gr_c_vendor', 'gr_c_black_box', 'gr_c_questionnaire', 'gr_c_not_provided', 'gr_c_to_complete', 'gr_c_installations'],
        x.models.map(m => [`${esc(m.name)} <small>${esc(m.code)}</small>`, esc(m.vendor), t(m.black_box ? 'yn_si' : 'yn_no'), quest(m),
          labels(m.not_provided, fieldLabel), labels(m.pending, fieldLabel), m.installations]), [6])
      : `<p class="gr-empty">${t('gr_empty_vendor_gaps')}</p>`)
    + grSec(3, 'gr_s_internal', x.installations.length ? grTable(['gr_c_installation', 'gr_c_asset', 'gr_c_model', 'gr_c_division', 'gr_c_to_complete', 'gr_c_not_provided'],
        x.installations.map(r => [grNw(esc(r.code)), grNw(r.asset_code ? esc(r.asset_code) : '—'), esc(r.model), esc(r.division), r.pending, r.not_provided]), [4, 5])
        + grNote(t('gr_internal_help')) + grTrunc(x.installations_truncated, x.installations.length)
      : `<p class="gr-empty">${t('gr_empty_internal_gaps')}</p>`);
}

// Informe 1: Estado Global de la IA en la Organización (revisión por la dirección, ISO 42001 9.3)
const GR_PENDING_KEYS = ['incident_actions_overdue', 'incidents_model_undetermined', 'reclassification_pending', 'reviews_overdue', 'assets_models_unknown', 'instances_without_asset'];

function grDocGlobal(x) {
  const inv = x.inventory, inc = x.incidents, act = x.actions, chg = x.changes, gap = x.gaps;
  // Puntos de atención: lo que la gerencia debe decidir o seguir (solo lo que tiene casos)
  const points = [
    [inc.serious, 'gr_pt_serious'], [x.pending.incident_actions_overdue, 'gr_pt_actions_overdue'],
    [inv.risk_to_review, 'gr_pt_risk_to_review'], [inv.reviews_overdue, 'gr_pt_reviews_overdue'],
    [x.pending.incidents_model_undetermined, 'gr_pt_undetermined'], [gap.black_box, 'gr_pt_black_box'],
    [inv.assets_unknown, 'gr_pt_assets_unknown']
  ].filter(([n]) => n > 0);
  const model = m => m ? esc(m) : `<i>${t('gr_model_undetermined')}</i>`;
  return grSec(1, 'gr_s_attention', points.length
      ? `<ul class="gr-points">${points.map(([n, k]) => `<li><b>${n}</b> ${t(k)}</li>`).join('')}</ul>`
      : `<p class="gr-empty">${t('gr_no_attention')}</p>`)
    + grSec(2, 'gr_s_inventory_risk', `<div class="gr-kpi">
      ${grKpi(inv.installations, 'gr_k_installations')}${grKpi(inv.models, 'gr_k_models')}${grKpi(inv.high_risk, 'gr_k_high_risk')}
      ${grKpi(inv.risk_to_review, 'gr_k_risk_to_review')}${grKpi(inv.reviews_overdue, 'gr_k_reviews_overdue')}${grKpi(inv.assets, 'gr_k_assets')}</div>`)
    + grSec(3, 'gr_s_incidents_period', `<div class="gr-kpi">
      ${grKpi(inc.incidents, 'gr_k_incidents')}${grKpi(inc.serious, 'gr_k_serious')}${grKpi(inc.open, 'gr_k_open')}
      ${grKpi(inc.hazards, 'gr_k_hazards')}${grKpi(inc.avg_close_days === null ? '—' : t('gr_days').replace('{n}', inc.avg_close_days), 'gr_k_avg_close')}
      ${grKpi(inc.model_undetermined, 'gr_k_undetermined')}</div>`
      + (inc.by_model.length ? `<h4>${t('gr_top_models')}</h4>` + grTable(['gr_c_model', 'gr_c_incidents', 'gr_c_max_sev'],
          inc.by_model.map(r => [model(r.model), r.incidents, grSev(r.max_severity)]), [1]) : ''))
    + grSec(4, 'gr_s_trend', grTrendHtml(x.trend))
    + grSec(5, 'gr_s_actions_short', `<div class="gr-kpi">
      ${grKpi(act.actions, 'gr_k_actions')}${grKpi(act.pending, 'gr_k_pending')}${grKpi(act.overdue, 'gr_k_actions_overdue')}
      ${grKpi(act.done, 'gr_k_done')}${grKpi(act.on_time_pct === null ? '—' : act.on_time_pct + '%', 'gr_k_on_time')}${grKpi(act.done_late, 'gr_k_done_late')}</div>`)
    + grSec(6, 'gr_s_changes_short', `<div class="gr-kpi gr-kpi4">
      ${grKpi(chg.changes, 'gr_k_changes')}${grKpi(chg.reviewed, 'gr_k_reviewed')}${grKpi(chg.pending_review, 'gr_k_pending_review')}${grKpi(chg.in_monitoring, 'gr_k_in_monitoring')}</div>`)
    + grSec(7, 'gr_s_gaps_short', `<div class="gr-kpi gr-kpi4">
      ${grKpi(gap.models_with_gaps, 'gr_k_models_with_gaps')}${grKpi(gap.black_box, 'gr_k_black_box')}
      ${grKpi(gap.vendor_fields_not_provided, 'gr_k_vendor_not_provided')}${grKpi(gap.installations_with_gaps, 'gr_k_installations_with_gaps')}</div>`)
    + grSec(8, 'gr_s_division', grTable(['gr_c_division', 'gr_c_installations', 'gr_c_high_risk', 'gr_c_risk_to_review', 'gr_c_incidents_period', 'gr_c_serious', 'gr_c_open_now', 'gr_c_overdue'],
        x.by_division.map(r => [esc(r.division), r.installations, r.high_risk, r.risk_to_review, r.incidents, r.serious, r.open_now, r.actions_overdue]), [1, 2, 3, 4, 5, 6, 7])
      + grNote(t('gr_division_help')))
    + grSec(9, 'gr_s_pending', grTable(['gr_c_task', 'gr_c_count'], GR_PENDING_KEYS.map(k => [t('pend_' + k), x.pending[k] || 0]), [1])
      + grNote(t('gr_pending_help')));
}

// Incidentes por mes (12 meses): una serie en barras, con la tabla de valores debajo
function grTrendHtml(trend) {
  const max = Math.max(1, ...trend.map(m => m.incidents));
  const mon = ym => { const [y, m] = ym.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString(LANG === 'es' ? 'es-CL' : 'en-US', { month: 'short', timeZone: 'UTC' }).replace('.', '') + ' ' + y.slice(2); };
  const tip = m => t('gr_trend_tip').replace('{m}', mon(m.month)).replace('{n}', m.incidents).replace('{s}', m.serious);
  return `<figure class="gr-trend" aria-label="${t('gr_s_trend')}">
      <div class="gr-bars">${trend.map(m => `<div class="gr-bar" title="${esc(tip(m))}">
        <span style="height:${Math.round(100 * m.incidents / max)}%"></span></div>`).join('')}</div>
      <table class="gr-tbl gr-trend-tbl"><thead><tr><th></th>${trend.map(m => `<th class="n">${mon(m.month)}</th>`).join('')}</tr></thead>
        <tbody><tr><td>${t('gr_c_incidents')}</td>${trend.map(m => `<td class="n">${m.incidents}</td>`).join('')}</tr>
        <tr><td>${t('gr_c_serious')}</td>${trend.map(m => `<td class="n">${m.serious}</td>`).join('')}</tr></tbody></table>
    </figure>` + grNote(t('gr_trend_help'));
}

// Informe 2: Mapa de riesgo de IA
function grDocRiskMap(x) {
  const T = x.totals;
  const cell = (n, l) => n ? `<span class="gr-heat gr-h-${l}">${n}</span>` : '<span class="gr-zero">0</span>';
  const levels = ['Critical', 'High', 'Medium', 'Low'];
  const matrix = `<table class="gr-tbl gr-matrix"><thead><tr><th>${t('gr_c_division')}</th>${levels.map(l => `<th class="n">${t('risk_' + l)}</th>`).join('')}
      <th class="n">${t('gr_risk_none')}</th><th class="n">${t('gr_c_total')}</th></tr></thead>
    <tbody>${x.matrix.map(r => `<tr><td>${esc(r.division)}</td>${levels.map(l => `<td class="n">${cell(r[l], l)}</td>`).join('')}
      <td class="n">${r.none}</td><td class="n"><b>${r.total}</b></td></tr>`).join('')}
      <tr class="gr-total"><td>${t('gr_c_total')}</td>${levels.map(l => `<td class="n">${T[l]}</td>`).join('')}<td class="n">${T.none}</td><td class="n">${T.total}</td></tr></tbody></table>`;
  return grSec(1, 'gr_s_summary', `<div class="gr-kpi">
      ${grKpi(T.total, 'gr_k_installations')}${grKpi(T.Critical, 'gr_k_critical')}${grKpi(T.High, 'gr_k_high')}
      ${grKpi(T.risk_to_review, 'gr_k_risk_to_review')}${grKpi(T.reviews_overdue, 'gr_k_reviews_overdue')}${grKpi(T.serious_open, 'gr_k_serious_open')}</div>`)
    + grSec(2, 'gr_s_matrix', matrix + grNote(t('gr_matrix_help')))
    + grSec(3, 'gr_s_high_models', x.models.length ? grTable(['gr_c_model', 'gr_c_vendor', 'gr_c_base_risk', 'gr_c_critical', 'gr_c_high', 'gr_c_risk_to_review', 'gr_c_incidents_12m', 'gr_c_where'],
        x.models.map(m => [`${esc(m.name)}${m.black_box ? ` <small>${t('black_box')}</small>` : ''}`, esc(m.vendor), m.base_risk_level ? t('risk_' + m.base_risk_level) : '—',
          m.critical, m.high, m.risk_to_review, m.incidents_12m, m.divisions.map(esc).join(', ')]), [3, 4, 5, 6])
      : `<p class="gr-empty">${t('gr_empty_high_models')}</p>`)
    + grSec(4, 'gr_s_concentration', grTable(['gr_c_division', 'gr_c_risk_to_review', 'gr_c_reviews_overdue', 'gr_c_serious_open'],
        x.matrix.map(r => [esc(r.division), r.risk_to_review, r.reviews_overdue, r.serious_open]), [1, 2, 3]) + grNote(t('gr_concentration_help')));
}
