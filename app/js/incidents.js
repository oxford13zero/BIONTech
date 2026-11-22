// ============================================================
// BION · Plataforma — Incidentes (lista, registrar, ficha, editar)
// Rutas: #/incidentes · #/incidentes/nuevo?asset=&instance= · #/incidentes/<id> · #/incidentes/<id>/editar
// API: /api/incidents (ver api/incidents.js)
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

const INC_KINDS = ['incidente', 'cuasi_incidente'];
const INC_SEVERITIES = ['leve', 'moderado', 'grave', 'critico'];
const INC_STATUSES = ['abierto', 'en_investigacion', 'cerrado'];
const SEV_CLS = { leve: 'l-low', moderado: 'l-med', grave: 'l-high', critico: 'l-crit' };
const sevChip = s => `<span class="chip ${SEV_CLS[s] || 'c-n'}">${t('sev_' + s)}</span>`;

function incidentRoute() {
  const m = S.route.match(/^incidentes(?:\/([\w-]+))?(?:\/(editar))?$/);
  if (!m) return null;
  if (!m[1]) return { view: 'list' };
  if (m[1] === 'nuevo') return { view: 'new' };
  return { view: m[2] ? 'edit' : 'detail', id: m[1] };
}

function viewIncidents() {
  const r = incidentRoute();
  if (r.view === 'list') return viewIncidentList();
  if (r.view === 'detail') return viewIncidentDetail(r.id);
  if (!can('incident.write')) return `<div class="card empty">${t('err_not_allowed')}</div>`;
  return viewIncidentForm(r.view === 'edit' ? r.id : null);
}

function incErrorText(msg) {
  const map = {
    'The model was not installed on that date': 'err_not_installed',
    'EU AI Act serious incident requires regulator authority and notification deadline': 'err_eu_fields',
    'The instance does not belong to this asset': 'err_instance_asset',
    'Date cannot be in the future': 'err_future_date'
  };
  return map[msg] ? t(map[msg]) : apiErrorText(msg);
}

// ── Lista ─────────────────────────────────────────────────────
function incFilters() {
  const p = parseHash().params;
  return { kind: p.kind || '', severity: p.severity || '', status: p.status || '', from: p.from || '', to: p.to || '',
           eu_serious: p.eu_serious || '', undetermined: p.undetermined || '' };
}

function setIncFilter(key, value) {
  const f = incFilters();
  f[key] = value;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  history.replaceState(null, '', '#/incidentes' + (qs ? '?' + qs : ''));
  render();
}

async function loadIncidents(key, f) {
  S.incidents = { key, loading: true };
  const qs = new URLSearchParams({ ...(divisionParam() ? { division: divisionParam() } : {}),
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  try { S.incidents = { key, list: await apiGet('/api/incidents?' + qs) }; }
  catch (e) { if (!S.user) return; S.incidents = { key, error: true }; }
  if (incidentRoute()?.view === 'list') render();
}

function viewIncidentList() {
  const f = incFilters();
  const key = JSON.stringify([S.division, f]);
  if (!S.incidents || S.incidents.key !== key) loadIncidents(key, f);
  const x = S.incidents;
  const showDiv = S.division === 'all';
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  let body;
  if (x.loading || !x.list && !x.error) body = `<div class="empty small">${t('loading')}</div>`;
  else if (x.error) body = `<div class="empty small">${t('data_error')}</div>`;
  else {
    const rows = x.list.map(i => `
      <tr class="row" onclick="location.hash='#/incidentes/${esc(i.id)}'">
        <td>${esc(i.occurred_at)}</td>
        <td><b>${esc(i.title)}</b>${i.eu_serious_incident ? ` <span class="chip c-r">${t('eu_serious_short')}</span>` : ''}</td>
        <td><a href="#/activos/${esc(i.asset_id)}" onclick="event.stopPropagation()"><b>${esc(i.asset_code)}</b></a>${showDiv ? `<small>${esc(i.branch_name)}</small>` : ''}</td>
        <td>${i.model_name ? `${esc(i.model_name)}${i.version ? `<small>${verLabel(i.version)}</small>` : ''}` : `<span class="chip c-a">${t('model_undetermined')}</span>`}</td>
        <td>${t('kind_' + i.kind)}</td>
        <td>${sevChip(i.severity)}</td>
        <td>${t('ist_' + i.status)}</td>
      </tr>`).join('');
    body = `<div class="tbl-wrap"><table>
      <thead><tr><th>${t('f_date')}</th><th>${t('f_title')}</th><th>${t('asset')}</th><th>${t('model')}</th><th>${t('f_kind')}</th>
        <th>${t('f_severity')}</th><th>${t('status')}</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty small">${t('incidents_none')}</td></tr>`}</tbody>
    </table></div><p class="count-note">${t('n_incidents').replace('{n}', x.list.length)}</p>`;
  }
  return `
    ${can('incident.write') ? `<div class="page-actions"><a class="btn btn-primary" href="#/incidentes/nuevo">+ ${t('new_incident')}</a></div>` : ''}
    <div class="toolbar">
      <select class="input" onchange="setIncFilter('kind', this.value)">${opt('', t('all_kinds'), f.kind)}${INC_KINDS.map(k => opt(k, t('kind_' + k), f.kind)).join('')}</select>
      <select class="input" onchange="setIncFilter('severity', this.value)">${opt('', t('all_severities'), f.severity)}${INC_SEVERITIES.map(k => opt(k, t('sev_' + k), f.severity)).join('')}</select>
      <select class="input" onchange="setIncFilter('status', this.value)">${opt('', t('all_statuses'), f.status)}${INC_STATUSES.map(k => opt(k, t('ist_' + k), f.status)).join('')}</select>
      <label class="date-filter">${t('from')} <input class="input" type="date" value="${esc(f.from)}" onchange="setIncFilter('from', this.value)"></label>
      <label class="date-filter">${t('to')} <input class="input" type="date" value="${esc(f.to)}" onchange="setIncFilter('to', this.value)"></label>
    </div>
    <div class="shortcuts">
      <button class="sc ${f.eu_serious ? 'on' : ''}" onclick="setIncFilter('eu_serious', '${f.eu_serious ? '' : 'true'}')">${t('only_eu_serious')}</button>
      <button class="sc ${f.undetermined ? 'on' : ''}" onclick="setIncFilter('undetermined', '${f.undetermined ? '' : 'true'}')">${t('only_undetermined')}</button>
    </div>
    <div class="card">${body}</div>`;
}

// ── Ficha ─────────────────────────────────────────────────────
async function loadIncident(id) {
  S.incDetail = { id, loading: true };
  try { S.incDetail = { id, data: await apiGet('/api/incidents?id=' + encodeURIComponent(id)) }; }
  catch (e) { if (!S.user) return; S.incDetail = { id, error: /404|403/.test(e.message) ? 'incident_not_found' : 'data_error' }; }
  const r = incidentRoute();
  if (r && r.id === id) render();
}

function viewIncidentDetail(id) {
  const back = `<button class="back" onclick="location.hash='#/incidentes'">← ${t('back_to_incidents')}</button>`;
  if (!S.incDetail || S.incDetail.id !== id) { loadIncident(id); return back + `<div class="card empty">${t('loading')}</div>`; }
  const d = S.incDetail;
  if (d.loading) return back + `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return back + `<div class="card empty">${t(d.error)}</div>`;
  const x = d.data;
  const f = (label, v) => `<div class="field"><label>${label}</label><div class="${v ? '' : 'no-info'}">${v ? esc(v) : t('no_info')}</div></div>`;
  return `${back}
    <div class="head-row"><h1>${esc(x.title)}</h1>${sevChip(x.severity)}
      ${x.eu_serious_incident ? `<span class="chip c-r">${t('eu_serious_short')}</span>` : ''}
      <span class="chip c-n">${t('ist_' + x.status)}</span></div>
    <div class="crumb">${esc(x.occurred_at)} · ${t('kind_' + x.kind)} · <a href="#/activos/${esc(x.asset_id)}">${esc(x.asset_code)} — ${esc(x.asset_name)}</a> · ${esc(x.branch_name)}</div>
    ${S.incMsg ? `<div class="alert info">${esc(S.incMsg)}</div>` : ''}
    ${can('incident.write') ? `<div class="edit-bar left"><a class="btn btn-sm" href="#/incidentes/${esc(x.id)}/editar">${t('edit')}</a></div>` : ''}
    <div class="card"><h3>${t('model_involved')}</h3>
      ${x.instance_id ? `<div class="fields">
          <div class="field"><label>${t('model')}</label><div><a href="#/instancias/${esc(x.instance_id)}"><b>${esc(x.model_name)}</b></a> <small class="count-note">${esc(x.instance_code)}</small></div></div>
          <div class="field"><label>${t('version_on_date')}</label><div>${x.version ? `<b>${esc(x.version)}</b> <small class="count-note">${t('auto_version')}</small>` : `<span class="no-info">${t('no_version')}</span>`}</div></div>
        </div>`
        : `<div class="empty small"><span class="chip c-a">${t('model_undetermined')}</span><p>${t('undetermined_help')}</p></div>`}
    </div>
    <div class="card mt"><h3>${t('incident_details')}</h3><div class="fields">
      <div class="field wide"><label>${t('f_description')}</label><div class="${x.description ? '' : 'no-info'}">${x.description ? esc(x.description) : t('no_info')}</div></div>
      ${f(t('f_incident_type'), x.incident_type)}${f(t('f_root_tech'), x.root_cause_technical)}${f(t('f_root_org'), x.root_cause_organizational)}
      ${f(t('f_lessons'), x.lessons_learned)}
    </div></div>
    <div class="card mt"><h3>${t('regulator_notification')}</h3><div class="fields">
      <div class="field"><label>${t('eu_serious_q')}</label><div>${x.eu_serious_incident ? t('yes') : t('no')}</div></div>
      <div class="field"><label>${t('f_requires_notification')}</label><div>${x.requires_regulator_notification ? t('yes') : t('no')}</div></div>
      ${f(t('f_authority'), x.regulator_authority)}${f(t('f_deadline'), x.notification_deadline)}
    </div></div>`;
}

// ── Registrar / editar ────────────────────────────────────────
// S.incForm = { id, values, assets, instances: {assetId: [...]}, error, busy }
const INC_FORM_FIELDS = ['asset_id', 'instance_id', 'occurred_at', 'title', 'description', 'incident_type', 'kind', 'severity',
  'status', 'eu_serious_incident', 'requires_regulator_notification', 'regulator_authority', 'notification_deadline',
  'root_cause_technical', 'root_cause_organizational', 'lessons_learned'];

function initIncForm(id) {
  if (S.incForm && S.incForm.id === id) return;
  const p = parseHash().params;
  S.incForm = { id, values: { kind: 'incidente', status: 'abierto', asset_id: p.asset || '', instance_id: p.instance || '' }, instances: {} };
  if (id) {
    const x = S.incDetail?.id === id && S.incDetail.data;
    if (!x) { loadIncident(id); S.incForm.waiting = true; return; }
    INC_FORM_FIELDS.forEach(k => { S.incForm.values[k] = x[k] ?? ''; });
  }
  loadIncFormAssets();
  if (S.incForm.values.asset_id) loadIncFormInstances(S.incForm.values.asset_id);
}

async function loadIncFormAssets() {
  const q = divisionParam() ? '?division=' + encodeURIComponent(divisionParam()) : '';
  try { S.incForm.assets = await apiGet('/api/assets' + q); } catch (e) { if (S.incForm) S.incForm.assets = []; }
  if (S.incForm) render();
}

async function loadIncFormInstances(assetId) {
  if (!assetId || S.incForm.instances[assetId]) return;
  S.incForm.instances[assetId] = 'loading';
  try {
    const d = await apiGet('/api/assets?id=' + encodeURIComponent(assetId));
    if (S.incForm) S.incForm.instances[assetId] = d.instances;
  } catch (e) { if (S.incForm) S.incForm.instances[assetId] = []; }
  if (S.incForm) render();
}

function collectIncForm() {
  const f = S.incForm;
  if (!f || !document.getElementById('if_title')) return;
  INC_FORM_FIELDS.forEach(k => {
    const el = document.getElementById('if_' + k);
    if (!el) return;
    f.values[k] = el.type === 'checkbox' ? el.checked : el.value;
  });
}

function incFormChanged(field) {
  collectIncForm();
  if (field === 'asset_id') { S.incForm.values.instance_id = ''; loadIncFormInstances(S.incForm.values.asset_id); }
  render();
}

function viewIncidentForm(id) {
  initIncForm(id);
  const f = S.incForm;
  const back = `<button class="back" onclick="history.back()">← ${t('back')}</button>`;
  if (f.waiting) {
    if (S.incDetail?.data) { S.incForm = null; return viewIncidentForm(id); }
    if (S.incDetail?.error) return back + `<div class="card empty">${t(S.incDetail.error)}</div>`;
    return back + `<div class="card empty">${t('loading')}</div>`;
  }
  const v = f.values;
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const assets = f.assets;
  const insts = v.asset_id ? f.instances[v.asset_id] : null;
  const txt = (k, label, req, area) => `<div class="field ${area ? 'wide' : ''}"><label for="if_${k}">${t(label)}${req ? ' *' : ''}</label>
    ${area ? `<textarea class="input" id="if_${k}" rows="3">${esc(v[k] || '')}</textarea>` : `<input class="input" id="if_${k}" value="${esc(v[k] || '')}">`}</div>`;

  return `${back}
    <h1>${id ? t('edit_incident') : t('new_incident')}</h1>
    <div class="crumb">${t('new_incident_help')}</div>
    ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}
    <div class="card"><h3>${t('where_what')}</h3><div class="fields form">
      <div class="field"><label for="if_asset_id">${t('asset')} *</label>
        ${!assets ? `<div class="no-info">${t('loading')}</div>` : `<select class="input" id="if_asset_id" onchange="incFormChanged('asset_id')">
          ${opt('', '', v.asset_id)}${assets.map(a => opt(a.id, `${a.code} — ${a.name}`, v.asset_id)).join('')}
          ${v.asset_id && !assets.some(a => String(a.id) === String(v.asset_id)) ? opt(v.asset_id, t('asset') + ' (' + t('st_retired_m') + ')', v.asset_id) : ''}</select>`}</div>
      <div class="field"><label for="if_instance_id">${t('model_involved')}</label>
        ${!v.asset_id ? `<div class="no-info">${t('choose_asset_first')}</div>` : insts === 'loading' || !insts ? `<div class="no-info">${t('loading')}</div>`
          : `<select class="input" id="if_instance_id">${opt('', t('unknown_yet'), v.instance_id)}
            ${insts.map(i => opt(i.id, `${i.model_name} (${i.code})${i.status !== 'activa' ? ' — ' + t('st_retired_f') : ''}`, v.instance_id)).join('')}</select>`}
        <small class="count-note">${t('auto_version_help')}</small></div>
      <div class="field"><label for="if_occurred_at">${t('f_date')} *</label><input class="input" type="date" id="if_occurred_at" value="${esc(v.occurred_at || '')}" max="${today()}"></div>
      ${txt('title', 'f_title', true)}
      <div class="field"><label for="if_kind">${t('f_kind')}</label><select class="input" id="if_kind">${INC_KINDS.map(k => opt(k, t('kind_' + k), v.kind)).join('')}</select></div>
      <div class="field"><label for="if_severity">${t('f_severity')} *</label><select class="input" id="if_severity">${opt('', '', v.severity)}${INC_SEVERITIES.map(k => opt(k, t('sev_' + k), v.severity)).join('')}</select></div>
      <div class="field"><label for="if_status">${t('status')}</label><select class="input" id="if_status">${INC_STATUSES.map(k => opt(k, t('ist_' + k), v.status)).join('')}</select></div>
      ${txt('incident_type', 'f_incident_type')}
      ${txt('description', 'f_description', false, true)}
    </div></div>
    <div class="card mt"><h3>${t('regulator_notification')}</h3>
      <label class="radio"><input type="checkbox" id="if_eu_serious_incident" ${v.eu_serious_incident === true || v.eu_serious_incident === 'true' ? 'checked' : ''}
        onchange="incFormChanged('eu')"> ${t('eu_serious_q')}</label>
      <p class="count-note">${t('eu_serious_help')}</p>
      ${v.eu_serious_incident === true ? `<div class="fields form">
        ${txt('regulator_authority', 'f_authority', true)}
        <div class="field"><label for="if_notification_deadline">${t('f_deadline')} *</label><input class="input" type="date" id="if_notification_deadline" value="${esc(v.notification_deadline || '')}"></div>
      </div>` : `<label class="radio"><input type="checkbox" id="if_requires_regulator_notification" ${v.requires_regulator_notification === true ? 'checked' : ''}
        onchange="incFormChanged('notif')"> ${t('f_requires_notification')}</label>
        ${v.requires_regulator_notification === true ? `<div class="fields form">${txt('regulator_authority', 'f_authority')}
          <div class="field"><label for="if_notification_deadline">${t('f_deadline')}</label><input class="input" type="date" id="if_notification_deadline" value="${esc(v.notification_deadline || '')}"></div></div>` : ''}`}
    </div>
    <div class="card mt"><h3>${t('analysis')}</h3><div class="fields form">
      ${txt('root_cause_technical', 'f_root_tech', false, true)}${txt('root_cause_organizational', 'f_root_org', false, true)}${txt('lessons_learned', 'f_lessons', false, true)}
    </div></div>
    <div class="edit-bar">
      <button class="btn btn-ghost" onclick="history.back()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <button class="btn btn-primary" onclick="saveIncident()" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : (id ? t('save') : t('register_incident'))}</button>
    </div>`;
}

async function saveIncident() {
  collectIncForm();
  const f = S.incForm, v = f.values;
  const missing = [['asset_id', 'asset'], ['occurred_at', 'f_date'], ['title', 'f_title'], ['severity', 'f_severity']]
    .filter(([k]) => !String(v[k] || '').trim()).map(([, key]) => t(key));
  if (missing.length) { f.error = t('required_fields') + ' ' + missing.join(', '); return render(); }
  if (v.occurred_at > today()) { f.error = t('err_future_date'); return render(); }
  if (v.eu_serious_incident === true && (!String(v.regulator_authority || '').trim() || !v.notification_deadline)) { f.error = t('err_eu_fields'); return render(); }

  const body = {};
  INC_FORM_FIELDS.forEach(k => {
    let val = v[k];
    if (typeof val === 'string') val = val.trim();
    if (k === 'eu_serious_incident' || k === 'requires_regulator_notification') val = val === true;
    else if (val === '' || val === undefined) val = null;
    body[k] = val;
  });
  if (!body.eu_serious_incident && !body.requires_regulator_notification) { body.regulator_authority = null; body.notification_deadline = null; }

  f.busy = true; f.error = ''; render();
  try {
    let id = f.id;
    if (id) await apiSend('PUT', '/api/incidents?id=' + encodeURIComponent(id), body);
    else id = (await apiSend('POST', '/api/incidents', body)).id;
    S.incForm = null; S.incidents = null; S.incDetail = null;
    S.incMsgNext = body.instance_id ? t('saved_version_auto') : t('saved_undetermined');
    location.hash = '#/incidentes/' + id;
    loadNav();
  } catch (e) {
    f.busy = false; f.error = t('save_error') + ' ' + incErrorText(e.message);
    render();
  }
}
