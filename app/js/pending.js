// ============================================================
// BION · Plataforma — Pendientes
// Ruta: #/pendientes
// API: /api/pending (ver api/pending.js)
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

async function loadPending(key) {
  S.pending = { key, loading: true };
  const q = divisionParam() ? '?division=' + encodeURIComponent(divisionParam()) : '';
  try { S.pending = { key, data: await apiGet('/api/pending' + q) }; }
  catch (e) { if (!S.user) return; S.pending = { key, error: true }; }
  if (S.route === 'pendientes') render();
}

// Definición de cada grupo: título, ayuda, cómo mostrar cada elemento y a dónde lleva
function pendingGroups(items) {
  const modelTag = tag => can('model.write') ? tag : t('managed_by_company');
  const stateTxt = s => s === 'no_entregado' ? `🚫 ${t('st_not_provided')}` : `⏳ ${t('st_pending')}`;
  const fieldItem = f => ({
    href: f.entity === 'modelo' ? '#/modelos/' + f.id : '#/instancias/' + f.id,
    main: `${esc(instLabel(f.field))}`,
    sub: `${f.entity === 'modelo' ? t('model') : t('installation')}: ${esc(f.name || f.code)}${f.name ? ' · ' + esc(f.code) : ''}`,
    tag: f.entity === 'modelo' ? modelTag(stateTxt(f.state)) : stateTxt(f.state)
  });
  return [
    { key: 'reclassification_pending', icon: '⚖️', list: items.reclassification_pending.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${esc(i.code)} · ${verLabel(i.version)}`,
        tag: t('action_review_risk') })) },
    { key: 'incidents_model_undetermined', icon: '🔎', list: items.incidents_model_undetermined.map(x => ({
        href: '#/incidentes/' + x.id, main: esc(x.title), sub: `${esc(x.occurred_at)} · ${esc(x.asset_code)}`, tag: t('action_assign_model') })) },
    { key: 'assets_models_unknown', icon: '❓', list: items.assets_models_unknown.map(a => ({
        href: '#/activos/' + a.id, main: esc(a.name), sub: `${esc(a.code)} · ${esc(a.branch_name)}`, tag: t('usage_' + a.ai_usage) })) },
    { key: 'instances_without_asset', icon: '📍', list: items.instances_without_asset.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.code)} · ${esc(i.branch_name)}`, tag: t('action_assign_asset') })) },
    { key: 'reviews_overdue', icon: '📅', list: items.reviews_overdue.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${esc(i.code)}`,
        tag: t('review_was_due').replace('{d}', esc(i.next_review_date)) })) },
    { key: 'black_box_models', icon: '⬛', list: items.black_box_models.map(m => ({
        href: '#/modelos/' + m.id, main: esc(m.name), sub: `${esc(m.code)} · ${esc(m.vendor)}`,
        tag: modelTag(m.vendor_questionnaire_received ? t('questionnaire_answered')
          : m.vendor_questionnaire_sent_at ? t('questionnaire_waiting').replace('{d}', esc(m.vendor_questionnaire_sent_at)) : t('questionnaire_not_sent')) })) },
    { key: 'fields_pending', icon: '⏳', list: items.fields_pending.map(fieldItem) },
    { key: 'fields_not_provided', icon: '🚫', list: items.fields_not_provided.map(fieldItem) }
  ];
}

function viewPending() {
  const key = S.division;
  if (!S.pending || S.pending.key !== key) loadPending(key);
  const p = S.pending;
  if (p.loading || (!p.data && !p.error)) return `<div class="card empty">${t('loading')}</div>`;
  if (p.error) return `<div class="card empty">${t('data_error')}</div>`;
  const { counts, items } = p.data;
  if (!counts.total) return `<div class="card empty">${t('nothing_pending')}</div>`;
  const groups = pendingGroups(items).filter(g => g.list.length);

  return `
    <p class="count-note">${t('pending_help').replace('{n}', counts.total)}</p>
    <div class="tiles pend-tiles">${groups.map(g => `
      <a class="tile" href="javascript:void(0)" onclick="document.getElementById('pg-${g.key}').scrollIntoView({behavior:'smooth'})">
        <b>${g.list.length}</b>${g.icon} ${t('pend_' + g.key)}</a>`).join('')}
    </div>
    ${groups.map(g => `
      <div class="card mt" id="pg-${g.key}">
        <h3>${g.icon} ${t('pend_' + g.key)} <span class="badge-inline">${g.list.length}</span></h3>
        <p class="count-note">${t('pend_help_' + g.key)}</p>
        <div class="pend-list">${g.list.map(x => `
          <a class="pend-item" href="${x.href}">
            <span class="pend-main"><b>${x.main}</b><small>${x.sub}</small></span>
            <span class="chip c-a">${x.tag}</span><span class="arrow">›</span></a>`).join('')}
        </div>
      </div>`).join('')}`;
}
