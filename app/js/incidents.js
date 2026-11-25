// ============================================================
// BION · Plataforma — Incidentes (lista, registrar, ficha, editar)
// Rutas: #/incidentes · #/incidentes/nuevo?asset=&instance= · #/incidentes/<id> · #/incidentes/<id>/editar
// API: /api/incidents (ver api/incidents.js)
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

// Valores (diseño: docs/incidentes.md). Deben coincidir con api/incidents.js
const INC_KINDS = ['incidente', 'peligro'];
const INC_SEVERITIES = ['incidente', 'incidente_grave', 'desastre'];
const INC_STATUSES = ['abierto', 'cerrado'];
const INC_HARMED = ['personas', 'equipo_vehiculo', 'instalacion', 'mismo_activo', 'medio_ambiente', 'datos'];
const INC_BEHAVIORS = ['actuo_mal', 'no_detecto', 'mal_uso', 'no_claro'];
const INC_LINKS = ['causo', 'contribuyo', 'no_claro'];
const INC_HARM_TYPES = ['fisico_salud', 'psicologico', 'economico', 'reputacional', 'ambiental', 'interes_publico', 'derechos_humanos', 'propiedad_intelectual'];
const SEV_CLS = { incidente: 'l-med', incidente_grave: 'l-high', desastre: 'l-crit' };
// Texto de ayuda opcional: vacío si no existe o está en blanco
const th = key => { const v = t(key); return v === key ? '' : v; };
const sevChip = s => `<span class="chip ${SEV_CLS[s] || 'c-n'}">${t('sev_' + s)}</span>`;

function incidentRoute() {
  const m = S.route.match(/^incidentes(?:\/([\w-]+))?(?:\/(editar|reporte))?$/);
  if (!m) return null;
  if (!m[1]) return { view: 'list' };
  if (m[1] === 'nuevo') return { view: 'new' };
  if (m[2] === 'reporte') return { view: 'report', id: m[1] };   // reporte formal (reports.js)
  return { view: 'detail', id: m[1] };
}

function viewIncidents() {
  const r = incidentRoute();
  if (r.view === 'list') return viewIncidentList();
  if (r.view === 'detail') return viewIncidentDetail(r.id);
  if (r.view === 'report') return grIncidentReportHtml(r.id);
  if (!can('incident.create')) return `<div class="card empty">${t('err_not_allowed')}</div>`;
  return viewIncidentWizard();
}

function incErrorText(msg) {
  const map = {
    'The model was not installed on that date': 'err_not_installed',
    'EU AI Act serious incident requires regulator authority and notification deadline': 'err_eu_fields',
    'The instance does not belong to this asset': 'err_instance_asset',
    'Date cannot be in the future': 'err_future_date',
    'Incident is closed': 'err_inc_closed',
    'EU AI Act is not enabled for this company': 'err_eu_disabled'
  };
  return map[msg] ? t(map[msg]) : apiErrorText(msg);
}

// ── Lista ─────────────────────────────────────────────────────
// Filtros en la URL: q (texto), status (abierto por defecto · cerrado · todos), severity, from (desde el Dashboard)
function incFilters() {
  const p = parseHash().params;
  return { q: p.q || '', status: p.status || 'abierto', severity: p.severity || '', from: p.from || '' };
}

function setIncFilter(key, value) {
  const f = incFilters();
  f[key] = value;
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !(k === 'status' && v === 'abierto'))).toString();
  history.replaceState(null, '', '#/incidentes' + (qs ? '?' + qs : ''));
  render();
}

// Búsqueda: espera a que la persona deje de escribir
let incSearchTimer = null;
function incSearch(value) {
  clearTimeout(incSearchTimer);
  incSearchTimer = setTimeout(() => setIncFilter('q', value.trim()), 300);
}

async function loadIncidents(key, f) {
  S.incidents = { key, loading: true };
  const params = { ...(divisionParam() ? { division: divisionParam() } : {}) };
  if (f.q) params.q = f.q;
  if (f.status !== 'todos') params.status = f.status;
  if (f.severity) params.severity = f.severity;
  if (f.from) params.from = f.from;
  try { S.incidents = { key, list: await apiGet('/api/incidents?' + new URLSearchParams(params)) }; }
  catch (e) { if (!S.user) return; S.incidents = { key, error: true }; }
  if (incidentRoute()?.view === 'list') render();
}

function viewIncidentList() {
  const f = incFilters();
  const key = JSON.stringify([S.division, f]);
  if (!S.incidents || S.incidents.key !== key) loadIncidents(key, f);
  const x = S.incidents;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  let body;
  if (x.loading || !x.list && !x.error) body = `<div class="empty small">${t('loading')}</div>`;
  else if (x.error) body = `<div class="empty small">${t('data_error')}</div>`;
  else {
    const rows = x.list.map(i => `
      <tr class="row" onclick="location.hash='#/incidentes/${esc(i.id)}'">
        <td>${esc(i.occurred_at)}</td>
        <td><b>${esc(i.title)}</b><small>${esc(i.asset_code)} · ${esc(i.branch_name)}</small></td>
        <td>${i.model_name ? `${esc(i.model_name)}${i.version ? `<small>${verLabel(i.version)}</small>` : ''}` : `<span class="chip c-a">${t('model_undetermined')}</span>`}</td>
        <td>${t('sev_' + i.severity)}${i.kind === 'peligro' ? `<small>${t('kind_peligro')}</small>` : ''}</td>
        <td><span class="chip ${i.status === 'abierto' ? 'c-g' : 'c-n'}">${t('ist_' + i.status)}</span></td>
      </tr>`).join('');
    body = `<div class="tbl-wrap"><table>
      <thead><tr><th>${t('f_date')}</th><th>${t('nav_incidents')}</th><th>${t('model')}</th><th>${t('f_severity')}</th><th>${t('status')}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" class="empty small">${t('incidents_none')}</td></tr>`}</tbody>
    </table></div><p class="count-note">${t('n_incidents').replace('{n}', x.list.length)}</p>`;
  }
  return `
    ${can('incident.create') ? `<div class="page-actions"><a class="btn btn-primary" href="#/incidentes/nuevo">+ ${t('new_incident')}</a></div>` : ''}
    <div class="toolbar inc-toolbar">
      <input class="input search" id="incSearch" type="search" placeholder="${t('inc_search')}" aria-label="${t('inc_search')}" value="${esc(f.q)}" oninput="incSearch(this.value)">
      <select class="input" aria-label="${t('status')}" onchange="setIncFilter('status', this.value)">
        ${opt('abierto', t('inc_open_pl'), f.status)}${opt('cerrado', t('inc_closed_pl'), f.status)}${opt('todos', t('inc_all_pl'), f.status)}</select>
      <select class="input" aria-label="${t('f_severity')}" onchange="setIncFilter('severity', this.value)">
        ${opt('', t('all_severities'), f.severity)}${INC_SEVERITIES.map(k => opt(k, t('sev_' + k), f.severity)).join('')}</select>
    </div>
    ${f.from ? `<div class="shortcuts"><button class="sc on" onclick="setIncFilter('from', '')">${t('since_date').replace('{d}', esc(f.from))} ✕</button></div>` : ''}
    <div class="card">${body}</div>`;
}

// ── Ficha del incidente: registro + investigación en pestañas ──────────
// Ruta: #/incidentes/<id>?tab=registro|personas|contexto|eu|cierre
// S.incDetail = { id, data: { incident, actions, eu_enabled, suggestions } }
// S.incEdit   = { key, v: {...}, insts, error, busy }   (formulario de la pestaña abierta)
const INC_GROUPS = ['trabajadores', 'consumidores', 'grupos_vulnerables', 'empresas', 'publico'];
const INC_PRINCIPLES = ['bienestar', 'derechos_equidad_privacidad', 'transparencia', 'robustez_seguridad', 'rendicion_cuentas'];
const INC_DATA_ISSUES = ['sesgados', 'erroneos', 'no_representativos', 'sin_consentimiento', 'no_se_sabe'];
const INC_EU = ['muerte_salud', 'infraestructura_critica', 'derechos_fundamentales', 'propiedad_ambiente'];
const INC_MEASURES = ['corrigio', 'alerta', 'retiro', 'investigacion_legal'];
const SRC_LABEL = { empresa: 'src_company', modelo: 'src_model', instalacion: 'src_instance' };

// Campos de cada pestaña. type: text · area · date · time · int · model · one · multi · yn · links · h (subtítulo)
const INC_SPEC = {
  registro: [
    { k: 'title', type: 'text', label: 'f_title', req: true, wide: true },
    { k: 'description', type: 'area', label: 'f_description' },
    { k: 'occurred_at', type: 'date', label: 'f_date', req: true },
    { k: 'occurred_time', type: 'time', label: 'f_time' },
    { k: 'instance_id', type: 'model', label: 'q_model' },
    { k: 'harmed_targets', type: 'multi', opts: INC_HARMED, lab: 'harmed_', label: 'q_harmed', req: true, cls: 'c4' },
    { k: 'harmed_description', type: 'text', label: 'f_harmed_desc' },
    { k: 'ai_behavior', type: 'one', opts: INC_BEHAVIORS, lab: 'behavior_', help: 'behaviorh_', label: 'q_behavior', req: true },
    { k: 'ai_link', type: 'one', opts: INC_LINKS, lab: 'link_', help: 'linkh_', label: 'q_link', req: true },
    { k: 'kind', type: 'one', opts: INC_KINDS, lab: 'kind_', help: 'kindh_', label: 'q_kind', req: true },
    { k: 'harm_types', type: 'multi', opts: INC_HARM_TYPES, lab: 'harm_', help: 'harmh_', label: 'q_harm_types', req: true, cls: 'c4' },
    { k: 'severity', type: 'one', opts: INC_SEVERITIES, lab: 'sev_', help: 'sevh_', label: 'q_severity', req: true },
    { k: 'country', type: 'text', label: 'f_inc_country' },
    { k: 'location', type: 'text', label: 'f_inc_location' },
    { k: 'evidence_links', type: 'links', label: 'evidence' }
  ],
  personas: [
    { k: 'affected_groups', type: 'multi', opts: INC_GROUPS, lab: 'grp_', help: 'grph_', label: 'q_groups', cls: 'c4' },
    { k: 'injured_count', type: 'int', label: 'f_injured' },
    { k: 'oecd_principles', type: 'multi', opts: INC_PRINCIPLES, lab: 'pr_', help: 'prh_', label: 'q_principles' }
  ],
  contexto: [
    { type: 'h', label: 'h_context_econ' },
    { k: 'sector', type: 'text', label: 'f_sector', sug: true }, { k: 'deployment_scope', type: 'text', label: 'f_deployment', sug: true },
    { k: 'data_issues', type: 'multi', opts: INC_DATA_ISSUES, lab: 'di_', label: 'q_data', cls: 'c4' },
    { type: 'h', label: 'h_model' },
    { k: 'model_type', type: 'text', label: 'f_inc_model_type', sug: true }, { k: 'explainability', type: 'text', label: 'f_explainability', sug: true },
    { k: 'robustness_failure', type: 'text', label: 'f_robustness' },
    { type: 'h', label: 'h_task' },
    { k: 'ai_task', type: 'text', label: 'f_task', sug: true }, { k: 'autonomy', type: 'text', label: 'f_autonomy', sug: true },
    { k: 'human_oversight', type: 'text', label: 'f_oversight', sug: true }
  ],
  eu: [
    { k: 'eu_criteria', type: 'yn', opts: INC_EU, lab: 'eu_', label: 'q_eu' },
    { k: 'regulator_authority', type: 'text', label: 'f_authority', euOnly: true },
    { k: 'notification_deadline', type: 'date', label: 'f_deadline', euOnly: true },
    { k: 'eu_notified_at', type: 'date', label: 'f_eu_notified', euOnly: true },
    { k: 'eu_notification_ref', type: 'text', label: 'f_eu_ref', euOnly: true }
  ],
  cierre: [
    { k: 'measures_taken', type: 'multi', opts: INC_MEASURES, lab: 'ms_', label: 'q_measures', cls: 'c4' },
    { type: 'h', label: 'h_root' },
    { k: 'root_cause_technical', type: 'area', label: 'f_root_tech' }, { k: 'root_cause_organizational', type: 'area', label: 'f_root_org' },
    { type: 'actions' },
    { type: 'h', label: 'h_closure' },
    { k: 'effectiveness_check', type: 'area', label: 'f_effectiveness', ph: 'f_effectiveness_ph' },
    { k: 'lessons_learned', type: 'area', label: 'f_lessons' }
  ]
};
const incFields = tab => INC_SPEC[tab].filter(f => f.k);

async function loadIncident(id) {
  S.incDetail = { id, loading: true };
  try { S.incDetail = { id, data: await apiGet('/api/incidents?id=' + encodeURIComponent(id)) }; }
  catch (e) { if (!S.user) return; S.incDetail = { id, error: /404|403/.test(e.message) ? 'incident_not_found' : 'data_error' }; }
  const r = incidentRoute();
  if (r && r.id === id) render();
}

function incTabs(d) { return ['registro', 'personas', 'contexto', ...(d.eu_enabled ? ['eu'] : []), 'cierre']; }
function incTab(d) { const tab = parseHash().params.tab; return incTabs(d).includes(tab) ? tab : 'registro'; }
function setIncTab(tab) {
  S.incEdit = null; S.incMsg = '';
  history.replaceState(null, '', `#/incidentes/${S.incDetail.id}?tab=${tab}`);
  render();
}
const incCanWrite = x => !!can('incident.write') && x.status === 'abierto';

// Pestaña con datos (marca ✓)
function incTabDone(x, tab, actions) {
  if (tab === 'registro') return true;
  if (tab === 'personas') return (x.affected_groups || []).length > 0 || x.injured_count != null || (x.oecd_principles || []).length > 0;
  if (tab === 'contexto') return !!(x.sector || x.deployment_scope || x.model_type || (x.data_issues || []).length || x.robustness_failure);
  if (tab === 'eu') return !!x.eu_notified_at;
  if (tab === 'cierre') return x.status === 'cerrado';
  return false;
}

// Valores iniciales del formulario: lo guardado o, si falta, lo sugerido por el inventario
function initIncEdit(d, tab) {
  const key = d.incident.id + ':' + tab;
  if (S.incEdit && S.incEdit.key === key) return;
  const x = d.incident, v = {};
  for (const f of incFields(tab)) {
    let val = x[f.k];
    if (f.sug && (val === null || val === undefined || val === '') && d.suggestions[f.k]?.value) val = d.suggestions[f.k].value;
    if (f.type === 'links') val = (val || []).map(l => ({ label: l.label || '', url: l.url || '' }));
    if (f.type === 'model') val = x.instance_id || '__unknown';
    v[f.k] = val ?? (['multi', 'yn'].includes(f.type) ? [] : '');
  }
  S.incEdit = { key, tab, v };
  if (tab === 'registro') incLoadInsts(x.asset_id);
}

async function incLoadInsts(assetId) {
  const e = S.incEdit;
  try { const a = await apiGet('/api/assets?id=' + encodeURIComponent(assetId)); if (S.incEdit === e) e.insts = a.instances; }
  catch (err) { if (S.incEdit === e) e.insts = []; }
  if (S.incEdit === e) render();
}

// Lee el formulario de la pestaña abierta
function collectIncEdit() {
  const e = S.incEdit;
  if (!e || !document.getElementById('incTabForm')) return;
  for (const f of incFields(e.tab)) {
    const el = document.getElementById('ix_' + f.k);
    if (f.type === 'multi') e.v[f.k] = [...document.querySelectorAll(`input[name="ix_${f.k}"]:checked`)].map(i => i.value);
    else if (f.type === 'one') e.v[f.k] = document.querySelector(`input[name="ix_${f.k}"]:checked`)?.value || '';
    else if (f.type === 'yn') e.v[f.k] = f.opts.filter(o => document.querySelector(`input[name="ix_${f.k}_${o}"]:checked`)?.value === 'si');
    else if (f.type === 'links') e.v[f.k] = e.v[f.k].map((l, i) => ({ label: document.getElementById(`ix_lk_label_${i}`)?.value ?? l.label, url: document.getElementById(`ix_lk_url_${i}`)?.value ?? l.url }));
    else if (el) e.v[f.k] = el.value;
  }
}
function incEditRerender() { collectIncEdit(); if (S.incEdit) S.incEdit.error = ''; render(); }
function incAddLink() { collectIncEdit(); S.incEdit.v.evidence_links.push({ label: '', url: '' }); render(); }
function incRemoveLink(i) { collectIncEdit(); S.incEdit.v.evidence_links.splice(i, 1); render(); }

async function saveIncSection() {
  collectIncEdit();
  const e = S.incEdit, id = S.incDetail.id, body = {};
  const missing = [];
  for (const f of incFields(e.tab)) {
    let val = e.v[f.k];
    if (f.type === 'model') { body.instance_id = val && val !== '__unknown' ? val : null; continue; }
    if (f.type === 'int') val = String(val).trim() === '' ? null : Number(val);
    else if (f.type === 'links') val = val.filter(l => String(l.url).trim()).map(l => ({ label: String(l.label).trim(), url: String(l.url).trim() }));
    else if (typeof val === 'string') val = val.trim() || null;
    if (f.euOnly && !e.v.eu_criteria.length) val = null;
    if (f.req && (val === null || (Array.isArray(val) && !val.length))) missing.push(t(f.label));
    body[f.k] = val;
  }
  if (missing.length) { e.error = t('required_fields') + ' ' + missing.join(', '); return render(); }
  if (body.injured_count !== undefined && body.injured_count !== null && (!Number.isInteger(body.injured_count) || body.injured_count < 0)) { e.error = t('f_injured') + ': ' + t('invalid_value'); return render(); }
  if ((body.evidence_links || []).some(l => !/^https?:\/\/\S+$/i.test(l.url))) { e.error = t('err_links'); return render(); }
  if (e.tab === 'eu' && body.eu_criteria.length && (!body.regulator_authority || !body.notification_deadline)) { e.error = t('err_eu_fields'); return render(); }
  e.busy = true; e.error = ''; render();
  try {
    await apiSend('PUT', `/api/incidents?id=${encodeURIComponent(id)}&section=${e.tab}`, body);
  } catch (err) {
    e.busy = false; e.error = t('save_error') + ' ' + incErrorText(err.message); return render();
  }
  S.incEdit = null; S.incidents = null;
  S.incDetail = null; S.incMsg = t('section_saved');
  loadIncident(id);
}

// ── Controles de formulario (editables o de solo lectura) ──
function incFieldHtml(f, v, ctx) {
  const id = 'ix_' + f.k, val = v[f.k];
  const lbl = (extra = '') => `<label for="${id}">${t(f.label)}${f.req ? ' *' : ''}${extra}</label>`;
  const card = (type, name, value, on, title, help) => `<label class="opt"><input type="${type}" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}>
    <span><b>${esc(title)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span></label>`;
  if (f.type === 'h') return `<div class="wz-q">${t(f.label)}</div>`;
  if (f.type === 'actions') return incActionsHtml(ctx);
  if (f.euOnly && !v.eu_criteria.length) return '';
  if (f.type === 'multi' || f.type === 'one') {
    const type = f.type === 'multi' ? 'checkbox' : 'radio';
    return `<div class="wz-q">${t(f.label)}${f.req ? ' *' : ''}</div><div class="opts ${f.cls || ''}">
      ${f.opts.map(o => card(type, id, o, f.type === 'multi' ? val.includes(o) : val === o, t(f.lab + o), f.help ? th(f.help + o) : '')).join('')}</div>`;
  }
  if (f.type === 'yn') {
    const serious = val.length > 0;
    return `<div class="wz-q">${t(f.label)}</div><p class="wz-help">${t('eu_help')}</p>
      ${f.opts.map(o => `<div class="yn"><span>${t(f.lab + o)}</span><span class="seg">
        <label><input type="radio" name="${id}_${o}" value="si" ${val.includes(o) ? 'checked' : ''} onchange="incEditRerender()"><span>${t('yes')}</span></label>
        <label><input type="radio" name="${id}_${o}" value="no" ${val.includes(o) ? '' : 'checked'} onchange="incEditRerender()"><span>${t('no')}</span></label></span></div>`).join('')}
      <div class="${serious ? 'box-warn' : 'box-ok'}">${serious ? '⚠️ ' + t('eu_is_serious') : '✅ ' + t('eu_not_serious')}</div>`;
  }
  if (f.type === 'links') {
    return `<div class="wz-q small">${t(f.label)}</div><p class="wz-help">${t('evidence_help')}</p>
      ${val.map((l, i) => `<div class="link-row">
        <input class="input" id="ix_lk_label_${i}" value="${esc(l.label)}" placeholder="${t('link_label')}" aria-label="${t('link_label')}">
        <input class="input" id="ix_lk_url_${i}" value="${esc(l.url)}" placeholder="${t('link_url')}" aria-label="${t('link_url')}">
        <button class="btn btn-ghost btn-sm" onclick="incRemoveLink(${i})" aria-label="${t('remove')}">✕</button></div>`).join('')}
      <button class="btn btn-sm" onclick="incAddLink()">${t('add_link')}</button>`;
  }
  if (f.type === 'model') {
    const insts = ctx.insts;
    const opt = (value, label) => `<option value="${esc(value)}" ${String(value) === String(val) ? 'selected' : ''}>${esc(label)}</option>`;
    return `<div class="field wide">${lbl()}${!insts ? `<div class="no-info">${t('loading')}</div>` : `<select class="input" id="${id}">
      ${insts.map(i => opt(i.id, `${i.model_name} · ${i.vendor || ''}${i.status !== 'activa' ? ' — ' + t('st_retired_f') : ''}`)).join('')}
      ${opt('__unknown', t('model_unknown'))}</select>`}<small class="count-note">${t('version_auto_note')}</small></div>`;
  }
  // Texto, fecha, hora, número: etiqueta de origen si viene del inventario
  let src = '';
  const sg = f.sug && ctx.suggestions[f.k];
  if (sg && !ctx.incident[f.k]) {
    src = (!sg.value || sg.state) ? ` <span class="src warn">${t('not_in_record')}</span>` : ` <span class="src">${t(SRC_LABEL[sg.source])}</span>`;
  }
  const wide = f.type === 'area' ? 'wide' : '';
  if (f.type === 'area') return `<div class="field ${wide}">${lbl(src)}<textarea class="input" id="${id}" rows="3" ${f.ph ? `placeholder="${t(f.ph)}"` : ''}>${esc(val)}</textarea></div>`;
  const type = { date: 'date', time: 'time', int: 'number' }[f.type] || 'text';
  return `<div class="field ${f.wide ? 'wide' : ''}">${lbl(src)}<input class="input" type="${type}" id="${id}" value="${esc(String(val ?? '').slice(0, f.type === 'time' ? 5 : undefined))}"
    ${f.type === 'int' ? 'min="0" step="1"' : ''} ${f.type === 'date' && f.k === 'occurred_at' ? `max="${today()}"` : ''}></div>`;
}

// Texto de solo lectura de un campo
function incValueText(f, x) {
  const val = x[f.k];
  const none = `<span class="no-info">${t('no_info')}</span>`;
  if (f.type === 'multi') return val && val.length ? val.map(o => esc(t(f.lab + o))).join(', ') : none;
  if (f.type === 'one') return val ? esc(t(f.lab + val)) : none;
  if (f.type === 'yn') return val && val.length ? `<span class="chip c-r">${t('eu_is_serious')}</span><div>${val.map(o => esc(t(f.lab + o))).join('<br>')}</div>` : t('eu_not_serious');
  if (f.type === 'links') return val && val.length ? val.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.label || l.url)}</a>`).join('<br>') : none;
  if (f.type === 'model') return x.model_name ? `<a href="#/instancias/${esc(x.instance_id)}"><b>${esc(x.model_name)}</b></a>${x.version ? ` · ${esc(x.version)}` : ''}` : `<span class="chip c-a">${t('model_undetermined')}</span>`;
  if (f.type === 'time') return val ? esc(String(val).slice(0, 5)) : none;
  return val !== null && val !== undefined && val !== '' ? esc(val) : none;
}

function incReadOnlyHtml(tab, d) {
  const x = d.incident;
  let html = '', grid = [];
  const flush = () => { if (grid.length) { html += `<div class="fields">${grid.join('')}</div>`; grid = []; } };
  for (const f of INC_SPEC[tab]) {
    if (f.type === 'h') { flush(); html += `<div class="wz-q">${t(f.label)}</div>`; continue; }
    if (f.type === 'actions') { flush(); html += incActionsHtml({ ...d, readOnly: true }); continue; }
    if (f.euOnly && !(x.eu_criteria || []).length) continue;
    const wide = ['area', 'multi', 'yn', 'links'].includes(f.type) ? 'wide' : '';
    grid.push(`<div class="field ${wide}"><label>${t(f.label)}</label><div>${incValueText(f, x)}</div></div>`);
  }
  flush();
  return html;
}

// ── Acciones correctivas ──
function incActionsHtml(ctx) {
  const d = S.incDetail.data, x = d.incident, write = !ctx.readOnly && incCanWrite(x);
  const st = a => a.status === 'terminada' ? `<span class="chip c-g">${t('act_terminada')}</span>`
    : a.overdue ? `<span class="chip c-r">${t('act_vencida')}</span>` : `<span class="chip c-a">${t('act_pendiente')}</span>`;
  const rows = d.actions.map(a => `<tr><td><b>${esc(a.action)}</b></td><td>${esc(a.owner)}</td><td>${esc(a.due_date)}</td><td>${st(a)}</td>
    ${write ? `<td class="actions"><button class="btn btn-ghost btn-sm" onclick="incActionStatus('${esc(a.id)}','${a.status === 'terminada' ? 'pendiente' : 'terminada'}')">
      ${a.status === 'terminada' ? t('act_reopen') : t('act_finish')}</button>
      <button class="btn btn-ghost btn-sm" onclick="incActionDelete('${esc(a.id)}')" aria-label="${t('remove')}">✕</button></td>` : ''}</tr>`).join('');
  const a = S.incActForm || {};
  return `<div class="wz-q">${t('h_actions')} <small class="count-note">(ISO 42001 · 10.2)</small></div>
    ${rows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('act_action')}</th><th>${t('act_owner')}</th><th>${t('act_due')}</th><th>${t('act_status')}</th>${write ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="empty small">${t('act_none')}</div>`}
    ${write ? `<div class="act-add">
      <input class="input" id="ia_action" placeholder="${t('act_action')}" aria-label="${t('act_action')}" value="${esc(a.action || '')}">
      <input class="input" id="ia_owner" placeholder="${t('act_owner')}" aria-label="${t('act_owner')}" value="${esc(a.owner || '')}">
      <input class="input" type="date" id="ia_due" aria-label="${t('act_due')}" value="${esc(a.due || '')}">
      <button class="btn btn-sm" onclick="incActionAdd()">+ ${t('act_add')}</button></div>
      ${a.error ? `<div class="form-error">${esc(a.error)}</div>` : ''}` : ''}`;
}

async function incActionAdd() {
  collectIncEdit();
  const val = id => document.getElementById(id).value.trim();
  const f = { action: val('ia_action'), owner: val('ia_owner'), due: val('ia_due') };
  if (!f.action || !f.owner || !f.due) { S.incActForm = { ...f, error: t('act_required') }; return render(); }
  try {
    await apiSend('POST', `/api/incidents?id=${encodeURIComponent(S.incDetail.id)}&actions=1`, { action: f.action, owner: f.owner, due_date: f.due });
  } catch (e) { S.incActForm = { ...f, error: t('save_error') + ' ' + incErrorText(e.message) }; return render(); }
  S.incActForm = null;
  incReloadKeepingForm();
}
async function incActionStatus(actionId, status) {
  collectIncEdit();
  try { await apiSend('PUT', `/api/incidents?id=${encodeURIComponent(S.incDetail.id)}&action_id=${encodeURIComponent(actionId)}`, { status }); }
  catch (e) { S.incActForm = { error: t('save_error') + ' ' + incErrorText(e.message) }; return render(); }
  incReloadKeepingForm();
}
async function incActionDelete(actionId) {
  collectIncEdit();
  try { await apiSend('DELETE', `/api/incidents?id=${encodeURIComponent(S.incDetail.id)}&action_id=${encodeURIComponent(actionId)}`); }
  catch (e) { S.incActForm = { error: t('save_error') + ' ' + incErrorText(e.message) }; return render(); }
  incReloadKeepingForm();
}
// Recarga la ficha sin perder lo escrito en la pestaña
async function incReloadKeepingForm() {
  const id = S.incDetail.id;
  try { S.incDetail = { id, data: await apiGet('/api/incidents?id=' + encodeURIComponent(id)) }; } catch (e) { /* se mantiene la ficha anterior */ }
  S.incidents = null;
  loadNav();
  render();
}

// ── Cierre ──
function incCloseMissing(d) {
  const x = d.incident, miss = [];
  if (!x.root_cause_technical && !x.root_cause_organizational) miss.push(t('miss_root_cause'));
  if (!x.effectiveness_check) miss.push(t('miss_effectiveness'));
  const pend = d.actions.filter(a => a.status === 'pendiente').length;
  if (pend) miss.push(t('miss_actions').replace('{n}', pend));
  return miss;
}
function openIncClose() { collectIncEdit(); S.incClose = { error: '' }; render(); }
function closeIncCloseModal() { if (S.incClose?.busy) return; S.incClose = null; render(); }
async function confirmIncClose() {
  const id = S.incDetail.id;
  S.incClose.busy = true; render();
  try { await apiSend('POST', `/api/incidents?id=${encodeURIComponent(id)}&do=close`); }
  catch (e) { S.incClose.busy = false; S.incClose.error = t('save_error') + ' ' + incErrorText(e.message); return render(); }
  S.incClose = null; S.incEdit = null; S.incidents = null; S.incDetail = null; S.incMsg = '';
  loadNav();
  loadIncident(id);
}

function viewIncidentDetail(id) {
  const back = `<button class="back" onclick="location.hash='#/incidentes'">← ${t('back_to_incidents')}</button>`;
  if (!S.incDetail || S.incDetail.id !== id) { loadIncident(id); return back + `<div class="card empty">${t('loading')}</div>`; }
  const d = S.incDetail;
  if (d.loading) return back + `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return back + `<div class="card empty">${t(d.error)}</div>`;
  const data = d.data, x = data.incident, tab = incTab(data), write = incCanWrite(x);
  const when = v => new Date(v).toLocaleDateString(LANG === 'es' ? 'es-CL' : 'en-US', { dateStyle: 'medium' });

  let body;
  if (write) {
    initIncEdit(data, tab);
    const e = S.incEdit, ctx = { ...data, insts: e.insts };
    const fields = INC_SPEC[tab].map(f => incFieldHtml(f, e.v, ctx));
    // Agrupa los campos simples en rejillas de 2–3 columnas
    let html = '', grid = [];
    INC_SPEC[tab].forEach((f, i) => {
      const simple = ['text', 'date', 'time', 'int', 'area', 'model'].includes(f.type);
      if (simple) { if (fields[i]) grid.push(fields[i]); return; }
      if (grid.length) { html += `<div class="fields form">${grid.join('')}</div>`; grid = []; }
      html += fields[i];
    });
    if (grid.length) html += `<div class="fields form">${grid.join('')}</div>`;
    const inv = tab === 'contexto' ? `<div class="box-info"><b>${t('from_inventory_title')}</b>${t('from_inventory_help')}</div>` : '';
    body = `<div class="card" id="incTabForm" ${tab === 'eu' ? '' : 'onchange="if(S.incEdit)S.incEdit.error=\'\'"'}>${inv}${html}</div>
      ${e.error ? `<div class="form-error" role="alert">${esc(e.error)}</div>` : ''}
      <div class="wz-foot"><span></span><div class="right">
        <button class="btn btn-primary btn-sm" onclick="saveIncSection()" ${e.busy ? 'disabled' : ''}>${e.busy ? t('saving') : t('save_section')}</button></div></div>`;
    if (tab === 'cierre') {
      const miss = incCloseMissing(data);
      body += `<div class="card mt close-box"><div>${miss.length
          ? `<b>${t('close_missing')}</b> ${miss.join(' · ')}` : `<b>${t('ready_to_close')}</b> <span class="count-note">${t('close_confirm_help')}</span>`}</div>
        <button class="btn btn-danger btn-sm" onclick="openIncClose()" ${miss.length ? 'disabled' : ''}>${t('close_incident')}</button></div>`;
    }
  } else {
    body = `<div class="card">${incReadOnlyHtml(tab, data)}</div>`;
  }

  return `${back}
    <div class="head-row"><h1>${esc(x.title)}</h1>
      <span class="chip ${x.status === 'abierto' ? 'c-g' : 'c-n'}">${t('ist_' + x.status)}</span>
      <span class="chip c-n">${t('f_kind')}: ${t('kind_' + x.kind)}</span>
      <span class="chip ${SEV_CLS[x.severity] || 'c-n'}">${t('f_severity')}: ${t('sev_' + x.severity)}</span>
      ${x.eu_serious_incident ? `<span class="chip c-r">${t('eu_serious_short')}</span>` : ''}
      ${grIncReportAllowed(x) ? `<button class="btn btn-sm head-act" onclick="openIncReport()">${t('gr_inc_btn')}</button>` : ''}</div>
    <div class="crumb">${esc(x.occurred_at)}${x.occurred_time ? ' ' + esc(String(x.occurred_time).slice(0, 5)) : ''} ·
      <a href="#/activos/${esc(x.asset_id)}">${esc(x.asset_code)} — ${esc(x.asset_name)}</a> ·
      ${x.model_name ? `<a href="#/instancias/${esc(x.instance_id)}">${esc(x.model_name)}</a>${x.version ? ' (' + esc(x.version) + ')' : ''}` : t('model_undetermined')} ·
      ${esc(x.branch_name)}${x.reported_by_email ? ' · ' + esc(t('reported_by').replace('{u}', x.reported_by_email)) : ''}</div>
    ${x.status === 'cerrado' ? `<div class="alert">${esc(t('closed_by').replace('{d}', when(x.closed_at)).replace('{u}', x.closed_by_email || '—'))} · ${t('read_only_closed')}</div>` : ''}
    ${S.incMsg ? `<div class="alert info">${esc(S.incMsg)}</div>` : ''}
    <div class="tabs" role="tablist">${incTabs(data).map(k => `<button class="tab ${k === tab ? 'on' : ''} ${incTabDone(x, k, data.actions) && k !== tab ? 'done' : ''}"
      role="tab" aria-selected="${k === tab}" onclick="setIncTab('${k}')">${t('tab_' + k)}</button>`).join('')}</div>
    ${body}
    ${S.incClose ? modalHtml({ title: t('close_confirm_title'), subtitle: x.title, close: 'closeIncCloseModal',
      body: `<p class="count-note">${t('close_confirm_help')}</p>${S.incClose.error ? `<div class="form-error">${esc(S.incClose.error)}</div>` : ''}`,
      footer: `<button class="btn btn-ghost btn-sm" onclick="closeIncCloseModal()" ${S.incClose.busy ? 'disabled' : ''}>${t('cancel')}</button>
        <button class="btn btn-danger btn-sm" onclick="confirmIncClose()" ${S.incClose.busy ? 'disabled' : ''}>${S.incClose.busy ? t('saving') : t('close_incident')}</button>` }) : ''}
    ${S.incReport ? grIncReportModal(x) : ''}`;
}

// ── Registrar: asistente de 3 pasos (CSET → OECD → revisar) ──────────
// S.wiz = { step, v: {...}, assets, insts: {assetId: [...]}, meta, autoLoc, error, busy }
function initWizard() {
  if (S.wiz) return;
  const p = parseHash().params;
  S.wiz = { step: 1, insts: {}, autoLoc: '', v: {
    asset_id: p.asset || '', model: p.instance || '', occurred_at: today(), occurred_time: '',
    harmed_targets: [], harmed_description: '', title: '', description: '', ai_behavior: '', ai_link: '',
    kind: '', harm_types: [], severity: '', country: '', location: '', links: [] } };
  const q = divisionParam() ? '?division=' + encodeURIComponent(divisionParam()) : '';
  apiGet('/api/assets' + q).then(a => { if (!S.wiz) return; S.wiz.assets = a; wizAutoLocation(); render(); })
    .catch(() => { if (S.wiz) { S.wiz.assets = []; render(); } });
  apiGet('/api/incidents?meta=1').then(m => { if (!S.wiz) return; S.wiz.meta = m; if (!S.wiz.v.country) S.wiz.v.country = m.country || ''; render(); })
    .catch(() => { if (S.wiz) S.wiz.meta = {}; });
  if (S.wiz.v.asset_id) wizLoadInstances(S.wiz.v.asset_id);
}

async function wizLoadInstances(assetId) {
  if (!assetId || S.wiz.insts[assetId]) return;
  S.wiz.insts[assetId] = 'loading';
  try { const d = await apiGet('/api/assets?id=' + encodeURIComponent(assetId)); if (S.wiz) S.wiz.insts[assetId] = d.instances; }
  catch (e) { if (S.wiz) S.wiz.insts[assetId] = []; }
  if (S.wiz) render();
}

// Lugar sugerido desde el activo (división · área), sin pisar lo que escribió el usuario
function wizAutoLocation() {
  const w = S.wiz, a = (w.assets || []).find(x => String(x.id) === String(w.v.asset_id));
  if (!a) return;
  const auto = [a.branch_name, a.area].filter(Boolean).join(' · ');
  if (!w.v.location || w.v.location === w.autoLoc) w.v.location = auto;
  w.autoLoc = auto;
}

// Lee lo escrito en el paso actual para no perderlo al volver a dibujar
function collectWizard() {
  const w = S.wiz;
  if (!w || !document.getElementById('wizard')) return;
  const val = id => document.getElementById(id)?.value;
  const checked = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
  const set = (k, v) => { if (v !== undefined) w.v[k] = typeof v === 'string' ? v : v; };
  if (w.step === 1) {
    set('asset_id', val('w_asset')); set('occurred_at', val('w_date')); set('occurred_time', val('w_time'));
    set('model', val('w_model')); set('harmed_description', val('w_harmed_desc')); set('title', val('w_title'));
    set('description', val('w_desc'));
    w.v.harmed_targets = checked('w_harmed');
    w.v.ai_behavior = checked('w_behavior')[0] || ''; w.v.ai_link = checked('w_link')[0] || '';
  }
  if (w.step === 2) {
    w.v.kind = checked('w_kind')[0] || ''; w.v.harm_types = checked('w_harm'); w.v.severity = checked('w_sev')[0] || '';
    set('country', val('w_country')); set('location', val('w_location'));
    w.v.links = w.v.links.map((l, i) => ({ label: val('w_link_label_' + i) ?? l.label, url: val('w_link_url_' + i) ?? l.url }));
  }
}

function wizAssetChanged() {
  collectWizard();
  S.wiz.v.model = '';
  wizAutoLocation();
  wizLoadInstances(S.wiz.v.asset_id);
  render();
}

function wizValidate(step) {
  const v = S.wiz.v, miss = [];
  if (step === 1) {
    if (!v.asset_id) miss.push(t('asset'));
    if (!v.occurred_at) miss.push(t('f_date'));
    if (!v.model) miss.push(t('model'));
    if (!v.harmed_targets.length) miss.push(t('harmed_word'));
    if (!String(v.title).trim()) miss.push(t('f_title'));
    if (!v.ai_behavior) miss.push(t('q_behavior'));
    if (!v.ai_link) miss.push(t('q_link'));
    if (miss.length) return t('required_fields') + ' ' + miss.join(', ');
    if (v.occurred_at > today()) return t('err_future_date');
  }
  if (step === 2) {
    if (!v.kind) miss.push(t('q_kind'));
    if (!v.harm_types.length) miss.push(t('q_harm_types'));
    if (!v.severity) miss.push(t('q_severity'));
    if (miss.length) return t('required_fields') + ' ' + miss.join(', ');
    const bad = v.links.filter(l => (l.url || l.label) && !/^https?:\/\/\S+$/i.test(String(l.url).trim()));
    if (bad.length) return t('err_links');
  }
  return '';
}

function wizNext() {
  collectWizard();
  const err = wizValidate(S.wiz.step);
  S.wiz.error = err;
  if (!err) S.wiz.step++;
  render(); window.scrollTo(0, 0);
}
function wizGo(step) { collectWizard(); S.wiz.error = ''; S.wiz.step = step; render(); window.scrollTo(0, 0); }
function wizAddLink() { collectWizard(); S.wiz.v.links.push({ label: '', url: '' }); render(); }
function wizRemoveLink(i) { collectWizard(); S.wiz.v.links.splice(i, 1); render(); }
// Al corregir un campo, el aviso de error desaparece
function wizClearError() { if (S.wiz && S.wiz.error) { S.wiz.error = ''; document.getElementById('wizErr')?.remove(); } }
function wizCancel() { S.wiz = null; location.hash = '#/incidentes'; }

async function wizSubmit() {
  const w = S.wiz, v = w.v;
  for (const s of [1, 2]) { const err = wizValidate(s); if (err) { w.error = err; w.step = s; return render(); } }
  const body = {
    asset_id: v.asset_id, instance_id: v.model && v.model !== '__unknown' ? v.model : null,
    occurred_at: v.occurred_at, occurred_time: v.occurred_time || null,
    harmed_targets: v.harmed_targets, harmed_description: v.harmed_description.trim() || null,
    title: v.title.trim(), description: v.description.trim() || null, ai_behavior: v.ai_behavior, ai_link: v.ai_link,
    kind: v.kind, harm_types: v.harm_types, severity: v.severity,
    country: v.country.trim() || null, location: v.location.trim() || null,
    evidence_links: v.links.filter(l => String(l.url).trim()).map(l => ({ label: String(l.label).trim(), url: String(l.url).trim() }))
  };
  w.busy = true; w.error = ''; render();
  try {
    const out = await apiSend('POST', '/api/incidents', body);
    S.wiz = null; S.incidents = null; S.incDetail = null;
    S.incMsgNext = t('registered_msg');
    location.hash = '#/incidentes/' + out.id;
    loadNav();
  } catch (e) {
    w.busy = false; w.error = t('save_error') + ' ' + incErrorText(e.message);
    render();
  }
}

function viewIncidentWizard() {
  initWizard();
  const w = S.wiz, v = w.v;
  const steps = [t('wiz_s1'), t('wiz_s2'), t('wiz_s3')];
  const stepper = `<div class="wz-steps">${steps.map((s, i) => `<div class="wz-step ${i + 1 < w.step ? 'done' : i + 1 === w.step ? 'on' : ''}">
    <b>${t('wiz_step').replace('{n}', i + 1)}${i + 1 < w.step ? ' ✓' : ''}</b>${esc(s)}</div>`).join('')}</div>`;
  const card = (type, name, value, on, title, help) => `<label class="opt"><input type="${type}" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}>
    <span><b>${esc(title)}</b>${help ? `<small>${esc(help)}</small>` : ''}</span></label>`;
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const asset = (w.assets || []).find(a => String(a.id) === String(v.asset_id));
  const insts = v.asset_id ? w.insts[v.asset_id] : null;
  const inst = Array.isArray(insts) ? insts.find(i => String(i.id) === String(v.model)) : null;
  const modelLabel = i => `${i.model_name} · ${i.vendor || ''}${i.current_version ? ' · ' + i.current_version : ''}${i.status !== 'activa' ? ' — ' + t('st_retired_f') : ''}`;
  let body = '';

  if (w.step === 1) {
    body = `
      <div class="wz-q">${t('q_asset')}</div>
      <div class="fields form">
        <div class="field wide">${!w.assets ? `<div class="no-info">${t('loading')}</div>` : `<select class="input" id="w_asset" aria-label="${t('asset')}" onchange="wizAssetChanged()">
          ${opt('', '', v.asset_id)}${w.assets.map(a => opt(a.id, `${a.code} — ${a.name} · ${a.branch_name}`, v.asset_id)).join('')}</select>`}</div>
        <div class="field"><label for="w_date">${t('f_date')} *</label><input class="input" type="date" id="w_date" value="${esc(v.occurred_at)}" max="${today()}"></div>
        <div class="field"><label for="w_time">${t('f_time')}</label><input class="input" type="time" id="w_time" value="${esc(v.occurred_time)}"></div>
      </div>
      <div class="wz-q">${t('q_model')}</div>
      <div class="fields form"><div class="field wide">
        ${!v.asset_id ? `<div class="no-info">${t('choose_asset_first2')}</div>` : !Array.isArray(insts) ? `<div class="no-info">${t('loading')}</div>`
          : `<select class="input" id="w_model" aria-label="${t('model')}">${opt('', t('model_choose'), v.model)}
              ${insts.map(i => opt(i.id, modelLabel(i), v.model)).join('')}${opt('__unknown', t('model_unknown'), v.model)}</select>`}
        <small class="count-note">${t('version_auto_note')}</small></div></div>
      <div class="wz-q">${t('q_harmed')}</div><p class="wz-help">${t('q_harmed_help')}</p>
      <div class="opts c4">${INC_HARMED.map(k => card('checkbox', 'w_harmed', k, v.harmed_targets.includes(k), t('harmed_' + k))).join('')}</div>
      <div class="fields form"><div class="field wide"><label for="w_harmed_desc">${t('f_harmed_desc')}</label>
        <input class="input" id="w_harmed_desc" value="${esc(v.harmed_description)}" placeholder="${t('f_harmed_desc_ph')}"></div></div>
      <div class="wz-q">${t('q_event')}</div>
      <div class="fields form">
        <div class="field wide"><label for="w_title">${t('f_title')} *</label><input class="input" id="w_title" value="${esc(v.title)}"></div>
        <div class="field wide"><label for="w_desc">${t('f_description')}</label><textarea class="input" id="w_desc" rows="3">${esc(v.description)}</textarea></div>
      </div>
      <div class="wz-q">${t('q_behavior')}</div>
      <div class="opts">${INC_BEHAVIORS.map(k => card('radio', 'w_behavior', k, v.ai_behavior === k, t('behavior_' + k), th('behaviorh_' + k))).join('')}</div>
      <div class="wz-q">${t('q_link')}</div>
      <div class="opts">${INC_LINKS.map(k => card('radio', 'w_link', k, v.ai_link === k, t('link_' + k), th('linkh_' + k))).join('')}</div>`;
  }

  if (w.step === 2) {
    body = `
      <div class="wz-q">${t('q_kind')}</div>
      <div class="opts">${INC_KINDS.map(k => card('radio', 'w_kind', k, v.kind === k, t('kind_' + k), th('kindh_' + k))).join('')}</div>
      <div class="wz-q">${t('q_harm_types')}</div><p class="wz-help">${t('q_harm_types_help')}</p>
      <div class="opts c4">${INC_HARM_TYPES.map(k => card('checkbox', 'w_harm', k, v.harm_types.includes(k), t('harm_' + k), th('harmh_' + k))).join('')}</div>
      <div class="wz-q">${t('q_severity')} <small class="count-note">(OECD)</small></div>
      <div class="opts">${INC_SEVERITIES.map(k => card('radio', 'w_sev', k, v.severity === k, t('sev_' + k), th('sevh_' + k))).join('')}</div>
      <div class="wz-q">${t('q_where_evidence')}</div>
      <div class="fields form">
        <div class="field"><label for="w_country">${t('f_inc_country')} <span class="src">${t('src_company')}</span></label><input class="input" id="w_country" value="${esc(v.country)}"></div>
        <div class="field"><label for="w_location">${t('f_inc_location')} <span class="src">${t('src_asset')}</span></label><input class="input" id="w_location" value="${esc(v.location)}"></div>
      </div>
      <div class="wz-q small">${t('evidence')}</div><p class="wz-help">${t('evidence_help')}</p>
      ${v.links.map((l, i) => `<div class="link-row">
        <input class="input" id="w_link_label_${i}" value="${esc(l.label)}" placeholder="${t('link_label')}" aria-label="${t('link_label')}">
        <input class="input" id="w_link_url_${i}" value="${esc(l.url)}" placeholder="${t('link_url')}" aria-label="${t('link_url')}">
        <button class="btn btn-ghost btn-sm" onclick="wizRemoveLink(${i})" aria-label="${t('remove')}">✕</button></div>`).join('')}
      <button class="btn btn-sm" onclick="wizAddLink()">${t('add_link')}</button>`;
  }

  if (w.step === 3) {
    const row = (label, html, step) => `<div class="sum"><dt>${label}</dt><dd>${html}</dd>
      <button class="btn btn-ghost btn-sm" onclick="wizGo(${step})">${t('edit')}</button></div>`;
    const links = v.links.filter(l => String(l.url).trim());
    body = `<dl class="sum-list">
      ${row(t('sum_ai'), `${esc(asset ? asset.code + ' — ' + asset.name : '')} · ${inst ? esc(inst.model_name) : `<span class="chip c-a">${t('model_undetermined')}</span>`}
        <small class="count-note">${esc(v.occurred_at)}${v.occurred_time ? ', ' + esc(v.occurred_time) : ''} · ${t('version_auto_note')}</small>`, 1)}
      ${row(t('sum_event'), `<b>${esc(v.title)}</b>${v.description ? `<small class="count-note">${esc(v.description)}</small>` : ''}
        <div>${t('harmed_word')}: ${v.harmed_targets.map(k => esc(t('harmed_' + k))).join(', ')}${v.harmed_description ? ' (' + esc(v.harmed_description) + ')' : ''}</div>
        <div>${esc(t('behavior_' + v.ai_behavior))} · ${esc(t('link_' + v.ai_link))}</div>`, 1)}
      ${row(t('sum_harm'), `<div>${t('f_kind')}: <b>${esc(t('kind_' + v.kind))}</b> · ${t('f_severity')}: ${sevChip(v.severity)}</div>
        <div>${v.harm_types.map(k => esc(t('harm_' + k))).join(', ')}</div>
        <small class="count-note">${esc([v.country, v.location].filter(Boolean).join(' · '))}${links.length
          ? ' · ' + (links.length === 1 ? t('evidence_1') : t('evidence_n').replace('{n}', links.length)) : ''}</small>`, 2)}
      </dl>
      <div class="alert info">${t('wiz_submit_note')}</div>`;
  }

  return `<button class="back" onclick="wizCancel()">← ${t('back_to_incidents')}</button>
    <h1>${t('new_incident')}</h1><div class="crumb">${t('wiz_sub')}</div>
    ${stepper}
    <div class="card" id="wizard" oninput="wizClearError()" onchange="wizClearError()">${body}</div>
    ${w.error ? `<div class="form-error" id="wizErr" role="alert">${esc(w.error)}</div>` : ''}
    <div class="wz-foot"><button class="btn btn-ghost btn-sm" onclick="wizCancel()" ${w.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <div class="right">${w.step > 1 ? `<button class="btn btn-sm" onclick="wizGo(${w.step - 1})" ${w.busy ? 'disabled' : ''}>${t('wiz_prev')}</button>` : ''}
        ${w.step < 3 ? `<button class="btn btn-primary btn-sm" onclick="wizNext()">${t('wiz_next')}</button>`
          : `<button class="btn btn-primary btn-sm" onclick="wizSubmit()" ${w.busy ? 'disabled' : ''}>${w.busy ? t('saving') : t('register_incident')}</button>`}</div></div>`;
}
