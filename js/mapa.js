// ═══════════════════════════════════════════════════════════════
// mapa.js — Modulo DENUE + Mapa Principal
// Gobierno/Cabildo movido a gob.js — Entrega 1 refactorizacion
// ═══════════════════════════════════════════════════════════════

var DENUE_DATA      = null;
var DENUE_LOADING   = false;
var DENUE_LOADED    = false;
var DENUE_COLONIAS  = null;   // datos precalculados por colonia
var denueMapaObj    = null;
var denueHeatLayer  = null;
var denueMarkersLayer = null;
var denueModo       = 'markers';  // 'markers' es el único modo; MACRO es capa independiente (choropleth)
var denueCatFiltro  = 'todos';
var denueSizeFiltro = 0;
var denueIntelLayer = null;
var denueIntelActivo = false;


function cargarDenue(callback) {
  if (DENUE_LOADED) { if (callback) callback(); return; }
  if (DENUE_LOADING) { setTimeout(function(){ cargarDenue(callback); }, 400); return; }
  DENUE_LOADING = true;
  var lbl = document.getElementById('denue-cnt-label');
  if (lbl) lbl.textContent = '⏳ Cargando datos DENUE…';
  fetch('denue_ira.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      DENUE_DATA = data.d;
      DENUE_LOADED = true; DENUE_LOADING = false;
      if (lbl) lbl.textContent = data.total.toLocaleString() + ' establecimientos';
      if (callback) callback();
    })
    .catch(function() {
      DENUE_LOADING = false;
      var lbl2 = document.getElementById('denue-cnt-label');
      if (lbl2) lbl2.innerHTML = '⚠ Coloca <b style="color:#ffcc00">denue_ira.json</b> junto al index.html';
      if (typeof toast === 'function') toast('⚠ denue_ira.json no encontrado','err');
    });
}

function iniciarDenue() {
  var el = document.getElementById('denue-leaflet'); if (!el) return;
  // Calcular altura disponible
  var hH = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
  var tH = document.getElementById('tabs') ? document.getElementById('tabs').offsetHeight : 36;
  var barras = 34 + 28 + 24 + 24; // buscador + cats + tamaño + info
  el.style.height = Math.max(180, window.innerHeight - hH - tH - barras) + 'px';

  if (!denueMapaObj) {
    denueMapaObj = L.map('denue-leaflet', { center:[20.6795,-101.354], zoom:13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'©OSM', maxZoom:19 }).addTo(denueMapaObj);
  }
  _denueBindZoom();
  renderDenueCatBtns();
  cargarDenue(function() { if (!window.denueChoroActivo) renderDenueMapa(); });
}

function renderDenueCatBtns() {
  var bar = document.getElementById('denue-cats-bar'); if (!bar) return;
  var cats = ['todos'].concat(Object.keys(DENUE_LABELS));
  bar.innerHTML = cats.map(function(k) {
    var label = k === 'todos' ? 'TODOS' : DENUE_LABELS[k];
    var color = k === 'todos' ? '#00ccff' : (DENUE_COLORS[k] || '#5a8aaa');
    return '<button class="denue-cat-btn activo" id="dcat-' + k + '" onclick="filtrarDenueCat(\'' + k + '\',this)" style="color:' + color + ';border-color:' + color + ';">' + label + '</button>';
  }).join('');
}

function filtrarDenueCat(cat, btn) {
  denueCatFiltro = cat;
  document.querySelectorAll('.denue-cat-btn').forEach(function(b) {
    var bid = b.id.replace('dcat-', '');
    if (cat === 'todos') { b.classList.add('activo'); b.classList.remove('inactivo'); }
    else { b.classList.toggle('activo', bid === cat); b.classList.toggle('inactivo', bid !== cat); }
  });
  renderDenueMapa();
}
window.filtrarDenueCat = filtrarDenueCat;

function filtrarDenueSize(nivel, btn) {
  denueSizeFiltro = nivel;
  document.querySelectorAll('.denue-size-btn').forEach(function(b){ b.classList.remove('activo'); });
  if (btn) btn.classList.add('activo');
  renderDenueMapa();
}
window.filtrarDenueSize = filtrarDenueSize;

function toggleDenueModo() {
  // Modo MACRO ahora es choropleth independiente (denueChoroToggle en geo.js)
  // Esta función se mantiene por compatibilidad pero el botón ya no la llama directamente
}
window.toggleDenueModo = toggleDenueModo;

function denueSearch(q) {
  if (!DENUE_DATA) { if (typeof toast==='function') toast('Cargando datos…','warn'); return; }
  q = (q || '').trim().toLowerCase();
  if (!q) { denueCatFiltro = 'todos'; renderDenueCatBtns(); renderDenueMapa(); return; }
  // Forzar markers en búsqueda
  if (denueModo === 'dots') {
    denueModo = 'markers';
    var b = document.getElementById('denue-modo-btn'); if (b){ b.textContent='📍 PUNTOS'; b.classList.remove('on'); }
    var l = document.getElementById('denue-modo-label'); if (l) l.textContent='MARKERS';
  }
  renderDenueMapa(function(r){ return r[0].toLowerCase().indexOf(q) >= 0 || r[2].toLowerCase().indexOf(q) >= 0; });
}
window.denueSearch = denueSearch;

// ── Render modo colonia: 1 punto por colonia con popup de estadísticas ──
var _denueColoniasLayer = null;

function _cargarDenueColonias(callback) {
  if (DENUE_COLONIAS) { callback(); return; }
  fetch('denue_colonias.json')
    .then(function(r) { return r.json(); })
    .then(function(d) { DENUE_COLONIAS = d; callback(); })
    .catch(function() { DENUE_COLONIAS = { colonias: {} }; callback(); });
}


// ── MODO ZONA: nivel más lejano — 7 grandes zonas de Irapuato ──
// Cada zona es un cluster geográfico de colonias con un centro y radio aproximado
var _DENUE_ZONAS = [
  { nombre: 'Centro Histórico',  lat: 20.6795, lng: -101.3540, radio: 1.5 },
  { nombre: 'Zona Norte',        lat: 20.7050, lng: -101.3540, radio: 2.2 },
  { nombre: 'Zona Sur',          lat: 20.6520, lng: -101.3540, radio: 2.2 },
  { nombre: 'Zona Oriente',      lat: 20.6795, lng: -101.3200, radio: 2.0 },
  { nombre: 'Zona Poniente',     lat: 20.6795, lng: -101.3900, radio: 2.0 },
  { nombre: 'Corredor Industrial',lat: 20.6900, lng: -101.4200, radio: 2.5 },
  { nombre: 'Periférico Sur',    lat: 20.6350, lng: -101.3700, radio: 2.5 }
];

function _distKm(lat1, lng1, lat2, lng2) {
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat*dLat + dLng*dLng) * 111;
}

function _zonaDeLatLng(lat, lng) {
  var minD = 999, best = 0;
  _DENUE_ZONAS.forEach(function(z, i) {
    var d = _distKm(lat, lng, z.lat, z.lng);
    if (d < minD) { minD = d; best = i; }
  });
  return best;
}

function _renderDenueZonas(items, lbl) {
  if (denueCapas) { denueMapaObj.removeLayer(denueCapas); denueCapas = null; }
  var cats = {};
  var zonaCounts = {};
  var zonaCats   = {};

  items.forEach(function(r) {
    var zi = _zonaDeLatLng(r[5], r[6]);
    zonaCounts[zi] = (zonaCounts[zi] || 0) + 1;
    if (!zonaCats[zi]) zonaCats[zi] = {};
    zonaCats[zi][r[1]] = (zonaCats[zi][r[1]] || 0) + 1;
  });

  var tamColors = { micro:'#1a44dd', pequeno:'#0096ff', mediano:'#00c8ff', grande:'#00ffcc', mega:'#00ff88' };
  var catColors = { 'Menudeo':'#ff4488','Servicios':'#00ccff','Restaurantes':'#ff8800',
    'Manufactura':'#aa44ff','Gobierno':'#00ff88','Salud':'#ff2255','Educación':'#ffcc00',
    'Otro':'#3a6aaa' };

  var markers = [];
  _DENUE_ZONAS.forEach(function(z, i) {
    var n = zonaCounts[i] || 0;
    if (n === 0) return;
    var cats = zonaCats[i] || {};
    var domCat = Object.keys(cats).sort(function(a,b){return cats[b]-cats[a];})[0] || 'Otro';
    var color = catColors[domCat] || '#3a6aaa';
    var r = Math.min(24, Math.max(14, 10 + Math.round(n / 200)));

    var mk = L.circleMarker([z.lat, z.lng], {
      radius: r, color: color, fillColor: color,
      fillOpacity: 0.75, weight: 2, opacity: 0.9
    });

    var pct = items.length > 0 ? ((n/items.length)*100).toFixed(1) : 0;
    mk.bindPopup(
      '<div style="font-family:monospace;font-size:10px;min-width:160px;">' +
      '<div style="font-weight:700;color:' + color + ';font-size:11px;margin-bottom:4px;">' + z.nombre + '</div>' +
      '<div style="color:#aaa;">' + n.toLocaleString() + ' estab. (' + pct + '%)</div>' +
      '<div style="color:#888;font-size:9px;margin-top:2px;">Sector dominante: <span style="color:' + color + ';">' + domCat + '</span></div>' +
      '<div style="color:#555;font-size:8px;margin-top:3px;">Acércate para ver colonias</div>' +
      '</div>'
    );
    markers.push(mk);
  });

  denueCapas = L.layerGroup(markers).addTo(denueMapaObj);

  var modlbl = document.getElementById('denue-modo-label');
  if (modlbl) modlbl.textContent = 'ZONAS · aleja para vista regional';
  if (lbl) lbl.textContent = '7 zonas · ' + items.length.toLocaleString() + ' estab.';
}

function _renderDenueColonias(items, lbl) {
  _cargarDenueColonias(function() {
    if (_denueColoniasLayer) {
      try { denueMapaObj.removeLayer(_denueColoniasLayer); } catch(e) {}
      _denueColoniasLayer = null;
    }

    // Construir filtro activo: qué colonias sobreviven al filtro de cat/tamaño
    var coloniasFiltradas = {};
    items.forEach(function(r) {
      var col = (r[3] || 'SIN COLONIA').trim().toUpperCase();
      if (!coloniasFiltradas[col]) coloniasFiltradas[col] = 0;
      coloniasFiltradas[col]++;
    });

    var grupo = L.layerGroup();
    var rendered = 0;

    Object.keys(DENUE_COLONIAS.colonias).forEach(function(col) {
      var cd = DENUE_COLONIAS.colonias[col];
      // Si hay filtro activo, usar el conteo filtrado; si no, el total
      var nMostrar = coloniasFiltradas[col] || 0;
      if (denueCatFiltro !== 'todos' || denueSizeFiltro > 0) {
        if (nMostrar === 0) return; // colonia no pasa el filtro
      } else {
        nMostrar = cd.n;
      }

      var color = (typeof DENUE_COLORS !== 'undefined' && DENUE_COLORS[cd.top]) || '#40b0ff';

      // Punto fijo 10px — suficiente para toque en Android, sin opacar el mapa
      var sz = 10;
      var ic = L.divIcon({
        className: '',
        iconSize: [sz, sz],
        iconAnchor: [sz/2, sz/2],
        // Hit area invisible de 32px para facilitar toque en móvil
        html: '<div style="width:32px;height:32px;border-radius:50%;position:absolute;top:-11px;left:-11px;"></div>' +
              '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
              'background:' + color + ';opacity:0.85;' +
              'box-shadow:0 0 3px ' + color + '88;"></div>'
      });

      // Popup con estadísticas completas
      var popup = _denueColoniaPopup(col, cd, nMostrar, color);
      L.marker([cd.lat, cd.lng], { icon: ic })
        .bindPopup(popup, { maxWidth: 260, className: 'denue-popup-custom' })
        .addTo(grupo);
      rendered++;
    });

    _denueColoniasLayer = grupo;
    grupo.addTo(denueMapaObj);

    if (lbl) lbl.textContent = rendered + ' colonias · ' + items.length.toLocaleString() + ' estab';
    var modlbl = document.getElementById('denue-modo-label');
    if (modlbl) modlbl.textContent = 'COLONIAS · acércate para detalle individual';
  });
}

function _denueColoniaPopup(col, cd, nMostrar, colorTop) {
  var TLABELS = typeof DENUE_LABELS !== 'undefined' ? DENUE_LABELS : {};
  var TCOLORS = typeof DENUE_COLORS !== 'undefined' ? DENUE_COLORS : {};
  var TAM_LABEL = { micro: '0-10 emp', pequeño: '11-30 emp', mediano: '31-100 emp', grande: '100+ emp' };

  // Ordenar cats por conteo desc
  var catEntries = Object.keys(cd.cats).map(function(k) {
    return { k: k, n: cd.cats[k], pct: Math.round(cd.cats[k] / cd.n * 100) };
  }).sort(function(a,b) { return b.n - a.n; }).slice(0, 6);

  var tamEntries = Object.keys(cd.tams).map(function(k) {
    return { k: k, n: cd.tams[k], pct: Math.round(cd.tams[k] / cd.n * 100) };
  }).sort(function(a,b) { return b.n - a.n; });

  var html = '<div style="font-family:monospace;background:#060d18;color:#c0e8ff;padding:10px 12px;border-radius:4px;min-width:200px;">';

  // Header
  html += '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:3px;">COLONIA</div>';
  html += '<div style="font-size:11px;font-weight:900;color:#fff;margin-bottom:2px;">' + col + '</div>';
  html += '<div style="font-size:14px;font-weight:900;color:' + colorTop + ';margin-bottom:6px;">' + nMostrar.toLocaleString() + ' <span style="font-size:8px;color:#7a9ab8;">establecimientos</span></div>';

  // Barra top cats
  html += '<div style="font-size:6.5px;color:#3a6a9a;letter-spacing:1px;margin-bottom:4px;">POR SECTOR</div>';
  catEntries.forEach(function(e) {
    var c = TCOLORS[e.k] || '#5a8aaa';
    var lbl = (TLABELS[e.k] || e.k).replace(/[^-]/g,'').trim().slice(0, 14);
    html += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
      '<span style="width:7px;height:7px;border-radius:1px;background:' + c + ';display:inline-block;flex-shrink:0;"></span>' +
      '<span style="flex:1;font-size:7px;color:#c0e8ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + lbl + '</span>' +
      '<div style="width:50px;height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">' +
        '<div style="height:100%;width:' + e.pct + '%;background:' + c + ';border-radius:2px;"></div>' +
      '</div>' +
      '<span style="font-size:6.5px;color:#ffcc00;width:24px;text-align:right;">' + e.pct + '%</span>' +
      '</div>';
  });

  // Barra tamaños
  html += '<div style="font-size:6.5px;color:#3a6a9a;letter-spacing:1px;margin:6px 0 4px;">POR TAMAÑO</div>';
  tamEntries.forEach(function(e) {
    var tamColors = { micro:'#1a44dd', pequeño:'#2299ff', mediano:'#44bbff', grande:'#99ddff' };
    var c = tamColors[e.k] || '#40b0ff';
    html += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
      '<span style="width:7px;height:7px;border-radius:1px;background:' + c + ';display:inline-block;flex-shrink:0;"></span>' +
      '<span style="flex:1;font-size:7px;color:#c0e8ff;">' + (TAM_LABEL[e.k] || e.k) + '</span>' +
      '<div style="width:50px;height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">' +
        '<div style="height:100%;width:' + e.pct + '%;background:' + c + ';border-radius:2px;"></div>' +
      '</div>' +
      '<span style="font-size:6.5px;color:#ffcc00;width:24px;text-align:right;">' + e.pct + '%</span>' +
      '<span style="font-size:6.5px;color:#3a6a9a;width:28px;text-align:right;">' + e.n + '</span>' +
      '</div>';
  });

  html += '<div style="margin-top:6px;border-top:1px solid #0d2040;padding-top:5px;font-size:6.5px;color:#3a5a7a;">Acércate (zoom 14+) para ver cada establecimiento</div>';
  html += '</div>';
  return html;
}
window._renderDenueColonias = _renderDenueColonias;

function renderDenueMapa(extraFn) {
  // Si el choropleth MACRO está activo, no renderizar puntos individuales
  if (window.denueChoroActivo) return;
  if (!denueMapaObj || !DENUE_DATA) return;
  // Limpiar capas previas
  if (denueHeatLayer)    { try{ denueMapaObj.removeLayer(denueHeatLayer);    }catch(e){} denueHeatLayer = null; }
  if (denueMarkersLayer) { try{ denueMapaObj.removeLayer(denueMarkersLayer); }catch(e){} denueMarkersLayer = null; }
  if (typeof _denueColoniasLayer !== 'undefined' && _denueColoniasLayer) { try{ denueMapaObj.removeLayer(_denueColoniasLayer); }catch(e){} _denueColoniasLayer = null; }

  var items = DENUE_DATA.filter(function(r) {
    if (denueSizeFiltro > 0 && r[4] < denueSizeFiltro) return false;
    if (denueCatFiltro !== 'todos' && r[1] !== denueCatFiltro) return false;
    if (extraFn && !extraFn(r)) return false;
    return true;
  });

  var lbl = document.getElementById('denue-cnt-label');
  if (items.length === 0) { if (lbl) lbl.textContent = '0 establecimientos encontrados'; return; }

  var zoom = denueMapaObj.getZoom();
  // zoom < 12  → MODO ZONA:    1 punto por zona (7 áreas de Irapuato)
  // 12 <= z<15 → MODO COLONIA: 1 punto por colonia
  // zoom >= 15 → MODO MICRO:   puntos individuales por establecimiento

  if (zoom < 12 && !extraFn) {
    _renderDenueZonas(items, lbl);
    return;
  }

  if (zoom < 15 && !extraFn) {
    // ── MODO COLONIA: 1 punto por colonia, color del sector dominante, popup con stats ──
    _renderDenueColonias(items, lbl);
    return;
  }

  if (false) { // bloque legacy eliminado

    // Agrupar por celda — conservar categoría dominante y conteo
    var celdas = {};
    items.forEach(function(r) {
      var cx = Math.round(r[5] / gridSize) * gridSize;
      var cy = Math.round(r[6] / gridSize) * gridSize;
      var k = cx.toFixed(7) + ',' + cy.toFixed(7);
      if (!celdas[k]) celdas[k] = { lat: cx, lng: cy, count: 0, cats: {}, maxCat: null, maxN: 0 };
      celdas[k].count++;
      celdas[k].cats[r[1]] = (celdas[k].cats[r[1]] || 0) + 1;
      if (celdas[k].cats[r[1]] > celdas[k].maxN) {
        celdas[k].maxN = celdas[k].cats[r[1]];
        celdas[k].maxCat = r[1];
      }
    });

    var celdaList = Object.values(celdas);
    var counts = celdaList.map(function(c){ return c.count; });
    var maxDens = Math.max.apply(null, counts) || 1;
    // Percentil 90 para escala robusta (evita que un outlier aplaste todo)
    counts.sort(function(a,b){ return a-b; });
    var p90 = counts[Math.floor(counts.length * 0.90)] || maxDens;

    var grupo = L.layerGroup();
    celdaList.forEach(function(celda) {
      // Escala logarítmica suave: sqrt da mejor percepción visual de densidad
      var ratio = Math.min(1, Math.sqrt(celda.count / p90));
      // Tamaño: 3px vacío → 20px zona densa
      var sz = Math.round(3 + ratio * 17);
      var color = (typeof DENUE_COLORS !== 'undefined' && DENUE_COLORS[celda.maxCat]) || '#40b0ff';
      // Opacidad: baja densidad más transparente, alta densidad más sólido
      var op = (0.30 + ratio * 0.60).toFixed(2);
      // Halo exterior muy sutil para las zonas de alta densidad
      var glow = ratio > 0.6 ? 'box-shadow:0 0 ' + Math.round(sz * 0.8) + 'px ' + color + '55;' : '';

      var ic = L.divIcon({
        className: '',
        iconSize: [sz, sz],
        iconAnchor: [sz/2, sz/2],
        html: '<div style="width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
              'background:' + color + ';opacity:' + op + ';' + glow + '"></div>'
      });
      // interactive: false → sin click, sin hover, sin cursor pointer
      L.marker([celda.lat, celda.lng], { icon: ic, interactive: false }).addTo(grupo);
    });

    denueMarkersLayer = grupo;
    grupo.addTo(denueMapaObj);

    var nCeldas = celdaList.length;
    if (lbl) lbl.textContent = items.length.toLocaleString() + ' establecimientos · macro';
    var modlbl = document.getElementById('denue-modo-label');
    if (modlbl) modlbl.textContent = zoom >= 14 ? 'MACRO fino · acércate más para puntos' : 'MACRO · acerca para ver detalle';
  } else {
    var MAX = 1200;
    var muestra = items.slice(0, MAX);
    var grupo = L.layerGroup();
    muestra.forEach(function(r) {
      var color = DENUE_COLORS[r[1]] || '#aaaaaa';
      var sz = 14 + Math.min(r[4], 5) * 2; // tamaño total del div (incluye halo)
      var core = Math.round(sz * 0.35);     // núcleo sólido
      var ic = L.divIcon({
        className: '',
        iconSize: [sz, sz],
        iconAnchor: [sz/2, sz/2],
        html: '<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;' +
              'background:radial-gradient(circle, '+color+'cc 0%, '+color+'66 35%, '+color+'22 65%, transparent 100%);' +
              'display:flex;align-items:center;justify-content:center;">' +
              '<div style="width:'+core+'px;height:'+core+'px;border-radius:50%;background:'+color+';' +
              'box-shadow:0 0 3px '+color+',0 0 6px '+color+'88;"></div></div>'
      });
      var catLabel = DENUE_LABELS[r[1]] || r[1];
      var empLabel = DENUE_PER[r[4]] || 'N/D';
      L.marker([r[5], r[6]], {icon:ic})
        .bindPopup(
          '<div style="font-family:Orbitron,monospace;background:#06101e;border:1px solid #0d2040;border-radius:4px;padding:8px 10px;min-width:160px;">' +
          '<div style="font-size:9px;font-weight:700;color:#c0e8ff;line-height:1.3;margin-bottom:4px;">' + (r[0]||'Sin nombre') + '</div>' +
          '<div style="font-size:7px;color:'+color+';margin-bottom:3px;letter-spacing:.5px;">' + catLabel + '</div>' +
          '<div style="font-size:7px;color:#5a9abf;margin-bottom:2px;">' + r[2] + '</div>' +
          '<div style="font-size:6.5px;color:#3a6a8a;line-height:1.8;">📍 ' + r[3] + '<br>👥 ' + empLabel + ' empleados</div>' +
          '</div>',
          { maxWidth:220, className:'denue-popup-custom' }
        )
        .addTo(grupo);
    });
    denueMarkersLayer = grupo;
    grupo.addTo(denueMapaObj);
    var extra = items.length > MAX ? ' (mostrando '+MAX+' de '+items.length.toLocaleString()+')' : '';
    if (lbl) lbl.textContent = items.length.toLocaleString() + ' establecimientos' + extra;
    var modlbl2 = document.getElementById('denue-modo-label');
    if (modlbl2) modlbl2.textContent = 'PUNTOS · toca para detalle';
    if (items.length > MAX && typeof toast === 'function') toast('Mostrando '+MAX+' de '+items.length.toLocaleString()+' — filtra para reducir', 'warn');
  }
}
// Registrar evento de zoom para auto-switch heatmap ↔ puntos
function _denueBindZoom() {
  if (!denueMapaObj || denueMapaObj._denueZoomBound) return;
  denueMapaObj._denueZoomBound = true;
  denueMapaObj.on('zoomend', function() {
    // Re-render en modo dots para adaptar gridSize al zoom actual
    // auto-switch solo en modo markers cuando el choropleth no está activo
  if (!window.denueChoroActivo) renderDenueMapa();
    // Al llegar a zoom 15+ en modo dots, auto-switch visible a markers
    var z = denueMapaObj.getZoom();
    var btn = document.getElementById('denue-modo-btn');
    var lbl2 = document.getElementById('denue-modo-label');
    if (denueModo === 'dots' && z >= 15) {
      if (btn) btn.textContent = '📍 PUNTOS (auto)';
      if (lbl2) lbl2.textContent = 'PUNTOS · toca para detalle';
    } else if (denueModo === 'dots' && z >= 12) {
      if (btn) btn.textContent = '🔵 COLONIAS';
      if (lbl2) lbl2.textContent = 'COLONIAS · acércate para puntos';
    } else if (denueModo === 'dots') {
      if (btn) btn.textContent = '🗺 ZONAS';
      if (lbl2) lbl2.textContent = 'ZONAS · acércate para colonias';
    }
  });
}


// Overlay DENUE sobre mapa Intel
function toggleIntelDenue(btn) {
  if (!intelObj) { if (typeof toast==='function') toast('Activa el mapa Intel primero','warn'); return; }
  if (denueIntelActivo) {
    if (denueIntelLayer) { try{ intelObj.removeLayer(denueIntelLayer); }catch(e){} denueIntelLayer = null; }
    denueIntelActivo = false;
    if (btn) { btn.textContent='📍 DENUE'; btn.classList.remove('on'); }
    if (typeof toast==='function') toast('Overlay DENUE desactivado','ok');
  } else {
    cargarDenue(function() {
      if (!DENUE_DATA) return;
      var pts = DENUE_DATA.map(function(r){ return [r[5], r[6], 0.3]; });
      if (typeof L.heatLayer === 'function') {
        denueIntelLayer = L.heatLayer(pts, { radius:14, blur:12, maxZoom:17, minOpacity:0.03,
          gradient:{ 0.2:'#001133', 0.5:'#ffcc0055', 0.8:'#ffcc00aa', 1:'#ffcc00' }
        }).addTo(intelObj);
        denueIntelActivo = true;
        if (btn) { btn.textContent='📍 DENUE ON'; btn.classList.add('on'); }
        if (typeof toast==='function') toast('📍 ' + DENUE_DATA.length.toLocaleString() + ' estab. como capa base','ok');
      }
    });
  }
}
window.toggleIntelDenue = toggleIntelDenue;


function verEcSubtab(cual) {
  ecSubtabActual = cual;
  document.querySelectorAll('.ec-stab').forEach(function(b){ b.classList.remove('active'); });
  var btn = document.getElementById('ec-stab-' + cual);
  if (btn) btn.classList.add('active');

  var mapa  = document.getElementById('ec-mapa-wrap');
  var anal  = document.getElementById('ec-analisis');
  var stats = document.getElementById('ec-stats');

  // Ocultar todos
  [mapa, anal, stats].forEach(function(el){ if(el){ el.style.display='none'; el.classList.remove('visible'); } });

  if (cual === 'mapa') {
    if (mapa) { mapa.style.display='flex'; mapa.classList.add('visible'); }
    setTimeout(function(){
      if (denueMapaObj) { denueMapaObj.invalidateSize(); }
      else { iniciarDenue(); }
    }, 100);
  } else if (cual === 'analisis') {
    if (anal) { anal.style.display='flex'; anal.classList.add('visible'); }
    cargarDenue(function(){ ecAnalInit(); });
  } else if (cual === 'stats') {
    if (stats) { stats.style.display='flex'; stats.classList.add('visible'); }
    cargarDenue(function(){ ecStatsRender(); });
  }
}
window.verEcSubtab = verEcSubtab;

// ── Módulo Análisis DENUE ──
var ecAnalCatFiltro = 'todos';
var ecAnalSortCol   = 'nombre';
var ecAnalSortDir   = 'asc';
var ecAnalPage      = 0;
var EC_ANAL_PAGE_SIZE = 200;

function ecAnalInit() {
  // Botones de categoría
  var bar = document.getElementById('ec-anal-cats');
  if (bar && !bar._ready) {
    bar._ready = true;
    var cats = ['todos'].concat(Object.keys(DENUE_LABELS));
    bar.innerHTML = cats.map(function(k){
      var label = k==='todos'?'TODOS':DENUE_LABELS[k];
      var color = k==='todos'?'#00ccff':(DENUE_COLORS[k]||'#5a8aaa');
      return '<button class="denue-cat-btn activo" id="ec-acat-'+k+'" onclick="ecAnalSetCat(this.dataset.k)" data-k="'+k+'" style="color:'+color+';border-color:'+color+';">'+label+'</button>';
    }).join('');
  }
  ecAnalFiltrar();
}
window.ecAnalInit = ecAnalInit;

function ecAnalSetCat(cat) {
  ecAnalCatFiltro = cat;
  document.querySelectorAll('#ec-anal-cats .denue-cat-btn').forEach(function(b){
    var bid = b.id.replace('ec-acat-','');
    if (cat==='todos'){ b.classList.add('activo'); b.classList.remove('inactivo'); }
    else { b.classList.toggle('activo', bid===cat); b.classList.toggle('inactivo', bid!==cat); }
  });
  ecAnalFiltrar();
}
window.ecAnalSetCat = ecAnalSetCat;

function ecAnalFiltrar() {
  if (!DENUE_DATA) return;
  var q = (document.getElementById('ec-anal-search')||{}).value || '';
  q = q.trim().toLowerCase();
  var sz = parseInt((document.getElementById('ec-anal-size')||{}).value||'0');
  var items = DENUE_DATA.filter(function(r){
    if (ecAnalCatFiltro!=='todos' && r[1]!==ecAnalCatFiltro) return false;
    if (sz>0 && r[4]<sz) return false;
    if (q && r[0].toLowerCase().indexOf(q)<0 && r[2].toLowerCase().indexOf(q)<0 && r[3].toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  // Ordenar
  items.sort(function(a,b){
    var va,vb;
    if (ecAnalSortCol==='nombre'){ va=a[0]; vb=b[0]; }
    else if (ecAnalSortCol==='giro'){ va=a[2]; vb=b[2]; }
    else if (ecAnalSortCol==='colonia'){ va=a[3]; vb=b[3]; }
    else if (ecAnalSortCol==='cat'){ va=a[1]; vb=b[1]; }
    else if (ecAnalSortCol==='tam'){ va=a[4]; vb=b[4]; return ecAnalSortDir==='asc'?va-vb:vb-va; }
    else { va=a[0]; vb=b[0]; }
    if (va<vb) return ecAnalSortDir==='asc'?-1:1;
    if (va>vb) return ecAnalSortDir==='asc'?1:-1;
    return 0;
  });

  // Stats ya no se renderizan aquí (pestaña fija Estadísticas)
  // Tabla (primera página)
  ecAnalPage = 0;
  ecAnalRenderTabla(items);
}
window.ecAnalFiltrar = ecAnalFiltrar;

function ecAnalSort(col) {
  if (ecAnalSortCol===col) { ecAnalSortDir = ecAnalSortDir==='asc'?'desc':'asc'; }
  else { ecAnalSortCol=col; ecAnalSortDir='asc'; }
  document.querySelectorAll('.ec-sort-btn').forEach(function(b){ b.classList.remove('asc','desc'); });
  var active = document.querySelector('.ec-sort-btn[onclick*="\''+col+'\'"]');
  if (active) active.classList.add(ecAnalSortDir);
  ecAnalFiltrar();
}
window.ecAnalSort = ecAnalSort;

function ecAnalRenderTabla(items) {
  var tbody = document.getElementById('ec-tabla-body');
  var footer = document.getElementById('ec-tabla-footer');
  if (!tbody) return;
  var muestra = items.slice(0, EC_ANAL_PAGE_SIZE);
  tbody.innerHTML = muestra.map(function(r){
    var color = DENUE_COLORS[r[1]]||'#aaaaaa';
    var empLabel = DENUE_PER[r[4]]||'N/D';
    var catLabel = (DENUE_LABELS[r[1]]||r[1]).replace(/[🛒✂🍽🏭🏥📦🎓💼🏠🏦🎭🔧🏛🚛🏗📡⚡🌱⛏]/u,'').trim();
    return '<tr onclick="ecAnalVerEnMapa('+r[5]+','+r[6]+')" style="cursor:pointer;">' +
      '<td><span class="ec-cat-dot" style="background:'+color+';"></span><span class="ec-badge" style="color:'+color+';border:1px solid '+color+'44;">'+catLabel+'</span></td>' +
      '<td style="font-weight:600;color:#d0f0ff;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+r[0]+'">'+(r[0]||'—')+'</td>' +
      '<td style="color:#6a9abf;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+r[2]+'">'+(r[2]||'—')+'</td>' +
      '<td style="color:#4a7a9a;white-space:nowrap;">'+(r[3]||'—')+'</td>' +
      '<td style="color:#ffcc00;white-space:nowrap;text-align:center;">'+empLabel+'</td>' +
      '</tr>';
  }).join('');
  if (footer) {
    footer.textContent = items.length > EC_ANAL_PAGE_SIZE
      ? 'Mostrando '+EC_ANAL_PAGE_SIZE+' de '+items.length.toLocaleString()+' resultados — usa filtros para reducir'
      : items.length.toLocaleString()+' resultados';
  }
}

function ecAnalVerEnMapa(lat, lng) {
  verEcSubtab('mapa');
  setTimeout(function(){
    if (denueMapaObj) { denueMapaObj.setView([lat,lng], 17); }
  }, 300);
}
window.ecAnalVerEnMapa = ecAnalVerEnMapa;

function ecAnalExportar() {
  if (!DENUE_DATA) return;
  var q = (document.getElementById('ec-anal-search')||{}).value||'';
  q = q.trim().toLowerCase();
  var sz = parseInt((document.getElementById('ec-anal-size')||{}).value||'0');
  var items = DENUE_DATA.filter(function(r){
    if (ecAnalCatFiltro!=='todos' && r[1]!==ecAnalCatFiltro) return false;
    if (sz>0 && r[4]<sz) return false;
    if (q && r[0].toLowerCase().indexOf(q)<0 && r[2].toLowerCase().indexOf(q)<0) return false;
    return true;
  });
  var csv = 'nombre,categoria,giro,colonia,empleados,lat,lng\n';
  csv += items.map(function(r){ return [r[0],r[1],r[2],r[3],DENUE_PER[r[4]]||r[4],r[5],r[6]].map(function(v){ return '"'+(v||'').toString().replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], {type:'text/csv'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href=url; a.download='denue_irapuato.csv'; a.click();
  URL.revokeObjectURL(url);
}
window.ecAnalExportar = ecAnalExportar;

// ── Autocomplete ──
var _acTimer = null;
function ecAnalAutocompletar(q) {
  ecAnalFiltrar(); // actualizar tabla también
  clearTimeout(_acTimer);
  var list = document.getElementById('ec-ac-list');
  if (!q || q.trim().length < 2 || !DENUE_DATA) { if (list) list.style.display='none'; return; }
  _acTimer = setTimeout(function() {
    var qL = q.trim().toLowerCase();
    // Buscar coincidencias en nombre y giro
    var matches = DENUE_DATA.filter(function(r) {
      return r[0].toLowerCase().indexOf(qL) >= 0 || r[2].toLowerCase().indexOf(qL) >= 0;
    });
    // Ordenar por relevancia: nombre exacto > nombre contiene > giro; luego por tamaño desc
    matches.sort(function(a,b) {
      var sa = (a[0].toLowerCase().indexOf(qL) === 0 ? 3 : a[0].toLowerCase().indexOf(qL) >= 0 ? 2 : 1);
      var sb = (b[0].toLowerCase().indexOf(qL) === 0 ? 3 : b[0].toLowerCase().indexOf(qL) >= 0 ? 2 : 1);
      if (sb !== sa) return sb - sa;
      return b[4] - a[4]; // mayor tamaño primero
    });
    var top4 = matches.slice(0, 4);
    if (!top4.length) { list.style.display='none'; return; }
    list.innerHTML = top4.map(function(r, i) {
      var color = DENUE_COLORS[r[1]] || '#aaaaaa';
      var emp = DENUE_PER[r[4]] || 'N/D';
      return '<div class="ec-ac-item" onclick="ecAcSeleccionar(' + JSON.stringify(r[0]) + ',' + r[5] + ',' + r[6] + ')">' +
        '<span class="ec-cat-dot" style="background:'+color+';flex-shrink:0;"></span>' +
        '<span class="ec-ac-name">' + r[0] + '</span>' +
        '<span class="ec-ac-giro">' + r[2] + '</span>' +
        '<span class="ec-ac-emp">👥 ' + emp + '</span>' +
        '</div>';
    }).join('');
    list.style.display = 'block';
  }, 180);
}
window.ecAnalAutocompletar = ecAnalAutocompletar;

function ecAcSeleccionar(nombre, lat, lng) {
  var input = document.getElementById('ec-anal-search');
  if (input) input.value = nombre;
  ecAnalCerrarAC();
  ecAnalFiltrar();
}
window.ecAcSeleccionar = ecAcSeleccionar;

function ecAnalCerrarAC() {
  var list = document.getElementById('ec-ac-list');
  if (list) list.style.display = 'none';
}
window.ecAnalCerrarAC = ecAnalCerrarAC;

// ── Gráficas circulares ──
function ecAnalRenderStats(items) {
  var grid = document.getElementById('ec-stat-grid');
  if (!grid) return;

  // Conteos
  var catCount = {}, tamCount = {};
  var totalEmp = 0;
  items.forEach(function(r) {
    catCount[r[1]] = (catCount[r[1]]||0) + 1;
    var tk = DENUE_PER[r[4]] || 'N/D';
    tamCount[tk] = (tamCount[tk]||0) + 1;
    totalEmp += (r[4] || 0);
  });

  // Card total
  var html = '<div class="ec-stat-card" style="grid-column:1/-1;display:flex;align-items:center;gap:10px;text-align:left;">' +
    '<div style="flex:1;">' +
    '<div class="ec-stat-n" style="color:#00ccff;">'+items.length.toLocaleString()+'</div>' +
    '<div class="ec-stat-l">ESTABLECIMIENTOS</div></div>' +
    '<div style="font-family:var(--mono);font-size:7px;color:#3a6a9a;">Empleados (estimado): ' +
    (totalEmp * 5).toLocaleString() + '–' + (totalEmp * 8).toLocaleString() + '</div>' +
    '</div>';

  // Gráfica por giro
  html += '<div class="ec-stat-card" style="grid-column:1/2;">' +
    '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1px;color:#3a6a9a;margin-bottom:6px;">POR GIRO</div>' +
    ecDonutSVG(catCount, DENUE_COLORS, DENUE_LABELS) +
    '</div>';

  // Gráfica por tamaño
  var tamColors = {'0-5':'#4466ff','6-10':'#44aaff','11-30':'#44ffcc','31-50':'#ffcc00','51-100':'#ff8844','101-250':'#ff4488','251+':'#cc44ff','N/D':'#3a5a7a'};
  html += '<div class="ec-stat-card" style="grid-column:2/3;">' +
    '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1px;color:#3a6a9a;margin-bottom:6px;">POR TAMAÑO</div>' +
    ecDonutSVG(tamCount, tamColors, null) +
    '</div>';

  // Top 5 colonias
  var colCount = {};
  items.forEach(function(r){ if(r[3]) colCount[r[3]] = (colCount[r[3]]||0)+1; });
  var topCols = Object.keys(colCount).sort(function(a,b){return colCount[b]-colCount[a];}).slice(0,5);
  html += '<div class="ec-stat-card" style="grid-column:1/-1;">' +
    '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1px;color:#3a6a9a;margin-bottom:6px;">TOP 5 COLONIAS</div>' +
    topCols.map(function(c) {
      var pct = Math.round(colCount[c]/items.length*100);
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' +
        '<div style="font-size:7px;color:#c0e8ff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+c+'</div>' +
        '<div style="width:60px;height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">' +
          '<div style="width:'+pct+'%;height:100%;background:#ffcc00;border-radius:2px;"></div>' +
        '</div>' +
        '<div style="font-family:var(--title);font-size:6px;color:#ffcc00;width:28px;text-align:right;">'+colCount[c]+'</div>' +
        '</div>';
    }).join('') +
    '</div>';

  grid.innerHTML = html;
}

function ecDonutSVG(countObj, colors, labels, rOuter) {
  rOuter = rOuter || 28;
  var total = Object.keys(countObj).reduce(function(s,k){ return s+countObj[k]; }, 0);
  if (!total) return '<div style="font-size:7px;color:#3a5a7a;">Sin datos</div>';
  var sorted = Object.keys(countObj).sort(function(a,b){ return countObj[b]-countObj[a]; });
  var top6 = sorted.slice(0, 6);
  var otrosTotal = sorted.slice(6).reduce(function(s,k){ return s+countObj[k]; }, 0);

  var inner = Math.round(rOuter * 0.52);
  var svgSize = (rOuter + 12) * 2;
  var cx = svgSize / 2, cy = svgSize / 2;
  var startAngle = -Math.PI / 2;
  var paths = '', legendItems = '';
  var allKeys = top6.slice();
  var allCounts = top6.map(function(k){ return countObj[k]; });
  if (otrosTotal > 0) { allKeys.push('otros'); allCounts.push(otrosTotal); }

  allKeys.forEach(function(k, i) {
    var cnt = allCounts[i];
    var angle = (cnt / total) * 2 * Math.PI;
    var endAngle = startAngle + angle;
    var x1  = cx + rOuter * Math.cos(startAngle), y1  = cy + rOuter * Math.sin(startAngle);
    var x2  = cx + rOuter * Math.cos(endAngle),   y2  = cy + rOuter * Math.sin(endAngle);
    var xi1 = cx + inner  * Math.cos(startAngle), yi1 = cy + inner  * Math.sin(startAngle);
    var xi2 = cx + inner  * Math.cos(endAngle),   yi2 = cy + inner  * Math.sin(endAngle);
    var lg = angle > Math.PI ? 1 : 0;
    var color = (colors[k] || '#3a5a7a');
    var pct = Math.round(cnt / total * 100);
    paths += '<path d="M'+x1+' '+y1+' A'+rOuter+' '+rOuter+' 0 '+lg+' 1 '+x2+' '+y2+
             ' L'+xi2+' '+yi2+' A'+inner+' '+inner+' 0 '+lg+' 0 '+xi1+' '+yi1+' Z"'+
             ' fill="'+color+'" opacity="0.85" stroke="#030508" stroke-width="0.5"/>';
    var lbl = labels ? ((labels[k]||k).replace(/[^\x00-\x7F]/g,'').trim().slice(0,14)) : k;
    legendItems += '<div style="display:flex;align-items:center;gap:4px;font-size:6px;color:#c0e8ff;margin-bottom:2px;">' +
      '<span style="display:inline-block;width:7px;height:7px;border-radius:1px;background:'+color+';flex-shrink:0;"></span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+lbl+'</span>' +
      '<span style="color:#ffcc00;font-family:var(--title);font-size:5.5px;white-space:nowrap;">'+pct+'%</span>' +
      '</div>';
    startAngle = endAngle;
  });

  return '<div style="display:flex;align-items:center;gap:10px;">' +
    '<svg width="'+svgSize+'" height="'+svgSize+'" viewBox="0 0 '+svgSize+' '+svgSize+'" style="flex-shrink:0;">' + paths + '</svg>' +
    '<div style="flex:1;min-width:0;">' + legendItems + '</div>' +
    '</div>';
}
window.ecAnalRenderStats = ecAnalRenderStats;

// ═══════════════════════════════════════════════════════════════
// PESTAÑA ESTADÍSTICAS — datos fijos del total DENUE
// ═══════════════════════════════════════════════════════════════
var _ecStatsRendered = false;

function ecStatsRender() {
  if (_ecStatsRendered) return;
  if (!DENUE_DATA || !DENUE_DATA.length) return;
  _ecStatsRendered = true;

  var data = DENUE_DATA;
  var total = data.length;
  var catCount = {}, tamCount = {}, colCount = {};
  var totalEmpMin = 0, totalEmpMax = 0;
  var TAM_MIN = [0,0,6,11,31,51,101,251];
  var TAM_MAX = [0,5,10,30,50,100,250,999];

  data.forEach(function(r) {
    catCount[r[1]] = (catCount[r[1]]||0) + 1;
    var tk = DENUE_PER[r[4]] || 'N/D';
    tamCount[tk] = (tamCount[tk]||0) + 1;
    if (r[3]) colCount[r[3]] = (colCount[r[3]]||0) + 1;
    totalEmpMin += (TAM_MIN[r[4]] || 0);
    totalEmpMax += (TAM_MAX[r[4]] || 0);
  });

  var tamColors = {'0-5':'#1a44dd','6-10':'#2266ee','11-30':'#2299ff','31-50':'#44bbff','51-100':'#66ccff','101-250':'#99ddff','251+':'#ccf0ff','N/D':'#1a2a4a'};
  var topCols = Object.keys(colCount).sort(function(a,b){return colCount[b]-colCount[a];}).slice(0,10);
  var maxCol = colCount[topCols[0]] || 1;

  var html = '';

  // Header resumen
  html += '<div style="background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:12px 14px;display:flex;flex-wrap:wrap;gap:16px;align-items:center;">'
    + '<div><div style="font-family:var(--title);font-size:22px;font-weight:900;color:#00ccff;">'+total.toLocaleString()+'</div><div style="font-family:var(--title);font-size:5.5px;letter-spacing:1.5px;color:#3a6a9a;">ESTABLECIMIENTOS TOTALES</div></div>'
    + '<div><div style="font-family:var(--title);font-size:13px;font-weight:700;color:#40b0ff;">'+Object.keys(catCount).length+'</div><div style="font-family:var(--title);font-size:5.5px;letter-spacing:1px;color:#3a6a9a;">SECTORES</div></div>'
    + '<div><div style="font-family:var(--title);font-size:13px;font-weight:700;color:#40b0ff;">'+Object.keys(colCount).length.toLocaleString()+'</div><div style="font-family:var(--title);font-size:5.5px;letter-spacing:1px;color:#3a6a9a;">COLONIAS</div></div>'
    + '<div style="margin-left:auto;font-size:7px;color:#3a6a9a;text-align:right;">Empleados estimados:<br><span style="color:#ffcc00;font-family:var(--title);font-size:9px;">'+totalEmpMin.toLocaleString()+' - '+totalEmpMax.toLocaleString()+'</span></div>'
    + '</div>';

  // Donut sector
  html += '<div style="background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:10px 12px;">'
    + '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1.5px;color:#3a6a9a;margin-bottom:8px;">DISTRIBUCION POR SECTOR ECONOMICO</div>'
    + ecDonutSVG(catCount, DENUE_COLORS, DENUE_LABELS, 60)
    + '</div>';

  // Donut tamano
  html += '<div style="background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:10px 12px;">'
    + '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1.5px;color:#3a6a9a;margin-bottom:8px;">DISTRIBUCION POR TAMANO DE EMPRESA</div>'
    + ecDonutSVG(tamCount, tamColors, null, 60)
    + '</div>';

  // Top 10 colonias
  html += '<div style="background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:10px 12px;">'
    + '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1.5px;color:#3a6a9a;margin-bottom:8px;">TOP 10 COLONIAS POR CONCENTRACION</div>'
    + topCols.map(function(c, i) {
        var barW = Math.round(colCount[c]/maxCol*100);
        var pct = Math.round(colCount[c]/total*100);
        var blue = Math.round(100 + barW * 1.55);
        var color = 'rgb('+Math.round(blue*0.2)+','+Math.round(blue*0.55)+','+blue+')';
        return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">'
          + '<div style="font-family:var(--title);font-size:5.5px;color:#3a5a7a;width:12px;text-align:right;">'+(i+1)+'</div>'
          + '<div style="font-size:7.5px;color:#c0e8ff;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+c+'</div>'
          + '<div style="width:90px;height:5px;background:#0d2040;border-radius:2px;overflow:hidden;flex-shrink:0;">'
            + '<div style="width:'+barW+'%;height:100%;background:'+color+';border-radius:2px;"></div>'
          + '</div>'
          + '<div style="font-family:var(--title);font-size:6px;color:#ffcc00;width:32px;text-align:right;">'+colCount[c].toLocaleString()+'</div>'
          + '<div style="font-size:6px;color:#3a6a9a;width:24px;text-align:right;">'+pct+'%</div>'
          + '</div>';
      }).join('')
    + '</div>';

  // Barras por sector
  var sortedCats = Object.keys(catCount).sort(function(a,b){return catCount[b]-catCount[a];});
  var maxCat = catCount[sortedCats[0]] || 1;
  html += '<div style="background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:10px 12px;">'
    + '<div style="font-family:var(--title);font-size:5.5px;letter-spacing:1.5px;color:#3a6a9a;margin-bottom:8px;">VOLUMEN POR SECTOR</div>'
    + sortedCats.map(function(k) {
        var color = DENUE_COLORS[k] || '#3a5a7a';
        var lbl = (DENUE_LABELS[k]||k).replace(/[^\x00-\x7F]/g,'').trim();
        var barW = Math.round(catCount[k]/maxCat*100);
        var pct = Math.round(catCount[k]/total*100);
        return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">'
          + '<div style="width:70px;font-size:6.5px;color:'+color+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;">'+lbl+'</div>'
          + '<div style="flex:1;height:7px;background:#0d2040;border-radius:2px;overflow:hidden;">'
            + '<div style="width:'+barW+'%;height:100%;background:'+color+';border-radius:2px;opacity:.8;"></div>'
          + '</div>'
          + '<div style="font-family:var(--title);font-size:6px;color:#ffcc00;width:36px;text-align:right;">'+catCount[k].toLocaleString()+'</div>'
          + '<div style="font-size:6px;color:#3a6a9a;width:22px;text-align:right;">'+pct+'%</div>'
          + '</div>';
      }).join('')
    + '</div>';

  var cont = document.getElementById('ec-stats-content');
  if (cont) cont.innerHTML = html;
}
window.ecStatsRender = ecStatsRender;


// ═══════════════════════════════════════════════════════════════
// MAPA PRINCIPAL
// ═══════════════════════════════════════════════════════════════

function iniciarMapa() {
  try {

    if (typeof L === 'undefined') {
            setTimeout(iniciarMapa, 400);
      return;
    }

    var el   = document.getElementById('mapa-leaflet');
    var cont = document.getElementById('mapa-container');
    var secEl = document.getElementById('sec-mapa');
    

    if (!el) { console.log("ERROR: #mapa-leaflet no encontrado"); return; }

    // El div ya fue posicionado por verTab — leer dimensiones reales
    var alto = el.offsetHeight;

    if (alto < 50) { console.log("ERROR: mapa-leaflet tiene altura 0"); return; }

    if (mapaIniciado && mapaObj) {
            mapaObj.invalidateSize(true);
      setTimeout(function() { mapaObj.invalidateSize(true); renderMapa(); }, 300);
      return;
    }

    mapaIniciado = true;

    mapaObj = L.map('mapa-leaflet', {
      center: [20.6795, -101.3540],
      zoom: 12,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OSM',
      maxZoom: 18
    }).addTo(mapaObj);

    setTimeout(function() {
      mapaObj.invalidateSize(true);
          }, 100);
    setTimeout(function() {
      mapaObj.invalidateSize(true);
          }, 400);
    setTimeout(function() {
      mapaObj.invalidateSize(true);
      mapaObj.invalidateSize({animate:false});
      mapaObj.setView([20.6795, -101.3540], 12, {animate:false});
      // MAPA FIJO: renderizar dependencias de gobierno
      renderGobMapa();
      // Actualizar contadores del mapa fijo
      var cntGob = document.getElementById('mapa-cnt-gob');
      if (cntGob) cntGob.textContent = DEPENDENCIAS_GOB.length;
      var cntFijo = document.getElementById('mapa-cnt-fijo');
      if (cntFijo) cntFijo.textContent = DEPENDENCIAS_GOB.length + ' puntos';
          }, 800);

  } catch(err) {
    console.log("iniciarMapa ERROR en paso: " + err.message);
  }
}
window.iniciarMapa = iniciarMapa;

function crearIconoMapa(tipo) {
  var color = COLORES_TIPO[tipo] || '#3a5a7a';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">' +
    '<path d="M11 0C4.9 0 0 4.9 0 11c0 7.7 11 17 11 17s11-9.3 11-17C22 4.9 17.1 0 11 0z" fill="' + color + '" opacity="0.9"/>' +
    '<circle cx="11" cy="11" r="5" fill="rgba(0,0,0,0.5)"/>' +
    '</svg>';
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [22, 28],
    iconAnchor: [11, 28],
    popupAnchor: [0, -28]
  });
}

function coordsValidas(lat, lng) {
  return lat > 20.3 && lat < 21.0 && lng > -101.8 && lng < -101.0;
}

function renderMapa() {
  if (!mapaObj) return;
  // Limpiar markers y heatmap anteriores
  for (var i = 0; i < mapaMarkers.length; i++) { mapaObj.removeLayer(mapaMarkers[i]); }
  mapaMarkers = [];
  if (mapaHeatLayer) { mapaObj.removeLayer(mapaHeatLayer); mapaHeatLayer = null; }

  var contadores = { seguridad:0, accidente:0, evento:0, gobierno:0, rum:0 };
  var total = 0;
  var heatPoints = [];

  for (var j = 0; j < noticias.length; j++) {
    var n = noticias[j];
    var tipo = n.tipo || 'rumor';
    var lat = parseFloat(n.lat) || 20.6795;
    var lng = parseFloat(n.lng) || -101.3540;
    if (!coordsValidas(lat, lng)) { lat = 20.6795; lng = -101.3540; }

    var tipoFiltro = (tipo === 'rumor' || tipo === 'desaparecido' || tipo === 'salud' || tipo === 'transporte') ? 'rumor' : tipo;
    if (!mapaFiltrosActivos[tipo] && !mapaFiltrosActivos[tipoFiltro]) continue;

    // --- MARKER con popup de detalle completo ---
    var marker = L.marker([lat, lng], { icon: crearIconoMapa(tipo), noticiaId: n.id });
    var colorTipo = COLORES_TIPO[tipo] || '#3a5a7a';
    var nId = n.id;

    // Contexto CONEVAL para el popup
    var geoBadge = '';
    if (typeof geoLookup === 'function' && typeof GEO !== 'undefined' && GEO.loaded) {
      var geoCtx = geoLookup(lat, lng);
      if (geoCtx && geoCtx.rango_pobreza) {
        var AGEB_C = typeof AGEB_COLORES !== 'undefined' ? AGEB_COLORES : {};
        var colorInfo = AGEB_C[geoCtx.rango_pobreza] || { fill: '#374151', label: geoCtx.rango_pobreza };
        geoBadge = '<div style="display:inline-flex;align-items:center;gap:4px;background:' + colorInfo.fill + '22;' +
          'border:1px solid ' + colorInfo.fill + '55;border-radius:3px;padding:2px 6px;margin-bottom:4px;font-size:7px;color:' + colorInfo.fill + ';font-family:monospace;">' +
          '<span style="width:6px;height:6px;border-radius:1px;background:' + colorInfo.fill + ';display:inline-block;"></span>' +
          'Pobreza ' + colorInfo.label + ' · CONEVAL</div>';
      }
    }

    var popupHtml =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<div class="mapa-popup-tipo" style="background:' + colorTipo + '22;color:' + colorTipo + ';border:1px solid ' + colorTipo + '44;margin-bottom:0;">' + tipo.toUpperCase() + '</div>' +
        '<div style="display:flex;gap:4px;">' +
          ((n.url||n.link) ? '<a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(255,200,0,.15);color:#ffc800;border:1px solid #ffc80066;border-radius:2px;text-decoration:none;letter-spacing:1px;">&#128279; VER</a>' : '') +
          '<button onclick="verDetallesBD(\'' + nId + '\')" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(0,245,255,.15);color:#00f5ff;border:1px solid #00f5ff66;border-radius:2px;cursor:pointer;letter-spacing:1px;">DETALLE &#9654;</button>' +
        '</div>' +
      '</div>' +
      (geoBadge ? '<div>' + geoBadge + '</div>' : '') +
      '<div class="mapa-popup-tit">' + (n.titulo || 'Sin titulo') + '</div>' +
      '<div class="mapa-popup-meta">' +
        (n.fuente ? '&#128240; ' + n.fuente + '<br>' : '') +
        (n.calle ? '&#128205; ' + n.calle + (n.calle2 ? ' / ' + n.calle2 : '') + '<br>' : '') +
        (n.colonia ? '&#127968; ' + n.colonia + '<br>' : '') +
        (n.fecha_evento ? '&#128197; ' + n.fecha_evento : '') +
        (n.tiempo_dia && n.tiempo_dia !== 'desconocido' ? ' &#9200; ' + n.tiempo_dia : '') +
      '</div>' +
      (n.resumen ? '<div class="mapa-popup-res">' + n.resumen + '</div>' : '');

    marker.bindPopup(popupHtml, { maxWidth: 300, minWidth: 200, className: 'mapa-popup-custom' });
    marker.addTo(mapaObj);
    mapaMarkers.push(marker);

    // --- Punto para heatmap ---
    var peso = HEAT_PESO[tipo] || 0.4;
    heatPoints.push([lat, lng, peso]);

    total++;
    if (tipo === 'seguridad') contadores.seguridad++;
    else if (tipo === 'accidente') contadores.accidente++;
    else if (tipo === 'evento') contadores.evento++;
    else if (tipo === 'gobierno') contadores.gobierno++;
    else contadores.rum++;
  }

  // Crear capa heatmap si hay puntos y está activado
  if (heatPoints.length > 0 && typeof L.heatLayer !== 'undefined') {
    mapaHeatLayer = L.heatLayer(heatPoints, {
      radius: 30,
      blur: 20,
      maxZoom: 16,
      max: 1.0,
      gradient: { 0.2:'#0000ff', 0.4:'#00ffff', 0.6:'#ffff00', 0.8:'#ff8800', 1.0:'#ff0000' }
    });
    if (mapaHeatActivo) mapaHeatLayer.addTo(mapaObj);
  }

  // Actualizar contadores
  var el = function(id) { return document.getElementById(id); };
  if (el('mapa-cnt-seg')) el('mapa-cnt-seg').textContent = contadores.seguridad;
  if (el('mapa-cnt-acc')) el('mapa-cnt-acc').textContent = contadores.accidente;
  if (el('mapa-cnt-eve')) el('mapa-cnt-eve').textContent = contadores.evento;
  if (el('mapa-cnt-gob')) el('mapa-cnt-gob').textContent = contadores.gobierno;
  if (el('mapa-cnt-rum')) el('mapa-cnt-rum').textContent = contadores.rum;
  if (el('mapa-cnt-tot')) el('mapa-cnt-tot').textContent = total + ' noticias';

  setTimeout(function() { if (mapaObj) mapaObj.invalidateSize(); }, 100);
}
window.renderMapa = renderMapa;


// NOTA: renderGobLista/filtrarGob/renderGobMapa (sistema legado DEPENDENCIAS_GOB)
// eliminados en Entrega 1. El sistema de gobierno usa gob.js.


function toggleHeatmap(btnEl) {
  mapaHeatActivo = !mapaHeatActivo;
  if (btnEl) {
    btnEl.className = btnEl.className.replace('activo','').replace('inactivo','').trim();
    btnEl.className += mapaHeatActivo ? ' activo' : '';
  }
  if (mapaHeatActivo) {
    if (mapaHeatLayer) mapaHeatLayer.addTo(mapaObj);
  } else {
    if (mapaHeatLayer) mapaObj.removeLayer(mapaHeatLayer);
  }
}
window.toggleHeatmap = toggleHeatmap;

function filtrarMapa(tipo, btnEl) {
  if (tipo === 'todos') {
    var tipos = ['seguridad','accidente','evento','gobierno','rumor','desaparecido','salud','transporte'];
    for (var t = 0; t < tipos.length; t++) mapaFiltrosActivos[tipos[t]] = true;
    var btns = document.querySelectorAll('.mapa-filtro-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].className = btns[i].className.replace('inactivo','').replace('activo','').trim() + ' activo';
    }
  } else {
    var tiposGrupo = (tipo === 'rumor') ? ['rumor','desaparecido','salud','transporte'] : [tipo];
    var estaActivo = mapaFiltrosActivos[tipo];
    for (var tg = 0; tg < tiposGrupo.length; tg++) {
      mapaFiltrosActivos[tiposGrupo[tg]] = !estaActivo;
    }
    if (btnEl) {
      btnEl.className = btnEl.className.replace('inactivo','').replace('activo','').trim();
      btnEl.className += !estaActivo ? ' activo' : ' inactivo';
    }
  }
  renderMapa();
}
window.filtrarMapa = filtrarMapa;

// ─── MINI MAPA en modal de detalle BD ────────────────────────────────────────
function iniciarMiniMapa(lat, lng, tipo) {
  // Destruir instancia anterior si existe
  if (miniMapaObj) {
    try { miniMapaObj.remove(); } catch(e) {}
    miniMapaObj = null;
  }
  var el = document.getElementById('bd-mini-mapa');
  if (!el || typeof L === 'undefined') return;
  setTimeout(function() {
    miniMapaObj = L.map('bd-mini-mapa', {
      center: [lat, lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(miniMapaObj);
    // Marker con icono de color
    var color = COLORES_TIPO[tipo] || '#3a5a7a';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 22 28">' +
      '<path d="M11 0C4.9 0 0 4.9 0 11c0 7.7 11 17 11 17s11-9.3 11-17C22 4.9 17.1 0 11 0z" fill="' + color + '" opacity="0.95"/>' +
      '<circle cx="11" cy="11" r="5" fill="rgba(0,0,0,0.5)"/></svg>';
    var icon = L.divIcon({ html: svg, className: '', iconSize:[26,32], iconAnchor:[13,32] });
    L.marker([lat, lng], { icon: icon }).addTo(miniMapaObj);
    // Circulo de zona ~200m
    L.circle([lat, lng], { radius:200, color:color, fillColor:color, fillOpacity:0.08, weight:1 }).addTo(miniMapaObj);
    miniMapaObj.invalidateSize();
  }, 120);
}

// escucharMake se llama desde app.js (carga despues de mapa.js)
if (typeof escucharMake === 'function') escucharMake();

// Indicador de que JS cargó correctamente
document.getElementById('rss-estado').textContent = 'Sistema listo. Elige una fuente.';
document.getElementById('rss-estado').className = 'rss-estado ok';
// Actualizar indicador de IA con las keys ya cargadas del localStorage
actualizarStatusGemini();




// ══════════════════════════════════════════════════
// MAPA FIJO — Puntos de interés ciudadano
// Edición con contraseña
// ══════════════════════════════════════════════════
var mapaFijoFiltro = 'todos';
var editandoMapa = false;
var PASS_MAPA = 'ira2024';  // Contraseña de edición

function filtrarMapaFijo(tipo, btn) {
  mapaFijoFiltro = tipo;
  var btns = document.querySelectorAll('#sec-mapa .mapa-filtro-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.remove('activo');
    btns[i].classList.add('inactivo');
  }
  if (btn) { btn.classList.add('activo'); btn.classList.remove('inactivo'); }
  actualizarGobMapa(tipo === 'todos' ? 'todos' : (tipo === 'gobierno' ? 'todos' : '__ninguno__'));
  // Actualizar contador
  var cnt = document.getElementById('mapa-cnt-gob');
  if (cnt) cnt.textContent = tipo === 'todos' || tipo === 'gobierno' ? DEPENDENCIAS_GOB.length : 0;
  var tot = document.getElementById('mapa-cnt-fijo');
  if (tot) tot.textContent = (tipo === 'todos' || tipo === 'gobierno' ? DEPENDENCIAS_GOB.length : 0) + ' puntos';
}
window.filtrarMapaFijo = filtrarMapaFijo;

var puntoEditandoId = null; // id del punto que se está editando (null = nuevo)

function toggleEditarMapa() {
  if (!editandoMapa) {
    var pass = prompt('Contraseña de edición:');
    if (pass !== PASS_MAPA) { toast('Contraseña incorrecta', 'error'); return; }
    editandoMapa = true;
    var btn = document.getElementById('btn-editar-mapa');
    if (btn) { btn.textContent = '🔒 SALIR'; btn.style.color = '#ffcc00'; btn.style.borderColor = '#ffcc00'; }
    activarEdicionMapa();
    toast('Modo edición activo', 'ok');
  } else {
    editandoMapa = false;
    var btn = document.getElementById('btn-editar-mapa');
    if (btn) { btn.textContent = '\u270F\uFE0F EDITAR'; btn.style.color = ''; btn.style.borderColor = ''; }
    desactivarEdicionMapa();
    cerrarPanelEdicion();
    toast('Edición desactivada', 'ok');
  }
}
window.toggleEditarMapa = toggleEditarMapa;

function activarEdicionMapa() {
  if (!mapaObj) return;
  mapaObj.on('click', onMapaFijoClick);
  // Hacer todos los markers clicables para editar
  for (var i = 0; i < gobMarkers.length; i++) {
    gobMarkers[i].on('click', onGobMarkerClick);
  }
}
function desactivarEdicionMapa() {
  if (!mapaObj) return;
  mapaObj.off('click', onMapaFijoClick);
  for (var i = 0; i < gobMarkers.length; i++) {
    gobMarkers[i].off('click', onGobMarkerClick);
  }
}

function onMapaFijoClick(e) {
  if (!editandoMapa) return;
  // Clic en mapa vacío — poner coords en el panel, modo nuevo punto
  var lat = e.latlng.lat.toFixed(6);
  var lng = e.latlng.lng.toFixed(6);
  var coordInput = document.getElementById('edit-coords');
  if (coordInput) coordInput.value = lat + ', ' + lng;
  abrirPanelEdicion(null, lat, lng);
}

function onGobMarkerClick(e) {
  if (!editandoMapa) return;
  L.DomEvent.stopPropagation(e);
  var depId = this.depId;
  var dep = null;
  for (var i = 0; i < DEPENDENCIAS_GOB.length; i++) {
    if (DEPENDENCIAS_GOB[i].id === depId) { dep = DEPENDENCIAS_GOB[i]; break; }
  }
  if (dep) abrirPanelEdicion(dep, null, null);
}

function abrirPanelEdicion(dep, lat, lng) {
  puntoEditandoId = dep ? dep.id : null;
  var panel = document.getElementById('panel-edicion');
  var titulo = document.getElementById('edit-titulo');
  var btnDel = document.getElementById('edit-btn-del');
  if (!panel) return;

  if (dep) {
    // Editar punto existente
    titulo.textContent = '\u270F\uFE0F EDITAR PUNTO';
    document.getElementById('edit-nombre').value = dep.nombre || '';
    document.getElementById('edit-tipo').value   = dep.funcion || 'gobierno';
    document.getElementById('edit-tel').value    = dep.tel || '';
    document.getElementById('edit-dir').value    = dep.dir || '';
    document.getElementById('edit-desc').value   = dep.desc || '';
    document.getElementById('edit-coords').value = dep.lat + ', ' + dep.lng;
    if (btnDel) btnDel.style.display = 'inline-block';
  } else {
    // Nuevo punto
    titulo.textContent = '\u2795 NUEVO PUNTO';
    document.getElementById('edit-nombre').value = '';
    document.getElementById('edit-tipo').value   = 'gobierno';
    document.getElementById('edit-tel').value    = '';
    document.getElementById('edit-dir').value    = '';
    document.getElementById('edit-desc').value   = '';
    document.getElementById('edit-coords').value = lat && lng ? lat + ', ' + lng : '';
    if (btnDel) btnDel.style.display = 'none';
  }
  panel.classList.add('visible');
}
window.abrirPanelEdicion = abrirPanelEdicion;

function cerrarPanelEdicion() {
  var panel = document.getElementById('panel-edicion');
  if (panel) panel.classList.remove('visible');
  puntoEditandoId = null;
}
window.cerrarPanelEdicion = cerrarPanelEdicion;

function nuevoPuntoMapa() {
  abrirPanelEdicion(null, '', '');
  toast('Toca el mapa para colocar las coordenadas', 'ok');
}
window.nuevoPuntoMapa = nuevoPuntoMapa;

function guardarPuntoEdicion() {
  var nombre = document.getElementById('edit-nombre').value.trim();
  var tipo   = document.getElementById('edit-tipo').value;
  var tel    = document.getElementById('edit-tel').value.trim();
  var dir    = document.getElementById('edit-dir').value.trim();
  var desc   = document.getElementById('edit-desc').value.trim();
  var coords = document.getElementById('edit-coords').value.trim();

  if (!nombre) { toast('El nombre es requerido', 'error'); return; }
  if (!coords) { toast('Las coordenadas son requeridas', 'error'); return; }

  var parts = coords.split(',');
  var lat = parseFloat(parts[0]);
  var lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) { toast('Coordenadas inválidas', 'error'); return; }

  var tipoLabel = {'gobierno':'Gobierno','hospital':'Hospital','escuela':'Escuela','politico':'Político','transporte':'Transporte'};

  if (puntoEditandoId) {
    // Actualizar punto existente
    for (var i = 0; i < DEPENDENCIAS_GOB.length; i++) {
      if (DEPENDENCIAS_GOB[i].id === puntoEditandoId) {
        DEPENDENCIAS_GOB[i].nombre = nombre;
        DEPENDENCIAS_GOB[i].funcion = tipo;
        DEPENDENCIAS_GOB[i].funcionLabel = tipoLabel[tipo] || tipo;
        DEPENDENCIAS_GOB[i].tel = tel;
        DEPENDENCIAS_GOB[i].dir = dir;
        DEPENDENCIAS_GOB[i].desc = desc;
        DEPENDENCIAS_GOB[i].lat = lat;
        DEPENDENCIAS_GOB[i].lng = lng;
        break;
      }
    }
    toast('Punto actualizado: ' + nombre, 'ok');
  } else {
    // Nuevo punto
    var nuevo = {
      id: 'custom_' + Date.now(),
      nombre: nombre, titular: '', dir: dir, tel: tel, ext: '',
      funcion: tipo, funcionLabel: tipoLabel[tipo] || tipo,
      desc: desc, lat: lat, lng: lng, web: ''
    };
    DEPENDENCIAS_GOB.push(nuevo);
    toast('Punto agregado: ' + nombre, 'ok');
  }

  cerrarPanelEdicion();
  renderGobMapa();
  // Re-activar edición en los nuevos markers
  if (editandoMapa) {
    for (var i = 0; i < gobMarkers.length; i++) {
      gobMarkers[i].off('click', onGobMarkerClick);
      gobMarkers[i].on('click', onGobMarkerClick);
    }
  }
}
window.guardarPuntoEdicion = guardarPuntoEdicion;

function borrarPuntoEdicion() {
  if (!puntoEditandoId) return;
  var nombre = '';
  for (var i = 0; i < DEPENDENCIAS_GOB.length; i++) {
    if (DEPENDENCIAS_GOB[i].id === puntoEditandoId) {
      nombre = DEPENDENCIAS_GOB[i].nombre;
      DEPENDENCIAS_GOB.splice(i, 1);
      break;
    }
  }
  cerrarPanelEdicion();
  renderGobMapa();
  if (editandoMapa) {
    for (var i = 0; i < gobMarkers.length; i++) {
      gobMarkers[i].off('click', onGobMarkerClick);
      gobMarkers[i].on('click', onGobMarkerClick);
    }
  }
  toast('Punto borrado: ' + nombre, 'ok');
}
window.borrarPuntoEdicion = borrarPuntoEdicion;


