// ============================================================
// BION · Plataforma — Dashboard (gráficos)
// Ruta: #/dashboard · API: /api/dashboard?division=&period=30d|90d|12m
// Diseño: docs/dashboard.md. Colores validados contra el panel #1F3D68
// (incidentes azul, graves naranjo; riesgo = un tono de Bajo a Crítico).
// Se carga antes de app.js; usa sus funciones solo al ejecutarse.
// ============================================================

const DB_C = { inc: '#338ced', ser: '#e76624', grid: '#2E4E7A', axis: '#4A6A99', ink: '#EAF0FF', ink2: '#8899CC', surf: '#1F3D68', tip: '#0F1B33',
  risk: { Low: '#b05a35', Medium: '#d66b3d', High: '#f2875a', Critical: '#ffb592' } };
const DB_RISKS = ['Critical', 'High', 'Medium', 'Low'];
const DB_PERIODS = ['30d', '90d', '12m'];

function dashPeriod() { return DB_PERIODS.includes(S.dashPeriod) ? S.dashPeriod : '12m'; }
function setDashPeriod(p) { S.dashPeriod = p; S.dashTable = false; render(); }
function toggleDashTable() { S.dashTable = !S.dashTable; render(); }

async function loadDashboard(key) {
  S.dash = { key, loading: true };
  const q = new URLSearchParams({ period: dashPeriod() });
  if (divisionParam()) q.set('division', divisionParam());
  try { S.dash = { key, data: await apiGet('/api/dashboard?' + q) }; }
  catch (e) { if (!S.user) return; S.dash = { key, error: true }; }
  if (S.route === 'dashboard') render();
}

// Etiqueta de cada punto de la tendencia: mes ("oct") o semana ("05-10")
function dashPointLabel(start, unit, long = false) {
  const d = new Date(start + 'T00:00:00Z');
  if (unit === 'month') return d.toLocaleDateString(LANG === 'es' ? 'es-CL' : 'en-US', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' }).replace('.', '');
  const dm = start.slice(8, 10) + '-' + start.slice(5, 7);
  return long ? t('db_week_of').replace('{d}', dm) : dm;
}

// Variación respecto del período anterior: más incidentes = peor (▲ rojo), menos = mejor (▼ verde)
function dashDelta(cur, prev) {
  if (cur === prev) return `<div class="db-d">${t('db_same_prev')}</div>`;
  const up = cur > prev, diff = Math.abs(cur - prev);
  const txt = prev ? t('db_pct_prev').replace('{p}', Math.round(100 * diff / prev)) : t('db_n_prev').replace('{n}', diff);
  return `<div class="db-d ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${txt}</div>`;
}

// Mini curva de las tarjetas (sin ejes; decorativa, el número va al lado)
function dashSpark(vals, col) {
  if (vals.length < 2) return '';
  const w = 110, h = 34, max = Math.max(1, ...vals), x = i => i * w / (vals.length - 1), y = v => h - 4 - (h - 8) * v / max;
  return `<svg class="db-spark" viewBox="0 0 ${w + 6} ${h}" width="${w + 6}" height="${h}" aria-hidden="true">
    <path d="${vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3.5" fill="${col}"/></svg>`;
}

// Curva de incidentes: 2 series, grilla tenue, etiquetas al final; detalle al pasar el cursor
function dashLineChart(trend) {
  const pts = trend.points, n = pts.length;
  // En celular, un lienzo más angosto para que el texto se lea
  const narrow = window.innerWidth < 600;
  const W = narrow ? 360 : 640, H = narrow ? 220 : 240, L = 26, R = narrow ? 82 : 96, T = 12, B = 26;
  const max = Math.max(4, ...pts.map(p => p.incidents));
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
  const top = Math.ceil(max / step) * step;
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1)), y = v => T + (H - T - B) * (1 - v / top);
  const path = k => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${v ? DB_C.grid : DB_C.axis}"/>
    <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${DB_C.ink2}">${v}</text>`).join('');
  const every = n > (narrow ? 7 : 14) ? 2 : 1;
  const xl = pts.map((p, i) => i % every ? '' : `<text x="${x(i)}" y="${H - 7}" text-anchor="middle" font-size="11" fill="${DB_C.ink2}">${esc(dashPointLabel(p.start, trend.unit))}</text>`).join('');
  const last = pts[n - 1];
  const yInc = y(last.incidents), ySer = y(last.serious), gap = Math.abs(yInc - ySer) < 16 ? 16 - Math.abs(yInc - ySer) : 0;
  const end = (v, yy, col, label, dy) => `<circle cx="${x(n - 1)}" cy="${yy}" r="4.5" fill="${col}" stroke="${DB_C.surf}" stroke-width="2"/>
    <text x="${x(n - 1) + 10}" y="${yy + 4 + dy}" font-size="12" fill="${DB_C.ink}"><tspan font-weight="700">${v}</tspan> ${label}</text>`;
  // Zonas para el cursor (más anchas que la marca)
  const zw = (W - L - R) / Math.max(1, n - 1);
  const zones = pts.map((p, i) => `<rect x="${x(i) - zw / 2}" y="${T}" width="${zw}" height="${H - T - B}" fill="transparent"
    onmouseenter="dashTip(${i})" onmousemove="dashTip(${i})"/>`).join('');
  S.dashPts = { pts, unit: trend.unit, x: pts.map((p, i) => x(i)), yi: pts.map(p => y(p.incidents)), ys: pts.map(p => y(p.serious)), W };
  return `<div class="db-chart" onmouseleave="dashTipHide()">
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(t('db_trend_title'))}">
      ${grid}${xl}
      <path d="${path('incidents')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${DB_C.inc}" opacity=".12"/>
      <path d="${path('incidents')}" fill="none" stroke="${DB_C.inc}" stroke-width="2" stroke-linejoin="round"/>
      <path d="${path('serious')}" fill="none" stroke="${DB_C.ser}" stroke-width="2" stroke-linejoin="round"/>
      ${end(last.incidents, yInc, DB_C.inc, t('db_incidents_short'), yInc <= ySer ? -gap / 2 : gap / 2)}
      ${end(last.serious, ySer, DB_C.ser, t('db_serious_short'), ySer < yInc ? -gap / 2 : gap / 2)}
      <g id="dbCross" style="display:none"><line id="dbCrossL" y1="${T}" y2="${y(0)}" stroke="${DB_C.ink2}" stroke-dasharray="3 3"/>
        <circle id="dbCrossI" r="4.5" fill="${DB_C.inc}" stroke="${DB_C.surf}" stroke-width="2"/><circle id="dbCrossS" r="4.5" fill="${DB_C.ser}" stroke="${DB_C.surf}" stroke-width="2"/></g>
      ${zones}
    </svg>
    <div class="db-tip" id="dbTip" role="status" aria-live="polite"></div></div>`;
}

// Detalle al pasar el cursor: mueve la cruz y el globo sin volver a dibujar la página
function dashTip(i) {
  const d = S.dashPts, tip = document.getElementById('dbTip'), svg = document.querySelector('.db-chart svg');
  if (!d || !tip || !svg) return;
  const p = d.pts[i], scale = svg.getBoundingClientRect().width / d.W;
  document.getElementById('dbCross').style.display = '';
  document.getElementById('dbCrossL').setAttribute('x1', d.x[i]); document.getElementById('dbCrossL').setAttribute('x2', d.x[i]);
  for (const [id, yy] of [['dbCrossI', d.yi[i]], ['dbCrossS', d.ys[i]]]) { const c = document.getElementById(id); c.setAttribute('cx', d.x[i]); c.setAttribute('cy', yy); }
  tip.innerHTML = `<b>${esc(dashPointLabel(p.start, d.unit, true))}</b>
    <span><i style="background:${DB_C.inc}"></i>${t('db_incidents')} <b>${p.incidents}</b></span>
    <span><i style="background:${DB_C.ser}"></i>${t('db_serious')} <b>${p.serious}</b></span>`;
  const left = d.x[i] * scale, right = i > d.pts.length / 2;
  tip.style.left = (right ? left - 12 : left + 12) + 'px';
  tip.style.transform = right ? 'translateX(-100%)' : 'none';
  tip.style.display = 'block';
}
function dashTipHide() {
  const tip = document.getElementById('dbTip'), c = document.getElementById('dbCross');
  if (tip) tip.style.display = 'none';
  if (c) c.style.display = 'none';
}

// Tabla de la tendencia (alternativa accesible al gráfico)
function dashTrendTable(trend) {
  return `<div class="tbl-wrap"><table class="db-ttable"><thead><tr><th>${t(trend.unit === 'month' ? 'db_month' : 'db_week')}</th><th class="n">${t('db_incidents')}</th><th class="n">${t('db_serious')}</th></tr></thead>
    <tbody>${trend.points.map(p => `<tr><td>${esc(dashPointLabel(p.start, trend.unit, true))}</td><td class="n">${p.incidents}</td><td class="n">${p.serious}</td></tr>`).join('')}</tbody></table></div>`;
}

// Riesgo por división: barras apiladas por nivel, 2px entre segmentos, número dentro si cabe
function dashRiskBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.total));
  return `<div class="db-rb">${rows.map(r => `<div class="db-rb-r">
      <span class="db-rb-n">${esc(r.name)}</span>
      <span class="db-rb-bar">${r.total ? DB_RISKS.filter(l => r[l]).map(l => `<span title="${esc(t('risk_' + l))}: ${r[l]}"
        style="flex:0 0 calc(${(88 * r[l] / max).toFixed(2)}% - 2px);background:${DB_C.risk[l]}">${r[l] / max > 0.06 ? r[l] : ''}</span>`).join('') : ''}
        <em>${r.total}</em></span></div>`).join('')}</div>`;
}

// Barras horizontales de una serie: incidentes por modelo
function dashModelBars(rows) {
  const max = Math.max(1, ...rows.map(r => r.incidents));
  return `<div class="db-mb">${rows.map(r => `<div class="db-mb-r"><span class="${r.model ? '' : 'dim'}">${r.model ? esc(r.model) : t('model_undetermined')}</span>
    <span class="db-mb-bar"><span style="width:${(100 * r.incidents / max).toFixed(1)}%"></span><b>${r.incidents}</b></span></div>`).join('')}</div>`;
}

// Barra de avance de un indicador de salud
function dashMeter(label, num, den, note) {
  const pct = den ? Math.round(100 * num / den) : null;
  return `<div class="db-mt"><div class="db-mt-h"><span>${label}</span><b>${pct === null ? '—' : pct + '%'}</b></div>
    <div class="db-mt-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct ?? 0}" aria-label="${esc(label)}"><span style="width:${pct ?? 0}%"></span></div>
    <small>${den ? note.replace('{n}', num).replace('{d}', den) : t('db_no_data_period')}</small></div>`;
}

function viewDashboard() {
  const key = S.division + '|' + dashPeriod();
  if (!S.dash || S.dash.key !== key) loadDashboard(key);
  const d = S.dash;
  const chips = `<div class="db-periods" role="group" aria-label="${t('db_period')}">${DB_PERIODS.map(p =>
    `<button class="${p === dashPeriod() ? 'on' : ''}" aria-pressed="${p === dashPeriod()}" aria-label="${t('db_p_' + p)}" onclick="setDashPeriod('${p}')">${t('db_c_' + p)}</button>`).join('')}</div>`;
  if (d.loading || (!d.data && !d.error)) return chips + `<div class="card empty">${t('loading')}</div>`;
  if (d.error) return chips + `<div class="card empty">${t('data_error')}</div>`;
  const { counts: c, risk_map, attention: at, recent_incidents, kpis: k, trend, by_model, health: h } = d.data;
  const per = t('db_p_' + dashPeriod());

  const tile = (href, n, label, extra, spark) => `<a class="db-kp" href="${href}"><div><b>${n}</b><small>${label}</small>${extra}</div>${spark || ''}</a>`;
  const from = d.data.period.from;
  const tiles = [
    tile(`#/incidentes?status=todos&from=${from}`, k.incidents, t('db_k_incidents').replace('{p}', per), dashDelta(k.incidents, k.incidents_prev), dashSpark(trend.points.map(p => p.incidents), DB_C.inc)),
    tile(`#/incidentes?status=todos&from=${from}`, k.serious, t('db_k_serious'), dashDelta(k.serious, k.serious_prev), dashSpark(trend.points.map(p => p.serious), DB_C.ser)),
    tile('#/modelos', c.high_risk, t('dash_high_risk_inst'), `<div class="db-d">${t('db_of_n_inst').replace('{n}', c.installations)}</div>`),
    tile('#/pendientes', c.pending, t('dash_pending'), `<div class="db-d">${t('db_pending_sub')}</div>`)
  ];

  const attItems = [
    ...at.serious_open_incidents.map(x => ({ href: '#/incidentes/' + x.id, main: esc(x.title),
      sub: `${esc(x.occurred_at)} · ${esc(x.asset_code)} · ${t('ist_' + x.status)}`, tag: sevChip(x.severity) })),
    ...at.reclassification_pending.map(i => ({ href: '#/instancias/' + i.id, main: esc(i.model_name),
      sub: `${esc(i.asset_code || t('asset_unassigned'))} · ${verLabel(i.version)}`, tag: `<span class="chip c-a">${t('reclass_pending')}</span>` })),
    ...at.reviews_overdue.map(i => ({ href: '#/instancias/' + i.id, main: esc(i.model_name),
      sub: `${esc(i.asset_code || t('asset_unassigned'))}`, tag: `<span class="chip c-r">${t('review_was_due').replace('{d}', esc(i.next_review_date))}</span>` }))
  ];
  const ATT_MAX = 5;
  const more = (at.totals.reclassification_pending - at.reclassification_pending.length) + (at.totals.reviews_overdue - at.reviews_overdue.length)
    + Math.max(0, attItems.length - ATT_MAX);
  attItems.splice(ATT_MAX);
  const recRows = recent_incidents.map(x => `
    <tr class="row" onclick="location.hash='#/incidentes/${esc(x.id)}'">
      <td class="nw">${esc(x.occurred_at)}</td><td><b>${esc(x.title)}</b><small>${esc(x.asset_code)}</small></td>
      <td>${x.model_name ? esc(x.model_name) + `<small>${verLabel(x.version)}</small>` : `<span class="chip c-a">${t('model_undetermined')}</span>`}</td>
      <td>${sevChip(x.severity)}</td></tr>`).join('');
  const hasRisk = risk_map.some(r => r.total);

  return `${chips}
    <div class="db-kpis">${tiles.join('')}</div>
    ${typeof dashLegisHtml === 'function' ? dashLegisHtml() : ''}
    <div class="db-g2">
      <div class="card db-card"><h3>${t('db_trend_title')}</h3><div class="db-sub">${t('db_trend_sub').replace('{p}', per)}</div>
        <div class="db-lg"><span><i style="background:${DB_C.inc}"></i>${t('db_incidents')}</span><span><i style="background:${DB_C.ser}"></i>${t('db_serious')}</span></div>
        ${S.dashTable ? dashTrendTable(trend) : dashLineChart(trend)}
        <div class="db-note">${S.dashTable ? '' : t('db_hover_help') + ' · '}<button class="db-link" onclick="toggleDashTable()">${t(S.dashTable ? 'db_view_chart' : 'db_view_table')}</button></div></div>
      <div class="card db-card"><h3>${t('dash_attention')}</h3>
        ${attItems.length ? `<div class="pend-list">${attItems.map(x => `
          <a class="pend-item" href="${x.href}"><span class="pend-main"><b>${x.main}</b><small>${x.sub}</small></span>${x.tag}<span class="arrow">›</span></a>`).join('')}</div>
          ${more > 0 ? `<p class="count-note"><a href="#/pendientes">${t('dash_more_pending').replace('{n}', more)}</a></p>` : ''}`
        : `<div class="empty small">${t('dash_attention_none')}</div>`}</div>
    </div>
    <div class="db-g2b">
      <div class="card db-card"><h3>${t('db_risk_title')}</h3><div class="db-sub">${t('db_risk_sub')}</div>
        <div class="db-lg">${DB_RISKS.map(l => `<span><i style="background:${DB_C.risk[l]}"></i>${t('risk_' + l)}</span>`).join('')}</div>
        ${hasRisk ? dashRiskBars(risk_map) : `<div class="empty small">${t('db_no_installations')}</div>`}</div>
      <div class="card db-card"><h3>${t('db_models_title')}</h3><div class="db-sub">${per}</div>
        ${by_model.length ? dashModelBars(by_model) : `<div class="empty small">${t('db_no_incidents_period')}</div>`}</div>
    </div>
    <div class="db-g2b">
      <div class="card db-card"><h3>${t('db_health_title')}</h3><div class="db-sub">${t('db_health_sub')}</div>
        ${dashMeter(t('db_h_actions'), h.actions_on_time, h.actions_done, t('db_h_actions_note'))}
        ${dashMeter(t('db_h_changes'), h.changes_reviewed, h.changes, t('db_h_changes_note'))}
        ${dashMeter(t('db_h_info'), h.installations_complete, h.installations, t('db_h_info_note'))}</div>
      <div class="card db-card"><h3>${t('dash_recent_incidents')}</h3>
        ${recRows ? `<div class="tbl-wrap"><table><thead><tr><th>${t('f_date')}</th><th>${t('f_title')}</th><th>${t('model')}</th><th>${t('f_severity')}</th></tr></thead>
          <tbody>${recRows}</tbody></table></div>` : `<div class="empty small">${t('no_incidents')}</div>`}</div>
    </div>`;
}

// ── Línea rotativa de legislación (normas de IA; BD maestra) ──
// Una norma a la vez: primero las del país de la empresa. Rota sola cada 7 s, se pausa con el cursor
// o el foco, y no rota si el sistema pide reducir el movimiento.
const DB_LEGIS_MS = 7000;

async function loadLegislation(key) {
  S.legis = { key, loading: true, items: [] };
  try { const r = await apiGet('/api/dashboard?legislation=1'); S.legis = { key, items: r.items || [] }; }
  catch (e) { if (!S.user) return; S.legis = { key, items: [] }; }
  if (S.route === 'dashboard') render();
}

function dashLegisHtml() {
  const key = S.user.email;
  if (!S.legis || S.legis.key !== key) { loadLegislation(key); return ''; }
  const items = S.legis.items;
  if (!items.length) return '';
  S.legisIdx = (S.legisIdx || 0) % items.length;
  return `<section class="db-legis" id="dbLegis" aria-label="${t('lg_title')}"
      onmouseenter="S.legisPaused=true" onmouseleave="S.legisPaused=false" onfocusin="S.legisPaused=true" onfocusout="S.legisPaused=false">
    <b class="lg-h">⚖ ${t('lg_title')}</b>
    <div class="lg-body" id="dbLegisBody">${legisItemHtml(items[S.legisIdx])}</div>
    <div class="lg-nav">
      <button type="button" onclick="legisGo(-1)" aria-label="${t('lg_prev')}">‹</button>
      <span class="lg-dots" id="dbLegisDots">${legisDots(items.length, S.legisIdx)}</span>
      <button type="button" onclick="legisGo(1)" aria-label="${t('lg_next')}">›</button>
    </div>
    <a class="lg-all" href="#/reportes/iso">${t('lg_overview')}</a>
  </section>`;
}

// Estado de la norma: en tramitación · vigente · plazo DD-MM-AAAA
function legisStatus(x) {
  const st = ['tramitacion', 'vigente', 'plazo'].includes(x.status) ? x.status : 'vigente';
  const date = x.key_date ? x.key_date.split('-').reverse().join('-') : '';
  return `<span class="lg-st lg-${st}">${t('lg_st_' + st)}${st === 'plazo' && date ? ' ' + date : ''}</span>`;
}

function legisItemHtml(x) {
  const full = [x.title, x.description, x.applies_to ? t('lg_applies').replace('{a}', x.applies_to) : ''].filter(Boolean).join(' — ');
  return `<span class="lg-country">${esc(x.country)}</span>${legisStatus(x)}
    <span class="lg-text" title="${esc(full)}"><b>${esc(x.title)}:</b> ${esc(x.description || '')}
      ${x.applies_to ? `<span class="lg-applies">${esc(t('lg_applies').replace('{a}', x.applies_to))}</span>` : ''}</span>
    ${x.url ? `<a class="lg-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${t('lg_view')}</a>` : ''}`;
}

const legisDots = (n, i) => Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');

// Cambia de norma sin volver a dibujar la página
function legisShow(i, announce) {
  const items = S.legis && S.legis.items, body = document.getElementById('dbLegisBody');
  if (!items || !items.length || !body) return;
  S.legisIdx = (i + items.length) % items.length;
  body.innerHTML = legisItemHtml(items[S.legisIdx]);
  body.setAttribute('aria-live', announce ? 'polite' : 'off');
  document.getElementById('dbLegisDots').innerHTML = legisDots(items.length, S.legisIdx);
}
function legisGo(step) { legisShow((S.legisIdx || 0) + step, true); }

setInterval(() => {
  if (S.route !== 'dashboard' || S.legisPaused || document.hidden) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('dbLegis')) legisShow((S.legisIdx || 0) + 1, false);
}, DB_LEGIS_MS);
