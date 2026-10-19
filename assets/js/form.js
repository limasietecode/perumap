import { CONFIG, TYPES } from './config.js';
import { DEPARTAMENTOS, getDepartamento, findCity, lngLatToPixel, pixelToLngLat } from './geo.js';
import { prepareImage } from './images.js';
import { ICONS } from './icons.js';
import { getEditKey } from './store.js';
import { $, $$, esc, normalize, parseTags, toast } from './util.js';

const LIM = CONFIG.limits;
const { width: W, height: H } = CONFIG.map;
const MB = 1024 * 1024;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function findCityAnywhere(name) {
  const n = normalize(name);
  for (const d of DEPARTAMENTOS) {
    const c = d.cities.find((x) => normalize(x.name) === n);
    if (c) return { dept: d.name, city: c };
  }
  return null;
}

/**
 * Upload / edit form shown in the side panel.
 * @param project  existing project to edit, or null for a new one
 * @param prefill  optional { type, students } for a new project
 */
export function renderForm(project, { prefill = {}, mapView, store, onClose, onSaved, onDeleted }) {
  const editing = Boolean(project);
  const src = project || prefill;
  const s = {
    type: src.type || '',
    students: src.students?.length ? [...src.students] : [''],
    pos: project ? { x: project.x, y: project.y } : null,
    cityKey: project ? normalize(project.ciudad) : '',
    images: (project?.images || []).map((im) => ({ keep: { id: im.id, w: im.w, h: im.h }, preview: im.thumb || im.url })),
    urls: [],
    dirty: false,
    busy: false,
    submitted: false,
    disposed: false,
  };

  const el = document.createElement('form');
  el.className = 'pform';
  el.noValidate = true;
  el.innerHTML = `
    <header class="drawer-head">
      <div>
        <p class="eyebrow">${editing ? 'Editar proyecto' : 'Nuevo proyecto'}</p>
        <h2 class="form-title">${editing ? esc(project.title) : 'Subir proyecto'}</h2>
      </div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${ICONS.close}</button>
    </header>

    <div class="drawer-body">
      ${
        editing
          ? ''
          : `<p class="form-intro">Sube cada proyecto por separado: primero tu <b>Artefacto</b> (grupal) y después tu <b>Unidad</b> (individual).</p>`
      }

      <fieldset class="step" data-step="type">
        <legend class="step-label"><span class="step-n">1</span>Tipo de proyecto</legend>
        <div class="type-cards">
          ${Object.entries(TYPES)
            .map(
              ([k, t]) => `
            <label class="type-card type-card--${k}">
              <input type="radio" name="type" value="${k}" ${s.type === k ? 'checked' : ''}>
              <span class="type-card__dot"></span>
              <b>${esc(t.label)}</b>
              <small>${esc(t.hint)}</small>
            </label>`,
            )
            .join('')}
        </div>
        <p class="error" data-error="type"></p>
      </fieldset>

      <div class="step" data-step="title">
        <label class="step-label" for="pf-title"><span class="step-n">2</span>Título del proyecto</label>
        <input id="pf-title" name="title" maxlength="${LIM.titleMax}" value="${esc(project?.title)}" placeholder="Ej. Vivienda productiva en Chinchero" autocomplete="off">
        <p class="error" data-error="title"></p>
      </div>

      <fieldset class="step" data-step="students">
        <legend class="step-label"><span class="step-n">3</span><span data-students-label></span></legend>
        <div class="students" data-students></div>
        <button type="button" class="link-btn" data-act="add-student">${ICONS.plus}<span>Agregar integrante</span></button>
        <p class="error" data-error="students"></p>
      </fieldset>

      <fieldset class="step" data-step="location">
        <legend class="step-label"><span class="step-n">4</span>Ubicación</legend>
        <div class="row-2">
          <label class="field">
            <span>Departamento</span>
            <select name="departamento">
              <option value="">Elegir…</option>
              ${DEPARTAMENTOS.map((d) => `<option ${d.name === project?.departamento ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>Ciudad o localidad</span>
            <input name="ciudad" list="pf-cities" value="${esc(project?.ciudad)}" maxlength="60" placeholder="Ej. Cusco" autocomplete="off">
            <datalist id="pf-cities"></datalist>
          </label>
        </div>
        <div class="pin-status" data-pin-status></div>
        <button type="button" class="btn btn--ghost btn--block only-mobile" data-act="place">${ICONS.pin}<span>Ubicar en el mapa</span></button>
        <p class="error" data-error="location"></p>
      </fieldset>

      <div class="step" data-step="description">
        <label class="step-label" for="pf-desc"><span class="step-n">5</span>Descripción breve</label>
        <textarea id="pf-desc" name="description" maxlength="${LIM.descriptionMax}" rows="3" placeholder="¿Qué es y cómo responde a su contexto?">${esc(project?.description)}</textarea>
        <p class="counter"><span data-desc-count>0</span>/${LIM.descriptionMax}</p>
        <p class="error" data-error="description"></p>
      </div>

      <div class="step" data-step="tags">
        <label class="step-label" for="pf-tags"><span class="step-n">6</span>Etiquetas del contexto</label>
        <input id="pf-tags" name="tags" value="${esc(project?.tags?.join(', '))}" placeholder="Ej. sierra, heladas, adobe, pendiente" autocomplete="off">
        <p class="hint">Sepáralas con comas. Sirven para filtrar el mapa.</p>
        <div class="chips chips--preview" data-tags-preview></div>
        <p class="error" data-error="tags"></p>
      </div>

      <div class="step" data-step="images">
        <span class="step-label"><span class="step-n">7</span>Imágenes <span class="step-aside" data-img-count></span></span>
        <div class="thumbs" data-images></div>
        <label class="dropzone" data-dropzone>
          <input type="file" accept="image/jpeg,image/png" multiple hidden>
          ${ICONS.upload}
          <b>Arrastra tus imágenes aquí</b>
          <span>o haz clic para elegirlas · JPG o PNG · entre ${LIM.minImages} y ${LIM.maxImages}</span>
        </label>
        <p class="hint">La primera imagen es la portada (usa ★ para cambiarla). Se optimizan automáticamente.</p>
        <p class="error" data-error="images"></p>
      </div>

      ${editing ? `<div class="danger-zone"><button type="button" class="link-btn link-btn--danger" data-act="delete">Eliminar este proyecto</button></div>` : ''}
    </div>

    <footer class="drawer-foot">
      <button type="button" class="btn btn--ghost" data-act="close">Cancelar</button>
      <button type="submit" class="btn btn--dark" data-submit>${editing ? 'Guardar cambios' : 'Publicar en el mapa'}</button>
    </footer>`;

  const field = (name) => el.elements.namedItem(name);
  const markDirty = () => {
    s.dirty = true;
    if (s.submitted) showErrors(check());
  };

  /* ---------- students ---------- */

  const isGroup = () => s.type === 'artefacto';
  const visibleStudents = () => (isGroup() ? s.students : s.students.slice(0, 1));

  function renderStudents() {
    $('[data-students-label]', el).textContent = isGroup() ? 'Integrantes del grupo' : s.type === 'unidad' ? 'Tu nombre' : 'Nombre(s)';
    const list = visibleStudents();
    $('[data-students]', el).innerHTML = list
      .map(
        (name, i) => `
        <div class="student-row">
          <input data-student="${i}" value="${esc(name)}" maxlength="60" placeholder="Nombre y apellido" autocomplete="off" aria-label="Integrante ${i + 1}">
          ${isGroup() && list.length > 1 ? `<button type="button" class="icon-btn icon-btn--sm" data-remove-student="${i}" aria-label="Quitar integrante">${ICONS.close}</button>` : ''}
        </div>`,
      )
      .join('');
    $('[data-act="add-student"]', el).hidden = !isGroup() || s.students.length >= LIM.maxStudents;
  }

  const cleanStudents = () =>
    visibleStudents()
      .map((n) => n.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

  /* ---------- location ---------- */

  function fillCities() {
    const d = getDepartamento(field('departamento').value);
    $('#pf-cities', el).innerHTML = (d?.cities || []).map((c) => `<option value="${esc(c.name)}"></option>`).join('');
  }

  function updatePinStatus() {
    const box = $('[data-pin-status]', el);
    box.classList.toggle('is-set', Boolean(s.pos));
    box.innerHTML = s.pos
      ? `${ICONS.pin}<span><b>Pin ubicado.</b> Arrástralo en el mapa hasta el lugar exacto del proyecto.</span>`
      : `${ICONS.pin}<span>Elige el departamento y la ciudad, o <b>haz clic en el mapa</b> para colocar el pin. Luego arrástralo al lugar exacto.</span>`;
  }

  function dropPinAtCity(city) {
    const [px, py] = lngLatToPixel(city.lng, city.lat);
    s.pos = { x: clamp01(px / W), y: clamp01(py / H) };
    s.cityKey = normalize(city.name);
    mapView.setPlacePin(s.pos.x, s.pos.y, { fly: true });
    updatePinStatus();
    markDirty();
  }

  function onPinMoved(p) {
    s.pos = p;
    updatePinStatus();
    markDirty();
  }

  field('departamento').addEventListener('change', () => {
    fillCities();
    const d = getDepartamento(field('departamento').value);
    const cityInput = field('ciudad');
    const known = cityInput.value && findCityAnywhere(cityInput.value);
    if (known && known.dept !== d?.name) cityInput.value = '';
    if (d) dropPinAtCity(findCity(d.name, cityInput.value) || d.cities[0]);
  });

  field('ciudad').addEventListener('input', () => {
    const c = findCity(field('departamento').value, field('ciudad').value);
    if (c && normalize(c.name) !== s.cityKey) dropPinAtCity(c);
  });

  /* ---------- tags & description ---------- */

  function updateCounter() {
    $('[data-desc-count]', el).textContent = field('description').value.length;
  }

  function updateTagsPreview() {
    const tags = parseTags(field('tags').value, LIM.maxTags, LIM.tagMax);
    $('[data-tags-preview]', el).innerHTML = tags.map((t) => `<span class="chip chip--static">${esc(t)}</span>`).join('');
  }

  /* ---------- images ---------- */

  function renderImages() {
    $('[data-images]', el).innerHTML = s.images
      .map(
        (im, i) => `
        <div class="thumb ${im.pending ? 'is-pending' : ''}">
          ${im.preview ? `<img src="${esc(im.preview)}" alt="Imagen ${i + 1}">` : '<span class="spinner" aria-label="Procesando"></span>'}
          ${i === 0 && !im.pending ? '<span class="thumb-badge">Portada</span>' : ''}
          ${
            im.pending
              ? ''
              : `<div class="thumb-actions">
                  ${i > 0 ? `<button type="button" data-cover="${i}" title="Usar como portada" aria-label="Usar como portada">${ICONS.star}</button>` : ''}
                  <button type="button" data-remove-img="${i}" title="Quitar" aria-label="Quitar imagen">${ICONS.close}</button>
                </div>`
          }
        </div>`,
      )
      .join('');
    $('[data-dropzone]', el).hidden = s.images.length >= LIM.maxImages;
    $('[data-img-count]', el).textContent = `${s.images.length}/${LIM.maxImages}`;
  }

  async function addFiles(fileList) {
    let files = Array.from(fileList);
    const images = files.filter((f) => ['image/jpeg', 'image/png'].includes(f.type) || /\.(jpe?g|png)$/i.test(f.name));
    if (images.length < files.length) toast('Solo se aceptan imágenes JPG o PNG.');
    files = images.filter((f) => f.size <= LIM.imageMaxMB * MB);
    if (files.length < images.length) toast(`Cada imagen debe pesar menos de ${LIM.imageMaxMB} MB.`);
    const room = LIM.maxImages - s.images.length;
    if (files.length > room) {
      toast(`Máximo ${LIM.maxImages} imágenes por proyecto.`);
      files = files.slice(0, Math.max(0, room));
    }
    if (!files.length) return;

    const entries = files.map(() => ({ pending: true }));
    s.images.push(...entries);
    renderImages();
    markDirty();
    // One at a time keeps memory low with large phone photos.
    for (const [i, file] of files.entries()) {
      const entry = entries[i];
      try {
        entry.file = await prepareImage(file, LIM);
        entry.preview = URL.createObjectURL(entry.file.thumb);
        s.urls.push(entry.preview);
        entry.pending = false;
      } catch (err) {
        console.error(err);
        s.images.splice(s.images.indexOf(entry), 1);
        toast(`No se pudo procesar «${file.name}».`);
      }
      if (s.disposed) return;
      renderImages();
    }
    if (s.submitted) showErrors(check());
  }

  const fileInput = $('input[type="file"]', el);
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  const dz = $('[data-dropzone]', el);
  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('is-over');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('is-over');
    addFiles(e.dataTransfer.files);
  });

  /* ---------- validation ---------- */

  function check() {
    const e = {};
    if (!s.type) e.type = 'Elige si es Artefacto o Unidad.';
    if (field('title').value.trim().length < 3) e.title = 'Escribe un título (mínimo 3 caracteres).';
    if (!cleanStudents().length) e.students = isGroup() ? 'Escribe el nombre de al menos un integrante.' : 'Escribe tu nombre.';
    if (!field('departamento').value || !field('ciudad').value.trim()) e.location = 'Elige el departamento y escribe la ciudad o localidad.';
    else if (!s.pos) e.location = 'Ubica el pin en el mapa.';
    if (!field('description').value.trim()) e.description = 'Escribe una descripción breve.';
    if (!parseTags(field('tags').value).length) e.tags = 'Agrega al menos una etiqueta.';
    if (s.images.some((im) => im.pending)) e.images = 'Espera a que terminen de procesarse las imágenes.';
    else if (s.images.length < LIM.minImages) e.images = `Sube entre ${LIM.minImages} y ${LIM.maxImages} imágenes.`;
    return e;
  }

  function showErrors(errors) {
    $$('[data-error]', el).forEach((p) => {
      const msg = errors[p.dataset.error] || '';
      p.textContent = msg;
      p.closest('.step')?.classList.toggle('has-error', Boolean(msg));
    });
  }

  function setBusy(busy, label) {
    s.busy = busy;
    const btn = $('[data-submit]', el);
    btn.disabled = busy;
    btn.textContent = busy ? label : editing ? 'Guardar cambios' : 'Publicar en el mapa';
    el.classList.toggle('is-busy', busy);
  }

  /* ---------- events ---------- */

  el.addEventListener('input', (e) => {
    const i = e.target.dataset.student;
    if (i !== undefined) s.students[Number(i)] = e.target.value;
    if (e.target.name === 'description') updateCounter();
    if (e.target.name === 'tags') updateTagsPreview();
    markDirty();
  });

  el.addEventListener('change', (e) => {
    if (e.target.name !== 'type') return;
    s.type = e.target.value;
    mapView.setPlaceType(s.type);
    renderStudents();
    markDirty();
  });

  el.addEventListener('click', async (e) => {
    const t = e.target;
    const cover = t.closest('[data-cover]');
    if (cover) {
      const [im] = s.images.splice(Number(cover.dataset.cover), 1);
      s.images.unshift(im);
      renderImages();
      return markDirty();
    }
    const rmImg = t.closest('[data-remove-img]');
    if (rmImg) {
      s.images.splice(Number(rmImg.dataset.removeImg), 1);
      renderImages();
      return markDirty();
    }
    const rmStudent = t.closest('[data-remove-student]');
    if (rmStudent) {
      s.students.splice(Number(rmStudent.dataset.removeStudent), 1);
      renderStudents();
      return markDirty();
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'close') onClose();
    else if (act === 'add-student') {
      s.students.push('');
      renderStudents();
      $(`[data-student="${s.students.length - 1}"]`, el)?.focus();
    } else if (act === 'place') {
      document.body.classList.add('sheet-peek');
      setTimeout(() => mapView.centerPlacePin(), 300);
    } else if (act === 'delete') {
      if (!confirm('¿Eliminar este proyecto del mapa? Esta acción no se puede deshacer.')) return;
      setBusy(true, 'Eliminando…');
      try {
        await store.remove(project.id, getEditKey(project.id));
        s.dirty = false;
        onDeleted(project.id);
      } catch (err) {
        console.error(err);
        toast(err.message || 'No se pudo eliminar.');
        setBusy(false);
      }
    }
  });

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (s.busy) return;
    s.submitted = true;
    const errors = check();
    showErrors(errors);
    if (Object.keys(errors).length) {
      $('.step.has-error', el)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const [lng, lat] = pixelToLngLat(s.pos.x * W, s.pos.y * H);
    const fields = {
      type: s.type,
      title: field('title').value.replace(/\s+/g, ' ').trim(),
      students: cleanStudents(),
      departamento: field('departamento').value,
      ciudad: field('ciudad').value.replace(/\s+/g, ' ').trim(),
      x: round(s.pos.x, 6),
      y: round(s.pos.y, 6),
      lat: round(lat, 5),
      lng: round(lng, 5),
      description: field('description').value.replace(/\s+/g, ' ').trim(),
      tags: parseTags(field('tags').value, LIM.maxTags, LIM.tagMax),
    };
    const images = s.images.map((im) => im.keep || { file: im.file });
    setBusy(true, editing ? 'Guardando…' : 'Publicando…');
    try {
      if (editing) {
        const saved = await store.update(project.id, getEditKey(project.id), fields, images);
        s.dirty = false;
        onSaved(saved, null);
      } else {
        const { project: saved, editKey } = await store.create(fields, images);
        s.dirty = false;
        onSaved(saved, editKey);
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'No se pudo guardar. Inténtalo de nuevo.');
      setBusy(false);
    }
  });

  /* ---------- init ---------- */

  fillCities();
  renderStudents();
  updatePinStatus();
  updateCounter();
  updateTagsPreview();
  renderImages();

  return {
    el,
    /** Call once the panel is visible, so the map can center the pin beside it. */
    start() {
      mapView.startPlacing(s.type, s.pos, onPinMoved);
    },
    isDirty: () => s.dirty && !s.busy,
    dispose() {
      s.disposed = true;
      mapView.stopPlacing();
      s.urls.forEach((u) => URL.revokeObjectURL(u));
      document.body.classList.remove('sheet-peek');
    },
  };
}

/** Confirmation shown after a new project is published. */
export function renderSuccess(p, editKey, { onView, onAnother, onClose }) {
  const link = `${location.origin}${location.pathname}?editar=${encodeURIComponent(p.id)}&clave=${encodeURIComponent(editKey)}`;
  const otherType = p.type === 'artefacto' ? 'unidad' : 'artefacto';
  const el = document.createElement('div');
  el.className = 'success';
  el.innerHTML = `
    <header class="drawer-head">
      <span class="type-chip type-chip--${p.type}"><i></i>${esc(TYPES[p.type].label)}</span>
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${ICONS.close}</button>
    </header>
    <div class="drawer-body">
      <div class="success-icon">${ICONS.check}</div>
      <h2 class="success-title">¡Proyecto publicado!</h2>
      <p class="success-text">«${esc(p.title)}» ya aparece en el mapa.</p>
      <div class="editlink">
        <h3>Tu enlace para editar</h3>
        <p>Guárdalo: con este enlace puedes modificar o eliminar tu proyecto desde cualquier dispositivo. En este navegador ya quedó guardado.</p>
        <div class="copy-row">
          <input readonly value="${esc(link)}" aria-label="Enlace para editar">
          <button type="button" class="btn btn--dark" data-act="copy">Copiar</button>
        </div>
      </div>
    </div>
    <footer class="drawer-foot">
      <button type="button" class="btn btn--ghost" data-act="view">Ver mi proyecto</button>
      <button type="button" class="btn btn--dark" data-act="another">${ICONS.plus}<span>Subir mi ${esc(TYPES[otherType].label)}</span></button>
    </footer>`;
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') onClose();
    else if (act === 'view') onView();
    else if (act === 'another') onAnother(otherType);
    else if (act === 'copy') {
      const input = $('input', el);
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      toast('Enlace copiado.');
    }
  });
  return el;
}
