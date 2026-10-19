// General settings. Edit this file to change texts, limits, or to connect the online database.

export const CONFIG = {
  title: 'Mapa de Proyectos',
  subtitle: 'Arquitectura · Perú',

  // 'local'    → projects are saved only in this browser (for testing).
  // 'supabase' → projects are saved online and everyone sees them in real time.
  backend: 'supabase',
  supabase: {
    url: 'https://botijbsdwnmijrcjkrli.supabase.co',
    // Publishable key: meant to be public (it only allows what supabase/setup.sql permits).
    anonKey: 'sb_publishable_1Z6wcEyY3RRuAU7G12SLwA_3Ij7B7Ui',
    bucket: 'project-images',
  },

  // Shows 50 sample projects (not saved anywhere) to preview the map at full class size.
  // true = always shown (hide with ?demo=0); false = hidden (show with ?demo=1).
  demoData: false,

  map: {
    width: 4560,
    height: 6080,
    tileSize: 256,
    maxNativeZoom: 5,
    tilesUrl: 'tiles/{z}/{x}/{y}.jpg',
  },

  limits: {
    titleMax: 80,
    descriptionMax: 120,
    minImages: 3,
    maxImages: 4,
    maxStudents: 8,
    maxTags: 10,
    tagMax: 30,
    imageMaxSide: 1800, // px, long side after compression
    thumbMaxSide: 400,
    imageMaxMB: 25, // original file size accepted before compression
  },
};

export const TYPES = {
  artefacto: { label: 'Artefacto', hint: 'Trabajo grupal' },
  unidad: { label: 'Unidad', hint: 'Trabajo individual' },
};
