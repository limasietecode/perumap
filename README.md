# Mapa de Proyectos · Perú

Interactive map of Peru where architecture students publish their projects (**Artefacto** and **Unidad**)
and anyone can explore them as bubbles on the relief map.

## Run it locally

Double-click **`run-local.cmd`** (or run `python tools/serve.py` in this folder) and open
<http://localhost:8000>. Opening `index.html` directly from the file explorer does not work: the page
needs a local server. `tools/serve.py` disables browser caching so every reload shows your latest edits.

## Online database (Supabase)

Projects and images are stored in the Supabase project `botijbsdwnmijrcjkrli` (free plan).

- **Setup:** paste `supabase/setup.sql` into *Supabase → SQL Editor → New query* and run it (safe to re-run).
- **Moderation:** *Table Editor → projects*: set `hidden` to `true` to hide a project, or delete the row.
- **Security model (testing phase):** anyone with the link can publish; only the holder of a project's
  secret edit link can change or delete it (checked inside the database). Images can be uploaded by anyone
  but only as JPGs ≤ 5 MB in the project folder pattern.
- **Free-plan notes:** 500 MB database, 1 GB image storage (40 students × 8 images ≈ 150 MB). A project is
  paused after 7 days without visits; resume it from the dashboard.
- Images of deleted/edited projects stay in storage (unreferenced); clean them up in *Storage* if needed.
- Switch back to browser-only testing with `backend: 'local'` in `assets/js/config.js`.

## How it works

| Piece | What it does |
| --- | --- |
| `tiles/` | `final_map.png` cut into 584 zoomable 256 px tiles (4.3 MB total), so the browser only loads what is on screen. Regenerate with `tools/make-tiles.ps1` if the map image changes. |
| Bubbles | [Leaflet](https://leafletjs.com) + [markercluster](https://github.com/Leaflet/Leaflet.markercluster). Nearby projects merge into a numbered bubble; its ring shows the Artefacto (orange) / Unidad (blue) mix. Click to expand. |
| Calibration | `assets/js/geo.js` converts longitude/latitude to map pixels (the image is a Web-Mercator render, fitted on 6 landmarks). Choosing a departamento/ciudad drops the pin there; the student then drags it to the exact spot. |
| Upload form | Type, title, students (several for Artefacto), location + draggable pin, description (120 chars), comma-separated tags, 3–4 JPG/PNG images. Images are resized and compressed in the browser before saving. |
| Editing | Each project gets a secret edit link (shown after publishing and remembered in that browser). |
| Storage | **Online mode (current):** Supabase database + image storage, real-time for everyone. **Local mode:** projects saved in this browser only (IndexedDB), for offline testing. |
| Demo data | 50 generated sample projects to preview the map at class size. Off by default; add `?demo=1` to the URL to see them (or set `demoData: true` in `assets/js/config.js`). |

## Files

```
index.html               page skeleton
assets/css/styles.css    all styles (colors at the top: --artefacto, --unidad, --ink …)
assets/js/config.js      texts, limits (images, description length…), storage mode
assets/js/app.js         filters, side panel, links (?p=<id>, ?editar=<id>&clave=<key>)
assets/js/map.js         Leaflet map, bubbles, draggable pin
assets/js/form.js        upload / edit form
assets/js/detail.js      project panel + image viewer
assets/js/store.js       data layer: local (IndexedDB) store + edit keys
assets/js/store-supabase.js  online store (Supabase)
assets/js/geo.js         calibration + departamentos and cities
assets/js/images.js      image compression + demo drawings
assets/js/demo.js        sample projects
supabase/setup.sql       database, security rules, image bucket, real-time
tools/make-tiles.ps1     regenerates tiles/ from final_map.png
tools/serve.py           local test server (no caching)
```

## Roadmap

1. ✅ Local prototype
2. ✅ Online storage with Supabase (free tier) so 40 students can upload at the same time
3. ⬜ Publish on GitHub Pages: `https://limasietecode.github.io/perumap/`
