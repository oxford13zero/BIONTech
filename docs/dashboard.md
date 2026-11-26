# Dashboard — diseño

Aprobado el 26-11-2026 (Opción A + línea de legislación). Pantalla en `app/js/dashboard.js`,
servidor en `api/dashboard.js`.

## 1. Qué muestra

| Bloque | Qué es | Cálculo |
|---|---|---|
| Período | 30 días · 90 días · 12 meses (por defecto) | Termina hoy; el período anterior tiene el mismo largo |
| Tarjeta Incidentes | Incidentes del período y variación | ▲ rojo si suben, ▼ verde si bajan; % si el período anterior tuvo incidentes, si no la diferencia |
| Tarjeta Graves | Incidentes graves o desastres de IA | Igual que la anterior |
| Tarjeta Crítico o alto | Instalaciones activas de riesgo crítico o alto, sobre el total | A la fecha |
| Tarjeta Pendientes | Total de la pantalla Pendientes | A la fecha |
| Línea de legislación | Normas de IA, una a la vez | Ver sección 3 |
| Incidentes en el tiempo | Curva de incidentes y graves | Por semana (30 y 90 días) o por mes (12 meses). Detalle al pasar el cursor; "Ver como tabla" |
| Requieren atención | Los 5 más urgentes | Incidentes graves abiertos, riesgo por revisar y revisiones vencidas; el resto en Pendientes |
| Riesgo por división | Instalaciones activas por nivel de riesgo | A la fecha |
| Incidentes por modelo | Los 5 modelos con más incidentes del período | Incluye "Modelo por determinar" |
| Salud de la gobernanza | 3 indicadores ISO 42001 | Acciones terminadas a tiempo (terminadas en el período); cambios de versión revisados (del período); instalaciones sin datos marcados "por completar" o "no entregado" (a la fecha) |
| Incidentes recientes | Los 5 últimos | — |

La división elegida arriba (o la propia, para los roles de división) filtra todo, salvo la legislación.

## 2. Colores (validados contra el panel #1F3D68)
- Incidentes: azul `#338ced`. Graves: naranjo `#e76624`. Pasan las pruebas de daltonismo y contraste.
- Niveles de riesgo: un solo tono, de Bajo (oscuro) a Crítico (claro): `#b05a35`, `#d66b3d`, `#f2875a`, `#ffb592`.
- Siempre con leyenda y números visibles; el color nunca es la única señal.
- En celular el gráfico usa un lienzo más angosto para que el texto se lea.

## 3. Legislación
- Tabla `legislation_alerts` en la **BD maestra** (`postgres`), migración `006_legislacion_maestra.sql` (ejecutada el 26-11-2026).
- DBeaver en modo de commit manual: termina cada cambio con `COMMIT;` (los ejemplos ya lo traen).
- Orden: primero las normas del país de la empresa (`companies.country`), dentro de ellas las que tienen plazo,
  luego por fecha de publicación; después el resto del mundo. Máximo 20.
- Rota cada 7 s; se pausa con el cursor o el foco; no rota con "reducir movimiento". Flechas y puntos para moverse.
- Sin la migración 006 (o sin la tabla) el Dashboard funciona igual, sin la línea.

### Columnas
| Columna | Uso |
|---|---|
| `country` | País o ámbito, en inglés: `Chile`, `Brazil`, `Peru`, `European Union` o `International` (regla `legislation_alerts_country_check`; para otro país hay que ampliarla). La pantalla los traduce. Debe coincidir con el país de la empresa para salir primero |
| `title` | Título corto |
| `description` | Resumen de lo que exige (una o dos frases) |
| `url` | Fuente oficial (se abre en otra pestaña) |
| `status` | `tramitacion` · `vigente` · `plazo` |
| `key_date` | Fecha de vigencia o plazo (se muestra con `plazo`) |
| `applies_to` | A qué aplica en la empresa |
| `active` | `false` la oculta sin borrarla |
| `published_at` | Fecha de la última novedad (ordena) |

### Ejemplos para DBeaver (ejecutar sobre `postgres`)
Agregar una norma:
```sql
BEGIN;
INSERT INTO legislation_alerts (country, title, description, url, status, key_date, applies_to, active, published_at)
VALUES ('Chile', 'Título de la norma', 'Qué exige, en una o dos frases.', 'https://www.bcn.cl/...',
        'plazo', '2027-06-30', 'A qué aplica en la empresa', true, NOW());
COMMIT;
```
Cambiar el estado de una norma (por ejemplo, cuando se publica una ley):
```sql
BEGIN;
UPDATE legislation_alerts SET status = 'vigente', key_date = NULL, published_at = NOW()
WHERE title LIKE 'Proyecto de Ley de Inteligencia Artificial%';
COMMIT;
```
Ocultar una norma sin borrarla:
```sql
BEGIN;
UPDATE legislation_alerts SET active = false WHERE title LIKE 'PL 2338/2023%';
COMMIT;
```
Ver lo que muestra el Dashboard:
```sql
SELECT country, status, key_date, title, active FROM legislation_alerts
ORDER BY (country = 'Chile') DESC, (status = 'plazo') DESC, published_at DESC;
```

## 4. API
`GET /api/dashboard?division=&period=30d|90d|12m` agrega a la respuesta anterior: `period`, `kpis`
(incidentes y graves, con el período anterior), `trend` (`unit` + `points`), `by_model` y `health`.
`GET /api/dashboard?legislation=1` devuelve `{ country, items }`.
