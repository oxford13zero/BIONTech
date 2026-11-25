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
  const body = { 4: grDocIncidents }[r.id];
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
