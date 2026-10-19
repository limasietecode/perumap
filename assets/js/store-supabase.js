import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { FIELDS, saveEditKey, forgetEditKey } from './store.js';
import { uid } from './util.js';

const pickFields = (f) => Object.fromEntries(FIELDS.map((k) => [k, f[k]]));

function friendly(error, fallback) {
  const msg = error?.message || '';
  if (/permiso/i.test(msg)) return new Error(msg);
  if (/fetch|network/i.test(msg)) return new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  console.error(error);
  return new Error(fallback);
}

/**
 * Online store: Supabase database + image storage + real-time updates.
 * Images live in the bucket as "<project id>/<image id>.jpg" (+ "_t.jpg" thumbnail).
 * Writes go through the SQL functions in supabase/setup.sql, which check the edit key.
 */
export class SupabaseStore {
  mode = 'supabase';

  static async create(config) {
    return new SupabaseStore(config);
  }

  constructor({ url, anonKey, bucket }) {
    this.db = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.bucket = bucket;
    this.listeners = new Set();
    this.status = 'connecting';
    this.db
      .channel('projects')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, (payload) => this._onChange(payload))
      .subscribe((status) => {
        this.status = status;
        this.listeners.forEach((fn) => fn({ type: 'status', status }));
      });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(event) {
    this.listeners.forEach((fn) => fn(event));
  }

  _onChange({ eventType, new: row, old }) {
    if (eventType === 'DELETE' || row?.hidden) this._emit({ type: 'delete', id: old?.id ?? row?.id });
    else this._emit({ type: 'upsert', project: this._hydrate(row) });
  }

  _publicUrl(path) {
    return this.db.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }

  _hydrate(row) {
    return {
      ...row,
      tags: row.tags || [],
      students: row.students || [],
      images: (row.images || []).map((im) => ({
        ...im,
        url: this._publicUrl(`${row.id}/${im.id}.jpg`),
        thumb: this._publicUrl(`${row.id}/${im.id}_t.jpg`),
      })),
    };
  }

  async _put(path, blob) {
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) throw friendly(error, 'No se pudo subir una de las imágenes. Inténtalo de nuevo.');
  }

  /** Uploads the new images and returns the list to store: [{ id, w, h }]. */
  async _uploadImages(projectId, images) {
    return Promise.all(
      images.map(async (im) => {
        if (!im.file) return { id: im.id, w: im.w, h: im.h };
        const id = uid();
        await Promise.all([this._put(`${projectId}/${id}.jpg`, im.file.full), this._put(`${projectId}/${id}_t.jpg`, im.file.thumb)]);
        return { id, w: im.file.width, h: im.file.height };
      }),
    );
  }

  async list() {
    const { data, error } = await this.db.from('projects').select('*').order('created_at');
    if (error) throw friendly(error, 'No se pudieron cargar los proyectos.');
    return data.map((row) => this._hydrate(row));
  }

  async get(id) {
    const { data, error } = await this.db.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) throw friendly(error, 'No se pudo cargar el proyecto.');
    return data ? this._hydrate(data) : null;
  }

  async create(fields, images) {
    const id = uid();
    const stored = await this._uploadImages(id, images);
    const { data: editKey, error } = await this.db.rpc('create_project', { p_id: id, p: { ...pickFields(fields), images: stored } });
    if (error) throw friendly(error, 'No se pudo publicar el proyecto. Inténtalo de nuevo.');
    saveEditKey(id, editKey);
    const project = await this.get(id);
    this._emit({ type: 'upsert', project });
    return { project, editKey };
  }

  async update(id, editKey, fields, images) {
    const stored = await this._uploadImages(id, images);
    const { error } = await this.db.rpc('update_project', { p_id: id, p_key: editKey, p: { ...pickFields(fields), images: stored } });
    if (error) throw friendly(error, 'No se pudieron guardar los cambios. Inténtalo de nuevo.');
    const project = await this.get(id);
    this._emit({ type: 'upsert', project });
    return project;
  }

  async remove(id, editKey) {
    const { error } = await this.db.rpc('delete_project', { p_id: id, p_key: editKey });
    if (error) throw friendly(error, 'No se pudo eliminar el proyecto.');
    forgetEditKey(id);
    this._emit({ type: 'delete', id });
  }
}
