// ═══════════════════════════════════════════════════════════════
// ANALISIS.JS — Índice de Riesgo Compuesto por AGEB
// Irapuato Intel · Sprint 2
//
// Fórmula: IRZ = (pobreza × 0.30) + (delitos × 0.40) + (noticias × 0.30)
// Escala:  0–100 por AGEB
//
// Responsabilidades:
//   1. calcularIndiceRiesgo(clave_ageb) → { score, nivel, color, label }
//   2. calcularTodosLosAgebs()         → mapa de resultados para choropleth
//   3. analisisChoroToggle(mapa, btn)  → capa Leaflet en mapa
//   4. analisisBadgeHTML(lat, lng)     → HTML del badge para tarjetas
//   5. analisisContextoIA(lat, lng)    → texto para prompts de Gemini
// ═══════════════════════════════════════════════════════════════

// ── Estado ──
var ANALISIS = {
  cache:      {},    // { clave_ageb: resultado }
  dirty:      true,  // necesita recalcular
  choroLayer: null,
  choroActivo: false,
  choroLeyenda: null,
  lastCalc:   0
};

// ── Pesos ──
var PESOS = { pobreza: 0.30, delitos: 0.40, noticias: 0.30 };

// ── Paleta de riesgo: 5 niveles ──
var RIESGO_NIVELES = [
  { min: 0,  max: 20,  color: '#0ea55c', bg: '#0ea55c22', borde: '#0ea55c55', label: 'BAJO',      emoji: '🟢', nivel: 1 },
  { min: 20, max: 40,  color: '#d97706', bg: '#d9770622', borde: '#d9770655', label: 'MODERADO',  emoji: '🟡', nivel: 2 },
  { min: 40, max: 60,  color: '#dc2626', bg: '#dc262622', borde: '#dc262655', label: 'ALTO',      emoji: '🔴', nivel: 3 },
  { min: 60, max: 80,  color: '#9f1239', bg: '#9f123922', borde: '#9f123955', label: 'MUY ALTO',  emoji: '🔺', nivel: 4 },
  { min: 80, max: 101, color: '#6d28d9', bg: '#6d28d922', borde: '#6d28d955', label: 'CRÍTICO',   emoji: '⛔', nivel: 5 }
];

function _nivelDeScore(score) {
  for (var i = RIESGO_NIVELES.length - 1; i >= 0; i--) {
    if (score >= RIESGO_NIVELES[i].min) return RIESGO_NIVELES[i];
  }
  return RIESGO_NIVELES[0];
}

// ═══════════════════════════════════════════════════════════════
// 1. CÁLCULO DEL ÍNDICE
// ═══════════════════════════════════════════════════════════════

// Normalizar pobreza AGEB (0-100%) → componente 0-100
function _componentePobreza(clave_ageb) {
  if (!window.GEO || !GEO.coneval || !GEO.coneval.ageb) return 50; // default medio si no hay datos
  var datos = GEO.coneval.ageb[clave_ageb];
  if (!datos) return 50;
  // Usar el nivel numérico del rango (1-5) → normalizar a 0-100
  var rango = datos.rango ? datos.rango.trim() : '';
  var niveles = {
    '[ 0, 18]': 10,
    '[0, 18]':  10,
    '[0,18]':   10,
    '(18, 34]': 30,
    '(18,34]':  30,
    '(34, 50]': 55,
    '(34,50]':  55,
    '(50, 70]': 75,
    '(50,70]':  75,
    '(70, 100]':95,
    '(70,100]': 95
  };
  return niveles[rango] !== undefined ? niveles[rango] : 50;
}

// Calcular componente de delitos/seguridad basado en noticias de la BD
// Ventana: últimos 90 días. Radio: ~600m del centroide del AGEB
function _componenteDelitos(clave_ageb) {
  if (typeof noticias === 'undefined' || !noticias || !noticias.length) return 0;
  if (!window.GEO || !GEO.geojson) return 0;

  // Tipos de alto riesgo (peso 1.0), riesgo medio (peso 0.5)
  var ALTO_RIESGO = { seguridad: 1.0, crimen_organizado: 1.0, desaparecido: 0.9 };
  var MED_RIESGO  = { accidente: 0.5, corrupcion: 0.4 };

  var ahora = Date.now();
  var ventana90 = 90 * 24 * 60 * 60 * 1000;

  // Obtener bbox del AGEB para filtro rápido
  var feature = _featurePorClave(clave_ageb);
  if (!feature) return 0;
  var bbox = _bboxAgeb(feature);
  if (!bbox) return 0;
  // Expandir bbox un poco (~600m ≈ 0.006°)
  var pad = 0.006;
  bbox.minLat -= pad; bbox.maxLat += pad;
  bbox.minLng -= pad; bbox.maxLng += pad;

  var score = 0;
  noticias.forEach(function(n) {
    var ts = n.ts || (n.fechaGuardado && n.fechaGuardado.seconds ? n.fechaGuardado.seconds * 1000 : 0);
    if (!ts || (ahora - ts) > ventana90) return; // fuera de ventana
    var lat = parseFloat(n.lat), lng = parseFloat(n.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) return;
    // Recencia: más reciente = más peso (decay lineal)
    var diasAtras = (ahora - ts) / (24 * 60 * 60 * 1000);
    var recencia = Math.max(0, 1 - diasAtras / 90);
    var tipo = n.tipo || '';
    var peso = ALTO_RIESGO[tipo] !== undefined ? ALTO_RIESGO[tipo] :
               MED_RIESGO[tipo]  !== undefined ? MED_RIESGO[tipo]  : 0.1;
    score += peso * (0.5 + 0.5 * recencia); // base 0.5 + bonus recencia
  });

  // Normalizar: 10+ incidentes ponderados = 100
  return Math.min(100, (score / 10) * 100);
}

// Actividad de noticias en general (densidad informativa) por AGEB
function _componenteNoticias(clave_ageb) {
  if (typeof noticias === 'undefined' || !noticias || !noticias.length) return 0;
  if (!window.GEO || !GEO.geojson) return 0;

  var feature = _featurePorClave(clave_ageb);
  if (!feature) return 0;
  var bbox = _bboxAgeb(feature);
  if (!bbox) return 0;
  var pad = 0.006;
  bbox.minLat -= pad; bbox.maxLat += pad;
  bbox.minLng -= pad; bbox.maxLng += pad;

  var ahora = Date.now();
  var ventana30 = 30 * 24 * 60 * 60 * 1000;
  var count = 0;

  noticias.forEach(function(n) {
    var ts = n.ts || (n.fechaGuardado && n.fechaGuardado.seconds ? n.fechaGuardado.seconds * 1000 : 0);
    if (!ts || (ahora - ts) > ventana30) return;
    var lat = parseFloat(n.lat), lng = parseFloat(n.lng);
    if (isNaN(lat) || isNaN(lng)) return;
    if (lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng) count++;
  });

  // Normalizar: 5+ noticias en 30 días = 100
  return Math.min(100, (count / 5) * 100);
}

// ─── API pública de cálculo ───

function calcularIndiceRiesgo(clave_ageb) {
  if (!clave_ageb) return null;
  if (ANALISIS.cache[clave_ageb] && !ANALISIS.dirty) return ANALISIS.cache[clave_ageb];

  var p = _componentePobreza(clave_ageb);
  var d = _componenteDelitos(clave_ageb);
  var n = _componenteNoticias(clave_ageb);

  var score = Math.round(p * PESOS.pobreza + d * PESOS.delitos + n * PESOS.noticias);
  score = Math.min(100, Math.max(0, score));

  var nivel = _nivelDeScore(score);
  var resultado = {
    score:     score,
    nivel:     nivel.nivel,
    color:     nivel.color,
    bg:        nivel.bg,
    borde:     nivel.borde,
    label:     nivel.label,
    emoji:     nivel.emoji,
    // Componentes para debug/desglose
    comp: { pobreza: Math.round(p), delitos: Math.round(d), noticias: Math.round(n) }
  };
  ANALISIS.cache[clave_ageb] = resultado;
  return resultado;
}
window.calcularIndiceRiesgo = calcularIndiceRiesgo;

// Calcular todos los AGEBs con datos GeoJSON disponibles
function calcularTodosLosAgebs() {
  if (!window.GEO || !GEO.geojson) return {};
  var resultado = {};
  var features = GEO.geojson.features || [];
  ANALISIS.dirty = false;
  features.forEach(function(f) {
    var clave = _claveDeFeature(f);
    if (clave) resultado[clave] = calcularIndiceRiesgo(clave);
  });
  ANALISIS.lastCalc = Date.now();
  return resultado;
}
window.calcularTodosLosAgebs = calcularTodosLosAgebs;

// Invalidar caché cuando cambian las noticias
function analisisInvalidar() {
  ANALISIS.dirty = true;
  ANALISIS.cache = {};
}
window.analisisInvalidar = analisisInvalidar;

// ═══════════════════════════════════════════════════════════════
// 2. BADGE HTML — para tarjetas BD e Intel
// ═══════════════════════════════════════════════════════════════

function analisisBadgeHTML(lat, lng) {
  if (!window.GEO || !GEO.loaded || !GEO.geojson) return '';
  var clave = _clavePorPunto(parseFloat(lat), parseFloat(lng));
  if (!clave) return '';
  var r = calcularIndiceRiesgo(clave);
  if (!r) return '';
  return '<div class="irz-badge" style="' +
    'display:inline-flex;align-items:center;gap:5px;' +
    'background:' + r.bg + ';' +
    'border:1px solid ' + r.borde + ';' +
    'border-radius:3px;padding:3px 7px;margin-top:4px;' +
    'font-family:monospace;font-size:7px;cursor:pointer;' +
    '" title="IRZ ' + r.score + '/100 · Pobreza:' + r.comp.pobreza + ' Delitos:' + r.comp.delitos + ' Actividad:' + r.comp.noticias + '"' +
    ' onclick="analisisVerDetalle(\'' + clave + '\')">' +
    '<span style="font-size:9px;">' + r.emoji + '</span>' +
    '<span style="color:' + r.color + ';font-weight:700;letter-spacing:.5px;">RIESGO ' + r.label + '</span>' +
    '<span style="color:' + r.color + ';font-size:10px;font-weight:900;">' + r.score + '</span>' +
    '<span style="color:#3a5a7a;font-size:6px;">/100</span>' +
    '</div>';
}
window.analisisBadgeHTML = analisisBadgeHTML;

// Modal/toast con desglose del índice
function analisisVerDetalle(clave_ageb) {
  var r = ANALISIS.cache[clave_ageb] || calcularIndiceRiesgo(clave_ageb);
  if (!r) return;
  var msg = 'AGEB ' + clave_ageb + ' · IRZ ' + r.score + '/100 (' + r.label + ')\n' +
    'Pobreza: ' + r.comp.pobreza + ' × 0.30 = ' + Math.round(r.comp.pobreza * 0.30) + '\n' +
    'Delitos: ' + r.comp.delitos + ' × 0.40 = ' + Math.round(r.comp.delitos * 0.40) + '\n' +
    'Actividad: ' + r.comp.noticias + ' × 0.30 = ' + Math.round(r.comp.noticias * 0.30);
  if (typeof toast === 'function') toast(msg, 'ok');
}
window.analisisVerDetalle = analisisVerDetalle;

// ═══════════════════════════════════════════════════════════════
// 3. CHOROPLETH IRZ EN MAPA
// ═══════════════════════════════════════════════════════════════

function analisisChoroRender(mapaLeaflet) {
  if (!mapaLeaflet || !window.GEO || !GEO.geojson) return;

  if (ANALISIS.choroLayer) {
    try { mapaLeaflet.removeLayer(ANALISIS.choroLayer); } catch(e) {}
    ANALISIS.choroLayer = null;
  }

  var scores = calcularTodosLosAgebs();

  ANALISIS.choroLayer = L.geoJSON(GEO.geojson, {
    style: function(feature) {
      var clave = _claveDeFeature(feature);
      var r = scores[clave];
      if (!r) return { fillOpacity: 0, opacity: 0, weight: 0 };
      return {
        fillColor:   r.color,
        fillOpacity: 0.40 + (r.nivel * 0.08), // más opaco = más riesgo
        color:       r.color,
        weight:      0.7,
        opacity:     0.6
      };
    },
    onEachFeature: function(feature, layer) {
      var clave = _claveDeFeature(feature);
      var r = scores[clave];
      if (!r) return;

      // Barra de desglose en el popup
      function barra(label, val, color) {
        return '<div style="margin-bottom:3px;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:1px;">' +
            '<span style="font-size:7px;color:#7a9ab8;">' + label + '</span>' +
            '<span style="font-size:7px;color:' + color + ';font-weight:700;">' + val + '</span>' +
          '</div>' +
          '<div style="height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">' +
            '<div style="height:100%;width:' + val + '%;background:' + color + ';border-radius:2px;"></div>' +
          '</div></div>';
      }

      var html =
        '<div style="font-family:monospace;background:#060d18;color:#c8d8e8;padding:10px 12px;border-radius:4px;min-width:200px;">' +
        '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:6px;">ÍNDICE DE RIESGO ZONAL · AGEB ' + clave + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
          '<div style="font-size:28px;font-weight:900;color:' + r.color + ';line-height:1;">' + r.score + '</div>' +
          '<div>' +
            '<div style="font-size:8px;color:' + r.color + ';font-weight:700;letter-spacing:1px;">' + r.emoji + ' ' + r.label + '</div>' +
            '<div style="font-size:6.5px;color:#3a5a7a;">/ 100 puntos</div>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid #0d2040;padding-top:6px;margin-bottom:4px;">' +
          barra('Pobreza (×0.30)',   r.comp.pobreza,   '#9f1239') +
          barra('Delitos (×0.40)',   r.comp.delitos,   '#dc2626') +
          barra('Actividad (×0.30)', r.comp.noticias,  '#d97706') +
        '</div>' +
        '<div style="font-size:6.5px;color:#2a4a6a;border-top:1px solid #0d2040;padding-top:5px;">Toca para detalles completos</div>' +
        '</div>';

      layer.bindPopup(html, { maxWidth: 280 });
      layer.on('mouseover', function() {
        this.setStyle({ fillOpacity: Math.min(0.40 + (r.nivel * 0.08) + 0.15, 0.9), weight: 1.5 });
      });
      layer.on('mouseout', function() {
        if (ANALISIS.choroLayer) ANALISIS.choroLayer.resetStyle(this);
      });
    }
  });

  ANALISIS.choroLayer.addTo(mapaLeaflet);
  _analisisLeyenda(mapaLeaflet);
}

function _analisisLeyenda(mapaLeaflet) {
  if (ANALISIS.choroLeyenda) {
    try { mapaLeaflet.removeControl(ANALISIS.choroLeyenda); } catch(e) {}
  }
  ANALISIS.choroLeyenda = L.control({ position: 'bottomleft' });
  ANALISIS.choroLeyenda.onAdd = function() {
    var div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(6,13,24,0.92);border:1px solid #0d2040;border-radius:4px;padding:8px 10px;font-family:monospace;font-size:8px;color:#c0e8ff;';
    div.innerHTML =
      '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:6px;">ÍNDICE DE RIESGO ZONAL</div>' +
      RIESGO_NIVELES.map(function(n) {
        return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
          '<div style="width:14px;height:10px;background:' + n.color + ';opacity:0.75;border-radius:1px;flex-shrink:0;"></div>' +
          '<span style="color:#c0e8ff;">' + n.emoji + ' ' + n.label + ' (' + n.min + '–' + n.max + ')</span>' +
          '</div>';
      }).join('') +
      '<div style="margin-top:5px;border-top:1px solid #1a3050;padding-top:4px;font-size:6.5px;color:#3a5a7a;">Pobreza×0.3 + Delitos×0.4 + Actividad×0.3</div>';
    return div;
  };
  ANALISIS.choroLeyenda.addTo(mapaLeaflet);
}

function analisisChoroToggle(mapaLeaflet, btnEl) {
  var doToggle = function() {
    if (ANALISIS.choroActivo) {
      if (ANALISIS.choroLayer)   { try { mapaLeaflet.removeLayer(ANALISIS.choroLayer); }   catch(e) {} ANALISIS.choroLayer = null; }
      if (ANALISIS.choroLeyenda) { try { mapaLeaflet.removeControl(ANALISIS.choroLeyenda); } catch(e) {} ANALISIS.choroLeyenda = null; }
      ANALISIS.choroActivo = false;
      if (btnEl) { btnEl.textContent = '⚠ RIESGO'; btnEl.classList.remove('on'); }
      if (typeof toast === 'function') toast('Capa IRZ desactivada', 'ok');
    } else {
      analisisChoroRender(mapaLeaflet);
      ANALISIS.choroActivo = true;
      if (btnEl) { btnEl.textContent = '⚠ RIESGO ON'; btnEl.classList.add('on'); }
      if (typeof toast === 'function') toast('⚠ Índice de Riesgo Zonal activado · ' + Object.keys(ANALISIS.cache).length + ' AGEBs', 'ok');
    }
  };

  // Necesitamos GEO cargado
  if (!window.GEO || !GEO.loaded) {
    if (typeof geoCargar === 'function') {
      geoCargar(doToggle);
    } else {
      if (typeof toast === 'function') toast('⚠ geo.js no disponible', 'warn');
    }
    return;
  }
  doToggle();
}
window.analisisChoroToggle = analisisChoroToggle;

// ═══════════════════════════════════════════════════════════════
// 4. CONTEXTO PARA IA
// ═══════════════════════════════════════════════════════════════

function analisisContextoIA(lat, lng) {
  if (!window.GEO || !GEO.loaded) return '';
  var clave = _clavePorPunto(parseFloat(lat), parseFloat(lng));
  if (!clave) return '';
  var r = calcularIndiceRiesgo(clave);
  if (!r) return '';
  return 'Zona de riesgo ' + r.label + ' (IRZ ' + r.score + '/100). ' +
    'Componentes: pobreza ' + r.comp.pobreza + '/100, incidentes delictivos ' + r.comp.delitos + '/100, actividad informativa ' + r.comp.noticias + '/100.';
}
window.analisisContextoIA = analisisContextoIA;

// ═══════════════════════════════════════════════════════════════
// 5. UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════════════

function _claveDeFeature(feature) {
  var props = feature.properties || {};
  var raw = props.CVEGEO || props.CVE_AGEB || props.clave_ageb || props.CLAVE || '';
  raw = raw.toString().replace(/\./g, '').trim();
  if (raw.length === 15) raw = raw.substring(0, 14);
  return raw;
}

function _featurePorClave(clave) {
  if (!window.GEO || !GEO.geojson) return null;
  var features = GEO.geojson.features || [];
  for (var i = 0; i < features.length; i++) {
    if (_claveDeFeature(features[i]) === clave) return features[i];
  }
  return null;
}

function _bboxAgeb(feature) {
  var geo = feature.geometry;
  if (!geo) return null;
  var coords = [];
  var rings = geo.type === 'Polygon' ? geo.coordinates :
               geo.type === 'MultiPolygon' ? geo.coordinates.reduce(function(a, b) { return a.concat(b); }, []) : [];
  rings.forEach(function(ring) { ring.forEach(function(c) { coords.push(c); }); });
  if (!coords.length) return null;
  var lngs = coords.map(function(c) { return c[0]; });
  var lats = coords.map(function(c) { return c[1]; });
  return {
    minLat: Math.min.apply(null, lats), maxLat: Math.max.apply(null, lats),
    minLng: Math.min.apply(null, lngs), maxLng: Math.max.apply(null, lngs)
  };
}

// Point-in-polygon para encontrar AGEB de un punto
function _clavePorPunto(lat, lng) {
  if (!window.GEO || !GEO.geojson) return null;
  var point = [lng, lat];
  var features = GEO.geojson.features || [];
  for (var i = 0; i < features.length; i++) {
    var geo = features[i].geometry;
    if (!geo) continue;
    var dentro = false;
    var rings = geo.type === 'Polygon' ? [geo.coordinates[0]] :
                geo.type === 'MultiPolygon' ? geo.coordinates.map(function(p){ return p[0]; }) : [];
    for (var ri = 0; ri < rings.length; ri++) {
      if (_pip(point, rings[ri])) { dentro = true; break; }
    }
    if (dentro) return _claveDeFeature(features[i]);
  }
  return null;
}

// Ray-casting (copiado de geo.js para no crear dependencia cruzada)
function _pip(punto, coords) {
  var x = punto[0], y = punto[1], dentro = false;
  for (var i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    var xi = coords[i][0], yi = coords[i][1];
    var xj = coords[j][0], yj = coords[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}

// ─── Hook: invalidar caché cuando llegan noticias nuevas ───
// Se llama desde bd.js después de cada snapshot de Firestore
// Basta con sobreescribir la variable window.analisisInvalidar (ya expuesta)
