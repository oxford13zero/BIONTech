-- ============================================================
-- Datos de DEMOSTRACIÓN — activos, modelos e instancias
-- Ejecutar SOLO en la BD de prueba de Codelco, después de 002_activos_modelos.sql.
-- Los productos son reales; versiones, fechas e incidentes son INVENTADOS.
-- Si ya existe el activo CAEX-117, no hace nada.
-- ============================================================

DO $$
DECLARE
  v_company  UUID;
  v_norte    UUID;   -- división para los camiones
  v_plan     UUID;   -- división para el área de planificación
  -- modelos
  m_nav UUID; m_per UUID; m_dis UUID; m_neu UUID;
  -- versiones
  v_nav30 UUID; v_nav40 UUID; v_per0 UUID; v_per22 UUID; v_dis72 UUID; v_neu14 UUID; v_neu20 UUID;
  -- activos
  a_117 UUID; a_118 UUID; a_201 UUID; a_plan UUID; a_chan UUID;
  -- instancias del CAEX-117
  i117_nav UUID; i117_per UUID; i117_dis UUID; i117_neu UUID;
  i UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM assets WHERE code = 'CAEX-117') THEN
    RAISE NOTICE 'Los datos de demostración ya existen. No se hizo nada.';
    RETURN;
  END IF;

  SELECT company_id INTO v_company FROM branches WHERE status = 'active' LIMIT 1;
  IF v_company IS NULL THEN RAISE EXCEPTION 'No hay divisiones activas en esta base.'; END IF;
  SELECT id INTO v_norte FROM branches WHERE status = 'active' AND name ILIKE '%Norte%' LIMIT 1;
  IF v_norte IS NULL THEN SELECT id INTO v_norte FROM branches WHERE status = 'active' ORDER BY name LIMIT 1; END IF;
  SELECT id INTO v_plan FROM branches WHERE status = 'active' AND name ILIKE '%Santiago%' LIMIT 1;
  IF v_plan IS NULL THEN v_plan := v_norte; END IF;

  -- ── Modelos ────────────────────────────────────────────────
  INSERT INTO ai_models (company_id, name, vendor, suggested_group, base_risk_level, main_function, output_type, model_type)
  VALUES (v_company, 'Navegación autónoma FrontRunner', 'Komatsu', 1, 'Critical',
          'Conducción autónoma de camiones de extracción', 'Control del vehículo', 'Sistema de autonomía del proveedor')
  RETURNING id INTO m_nav;

  INSERT INTO ai_models (company_id, name, vendor, suggested_group, base_risk_level, black_box,
                         vendor_questionnaire_sent_at, main_function, field_status)
  VALUES (v_company, 'Percepción y detección de obstáculos', 'Komatsu', 1, 'Critical', true, '2019-06-01',
          'Detecta obstáculos en la ruta del camión',
          '{"model_type":"no_entregado","training_data_sources":"no_entregado","performance_metrics":"no_entregado"}')
  RETURNING id INTO m_per;

  INSERT INTO ai_models (company_id, name, vendor, suggested_group, base_risk_level, main_function, output_type)
  VALUES (v_company, 'Despacho de flota DISPATCH', 'Modular Mining', 1, 'Medium',
          'Asigna camiones a palas y destinos en tiempo real', 'Asignación de rutas')
  RETURNING id INTO m_dis;

  INSERT INTO ai_models (company_id, name, vendor, suggested_group, base_risk_level, main_function)
  VALUES (v_company, 'Monitoreo de neumáticos', 'TyreTech (ejemplo)', 1, 'Medium',
          'Predice desgaste y fallas de neumáticos')
  RETURNING id INTO m_neu;

  -- ── Versiones ──────────────────────────────────────────────
  INSERT INTO model_versions (model_id, version, released_at, change_notes)
    VALUES (m_nav, '3.0', '2019-05-01', 'Versión inicial instalada') RETURNING id INTO v_nav30;
  INSERT INTO model_versions (model_id, version, released_at, change_notes)
    VALUES (m_nav, '4.0', '2022-03-10', 'Nueva lógica de intersecciones y mayor velocidad en rampas') RETURNING id INTO v_nav40;
  INSERT INTO model_versions (model_id, version, released_at, change_notes)
    VALUES (m_per, 'Original', '2019-05-01', 'Versión instalada con el camión') RETURNING id INTO v_per0;
  INSERT INTO model_versions (model_id, version, released_at, change_notes, changes_unknown)
    VALUES (m_per, 'Actualización 2022-03', '2022-03-10', 'Incluida en el paquete FrontRunner 4.0; el proveedor no informó qué cambió', true)
    RETURNING id INTO v_per22;
  INSERT INTO model_versions (model_id, version, released_at)
    VALUES (m_dis, '7.2', '2018-01-15') RETURNING id INTO v_dis72;
  INSERT INTO model_versions (model_id, version, released_at)
    VALUES (m_neu, '1.4', '2019-01-10') RETURNING id INTO v_neu14;
  INSERT INTO model_versions (model_id, version, released_at, change_notes)
    VALUES (m_neu, '2.0', '2022-03-10', 'Nuevo modelo de desgaste; publicado solo para camiones Komatsu') RETURNING id INTO v_neu20;

  -- ── Activos ────────────────────────────────────────────────
  INSERT INTO assets (company_id, branch_id, code, name, asset_type, manufacturer, equipment_model, area, commissioned_at)
    VALUES (v_company, v_norte, 'CAEX-117', 'Camión autónomo CAEX-117', 'equipo', 'Komatsu', '930E', 'Carguío y transporte', '2019-05-01')
    RETURNING id INTO a_117;
  INSERT INTO assets (company_id, branch_id, code, name, asset_type, manufacturer, equipment_model, area, commissioned_at)
    VALUES (v_company, v_norte, 'CAEX-118', 'Camión autónomo CAEX-118', 'equipo', 'Komatsu', '930E', 'Carguío y transporte', '2019-05-01')
    RETURNING id INTO a_118;
  INSERT INTO assets (company_id, branch_id, code, name, asset_type, manufacturer, equipment_model, area, commissioned_at)
    VALUES (v_company, v_norte, 'CAT-201', 'Camión CAT-201', 'equipo', 'Caterpillar', '797F', 'Carguío y transporte', '2019-02-01')
    RETURNING id INTO a_201;
  INSERT INTO assets (company_id, branch_id, code, name, asset_type, area)
    VALUES (v_company, v_plan, 'PLAN-CP', 'Planificación de corto plazo', 'proceso', 'Planificación')
    RETURNING id INTO a_plan;
  INSERT INTO assets (company_id, branch_id, code, name, asset_type, manufacturer, area, ai_usage, notes)
    VALUES (v_company, v_norte, 'CHAN-01', 'Chancador primario', 'equipo', 'Metso', 'Procesamiento', 'modelos_por_identificar',
            'El proveedor indica que usa control inteligente; falta identificar los modelos')
    RETURNING id INTO a_chan;

  -- ── Instancias de los camiones Komatsu (CAEX-117 y CAEX-118) ─
  FOR i IN SELECT unnest(ARRAY[a_117, a_118]) LOOP
    -- Navegación: 3.0 → 4.0
    INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at,
                              risk_level, reclassification_pending, responsible_person, operational_location, autonomy_level,
                              who_acts_on_output, impact_if_fails, people_in_impact_area, can_cause_physical_harm)
      VALUES (v_company, m_nav, i, v_norte, 1, v_nav40, '2019-05-01', 'Critical', true, 'Superintendente de Transporte',
              'Rajo, rampas y botaderos', 5, 'Nadie: el camión actúa solo', 'Colisión o vuelco',
              'Operadores de equipos auxiliares y camionetas', 'Sí')
      RETURNING id INTO i117_nav;
    INSERT INTO instance_versions (instance_id, version_id, valid_from, valid_to) VALUES
      (i117_nav, v_nav30, '2019-05-01', '2022-03-10'),
      (i117_nav, v_nav40, '2022-03-10', NULL);

    -- Percepción: caja negra, actualizada sin detalle
    INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at,
                              risk_level, reclassification_pending)
      VALUES (v_company, m_per, i, v_norte, 1, v_per22, '2019-05-01', 'Critical', true)
      RETURNING id INTO i117_per;
    INSERT INTO instance_versions (instance_id, version_id, valid_from, valid_to) VALUES
      (i117_per, v_per0, '2019-05-01', '2022-03-10'),
      (i117_per, v_per22, '2022-03-10', NULL);

    -- Despacho: sin cambios (riesgo sube a Alto en el camión)
    INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
      VALUES (v_company, m_dis, i, v_norte, 1, v_dis72, '2019-05-01', 'High')
      RETURNING id INTO i117_dis;
    INSERT INTO instance_versions (instance_id, version_id, valid_from) VALUES (i117_dis, v_dis72, '2019-05-01');

    -- Neumáticos: 1.4 → 2.0 (solo Komatsu)
    INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at,
                              risk_level, reclassification_pending)
      VALUES (v_company, m_neu, i, v_norte, 1, v_neu20, '2019-05-01', 'Medium', true)
      RETURNING id INTO i117_neu;
    INSERT INTO instance_versions (instance_id, version_id, valid_from, valid_to) VALUES
      (i117_neu, v_neu14, '2019-05-01', '2022-03-10'),
      (i117_neu, v_neu20, '2022-03-10', NULL);

    -- Copias de las fichas al cambiar de versión
    INSERT INTO record_snapshots (entity_type, entity_id, version_id, reason, data, taken_at)
      SELECT 'instancia', x.id, x.current_version_id, 'Cambio de versión (datos de demostración)', to_jsonb(x), '2022-03-10'
      FROM ai_instances x WHERE x.id IN (i117_nav, i117_per, i117_neu);
  END LOOP;

  -- Las variables i117_* quedaron con las instancias del CAEX-118; recuperar las del CAEX-117
  SELECT id INTO i117_nav FROM ai_instances WHERE asset_id = a_117 AND model_id = m_nav;
  SELECT id INTO i117_per FROM ai_instances WHERE asset_id = a_117 AND model_id = m_per;
  SELECT id INTO i117_dis FROM ai_instances WHERE asset_id = a_117 AND model_id = m_dis;

  -- Secciones de ejemplo en la navegación del CAEX-117
  INSERT INTO inst_risk_operational (instance_id, human_override_exists, override_response_time_sec, failure_mode, review_frequency)
    VALUES (i117_nav, 'Sí, parada remota desde sala de control', 5, 'Detención segura ante pérdida de señal', 'Trimestral');
  INSERT INTO inst_human_supervision (instance_id, autonomy_level_approved, autonomy_approved_by, kill_switch_mechanism,
                                      kill_switch_response_time_sec, kill_switch_last_tested, kill_switch_test_result, override_auto_logged)
    VALUES (i117_nav, 5, 'Gerente de Mina', 'Parada de emergencia remota y en terreno', 5, '2024-10-15', 'Aprobado', true);
  INSERT INTO inst_accountability (instance_id, ai_owner_business, ai_owner_technical, eu_ai_act_role, approved_by, approval_date)
    VALUES (i117_nav, 'Gerente de Mina', 'Jefe de Automatización', 'Deployer', 'Gerente General', '2019-04-20');

  -- ── Camión Caterpillar: neumáticos se queda en 1.4 ─────────
  INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
    VALUES (v_company, m_dis, a_201, v_norte, 1, v_dis72, '2019-02-01', 'High') RETURNING id INTO i;
  INSERT INTO instance_versions (instance_id, version_id, valid_from) VALUES (i, v_dis72, '2019-02-01');
  INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
    VALUES (v_company, m_neu, a_201, v_norte, 1, v_neu14, '2019-02-01', 'Medium') RETURNING id INTO i;
  INSERT INTO instance_versions (instance_id, version_id, valid_from) VALUES (i, v_neu14, '2019-02-01');

  -- ── DISPATCH también en Planificación, con otro grupo (2 — analítico) ─
  INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at,
                            risk_level, who_acts_on_output)
    VALUES (v_company, m_dis, a_plan, v_plan, 2, v_dis72, '2020-01-01', 'Medium', 'Planificador, que valida el plan semanal')
    RETURNING id INTO i;
  INSERT INTO instance_versions (instance_id, version_id, valid_from) VALUES (i, v_dis72, '2020-01-01');

  -- ── Instancia sin activo asignado ──────────────────────────
  INSERT INTO ai_instances (company_id, model_id, asset_id, branch_id, inventory_group, current_version_id, installed_at, risk_level)
    VALUES (v_company, m_neu, NULL, v_norte, 1, v_neu14, '2021-06-01', 'Medium') RETURNING id INTO i;
  INSERT INTO instance_versions (instance_id, version_id, valid_from) VALUES (i, v_neu14, '2021-06-01');

  -- ── Incidentes (versión calculada desde el historial) ──────
  INSERT INTO ai_incidents (company_id, branch_id, asset_id, instance_id, version_id, occurred_at, title, kind, severity, status, description)
    SELECT v_company, v_norte, a_117, i117_per, iv.version_id, '2022-08-14', 'Frenado de emergencia por polvo',
           'peligro', 'incidente', 'cerrado', 'El sistema detectó una nube de polvo como obstáculo y detuvo el camión.'
    FROM instance_versions iv WHERE iv.instance_id = i117_per AND iv.valid_from <= '2022-08-14' AND (iv.valid_to IS NULL OR iv.valid_to > '2022-08-14');

  INSERT INTO ai_incidents (company_id, branch_id, asset_id, instance_id, version_id, occurred_at, title, kind, severity, status,
                            description, root_cause_technical, instance_assigned_at)
    SELECT v_company, v_norte, a_117, i117_nav, iv.version_id, '2023-01-20', 'Casi colisión con camioneta en intersección',
           'peligro', 'incidente_grave', 'cerrado', 'El camión ingresó a la intersección con una camioneta liviana a 15 metros.',
           'Nueva lógica de intersecciones de la versión 4.0', '2023-02-05'
    FROM instance_versions iv WHERE iv.instance_id = i117_nav AND iv.valid_from <= '2023-01-20' AND (iv.valid_to IS NULL OR iv.valid_to > '2023-01-20');

  INSERT INTO ai_incidents (company_id, branch_id, asset_id, instance_id, version_id, occurred_at, title, kind, severity, status, description)
    SELECT v_company, v_norte, a_117, i117_dis, iv.version_id, '2023-06-05', 'Camión enviado a pala detenida',
           'incidente', 'incidente', 'cerrado', 'Se perdieron 40 minutos de operación.'
    FROM instance_versions iv WHERE iv.instance_id = i117_dis AND iv.valid_from <= '2023-06-05' AND (iv.valid_to IS NULL OR iv.valid_to > '2023-06-05');

  -- Incidente con modelo por determinar
  INSERT INTO ai_incidents (company_id, branch_id, asset_id, occurred_at, title, kind, severity, status, description)
    VALUES (v_company, v_norte, a_201, '2024-02-11', 'Detención no programada en rampa', 'incidente', 'incidente', 'abierto',
            'El camión se detuvo sin causa aparente. Se investiga qué sistema la provocó.');

  RAISE NOTICE 'Datos de demostración creados.';
END $$;
