# Incidentes de IA — diseño

Aprobado el 25-11-2026. Combina cuatro marcos, cada uno con un papel distinto:

| Pregunta | Marco |
|---|---|
| ¿La IA estuvo involucrada? ¿Qué se dañó? ¿Cómo se comportó la IA? | CSET (AI Harm Taxonomy) |
| ¿Incidente o peligro? ¿Qué daño, qué gravedad, a quién, en qué contexto, cómo falló? | OECD |
| ¿Es un incidente grave que hay que notificar? | EU AI Act, art. 73 (solo empresas con el ajuste activado) |
| Causa raíz, acciones correctivas, verificación y cierre | ISO/IEC 42001 (10.2) y NIST AI RMF (MANAGE) |

## 1. Estados
Solo **Abierto** y **Cerrado**. No hay etiquetas de avance en la lista ni en la ficha.
Las acciones correctivas vencidas se muestran solo en **Pendientes**.

## 2. Registro (cualquier rol) — asistente de 3 pasos
1. **La IA y el evento (CSET):** activo donde corre la IA, fecha y hora, modelo (lista desplegable con
   "No sé cuál fue" = modelo por determinar), qué resultó dañado y cuál, título y descripción,
   comportamiento de la IA, relación de la IA con el daño. La versión se calcula sola por la fecha.
2. **El daño (OECD):** incidente o peligro, tipos de daño, gravedad (incidente · incidente grave ·
   desastre de IA), país y lugar (precargados), enlaces de respaldo.
3. **Revisar y enviar:** queda Abierto.

## 3. Investigación (Super división y Super empresa) — pestañas en la ficha
1. **Registro:** lo que llenó el reportante.
2. **Personas y derechos (OECD):** grupos afectados, personas lesionadas, principios de la OCDE vulnerados.
3. **Contexto y técnica (OECD):** sector, alcance del despliegue, tipo de modelo, explicabilidad, tarea,
   autonomía y supervisión humana se **precargan desde el inventario** y se confirman; se marcan
   problemas de datos y la falla de robustez.
4. **EU AI Act (art. 73):** 4 criterios Sí/No; si alguno es Sí, autoridad, plazo, fecha y referencia de
   la notificación. La pestaña solo existe si la empresa tiene `eu_ai_act_enabled` (panel BION Admin).
5. **Respuesta y cierre:** medidas tomadas (OECD), causa raíz técnica y organizacional, acciones
   correctivas (acción, responsable, fecha límite, estado), verificación de eficacia y lecciones
   aprendidas. **Cerrar** exige causa raíz, todas las acciones terminadas y la verificación.

## 4. Base de datos
- Migración `004_incidentes.sql` (BD de cada cliente): campos nuevos en `ai_incidents`, tabla
  `incident_actions`, estados abierto/cerrado, tipo incidente/peligro y gravedad OECD.
  Conversión: cuasi incidente → peligro; leve y moderado → incidente; grave y crítico → incidente grave;
  en investigación → abierto.
- Migración `004_incidentes_maestra.sql` (BD maestra): `companies.eu_ai_act_enabled`, desactivado por defecto.

## 5. Pendiente para etapas posteriores
- Archivos adjuntos como respaldo (hoy solo enlaces; requiere almacenamiento de archivos).
- Avisos por email (hoy solo dentro de la app: Pendientes y Dashboard).
- Vincular varios incidentes con la misma causa.
