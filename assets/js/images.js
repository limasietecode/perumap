import { mulberry32 } from './util.js';

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to <img> below */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toJpeg(source, maxSide, quality) {
  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * k));
  const h = Math.max(1, Math.round(source.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG transparency → white
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: w, height: h, canvas }) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      quality,
    ),
  );
}

/**
 * Resizes and compresses a JPG/PNG in the browser before upload.
 * Returns { full, thumb, width, height } where full/thumb are JPEG Blobs.
 */
export async function prepareImage(file, { imageMaxSide, thumbMaxSide }) {
  const source = await loadImage(file);
  const full = await toJpeg(source, imageMaxSide, 0.84);
  const thumb = await toJpeg(full.canvas, thumbMaxSide, 0.78);
  if (source.close) source.close();
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
}

/* ---------- Placeholder drawings for the demo projects ---------- */

const GRAYS = ['#2b2b2e', '#4d4c52', '#77767c', '#a3a2a8', '#cfcdd2'];

function facade(r, accent) {
  let s = '';
  const ground = 470;
  let x = 30;
  while (x < 770) {
    const w = 70 + r() * 140;
    const h = 120 + r() * 280;
    const fill = GRAYS[Math.floor(r() * 3) + 1];
    s += `<rect x="${x}" y="${ground - h}" width="${w}" height="${h}" fill="${fill}"/>`;
    const cols = Math.max(1, Math.floor(w / 34));
    const rows = Math.max(1, Math.floor(h / 46));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (r() < 0.2) continue;
        const lit = r() < 0.12;
        s += `<rect x="${x + 10 + i * 34}" y="${ground - h + 14 + j * 46}" width="16" height="24" fill="${lit ? accent : '#f2f1f3'}" opacity="${lit ? 1 : 0.55}"/>`;
      }
    }
    x += w + 8 + r() * 30;
  }
  return `<rect width="800" height="600" fill="#e9e7ea"/><circle cx="${560 + r() * 180}" cy="${90 + r() * 60}" r="38" fill="${accent}" opacity=".85"/>${s}<rect y="${ground}" width="800" height="${600 - ground}" fill="#d8d6da"/>`;
}

function plan(r, accent) {
  const rooms = [];
  const split = (x, y, w, h, depth) => {
    if (depth === 0 || (w < 160 && h < 160)) return rooms.push([x, y, w, h]);
    const vertical = w > h ? r() < 0.8 : r() < 0.2;
    const t = 0.35 + r() * 0.3;
    if (vertical) {
      split(x, y, w * t, h, depth - 1);
      split(x + w * t, y, w * (1 - t), h, depth - 1);
    } else {
      split(x, y, w, h * t, depth - 1);
      split(x, y + h * t, w, h * (1 - t), depth - 1);
    }
  };
  split(90, 70, 620, 460, 3 + Math.floor(r() * 2));
  const pick = Math.floor(r() * rooms.length);
  let s = '<rect width="800" height="600" fill="#f7f6f8"/>';
  for (let i = 0; i < 800; i += 40) s += `<line x1="${i}" y1="0" x2="${i}" y2="600" stroke="#e6e4e8"/>`;
  for (let j = 0; j < 600; j += 40) s += `<line x1="0" y1="${j}" x2="800" y2="${j}" stroke="#e6e4e8"/>`;
  rooms.forEach(([x, y, w, h], i) => {
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${i === pick ? accent : 'none'}" fill-opacity=".22" stroke="#1d1d1f" stroke-width="7"/>`;
  });
  return s;
}

function axo(r, accent) {
  const cx = 400;
  const cy = 300;
  const k = 26;
  const iso = (x, y, z) => [cx + (x - y) * k * 0.866, cy + (x + y) * k * 0.5 - z * k];
  const pts = (arr) => arr.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
  const boxes = [];
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    boxes.push({ x: Math.floor(r() * 7) - 4, y: Math.floor(r() * 7) - 4, w: 1 + Math.floor(r() * 3), d: 1 + Math.floor(r() * 3), h: 1 + r() * 4, hot: i === 0 });
  }
  boxes.sort((a, b) => a.x + a.y - (b.x + b.y));
  let s = '<rect width="800" height="600" fill="#eceaee"/>';
  s += `<polygon points="${pts([iso(-6, -6, 0), iso(6, -6, 0), iso(6, 6, 0), iso(-6, 6, 0)])}" fill="#dedce1"/>`;
  for (const b of boxes) {
    const { x, y, w, d, h } = b;
    const top = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
    const left = [iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x, y + d, h)];
    const right = [iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y, h)];
    s += `<polygon points="${pts(left)}" fill="${b.hot ? accent : GRAYS[2]}"/>`;
    s += `<polygon points="${pts(right)}" fill="${b.hot ? accent : GRAYS[1]}" opacity="${b.hot ? 0.8 : 1}"/>`;
    s += `<polygon points="${pts(top)}" fill="${GRAYS[4]}"/>`;
  }
  return s;
}

/** Abstract architectural drawing as an SVG data URI (demo data only). */
export function placeholderImage(seed, index, accent) {
  const r = mulberry32(seed * 97 + index * 13);
  const kind = [facade, plan, axo][(seed + index) % 3];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">${kind(r, accent)}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
