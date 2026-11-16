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
    welcome:          'Bienvenido',
    logout:           'Cerrar sesión',
    role_super_empresa:    'Super usuario empresa',
    role_super_division:   'Super usuario división',
    role_usuario_division: 'Usuario división',
    coming_soon:      'El menú de la plataforma llega en el siguiente paso.'
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
    welcome:          'Welcome',
    logout:           'Sign out',
    role_super_empresa:    'Company super user',
    role_super_division:   'Division super user',
    role_usuario_division: 'Division user',
    coming_soon:      'The platform menu arrives in the next step.'
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
