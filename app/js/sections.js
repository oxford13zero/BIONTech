// ============================================================
// BION · Plataforma — secciones y campos de la ficha del sistema
// Cada sección: data = clave en la respuesta de /api/client-record
//               table = tabla en la BD (para editar, paso 5c)
// Cada campo: [columna, etiqueta ES, etiqueta EN, formato opcional]
// Formatos: scale5, seconds, usd, pct, bool
// ============================================================

// Sección F según el grupo del sistema (1 a 4)
const RISK_SECTION_BY_GROUP = { 1: 'F_op', 2: 'F_dec', 3: 'F_str', 4: 'F_hu' };

const SECTIONS = [
  { id: 'A', data: 'sys', table: 'ai_systems', color: '#378ADD',
    title: { es: 'A — Identificación', en: 'A — Identification' }, fields: [
    ['system_code', 'Código del sistema', 'System code'],
    ['vendor', 'Proveedor', 'Vendor'],
    ['version', 'Versión', 'Version'],
    ['deploy_date', 'Fecha de despliegue', 'Deploy date'],
    ['responsible_person', 'Persona responsable', 'Responsible person'],
    ['responsible_area', 'Área responsable', 'Responsible area'],
    ['operational_location', 'Ubicación operacional', 'Operational location'],
    ['country', 'País', 'Country'],
    ['next_review_date', 'Próxima revisión', 'Next review date'],
    ['autonomy_level', 'Nivel de autonomía', 'Autonomy level', 'scale5'],
    ['eu_ai_act_risk_category', 'Categoría EU AI Act', 'EU AI Act category'],
    ['environment', 'Entorno', 'Environment'],
    ['infrastructure_provider', 'Proveedor de infraestructura', 'Infrastructure provider'],
    ['shadow_ai_label', 'Etiqueta Shadow AI', 'Shadow AI label'],
    ['risk_score_total', 'Puntaje de riesgo total', 'Risk score total', 'number'],
    ['deployment_status', 'Estado de despliegue', 'Deployment status']
  ] },
  { id: 'B', data: 'func', table: 'sec_functional', color: '#5DCAA5',
    title: { es: 'B — Descripción funcional', en: 'B — Functional description' }, fields: [
    ['main_function', 'Función principal', 'Main function'],
    ['autonomous_decision', 'Decisión autónoma', 'Autonomous decision'],
    ['decision_speed', 'Velocidad de decisión', 'Decision speed'],
    ['output_type', 'Tipo de salida', 'Output type'],
    ['output_format', 'Formato de salida', 'Output format'],
    ['execution_frequency', 'Frecuencia de ejecución', 'Execution frequency'],
    ['recommends_or_decides', 'Recomienda o decide', 'Recommends or decides'],
    ['who_acts_on_output', 'Quién actúa sobre la salida', 'Who acts on output'],
    ['impact_if_fails', 'Impacto si falla', 'Impact if fails'],
    ['affected_processes', 'Procesos afectados', 'Affected processes'],
    ['affected_equipment', 'Equipos afectados', 'Affected equipment'],
    ['people_in_impact_area', 'Personas en el área de impacto', 'People in impact area'],
    ['can_cause_physical_harm', 'Puede causar daño físico', 'Can cause physical harm'],
    ['feeds_public_reports', 'Alimenta informes públicos', 'Feeds public reports'],
    ['foreseeable_misuse', 'Mal uso previsible', 'Foreseeable misuse']
  ] },
  { id: 'C', data: 'reg', table: 'sec_regulatory', color: '#EF9F27',
    title: { es: 'C — Clasificación regulatoria', en: 'C — Regulatory classification' }, fields: [
    ['risk_level_chile', 'Nivel de riesgo (Chile)', 'Risk level (Chile)'],
    ['articles_chile', 'Artículos Chile', 'Articles Chile'],
    ['articles_peru', 'Artículos Perú', 'Articles Peru'],
    ['articles_brazil', 'Artículos Brasil', 'Articles Brazil'],
    ['applies_sernageomin', 'Aplica SERNAGEOMIN', 'Applies SERNAGEOMIN'],
    ['requires_human_supervision', 'Requiere supervisión humana', 'Requires human supervision'],
    ['additional_regulations', 'Regulaciones adicionales', 'Additional regulations'],
    ['nist_alignment', 'Alineación NIST', 'NIST alignment'],
    ['nist_functions', 'Funciones NIST', 'NIST functions'],
    ['oecd_alignment', 'Alineación OCDE', 'OECD alignment'],
    ['oecd_principles', 'Principios OCDE', 'OECD principles'],
    ['iso42001_alignment', 'Alineación ISO 42001', 'ISO 42001 alignment'],
    ['iso42001_principles', 'Principios ISO 42001', 'ISO 42001 principles'],
    ['other_frameworks', 'Otros marcos', 'Other frameworks'],
    ['eu_ai_act_article', 'Artículo EU AI Act', 'EU AI Act article reference'],
    ['gpai_flag', 'Modelo de propósito general (GPAI)', 'GPAI flag']
  ] },
  { id: 'D', data: 'dat', table: 'sec_data_engineering', color: '#D4537E',
    title: { es: 'D — Datos e ingeniería', en: 'D — Data & engineering' }, fields: [
    ['model_type', 'Tipo de modelo', 'Model type'],
    ['training_data_sources', 'Fuentes de datos de entrenamiento', 'Training data sources'],
    ['training_data_volume', 'Volumen de datos de entrenamiento', 'Training data volume'],
    ['production_input_data', 'Datos de entrada en producción', 'Production input data'],
    ['includes_personal_data', 'Incluye datos personales', 'Includes personal data'],
    ['includes_sensitive_data', 'Incluye datos sensibles', 'Includes sensitive data'],
    ['includes_community_data', 'Incluye datos de comunidades', 'Includes community data'],
    ['includes_confidential_data', 'Incluye datos confidenciales', 'Includes confidential data'],
    ['last_retrain_date', 'Último reentrenamiento', 'Last retrain date'],
    ['retrain_frequency', 'Frecuencia de reentrenamiento', 'Retrain frequency'],
    ['data_quality_control', 'Control de calidad de datos', 'Data quality control'],
    ['data_owner', 'Dueño de los datos', 'Data owner'],
    ['vendor_provides_tech_access', 'Proveedor da acceso técnico', 'Vendor provides tech access'],
    ['data_stored_on_provider', 'Datos almacenados en el proveedor', 'Data stored on provider'],
    ['data_processing_region', 'Región de procesamiento', 'Data processing region'],
    ['data_processing_agreement', 'Acuerdo de tratamiento de datos', 'Data processing agreement'],
    ['data_transfer_location', 'Lugar de transferencia de datos', 'Data transfer location']
  ] },
  { id: 'E', data: 'perf', table: 'sec_performance', color: '#97C459',
    title: { es: 'E — Desempeño y sesgo', en: 'E — Performance & bias' }, fields: [
    ['performance_metrics', 'Métricas de desempeño', 'Performance metrics'],
    ['baseline_comparison', 'Comparación con línea base', 'Baseline comparison'],
    ['drift_monitoring', 'Monitoreo de deriva', 'Drift monitoring'],
    ['last_performance_report', 'Último informe de desempeño', 'Last performance report'],
    ['bias_evaluated', 'Sesgo evaluado', 'Bias evaluated'],
    ['bias_type', 'Tipo de sesgo', 'Bias type'],
    ['bias_result', 'Resultado de sesgo', 'Bias result'],
    ['independent_validation', 'Validación independiente', 'Independent validation'],
    ['incident_count', 'Cantidad de incidentes', 'Incident count', 'number'],
    ['incident_reporting_process', 'Proceso de reporte de incidentes', 'Incident reporting process']
  ] },
  { id: 'F_op', data: 'riskOp', table: 'sec_risk_operational', color: '#E24B4A',
    title: { es: 'F — Riesgo operacional', en: 'F — Operational risk' }, fields: [
    ['human_override_exists', 'Existe anulación humana', 'Human override'],
    ['override_response_time_sec', 'Tiempo de respuesta de anulación', 'Override response time', 'seconds'],
    ['failure_mode', 'Modo de falla', 'Failure mode'],
    ['incidents_recorded', 'Incidentes registrados', 'Incidents recorded'],
    ['review_frequency', 'Frecuencia de revisión', 'Review frequency'],
    ['last_review_date', 'Última revisión', 'Last review date']
  ] },
  { id: 'F_dec', data: 'riskDec', table: 'sec_risk_decision', color: '#EF9F27',
    title: { es: 'F — Riesgo de decisión', en: 'F — Decision risk' }, fields: [
    ['human_validation_exists', 'Existe validación humana', 'Human validation exists'],
    ['validation_process_desc', 'Proceso de validación', 'Validation process'],
    ['decision_log_exists', 'Existe registro de decisiones', 'Decision log exists'],
    ['incidents_attributed', 'Incidentes atribuidos', 'Incidents attributed'],
    ['review_frequency', 'Frecuencia de revisión', 'Review frequency']
  ] },
  { id: 'F_str', data: 'riskStr', table: 'sec_risk_strategic', color: '#7F77DD',
    title: { es: 'F — Riesgo estratégico', en: 'F — Strategic risk' }, fields: [
    ['geological_validation', 'Validación geológica', 'Geological validation'],
    ['used_in_reserve_reports', 'Usado en informes de reservas', 'Used in reserve reports'],
    ['influences_public_investment', 'Influye en inversión pública', 'Influences public investment'],
    ['community_communication', 'Comunicación con comunidades', 'Community communication'],
    ['committed_investment_usd', 'Inversión comprometida (USD)', 'Committed investment (USD)', 'usd']
  ] },
  { id: 'F_hu', data: 'riskHu', table: 'sec_risk_human_use', color: '#5DCAA5',
    title: { es: 'F — Uso humano y propiedad intelectual', en: 'F — Human use & IP' }, fields: [
    ['use_policy_exists', 'Existe política de uso', 'Use policy exists'],
    ['employees_signed_policy_pct', 'Empleados que firmaron la política', 'Employees signed policy', 'pct'],
    ['mandatory_training', 'Capacitación obligatoria', 'Mandatory training'],
    ['trained_employees_pct', 'Empleados capacitados', 'Trained employees', 'pct'],
    ['misuse_cases_detected', 'Casos de mal uso detectados', 'Misuse cases detected'],
    ['ai_allowed_legal_docs', 'IA permitida en documentos legales', 'AI allowed in legal docs'],
    ['ai_allowed_regulator_reports', 'IA permitida en informes al regulador', 'AI allowed in regulator reports']
  ] },
  { id: 'G', data: 'comp', table: 'sec_compliance_docs', color: '#F4C38B',
    title: { es: 'G — Documentación de cumplimiento', en: 'G — Compliance documentation' }, fields: [
    ['algorithmic_impact_assessment', 'Evaluación de impacto algorítmico', 'Algorithmic impact assessment'],
    ['decision_log_exists', 'Existe registro de decisiones', 'Decision log exists'],
    ['log_externally_auditable', 'Registro auditable externamente', 'Log externally auditable'],
    ['next_regulatory_review', 'Próxima revisión regulatoria', 'Next regulatory review'],
    ['compliance_status', 'Estado de cumplimiento', 'Compliance status'],
    ['compliance_responsible', 'Responsable de cumplimiento', 'Compliance responsible'],
    ['technical_docs_exist', 'Existe documentación técnica', 'Technical docs exist'],
    ['docs_accessible_for_audit', 'Documentos accesibles para auditoría', 'Docs accessible for audit'],
    ['approved_use_policy', 'Política de uso aprobada', 'Approved use policy'],
    ['board_informed', 'Directorio informado', 'Board informed'],
    ['market_regulator_disclosure', 'Divulgación al regulador de mercado', 'Market regulator disclosure'],
    ['next_contract_renewal', 'Próxima renovación de contrato', 'Next contract renewal'],
    ['fria_completed', 'Evaluación de derechos fundamentales (FRIA)', 'FRIA completed']
  ] },
  { id: 'H', data: 'acct', table: 'sec_accountability', color: '#9B72CF',
    title: { es: 'H — Responsabilidad y gobierno', en: 'H — Accountability & governance' }, fields: [
    ['ai_owner_business', 'Dueño de IA (negocio)', 'AI owner (business)'],
    ['ai_owner_technical', 'Dueño de IA (técnico)', 'AI owner (technical)'],
    ['eu_ai_act_role', 'Rol según EU AI Act', 'EU AI Act role'],
    ['approved_by', 'Aprobado por', 'Approved by'],
    ['approval_date', 'Fecha de aprobación', 'Approval date'],
    ['ethics_reviewer', 'Revisor ético', 'Ethics reviewer'],
    ['data_protection_contact', 'Contacto de protección de datos', 'Data protection contact'],
    ['escalation_contact', 'Contacto de escalamiento', 'Escalation contact'],
    ['board_informed', 'Directorio / comité informado', 'Board / committee informed'],
    ['review_cycle', 'Ciclo de revisión', 'Review cycle']
  ] },
  { id: 'M2', data: 'riskAss', table: 'risk_assessments', color: '#7F77DD',
    title: { es: 'M2 — Evaluación de riesgo', en: 'M2 — Risk assessment' }, fields: [
    ['assessment_code', 'Código de evaluación', 'Assessment code'],
    ['methodology', 'Metodología', 'Methodology'],
    ['probability_scale', 'Escala de probabilidad', 'Probability scale'],
    ['residual_risk_level', 'Riesgo residual', 'Residual risk level'],
    ['mitigation_controls', 'Controles de mitigación', 'Mitigation controls'],
    ['contingency_plan', 'Plan de contingencia', 'Contingency plan'],
    ['next_mandatory_review', 'Próxima revisión obligatoria', 'Next mandatory review'],
    ['evaluator_name', 'Evaluador', 'Evaluator'],
    ['management_approval_name', 'Aprobación de gerencia', 'Management approval'],
    ['drift_status', 'Estado de deriva', 'Drift status'],
    ['monitoring_frequency', 'Frecuencia de monitoreo', 'Monitoring frequency']
  ] },
  { id: 'M4', data: 'superv', table: 'human_supervision', color: '#378ADD',
    title: { es: 'M4 — Supervisión humana', en: 'M4 — Human supervision' }, fields: [
    ['autonomy_level_approved', 'Nivel de autonomía aprobado', 'Approved autonomy level', 'scale5'],
    ['autonomy_approved_by', 'Aprobado por', 'Approved by'],
    ['kill_switch_mechanism', 'Mecanismo de parada', 'Kill switch mechanism'],
    ['kill_switch_response_time_sec', 'Tiempo de respuesta de parada', 'Kill switch response', 'seconds'],
    ['kill_switch_last_tested', 'Última prueba de parada', 'Last kill switch test'],
    ['kill_switch_test_result', 'Resultado de la prueba', 'Test result'],
    ['kill_switch_next_test', 'Próxima prueba de parada', 'Next kill switch test'],
    ['escalation_thresholds', 'Umbrales de escalamiento', 'Escalation thresholds'],
    ['override_auto_logged', 'Anulaciones registradas automáticamente', 'Override auto-logged', 'bool'],
    ['override_audit_frequency', 'Frecuencia de auditoría de anulaciones', 'Override audit frequency'],
    ['degraded_mode_behavior', 'Comportamiento en modo degradado', 'Degraded mode behavior']
  ] },
  { id: 'M6', data: 'incidents', table: 'incidents', many: true, color: '#E24B4A',
    title: { es: 'M6 — Incidentes', en: 'M6 — Incidents' }, fields: [
    ['incident_code', 'Código de incidente', 'Incident code'],
    ['incident_type', 'Tipo', 'Type'],
    ['status', 'Estado', 'Status'],
    ['description', 'Descripción', 'Description'],
    ['root_cause_technical', 'Causa raíz técnica', 'Root cause (technical)'],
    ['root_cause_organizational', 'Causa raíz organizacional', 'Root cause (organizational)'],
    ['requires_regulator_notification', 'Requiere notificar al regulador', 'Regulator notification', 'bool'],
    ['regulator_authority', 'Autoridad reguladora', 'Regulator authority'],
    ['notification_deadline', 'Plazo de notificación', 'Notification deadline'],
    ['lessons_learned', 'Lecciones aprendidas', 'Lessons learned']
  ] },
  { id: 'M7', data: 'integrations', table: 'system_integrations', many: true, color: '#97C459',
    title: { es: 'M7 — Integraciones', en: 'M7 — System integrations' }, fields: [
    ['integration_name', 'Integración', 'Integration'],
    ['vendor', 'Proveedor', 'Vendor'],
    ['integration_type', 'Tipo', 'Type'],
    ['auth_method', 'Método de autenticación', 'Auth method'],
    ['sync_frequency', 'Frecuencia de sincronización', 'Sync frequency'],
    ['last_sync_at', 'Última sincronización', 'Last sync'],
    ['last_sync_status', 'Estado de la última sincronización', 'Last sync status'],
    ['offline_capable', 'Funciona sin conexión', 'Offline capable', 'bool'],
    ['priority', 'Prioridad', 'Priority']
  ] }
];

// Secciones a mostrar para un sistema: todas menos las F que no corresponden a su grupo
function sectionsFor(sys) {
  const riskId = RISK_SECTION_BY_GROUP[Number(sys.inventory_group)];
  return SECTIONS.filter(s => !s.id.startsWith('F_') || s.id === riskId);
}

// Valores permitidos por la BD (restricciones CHECK) → se editan con lista desplegable
const FIELD_OPTIONS = {
  environment:             ['Cloud', 'On-premise', 'Edge', 'Hybrid'],
  autonomy_level:          ['1', '2', '3', '4', '5'],
  autonomy_level_approved: ['1', '2', '3', '4', '5'],
  residual_risk_level:     ['Aceptable', 'Condicional', 'No aceptable'],
  drift_status:            ['OK', 'Warning', 'Alert'],
  kill_switch_test_result: ['Aprobado', 'Fallido', 'Pendiente'],
  eu_ai_act_role:          ['Provider', 'Deployer', 'Distributor'],
  last_sync_status:        ['OK', 'Warning', 'Error', 'Never'],
  priority:                ['CRÍTICA', 'ALTA', 'MEDIA', 'BAJA']
};

// Columnas de tipo fecha
const DATE_FIELDS = [
  'deploy_date', 'next_review_date', 'last_retrain_date', 'last_performance_report', 'last_review_date',
  'next_regulatory_review', 'next_contract_renewal', 'approval_date', 'next_mandatory_review',
  'kill_switch_last_tested', 'kill_switch_next_test', 'notification_deadline'
];
