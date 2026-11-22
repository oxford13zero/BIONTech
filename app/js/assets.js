// ============================================================
// BION · Plataforma — Activos (lista, ficha, nuevo, editar)
// Rutas: #/activos · #/activos/nuevo · #/activos/<id> · #/activos/<id>/editar
// API: /api/assets (ver api/assets.js)
// Se carga antes de app.js; usa sus funciones (S, t, esc, apiGet, render…) solo al ejecutarse.
// ============================================================

const ASSET_TYPES = ['equipo', 'instalacion', 'proceso'];
const AI_USAGES = ['usa_ia', 'modelos_por_identificar', 'por_confirmar'];

// Envío a la API con mensaje de error legible
async function apiSend(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('unauthorized'); }
  if (!res.ok) throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { data });
  return data;
}

// Mensajes del servidor → texto para el usuario
function apiErrorText(msg) {
  const map = {
    'Duplicate code': 'err_duplicate_code',
    'Select at least one model, or mark the asset as "models to identify"': 'err_select_model',
    'Model selected twice': 'err_model_twice',
    'Asset is retired': 'err_asset_retired',
    'Not allowed': 'err_not_allowed'
  };
  return map[msg] ? t(map[msg]) : msg;
}

// ── Rutas ─────────────────────────────────────────────────────
function assetRoute() {
  const m = S.route.match(/^activos(?:\/([\w-]+))?(?:\/(editar))?$/);
  if (!m) return null;
  if (!m[1]) return { view: 'list' };
  if (m[1] === 'nuevo') return { view: 'new' };
  return { view: m[2] ? 'edit' : 'detail', id: m[1] };
}

function viewAssets() {
  const r = assetRoute();
  if (r.view === 'list') return viewAssetList();
  if (r.view === 'detail') return viewAssetDetail(r.id);
  if (!can('asset.write')) return `<div class="card empty">${t('err_not_allowed')}</div>`;
  return viewAssetForm(r.view === 'edit' ? r.id : null);
}

// ── Lista ─────────────────────────────────────────────────────
function assetFilters() {
  const p = parseHash().params;
  return { q: p.q || '', type: p.type || '', manufacturer: p.manufacturer || '', status: p.status || 'activo' };
}

function setAssetFilter(key, value) {
  const f = assetFilters();
  f[key] = value;
  if (f.status === 'activo') delete f.status;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  history.replaceState(null, '', '#/activos' + (qs ? '?' + qs : ''));
  if (key === 'q') { clearTimeout(S._assetSearch); S._assetSearch = setTimeout(() => render(), 300); }
  else render();
}

async function loadAssets(key, f) {
  S.assets = { key, loading: true };
  const qs = new URLSearchParams({ ...(divisionParam() ? { division: divisionParam() } : {}),
    ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  try {
    S.assets = { key, list: await apiGet('/api/assets?' + qs) };
  } catch (e) {
    if (!S.user) return;
    S.assets = { key, error: true };
  }
  if (assetRoute()?.view === 'list') render();
}

function viewAssetList() {
  const f = assetFilters();
  const key = JSON.stringify([S.division, f]);
  if (!S.assets || S.assets.key !== key) loadAssets(key, f);
  const a = S.assets;
  const showDiv = S.division === 'all';
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

  let body;
  if (a.loading || !a.list && !a.error) body = `<div class="empty small">${t('loading')}</div>`;
  else if (a.error) body = `<div class="empty small">${t('data_error')}</div>`;
  else {
    const rows = a.list.map(x => `
      <tr class="row" onclick="location.hash='#/activos/${esc(x.id)}'">
        <td><b>${esc(x.name)}</b><small>${esc(x.code)}</small></td>
        <td>${t('type_' + x.asset_type)}</td>
        <td>${esc([x.manufacturer, x.equipment_model].filter(Boolean).join(' ') || '—')}</td>
        <td>${esc(x.area || '—')}</td>
        ${showDiv ? `<td>${esc(x.branch_name)}</td>` : ''}
        <td>${x.ai_usage === 'usa_ia' ? x.models_count : `<span class="chip c-a">${t('usage_' + x.ai_usage)}</span>`}</td>
        <td>${x.incidents_count}</td>
        <td>${x.has_pending ? `<span class="chip c-a" title="${t('has_pending')}">⚠ ${t('nav_pending')}</span>` : ''}</td>
      </tr>`).join('');
    body = `<div class="tbl-wrap"><table>
      <thead><tr><th>${t('asset')}</th><th>${t('f_type')}</th><th>${t('f_manufacturer')}</th><th>${t('f_area')}</th>
        ${showDiv ? `<th>${t('division')}</th>` : ''}<th>${t('nav_models')}</th><th>${t('nav_incidents')}</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="empty small">${t('assets_none')}</td></tr>`}</tbody>
    </table></div>
    <p class="count-note">${t('n_assets').replace('{n}', a.list.length)}</p>`;
  }

  return `
    ${can('asset.write') ? `<div class="page-actions"><a class="btn btn-primary" href="#/activos/nuevo">+ ${t('new_asset')}</a></div>` : ''}
    <div class="toolbar">
      <input class="input search" type="text" placeholder="${t('asset_search')}" value="${esc(f.q)}"
        oninput="setAssetFilter('q', this.value)" id="assetSearch">
      <select class="input" onchange="setAssetFilter('type', this.value)">
        ${opt('', t('all_types'), f.type)}${ASSET_TYPES.map(x => opt(x, t('type_' + x), f.type)).join('')}</select>
      <input class="input" type="text" placeholder="${t('f_manufacturer')}" value="${esc(f.manufacturer)}"
        onchange="setAssetFilter('manufacturer', this.value.trim())">
      <select class="input" onchange="setAssetFilter('status', this.value)">
        ${opt('activo', t('st_assets_active'), f.status)}${opt('retirado', t('st_assets_retired'), f.status)}</select>
    </div>
    <div class="card">${body}</div>`;
}

// ── Ficha del activo ──────────────────────────────────────────
async function loadAssetDetail(id) {
  S.assetDetail = { id, loading: true };
  try {
    S.assetDetail = { id, data: await apiGet('/api/assets?id=' + encodeURIComponent(id)) };
  } catch (e) {
    if (!S.user) return;
    S.assetDetail = { id, error: /404|403/.test(e.message) ? 'asset_not_found' : 'data_error' };
  }
  if (assetRoute()?.id === id) render();
}

function viewAssetDetail(id) {
  const back = `<button class="back" onclick="location.hash='#/activos'">← ${t('back_to_assets')}</button>`;
  if (!S.assetDetail || S.assetDetail.id !== id) { loadAssetDetail(id); return back + `<div class="card empty">${t('loading')}</div>`; }
  const d = S.assetDetail;
  if (d.loading) return back + `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return back + `<div class="card empty">${t(d.error)}</div>`;
  const { asset: a, instances, incidents } = d.data;
  const retired = a.status === 'retirado';
  const field = (label, v) => `<div class="field"><label>${label}</label><div class="${v ? '' : 'no-info'}">${v ? esc(v) : t('no_info')}</div></div>`;

  const instRows = instances.map(i => `
    <tr class="row" onclick="location.hash='#/instancias/${esc(i.id)}'">
      <td><a href="#/modelos/${esc(i.model_id)}" onclick="event.stopPropagation()"><b>${esc(i.model_name)}</b></a><small>${esc(i.code)} · ${esc(i.vendor)}</small></td>
      <td>${i.current_version ? esc(i.current_version) : '—'}</td>
      <td>${t('group_' + i.inventory_group)}</td>
      <td>${riskChip(i.risk_level)}</td>
      <td>${[i.black_box ? `<span class="chip c-r">${t('black_box')}</span>` : '',
             i.reclassification_pending ? `<span class="chip c-a">${t('reclass_pending')}</span>` : '',
             i.status !== 'activa' ? `<span class="chip c-n">${t('st_retired_f')}</span>` : ''].join(' ')}</td>
    </tr>`).join('');
  const incRows = incidents.map(x => `
    <tr class="row" onclick="location.hash='#/incidentes/${esc(x.id)}'">
      <td>${esc(x.occurred_at)}</td>
      <td><b>${esc(x.title)}</b></td>
      <td>${x.model_name ? esc(x.model_name) + (x.version ? ` <small>v${esc(x.version)}</small>` : '') : `<span class="chip c-a">${t('model_undetermined')}</span>`}</td>
      <td>${t('sev_' + x.severity)}</td>
      <td>${t('ist_' + x.status)}</td>
    </tr>`).join('');

  return `${back}
    <div class="head-row"><h1>${esc(a.name)}</h1>
      ${retired ? `<span class="chip c-n">${t('st_retired_m')}</span>` : ''}
      ${a.ai_usage !== 'usa_ia' ? `<span class="chip c-a">${t('usage_' + a.ai_usage)}</span>` : ''}</div>
    <div class="crumb">${esc([a.code, t('type_' + a.asset_type), a.branch_name].join(' · '))}</div>
    ${can('asset.write') && !retired ? `<div class="edit-bar left">
      <a class="btn btn-sm" href="#/activos/${esc(a.id)}/editar">${t('edit')}</a>
      <button class="btn btn-sm btn-danger" onclick="openRetireAsset()">${t('retire')}</button></div>` : ''}
    ${S.retireAsset ? `<div class="card danger-zone">
      <div><b>${t('retire_asset_title')}</b><p>${t('retire_asset_help')}</p></div>
      <div class="inline-form"><label class="field-label" for="retireDate">${t('f_retire_date')}</label>
        <input class="input" type="date" id="retireDate" value="${today()}" max="${today()}">
        <button class="btn btn-ghost btn-sm" onclick="S.retireAsset=false;render()">${t('cancel')}</button>
        <button class="btn btn-danger btn-sm" onclick="retireAsset('${esc(a.id)}')">${t('retire')}</button></div>
      ${S.retireError ? `<div class="form-error">${esc(S.retireError)}</div>` : ''}</div>` : ''}

    <div class="card"><h3>${t('asset_data')}</h3><div class="fields">
      ${field(t('f_manufacturer'), a.manufacturer)}${field(t('f_equipment_model'), a.equipment_model)}
      ${field(t('f_area'), a.area)}${field(t('f_commissioned_at'), a.commissioned_at)}
      ${retired ? field(t('f_retire_date'), a.retired_at) : ''}${field(t('f_notes'), a.notes)}
    </div></div>

    <div class="card mt"><h3>${t('models_used')}</h3>
      ${instRows ? `<div class="tbl-wrap"><table>
        <thead><tr><th>${t('model')}</th><th>${t('version')}</th><th>${t('group')}</th><th>${t('risk')}</th><th></th></tr></thead>
        <tbody>${instRows}</tbody></table></div>`
        : `<div class="empty small">${a.ai_usage === 'usa_ia' ? t('no_models_yet') : t('usage_help_' + a.ai_usage)}</div>`}
    </div>

    ${instances.length ? compareCardHtml(a, instances) : ''}

    <div class="card mt"><h3>${t('nav_incidents')}</h3>
      ${can('incident.write') && !retired ? `<div class="edit-bar left"><a class="btn btn-sm" href="#/incidentes/nuevo?asset=${esc(a.id)}">+ ${t('new_incident')}</a></div>` : ''}
      ${incRows ? `<div class="tbl-wrap"><table>
        <thead><tr><th>${t('f_date')}</th><th>${t('f_title')}</th><th>${t('model')}</th><th>${t('f_severity')}</th><th>${t('status')}</th></tr></thead>
        <tbody>${incRows}</tbody></table></div>` : `<div class="empty small">${t('no_incidents')}</div>`}
    </div>`;
}

function openRetireAsset() { S.retireAsset = true; S.retireError = ''; render(); }

async function retireAsset(id) {
  const date = document.getElementById('retireDate').value;
  try {
    await apiSend('DELETE', `/api/assets?id=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}`);
  } catch (e) {
    S.retireError = t('save_error') + ' ' + apiErrorText(e.message);
    return render();
  }
  S.retireAsset = false; S.assets = null; S.assetDetail = null;
  loadNav();
  render();
}

// ── Nuevo / editar ────────────────────────────────────────────
// S.assetForm = { id, values, usage, catalog, selected: {modelId: {group, installed_at}}, newModels: [...], search, error, busy }
async function loadCatalog() {
  try { S.assetForm.catalog = await apiGet('/api/models'); }
  catch (e) { if (S.user) S.assetForm.catalog = []; }
  render();
}

function initAssetForm(id) {
  if (S.assetForm && S.assetForm.id === id) return;
  S.assetForm = { id, values: {}, usage: 'usa_ia', selected: {}, newModels: [], search: '', catalog: null };
  if (id) {
    const a = S.assetDetail?.id === id && S.assetDetail.data?.asset;
    if (!a) { loadAssetDetail(id); S.assetForm.waiting = true; return; }
    S.assetForm.values = { ...a };
    S.assetForm.usage = a.ai_usage;
  } else {
    S.assetForm.values = { branch_id: S.division !== 'all' ? S.division : '' };
    loadCatalog();
  }
}

// Lee el formulario actual para no perder lo escrito al volver a dibujar
function collectAssetForm() {
  const f = S.assetForm;
  if (!f || !document.getElementById('af_code')) return;
  ['code', 'name', 'asset_type', 'branch_id', 'manufacturer', 'equipment_model', 'area', 'commissioned_at', 'notes']
    .forEach(k => { const el = document.getElementById('af_' + k); if (el) f.values[k] = el.value; });
  const u = document.querySelector('input[name="af_usage"]:checked');
  if (u) f.usage = u.value;
  document.querySelectorAll('[data-sel-model]').forEach(el => {
    const id = el.dataset.selModel;
    if (el.checked) {
      f.selected[id] = {
        group: document.getElementById('afg_' + id)?.value || f.selected[id]?.group || '',
        installed_at: document.getElementById('afd_' + id)?.value || ''
      };
    } else delete f.selected[id];
  });
  f.newModels = f.newModels.map((m, i) => ({
    name: document.getElementById(`afn_name_${i}`)?.value ?? m.name,
    vendor: document.getElementById(`afn_vendor_${i}`)?.value ?? m.vendor,
    version: document.getElementById(`afn_version_${i}`)?.value ?? m.version,
    base_risk_level: document.getElementById(`afn_risk_${i}`)?.value ?? m.base_risk_level,
    suggested_group: document.getElementById(`afn_group_${i}`)?.value ?? m.suggested_group
  }));
}

function formAction(fn) { collectAssetForm(); fn(S.assetForm); render(); }
function addNewModelRow() { formAction(f => f.newModels.push({ name: '', vendor: '', version: '', base_risk_level: '', suggested_group: '1' })); }
function removeNewModelRow(i) { formAction(f => f.newModels.splice(i, 1)); }
function setUsage(v) { formAction(f => { f.usage = v; }); }
function toggleModel(id) { formAction(() => {}); }
function setCatalogSearch(v) {
  collectAssetForm();
  S.assetForm.search = v;
  document.getElementById('catalogList').innerHTML = catalogListHtml();
}

function catalogListHtml() {
  const f = S.assetForm;
  if (!f.catalog) return `<div class="empty small">${t('loading')}</div>`;
  const q = (f.search || '').toLowerCase();
  const list = f.catalog.filter(m => !q || (m.name + ' ' + m.vendor + ' ' + m.code).toLowerCase().includes(q) || f.selected[m.id]);
  if (!list.length) return `<div class="empty small">${t('catalog_none')}</div>`;
  const groupSel = (id, cur) => `<select class="input sm" id="afg_${esc(id)}">${[1, 2, 3, 4].map(g =>
    `<option value="${g}" ${String(g) === String(cur) ? 'selected' : ''}>${t('group_' + g)}</option>`).join('')}</select>`;
  return list.map(m => {
    const sel = f.selected[m.id];
    return `<div class="pick ${sel ? 'on' : ''}">
      <label class="pick-main"><input type="checkbox" data-sel-model="${esc(m.id)}" ${sel ? 'checked' : ''} onchange="toggleModel('${esc(m.id)}')">
        <span class="pick-name"><b>${esc(m.name)}</b><small>${esc(m.code)} · ${esc(m.vendor)}</small></span>
        ${riskChip(m.base_risk_level)}${m.black_box ? ` <span class="chip c-r">${t('black_box')}</span>` : ''}</label>
      ${sel ? `<div class="pick-extra">
        <label>${t('group')} ${groupSel(m.id, sel.group || m.suggested_group || 1)}</label>
        <label>${t('f_installed')} <input class="input sm" type="date" id="afd_${esc(m.id)}" value="${esc(sel.installed_at || '')}"
          placeholder="${t('f_installed')}"></label></div>` : ''}
    </div>`;
  }).join('');
}

function viewAssetForm(id) {
  initAssetForm(id);
  const f = S.assetForm;
  const back = `<button class="back" onclick="history.back()">← ${t('back_to_list')}</button>`;
  if (f.waiting) {
    if (S.assetDetail?.data?.asset) { S.assetForm = null; return viewAssetForm(id); }
    if (S.assetDetail?.error) return back + `<div class="card empty">${t(S.assetDetail.error)}</div>`;
    return back + `<div class="card empty">${t('loading')}</div>`;
  }
  const v = f.values;
  const branches = S.data?.branches || [];
  const opt = (val, label, cur) => `<option value="${esc(val)}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const input = (k, type = 'text', req, labelKey) => `<div class="field"><label for="af_${k}">${t(labelKey || 'f_' + k)}${req ? ' *' : ''}</label>
    <input class="input" id="af_${k}" type="${type}" value="${esc(v[k] || '')}"></div>`;

  const newRows = f.newModels.map((m, i) => `
    <div class="new-model">
      <input class="input" id="afn_name_${i}" placeholder="${t('f_model_name')} *" value="${esc(m.name)}">
      <input class="input" id="afn_vendor_${i}" placeholder="${t('vendor')} *" value="${esc(m.vendor)}">
      <input class="input" id="afn_version_${i}" placeholder="${t('version')}" value="${esc(m.version)}">
      <select class="input" id="afn_risk_${i}">${opt('', t('risk') + '…', m.base_risk_level)}${LEVELS.map(l => opt(l, t('risk_' + l), m.base_risk_level)).join('')}</select>
      <select class="input" id="afn_group_${i}">${[1, 2, 3, 4].map(g => opt(g, t('group_' + g), m.suggested_group)).join('')}</select>
      <button class="btn btn-ghost btn-sm" onclick="removeNewModelRow(${i})" aria-label="${t('remove')}">✕</button>
    </div>`).join('');

  return `${back}
    <h1>${id ? t('edit_asset') : t('new_asset')}</h1>
    <div class="crumb">${id ? esc(v.code) : t('new_asset_help')}</div>
    ${f.error ? `<div class="form-error" role="alert">${esc(f.error)}</div>` : ''}
    <div class="card"><h3>${t('asset_data')}</h3>
      <div class="fields form">
        ${input('code', 'text', true, 'f_asset_code')}${input('name', 'text', true, 'f_asset_name')}
        <div class="field"><label for="af_asset_type">${t('f_type')} *</label><select class="input" id="af_asset_type">
          ${opt('', '', v.asset_type)}${ASSET_TYPES.map(x => opt(x, t('type_' + x), v.asset_type)).join('')}</select></div>
        <div class="field"><label for="af_branch_id">${t('division')} *</label><select class="input" id="af_branch_id">
          ${branches.length > 1 ? opt('', '', v.branch_id) : ''}${branches.map(b => opt(b.id, b.name, v.branch_id || (branches.length === 1 ? b.id : ''))).join('')}</select></div>
        ${input('manufacturer')}${input('equipment_model')}${input('area')}${input('commissioned_at', 'date')}
        <div class="field wide"><label for="af_notes">${t('f_notes')}</label><textarea class="input" id="af_notes" rows="2">${esc(v.notes || '')}</textarea></div>
      </div>
    </div>
    <div class="card mt"><h3>${t('uses_ai_q')}</h3>
      <div class="radios">${AI_USAGES.map(u => `<label class="radio"><input type="radio" name="af_usage" value="${u}" ${f.usage === u ? 'checked' : ''}
        onchange="setUsage('${u}')"> ${t('usage_' + u)}</label>`).join('')}</div>
      ${f.usage !== 'usa_ia' ? `<p class="count-note">${t('usage_help_' + f.usage)}</p>` : ''}
    </div>
    ${!id && f.usage === 'usa_ia' ? `
    <div class="card mt"><h3>${t('models_used')}</h3>
      <p class="count-note">${t('pick_models_help')}</p>
      <input class="input search" type="text" placeholder="${t('catalog_search')}" value="${esc(f.search)}" oninput="setCatalogSearch(this.value)">
      <div class="pick-list" id="catalogList">${catalogListHtml()}</div>
      <h3 class="mt">${t('new_models')}</h3>
      ${newRows || `<p class="count-note">${t('new_models_help')}</p>`}
      <button class="btn btn-sm" onclick="addNewModelRow()">+ ${t('add_new_model')}</button>
    </div>` : ''}
    <div class="edit-bar">
      <button class="btn btn-ghost" onclick="history.back()" ${f.busy ? 'disabled' : ''}>${t('cancel')}</button>
      <button class="btn btn-primary" onclick="saveAsset()" ${f.busy ? 'disabled' : ''}>${f.busy ? t('saving') : (id ? t('save') : t('create_asset'))}</button>
    </div>`;
}

async function saveAsset() {
  collectAssetForm();
  const f = S.assetForm, v = f.values;
  const missing = [['code', 'f_asset_code'], ['name', 'f_asset_name'], ['asset_type', 'f_type'], ['branch_id', 'division']]
    .filter(([k]) => !String(v[k] || '').trim()).map(([, key]) => t(key));
  const badNew = f.newModels.some(m => !m.name.trim() || !m.vendor.trim());
  if (missing.length) { f.error = t('required_fields') + ' ' + missing.join(', '); return render(); }
  if (badNew) { f.error = t('err_new_model_fields'); return render(); }
  if (!f.id && f.usage === 'usa_ia' && !Object.keys(f.selected).length && !f.newModels.length) {
    f.error = t('err_select_model'); return render();
  }
  const asset = {};
  ['code', 'name', 'asset_type', 'branch_id', 'manufacturer', 'equipment_model', 'area', 'commissioned_at', 'notes']
    .forEach(k => { asset[k] = (v[k] ?? '').toString().trim() || null; });
  asset.ai_usage = f.usage;

  f.busy = true; f.error = ''; render();
  try {
    let id = f.id;
    if (id) {
      await apiSend('PUT', '/api/assets?id=' + encodeURIComponent(id), asset);
    } else {
      const out = await apiSend('POST', '/api/assets', {
        asset,
        models: f.usage === 'usa_ia' ? Object.entries(f.selected).map(([model_id, s]) => ({
          model_id, inventory_group: Number(s.group) || undefined, installed_at: s.installed_at || undefined })) : [],
        new_models: f.usage === 'usa_ia' ? f.newModels.map(m => ({
          name: m.name.trim(), vendor: m.vendor.trim(), version: m.version.trim() || undefined,
          base_risk_level: m.base_risk_level || undefined, suggested_group: Number(m.suggested_group) || undefined })) : []
      });
      id = out.id;
    }
    S.assetForm = null; S.assets = null; S.assetDetail = null;
    location.hash = '#/activos/' + id;
    loadNav();
  } catch (e) {
    f.busy = false;
    f.error = t('save_error') + ' ' + apiErrorText(e.message);
    render();
  }
}


// ── Comparación "antes y después" ─────────────────────────────
// Fechas en la dirección: #/activos/<id>?from=AAAA-MM-DD&to=AAAA-MM-DD
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Por defecto: el día anterior al último cambio de versión, y hoy; si nunca hubo cambios, hace un año y hoy
function compareDefaults(instances) {
  const changes = instances.filter(i => i.current_since && i.installed_at && String(i.current_since) > String(i.installed_at))
    .map(i => String(i.current_since)).sort();
  const last = changes[changes.length - 1];
  return { from: last ? addDays(last, -1) : addDays(today(), -365), to: today() };
}

function setCompareDate(key, value) {
  const p = parseHash().params;
  p[key] = value;
  const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  history.replaceState(null, '', '#/' + S.route + (qs ? '?' + qs : ''));
  render();
}

async function loadCompare(key, id, from, to) {
  S.cmp = { key, loading: true };
  try {
    S.cmp = { key, data: await apiGet(`/api/assets?id=${encodeURIComponent(id)}&compare=1&from=${from}&to=${to}`) };
  } catch (e) {
    if (!S.user) return;
    S.cmp = { key, error: true };
  }
  if (assetRoute()?.id === id) render();
}

function periodHtml(x) {
  if (!x) return `<span class="no-info">${t('not_installed_then')}</span>`;
  const rate = x.rate_per_1000_days === null ? '—' : String(x.rate_per_1000_days).replace('.', LANG === 'es' ? ',' : '.');
  return `<b>${esc(x.version)}</b>
    <small>${t('cmp_days').replace('{n}', x.days.toLocaleString(LANG === 'es' ? 'es-CL' : 'en-US'))} · ${t('cmp_incidents').replace('{n}', x.incidents)}</small>
    <small>${t('cmp_rate').replace('{n}', rate)}</small>`;
}

function compareResult(m) {
  if (!m.before && m.after) return `<span class="chip c-n">${t('cmp_installed_after')}</span>`;
  if (m.before && !m.after) return `<span class="chip c-n">${t('cmp_removed')}</span>`;
  if (!m.before && !m.after) return `<span class="chip c-n">${t('cmp_not_installed')}</span>`;
  if (!m.changed) return `<span class="chip c-g">${t('cmp_unchanged')}</span>`;
  let arrow = '';
  const a = m.before.rate_per_1000_days, b = m.after.rate_per_1000_days;
  if (a !== null && b !== null) {
    if (b > a) arrow = ` <span class="trend up" title="${t('cmp_rate_up')}">↑ ${t('cmp_rate_up')}</span>`;
    else if (b < a) arrow = ` <span class="trend down" title="${t('cmp_rate_down')}">↓ ${t('cmp_rate_down')}</span>`;
  }
  return `<span class="chip c-a">${m.after.changes_unknown ? t('cmp_changed_unknown') : t('cmp_changed')}</span>${arrow}`;
}

function compareCardHtml(a, instances) {
  const p = parseHash().params, def = compareDefaults(instances);
  const from = p.from || def.from, to = p.to || def.to;
  const key = [a.id, from, to].join('|');
  let body;
  if (from >= to) body = `<div class="form-error">${t('cmp_bad_dates')}</div>`;
  else {
    if (!S.cmp || S.cmp.key !== key) loadCompare(key, a.id, from, to);
    const c = S.cmp;
    if (c.loading || (!c.data && !c.error)) body = `<div class="empty small">${t('loading')}</div>`;
    else if (c.error) body = `<div class="empty small">${t('data_error')}</div>`;
    else body = `<div class="tbl-wrap"><table class="cmp">
      <thead><tr><th>${t('model')}</th><th>${t('cmp_on').replace('{d}', esc(from))}</th><th>${t('cmp_on').replace('{d}', esc(to))}</th><th>${t('cmp_result')}</th></tr></thead>
      <tbody>${c.data.models.map(m => `<tr>
        <td><b>${esc(m.model_name)}</b><small>${esc(m.vendor)}${m.black_box ? ' · ' + t('black_box') : ''}</small></td>
        <td>${periodHtml(m.before)}</td><td>${periodHtml(m.after)}</td><td>${compareResult(m)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }
  return `<div class="card mt" id="compareCard"><h3>${t('cmp_title')}</h3>
    <p class="count-note">${t('cmp_help')}</p>
    <div class="inline-form">
      <label class="date-filter">${t('cmp_date1')} <input class="input" type="date" id="cmpFrom" value="${esc(from)}" max="${today()}" onchange="setCompareDate('from', this.value)"></label>
      <label class="date-filter">${t('cmp_date2')} <input class="input" type="date" id="cmpTo" value="${esc(to)}" max="${today()}" onchange="setCompareDate('to', this.value)"></label>
    </div>
    <div class="mt">${body}</div>
    <p class="count-note">${t('cmp_note')}</p></div>`;
}
