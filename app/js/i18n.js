// ============================================================
// BION · Plataforma — textos bilingües (ES / EN)
// Uso: t('clave'). Idioma guardado en localStorage ('bion_app_lang').
// ============================================================
const I18N = {
  es: {
    app_subtitle:     'Plataforma de gobierno de IA',
    lang_switch:      'EN',
    // Login
    login_title:      'Acceso clientes',
    login_email:      'Email',
    login_password:   'Contraseña',
    login_submit:     'Ingresar',
    login_loading:    'Ingresando…',
    login_required:   'Ingresa tu email y contraseña.',
    login_invalid:    'Email o contraseña incorrectos.',
    login_no_db:      'La base de datos de tu empresa aún no está lista. Contacta a BION.',
    login_error:      'No se pudo iniciar sesión. Intenta nuevamente.',
    login_network:    'Error de conexión. Revisa tu internet e intenta nuevamente.',
    back_to_site:     '← Volver a biontcorp.com',
    // Sesión
    logout:           'Cerrar sesión',
    role_super_empresa:    'Super usuario empresa',
    role_super_division:   'Super usuario división',
    role_usuario_division: 'Usuario división',
    // Menú
    nav_dashboard:     'Dashboard',
    nav_sec_inventory: 'INVENTARIO',
    nav_systems:       'Sistemas de IA',
    nav_divisions:     'Divisiones',
    nav_sec_risk:      'RIESGO Y CUMPLIMIENTO',
    nav_reporting:     'Reporting Hub',
    report_iso:        'Informe ISO 42001',
    report_nist:       'Informe NIST',
    report_eu:         'Informe EU AI Act',
    nav_sec_settings:  'CONFIGURACIÓN',
    nav_team:          'Equipo',
    group_1:           'Grupo 1 — Operacional',
    group_2:           'Grupo 2 — Analítica',
    group_3:           'Grupo 3 — Geociencia',
    group_4:           'Grupo 4 — Uso general',
    app_crumb_root:    'BION',
    section_soon:      'Esta sección se construye en los siguientes pasos.',
    open_menu:         'Abrir menú',
    data_error:        'No se pudieron cargar los datos. Intenta recargar la página.',
    loading:           'Cargando…',
    // Dashboard
    dash_total:        'Sistemas de IA',
    dash_high_risk:    'Riesgo crítico o alto',
    dash_unassessed:   'Sin evaluar',
    dash_overdue:      'Revisión vencida',
    dash_map:          'Mapa de riesgo por división',
    dash_attention:    'Requieren atención',
    dash_attention_none: 'Ningún sistema requiere atención.',
    risk_Critical:     'Crítico',
    risk_High:         'Alto',
    risk_Medium:       'Medio',
    risk_Low:          'Bajo',
    reason_overdue:    'Revisión vencida',
    reason_unassessed: 'Sin evaluar',
    division:          'División',
    system:            'Sistema',
    risk:              'Riesgo',
    reason:            'Motivo',
    total:             'Total',
    no_divisions:      'No hay divisiones.'
  },
  en: {
    app_subtitle:     'AI governance platform',
    lang_switch:      'ES',
    // Login
    login_title:      'Client access',
    login_email:      'Email',
    login_password:   'Password',
    login_submit:     'Sign in',
    login_loading:    'Signing in…',
    login_required:   'Enter your email and password.',
    login_invalid:    'Incorrect email or password.',
    login_no_db:      "Your company's database is not ready yet. Contact BION.",
    login_error:      'Could not sign in. Please try again.',
    login_network:    'Connection error. Check your internet and try again.',
    back_to_site:     '← Back to biontcorp.com',
    // Session
    logout:           'Sign out',
    role_super_empresa:    'Company super user',
    role_super_division:   'Division super user',
    role_usuario_division: 'Division user',
    // Menu
    nav_dashboard:     'Dashboard',
    nav_sec_inventory: 'INVENTORY',
    nav_systems:       'AI systems',
    nav_divisions:     'Divisions',
    nav_sec_risk:      'RISK & COMPLIANCE',
    nav_reporting:     'Reporting Hub',
    report_iso:        'ISO 42001 report',
    report_nist:       'NIST report',
    report_eu:         'EU AI Act report',
    nav_sec_settings:  'SETTINGS',
    nav_team:          'Team',
    group_1:           'Group 1 — Operational',
    group_2:           'Group 2 — Analytical',
    group_3:           'Group 3 — Geoscience',
    group_4:           'Group 4 — General use',
    app_crumb_root:    'BION',
    section_soon:      'This section is built in the next steps.',
    open_menu:         'Open menu',
    data_error:        'Data could not be loaded. Try reloading the page.',
    loading:           'Loading…',
    // Dashboard
    dash_total:        'AI systems',
    dash_high_risk:    'Critical or high risk',
    dash_unassessed:   'Not assessed',
    dash_overdue:      'Review overdue',
    dash_map:          'Risk map by division',
    dash_attention:    'Need attention',
    dash_attention_none: 'No systems need attention.',
    risk_Critical:     'Critical',
    risk_High:         'High',
    risk_Medium:       'Medium',
    risk_Low:          'Low',
    reason_overdue:    'Review overdue',
    reason_unassessed: 'Not assessed',
    division:          'Division',
    system:            'System',
    risk:              'Risk',
    reason:            'Reason',
    total:             'Total',
    no_divisions:      'No divisions.'
  }
};

let LANG = (() => {
  try { return localStorage.getItem('bion_app_lang') || 'es'; } catch (e) { return 'es'; }
})();

function t(key) {
  return (I18N[LANG] && I18N[LANG][key]) || I18N.es[key] || key;
}

function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'es';
  try { localStorage.setItem('bion_app_lang', LANG); } catch (e) {}
  document.documentElement.lang = LANG;
}

function toggleLang() {
  setLang(LANG === 'es' ? 'en' : 'es');
  if (typeof render === 'function') render();
}
