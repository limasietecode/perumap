import { CONFIG } from './config.js';
import { uid, randomKey } from './util.js';

/*
  Project shape returned to the UI:
    { id, type, title, students[], departamento, ciudad, x, y, lat, lng, description, tags[],
      images: [{ id, w, h, url, thumb }], created_at, updated_at }
    x, y = position on final_map.png as a fraction (0–1) of its width/height.

  Writes receive `fields` (the editable properties above) and `images`, an ordered array of
    { id, w, h }                                   → keep an existing image
    { file: { full, thumb, width, height } }        → new image (Blobs from prepareImage)
*/

export const FIELDS = ['type', 'title', 'students', 'departamento', 'ciudad', 'x', 'y', 'lat', 'lng', 'description', 'tags'];
const pickFields = (f) => Object.fromEntries(FIELDS.map((k) => [k, f[k]]));

/* ---------- Edit keys (the "password" of each project, kept in this browser) ---------- */

const KEYS_LS = 'perumap.editKeys';
function readKeys() {
  try {
    return JSON.parse(localStorage.getItem(KEYS_LS)) || {};
  } catch {
    return {};
  }
}
function writeKeys(keys) {
  try {
    localStorage.setItem(KEYS_LS, JSON.stringify(keys));
  } catch {
    /* private mode: the edit link still works */
  }
}
export const getEditKey = (id) => readKeys()[id] || null;
export function saveEditKey(id, key) {
  writeKeys({ ...readKeys(), [id]: key });
}
export function forgetEditKey(id) {
  const keys = readKeys();
  delete keys[id];
  writeKeys(keys);
}

export async function createStore() {
  if (CONFIG.backend === 'supabase') {
    const { SupabaseStore } = await import('./store-supabase.js');
    return SupabaseStore.create(CONFIG.supabase);
  }
  return new LocalStore();
}

/* ---------- Local store: IndexedDB in this browser (testing) ---------- */

const req2promise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

class LocalStore {
  mode = 'local';

  constructor() {
    this.listeners = new Set();
    this.urls = new Map();
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('perumap', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('images');
        db.createObjectStore('secrets');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // Other open tabs see changes instantly (simulates real-time updates locally).
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('perumap');
      this.channel.onmessage = async ({ data }) => {
        if (data.type === 'delete') return this._emit({ type: 'delete', id: data.id }, false);
        const project = await this.get(data.id);
        if (project) this._emit({ type: 'upsert', project }, false);
      };
    }
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event, broadcast = true) {
    this.listeners.forEach((fn) => fn(event));
    if (broadcast && this.channel) {
      this.channel.postMessage({ type: event.type, id: event.id ?? event.project.id });
    }
  }

  async _tx(stores, mode, fn) {
    const db = await this.dbPromise;
    const tx = db.transaction(stores, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Operación cancelada.'));
    });
    try {
      const result = await fn(tx);
      await done;
      return result;
    } catch (err) {
      done.catch(() => {});
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      throw err;
    }
  }

  _url(key, blob) {
    if (!this.urls.has(key)) this.urls.set(key, URL.createObjectURL(blob));
    return this.urls.get(key);
  }

  _revoke(imageId) {
    for (const k of [imageId, `${imageId}_t`]) {
      if (this.urls.has(k)) URL.revokeObjectURL(this.urls.get(k));
      this.urls.delete(k);
    }
  }

  async _hydrate(rec) {
    const blobs = await this._tx('images', 'readonly', (tx) => {
      const os = tx.objectStore('images');
      return Promise.all(rec.images.map((im) => Promise.all([req2promise(os.get(im.id)), req2promise(os.get(`${im.id}_t`))])));
    });
    const images = rec.images.map((im, i) => {
      const [full, thumb] = blobs[i];
      const url = full ? this._url(im.id, full) : '';
      return { ...im, url, thumb: thumb ? this._url(`${im.id}_t`, thumb) : url };
    });
    return { ...rec, images };
  }

  _putImages(tx, images) {
    const os = tx.objectStore('images');
    return images.map((im) => {
      if (!im.file) return { id: im.id, w: im.w, h: im.h };
      const id = uid();
      os.put(im.file.full, id);
      os.put(im.file.thumb, `${id}_t`);
      return { id, w: im.file.width, h: im.file.height };
    });
  }

  async _assertKey(tx, id, key) {
    const stored = await req2promise(tx.objectStore('secrets').get(id));
    if (!stored || stored !== key) throw new Error('No tienes permiso para editar este proyecto.');
    const rec = await req2promise(tx.objectStore('projects').get(id));
    if (!rec) throw new Error('Este proyecto ya no existe.');
    return rec;
  }

  async list() {
    const recs = await this._tx('projects', 'readonly', (tx) => req2promise(tx.objectStore('projects').getAll()));
    return Promise.all(recs.map((r) => this._hydrate(r)));
  }

  async get(id) {
    const rec = await this._tx('projects', 'readonly', (tx) => req2promise(tx.objectStore('projects').get(id)));
    return rec ? this._hydrate(rec) : null;
  }

  async create(fields, images) {
    const id = uid();
    const editKey = randomKey();
    const now = new Date().toISOString();
    await this._tx(['projects', 'images', 'secrets'], 'readwrite', (tx) => {
      const rec = { ...pickFields(fields), id, images: this._putImages(tx, images), created_at: now, updated_at: now };
      tx.objectStore('projects').put(rec);
      tx.objectStore('secrets').put(editKey, id);
    });
    saveEditKey(id, editKey);
    const project = await this.get(id);
    this._emit({ type: 'upsert', project });
    return { project, editKey };
  }

  async update(id, editKey, fields, images) {
    let removed = [];
    await this._tx(['projects', 'images', 'secrets'], 'readwrite', async (tx) => {
      const old = await this._assertKey(tx, id, editKey);
      const next = this._putImages(tx, images);
      const keep = new Set(next.map((im) => im.id));
      removed = old.images.filter((im) => !keep.has(im.id)).map((im) => im.id);
      removed.forEach((imgId) => {
        tx.objectStore('images').delete(imgId);
        tx.objectStore('images').delete(`${imgId}_t`);
      });
      tx.objectStore('projects').put({ ...old, ...pickFields(fields), images: next, updated_at: new Date().toISOString() });
    });
    removed.forEach((imgId) => this._revoke(imgId));
    const project = await this.get(id);
    this._emit({ type: 'upsert', project });
    return project;
  }

  async remove(id, editKey) {
    let images = [];
    await this._tx(['projects', 'images', 'secrets'], 'readwrite', async (tx) => {
      const old = await this._assertKey(tx, id, editKey);
      images = old.images.map((im) => im.id);
      images.forEach((imgId) => {
        tx.objectStore('images').delete(imgId);
        tx.objectStore('images').delete(`${imgId}_t`);
      });
      tx.objectStore('projects').delete(id);
      tx.objectStore('secrets').delete(id);
    });
    images.forEach((imgId) => this._revoke(imgId));
    forgetEditKey(id);
    this._emit({ type: 'delete', id });
  }
}
