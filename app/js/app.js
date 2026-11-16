// ============================================================
// BION · Plataforma — aplicación principal
// ============================================================

function render() {
  document.getElementById('root').innerHTML = `
    <div class="placeholder">
      <b>BION</b>
      <span>${t('app_subtitle')}</span>
      <span>${t('coming_soon')}</span>
      <button class="lang-btn" onclick="toggleLang()">${t('lang_switch')}</button>
    </div>`;
}

setLang(LANG);
render();
