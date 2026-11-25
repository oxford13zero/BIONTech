# Activos, modelos e instancias — Diseño

Estado: **aprobado** (Fase 0). Nada de esto está programado todavía.

## 1. Conceptos

| Concepto | Qué es | Ejemplo |
|---|---|---|
| **Activo** | Cualquier cosa de la operación que usa IA: un equipo, una instalación o un proceso | Camión CAEX-117 · Planta de flotación · Área de geología |
| **Modelo** | El producto de IA de un proveedor (catálogo de la empresa) | Navegación autónoma FrontRunner — Komatsu |
| **Instancia** | Un modelo instalado en un activo concreto. Tiene código único | INS-0457: FrontRunner en el CAEX-117 |
| **Versión** | Una versión publicada de un modelo | FrontRunner 4.0 (2022-03-10) |
| **Incidente** | Un evento en un activo, ligado (si se sabe) a una instancia | Casi colisión del CAEX-117, 2023-01-20 |

```
Activo  CAEX-117 ──┬── Instancia INS-0457 ── Modelo FrontRunner (Komatsu)   versión 4.0 desde 2022-03-10
                   ├── Instancia INS-0458 ── Modelo Percepción  (Komatsu)   caja negra
                   └── Instancia INS-0459 ── Modelo DISPATCH (Modular Mining) versión 7.2
Incidente 2023-01-20 ── CAEX-117 ── INS-0457 ── versión 4.0 (automática)
```

- Un modelo se registra **una vez** y puede tener muchas instancias (en muchos activos y divisiones).
- Cada instancia tiene **su propia versión instalada** y su historial, así una actualización puede aplicarse solo a algunos activos (por ejemplo, solo a los camiones Komatsu).
- Los incidentes se registran en la instancia; la versión se calcula sola según la fecha.

## 2. Tablas nuevas (base de datos de cada cliente)

Todas tienen `id`, `company_id`, `created_at`, `updated_at`. Las tablas antiguas (`ai_systems` y secciones) **no se tocan** hasta que el servicio de reportes se adapte.

### `assets` — Activos
| Campo | Descripción |
|---|---|
| `code` | Código del activo, único en la empresa (ej. `CAEX-117`) |
| `name` | Nombre |
| `asset_type` | `equipo` · `instalacion` · `proceso` |
| `branch_id` | División (obligatoria) |
| `manufacturer`, `equipment_model` | Marca y modelo del equipo (ej. Komatsu / 930E) — sirve para filtrar al aplicar versiones |
| `area` | Área o proceso (ej. Carguío y transporte, Geología) |
| `ai_usage` | `usa_ia` · `modelos_por_identificar` · `por_confirmar` |
| `status` | `activo` · `retirado` |
| `commissioned_at`, `retired_at`, `notes` | Fechas y notas |

### `ai_models` — Catálogo de modelos
| Campo | Descripción |
|---|---|
| `code` | Código automático (`MOD-001`) |
| `name`, `vendor` | Nombre y proveedor (obligatorios) |
| `suggested_group` | Grupo 1–4 sugerido; se propone al crear cada instancia |
| `base_risk_level` | Riesgo base del producto |
| `black_box` | Sí/No: el proveedor no entrega información |
| `vendor_questionnaire_sent_at`, `vendor_questionnaire_received` | Cuestionario al proveedor |
| Campos de proveedor | Ver sección 3 (columna **M**) |
| `field_status` | Estado de cada campo (ver sección 4) |
| `status` | `activo` · `retirado` |

### `model_versions` — Versiones publicadas de un modelo
`model_id`, `version`, `released_at`, `change_notes`, `changes_unknown` (Sí cuando el proveedor actualizó sin informar qué cambió).

### `ai_instances` — Instancias
| Campo | Descripción |
|---|---|
| `code` | Código automático (`INS-0001`) |
| `model_id` | Modelo |
| `asset_id` | Activo (vacío = **"Activo por asignar"**) |
| `branch_id` | División (la del activo) |
| `inventory_group` | Grupo 1–4 según el **uso** en este activo (define qué sección F de riesgo aplica). Un mismo modelo puede tener instancias en grupos distintos |
| `current_version_id`, `installed_at` | Versión instalada hoy y fecha de instalación |
| `risk_level` | Riesgo en este contexto (parte del riesgo base del modelo; puede subir, no bajar) |
| `reclassification_pending` | Sí después de un cambio de versión, hasta que se revise el riesgo |
| `status`, `retired_at` | `activa` · `retirada` |
| Campos de uso | Ver sección 3 (columna **I**) |
| `field_status` | Estado de cada campo |

### `instance_versions` — Historial de versiones por instancia
`instance_id`, `version_id`, `valid_from`, `valid_to` (vacío = vigente). Con esto se sabe qué versión tenía cada instancia en cualquier fecha.

### Secciones por instancia (1 fila por instancia, como hoy pero ligadas a la instancia)
`inst_risk_operational`, `inst_risk_decision`, `inst_risk_strategic`, `inst_risk_human_use` (sección F según el grupo de la instancia),
`inst_compliance` (G), `inst_accountability` (H), `inst_risk_assessment` (M2), `inst_human_supervision` (M4),
`inst_integrations` (M7, varias por instancia).

### `record_snapshots` — Copias de fichas
`entity_type` (`modelo` · `instancia`), `entity_id`, `version_id`, `taken_at`, `reason`, `data` (copia completa de la ficha en ese momento).

### `model_changes` — Historial de cambios de los modelos (migración 003)
`model_id`, `changed_at`, `changed_by`, `changed_by_email`, `justification` (obligatoria), `changes` (campos y estados: valor anterior → nuevo), `version_id` (versión creada en ese cambio, si hubo).

### `ai_incidents` — Incidentes
| Campo | Descripción |
|---|---|
| `asset_id` | Activo (obligatorio) |
| `instance_id` | Instancia involucrada (vacío = **"Modelo por determinar"**) |
| `version_id` | **Automático**: versión de la instancia en la fecha del incidente |
| `occurred_at` | Fecha del incidente |
| `title`, `description`, `incident_type` | Qué pasó |
| `kind` | `incidente` (el daño ocurrió) · `cuasi_incidente` (pudo ocurrir; "peligro" según OECD) |
| `severity` | `leve` · `moderado` · `grave` · `critico` (escala interna) |
| `eu_serious_incident` | Sí/No: "incidente grave" según EU AI Act art. 73. Si es Sí, se exigen los campos de notificación al regulador |
| `status` | `abierto` · `en_investigacion` · `cerrado` |
| `root_cause_technical`, `root_cause_organizational`, `lessons_learned` | Análisis |
| `requires_regulator_notification`, `regulator_authority`, `notification_deadline` | Notificación al regulador |
| `reported_by` | Usuario que lo registró |

## 3. Dónde queda cada campo del inventario actual

**M** = se llena una vez en el **modelo** · **I** = se llena en cada **instancia** · **Auto** = lo calcula la plataforma

| Sección | Campo | Va a |
|---|---|---|
| A | Código del sistema | Auto (código de modelo e instancia) |
| A | Proveedor | M |
| A | Versión | M (versiones publicadas) e I (versión instalada) |
| A | Fecha de despliegue | I (`installed_at`) |
| A | Responsable, área, ubicación, país, próxima revisión | I |
| A | Nivel de autonomía, categoría EU AI Act, entorno, proveedor de infraestructura, etiqueta Shadow AI, puntaje de riesgo, estado de despliegue | I |
| B | Función principal, tipo de salida, formato de salida | M |
| B | Decisión autónoma, velocidad, frecuencia, recomienda o decide, quién actúa, impacto si falla, procesos/equipos/personas afectados, daño físico, informes públicos, mal uso previsible | I |
| C | Modelo de propósito general (GPAI) | M |
| C | Todos los demás (riesgo Chile, artículos, SERNAGEOMIN, supervisión, NIST, OCDE, ISO 42001, otros marcos, artículo EU AI Act) | I |
| D | Tipo de modelo, datos y volumen de entrenamiento, último reentrenamiento, frecuencia de reentrenamiento, control de calidad, acceso técnico del proveedor, datos en el proveedor, región, acuerdo de tratamiento, lugar de transferencia | M |
| D | Datos de entrada en producción, incluye datos personales / sensibles / comunidades / confidenciales, dueño de los datos | I |
| E | Métricas, línea base, sesgo (evaluado, tipo, resultado), validación independiente | M |
| E | Monitoreo de deriva, último informe de desempeño, proceso de reporte de incidentes | I |
| E | Cantidad de incidentes | Auto (se cuenta desde los incidentes) |
| F | Todos | I |
| G | Documentación técnica, marcado CE, Anexo IV, cuestionario al proveedor, próxima renovación de contrato | M |
| G | Todos los demás (evaluación de impacto, registro de decisiones, estado de cumplimiento, FRIA, etc.) | I |
| H, M2, M4, M7 | Todos | I |
| M6 | Incidentes | Tabla `ai_incidents` |

## 4. Los 3 estados de cada dato

| Estado | Cómo se guarda | Se muestra como |
|---|---|---|
| ✅ Informado | El campo tiene valor | El valor |
| ⏳ Pendiente | Campo vacío (o marcado `pendiente` en `field_status`) | "Pendiente" |
| 🚫 No entregado por el proveedor | `field_status = { "campo": "no_entregado" }` | "No entregado por el proveedor" (cuenta como brecha de riesgo en reportes) |

## 5. Reglas automáticas

1. **Al asociar un modelo a un activo** se crea la instancia con: la última versión del modelo, la fecha de hoy (editable), el riesgo base del modelo y el grupo sugerido del modelo (editable).
2. **Al registrar una versión** en un modelo, el usuario elige a qué instancias se aplica (todas, por filtro de marca/división/tipo, o a mano). Para cada instancia elegida: se guarda una copia de su ficha, se cierra la versión anterior en el historial, se abre la nueva y se marca **reclasificación pendiente**. Las instancias no elegidas siguen igual.
3. **"Aplicar a más activos"**: aplica una versión ya registrada a otras instancias, con su propia fecha.
4. **Al registrar o editar un incidente**, la versión se calcula sola con el historial de la instancia en la fecha del incidente. Si se asigna la instancia más tarde, la versión se recalcula.
5. **"Copiar de otra instancia"**: copia los campos de uso (columna I y secciones de instancia) a otras instancias del mismo modelo, **solo en los campos vacíos** (nunca reemplaza datos existentes). No copia activo, código, versión, historial ni incidentes.
6. **Al retirar un activo**, sus instancias pasan a "retiradas"; su historial e incidentes se conservan.
7. **Riesgo de la instancia**: no puede ser menor que el riesgo base del modelo.
8. **Pendientes** (menú) reúne: fichas con campos pendientes, activos con modelos por identificar o por confirmar, modelos caja negra, instancias con reclasificación pendiente o sin activo, incidentes con modelo por determinar y revisiones vencidas.

## 6. Permisos

| Acción | Super empresa | Super división | Usuario división |
|---|---|---|---|
| Ver activos, modelos, instancias, incidentes | Toda la empresa (con selector de división) | Su división | Su división |
| Crear / editar / retirar activos e instancias | ✅ | ✅ su división (no mueve activos a otra división) | ❌ |
| Riesgo de la instancia (no menor al riesgo base) | ✅ | ✅ su división | ❌ |
| Crear / editar modelos del catálogo, incluido el riesgo base | ✅ | ❌ (si falta un modelo: "modelos por identificar" y avisa al Super empresa) | ❌ |
| Registrar versiones en el catálogo | ✅ | ❌ (si falta una versión: avisa al Super empresa) | ❌ |
| Aplicar una versión ya registrada a instancias | ✅ | ✅ solo instancias de su división | ❌ |
| Registrar incidentes | ✅ | ✅ su división | ✅ su división (quedan abiertos) |
| Editar y cerrar incidentes | ✅ | ✅ su división | ❌ |
| Generar informes | ✅ | ✅ su división | ✅ su división |

## 7. Decisiones tomadas

1. **Copiar de otra instancia**: solo llena los campos vacíos.
2. **Incidentes**: tres campos — tipo (incidente / cuasi incidente, según OECD), gravedad interna (leve / moderado / grave / crítico) y si es "incidente grave" según EU AI Act art. 73 (activa la notificación al regulador). El NIST AI RMF no fija una escala; pide que cada organización defina la suya.
3. **Grupo 1–4**: describe el uso, por eso va en la **instancia**. El modelo solo guarda un grupo sugerido.
4. **Cambios en la ficha del modelo**: siempre con justificación. Al guardar, una ventana pregunta si el cambio es una **nueva versión** (se registra la versión y se elige a qué instalaciones se aplica) o una **corrección de datos**. Todo queda en el historial de cambios del modelo. Ya no hay un botón aparte para registrar versiones.
