// ============================================================
// Reglas comunes de activos, modelos e instancias
// Diseño: docs/activos-y-modelos.md
// ============================================================

const ASSET_TYPES  = ['equipo', 'instalacion', 'proceso'];
const AI_USAGE     = ['usa_ia', 'modelos_por_identificar', 'por_confirmar'];
const RISK_LEVELS  = ['Critical', 'High', 'Medium', 'Low'];
const RISK_ORDER   = { Low: 1, Medium: 2, High: 3, Critical: 4 };

// Campos editables de un activo
const ASSET_FIELDS = [
  'code', 'name', 'asset_type', 'branch_id', 'manufacturer', 'equipment_model',
  'area', 'ai_usage', 'commissioned_at', 'notes'
];

// Campos editables de un modelo (proveedor) — sección 3 del diseño, columna M
const MODEL_FIELDS = [
  'name', 'vendor', 'suggested_group', 'base_risk_level', 'black_box',
  'vendor_questionnaire_sent_at', 'vendor_questionnaire_received',
  'main_function', 'output_type', 'output_format', 'gpai_flag',
  'model_type', 'training_data_sources', 'training_data_volume', 'last_retrain_date', 'retrain_frequency',
  'data_quality_control', 'vendor_provides_tech_access', 'data_stored_on_provider', 'data_processing_region',
  'data_processing_agreement', 'data_transfer_location',
  'performance_metrics', 'baseline_comparison', 'bias_evaluated', 'bias_type', 'bias_result', 'independent_validation',
  'technical_docs_exist', 'ce_marking_declared', 'annex_iv_complete', 'next_contract_renewal'
];

// Campos de uso de una instancia — sección 3 del diseño, columna I
const INSTANCE_FIELDS = [
  'inventory_group', 'risk_level', 'compliance_status',
  // A
  'responsible_person', 'responsible_area', 'operational_location', 'country', 'next_review_date',
  'autonomy_level', 'eu_ai_act_risk_category', 'environment', 'infrastructure_provider', 'shadow_ai_label',
  'risk_score_total', 'deployment_status',
  // B
  'autonomous_decision', 'decision_speed', 'execution_frequency', 'recommends_or_decides', 'who_acts_on_output',
  'impact_if_fails', 'affected_processes', 'affected_equipment', 'people_in_impact_area', 'can_cause_physical_harm',
  'feeds_public_reports', 'foreseeable_misuse',
  // C
  'risk_level_chile', 'articles_chile', 'articles_peru', 'articles_brazil', 'applies_sernageomin',
  'requires_human_supervision', 'additional_regulations', 'nist_alignment', 'nist_functions', 'oecd_alignment',
  'oecd_principles', 'iso42001_alignment', 'iso42001_principles', 'other_frameworks', 'eu_ai_act_article',
  // D
  'production_input_data', 'includes_personal_data', 'includes_sensitive_data', 'includes_community_data',
  'includes_confidential_data', 'data_owner',
  // E
  'drift_monitoring', 'last_performance_report', 'incident_reporting_process'
];

// Secciones de la instancia (1 fila por instancia)
const INSTANCE_SECTIONS = {
  risk_operational: { table: 'inst_risk_operational', fields: [
    'human_override_exists', 'override_response_time_sec', 'failure_mode', 'incidents_recorded', 'review_frequency', 'last_review_date'] },
  risk_decision: { table: 'inst_risk_decision', fields: [
    'human_validation_exists', 'validation_process_desc', 'decision_log_exists', 'incidents_attributed', 'review_frequency'] },
  risk_strategic: { table: 'inst_risk_strategic', fields: [
    'geological_validation', 'used_in_reserve_reports', 'influences_public_investment', 'community_communication', 'committed_investment_usd'] },
  risk_human_use: { table: 'inst_risk_human_use', fields: [
    'use_policy_exists', 'employees_signed_policy_pct', 'mandatory_training', 'trained_employees_pct', 'misuse_cases_detected',
    'ai_allowed_legal_docs', 'ai_allowed_regulator_reports'] },
  compliance: { table: 'inst_compliance', fields: [
    'algorithmic_impact_assessment', 'decision_log_exists', 'log_externally_auditable', 'next_regulatory_review',
    'compliance_responsible', 'docs_accessible_for_audit', 'approved_use_policy', 'board_informed', 'market_regulator_disclosure',
    'fria_completed', 'independent_review_completed', 'legal_review_completed', 'board_approval_required',
    'log_retention_months', 'log_integrity_method'] },
  accountability: { table: 'inst_accountability', fields: [
    'ai_owner_business', 'ai_owner_technical', 'eu_ai_act_role', 'approved_by', 'approval_date', 'ethics_reviewer',
    'data_protection_contact', 'escalation_contact', 'board_informed', 'review_cycle'] },
  risk_assessment: { table: 'inst_risk_assessment', fields: [
    'assessment_code', 'methodology', 'probability_scale', 'residual_risk_level', 'mitigation_controls', 'contingency_plan',
    'next_mandatory_review', 'evaluator_name', 'management_approval_name', 'drift_status', 'monitoring_frequency'] },
  human_supervision: { table: 'inst_human_supervision', fields: [
    'autonomy_level_approved', 'autonomy_approved_by', 'kill_switch_mechanism', 'kill_switch_response_time_sec',
    'kill_switch_last_tested', 'kill_switch_test_result', 'kill_switch_next_test', 'escalation_thresholds',
    'override_auto_logged', 'override_audit_frequency', 'degraded_mode_behavior'] }
};

// Sección F que corresponde a cada grupo
const RISK_SECTION_BY_GROUP = { 1: 'risk_operational', 2: 'risk_decision', 3: 'risk_strategic', 4: 'risk_human_use' };

// M7 — integraciones (varias por instancia)
const INTEGRATION_FIELDS = [
  'integration_name', 'vendor', 'integration_type', 'auth_method', 'sync_frequency', 'last_sync_at',
  'last_sync_status', 'offline_capable', 'priority', 'status'
];

// Estados de un dato (además de "informado")
const FIELD_STATES = ['pendiente', 'no_entregado'];

function badRequest(message) { return { status: 400, message }; }

// Mezcla cambios de estado de campos: { campo: 'pendiente' | 'no_entregado' | null (quitar) }
function mergeFieldStatus(current, changes, allowedFields) {
  if (changes === undefined) return undefined;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw badRequest('Invalid field_status');
  const out = { ...(current || {}) };
  for (const [k, v] of Object.entries(changes)) {
    if (!allowedFields.includes(k)) throw badRequest(`Field not allowed: ${k}`);
    if (v === null) delete out[k];
    else if (FIELD_STATES.includes(v)) out[k] = v;
    else throw badRequest(`Invalid field state: ${k}`);
  }
  return out;
}

// Riesgo de una instancia: nunca menor que el riesgo base del modelo
function assertRiskNotBelow(risk, base) {
  if (risk && base && RISK_ORDER[risk] < RISK_ORDER[base]) throw badRequest('Risk cannot be lower than the model base risk');
}

// Id de usuario válido para los campos "creado por" (si no es UUID, se guarda vacío)
const asUuid = v => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const today = () => new Date().toISOString().slice(0, 10);

function assertDate(v, field) {
  if (v !== null && v !== undefined && !isDate(v)) throw badRequest(`Invalid date: ${field}`);
}

function assertOneOf(v, list, field) {
  if (v !== null && v !== undefined && !list.includes(v)) throw badRequest(`Invalid value: ${field}`);
}

function assertGroup(v, field = 'inventory_group') {
  if (v === null || v === undefined) return;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw badRequest(`Invalid value: ${field}`);
}

// La división pertenece a la empresa
async function assertBranch(db, companyId, branchId) {
  if (!branchId) throw badRequest('Division required');
  const r = await db.query('SELECT id FROM branches WHERE id::text = $1 AND company_id = $2', [String(branchId), companyId]);
  if (!r.rows[0]) throw { status: 404, message: 'Division not found' };
}

// Versión más reciente publicada de un modelo
async function latestVersion(db, modelId) {
  const r = await db.query(
    `SELECT id FROM model_versions WHERE model_id = $1 ORDER BY released_at DESC, created_at DESC LIMIT 1`, [modelId]
  );
  return r.rows[0]?.id || null;
}

// Crea una instancia de un modelo en un activo (regla 1 del diseño):
// versión vigente del modelo, riesgo base del modelo y grupo sugerido (o el indicado).
async function createInstance(db, { companyId, modelId, assetId, branchId, installedAt, group, userId }) {
  const m = await db.query('SELECT id, base_risk_level, suggested_group, status FROM ai_models WHERE id::text = $1 AND company_id = $2',
    [String(modelId), companyId]);
  const model = m.rows[0];
  if (!model) throw { status: 404, message: 'Model not found' };
  if (model.status !== 'activo') throw badRequest('Model is retired');

  const inventoryGroup = group ?? model.suggested_group;
  if (!inventoryGroup) throw badRequest('Group required (the model has no suggested group)');
  assertGroup(inventoryGroup);
  const installed = installedAt || today();
  assertDate(installed, 'installed_at');

  const versionId = await latestVersion(db, model.id);
  const r = await db.query(
    `INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, code`,
    [companyId, model.id, assetId, branchId, Number(inventoryGroup), versionId, installed, model.base_risk_level]
  );
  const inst = r.rows[0];
  if (versionId) {
    await db.query(
      `INSERT INTO instance_versions (instance_id, version_id, valid_from, created_by) VALUES ($1, $2, $3, $4)`,
      [inst.id, versionId, installed, asUuid(userId)]
    );
  }
  return inst;
}

// Crea un modelo con ficha corta (y su primera versión si se indica)
async function createShortModel(db, { companyId, name, vendor, version, releasedAt, baseRisk, suggestedGroup, userId }) {
  if (!name || !String(name).trim() || !vendor || !String(vendor).trim()) throw badRequest('Model name and vendor required');
  assertOneOf(baseRisk ?? null, RISK_LEVELS, 'base_risk_level');
  assertGroup(suggestedGroup ?? null, 'suggested_group');
  assertDate(releasedAt ?? null, 'released_at');
  const r = await db.query(
    `INSERT INTO ai_models (company_id, name, vendor, base_risk_level, suggested_group) VALUES ($1, $2, $3, $4, $5) RETURNING id, code`,
    [companyId, String(name).trim(), String(vendor).trim(), baseRisk || null, suggestedGroup ? Number(suggestedGroup) : null]
  );
  const model = r.rows[0];
  if (version && String(version).trim()) {
    await db.query(
      `INSERT INTO model_versions (model_id, version, released_at, created_by) VALUES ($1, $2, $3, $4)`,
      [model.id, String(version).trim(), releasedAt || today(), asUuid(userId)]
    );
  }
  return model;
}

// Ejecuta fn dentro de una transacción; si algo falla, no queda nada a medias
async function inTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Errores de la BD → respuestas claras
function dbError(e) {
  if (e && e.status) return e;
  if (e && e.code === '23505') return { status: 409, message: 'Duplicate code' };
  if (e && e.code === '23514') return { status: 400, message: 'Invalid value' };
  if (e && e.code === '22P02') return { status: 400, message: 'Invalid value' };
  if (e && ['22007', '22008', '22003', '22001'].includes(e.code)) return { status: 400, message: 'Invalid value' };
  return e;
}

module.exports = {
  ASSET_TYPES, AI_USAGE, RISK_LEVELS, RISK_ORDER, ASSET_FIELDS,
  MODEL_FIELDS, INSTANCE_FIELDS, INSTANCE_SECTIONS, RISK_SECTION_BY_GROUP, INTEGRATION_FIELDS, FIELD_STATES,
  mergeFieldStatus, assertRiskNotBelow,
  badRequest, isDate, today, assertDate, assertOneOf, assertGroup, assertBranch,
  latestVersion, createInstance, createShortModel, inTransaction, dbError, asUuid
};
