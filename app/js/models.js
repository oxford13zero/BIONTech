// ============================================================
// BION · Plataforma — Modelos de IA (catálogo, ficha, nuevo)
// Rutas: #/modelos · #/modelos/nuevo · #/modelos/<id>
// API: /api/models (ver api/models.js)
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

// Campos del modelo (ficha del proveedor), agrupados como la ficha actual.
// Las etiquetas se toman de sections.js; las que no existen allí van en MODEL_EXTRA_LABELS.
const MODEL_GROUPS = [
  { id: 'B', title: { es: 'B — Descripción funcional', en: 'B — Functional description' }, color: '#5DCAA5',
    fields: ['main_function', 'output_type', 'output_format'] },
  { id: 'C', title: { es: 'C — Clasificación regulatoria', en: 'C — Regulatory classification' }, color: '#EF9F27',
    fields: ['gpai_flag'] },
  { id: 'D', title: { es: 'D — Datos e ingeniería', en: 'D — Data & engineering' }, color: '#D4537E',
    fields: ['model_type', 'training_data_sources', 'training_data_volume', 'last_retrain_date', 'retrain_frequency',
             'data_quality_control', 'vendor_provides_tech_access', 'data_stored_on_provider', 'data_processing_region',
             'data_processing_agreement', 'data_transfer_location'] },
  { id: 'E', title: { es: 'E — Desempeño y sesgo', en: 'E — Performance & bias' }, color: '#97C459',
    fields: ['performance_metrics', 'baseline_comparison', 'bias_evaluated', 'bias_type', 'bias_result', 'independent_validation'] },
  { id: 'G', title: { es: 'G — Documentación del proveedor', en: 'G — Vendor documentation' }, color: '#F4C38B',
    fields: ['technical_docs_exist', 'ce_marking_declared', 'annex_iv_complete', 'next_contract_renewal'] }
];
const MODEL_EXTRA_LABELS = {
  ce_marking_declared: ['Marcado CE declarado', 'CE marking declared'],
  annex_iv_complete:   ['Anexo IV (EU AI Act) completo', 'Annex IV (EU AI Act) complete']
};
const MODEL_DATE_FIELDS = ['last_retrain_date', 'next_contract_renewal', 'vendor_questionnaire_sent_at'];
const MODEL_BOOL_FIELDS = ['ce_marking_declared', 'annex_iv_complete', 'black_box', 'vendor_questionnaire_received'];

function fieldLabel(col) {
  if (MODEL_EXTRA_LABELS[col]) return MODEL_EXTRA_LABELS[col][LANG === 'es' ? 0 : 1];
  for (const sec of SECTIONS) {
    const f = sec.fields.find(x => x[0] === col);
    if (f) return LANG === 'es' ? f[1] : f[2];
  }
  return col;
}

// Valor o estado de un campo (✅ informado · ⏳ pendiente · 🚫 no entregado)
function stateValueHtml(value, state, isBool) {
  if (state === 'no_entregado') return `<span class="st st-no">🚫 ${t('st_not_provided')}</span>`;
  if (state === 'pendiente') return `<span class="st st-pend">⏳ ${t('st_pending')}</span>`;
  if (isBool) return value ? t('yes') : t('no');
  if (value === null || value === undefined || value === '') return `<span class="no-info">${t('no_info')}</span>`;
  return esc(String(value));
}

function modelRoute() {
  const m = S.route.match(/^modelos(?:\/([\w-]+))?$/);
  if (!m) return null;
  if (!m[1]) return { view: 'list' };
  return m[1] === 'nuevo' ? { view: 'new' } : { view: 'detail', id: m[1] };
}

function viewModels() {
  const r = modelRoute();
  if (r.view === 'list') return viewModelList();
  if (r.view === 'new') return can('model.write') ? viewModelNew() : `<div class="card empty">${t('err_not_allowed')}</div>`;
  return viewModelDetail(r.id);
}

// ── Catálogo ──────────────────────────────────────────────────
function modelFilters() {
  const p = parseHash().params;
  return { q: p.q || '', vendor: p.vendor || '', status: p.status || 'activo' };
}

function setModelFilter(key, value) {
  const f = modelFilters();
  f[key] = value;
  if (f.status === 'activo') delete f.status;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  history.replaceState(null, '', '#/modelos' + (qs ? '?' + qs : ''));
  if (key === 'q') { clearTimeout(S._modelSearch); S._modelSearch = setTimeout(() => render(), 300); }
  else render();
}

async function loadModels(key, f) {
  S.models = { key, loading: true };
  const qs = new URLSearchParams({ ...(divisionParam() ? { division: divisionParam() } : {}),
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  try { S.models = { key, list: await apiGet('/api/models?' + qs) }; }
  catch (e) { if (!S.user) return; S.models = { key, error: true }; }
  if (modelRoute()?.view === 'list') render();
}

function viewModelList() {
  const f = modelFilters();
  const key = JSON.stringify([S.division, f]);
  if (!S.models || S.models.key !== key) loadModels(key, f);
  const m = S.models;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  let body;
  if (m.loading || !m.list && !m.error) body = `<div class="empty small">${t('loading')}</div>`;
  else if (m.error) body = `<div class="empty small">${t('data_error')}</div>`;
  else {
    const rows = m.list.map(x => `
      <tr class="row" onclick="location.hash='#/modelos/${esc(x.id)}'">
        <td><b>${esc(x.name)}</b><small>${esc(x.code)}</small></td>
        <td>${esc(x.vendor)}</td>
        <td>${riskChip(x.base_risk_level)}</td>
        <td>${x.instances_count}</td>
        <td>${x.versions_in_use.length ? x.versions_in_use.map(v => `<span class="chip c-n">${esc(v)}</span>`).join(' ') : '—'}</td>
        <td>${x.incidents_count}</td>
        <td>${[x.black_box ? `<span class="chip c-r">${t('black_box')}</span>` : '',
               x.fields_flagged ? `<span class="chip c-a">${t('n_fields_flagged').replace('{n}', x.fields_flagged)}</span>` : '',
               x.reclassification_pending ? `<span class="chip c-a">${t('n_reclass').replace('{n}', x.reclassification_pending)}</span>` : ''].join(' ')}</td>
      </tr>`).join('');
    body = `<div class="tbl-wrap"><table>
      <thead><tr><th>${t('model')}</th><th>${t('vendor')}</th><th>${t('base_risk')}</th><th>${t('installations')}</th>
        <th>${t('versions_in_use')}</th><th>${t('nav_incidents')}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="empty small">${t('models_none')}</td></tr>`}</tbody>
    </table></div>
    <p class="count-note">${t('n_models').replace('{n}', m.list.length)}${S.division !== 'all' ? ' · ' + t('models_in_division') : ''}</p>`;
  }
  return `
    ${can('model.write') ? `<div class="page-actions"><a class="btn btn-primary" href="#/modelos/nuevo">+ ${t('new_model')}</a></div>` : ''}
    <div class="toolbar">
      <input class="input search" id="modelSearch" type="text" placeholder="${t('model_search')}" value="${esc(f.q)}"
        oninput="setModelFilter('q', this.value)">
      <input class="input" type="text" placeholder="${t('vendor')}" value="${esc(f.vendor)}" onchange="setModelFilter('vendor', this.value.trim())">
      <select class="input" onchange="setModelFilter('status', this.value)">
        ${opt('activo', t('st_models_active'), f.status)}${opt('retirado', t('st_models_retired'), f.status)}</select>
    </div>
    <div class="card">${body}</div>`;
}

// ── Ficha del modelo ──────────────────────────────────────────
async function loadModelDetail(id) {
  S.modelDetail = { id, loading: true, division: S.division };
  const q = divisionParam() ? '&division=' + encodeURIComponent(divisionParam()) : '';
  try { S.modelDetail = { id, division: S.division, data: await apiGet('/api/models?id=' + encodeURIComponent(id) + q) }; }
  catch (e) { if (!S.user) return; S.modelDetail = { id, division: S.division, error: /404|403/.test(e.message) ? 'model_not_found' : 'data_error' }; }
  if (modelRoute()?.id === id) render();
}

function viewModelDetail(id) {
  const back = `<button class="back" onclick="location.hash='#/modelos'">← ${t('back_to_models')}</button>`;
  const d = S.modelDetail;
  if (!d || d.id !== id || d.division !== S.division) { loadModelDetail(id); return back + `<div class="card empty">${t('loading')}</div>`; }
  if (d.loading) return back + `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return back + `<div class="card empty">${t(d.error)}</div>`;
  const { model: saved, versions, instances, incidents_by_version, changes = [] } = d.data;
  const editing = S.modelEdit && S.modelEdit.id === saved.id;
  // Mientras se edita, mostrar lo ya escrito (por ejemplo, al cancelar la ventana de guardar)
  const pend = editing && S.modelEdit.pending;
  const m = pend ? { ...saved, ...pend.values } : saved;
  const fs = pend ? { ...(saved.field_status || {}), ...pend.states } : (saved.field_status || {});
  const retired = m.status === 'retirado';
  const canEdit = can('model.write') && !retired;

  const groups = MODEL_GROUPS.map(g => `
    <div class="sec open" style="--c:${g.color}">
      <div class="sec-head static"><span class="dot"></span><span class="sec-name">${esc(g.title[LANG])}</span></div>
      <div class="sec-body"><div class="fields">${g.fields.map(col => editing ? modelFieldInput(col, m[col], fs[col]) : `
        <div class="field"><label>${esc(fieldLabel(col))}</label>
          <div>${stateValueHtml(MODEL_DATE_FIELDS.includes(col) && m[col] ? String(m[col]).slice(0, 10) : m[col], fs[col], MODEL_BOOL_FIELDS.includes(col))}</div></div>`).join('')}
      </div></div>
    </div>`).join('');

  const canVersion = can('version.apply') && !retired && !editing;
  const verRows = versions.map(v => `
    <tr><td><b>${esc(v.version)}</b></td><td>${esc(v.released_at)}</td>
      <td>${v.changes_unknown ? `<span class="chip c-a">${t('changes_unknown')}</span> ` : ''}${esc(v.change_notes || '')}</td>
      <td>${v.instances_count}</td>
      ${canVersion ? `<td class="actions">${!S.verForm ? `<button class="btn btn-sm" onclick="openVersionForm('apply','${esc(v.id)}','${esc(v.version)}')">${t('apply_more')}</button>` : ''}</td>` : ''}</tr>`).join('');
  const instRows = instances.map(i => `
    <tr class="row" onclick="location.hash='#/instancias/${esc(i.id)}'">
      <td>${i.asset_id ? `<a href="#/activos/${esc(i.asset_id)}" onclick="event.stopPropagation()"><b>${esc(i.asset_code)}</b></a><small>${esc(i.asset_name || '')}</small>`
                        : `<span class="chip c-a">${t('asset_unassigned')}</span>`}<small>${esc(i.code)}</small></td>
      <td>${esc(i.branch_name)}</td><td>${esc(i.manufacturer || '—')}</td>
      <td>${esc(i.current_version || '—')}</td><td>${t('group_' + i.inventory_group)}</td><td>${riskChip(i.risk_level)}</td>
      <td>${i.reclassification_pending ? `<span class="chip c-a">${t('reclass_pending')}</span>` : ''}
          ${i.status !== 'activa' ? `<span class="chip c-n">${t('st_retired_f')}</span>` : ''}</td>
    </tr>`).join('');
  const incRows = incidents_by_version.map(x => `<tr><td>${esc(x.version || t('no_version'))}</td><td>${x.incidents}</td></tr>`).join('');

  const transparency = editing ? `
      <div class="fields form">
        <label class="radio"><input type="checkbox" id="me_black_box" ${m.black_box ? 'checked' : ''}> ${t('black_box_q')}</label>
        <div class="field"><label for="me_vendor_questionnaire_sent_at">${t('questionnaire_sent')}</label>
          <input class="input" type="date" id="me_vendor_questionnaire_sent_at" value="${esc(m.vendor_questionnaire_sent_at || '')}"></div>
        <label class="radio"><input type="checkbox" id="me_vendor_questionnaire_received" ${m.vendor_questionnaire_received ? 'checked' : ''}> ${t('questionnaire_received')}</label>
      </div>`
    : `<div class="fields">
        <div class="field"><label>${t('black_box')}</label><div>${m.black_box ? `<span class="chip c-r">${t('yes')}</span> ${t('black_box_help')}` : t('no')}</div></div>
        <div class="field"><label>${t('questionnaire_sent')}</label><div>${m.vendor_questionnaire_sent_at ? esc(m.vendor_questionnaire_sent_at) : `<span class="no-info">${t('no_info')}</span>`}</div></div>
        <div class="field"><label>${t('questionnaire_received')}</label><div>${m.vendor_questionnaire_received ? t('yes') : t('no')}</div></div>
      </div>`;

  const identity = editing ? `
    <div class="card"><h3>${t('model_identity')}</h3><div class="fields form">
      <div class="field"><label for="me_name">${t('f_model_name')} *</label><input class="input" id="me_name" value="${esc(m.name)}"></div>
      <div class="field"><label for="me_vendor">${t('vendor')} *</label><input class="input" id="me_vendor" value="${esc(m.vendor)}"></div>
      <div class="field"><label for="me_base_risk_level">${t('base_risk')}</label><select class="input" id="me_base_risk_level">
        <option value=""></option>${LEVELS.map(l => `<option value="${l}" ${m.base_risk_level === l ? 'selected' : ''}>${t('risk_' + l)}</option>`).join('')}</select></div>
      <div class="field"><label for="me_suggested_group">${t('suggested_group')}</label><select class="input" id="me_suggested_group">
        <option value=""></option>${[1, 2, 3, 4].map(g => `<option value="${g}" ${Number(m.suggested_group) === g ? 'selected' : ''}>${t('group_' + g)}</option>`).join('')}</select></div>
    </div><p class="count-note">${t('base_risk_help')}</p></div>` : '';

  return `${back}
    <div class="page-head"><div>
      <div class="head-row"><h1>${esc(m.name)}</h1>${riskChip(m.base_risk_level)}
        ${m.black_box ? `<span class="chip c-r">${t('black_box')}</span>` : ''}
        ${retired ? `<span class="chip c-n">${t('st_retired_m')}</span>` : ''}</div>
      <div class="crumb">${esc([m.code, m.vendor, m.suggested_group ? t('suggested_group') + ': ' + t('group_' + m.suggested_group) : null].filter(Boolean).join(' · '))}</div></div>
      ${canEdit ? `<div class="card-actions">${editing
        ? `<button class="btn btn-ghost btn-sm" onclick="S.modelEdit=null;S.verForm=null;render()">${t('cancel')}</button>
           <button class="btn btn-primary btn-sm" onclick="saveModel()">${t('save')}</button>`
        : `<button class="btn btn-sm" onclick="S.modelEdit={id:'${esc(m.id)}'};S.modelMsg='';S.verForm=null;render()">${t('edit_model')}</button>
           <button class="btn btn-sm" onclick="retireModel('${esc(m.id)}')">${t('retire')}</button>`}</div>` : ''}
    </div>
    ${S.modelMsg ? `<div class="alert">${esc(S.modelMsg)}</div>` : ''}
    ${editing && S.modelEdit.error ? `<div class="form-error" role="alert">${esc(S.modelEdit.error)}</div>` : ''}
    ${identity}
    <div class="card ${editing ? 'mt' : ''}"><h3>${t('vendor_transparency')}</h3>${transparency}</div>
    <h3 class="mt">${t('vendor_sheet')}</h3>
    <div class="secs">${groups}</div>
    <div class="card mt" id="versionsCard"><h3>${t('versions')}</h3>
      ${can('version.apply') && !can('version.write') && !retired ? `<p class="count-note">${t('new_version_help_division')}</p>` : ''}
      ${S.verForm && !S.verForm.embedded ? versionFormHtml(instances) : ''}
      ${verRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('version')}</th><th>${t('released')}</th><th>${t('what_changed')}</th><th>${t('installations')}</th>${canVersion ? '<th></th>' : ''}</tr></thead>
      <tbody>${verRows}</tbody></table></div>` : `<div class="empty small">${t('no_versions')}</div>`}</div>
    <div class="card mt"><h3>${t('where_installed')}</h3>
      ${instRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('asset')}</th><th>${t('division')}</th><th>${t('f_manufacturer')}</th>
        <th>${t('version')}</th><th>${t('group')}</th><th>${t('risk')}</th><th></th></tr></thead><tbody>${instRows}</tbody></table></div>`
        : `<div class="empty small">${t('not_installed')}</div>`}</div>
    <div class="card mt"><h3>${t('incidents_by_version')}</h3>
      ${incRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('version')}</th><th>${t('nav_incidents')}</th></tr></thead><tbody>${incRows}</tbody></table></div>`
        : `<div class="empty small">${t('no_incidents')}</div>`}</div>
    ${changeHistoryHtml(changes)}
    ${editing && S.verForm && S.verForm.embedded ? modelSaveModalHtml(instances) : ''}`;
}

// Campo editable + selector de estado (informado / pendiente / no entregado)
function modelFieldInput(col, value, state) {
  const id = 'mf_' + col;
  let control;
  if (MODEL_BOOL_FIELDS.includes(col)) control = `<select class="input edit-input" id="${id}"><option value="false" ${!value ? 'selected' : ''}>${t('no')}</option><option value="true" ${value ? 'selected' : ''}>${t('yes')}</option></select>`;
  else if (MODEL_DATE_FIELDS.includes(col)) control = `<input class="input edit-input" type="date" id="${id}" value="${esc(value ? String(value).slice(0, 10) : '')}">`;
  else control = `<textarea class="input edit-input" id="${id}" rows="${String(value || '').length > 80 ? 3 : 1}">${esc(value ?? '')}</textarea>`;
  const st = state || '';
  return `<div class="field"><label for="${id}">${esc(fieldLabel(col))}</label>${control}
    <select class="input sm state-sel" id="ms_${col}" aria-label="${t('field_state')}">
      <option value="" ${!st ? 'selected' : ''}>✅ ${t('st_informed')}</option>
      <option value="pendiente" ${st === 'pendiente' ? 'selected' : ''}>⏳ ${t('st_pending')}</option>
      <option value="no_entregado" ${st === 'no_entregado' ? 'selected' : ''}>🚫 ${t('st_not_provided')}</option>
    </select></div>`;
}

async function saveModel() {
  const m = S.modelDetail.data.model;
  const fs = m.field_status || {};
  const body = {}, states = {};
  const norm = v => (v === null || v === undefined || v === '') ? null : String(v);
  for (const g of MODEL_GROUPS) for (const col of g.fields) {
    const el = document.getElementById('mf_' + col);
    let v = el.value.trim();
    if (MODEL_BOOL_FIELDS.includes(col)) v = v === 'true';
    else v = v || null;
    const cur = MODEL_DATE_FIELDS.includes(col) && m[col] ? String(m[col]).slice(0, 10) : m[col];
    if (MODEL_BOOL_FIELDS.includes(col) ? v !== !!cur : norm(v) !== norm(cur)) body[col] = v;
    const st = document.getElementById('ms_' + col).value || null;
    if ((fs[col] || null) !== st) states[col] = st;
  }
  for (const col of ['name', 'vendor']) {
    const v = document.getElementById('me_' + col).value.trim();
    if (!v) { S.modelEdit.error = t('required_fields') + ' ' + (col === 'name' ? t('f_model_name') : t('vendor')); return render(); }
    if (v !== m[col]) body[col] = v;
  }
  const risk = document.getElementById('me_base_risk_level').value || null;
  if (risk !== (m.base_risk_level || null)) body.base_risk_level = risk;
  const group = document.getElementById('me_suggested_group').value;
  if (String(group || '') !== String(m.suggested_group || '')) body.suggested_group = group ? Number(group) : null;
  const bb = document.getElementById('me_black_box').checked;
  if (bb !== !!m.black_box) body.black_box = bb;
  const qs = document.getElementById('me_vendor_questionnaire_sent_at').value || null;
  if (qs !== (m.vendor_questionnaire_sent_at || null)) body.vendor_questionnaire_sent_at = qs;
  const qr = document.getElementById('me_vendor_questionnaire_received').checked;
  if (qr !== !!m.vendor_questionnaire_received) body.vendor_questionnaire_received = qr;
  if (Object.keys(states).length) body.field_status = states;

  // Antes de guardar: ventana para justificar el cambio y, si corresponde, registrar la versión nueva
  const { field_status: st, ...values } = body;
  const hasChanges = Object.keys(body).length > 0;
  S.modelEdit.pending = { body, values, states: st || {} };
  S.modelEdit.error = '';
  S.verForm = { mode: 'register', embedded: true, hasChanges, isVersion: hasChanges ? null : true, justification: '',
    values: { version: '', released_at: today(), change_notes: '', changes_unknown: false, installed_at: '' },
    applyMode: 'all', filter: { manufacturer: '', division: '', asset_type: '' }, listIds: [] };
  render();
  document.getElementById('chg_justification')?.focus();
}

// ── Ventana "Guardar cambios" de la ficha del modelo ──────────
function closeModelSave() { if (S.verForm?.busy) return; S.verForm = null; render(); }
function setIsVersion(v) { collectVersionForm(); S.verForm.isVersion = v; S.verForm.preview = null; S.verForm.error = ''; render(); }

function modelSaveModalHtml(instances) {
  const f = S.verForm, pend = S.modelEdit.pending;
  const changed = [...Object.keys(pend.values), ...Object.keys(pend.states).filter(k => !(k in pend.values))].map(changeLabel);
  const radio = (val, label) => `<label class="radio"><input type="radio" name="chg_is_version" value="${val ? 'yes' : 'no'}"
    ${f.isVersion === val ? 'checked' : ''} onchange="setIsVersion(${val})"> ${label}</label>`;
  const needsPreview = f.isVersion && f.applyMode !== 'none' && !f.preview;
  return modalHtml({
    title: t('save_changes_title'), wide: true, close: 'closeModelSave',
    subtitle: changed.length ? t('fields_changed') + ' ' + changed.join(', ') : t('no_field_changes'),
    body: `<h4>${t('is_new_version_q')}</h4>
      <div class="radios">${radio(true, t('yes_new_version'))}${f.hasChanges ? radio(false, t('no_data_fix')) : ''}</div>
      ${f.isVersion ? versionFormHtml(instances) : ''}
      <label class="field-label" for="chg_justification">${t('justification')} *</label>
      <textarea class="input" id="chg_justification" rows="3" placeholder="${t('justification_help')}">${esc(f.justification)}</textarea>
      ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}`,
    footer: `<button class="btn btn-ghost btn-sm" onclick="closeModelSave()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      ${needsPreview ? `<button class="btn btn-sm" onclick="submitModelSave(true)" ${f.busy ? 'disabled' : ''}>${t('preview')}</button>` : ''}
      <button class="btn btn-primary btn-sm" onclick="submitModelSave(false)" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : t('save')}</button>`
  });
}

async function submitModelSave(dryRun) {
  collectVersionForm();
  const f = S.verForm, v = f.values, m = S.modelDetail.data.model, pend = S.modelEdit.pending;
  f.error = '';
  if (f.isVersion === null) { f.error = t('is_new_version_required'); return render(); }
  if (f.isVersion) {
    if (!v.version) { f.error = t('required_fields') + ' ' + t('version'); return render(); }
    if (f.applyMode === 'filter' && !f.filter.manufacturer && !f.filter.division && !f.filter.asset_type) { f.error = t('filter_required'); return render(); }
    if (f.applyMode === 'list' && !f.listIds.length) { f.error = t('copy_select'); return render(); }
  }
  if (!dryRun && !f.justification.trim()) { f.error = t('justification_required'); return render(); }
  // Siempre mostrar la vista previa antes de aplicar una versión
  if (!dryRun && f.isVersion && f.applyMode !== 'none' && !f.preview) return submitModelSave(true);

  const body = { ...pend.body, justification: f.justification.trim() || '-' };
  if (f.isVersion) body.new_version = { version: v.version, released_at: v.released_at || undefined, change_notes: v.change_notes || null,
    changes_unknown: v.changes_unknown, installed_at: v.installed_at || v.released_at || undefined, apply_to: versionApplyTo() };
  if (dryRun) body.dry_run = true;
  f.busy = true; render();
  let out;
  try {
    out = await apiSend('PUT', '/api/models?id=' + encodeURIComponent(m.id), body);
  } catch (e) {
    f.busy = false;
    const msg = e.message;
    if (msg === 'Installation date is before the current version start' && e.data?.instances) {
      f.error = t('version_too_early') + ' ' + e.data.instances.map(x => `${x.asset_code || x.code} (${x.current_since})`).join(', ');
    } else if (msg === 'Version already exists for this model') f.error = t('version_exists');
    else if (msg === 'Nothing to update') f.error = t('nothing_changed');
    else if (msg === 'Database update pending (migration 003)') f.error = t('db_update_pending');
    else f.error = t('save_error') + ' ' + apiErrorText(msg);
    return render();
  }
  f.busy = false;
  if (dryRun) { f.preview = out.instances; return render(); }
  // "Guardado. N instalaciones subieron…" ya dice que se guardó
  const parts = [out.instances_risk_raised ? t('risk_raised_msg').replace('{n}', out.instances_risk_raised) : t('model_saved')];
  if (out.version) {
    const applied = out.applied.map(a => `${a.asset_code || a.code}: ${a.from || '—'} → ${a.to}`).join(' · ');
    parts.push(applied ? t('version_applied') + ' ' + applied : t('version_registered_only'));
    if (out.skipped.length) parts.push(t('version_skipped').replace('{n}', out.skipped.length));
  }
  S.modelMsg = parts.join(' ');
  S.verForm = null; S.modelEdit = null; S.modelDetail = null; S.models = null;
  loadNav();
  render();
}

// ── Historial de cambios ──────────────────────────────────────
const CHANGE_LABELS = { name: 'f_model_name', vendor: 'vendor', base_risk_level: 'base_risk', suggested_group: 'suggested_group',
  black_box: 'black_box', vendor_questionnaire_sent_at: 'questionnaire_sent', vendor_questionnaire_received: 'questionnaire_received' };
const changeLabel = col => CHANGE_LABELS[col] ? t(CHANGE_LABELS[col]) : fieldLabel(col);

function changeValue(col, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (col === 'base_risk_level') return t('risk_' + v);
  if (col === 'suggested_group') return t('group_' + v);
  if (typeof v === 'boolean') return v ? t('yes') : t('no');
  const s = String(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
const stateText = s => s === 'pendiente' ? `⏳ ${t('st_pending')}` : s === 'no_entregado' ? `🚫 ${t('st_not_provided')}` : `✅ ${t('st_informed')}`;

function changeHistoryHtml(changes) {
  const items = changes.map(c => {
    const when = new Date(c.changed_at).toLocaleString(LANG === 'es' ? 'es-CL' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const fields = Object.entries(c.changes?.fields || {}).map(([k, x]) =>
      `<li><b>${esc(changeLabel(k))}:</b> ${esc(changeValue(k, x.from))} → ${esc(changeValue(k, x.to))}</li>`);
    const states = Object.entries(c.changes?.states || {}).map(([k, x]) =>
      `<li><b>${esc(changeLabel(k))}</b> (${t('field_state').toLowerCase()}): ${stateText(x.from)} → ${stateText(x.to)}</li>`);
    return `<div class="chg-item">
      <div class="chg-head"><b>${esc(when)}</b> · ${esc(c.changed_by_email || '—')}
        ${c.version ? `<span class="chip c-g">${t('version_created')}: ${esc(c.version)}</span>` : ''}</div>
      <div class="chg-why">${esc(c.justification)}</div>
      ${fields.length || states.length ? `<ul class="chg-list">${fields.join('')}${states.join('')}</ul>` : ''}</div>`;
  }).join('');
  return `<div class="card mt" id="changeHistory"><h3>${t('change_history')}</h3>
    ${items || `<div class="empty small">${t('no_change_history')}</div>`}</div>`;
}

async function retireModel(id) {
  const m = S.modelDetail.data.model;
  if (!confirm(t('retire_model_confirm').replace('{name}', m.name))) return;
  S.modelMsg = '';
  try {
    await apiSend('DELETE', '/api/models?id=' + encodeURIComponent(id));
  } catch (e) {
    S.modelMsg = e.message === 'Model has active instances' ? t('model_has_instances') : t('save_error') + ' ' + apiErrorText(e.message);
    return render();
  }
  S.modelDetail = null; S.models = null;
  loadNav();
  render();
}

// ── Nuevo modelo ──────────────────────────────────────────────
function viewModelNew() {
  const f = S.modelNew || (S.modelNew = { values: { suggested_group: '1' } });
  const v = f.values;
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  return `<button class="back" onclick="history.back()">← ${t('back_to_models')}</button>
    <h1>${t('new_model')}</h1><div class="crumb">${t('new_model_help')}</div>
    ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}
    <div class="card"><div class="fields form">
      <div class="field"><label for="mn_name">${t('f_model_name')} *</label><input class="input" id="mn_name" value="${esc(v.name || '')}"></div>
      <div class="field"><label for="mn_vendor">${t('vendor')} *</label><input class="input" id="mn_vendor" value="${esc(v.vendor || '')}"></div>
      <div class="field"><label for="mn_risk">${t('base_risk')}</label><select class="input" id="mn_risk">
        ${opt('', '', v.base_risk_level)}${LEVELS.map(l => opt(l, t('risk_' + l), v.base_risk_level)).join('')}</select></div>
      <div class="field"><label for="mn_group">${t('suggested_group')}</label><select class="input" id="mn_group">
        ${[1, 2, 3, 4].map(g => opt(g, t('group_' + g), v.suggested_group)).join('')}</select></div>
      <div class="field"><label for="mn_version">${t('first_version')}</label><input class="input" id="mn_version" value="${esc(v.version || '')}" placeholder="${t('optional')}"></div>
      <div class="field"><label for="mn_released">${t('released')}</label><input class="input" type="date" id="mn_released" value="${esc(v.released_at || '')}"></div>
      <label class="radio wide"><input type="checkbox" id="mn_black_box" ${v.black_box ? 'checked' : ''}> ${t('black_box_q')}</label>
    </div></div>
    <div class="edit-bar">
      <button class="btn btn-ghost" onclick="history.back()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <button class="btn btn-primary" onclick="createModel()" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : t('create_model')}</button>
    </div>`;
}

async function createModel() {
  const f = S.modelNew;
  const g = id => document.getElementById(id).value.trim();
  f.values = { name: g('mn_name'), vendor: g('mn_vendor'), base_risk_level: g('mn_risk'), suggested_group: g('mn_group'),
               version: g('mn_version'), released_at: g('mn_released'), black_box: document.getElementById('mn_black_box').checked };
  const v = f.values;
  const missing = [['name', 'f_model_name'], ['vendor', 'vendor']].filter(([k]) => !v[k]).map(([, key]) => t(key));
  if (missing.length) { f.error = t('required_fields') + ' ' + missing.join(', '); return render(); }
  f.busy = true; f.error = ''; render();
  try {
    const out = await apiSend('POST', '/api/models', {
      name: v.name, vendor: v.vendor, base_risk_level: v.base_risk_level || null,
      suggested_group: v.suggested_group ? Number(v.suggested_group) : null, black_box: v.black_box,
      first_version: v.version ? { version: v.version, released_at: v.released_at || undefined } : undefined
    });
    S.modelNew = null; S.models = null;
    location.hash = '#/modelos/' + out.id;
    loadNav();
  } catch (e) {
    f.busy = false; f.error = t('save_error') + ' ' + apiErrorText(e.message);
    render();
  }
}


// ── Versiones: registrar y aplicar a más activos ──────────────
// S.verForm = { mode: 'register'|'apply', versionId, versionLabel, values, applyMode, filter, listIds, preview, result, error, busy }
function openVersionForm(mode, versionId, versionLabel) {
  S.verForm = { mode, versionId: versionId || null, versionLabel: versionLabel || '',
    values: { version: '', released_at: today(), change_notes: '', changes_unknown: false, installed_at: '' },
    applyMode: mode === 'apply' ? 'filter' : 'all', filter: { manufacturer: '', division: '', asset_type: '' }, listIds: [] };
  S.modelMsg = '';
  render();
  document.getElementById('versionsCard')?.scrollIntoView({ block: 'start' });
}

// Lee el formulario actual para no perder lo escrito al volver a dibujar
function collectVersionForm() {
  const f = S.verForm;
  if (!f) return;
  const just = document.getElementById('chg_justification');
  if (just) f.justification = just.value;
  if (!document.getElementById('vf_installed_at')) return;
  const val = id => document.getElementById(id)?.value ?? '';
  if (f.mode === 'register') {
    f.values.version = val('vf_version').trim();
    f.values.released_at = val('vf_released_at');
    f.values.change_notes = val('vf_change_notes').trim();
    f.values.changes_unknown = document.getElementById('vf_changes_unknown').checked;
  }
  f.values.installed_at = val('vf_installed_at');
  const am = document.querySelector('input[name="vf_apply"]:checked');
  if (am) f.applyMode = am.value;
  if (document.getElementById('vf_manufacturer')) {
    f.filter = { manufacturer: val('vf_manufacturer'), division: val('vf_division'), asset_type: val('vf_asset_type') };
  }
  if (document.querySelector('[data-vlist]')) f.listIds = [...document.querySelectorAll('[data-vlist]:checked')].map(el => el.dataset.vlist);
}

function setApplyMode(m) { collectVersionForm(); S.verForm.applyMode = m; S.verForm.preview = null; render(); }
function versionFormChanged() { collectVersionForm(); S.verForm.preview = null; S.verForm.result = null; render(); }

function versionFormHtml(instances) {
  const f = S.verForm, v = f.values;
  const active = instances.filter(i => i.status === 'activa');
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort();
  const manufacturers = uniq(active.map(i => i.manufacturer));
  const divisions = [...new Map(active.map(i => [String(i.branch_id), i.branch_name])).entries()];
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const modes = f.mode === 'register' ? ['all', 'filter', 'list', 'none'] : ['all', 'filter', 'list'];

  const head = f.mode === 'register'
    ? `<h3>${t('register_version')}</h3><div class="fields form">
        <div class="field"><label for="vf_version">${t('version')} *</label><input class="input" id="vf_version" value="${esc(v.version)}"></div>
        <div class="field"><label for="vf_released_at">${t('released')}</label><input class="input" type="date" id="vf_released_at" value="${esc(v.released_at)}" onchange="versionFormChanged()"></div>
        <div class="field wide"><label for="vf_change_notes">${t('what_changed')}</label><textarea class="input" id="vf_change_notes" rows="2">${esc(v.change_notes)}</textarea></div>
        <label class="radio wide"><input type="checkbox" id="vf_changes_unknown" ${v.changes_unknown ? 'checked' : ''}> ${t('changes_unknown')}</label>
      </div>`
    : `<h3>${t('apply_more')}: ${esc(f.versionLabel)}</h3>`;

  let selector = '';
  if (f.applyMode === 'filter') {
    selector = `<div class="fields form">
      <div class="field"><label for="vf_manufacturer">${t('f_manufacturer')}</label><select class="input" id="vf_manufacturer" onchange="versionFormChanged()">
        ${opt('', t('any'), f.filter.manufacturer)}${manufacturers.map(x => opt(x, x, f.filter.manufacturer)).join('')}</select></div>
      <div class="field"><label for="vf_division">${t('division')}</label><select class="input" id="vf_division" onchange="versionFormChanged()">
        ${opt('', t('any'), f.filter.division)}${divisions.map(([id, name]) => opt(id, name, f.filter.division)).join('')}</select></div>
      <div class="field"><label for="vf_asset_type">${t('f_type')}</label><select class="input" id="vf_asset_type" onchange="versionFormChanged()">
        ${opt('', t('any'), f.filter.asset_type)}${ASSET_TYPES.map(x => opt(x, t('type_' + x), f.filter.asset_type)).join('')}</select></div>
    </div>`;
  } else if (f.applyMode === 'list') {
    selector = active.length ? `<div class="pick-list">${active.map(i => `
      <label class="pick pick-main"><input type="checkbox" data-vlist="${esc(i.id)}" ${f.listIds.includes(i.id) ? 'checked' : ''} onchange="versionFormChanged()">
        <span class="pick-name"><b>${esc(i.asset_code || t('asset_unassigned'))}</b><small>${esc(i.code)} · ${esc(i.manufacturer || '—')} · ${esc(i.branch_name)}</small></span>
        <span class="chip c-n">${verLabel(i.current_version)}</span></label>`).join('')}</div>`
      : `<div class="empty small">${t('not_installed')}</div>`;
  }

  const preview = f.preview ? (f.preview.length
    ? `<div class="alert info">${t('preview_title').replace('{n}', f.preview.length)}</div>
       <div class="tbl-wrap"><table><thead><tr><th>${t('asset')}</th><th>${t('f_manufacturer')}</th><th>${t('division')}</th><th>${t('current_version')}</th></tr></thead>
       <tbody>${f.preview.map(x => `<tr><td><b>${esc(x.asset_code || t('asset_unassigned'))}</b><small>${esc(x.code)}</small></td>
         <td>${esc(x.manufacturer || '—')}</td><td>${esc(x.branch_name)}</td><td>${esc(x.current_version || '—')}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="alert">${t('preview_none')}</div>`) : '';

  const result = f.result ? `<div class="alert info">${esc(f.result)}</div>` : '';
  const needsPreview = f.applyMode !== 'none';

  // Dentro de la ventana "Guardar cambios": sin título, mensajes ni botones propios
  if (f.embedded) return `<div class="version-form embedded">
    ${head.replace(/^<h3>.*?<\/h3>/, '')}
    <div class="fields form">
      <div class="field"><label for="vf_installed_at">${t('installed_on')}</label>
        <input class="input" type="date" id="vf_installed_at" value="${esc(v.installed_at)}" max="${today()}"></div></div>
    <h4>${t('apply_to_q')}</h4>
    <div class="radios">${modes.map(m => `<label class="radio"><input type="radio" name="vf_apply" value="${m}" ${f.applyMode === m ? 'checked' : ''}
      onchange="setApplyMode('${m}')"> ${t('apply_' + m)}</label>`).join('')}</div>
    ${selector}${preview}</div>`;

  return `<div class="div-form version-form">
    ${head}
    ${f.applyMode !== 'none' || f.mode === 'register' ? `<div class="fields form">
      <div class="field"><label for="vf_installed_at">${t('installed_on')}</label>
        <input class="input" type="date" id="vf_installed_at" value="${esc(v.installed_at)}" placeholder="${t('same_as_release')}" max="${today()}"></div></div>` : ''}
    <h4>${t('apply_to_q')}</h4>
    <div class="radios">${modes.map(m => `<label class="radio"><input type="radio" name="vf_apply" value="${m}" ${f.applyMode === m ? 'checked' : ''}
      onchange="setApplyMode('${m}')"> ${t('apply_' + m)}</label>`).join('')}</div>
    ${selector}
    ${preview}${result}
    ${f.error ? `<div class="form-error">${esc(f.error)}</div>` : ''}
    <div class="edit-bar">
      <button class="btn btn-ghost btn-sm" onclick="S.verForm=null;render()" ${f.busy ? 'disabled' : ''}>${f.result ? t('close') : t('cancel')}</button>
      ${needsPreview && !f.result ? `<button class="btn btn-sm" onclick="submitVersion(true)" ${f.busy ? 'disabled' : ''}>${t('preview')}</button>` : ''}
      ${!f.result ? `<button class="btn btn-primary btn-sm" onclick="submitVersion(false)" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : (f.mode === 'register' ? t('register') : t('apply'))}</button>` : ''}
    </div>
  </div>`;
}

function versionApplyTo() {
  const f = S.verForm;
  if (f.applyMode === 'none') return { mode: 'none' };
  if (f.applyMode === 'all') return { mode: 'all' };
  if (f.applyMode === 'list') return { mode: 'list', instance_ids: f.listIds };
  const flt = Object.fromEntries(Object.entries(f.filter).filter(([, v]) => v));
  return { mode: 'filter', ...flt };
}

async function submitVersion(dryRun) {
  collectVersionForm();
  const f = S.verForm, v = f.values, m = S.modelDetail.data.model;
  f.error = ''; f.result = null;
  if (f.mode === 'register' && !v.version) { f.error = t('required_fields') + ' ' + t('version'); return render(); }
  if (f.applyMode === 'filter' && !f.filter.manufacturer && !f.filter.division && !f.filter.asset_type) { f.error = t('filter_required'); return render(); }
  if (f.applyMode === 'list' && !f.listIds.length) { f.error = t('copy_select'); return render(); }
  if (!dryRun && f.applyMode !== 'none' && !f.preview) {
    // Siempre mostrar la vista previa antes de aplicar
    return submitVersion(true);
  }
  const installed = v.installed_at || (f.mode === 'register' ? v.released_at : today());
  f.busy = true; render();
  try {
    let out;
    if (f.mode === 'register') {
      out = await apiSend('POST', '/api/versions', {
        model_id: m.id, version: v.version, released_at: v.released_at || undefined, change_notes: v.change_notes || null,
        changes_unknown: v.changes_unknown, installed_at: installed, apply_to: versionApplyTo(), dry_run: dryRun
      });
    } else {
      out = await apiSend('POST', `/api/versions?id=${encodeURIComponent(f.versionId)}&action=apply`, {
        apply_to: versionApplyTo(), installed_at: installed, dry_run: dryRun
      });
    }
    f.busy = false;
    if (dryRun) { f.preview = out.instances; return render(); }
    const applied = out.applied.map(a => `${a.asset_code || a.code}: ${a.from || '—'} → ${a.to}`).join(' · ');
    f.result = (applied ? t('version_applied') + ' ' + applied : t('version_registered_only'))
      + (out.skipped.length ? ' · ' + t('version_skipped').replace('{n}', out.skipped.length) : '');
    S.modelDetail = null;   // recargar la ficha (versiones e instalaciones)
    loadNav();
    render();
  } catch (e) {
    f.busy = false;
    const msg = e.message;
    if (msg === 'Installation date is before the current version start' && e.data?.instances) {
      f.error = t('version_too_early') + ' ' + e.data.instances.map(x => `${x.asset_code || x.code} (${x.current_since})`).join(', ');
    } else if (msg === 'Version already exists for this model') f.error = t('version_exists');
    else f.error = t('save_error') + ' ' + apiErrorText(msg);
    render();
  }
}
