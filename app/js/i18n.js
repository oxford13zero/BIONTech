// ============================================================
// BION · Plataforma — textos bilingües (ES / EN)
// Uso: t('clave'). Idioma guardado en localStorage ('bion_app_lang').
// ============================================================
const I18N = {
  es: {
    app_subtitle: 'Plataforma de gobierno de IA',
    coming_soon:  'Plataforma en construcción',
    lang_switch:  'EN'
  },
  en: {
    app_subtitle: 'AI governance platform',
    coming_soon:  'Platform under construction',
    lang_switch:  'ES'
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
