import { CONFIG, TYPES } from './config.js';
import { createStore, getEditKey, saveEditKey } from './store.js';
import { makeDemoProjects } from './demo.js';
import { MapView } from './map.js';
import { renderDetail, initLightbox } from './detail.js';
import { renderForm, renderSuccess } from './form.js';
import { ICONS } from './icons.js';
import { $, $$, esc, normalize, debounce, toast, plural } from './util.js';

const params = new URLSearchParams(location.search);
const showDemo = params.get('demo') === '1' || (CONFIG.demoData && params.get('demo') !== '0');

const state = {
  projects: new Map(),
  type: 'all',
  q: [],
  dept: '',
  tags: new Map(), // normalized → label
  drawer: null, // { kind, id?, dispose?, isDirty? }
};
let store = null;
let mapView;

const isMobile = () => matchMedia('(max-width: 760px)').matches;

/** Screen space covered by floating panels, so the map centers in what is still visible. */
function mapPadding() {
  const body = document.body;
  const drawerOpen = body.classList.contains('drawer-open');
  if (isMobile()) {
    const top = $('#filters').getBoundingClientRect().bottom + 12;
    const sheet = drawerOpen && !body.classList.contains('sheet-peek') ? $('#drawer').getBoundingClientRect().height : 90;
    return { topLeft: [12, top], bottomRight: [12, sheet + 12] };
  }
  const filtersVisible = !body.classList.contains('form-open');
  const left = filtersVisible ? $('#filters').getBoundingClientRect().right + 16 : 24;
  const right = drawerOpen ? $('#drawer').getBoundingClientRect().width + 24 : 24;
  return { topLeft: [left, 24], bottomRight: [right, 24] };
}

/* ---------- filtering ---------- */

function matches(p, skip = '') {
  if (skip !== 'type' && state.type !== 'all' && p.type !== state.type) return false;
  if (skip !== 'dept' && state.dept && p.departamento !== state.dept) return false;
  if (state.q.length) {
    const hay = normalize([p.title, p.students.join(' '), p.ciudad, p.departamento, p.description, p.tags.join(' ')].join(' '));
    if (!state.q.every((t) => hay.includes(t))) return false;
  }
  if (skip !== 'tags' && state.tags.size) {
    const own = new Set(p.tags.map(normalize));
    for (const t of state.tags.keys()) if (!own.has(t)) return false;
  }
  return true;
}

const hasFilters = () => state.type !== 'all' || state.dept || state.q.length || state.tags.size;

function refresh() {
  const all = [...state.projects.values()];
  const visible = all.filter((p) => matches(p));
  mapView.setProjects(visible);

  $('#result-count').textContent =
    visible.length === all.length ? plural(all.length, 'proyecto', 'proyectos') : `${visible.length} de ${plural(all.length, 'proyecto', 'proyectos')}`;

  const byType = all.filter((p) => matches(p, 'type'));
  $$('#type-filter [data-type]').forEach((b) => {
    const t = b.dataset.type;
    b.querySelector('span').textContent = t === 'all' ? byType.length : byType.filter((p) => p.type === t).length;
    b.setAttribute('aria-checked', String(t === state.type));
  });

  renderDeptOptions(all.filter((p) => matches(p, 'dept')));
  renderTagCloud(all.filter((p) => matches(p, 'tags')));
  $('#clear-filters').hidden = !hasFilters();
}

function renderDeptOptions(list) {
  const counts = new Map();
  list.forEach((p) => counts.set(p.departamento, (counts.get(p.departamento) || 0) + 1));
  if (state.dept && !counts.has(state.dept)) counts.set(state.dept, 0);
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  $('#dept-filter').innerHTML =
    `<option value="">Todos los departamentos</option>` +
    names.map((n) => `<option value="${esc(n)}" ${n === state.dept ? 'selected' : ''}>${esc(n)} (${counts.get(n)})</option>`).join('');
}

function renderTagCloud(list) {
  const counts = new Map();
  for (const p of list) {
    for (const t of p.tags) {
      const k = normalize(t);
      const c = counts.get(k) || { label: t, n: 0 };
      c.n++;
      counts.set(k, c);
    }
  }
  for (const [k, label] of state.tags) if (!counts.has(k)) counts.set(k, { label, n: 0 });
  const items = [...counts.entries()]
    .sort((a, b) => Number(state.tags.has(b[0])) - Number(state.tags.has(a[0])) || b[1].n - a[1].n || a[1].label.localeCompare(b[1].label, 'es'))
    .slice(0, 28);
  $('#tag-cloud').innerHTML = items.length
    ? items
        .map(
          ([k, { label, n }]) =>
            `<button type="button" class="chip ${state.tags.has(k) ? 'is-on' : ''}" data-tag="${esc(label)}" aria-pressed="${state.tags.has(k)}">${esc(label)}<small>${n}</small></button>`,
        )
        .join('')
    : '<p class="muted">Aún no hay etiquetas.</p>';
}

function toggleTag(label, only = false) {
  const k = normalize(label);
  if (only) {
    state.tags.clear();
    state.tags.set(k, label);
  } else if (state.tags.has(k)) state.tags.delete(k);
  else state.tags.set(k, label);
  refresh();
}

function clearFilters() {
  state.type = 'all';
  state.dept = '';
  state.q = [];
  state.tags.clear();
  $('#search').value = '';
  refresh();
  mapView.fit();
}

/* ---------- drawer (detail / form / success) ---------- */

function openDrawer(kind, el, extra = {}) {
  if (!closeDrawer(true)) return;
  $('#drawer-content').replaceChildren(el);
  $('#drawer').dataset.kind = kind;
  $('#drawer').setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  document.body.classList.toggle('form-open', kind === 'form');
  state.drawer = { kind, ...extra };
  $('.drawer-body', el)?.scrollTo(0, 0);
}

function closeDrawer(force = false) {
  const d = state.drawer;
  if (!d) return true;
  if (!force && d.isDirty?.() && !confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return false;
  d.dispose?.();
  state.drawer = null;
  $('#drawer').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open', 'form-open', 'sheet-peek');
  mapView.select(null);
  setUrl({ p: null });
  return true;
}

function openDetail(id, { focus = false } = {}) {
  const p = state.projects.get(id);
  if (!p || state.drawer?.kind === 'form') return;
  const el = renderDetail(p, {
    canEdit: !p.demo && Boolean(getEditKey(p.id)),
    onClose: () => closeDrawer(),
    onEdit: () => openForm(p),
    onTag: (tag) => toggleTag(tag, true),
    onLocate: () => mapView.focus(p.id),
    onShare: () => copyLink(p),
  });
  openDrawer('detail', el, { id });
  mapView.select(id);
  setUrl({ p: id });
  // Wait for the panel to slide in before panning the bubble into view.
  setTimeout(() => (focus ? mapView.focus(id) : mapView.ensureVisible(id)), 320);
}

function openForm(project = null, prefill = {}) {
  if (state.drawer?.kind === 'form' && !closeDrawer()) return;
  if (!store) return toast('El almacenamiento no está disponible.');
  const form = renderForm(project, {
    prefill,
    mapView,
    store,
    onClose: () => closeDrawer(),
    onSaved: (saved, editKey) => afterSave(saved, editKey, Boolean(project)),
    onDeleted: () => {
      closeDrawer(true);
      toast('Proyecto eliminado.');
    },
  });
  openDrawer('form', form.el, { dispose: form.dispose, isDirty: form.isDirty });
  setTimeout(() => form.start(), 320);
}

function afterSave(p, editKey, wasEdit) {
  state.projects.set(p.id, p);
  refresh();
  closeDrawer(true);
  if (wasEdit) {
    toast('Cambios guardados.');
    openDetail(p.id, { focus: true });
    return;
  }
  const el = renderSuccess(p, editKey, {
    onClose: () => closeDrawer(),
    onView: () => openDetail(p.id, { focus: true }),
    onAnother: (type) => openForm(null, { type, students: type === 'artefacto' ? p.students : [] }),
  });
  openDrawer('success', el, { id: p.id });
  setTimeout(() => mapView.focus(p.id), 320);
}

function onStoreEvent(ev) {
  if (ev.type === 'status') return renderModeBadge();
  if (ev.type === 'delete') {
    state.projects.delete(ev.id);
    if (state.drawer?.kind === 'detail' && state.drawer.id === ev.id) closeDrawer(true);
  } else {
    const isNew = !state.projects.has(ev.project.id);
    state.projects.set(ev.project.id, ev.project);
    if (state.drawer?.kind === 'detail' && state.drawer.id === ev.project.id) openDetail(ev.project.id);
    if (isNew && state.drawer?.kind !== 'form' && state.drawer?.kind !== 'success') toast(`Nuevo proyecto: ${ev.project.title}`);
  }
  refresh();
}

/* ---------- links ---------- */

function setUrl(changes) {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  history.replaceState(null, '', url);
}

async function copyLink(p) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('p', p.id);
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Enlace copiado.');
  } catch {
    prompt('Copia este enlace:', url.href);
  }
}

function handleDeepLinks() {
  const editId = params.get('editar');
  const key = params.get('clave');
  if (editId && key) {
    saveEditKey(editId, key);
    setUrl({ editar: null, clave: null });
    const p = state.projects.get(editId);
    if (p) openForm(p);
    else toast('No se encontró el proyecto de este enlace.');
    return;
  }
  const id = params.get('p');
  if (id && state.projects.has(id)) openDetail(id, { focus: true });
}

/* ---------- UI wiring ---------- */

function renderModeBadge() {
  const badge = $('#mode-badge');
  const parts = [];
  if (!store) parts.push('<b>Sin conexión</b> · no se pudieron cargar los proyectos');
  else if (store.mode === 'local') parts.push('<b>Modo de prueba local</b> · los proyectos se guardan solo en este navegador');
  else if (store.status === 'SUBSCRIBED') parts.push('<i class="live-dot"></i><b>En vivo</b> · los proyectos nuevos aparecen solos');
  else parts.push('<b>Conectando…</b>');
  if (showDemo) {
    const demoCount = [...state.projects.values()].filter((p) => p.demo).length;
    parts.push(`${plural(demoCount, 'proyecto', 'proyectos')} de ejemplo · <a href="?demo=0">ocultar</a>`);
  } else if (CONFIG.demoData) {
    parts.push('ejemplos ocultos · <a href="?">mostrar</a>');
  }
  badge.innerHTML = parts.join(' · ');
  badge.hidden = !parts.length;
}

function wireUI() {
  document.title = `${CONFIG.title} · ${CONFIG.subtitle}`;
  $('#app-title').textContent = CONFIG.title;
  $('#app-subtitle').textContent = CONFIG.subtitle;
  $('#open-upload').innerHTML = `${ICONS.plus}<span>Subir proyecto</span>`;
  $('#zoom-in').innerHTML = ICONS.plus;
  $('#zoom-out').innerHTML = ICONS.minus;
  $('#zoom-home').innerHTML = ICONS.frame;
  $('#filters-toggle').innerHTML = `${ICONS.filter}<span>Filtros</span>`;
  $('#placing-done').previousElementSibling.innerHTML = `${ICONS.pin}<span>Toca el mapa o arrastra el pin</span>`;

  $('#type-filter').innerHTML = [
    ['all', 'Todos'],
    ...Object.entries(TYPES).map(([k, t]) => [k, t.label]),
  ]
    .map(
      ([k, label]) =>
        `<button type="button" role="radio" data-type="${k}" aria-checked="false">${k === 'all' ? '' : `<i class="dot dot--${k}"></i>`}${label}<span></span></button>`,
    )
    .join('');

  $('#type-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    state.type = b.dataset.type;
    refresh();
  });
  $('#search').addEventListener(
    'input',
    debounce((e) => {
      state.q = normalize(e.target.value).split(/\s+/).filter(Boolean);
      refresh();
    }, 180),
  );
  $('#dept-filter').addEventListener('change', (e) => {
    state.dept = e.target.value;
    refresh();
    const list = [...state.projects.values()].filter((p) => matches(p));
    if (state.dept) mapView.fitTo(list);
    else mapView.fit();
  });
  $('#tag-cloud').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]');
    if (b) toggleTag(b.dataset.tag);
  });
  $('#clear-filters').addEventListener('click', clearFilters);
  $('#filters-toggle').addEventListener('click', () => {
    const open = $('#filters').classList.toggle('is-expanded');
    $('#filters-toggle').setAttribute('aria-expanded', String(open));
  });

  $('#open-upload').addEventListener('click', () => openForm());
  $('#zoom-in').addEventListener('click', () => mapView.zoomIn());
  $('#zoom-out').addEventListener('click', () => mapView.zoomOut());
  $('#zoom-home').addEventListener('click', () => mapView.fit());
  $('#placing-done').addEventListener('click', () => {
    document.body.classList.remove('sheet-peek');
    setTimeout(() => mapView.centerPlacePin(), 300);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.drawer) closeDrawer();
  });
  window.addEventListener('beforeunload', (e) => {
    if (state.drawer?.isDirty?.()) e.preventDefault();
  });
}

async function main() {
  mapView = new MapView($('#map'), { onSelect: (id) => openDetail(id), padding: mapPadding });
  initLightbox();
  wireUI();

  try {
    store = await createStore();
    store.subscribe(onStoreEvent);
    for (const p of await store.list()) state.projects.set(p.id, p);
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudieron cargar los proyectos.');
  }
  if (showDemo) for (const p of makeDemoProjects()) state.projects.set(p.id, p);

  renderModeBadge();
  refresh();
  handleDeepLinks();
  window.perumap = { mapView, state, store }; // handy for debugging in the browser console
}

main();
