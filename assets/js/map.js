/* global L */
import { CONFIG, TYPES } from './config.js';
import { esc, debounce } from './util.js';

const { width: W, height: H, maxNativeZoom: Z, tileSize, tilesUrl } = CONFIG.map;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers();
  const n = children.length;
  const a = children.filter((m) => m.options.ptype === 'artefacto').length;
  const size = Math.round(42 + Math.min(30, Math.sqrt(n) * 6));
  return L.divIcon({
    className: 'cluster-icon',
    html: `<div class="cluster" style="--a:${((a / n) * 100).toFixed(1)}%;--s:${size}px"><b>${n}</b></div>`,
    iconSize: [size, size],
  });
}

function placeIcon(type) {
  return L.divIcon({
    className: 'place-icon',
    html: `<div class="place-pin place-pin--${type || 'none'}">
      <span class="place-pulse"></span>
      <svg viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">
        <path d="M18 1.5C8.9 1.5 1.5 8.7 1.5 17.6 1.5 29.8 18 46.5 18 46.5S34.5 29.8 34.5 17.6C34.5 8.7 27.1 1.5 18 1.5z"/>
        <circle cx="18" cy="17.5" r="6" fill="#fff"/>
      </svg></div>`,
    iconSize: [36, 48],
    iconAnchor: [18, 47],
  });
}

export class MapView {
  /**
   * @param {HTMLElement} el
   * @param {{ onSelect: (id: string) => void, padding: () => { topLeft: number[], bottomRight: number[] } }} opts
   */
  constructor(el, { onSelect, padding }) {
    this.el = el;
    this.onSelect = onSelect;
    this.getPadding = padding;
    this.markers = new Map();
    this.selectedId = null;

    const map = (this.map = L.map(el, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 100,
      minZoom: 0,
      maxZoom: Z + 1,
      maxBoundsViscosity: 0.8,
    }));

    this.bounds = L.latLngBounds(map.unproject([0, H], Z), map.unproject([W, 0], Z));
    map.setMaxBounds(this.bounds.pad(0.35));

    L.tileLayer(tilesUrl, {
      tileSize,
      minNativeZoom: 0,
      maxNativeZoom: Z,
      minZoom: 0,
      maxZoom: Z + 1,
      bounds: this.bounds,
      noWrap: true,
      keepBuffer: 4,
    }).addTo(map);

    map.createPane('placePane').style.zIndex = 650;

    this.cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 64,
      spiderfyDistanceMultiplier: 1.7,
      spiderLegPolylineOptions: { weight: 1.5, color: '#111', opacity: 0.4 },
      iconCreateFunction: clusterIcon,
    });
    this.cluster.on('clustermouseover', (e) => {
      const ms = e.layer.getAllChildMarkers();
      const a = ms.filter((m) => m.options.ptype === 'artefacto').length;
      e.layer
        .bindTooltip(`<strong>${ms.length} proyectos</strong><span>${a} Artefacto · ${ms.length - a} Unidad · clic para abrir</span>`, {
          direction: 'top',
          className: 'pin-tip',
          offset: [0, -24],
          opacity: 1,
        })
        .openTooltip();
    });
    this.cluster.on('clustermouseout', (e) => e.layer.unbindTooltip());

    // markercluster builds its clusters for the zoom range that exists when the layer is added and
    // needs a whole-number minimum zoom that never changes afterwards (otherwise lone bubbles are not
    // drawn). So: fix the minimum zoom once, give the map a view, then add the layer.
    map.setMinZoom(Math.max(0, Math.floor(this._fitZoom() - 0.5)));
    this.fit(false);
    map.addLayer(this.cluster);
    window.addEventListener(
      'resize',
      debounce(() => {
        if (Math.abs(map.getZoom() - this.lastFitZoom) < 0.3) this.fit(false);
      }, 150),
    );
  }

  /* ---------- coordinates: x, y are fractions (0–1) of the map image ---------- */

  toLatLng(x, y) {
    return this.map.unproject([x * W, y * H], Z);
  }

  toXY(latlng) {
    const p = this.map.project(latlng, Z);
    return { x: clamp01(p.x / W), y: clamp01(p.y / H) };
  }

  /* ---------- view ---------- */

  _paddingTotal() {
    const pad = this.getPadding();
    return L.point(pad.topLeft).add(pad.bottomRight);
  }

  /** Zoom at which the whole map fits in the visible area. */
  _fitZoom() {
    return this.map.getBoundsZoom(this.bounds, false, this._paddingTotal());
  }

  fit(animate = true) {
    const pad = this.getPadding();
    this.lastFitZoom = Math.max(this.map.getMinZoom(), this._fitZoom());
    this.map.fitBounds(this.bounds, { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight, animate });
  }

  fitTo(projects) {
    if (!projects.length) return this.fit();
    const b = L.latLngBounds(projects.map((p) => this.toLatLng(p.x, p.y)));
    const pad = this.getPadding();
    this.map.flyToBounds(b, { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight, maxZoom: Z - 1, duration: 0.8 });
  }

  /** Center `latlng` in the part of the map not covered by panels. */
  centerOn(latlng, zoom = this.map.getZoom()) {
    const pad = this.getPadding();
    const size = this.map.getSize();
    const visibleCenter = L.point(
      (pad.topLeft[0] + size.x - pad.bottomRight[0]) / 2,
      (pad.topLeft[1] + size.y - pad.bottomRight[1]) / 2,
    );
    const offset = visibleCenter.subtract(size.divideBy(2));
    const target = this.map.unproject(this.map.project(latlng, zoom).subtract(offset), zoom);
    this.map.flyTo(target, zoom, { duration: 0.7 });
  }

  ensureVisible(id) {
    const m = this.markers.get(id);
    if (!m || !this.map.hasLayer(m)) return;
    const pad = this.getPadding();
    this.map.panInside(m.getLatLng(), { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight });
  }

  zoomIn() {
    this.map.zoomIn();
  }

  zoomOut() {
    this.map.zoomOut();
  }

  /* ---------- project markers ---------- */

  _makeMarker(p) {
    const thumb = p.images[0]?.thumb || p.images[0]?.url || '';
    const icon = L.divIcon({
      className: 'pin-icon',
      html: `<div class="pin pin--${p.type}">${thumb ? `<img src="${esc(thumb)}" alt="" draggable="false">` : ''}</div>`,
      iconSize: [50, 50],
      iconAnchor: [25, 25],
    });
    const m = L.marker(this.toLatLng(p.x, p.y), {
      icon,
      riseOnHover: true,
      keyboard: true,
      alt: p.title,
      ptype: p.type,
      version: p.updated_at,
    });
    m.bindTooltip(`<strong>${esc(p.title)}</strong><span>${esc(TYPES[p.type]?.label)} · ${esc(p.ciudad || p.departamento)}</span>`, {
      direction: 'top',
      offset: [0, -26],
      className: 'pin-tip',
      opacity: 1,
    });
    m.on('click', () => this.onSelect(p.id));
    m.on('add', () => {
      if (p.id === this.selectedId) m.getElement()?.classList.add('is-selected');
    });
    return m;
  }

  /** Shows exactly these projects (only changed markers are rebuilt). */
  setProjects(list) {
    const ids = new Set(list.map((p) => p.id));
    const remove = [];
    for (const [id, m] of this.markers) {
      if (!ids.has(id)) {
        remove.push(m);
        this.markers.delete(id);
      }
    }
    const add = [];
    for (const p of list) {
      const old = this.markers.get(p.id);
      if (old && old.options.version === p.updated_at) continue;
      if (old) remove.push(old);
      const m = this._makeMarker(p);
      this.markers.set(p.id, m);
      add.push(m);
    }
    if (remove.length) this.cluster.removeLayers(remove);
    if (add.length) this.cluster.addLayers(add);
  }

  select(id) {
    if (this.selectedId) this.markers.get(this.selectedId)?.getElement()?.classList.remove('is-selected');
    this.selectedId = id;
    if (id) this.markers.get(id)?.getElement()?.classList.add('is-selected');
  }

  /** Zooms/spiderfies until the project's bubble is visible, then selects it. */
  focus(id) {
    const m = this.markers.get(id);
    if (!m) return;
    this.cluster.zoomToShowLayer(m, () => {
      this.select(id);
      this.ensureVisible(id);
    });
  }

  /* ---------- placing a project's pin (upload form) ---------- */

  startPlacing(type, pos, onChange) {
    this.stopPlacing();
    this.placeType = type;
    this.onPlaceChange = onChange;
    this.el.classList.add('is-placing');
    if (pos) this.setPlacePin(pos.x, pos.y, { fly: true });
    this._onPlaceClick = (e) => {
      const p = this.toXY(e.latlng);
      this.setPlacePin(p.x, p.y);
      this.onPlaceChange?.(p);
    };
    this.map.on('click', this._onPlaceClick);
  }

  setPlacePin(x, y, { fly = false } = {}) {
    const ll = this.toLatLng(x, y);
    if (!this.placeMarker) {
      this.placeMarker = L.marker(ll, {
        draggable: true,
        autoPan: true,
        pane: 'placePane',
        icon: placeIcon(this.placeType),
        keyboard: false,
      }).addTo(this.map);
      this.placeMarker.on('dragend', () => {
        const p = this.toXY(this.placeMarker.getLatLng());
        this.placeMarker.setLatLng(this.toLatLng(p.x, p.y));
        this.onPlaceChange?.(p);
      });
    } else {
      this.placeMarker.setLatLng(ll);
    }
    if (fly) this.centerOn(ll, Math.max(this.map.getZoom(), Z - 1.5));
  }

  /** Re-centers the placement pin after panels move (e.g. the mobile sheet slides away). */
  centerPlacePin() {
    if (this.placeMarker) this.centerOn(this.placeMarker.getLatLng());
  }

  setPlaceType(type) {
    this.placeType = type;
    this.placeMarker?.setIcon(placeIcon(type));
  }

  stopPlacing() {
    if (this._onPlaceClick) this.map.off('click', this._onPlaceClick);
    this._onPlaceClick = null;
    this.placeMarker?.remove();
    this.placeMarker = null;
    this.onPlaceChange = null;
    this.el.classList.remove('is-placing');
  }
}
