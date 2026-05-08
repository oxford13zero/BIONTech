// ── BION Admin Panel — Shared Auth JS ────────────────────────

const API = '';  // Same origin — Vercel serves /api/* automatically

function getToken() {
  return localStorage.getItem('bion_azure_admin_token');
}

function getAdminName() {
  return localStorage.getItem('bion_azure_admin_name') || 'Admin';
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/admin/index.html';
  }
}

function logout() {
  localStorage.removeItem('bion_azure_admin_token');
  localStorage.removeItem('bion_azure_admin_name');
  window.location.href = '/admin/index.html';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (res.status === 401 || res.status === 403) {
    logout();
    return null;
  }

  return res.json();
}

function showAlert(containerId, message, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 3000);
  }
}

function hideAlert(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.style.display = 'none';
}

function statusBadge(status) {
  const map = {
    active:       'badge-active',
    inactive:     'badge-inactive',
    pending:      'badge-pending',
    cancelled:    'badge-cancelled',
    ready:        'badge-ready',
    provisioning: 'badge-provisioning',
    error:        'badge-error'
  };
  const cls = map[status] || 'badge-inactive';
  return `<span class="badge ${cls}">${status}</span>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: 'America/Santiago'
  });
}

// Set active nav link
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  document.querySelectorAll('.admin-nav a').forEach(a => {
    if (a.getAttribute('href') && path.includes(a.getAttribute('href').replace('/admin/', ''))) {
      a.classList.add('active');
    }
  });
  const nameEl = document.getElementById('adminNavName');
  if (nameEl) nameEl.textContent = getAdminName();
});
