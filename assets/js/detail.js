import { TYPES } from './config.js';
import { ICONS } from './icons.js';
import { $, $$, esc } from './util.js';

/** Builds the side panel for one project. */
export function renderDetail(p, { canEdit, onClose, onEdit, onTag, onLocate, onShare }) {
  const el = document.createElement('article');
  el.className = 'detail';
  const imgs = p.images;
  const group = p.students.length > 1;
  el.innerHTML = `
    <header class="drawer-head">
      <div class="drawer-head__chips">
        <span class="type-chip type-chip--${p.type}"><i></i>${esc(TYPES[p.type]?.label)}</span>
        ${p.demo ? '<span class="soft-chip">Ejemplo</span>' : ''}
      </div>
      <button type="button" class="icon-btn" data-act="close" aria-label="Cerrar">${ICONS.close}</button>
    </header>
    <div class="drawer-body">
      <h2 class="detail-title">${esc(p.title)}</h2>
      <p class="detail-place">${ICONS.pin}<span>${esc([p.ciudad, p.departamento].filter(Boolean).join(', '))}</span></p>
      ${
        imgs.length
          ? `<div class="gallery">
              <button type="button" class="gallery-main" data-act="zoom" aria-label="Ampliar imagen">
                <img src="${esc(imgs[0].url)}" alt="${esc(p.title)} — imagen 1">
                <span class="gallery-count">1 / ${imgs.length}</span>
              </button>
              ${
                imgs.length > 1
                  ? `<div class="gallery-thumbs">${imgs
                      .map(
                        (im, i) =>
                          `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-i="${i}" aria-label="Ver imagen ${i + 1}"><img src="${esc(im.thumb || im.url)}" alt=""></button>`,
                      )
                      .join('')}</div>`
                  : ''
              }
            </div>`
          : ''
      }
      ${p.description ? `<p class="detail-desc">${esc(p.description)}</p>` : ''}
      <section class="detail-section">
        <h3>${group ? 'Integrantes' : 'Autor(a)'}</h3>
        <ul class="people">${p.students.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </section>
      ${
        p.tags.length
          ? `<section class="detail-section">
              <h3>Etiquetas</h3>
              <div class="chips">${p.tags.map((t) => `<button type="button" class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
            </section>`
          : ''
      }
    </div>
    <footer class="drawer-foot">
      <button type="button" class="btn btn--ghost" data-act="locate">${ICONS.target}<span>Ubicar</span></button>
      <button type="button" class="btn btn--ghost" data-act="share">${ICONS.link}<span>Copiar enlace</span></button>
      ${canEdit ? `<button type="button" class="btn btn--dark" data-act="edit">${ICONS.edit}<span>Editar</span></button>` : ''}
    </footer>`;

  let current = 0;
  const show = (i) => {
    current = i;
    const main = $('.gallery-main img', el);
    main.src = imgs[i].url;
    main.alt = `${p.title} — imagen ${i + 1}`;
    $('.gallery-count', el).textContent = `${i + 1} / ${imgs.length}`;
    $$('.gallery-thumbs button', el).forEach((b, j) => b.classList.toggle('is-active', j === i));
  };

  el.addEventListener('click', (e) => {
    const thumb = e.target.closest('[data-i]');
    if (thumb) return show(Number(thumb.dataset.i));
    const tag = e.target.closest('[data-tag]');
    if (tag) return onTag(tag.dataset.tag);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') onClose();
    else if (act === 'edit') onEdit();
    else if (act === 'locate') onLocate();
    else if (act === 'share') onShare();
    else if (act === 'zoom') openLightbox(imgs, current, p.title);
  });
  return el;
}

/* ---------- Lightbox ---------- */

const lb = { images: [], i: 0, title: '' };

export function initLightbox() {
  const root = $('#lightbox');
  root.innerHTML = `
    <figure class="lightbox__figure">
      <img alt="">
      <figcaption data-caption></figcaption>
    </figure>
    <button type="button" class="lightbox__btn lightbox__prev" data-lb="prev" aria-label="Anterior">${ICONS.left}</button>
    <button type="button" class="lightbox__btn lightbox__next" data-lb="next" aria-label="Siguiente">${ICONS.right}</button>
    <button type="button" class="lightbox__btn lightbox__close" data-lb="close" aria-label="Cerrar">${ICONS.close}</button>`;
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-lb]')?.dataset.lb;
    if (act === 'prev') step(-1);
    else if (act === 'next') step(1);
    else if (act === 'close' || e.target === root || e.target.classList.contains('lightbox__figure')) closeLightbox();
  });
  // Capture phase so Escape closes only the lightbox, not the panel behind it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (root.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

function render() {
  const root = $('#lightbox');
  const im = lb.images[lb.i];
  $('img', root).src = im.url;
  $('img', root).alt = `${lb.title} — imagen ${lb.i + 1}`;
  $('[data-caption]', root).textContent = `${lb.title} · ${lb.i + 1} / ${lb.images.length}`;
  const multi = lb.images.length > 1;
  $$('.lightbox__prev, .lightbox__next', root).forEach((b) => (b.hidden = !multi));
}

function step(d) {
  lb.i = (lb.i + d + lb.images.length) % lb.images.length;
  render();
}

export function openLightbox(images, index, title) {
  if (!images.length) return;
  Object.assign(lb, { images, i: index, title });
  render();
  const root = $('#lightbox');
  root.hidden = false;
  $('.lightbox__close', root).focus();
}

export function closeLightbox() {
  $('#lightbox').hidden = true;
}
