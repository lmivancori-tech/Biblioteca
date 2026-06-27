/* ==========================================================================
   PROMPTFLOW — app.js
   SPA client-side logic: theme · CRUD · rendering · modals · toasts
   ========================================================================== */

'use strict';

// ─────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────
// URL fija de la API de Google Apps Script
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbwrqLi3OwbzgVVDVRdeiLJSiwFqapf9zdO2hx0KGZm2tYy8zOes6rzhn8GO-8jHhRCeGg/exec';

const State = {
  apiUrl: localStorage.getItem('pf_api_url') || DEFAULT_API_URL,
  prompts: [],           // full data from Sheets
  categories: new Set(),    // unique category names
  activeFilter: 'all',        // current category tab
  searchQuery: '',           // current search string
  pendingDelete: null         // id waiting confirm deletion
};

// ─────────────────────────────────────────────
//  DOM REFERENCES
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const Dom = {
  // Topbar
  btnTheme: $('btn-theme'),
  btnSettings: $('btn-settings'),
  btnNewPrompt: $('btn-new-prompt'),
  btnFab: $('btn-fab'),
  statsCount: $('stats-count'),
  // Banner
  bannerSetup: $('banner-setup'),
  btnBannerSettings: $('btn-banner-settings'),
  // Search & Filter
  inputSearch: $('input-search'),
  btnClearSearch: $('btn-clear-search'),
  categoryTabs: $('category-tabs'),
  // State views
  stateLoading: $('state-loading'),
  stateError: $('state-error'),
  stateEmpty: $('state-empty'),
  errorMsg: $('error-msg'),
  btnRetry: $('btn-retry'),
  // Grid
  promptsGrid: $('prompts-grid'),
  // Prompt modal
  modalPrompt: $('modal-prompt'),
  modalPromptTitle: $('modal-prompt-title'),
  modalPromptBackdrop: $('modal-prompt-backdrop'),
  btnClosePromptModal: $('btn-close-prompt-modal'),
  formPrompt: $('form-prompt'),
  fieldId: $('field-id'),
  fieldCategoria: $('field-categoria'),
  autocompleteList: $('autocomplete-list'),
  fieldNombre: $('field-nombre'),
  fieldPrompt: $('field-prompt'),
  fieldEjemplos: $('field-ejemplos'),
  charCount: $('char-count'),
  btnCancelPrompt: $('btn-cancel-prompt'),
  btnSavePrompt: $('btn-save-prompt'),
  btnEmptyCreate: $('btn-empty-create'),
  // Settings modal
  modalSettings: $('modal-settings'),
  modalSettingsBackdrop: $('modal-settings-backdrop'),
  btnCloseSettings: $('btn-close-settings'),
  formSettings: $('form-settings'),
  fieldApiUrl: $('field-api-url'),
  btnCancelSettings: $('btn-cancel-settings'),
  // Confirm modal
  modalConfirm: $('modal-confirm'),
  modalConfirmBackdrop: $('modal-confirm-backdrop'),
  btnConfirmCancel: $('btn-confirm-cancel'),
  btnConfirmDelete: $('btn-confirm-delete'),
  // Toast
  toastContainer: $('toast-container')
};

// ─────────────────────────────────────────────
//  INITIALIZATION
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindEventListeners();
  checkSetup();

  if (State.apiUrl) {
    fetchPrompts();
  }
});

// ─────────────────────────────────────────────
//  THEME  (dark / light)
// ─────────────────────────────────────────────
function initTheme() {
  // Priority: saved pref → system pref → default light
  const saved = localStorage.getItem('pf_theme');
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || (!saved && system) ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('pf_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast(`Modo ${next === 'dark' ? 'oscuro 🌙' : 'claro ☀️'} activado`, 'info');
}

// ─────────────────────────────────────────────
//  SETUP CHECK
// ─────────────────────────────────────────────
function checkSetup() {
  if (!State.apiUrl) {
    Dom.bannerSetup.classList.remove('visually-hidden');
  } else {
    Dom.bannerSetup.classList.add('visually-hidden');
    Dom.fieldApiUrl.value = State.apiUrl;
  }
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
function bindEventListeners() {

  // Theme
  Dom.btnTheme.addEventListener('click', toggleTheme);

  // Open modals
  Dom.btnSettings.addEventListener('click', () => openModal(Dom.modalSettings));
  Dom.btnBannerSettings.addEventListener('click', () => openModal(Dom.modalSettings));
  Dom.btnNewPrompt.addEventListener('click', () => openPromptModal());
  Dom.btnFab.addEventListener('click', () => openPromptModal());
  Dom.btnEmptyCreate.addEventListener('click', () => openPromptModal());

  // Close modals — buttons
  Dom.btnClosePromptModal.addEventListener('click', () => closeModal(Dom.modalPrompt));
  Dom.btnCancelPrompt.addEventListener('click', () => closeModal(Dom.modalPrompt));
  Dom.btnCloseSettings.addEventListener('click', () => closeModal(Dom.modalSettings));
  Dom.btnCancelSettings.addEventListener('click', () => closeModal(Dom.modalSettings));
  Dom.btnConfirmCancel.addEventListener('click', () => closeModal(Dom.modalConfirm));

  // Close modals — backdrops
  Dom.modalPromptBackdrop.addEventListener('click', () => closeModal(Dom.modalPrompt));
  Dom.modalSettingsBackdrop.addEventListener('click', () => closeModal(Dom.modalSettings));
  Dom.modalConfirmBackdrop.addEventListener('click', () => closeModal(Dom.modalConfirm));

  // Keyboard close (Escape)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      [Dom.modalPrompt, Dom.modalSettings, Dom.modalConfirm].forEach(m => {
        if (m.classList.contains('is-open')) closeModal(m);
      });
    }
  });

  // Form submissions
  Dom.formSettings.addEventListener('submit', handleSettingsSave);
  Dom.formPrompt.addEventListener('submit', handlePromptSave);
  Dom.btnConfirmDelete.addEventListener('click', handleConfirmDelete);

  // Retry
  Dom.btnRetry.addEventListener('click', fetchPrompts);

  // Search
  Dom.inputSearch.addEventListener('input', e => {
    State.searchQuery = e.target.value.trim().toLowerCase();
    const hasTerm = State.searchQuery.length > 0;
    Dom.btnClearSearch.classList.toggle('visually-hidden', !hasTerm);
    renderFiltered();
  });
  Dom.btnClearSearch.addEventListener('click', () => {
    Dom.inputSearch.value = '';
    State.searchQuery = '';
    Dom.btnClearSearch.classList.add('visually-hidden');
    renderFiltered();
    Dom.inputSearch.focus();
  });

  // Prompt textarea char counter
  Dom.fieldPrompt.addEventListener('input', () => {
    Dom.charCount.textContent = Dom.fieldPrompt.value.length.toLocaleString();
  });

  // Autocomplete for category
  Dom.fieldCategoria.addEventListener('input', renderAutocomplete);
  Dom.fieldCategoria.addEventListener('focus', renderAutocomplete);
  document.addEventListener('click', e => {
    if (!Dom.fieldCategoria.contains(e.target) && !Dom.autocompleteList.contains(e.target)) {
      hideAutocomplete();
    }
  });

  // Keyboard navigation in autocomplete
  Dom.fieldCategoria.addEventListener('keydown', handleAutocompleteKeys);
}

// ─────────────────────────────────────────────
//  MODAL CONTROLLER
// ─────────────────────────────────────────────
function openModal(modal) {
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  // Focus first focusable element
  const first = modal.querySelector('input, textarea, button:not(.modal__close)');
  if (first) setTimeout(() => first.focus(), 80);
}

function closeModal(modal) {
  modal.classList.remove('is-open');
  document.body.style.overflow = '';
}

function openPromptModal(data = null) {
  // Require API URL configured
  if (!State.apiUrl) {
    toast('Primero debes configurar la URL de la API', 'error');
    openModal(Dom.modalSettings);
    return;
  }

  // Reset form
  Dom.formPrompt.reset();
  Dom.fieldId.value = '';
  Dom.charCount.textContent = '0';
  hideAutocomplete();

  if (data) {
    // Edit mode
    Dom.modalPromptTitle.textContent = 'Editar Prompt';
    Dom.fieldId.value = data.id;
    Dom.fieldCategoria.value = data.categoria;
    Dom.fieldNombre.value = data.nombre;
    Dom.fieldPrompt.value = data.prompt;
    Dom.fieldEjemplos.value = data.ejemplos;
    Dom.charCount.textContent = data.prompt.length.toLocaleString();
    Dom.btnSavePrompt.querySelector('.btn-label').textContent = 'Guardar Cambios';
  } else {
    // Create mode
    Dom.modalPromptTitle.textContent = 'Nuevo Prompt';
    Dom.btnSavePrompt.querySelector('.btn-label').textContent = 'Crear Prompt';
  }

  openModal(Dom.modalPrompt);
}

// ─────────────────────────────────────────────
//  SETTINGS HANDLER
// ─────────────────────────────────────────────
function handleSettingsSave(e) {
  e.preventDefault();
  const url = Dom.fieldApiUrl.value.trim();

  if (!url.startsWith('https://script.google.com/')) {
    toast('Introduce una URL válida de Google Apps Script', 'error');
    return;
  }

  State.apiUrl = url;
  localStorage.setItem('pf_api_url', url);
  closeModal(Dom.modalSettings);
  checkSetup();
  toast('Configuración guardada. Cargando datos…', 'success');
  fetchPrompts();
}

// ─────────────────────────────────────────────
//  API — READ (doGet)
// ─────────────────────────────────────────────
async function fetchPrompts() {
  if (!State.apiUrl) return;

  setView('loading');

  try {
    const res = await fetch(State.apiUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Error en el servidor');

    State.prompts = json.data || [];
    rebuildCategories();
    renderCategoryTabs();
    renderFiltered();

    Dom.statsCount.textContent = State.prompts.length;

  } catch (err) {
    console.error('[fetchPrompts]', err);
    Dom.errorMsg.textContent = err.message;
    setView('error');
  }
}

// ─────────────────────────────────────────────
//  API — CREATE / UPDATE (doPost)
// ─────────────────────────────────────────────
async function handlePromptSave(e) {
  e.preventDefault();

  const id = Dom.fieldId.value.trim();
  const isEdit = Boolean(id);

  const payload = {
    categoria: Dom.fieldCategoria.value.trim(),
    nombre: Dom.fieldNombre.value.trim(),
    prompt: Dom.fieldPrompt.value.trim(),
    ejemplos: Dom.fieldEjemplos.value.trim()
  };
  if (isEdit) payload.id = id;

  // Validate required
  if (!payload.categoria || !payload.nombre || !payload.prompt) {
    toast('Completa los campos obligatorios (*)', 'error');
    return;
  }

  setBtnLoading(Dom.btnSavePrompt, true);

  try {
    const res = await apiPost(isEdit ? 'update' : 'create', payload);
    if (!res.success) throw new Error(res.error || 'Error desconocido');

    toast(isEdit ? 'Prompt actualizado ✓' : 'Prompt creado ✓', 'success');
    closeModal(Dom.modalPrompt);
    fetchPrompts();

  } catch (err) {
    console.error('[handlePromptSave]', err);
    toast(`Error: ${err.message}`, 'error');
  } finally {
    setBtnLoading(Dom.btnSavePrompt, false);
  }
}

// ─────────────────────────────────────────────
//  API — DELETE (doPost)
// ─────────────────────────────────────────────
function requestDelete(id) {
  State.pendingDelete = id;
  openModal(Dom.modalConfirm);
}

async function handleConfirmDelete() {
  const id = State.pendingDelete;
  if (!id) return;

  setBtnLoading(Dom.btnConfirmDelete, true);

  try {
    const res = await apiPost('delete', { id });
    if (!res.success) throw new Error(res.error || 'Error desconocido');

    toast('Prompt eliminado', 'success');
    closeModal(Dom.modalConfirm);
    State.pendingDelete = null;
    fetchPrompts();

  } catch (err) {
    console.error('[handleConfirmDelete]', err);
    toast(`Error al eliminar: ${err.message}`, 'error');
  } finally {
    setBtnLoading(Dom.btnConfirmDelete, false);
  }
}

// ─────────────────────────────────────────────
//  API HELPER — POST wrapper
// ─────────────────────────────────────────────
async function apiPost(action, payload) {
  const res = await fetch(State.apiUrl, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify({ action, payload })
    // Note: no Content-Type header to avoid CORS preflight
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
//  RENDER — Manage visible view state
// ─────────────────────────────────────────────
function setView(view) {
  const hide = el => el.classList.add('visually-hidden');
  const show = el => el.classList.remove('visually-hidden');

  hide(Dom.stateLoading);
  hide(Dom.stateError);
  hide(Dom.stateEmpty);
  // grid is managed separately
  Dom.promptsGrid.innerHTML = '';

  if (view === 'loading') show(Dom.stateLoading);
  if (view === 'error') show(Dom.stateError);
  if (view === 'empty') show(Dom.stateEmpty);
}

// ─────────────────────────────────────────────
//  RENDER — Category tabs
// ─────────────────────────────────────────────
function rebuildCategories() {
  State.categories.clear();
  State.prompts.forEach(p => {
    if (p.categoria) State.categories.add(p.categoria.trim());
  });
}

function renderCategoryTabs() {
  const sorted = Array.from(State.categories).sort();
  const frag = document.createDocumentFragment();

  const makeTab = (label, value) => {
    const btn = document.createElement('button');
    btn.className = `tab${State.activeFilter === value ? ' tab--active' : ''}`;
    btn.textContent = label;
    btn.dataset.cat = value;
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => {
      State.activeFilter = value;
      Dom.categoryTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
      btn.classList.add('tab--active');
      renderFiltered();
    });
    return btn;
  };

  frag.appendChild(makeTab('Todos', 'all'));
  sorted.forEach(cat => frag.appendChild(makeTab(cat, cat)));

  Dom.categoryTabs.innerHTML = '';
  Dom.categoryTabs.appendChild(frag);
}

// ─────────────────────────────────────────────
//  RENDER — Filter & render card grid
// ─────────────────────────────────────────────
function renderFiltered() {
  let list = State.prompts;

  if (State.activeFilter !== 'all') {
    list = list.filter(p => p.categoria === State.activeFilter);
  }

  if (State.searchQuery) {
    const q = State.searchQuery;
    list = list.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.categoria.toLowerCase().includes(q) ||
      p.prompt.toLowerCase().includes(q) ||
      p.ejemplos.toLowerCase().includes(q)
    );
  }

  Dom.promptsGrid.innerHTML = '';
  Dom.statsCount.textContent = State.prompts.length;

  if (list.length === 0) {
    setView('empty');
    return;
  }

  // Hide state views, show grid
  Dom.stateLoading.classList.add('visually-hidden');
  Dom.stateError.classList.add('visually-hidden');
  Dom.stateEmpty.classList.add('visually-hidden');

  const frag = document.createDocumentFragment();
  list.forEach(p => frag.appendChild(buildCard(p)));
  Dom.promptsGrid.appendChild(frag);
}

// ─────────────────────────────────────────────
//  RENDER — Single prompt card
// ─────────────────────────────────────────────
function buildCard(p) {
  const catClass = getCatClass(p.categoria);
  const article = document.createElement('article');
  article.className = `card ${catClass}`;
  article.dataset.id = p.id;
  article.setAttribute('role', 'listitem');

  const examplesHtml = p.ejemplos
    ? `<div class="card__examples">
         <div class="card__examples-label">Ejemplos</div>
         <div class="card__examples-text">${html(p.ejemplos)}</div>
       </div>`
    : '';

  article.innerHTML = `
    <div class="card__strip" aria-hidden="true"></div>
    <div class="card__head">
      <div class="card__meta">
        <span class="pill">${html(p.categoria || 'Sin categoría')}</span>
      </div>
      <h3 class="card__title">${html(p.nombre)}</h3>
    </div>
    <div class="card__body">
      <div class="card__prompt-wrap">
        <button class="btn-copy" title="Copiar prompt" aria-label="Copiar al portapapeles">
          <svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true" style="display:none">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <div class="card__prompt-text">${html(p.prompt)}</div>
        <div class="card__prompt-fade" aria-hidden="true"></div>
      </div>
      ${examplesHtml}
    </div>
    <div class="card__foot">
      <button class="btn-card btn-edit" aria-label="Editar prompt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Editar
      </button>
      <button class="btn-card btn-del" aria-label="Eliminar prompt">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Eliminar
      </button>
    </div>
  `;

  // Bind events on the card
  const promptData = State.prompts.find(x => x.id === p.id) || p;

  article.querySelector('.btn-copy').addEventListener('click', e => {
    e.stopPropagation();
    copyPrompt(p.prompt, article.querySelector('.btn-copy'));
  });

  article.querySelector('.btn-edit').addEventListener('click', () => openPromptModal(promptData));
  article.querySelector('.btn-del').addEventListener('click', () => requestDelete(p.id));

  return article;
}

// ─────────────────────────────────────────────
//  CATEGORY COLOR ASSIGNMENT
// ─────────────────────────────────────────────
const catColorMap = new Map();
let catColorIndex = 0;
const NUM_COLORS = 8;

function getCatClass(category) {
  if (!category) return 'cat-0';
  const key = category.trim().toLowerCase();
  if (!catColorMap.has(key)) {
    catColorMap.set(key, `cat-${catColorIndex % NUM_COLORS}`);
    catColorIndex++;
  }
  return catColorMap.get(key);
}

// ─────────────────────────────────────────────
//  COPY TO CLIPBOARD
// ─────────────────────────────────────────────
function copyPrompt(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const iconCopy = btn.querySelector('.icon-copy');
    const iconCheck = btn.querySelector('.icon-check');

    btn.classList.add('copied');
    iconCopy.style.display = 'none';
    iconCheck.style.display = 'block';

    toast('Prompt copiado al portapapeles', 'success');

    setTimeout(() => {
      btn.classList.remove('copied');
      iconCopy.style.display = '';
      iconCheck.style.display = 'none';
    }, 2200);

  }).catch(() => toast('No se pudo copiar el texto', 'error'));
}

// ─────────────────────────────────────────────
//  AUTOCOMPLETE — Category suggestions
// ─────────────────────────────────────────────
let acFocusedIndex = -1;

function renderAutocomplete() {
  const val = Dom.fieldCategoria.value.trim().toLowerCase();
  const allCats = Array.from(State.categories).sort();
  const filtered = val
    ? allCats.filter(c => c.toLowerCase().includes(val))
    : allCats;

  if (filtered.length === 0) { hideAutocomplete(); return; }

  acFocusedIndex = -1;
  Dom.autocompleteList.innerHTML = '';

  filtered.forEach((cat, i) => {
    const li = document.createElement('li');
    li.className = 'autocomplete-item';
    li.textContent = cat;
    li.setAttribute('role', 'option');
    li.setAttribute('id', `ac-item-${i}`);
    li.addEventListener('mousedown', e => {
      e.preventDefault(); // don't blur input
      Dom.fieldCategoria.value = cat;
      hideAutocomplete();
    });
    Dom.autocompleteList.appendChild(li);
  });

  Dom.autocompleteList.classList.remove('visually-hidden');
}

function hideAutocomplete() {
  Dom.autocompleteList.classList.add('visually-hidden');
  Dom.autocompleteList.innerHTML = '';
  acFocusedIndex = -1;
}

function handleAutocompleteKeys(e) {
  const items = Dom.autocompleteList.querySelectorAll('.autocomplete-item');
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    acFocusedIndex = Math.min(acFocusedIndex + 1, items.length - 1);
    updateAcFocus(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    acFocusedIndex = Math.max(acFocusedIndex - 1, 0);
    updateAcFocus(items);
  } else if (e.key === 'Enter' && acFocusedIndex >= 0) {
    e.preventDefault();
    Dom.fieldCategoria.value = items[acFocusedIndex].textContent;
    hideAutocomplete();
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
}

function updateAcFocus(items) {
  items.forEach((li, i) => {
    li.classList.toggle('is-focused', i === acFocusedIndex);
  });
  if (acFocusedIndex >= 0) items[acFocusedIndex].scrollIntoView({ block: 'nearest' });
}

// ─────────────────────────────────────────────
//  TOAST NOTIFICATIONS
// ─────────────────────────────────────────────
const TOAST_ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};

function toast(message, type = 'info', duration = 3600) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="toast__body">
      ${TOAST_ICONS[type] || TOAST_ICONS.info}
      <span>${html(message)}</span>
    </div>
    <button class="toast__close" aria-label="Cerrar notificación">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;

  Dom.toastContainer.appendChild(el);

  const dismiss = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(12px)';
    setTimeout(() => el.remove(), 260);
  };

  el.querySelector('.toast__close').addEventListener('click', dismiss);
  setTimeout(dismiss, duration);
}

// ─────────────────────────────────────────────
//  BUTTON LOADING STATE
// ─────────────────────────────────────────────
function setBtnLoading(btn, loading) {
  const label = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  if (label) label.classList.toggle('visually-hidden', loading);
  if (spinner) spinner.classList.toggle('visually-hidden', !loading);
}

// ─────────────────────────────────────────────
//  UTILITY — HTML escaping (XSS prevention)
// ─────────────────────────────────────────────
function html(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
