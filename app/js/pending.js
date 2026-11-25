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
  // De la más urgente a la menos urgente
  return [
    { key: 'incident_actions_overdue', list: (items.incident_actions_overdue || []).map(a => ({
        href: '#/incidentes/' + a.id + '?tab=cierre', main: esc(a.action), sub: `${esc(a.title)} · ${esc(a.asset_code)} · ${esc(a.owner)}`,
        tag: t('review_was_due').replace('{d}', esc(a.due_date)) })) },
    { key: 'incidents_model_undetermined', list: items.incidents_model_undetermined.map(x => ({
        href: '#/incidentes/' + x.id, main: esc(x.title), sub: `${esc(x.occurred_at)} · ${esc(x.asset_code)}`, tag: t('action_assign_model') })) },
    { key: 'reclassification_pending', list: items.reclassification_pending.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${esc(i.code)} · ${verLabel(i.version)}`,
        tag: t('action_review_risk') })) },
    { key: 'reviews_overdue', list: items.reviews_overdue.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${esc(i.code)}`,
        tag: t('review_was_due').replace('{d}', esc(i.next_review_date)) })) },
    { key: 'assets_models_unknown', list: items.assets_models_unknown.map(a => ({
        href: '#/activos/' + a.id, main: esc(a.name), sub: `${esc(a.code)} · ${esc(a.branch_name)}`, tag: t('usage_' + a.ai_usage) })) },
    { key: 'instances_without_asset', list: items.instances_without_asset.map(i => ({
        href: '#/instancias/' + i.id, main: esc(i.model_name), sub: `${esc(i.code)} · ${esc(i.branch_name)}`, tag: t('action_assign_asset') })) }
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

  // Cada grupo es un acordeón (cerrado al inicio); se recuerda cuáles están abiertos
  const open = S.pendOpen || (S.pendOpen = {});
  return `
    <p class="count-note">${t('pending_help').replace('{n}', counts.total)}</p>
    <div class="acc-list">${groups.map(g => `
      <details class="acc" id="pg-${g.key}" ${open[g.key] ? 'open' : ''} ontoggle="S.pendOpen['${g.key}'] = this.open">
        <summary><span class="acc-title">${t('pend_' + g.key)}</span><span class="badge-inline">${g.list.length}</span><span class="arrow">›</span></summary>
        <div class="acc-body">
          <p class="count-note">${t('pend_help_' + g.key)}</p>
          <div class="pend-list">${g.list.map(x => `
            <a class="pend-item" href="${x.href}">
              <span class="pend-main"><b>${x.main}</b><small>${x.sub}</small></span>
              <span class="chip c-a">${x.tag}</span><span class="arrow">›</span></a>`).join('')}
          </div>
        </div>
      </details>`).join('')}
    </div>
    <p class="count-note mt"><a href="#/modelos">${t('pending_info_note')}</a></p>`;
}
