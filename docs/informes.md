# Informes de gobernanza (Reporting Hub) — diseño

Aprobado el 25-11-2026. Pantallas en `app/js/reports.js`, servidor en `api/reports.js`.
El informe con IA sobre legislación (ISO 42001, NIST, EU AI Act) sigue en el submenú del
Reporting Hub, sin cambios, hasta que se ajuste.

## 1. Catálogo: 8 informes en 3 niveles

| # | Informe | Nivel | Período | Frameworks |
|---|---|---|---|---|
| 1 | Estado Global de la IA en la Organización | Empresa | Sí | ISO 42001 9.3 · NIST Govern |
| 2 | Mapa de riesgo de IA | Empresa | No (a la fecha) | ISO 42001 6.1 · NIST Map/Measure |
| 3 | Inventario de IA | División | No (a la fecha) | ISO 42001 A.4 · EU AI Act art. 49 · NIST Map |
| 4 | Incidentes del período | División | Sí, + estado y gravedad | ISO 42001 10.2 · ISO 45001 · OECD |
| 5 | Acciones correctivas | División | Sí (acciones creadas en el período) | ISO 42001 10.2 · ISO 45001 10.2 |
| 6 | Gestión del cambio | División | Sí (cambios de versión en el período) | ISO 42001 8.1 · ISO 45001 MOC · NIST Manage |
| 7 | Brechas de información | División | No (a la fecha) | ISO 42001 A.6/A.10 · EU AI Act art. 11/13 |
| 8 | Reporte de Incidente Grave Específico | Sistema (un incidente) | — | EU AI Act art. 73 · CSET · OECD |

## 2. Cobertura según el rol

| Rol | Informes 1 y 2 | Informes 3 a 7 | Informe 8 |
|---|---|---|---|
| Super empresa | Sí, siempre toda la empresa con desglose por división | Toda la empresa o las divisiones que elija | Incidentes de toda la empresa |
| Super división | No | Solo su división (fija) | Incidentes de su división |
| Usuario división | No | Solo su división (fija) | Incidentes de su división |

- El servidor valida la cobertura: un rol de división que pide otra división recibe 403.
- Los informes 1 y 2 aparecen en el catálogo atenuados con 🔒 para los roles de división.
- En las pantallas de informes no se muestra el selector "División" de arriba: la cobertura se elige
  dentro del informe.

## 3. Pantallas
1. **Catálogo** (`#/reportes`): tarjetas por nivel con objetivo y frameworks.
2. **Configuración** (`#/reportes/<n>`): combo de divisiones con casillas ("Toda la empresa" arriba),
   combos de período (último mes, últimos 3 meses, este año, personalizado), estado y gravedad, barra
   "Seleccionado" (solo texto, con ✕ por división y "Limpiar") y vista previa con conteos.
3. **Informe generado** (`#/reportes/<n>/ver?<filtros>`): los filtros van en la dirección, para recargar
   o compartir. Botón **Descargar PDF**: abre la impresión del navegador ("Guardar como PDF"); el
   formato está preparado para A4.
4. **Informe 8**: botón "Generar reporte formal" en la ficha de un incidente grave o desastre → ventana
   con destinatario (Gerencia o Autoridad) y qué incluir (acciones, evidencias, contexto técnico) →
   `#/incidentes/<id>/reporte?aud=&inc=`.

## 4. Trazabilidad (ISO 42001 7.5)
Todo informe lleva: cobertura (nombres de divisiones), período y filtros, fecha y hora de generación,
autor y rol, origen de los datos y número de informe. No se guarda un registro de los informes generados
(decisión del 25-11-2026).

## 5. Reglas de cálculo
- **Graves** = incidente grave o desastre de IA.
- **Acción fuera de plazo** = pendiente con fecha límite pasada. "A tiempo" = terminada en o antes del plazo.
- **Cambio de versión** = versión aplicada después de la primera de la instalación (la instalación
  inicial no cuenta). Revisado = existe una revisión para esa versión.
- **Antes → durante (informe 6)** = incidentes de la instalación en los mismos días de vigilancia antes
  del cambio, y desde la revisión hasta el fin de la vigilancia (o hoy).
- **Brechas** = modelos caja negra o con campos marcados "no entregado"/"pendiente"; instalaciones con
  campos marcados en su ficha o en sus secciones. Solo cuentan modelos con instalaciones activas en la
  cobertura.
- **Tendencia (informe 1)** = los 12 meses que terminan en el mes final del período.
- Los detalles muestran hasta 1.000 filas; si hay más, el informe lo indica.

## 6. Informe 8: versiones
- **Gerencia:** incluye quién registró y cerró el incidente y los responsables de las acciones.
- **Autoridad:** sin correos de personas ni responsables de acciones; "Por" muestra la empresa.
- Si el incidente está abierto, sale marcado **PRELIMINAR**.
- Solo para incidentes graves o desastres. No incluye historial de cambios: BION no lo guarda para incidentes.

## 7. API
`GET /api/reports?action=catalog | options | preview | generate`, con `report`, `divisions`
(`all` o ids separados por coma), `period` (`1m`, `3m`, `year`, `custom` con `from` y `to`), `status`
y `severity`. El informe 8 usa la ficha del incidente (`GET /api/incidents?id=`). No requiere migraciones.
