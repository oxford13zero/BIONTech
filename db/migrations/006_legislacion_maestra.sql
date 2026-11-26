-- ============================================================
-- Migración 006 (maestra) — Legislación de IA para el Dashboard
-- Ejecutar UNA vez sobre la BD MAESTRA (postgres).
-- 1. Agrega a legislation_alerts: estado, fecha clave y "aplica a".
-- 2. Reemplaza las normas de prueba por las normas vigentes al 26-11-2026.
-- Las normas se mantienen en DBeaver; ver docs/dashboard.md (ejemplos de SQL).
-- Se puede ejecutar más de una vez sin efectos (vuelve a dejar estas normas).
-- ============================================================

BEGIN;

-- ── 1. Columnas nuevas ────────────────────────────────────────
ALTER TABLE legislation_alerts ADD COLUMN IF NOT EXISTS status     TEXT;   -- tramitacion | vigente | plazo
ALTER TABLE legislation_alerts ADD COLUMN IF NOT EXISTS key_date   DATE;   -- vigencia o plazo de cumplimiento
ALTER TABLE legislation_alerts ADD COLUMN IF NOT EXISTS applies_to TEXT;   -- a qué aplica en la empresa
ALTER TABLE legislation_alerts DROP CONSTRAINT IF EXISTS legislation_alerts_status_check;
ALTER TABLE legislation_alerts ADD CONSTRAINT legislation_alerts_status_check
  CHECK (status IS NULL OR status IN ('tramitacion', 'vigente', 'plazo'));

-- ── 2. Normas (las anteriores eran de prueba) ─────────────────
-- country = país de la norma. El Dashboard muestra primero las del país de la empresa.
DELETE FROM legislation_alerts;

INSERT INTO legislation_alerts (country, title, description, url, status, key_date, applies_to, active, published_at) VALUES
('Chile',
 'Proyecto de Ley de Inteligencia Artificial (Boletín 16821-19)',
 'Clasifica los sistemas de IA por riesgo; los de alto riesgo exigen gestión de riesgos, supervisión humana y registro de incidentes. En segundo trámite en el Senado (Comisión Desafíos del Futuro). Regiría 12 meses después de publicada.',
 'https://www.camara.cl/legislacion/proyectosdeley/tramitacion.aspx?prmID=17429',
 'tramitacion', NULL, 'Instalaciones de riesgo crítico o alto', true, '2025-10-01'),
('Chile',
 'Ley 21.719 · Protección de datos personales',
 'Derecho a no ser objeto de decisiones basadas solo en tratamiento automatizado, evaluaciones de impacto para tratamientos de alto riesgo y la nueva Agencia de Protección de Datos.',
 'https://www.bcn.cl/leychile/consulta/listaresultadosimple?cadena=21719',
 'plazo', '2026-12-01', 'Modelos que usan datos personales de trabajadores o terceros', true, '2024-12-13'),
('Chile',
 'Ley 21.663 · Marco de Ciberseguridad',
 'Reporte de incidentes de ciberseguridad a la ANCI y deberes para operadores de importancia vital, que pueden incluir a la minería.',
 'https://www.bcn.cl/leychile/consulta/listaresultadosimple?cadena=21663',
 'vigente', NULL, 'Sistemas de IA conectados a la operación', true, '2024-04-08'),
('Chile',
 'DS 132 · Reglamento de Seguridad Minera (SERNAGEOMIN)',
 'Reporte de accidentes e incidentes en faena y control de los riesgos de equipos y procesos, incluidos los equipos autónomos.',
 'https://www.bcn.cl/leychile/consulta/listaresultadosimple?cadena=reglamento+de+seguridad+minera',
 'vigente', NULL, 'Equipos autónomos y sistemas de seguridad en faena', true, '2004-02-07'),
('Unión Europea',
 'EU AI Act · Reglamento (UE) 2024/1689',
 'Sistemas de alto riesgo: gestión de riesgos, documentación técnica (art. 11) y notificación de incidentes graves (art. 73). El Digital Omnibus postergó las obligaciones del Anexo III al 02-12-2027.',
 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
 'plazo', '2027-12-02', 'Operaciones con clientes o inversionistas en la UE', true, '2026-07-29'),
('Brasil',
 'PL 2338/2023 · Marco legal de la IA',
 'Regulación de la IA basada en riesgo. Aprobado por el Senado (dic. 2024); en análisis en una comisión especial de la Cámara de Diputados.',
 'https://www.congressonacional.leg.br/materias/materias-bicamerais/-/ver/pl-2338-2023',
 'tramitacion', NULL, 'Operaciones en Brasil', true, '2025-12-01'),
('Perú',
 'Ley 31814 y su reglamento · Uso de la IA',
 'Promueve el uso de la IA para el desarrollo económico y social, con obligaciones adicionales para sistemas de riesgo alto.',
 'https://www.gob.pe/busquedas?term=ley+31814',
 'vigente', NULL, 'Operaciones en Perú', true, '2025-09-01'),
('Internacional',
 'ISO/IEC 42001:2023 · Sistema de gestión de IA',
 'Norma voluntaria y certificable: políticas, evaluación de riesgos, gestión del cambio, incidentes y mejora continua de los sistemas de IA. Es la base de BION.',
 'https://www.iso.org/standard/81230.html',
 'vigente', NULL, 'Toda la gestión de IA de la empresa', true, '2023-12-18');

COMMIT;
