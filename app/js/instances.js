// ============================================================
// BION · Plataforma — Ficha de la instalación (instancia)
// Ruta: #/instancias/<id>
// API: /api/instances (ver api/instances.js)
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

// Bloques de la ficha. kind 'fields' = campos de la instancia; 'section' = tabla de sección (api section=…)
// fmt: formato de presentación/edición (ver fmtValue e inputHtml en app.js)
const INST_FMT = {
  autonomy_level: 'scale5', autonomy_level_approved: 'scale5', risk_score_total: 'number',
  override_response_time_sec: 'seconds', kill_switch_response_time_sec: 'seconds', committed_investment_usd: 'usd',
  employees_signed_policy_pct: 'pct', trained_employees_pct: 'pct', log_retention_months: 'number',
  independent_review_completed: 'bool', legal_review_completed: 'bool', board_approval_required: 'bool', override_auto_logged: 'bool'
};
const INST_EXTRA_LABELS = {
  compliance_status:            ['Estado de cumplimiento', 'Compliance status'],
  independent_review_completed: ['Revisión independiente realizada', 'Independent review completed'],
  legal_review_completed:       ['Revisión legal realizada', 'Legal review completed'],
  board_approval_required:      ['Requiere aprobación del directorio', 'Board approval required'],
  log_retention_months:         ['Retención de registros (meses)', 'Log retention (months)'],
  log_integrity_method:         ['Método de integridad de registros', 'Log integrity method']
};
const F_BLOCK = {
  risk_operational: { title: { es: 'F — Riesgo operacional', en: 'F — Operational risk' }, color: '#E24B4A',
    fields: ['human_override_exists', 'override_response_time_sec', 'failure_mode', 'incidents_recorded', 'review_frequency', 'last_review_date'] },
  risk_decision: { title: { es: 'F — Riesgo de decisión', en: 'F — Decision risk' }, color: '#EF9F27',
    fields: ['human_validation_exists', 'validation_process_desc', 'decision_log_exists', 'incidents_attributed', 'review_frequency'] },
  risk_strategic: { title: { es: 'F — Riesgo estratégico', en: 'F — Strategic risk' }, color: '#7F77DD',
    fields: ['geological_validation', 'used_in_reserve_reports', 'influences_public_investment', 'community_communication', 'committed_investment_usd'] },
  risk_human_use: { title: { es: 'F — Uso humano y propiedad intelectual', en: 'F — Human use & IP' }, color: '#5DCAA5',
    fields: ['use_policy_exists', 'employees_signed_policy_pct', 'mandatory_training', 'trained_employees_pct', 'misuse_cases_detected',
             'ai_allowed_legal_docs', 'ai_allowed_regulator_reports'] }
};

function instBlocks(riskSection) {
  return [
    { key: 'A', kind: 'fields', color: '#378ADD', title: { es: 'A — Identificación y uso', en: 'A — Identification & use' },
      fields: ['responsible_person', 'responsible_area', 'operational_location', 'country', 'next_review_date', 'autonomy_level',
               'eu_ai_act_risk_category', 'environment', 'infrastructure_provider', 'shadow_ai_label', 'risk_score_total',
               'deployment_status', 'compliance_status'] },
    { key: 'B', kind: 'fields', color: '#5DCAA5', title: { es: 'B — Uso funcional', en: 'B — Functional use' },
      fields: ['autonomous_decision', 'decision_speed', 'execution_frequency', 'recommends_or_decides', 'who_acts_on_output',
               'impact_if_fails', 'affected_processes', 'affected_equipment', 'people_in_impact_area', 'can_cause_physical_harm',
               'feeds_public_reports', 'foreseeable_misuse'] },
    { key: 'C', kind: 'fields', color: '#EF9F27', title: { es: 'C — Clasificación regulatoria', en: 'C — Regulatory classification' },
      fields: ['risk_level_chile', 'articles_chile', 'articles_peru', 'articles_brazil', 'applies_sernageomin', 'requires_human_supervision',
               'additional_regulations', 'nist_alignment', 'nist_functions', 'oecd_alignment', 'oecd_principles', 'iso42001_alignment',
               'iso42001_principles', 'other_frameworks', 'eu_ai_act_article'] },
    { key: 'D', kind: 'fields', color: '#D4537E', title: { es: 'D — Datos en operación', en: 'D — Data in operation' },
      fields: ['production_input_data', 'includes_personal_data', 'includes_sensitive_data', 'includes_community_data',
               'includes_confidential_data', 'data_owner'] },
    { key: 'E', kind: 'fields', color: '#97C459', title: { es: 'E — Desempeño en operación', en: 'E — Performance in operation' },
      fields: ['drift_monitoring', 'last_performance_report', 'incident_reporting_process'] },
    { key: riskSection, kind: 'section', ...F_BLOCK[riskSection] },
    { key: 'compliance', kind: 'section', color: '#F4C38B', title: { es: 'G — Cumplimiento', en: 'G — Compliance' },
      fields: ['algorithmic_impact_assessment', 'decision_log_exists', 'log_externally_auditable', 'next_regulatory_review',
               'compliance_responsible', 'docs_accessible_for_audit', 'approved_use_policy', 'board_informed', 'market_regulator_disclosure',
               'fria_completed', 'independent_review_completed', 'legal_review_completed', 'board_approval_required',
               'log_retention_months', 'log_integrity_method'] },
    { key: 'accountability', kind: 'section', color: '#9B72CF', title: { es: 'H — Responsabilidad y gobierno', en: 'H — Accountability & governance' },
      fields: ['ai_owner_business', 'ai_owner_technical', 'eu_ai_act_role', 'approved_by', 'approval_date', 'ethics_reviewer',
               'data_protection_contact', 'escalation_contact', 'board_informed', 'review_cycle'] },
    { key: 'risk_assessment', kind: 'section', color: '#7F77DD', title: { es: 'M2 — Evaluación de riesgo', en: 'M2 — Risk assessment' },
      fields: ['assessment_code', 'methodology', 'probability_scale', 'residual_risk_level', 'mitigation_controls', 'contingency_plan',
               'next_mandatory_review', 'evaluator_name', 'management_approval_name', 'drift_status', 'monitoring_frequency'] },
    { key: 'human_supervision', kind: 'section', color: '#378ADD', title: { es: 'M4 — Supervisión humana', en: 'M4 — Human supervision' },
      fields: ['autonomy_level_approved', 'autonomy_approved_by', 'kill_switch_mechanism', 'kill_switch_response_time_sec',
               'kill_switch_last_tested', 'kill_switch_test_result', 'kill_switch_next_test', 'escalation_thresholds',
               'override_auto_logged', 'override_audit_frequency', 'degraded_mode_behavior'] }
  ];
}

const instLabel = col => INST_EXTRA_LABELS[col] ? INST_EXTRA_LABELS[col][LANG === 'es' ? 0 : 1] : fieldLabel(col);

// Control de edición; en H el campo board_informed solo admite Si / No / En proceso
function instInput(blockKey, col, raw) {
  if (blockKey === 'accountability' && col === 'board_informed') {
    const val = raw || '';
    return `<select class="input edit-input" data-col="${col}" data-type="select"><option value=""></option>
      ${['Si', 'No', 'En proceso'].map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  }
  return inputHtml(col, INST_FMT[col], raw);
}

function instanceIdFromRoute() {
  const m = S.route.match(/^instancias\/([\w-]+)$/);
  return m ? m[1] : null;
}

async function loadInstance(id) {
  S.inst = { id, loading: true };
  try { S.inst = { id, data: await apiGet('/api/instances?id=' + encodeURIComponent(id)) }; }
  catch (e) { if (!S.user) return; S.inst = { id, error: /404|403/.test(e.message) ? 'inst_not_found' : 'data_error' }; }
  if (instanceIdFromRoute() === id) render();
}

function reloadInstance() {
  const id = S.inst.id;
  S.instEdit = null;
  loadInstance(id);
}

function viewInstance() {
  const id = instanceIdFromRoute();
  const back = `<button class="back" onclick="history.length > 1 ? history.back() : (location.hash='#/activos')">← ${t('back')}</button>`;
  if (!S.inst || S.inst.id !== id) { loadInstance(id); return back + `<div class="card empty">${t('loading')}</div>`; }
  if (S.inst.loading) return back + `<div class="card empty">${t('loading')}</div>`;
  if (S.inst.error) return back + `<div class="card empty">${t(S.inst.error)}</div>`;
  const d = S.inst.data, i = d.instance;
  const active = i.status === 'activa';
  const canEdit = can('instance.write') && active;
  const current = d.version_history.find(h => !h.valid_to);

  const blocks = instBlocks(d.risk_section).map(b => {
    const row = b.kind === 'fields' ? i : (d.sections[b.key] || {});
    const fs = row.field_status || {};
    const editing = S.instEdit && S.instEdit.key === b.key;
    const filled = b.fields.filter(c => row[c] !== null && row[c] !== undefined && row[c] !== '').length;
    const body = b.fields.map(col => editing
      ? `<div class="field"><label>${esc(instLabel(col))}</label>${instInput(b.key, col, row[col])}
          <select class="input sm state-sel" data-state="${col}" aria-label="${t('field_state')}">
            <option value="" ${!fs[col] ? 'selected' : ''}>✅ ${t('st_informed')}</option>
            <option value="pendiente" ${fs[col] === 'pendiente' ? 'selected' : ''}>⏳ ${t('st_pending')}</option>
            <option value="no_entregado" ${fs[col] === 'no_entregado' ? 'selected' : ''}>🚫 ${t('st_not_provided')}</option></select></div>`
      : `<div class="field"><label>${esc(instLabel(col))}</label><div>${fs[col]
          ? stateValueHtml(null, fs[col]) : (() => { const v = fmtValue(row[col], INST_FMT[col]); return v === null ? `<span class="no-info">${t('no_info')}</span>` : esc(v); })()}</div></div>`).join('');
    const open = editing || (S.instOpen || { A: true })[b.key];
    return `
      <div class="sec ${open ? 'open' : ''}" style="--c:${b.color}" id="ib-${b.key}">
        <button class="sec-head" onclick="toggleInstBlock('${b.key}')" aria-expanded="${!!open}">
          <span class="dot"></span><span class="sec-name">${esc(b.title[LANG])}</span>
          <span class="sec-count">${filled} / ${b.fields.length}</span><span class="arrow">›</span></button>
        ${open ? `<div class="sec-body"><div class="fields">${body}</div>
          ${editing ? `<div class="edit-bar">${S.instEdit.error ? `<span class="form-error inline">${esc(S.instEdit.error)}</span>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="S.instEdit=null;render()" ${S.instEdit.busy ? 'disabled' : ''}>${t('cancel')}</button>
              <button class="btn btn-primary btn-sm" onclick="saveInstBlock('${b.key}')" ${S.instEdit.busy ? 'disabled' : ''}>${S.instEdit.busy ? t('saving') : t('save')}</button></div>`
            : canEdit && !S.instEdit ? `<div class="edit-bar"><button class="btn btn-sm" onclick="S.instEdit={key:'${b.key}'};render()">${t('edit_section')}</button></div>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');

  const histRows = d.version_history.map(h => `
    <tr><td><b>${esc(h.version)}</b></td><td>${esc(h.valid_from)}</td><td>${h.valid_to ? esc(h.valid_to) : `<span class="chip c-g">${t('current')}</span>`}</td>
      <td>${h.changes_unknown ? `<span class="chip c-a">${t('changes_unknown')}</span> ` : ''}${esc(h.change_notes || '')}</td></tr>`).join('');
  const incRows = d.incidents.map(x => `
    <tr><td>${esc(x.occurred_at)}</td><td><b>${esc(x.title)}</b></td><td>${esc(x.version || '—')}</td>
      <td>${t('sev_' + x.severity)}</td><td>${t('ist_' + x.status)}</td></tr>`).join('');

  return `${back}
    <div class="head-row"><h1>${esc(i.model_name)}</h1>${riskChip(i.risk_level)}
      ${i.black_box ? `<span class="chip c-r">${t('black_box')}</span>` : ''}
      ${i.reclassification_pending ? `<span class="chip c-a">${t('reclass_pending')}</span>` : ''}
      ${!active ? `<span class="chip c-n">${t('st_retired_f')}</span>` : ''}</div>
    <div class="crumb">${esc(i.code)} · ${d.asset ? `<a href="#/activos/${esc(d.asset.id)}">${esc(d.asset.code)} — ${esc(d.asset.name)}</a>` : t('asset_unassigned')}
      · <a href="#/modelos/${esc(i.model_id)}">${esc(i.model_code)} · ${esc(i.vendor)}</a> · ${esc(d.branch?.name || '')}</div>
    <div class="card"><div class="fields">
      <div class="field"><label>${t('current_version')}</label><div>${current ? `<b>${esc(current.version)}</b> ${t('since')} ${esc(current.valid_from)}` : `<span class="no-info">${t('no_version')}</span>`}</div></div>
      <div class="field"><label>${t('group')}</label><div>${t('group_' + i.inventory_group)}</div></div>
      <div class="field"><label>${t('risk')}</label><div>${riskChip(i.risk_level)} <small class="count-note">${t('base_risk')}: ${i.base_risk_level ? t('risk_' + i.base_risk_level) : '—'}</small></div></div>
      <div class="field"><label>${t('f_installed')}</label><div>${esc(i.installed_at || '—')}${i.retired_at ? ` · ${t('f_retire_date')}: ${esc(i.retired_at)}` : ''}</div></div>
    </div></div>
    ${canEdit ? instActionsHtml(d) : ''}
    ${S.instMsg ? `<div class="alert">${esc(S.instMsg)}</div>` : ''}
    <h3 class="mt">${t('usage_sheet')}</h3>
    <div class="secs">${blocks}</div>
    ${integrationsHtml(d, canEdit)}
    <div class="card mt"><h3>${t('version_history')}</h3>
      ${histRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('version')}</th><th>${t('from')}</th><th>${t('to')}</th><th>${t('what_changed')}</th></tr></thead><tbody>${histRows}</tbody></table></div>`
        : `<div class="empty small">${t('no_versions')}</div>`}</div>
    <div class="card mt"><h3>${t('nav_incidents')}</h3>
      ${incRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('f_date')}</th><th>${t('f_title')}</th><th>${t('version')}</th><th>${t('f_severity')}</th><th>${t('status')}</th></tr></thead><tbody>${incRows}</tbody></table></div>`
        : `<div class="empty small">${t('no_incidents')}</div>`}</div>`;
}

function toggleInstBlock(key) {
  S.instOpen = S.instOpen || { A: true };
  S.instOpen[key] = !S.instOpen[key];
  render();
}

async function saveInstBlock(key) {
  const d = S.inst.data, i = d.instance;
  const b = instBlocks(d.risk_section).find(x => x.key === key);
  const row = b.kind === 'fields' ? i : (d.sections[key] || {});
  const fs = row.field_status || {};
  const box = document.getElementById('ib-' + key);
  const body = {}, states = {};
  for (const col of b.fields) {
    const el = box.querySelector(`[data-col="${col}"]`);
    const v = inputValue(el);
    if (!sameValue(v, row[col])) body[col] = v;
    const st = box.querySelector(`[data-state="${col}"]`).value || null;
    if ((fs[col] || null) !== st) states[col] = st;
  }
  if (Object.keys(states).length) body.field_status = states;
  if (!Object.keys(body).length) { S.instEdit = null; return render(); }
  S.instEdit.busy = true; S.instEdit.error = ''; render();
  try {
    const url = '/api/instances?id=' + encodeURIComponent(i.id) + (b.kind === 'section' ? '&section=' + key : '');
    await apiSend('PUT', url, body);
  } catch (e) {
    S.instEdit.busy = false; S.instEdit.error = t('save_error') + ' ' + apiErrorText(e.message);
    return render();
  }
  S.instOpen = { ...(S.instOpen || { A: true }), [key]: true };
  reloadInstance();
}

// ── Acciones: riesgo revisado, copiar, asignar activo, retirar ─
function instActionsHtml(d) {
  const i = d.instance;
  const a = S.instAction;
  const btns = `<div class="edit-bar left mt">
    ${i.reclassification_pending ? `<button class="btn btn-sm btn-primary" onclick="openInstAction('review')">${t('risk_reviewed')}</button>` : ''}
    <button class="btn btn-sm" onclick="openInstAction('copy')">${t('copy_to_others')}</button>
    ${!i.asset_id ? `<button class="btn btn-sm" onclick="openInstAction('assign')">${t('assign_asset')}</button>` : ''}
    <button class="btn btn-sm btn-danger" onclick="openInstAction('retire')">${t('retire_installation')}</button></div>`;
  if (!a) return btns;
  const err = a.error ? `<div class="form-error">${esc(a.error)}</div>` : '';
  const foot = (label, fn, danger) => `<div class="edit-bar">
    <button class="btn btn-ghost btn-sm" onclick="S.instAction=null;render()" ${a.busy ? 'disabled' : ''}>${t('cancel')}</button>
    <button class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" onclick="${fn}()" ${a.busy ? 'disabled' : ''}>${a.busy ? t('saving') : label}</button></div>`;
  let panel = '';
  if (a.type === 'review') {
    const minIdx = LEVELS.indexOf(i.base_risk_level);
    const allowed = LEVELS.filter((l, idx) => minIdx < 0 || idx <= minIdx);   // LEVELS va de Crítico a Bajo
    panel = `<div class="card"><h3>${t('risk_reviewed')}</h3><p class="count-note">${t('risk_reviewed_help')}</p>
      <div class="inline-form"><label class="field-label" for="revRisk">${t('risk')}</label>
      <select class="input" id="revRisk">${allowed.map(l => `<option value="${l}" ${l === i.risk_level ? 'selected' : ''}>${t('risk_' + l)}</option>`).join('')}</select></div>
      ${err}${foot(t('confirm'), 'submitReview')}</div>`;
  } else if (a.type === 'copy') {
    const list = a.options;
    panel = `<div class="card"><h3>${t('copy_to_others')}</h3><p class="count-note">${t('copy_help')}</p>
      ${!list ? `<div class="empty small">${t('loading')}</div>` : !list.length ? `<div class="empty small">${t('copy_none')}</div>`
        : `<div class="pick-list">${list.map(o => `<label class="pick pick-main"><input type="checkbox" data-copy="${esc(o.id)}">
            <span class="pick-name"><b>${esc(o.asset_code || t('asset_unassigned'))}</b><small>${esc(o.code)} · ${esc(o.branch_name)} · v${esc(o.current_version || '—')}</small></span></label>`).join('')}</div>`}
      ${a.result ? `<div class="alert">${esc(a.result)}</div>` : ''}
      ${err}${list && list.length ? foot(t('copy'), 'submitCopy') : ''}</div>`;
  } else if (a.type === 'assign') {
    const list = a.options;
    panel = `<div class="card"><h3>${t('assign_asset')}</h3><p class="count-note">${t('assign_help')}</p>
      ${!list ? `<div class="empty small">${t('loading')}</div>` : `<select class="input" id="assignAsset"><option value=""></option>
        ${list.map(x => `<option value="${esc(x.id)}">${esc(x.code)} — ${esc(x.name)} (${esc(x.branch_name)})</option>`).join('')}</select>`}
      ${err}${list ? foot(t('assign'), 'submitAssign') : ''}</div>`;
  } else if (a.type === 'retire') {
    panel = `<div class="card danger-zone"><div><b>${t('retire_installation')}</b><p>${t('retire_inst_help')}</p></div>
      <div class="inline-form"><label class="field-label" for="instRetireDate">${t('f_retire_date')}</label>
        <input class="input" type="date" id="instRetireDate" value="${today()}" max="${today()}"></div>
      ${err}${foot(t('retire'), 'submitRetireInst', true)}</div>`;
  }
  return btns + panel;
}

async function openInstAction(type) {
  S.instAction = { type };
  S.instMsg = '';
  render();
  const i = S.inst.data.instance;
  try {
    if (type === 'copy') {
      const m = await apiGet('/api/models?id=' + encodeURIComponent(i.model_id));
      S.instAction.options = m.instances.filter(x => x.status === 'activa' && x.id !== i.id);
    }
    if (type === 'assign') S.instAction.options = await apiGet('/api/assets');
  } catch (e) {
    if (!S.user || !S.instAction) return;
    S.instAction.options = []; S.instAction.error = t('data_error');
  }
  render();
}

async function runInstAction(fn) {
  const a = S.instAction;
  a.busy = true; a.error = ''; render();
  try { await fn(); }
  catch (e) { a.busy = false; a.error = t('save_error') + ' ' + apiErrorText(e.message); return render(); }
}

function submitReview() {
  const id = S.inst.data.instance.id, risk = document.getElementById('revRisk').value;
  runInstAction(async () => {
    await apiSend('POST', `/api/instances?id=${encodeURIComponent(id)}&action=review`, { risk_level: risk });
    S.instAction = null; S.instMsg = t('review_done');
    loadNav(); reloadInstance();
  });
}

function submitCopy() {
  const ids = [...document.querySelectorAll('[data-copy]:checked')].map(el => el.dataset.copy);
  if (!ids.length) { S.instAction.error = t('copy_select'); return render(); }
  const id = S.inst.data.instance.id;
  runInstAction(async () => {
    const out = await apiSend('POST', '/api/instances?action=copy', { source_id: id, target_ids: ids });
    S.instAction = null;
    S.instMsg = t('copy_done') + ' ' + out.targets.map(x => `${x.code}: ${x.fields_filled}`).join(' · ');
    render();
  });
}

function submitAssign() {
  const assetId = document.getElementById('assignAsset').value;
  if (!assetId) { S.instAction.error = t('assign_select'); return render(); }
  const id = S.inst.data.instance.id;
  runInstAction(async () => {
    await apiSend('POST', `/api/instances?id=${encodeURIComponent(id)}&action=assign`, { asset_id: assetId });
    S.instAction = null; S.instMsg = t('assign_done');
    S.assets = null; loadNav(); reloadInstance();
  });
}

function submitRetireInst() {
  const id = S.inst.data.instance.id, date = document.getElementById('instRetireDate').value;
  runInstAction(async () => {
    await apiSend('POST', `/api/instances?id=${encodeURIComponent(id)}&action=retire`, { date });
    S.instAction = null; S.instMsg = t('retire_inst_done');
    S.assetDetail = null; S.modelDetail = null; loadNav(); reloadInstance();
  });
}

// ── M7: integraciones ─────────────────────────────────────────
const INTEG_FIELDS = ['integration_name', 'vendor', 'integration_type', 'auth_method', 'sync_frequency', 'last_sync_status', 'priority', 'offline_capable'];
const INTEG_LABELS = {
  integration_name: ['Integración', 'Integration'], vendor: ['Proveedor', 'Vendor'], integration_type: ['Tipo', 'Type'],
  auth_method: ['Autenticación', 'Authentication'], sync_frequency: ['Frecuencia de sincronización', 'Sync frequency'],
  last_sync_status: ['Estado de la última sincronización', 'Last sync status'], priority: ['Prioridad', 'Priority'],
  offline_capable: ['Funciona sin conexión', 'Works offline']
};
const integLabel = c => INTEG_LABELS[c][LANG === 'es' ? 0 : 1];

function integrationsHtml(d, canEdit) {
  const f = S.integForm;
  const rows = d.integrations.map(x => `
    <tr><td><b>${esc(x.integration_name)}</b><small>${esc(x.vendor || '')}</small></td><td>${esc(x.integration_type || '—')}</td>
      <td>${esc(x.sync_frequency || '—')}</td><td>${esc(x.last_sync_status || '—')}</td><td>${esc(x.priority || '—')}</td>
      <td class="actions">${canEdit && !f ? `<button class="btn btn-sm" onclick="openIntegForm('${esc(x.id)}')">${t('edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteInteg('${esc(x.id)}')">${t('remove')}</button>` : ''}</td></tr>`).join('');
  const form = f ? `<div class="div-form mt"><div class="fields form">${INTEG_FIELDS.map(c => {
      const v = f.values[c];
      let ctl;
      if (c === 'offline_capable') ctl = `<select class="input" id="ig_${c}"><option value="false">${t('no')}</option><option value="true" ${v ? 'selected' : ''}>${t('yes')}</option></select>`;
      else if (FIELD_OPTIONS[c]) ctl = `<select class="input" id="ig_${c}"><option value=""></option>${FIELD_OPTIONS[c].map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      else ctl = `<input class="input" id="ig_${c}" value="${esc(v || '')}">`;
      return `<div class="field"><label for="ig_${c}">${integLabel(c)}${c === 'integration_name' ? ' *' : ''}</label>${ctl}</div>`;
    }).join('')}</div>
    ${f.error ? `<div class="form-error">${esc(f.error)}</div>` : ''}
    <div class="edit-bar"><button class="btn btn-ghost btn-sm" onclick="S.integForm=null;render()">${t('cancel')}</button>
      <button class="btn btn-primary btn-sm" onclick="saveInteg()">${t('save')}</button></div></div>` : '';
  return `<div class="card mt"><h3>M7 — ${t('integrations')}</h3>
    ${rows ? `<div class="tbl-wrap"><table><thead><tr><th>${integLabel('integration_name')}</th><th>${integLabel('integration_type')}</th>
      <th>${integLabel('sync_frequency')}</th><th>${integLabel('last_sync_status')}</th><th>${integLabel('priority')}</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="empty small">${t('no_integrations')}</div>`}
    ${form}
    ${canEdit && !f ? `<div class="edit-bar left mt"><button class="btn btn-sm" onclick="openIntegForm()">+ ${t('add_integration')}</button></div>` : ''}
  </div>`;
}

function openIntegForm(id) {
  const x = id ? S.inst.data.integrations.find(r => r.id === id) : null;
  S.integForm = { id: id || null, values: x ? { ...x } : {} };
  render();
}

async function saveInteg() {
  const f = S.integForm, iid = S.inst.data.instance.id;
  const body = {};
  INTEG_FIELDS.forEach(c => {
    const v = document.getElementById('ig_' + c).value.trim();
    body[c] = c === 'offline_capable' ? v === 'true' : (v || null);
  });
  if (!body.integration_name) { f.error = t('required_fields') + ' ' + integLabel('integration_name'); return render(); }
  try {
    if (f.id) await apiSend('PUT', `/api/instances?id=${encodeURIComponent(iid)}&integration_id=${encodeURIComponent(f.id)}`, body);
    else await apiSend('POST', `/api/instances?id=${encodeURIComponent(iid)}&section=integrations`, body);
  } catch (e) { f.error = t('save_error') + ' ' + apiErrorText(e.message); return render(); }
  S.integForm = null;
  reloadInstance();
}

async function deleteInteg(id) {
  if (!confirm(t('remove_integration_confirm'))) return;
  try { await apiSend('DELETE', `/api/instances?id=${encodeURIComponent(S.inst.data.instance.id)}&integration_id=${encodeURIComponent(id)}`); }
  catch (e) { S.instMsg = t('save_error') + ' ' + apiErrorText(e.message); return render(); }
  reloadInstance();
}
