// ═══════════════════════════════════════════════════════════════
// GEO.JS — Módulo de Inteligencia Territorial
// Irapuato Intel · Sprint 1
//
// Responsabilidades:
//   1. Cargar y parsear coneval_irapuato.json
//   2. Cargar GeoJSON de AGEBs desde INEGI (CDN o local)
//   3. Spatial join: clave_ageb → datos CONEVAL
//   4. Exponer capa Leaflet de polígonos coloreados
//   5. Geo-lookup: dado (lat,lng) → AGEB + contexto social
//   6. Enriquecer noticias y tarjetas con contexto territorial
// ═══════════════════════════════════════════════════════════════

// ── Estado del módulo ──
var GEO = {
  coneval:     null,   // datos CONEVAL cargados
  geojson:     null,   // GeoJSON AGEBs INEGI
  agebLayer:   null,   // L.geoJSON layer activo en mapa
  agebActivo:  false,  // toggle visible
  loaded:      false,
  loading:     false,
  loadCallbacks: []
};

// ── Paleta de colores por rango de pobreza ──
// 5 rangos CONEVAL → escala roja (peor = más saturado)
var AGEB_COLORES = {
  '[ 0, 18]':   { fill: '#1a6e3c', stroke: '#14532d', label: '0–18%',   nivel: 1 },
  '(18, 34]':   { fill: '#d97706', stroke: '#92400e', label: '18–34%',  nivel: 2 },
  '(34, 50]':   { fill: '#dc2626', stroke: '#991b1b', label: '34–50%',  nivel: 3 },
  '(50, 70]':   { fill: '#9f1239', stroke: '#7f1d1d', label: '50–70%',  nivel: 4 },
  '(70, 100]':  { fill: '#581c87', stroke: '#3b0764', label: '70–100%', nivel: 5 }
};

// Normalizar el rango tal como viene del CSV (con espacios internos variables)
function _normRango(r) {
  if (!r) return null;
  r = r.trim();
  // Mapear variantes a clave canónica
  var map = {
    '[ 0, 18]':  '[ 0, 18]',
    '[0, 18]':   '[ 0, 18]',
    '[0,18]':    '[ 0, 18]',
    '(18, 34]':  '(18, 34]',
    '(18,34]':   '(18, 34]',
    '(34, 50]':  '(34, 50]',
    '(34,50]':   '(34, 50]',
    '(50, 70]':  '(50, 70]',
    '(50,70]':   '(50, 70]',
    '(70, 100]': '(70, 100]',
    '(70,100]':  '(70, 100]'
  };
  return map[r] || r;
}

// ═══════════════════════════════════════════════════════════════
// 1. CARGA DE DATOS
// ═══════════════════════════════════════════════════════════════

function geoCargar(callback) {
  if (GEO.loaded) { if (callback) callback(); return; }
  if (GEO.loading) { if (callback) GEO.loadCallbacks.push(callback); return; }
  GEO.loading = true;
  if (callback) GEO.loadCallbacks.push(callback);

  // Cargar CONEVAL primero, luego GeoJSON AGEBs
  fetch('coneval_irapuato.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      GEO.coneval = data;
      // Intentar cargar GeoJSON de AGEBs
      // URL oficial INEGI Marco Geoestadístico 2015 (AGEBs urbanas Irapuato)
      // Si no está disponible localmente, usamos polígono simplificado del municipio
      return _cargarGeoJSONAgebs();
    })
    .then(function(geojson) {
      GEO.geojson = geojson;
      GEO.loaded = true;
      GEO.loading = false;
      var cbs = GEO.loadCallbacks.slice();
      GEO.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
    })
    .catch(function(err) {
      console.warn('[GEO] Error cargando datos:', err);
      GEO.loading = false;
      // Continuar aunque falle el GeoJSON
      GEO.loaded = true;
      var cbs = GEO.loadCallbacks.slice();
      GEO.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
      if (typeof toast === 'function') toast('⚠ GeoJSON AGEBs no disponible — funciones básicas activas', 'warn');
    });
}

function _cargarGeoJSONAgebs() {
  // Intentar carga local primero (archivo en repo), luego generamos fallback
  return fetch('agebs_irapuato.geojson')
    .then(function(r) {
      if (!r.ok) throw new Error('no encontrado');
      return r.json();
    })
    .catch(function() {
      console.info('[GEO] agebs_irapuato.geojson no encontrado — usando datos tabulares únicamente');
      return null;
    });
}

// ═══════════════════════════════════════════════════════════════
// 2. CAPA LEAFLET DE AGEBs
// ═══════════════════════════════════════════════════════════════

function geoRenderCapaAgebs(mapaLeaflet) {
  if (!mapaLeaflet) return;
  if (!GEO.coneval) { geoCargar(function() { geoRenderCapaAgebs(mapaLeaflet); }); return; }

  // Remover capa anterior
  if (GEO.agebLayer) {
    try { mapaLeaflet.removeLayer(GEO.agebLayer); } catch(e) {}
    GEO.agebLayer = null;
  }

  if (!GEO.geojson) {
    // Sin GeoJSON: mostrar tabla visual lateral en lugar de polígonos
    _renderResumenConeval();
    return;
  }

  var coneval = GEO.coneval.ageb;

  GEO.agebLayer = L.geoJSON(GEO.geojson, {
    style: function(feature) {
      var clave = _extraerClaveAgeb(feature);
      var datos = coneval[clave];
      if (!datos) return { fillOpacity: 0, opacity: 0 };
      var rango = _normRango(datos.rango);
      var color = AGEB_COLORES[rango] || { fill: '#374151', stroke: '#1f2937' };
      return {
        fillColor:   color.fill,
        fillOpacity: 0.45,
        color:       color.stroke,
        weight:      0.8,
        opacity:     0.7
      };
    },
    onEachFeature: function(feature, layer) {
      var clave = _extraerClaveAgeb(feature);
      var datos = GEO.coneval.ageb[clave];
      if (!datos) return;
      var rango = _normRango(datos.rango);
      var color = AGEB_COLORES[rango] || { fill: '#374151', label: 'Sin datos', nivel: 0 };
      var denueCount = _contarDenueEnAgeb(feature);
      var popupHtml =
        '<div style="font-family:monospace;background:#0a1628;color:#c8d8e8;padding:8px 10px;border-radius:4px;min-width:180px;">' +
        '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:4px;">AGEB · ' + clave + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
          '<div style="width:12px;height:12px;border-radius:2px;background:' + color.fill + ';flex-shrink:0;"></div>' +
          '<div style="font-size:11px;font-weight:700;color:#fff;">Pobreza: ' + color.label + '</div>' +
        '</div>' +
        '<div style="font-size:8px;color:#7a9ab8;margin-bottom:2px;">Rango: ' + datos.rango + '</div>' +
        '<div style="font-size:8px;color:#7a9ab8;margin-bottom:2px;">Pobreza extrema: ' + datos.rango_ext + '</div>' +
        (denueCount > 0 ? '<div style="font-size:8px;color:#ffcc00;margin-top:4px;">📍 ' + denueCount + ' establecimientos DENUE</div>' : '') +
        '<div style="margin-top:6px;border-top:1px solid #1a3050;padding-top:6px;">' +
          '<div style="font-size:7px;color:#3a6a9a;">MUNICIPIO · 2020</div>' +
          '<div style="font-size:8px;color:#c0e8ff;">Pobreza total: ' + GEO.coneval.municipal['2020'].pobreza_pct + '%</div>' +
          '<div style="font-size:8px;color:#c0e8ff;">Carencia salud: ' + GEO.coneval.municipal['2020'].carencia_salud_pct + '%</div>' +
        '</div>' +
        '</div>';
      layer.bindPopup(popupHtml, { maxWidth: 260 });
      layer.on('mouseover', function() {
        this.setStyle({ fillOpacity: 0.7, weight: 1.5 });
      });
      layer.on('mouseout', function() {
        GEO.agebLayer.resetStyle(this);
      });
    }
  });

  GEO.agebLayer.addTo(mapaLeaflet);
  GEO.agebActivo = true;
}

function geoToggleAgebs(mapaLeaflet, btnEl) {
  if (!GEO.loaded) {
    geoCargar(function() { geoToggleAgebs(mapaLeaflet, btnEl); });
    return;
  }
  if (GEO.agebActivo && GEO.agebLayer) {
    try { mapaLeaflet.removeLayer(GEO.agebLayer); } catch(e) {}
    GEO.agebActivo = false;
    if (btnEl) { btnEl.textContent = '📊 POBREZA'; btnEl.classList.remove('on'); }
  } else {
    geoRenderCapaAgebs(mapaLeaflet);
    GEO.agebActivo = true;
    if (btnEl) { btnEl.textContent = '📊 POBREZA ON'; btnEl.classList.add('on'); }
    // Mostrar leyenda
    _mostrarLeyendaAgebs(mapaLeaflet);
  }
  if (typeof toast === 'function') {
    toast(GEO.agebActivo ? '📊 Capa CONEVAL activada · 153 AGEBs' : 'Capa CONEVAL desactivada', 'ok');
  }
}
window.geoToggleAgebs = geoToggleAgebs;

function _mostrarLeyendaAgebs(mapaLeaflet) {
  // Remover leyenda anterior
  var prev = document.getElementById('geo-leyenda');
  if (prev) prev.parentNode.removeChild(prev);

  var leyenda = L.control({ position: 'bottomleft' });
  leyenda.onAdd = function() {
    var div = L.DomUtil.create('div', '');
    div.id = 'geo-leyenda';
    div.style.cssText = 'background:rgba(6,13,24,0.92);border:1px solid #0d2040;border-radius:4px;padding:8px 10px;font-family:monospace;font-size:8px;color:#c0e8ff;';
    div.innerHTML = '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:6px;">POBREZA POR AGEB · CONEVAL 2015</div>' +
      Object.keys(AGEB_COLORES).map(function(k) {
        var c = AGEB_COLORES[k];
        return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
          '<div style="width:14px;height:10px;background:' + c.fill + ';border:1px solid ' + c.stroke + ';border-radius:1px;flex-shrink:0;"></div>' +
          '<span style="color:#c0e8ff;">' + c.label + '</span>' +
          '</div>';
      }).join('') +
      '<div style="margin-top:5px;border-top:1px solid #1a3050;padding-top:4px;font-size:7px;color:#3a5a7a;">Toca un AGEB para detalles</div>';
    return div;
  };
  leyenda.addTo(mapaLeaflet);
}

// ═══════════════════════════════════════════════════════════════
// 3. GEO-LOOKUP: (lat,lng) → contexto territorial
// ═══════════════════════════════════════════════════════════════

// Dado un punto, retorna el contexto CONEVAL más cercano
// Si hay GeoJSON, hace point-in-polygon; si no, usa heurística
function geoLookup(lat, lng) {
  if (!GEO.loaded || !GEO.coneval) return null;

  var resultado = {
    clave_ageb: null,
    rango_pobreza: null,
    nivel_pobreza: null,   // 1=bajo..5=muy alto
    color: null,
    descripcion: null,
    municipal: GEO.coneval.municipal['2020'] || null,
    denue_cercano: []
  };

  // Point-in-polygon si hay GeoJSON
  if (GEO.geojson) {
    var point = [lng, lat]; // GeoJSON usa [lng,lat]
    var features = GEO.geojson.features || [];
    for (var i = 0; i < features.length; i++) {
      if (_puntoDentroDeFeature(point, features[i])) {
        var clave = _extraerClaveAgeb(features[i]);
        var datos = GEO.coneval.ageb[clave];
        if (datos) {
          var rango = _normRango(datos.rango);
          var color = AGEB_COLORES[rango] || {};
          resultado.clave_ageb = clave;
          resultado.rango_pobreza = rango;
          resultado.nivel_pobreza = color.nivel || 0;
          resultado.color = color.fill;
          resultado.descripcion = _textoContexto(datos, color);
        }
        break;
      }
    }
  }

  // Establecimientos DENUE cercanos (radio ~500m)
  if (typeof DENUE_DATA !== 'undefined' && DENUE_DATA) {
    resultado.denue_cercano = _denueRadio(lat, lng, 0.005); // ~500m
  }

  return resultado;
}
window.geoLookup = geoLookup;

// Enriquecer array de noticias con contexto geo
function geoEnriquecerNoticias(noticiasArr) {
  if (!GEO.loaded) return;
  noticiasArr.forEach(function(n) {
    if (!n._geo && n.lat && n.lng) {
      n._geo = geoLookup(parseFloat(n.lat), parseFloat(n.lng));
    }
  });
}
window.geoEnriquecerNoticias = geoEnriquecerNoticias;

// Texto de contexto para prompts de IA
function geoTextoParaIA(lat, lng) {
  var ctx = geoLookup(parseFloat(lat), parseFloat(lng));
  if (!ctx) return '';
  var partes = [];
  if (ctx.clave_ageb) {
    partes.push('AGEB ' + ctx.clave_ageb);
    partes.push('Rango pobreza: ' + (ctx.rango_pobreza || 'No disponible'));
  }
  if (ctx.municipal) {
    partes.push('Municipio Irapuato 2020: ' + ctx.municipal.pobreza_pct + '% pobreza total');
    partes.push(ctx.municipal.carencia_salud_pct + '% sin acceso a salud');
    partes.push(ctx.municipal.carencia_seguridad_social_pct + '% sin seguridad social');
  }
  if (ctx.denue_cercano && ctx.denue_cercano.length > 0) {
    partes.push('Establecimientos cercanos (<500m): ' + ctx.denue_cercano.length);
  }
  return partes.join('. ') + '.';
}
window.geoTextoParaIA = geoTextoParaIA;

// ═══════════════════════════════════════════════════════════════
// 4. PANEL DE CONTEXTO SOCIAL — tarjeta lateral en Intel/BD
// ═══════════════════════════════════════════════════════════════

function geoRenderBadge(lat, lng, contenedorId) {
  var el = document.getElementById(contenedorId);
  if (!el) return;
  if (!GEO.loaded) {
    geoCargar(function() { geoRenderBadge(lat, lng, contenedorId); });
    return;
  }
  var ctx = geoLookup(parseFloat(lat), parseFloat(lng));
  if (!ctx || !ctx.clave_ageb) {
    el.innerHTML = '<span style="font-size:7px;color:#3a5a7a;">Zona sin datos AGEB</span>';
    return;
  }
  var color = ctx.color || '#374151';
  var label = ctx.rango_pobreza ? 'Pobreza ' + (AGEB_COLORES[ctx.rango_pobreza] || {label: ctx.rango_pobreza}).label : '';
  el.innerHTML =
    '<div style="display:inline-flex;align-items:center;gap:4px;background:' + color + '22;' +
    'border:1px solid ' + color + '66;border-radius:3px;padding:2px 6px;font-size:7px;color:' + color + ';font-family:monospace;">' +
    '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + color + ';"></span>' +
    label +
    '</div>';
}
window.geoRenderBadge = geoRenderBadge;

// Panel completo de resumen CONEVAL para tab de estadísticas o modal
function geoRenderPanelMunicipal(contenedorId) {
  var el = document.getElementById(contenedorId);
  if (!el) return;
  if (!GEO.loaded) {
    geoCargar(function() { geoRenderPanelMunicipal(contenedorId); });
    return;
  }
  var m2020 = (GEO.coneval && GEO.coneval.municipal) ? GEO.coneval.municipal['2020'] : null;
  var m2015 = (GEO.coneval && GEO.coneval.municipal) ? GEO.coneval.municipal['2015'] : null;
  if (!m2020) { el.innerHTML = '<span style="color:#3a5a7a;font-size:8px;">Datos municipales no cargados</span>'; return; }

  function delta(a, b) {
    var d = (a - b).toFixed(1);
    var color = d > 0 ? '#ff4466' : '#00c864';
    var arrow = d > 0 ? '▲' : '▼';
    return '<span style="color:' + color + ';font-size:7px;">' + arrow + ' ' + Math.abs(d) + '%</span>';
  }

  var indicadores = [
    { label: 'Pobreza total',        val: m2020.pobreza_pct,                  prev: m2015 ? m2015.pobreza_pct : null,                  color: '#ff4466' },
    { label: 'Pobreza extrema',      val: m2020.pobreza_extrema_pct,          prev: m2015 ? m2015.pobreza_extrema_pct : null,          color: '#cc0022' },
    { label: 'Carencia salud',       val: m2020.carencia_salud_pct,           prev: m2015 ? m2015.carencia_salud_pct : null,           color: '#ff8800' },
    { label: 'Seg. social',          val: m2020.carencia_seguridad_social_pct,prev: m2015 ? m2015.carencia_seguridad_social_pct : null,color: '#ffcc00' },
    { label: 'Rezago educativo',     val: m2020.carencia_educacion_pct,       prev: m2015 ? m2015.carencia_educacion_pct : null,       color: '#00ccff' },
    { label: 'Inseg. alimentaria',   val: m2020.carencia_alimentacion_pct,    prev: m2015 ? m2015.carencia_alimentacion_pct : null,    color: '#b464ff' }
  ];

  el.innerHTML =
    '<div style="font-family:monospace;background:#060d18;border:1px solid #0d2040;border-radius:4px;padding:10px;">' +
    '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1.5px;margin-bottom:8px;">IRAPUATO · CONEVAL 2020 · Población: ' + m2020.poblacion.toLocaleString() + '</div>' +
    indicadores.map(function(ind) {
      var barW = Math.round(ind.val);
      return '<div style="margin-bottom:5px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px;">' +
          '<span style="font-size:7.5px;color:#c0e8ff;">' + ind.label + '</span>' +
          '<span style="font-size:7.5px;font-weight:700;color:' + ind.color + ';">' + ind.val + '%' +
            (ind.prev !== null ? ' ' + delta(ind.val, ind.prev) : '') +
          '</span>' +
        '</div>' +
        '<div style="height:5px;background:#0d2040;border-radius:2px;overflow:hidden;">' +
          '<div style="height:100%;width:' + barW + '%;background:' + ind.color + ';border-radius:2px;opacity:.8;"></div>' +
        '</div>' +
      '</div>';
    }).join('') +
    '<div style="margin-top:8px;font-size:7px;color:#3a5a7a;">Fuente: CONEVAL · comparativo 2015→2020</div>' +
    '</div>';
}
window.geoRenderPanelMunicipal = geoRenderPanelMunicipal;

// Panel compacto de resumen AGEB para usar en popups y tarjetas de noticias
function geoRenderResumenAgeb(clave_ageb) {
  if (!GEO.coneval || !GEO.coneval.ageb) return '';
  var datos = GEO.coneval.ageb[clave_ageb];
  if (!datos) return '';
  var rango = _normRango(datos.rango);
  var color = AGEB_COLORES[rango] || { fill: '#374151', label: rango, nivel: 0 };
  return '<div style="display:inline-flex;align-items:center;gap:5px;padding:3px 7px;background:' + color.fill + '22;border:1px solid ' + color.fill + '55;border-radius:3px;">' +
    '<span style="width:8px;height:8px;border-radius:1px;background:' + color.fill + ';display:inline-block;flex-shrink:0;"></span>' +
    '<span style="font-size:7px;color:' + color.fill + ';font-family:monospace;">Pobreza ' + color.label + ' · CONEVAL</span>' +
    '</div>';
}
window.geoRenderResumenAgeb = geoRenderResumenAgeb;

// ═══════════════════════════════════════════════════════════════
// 5. UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════════════

function _extraerClaveAgeb(feature) {
  var props = feature.properties || {};
  // El Marco Geoestadístico INEGI puede usar CVEGEO, CVE_AGEB, CVEGEO o CLAVE
  var raw = props.CVEGEO || props.CVE_AGEB || props.clave_ageb || props.CLAVE || '';
  // Formato CVEGEO en INEGI es 15 chars: 2-estado + 3-mun + 4-loc + 4-ageb + 1-manzana
  // Para AGEB tomamos chars 0..12 (sin el dígito de manzana si lo trae)
  raw = raw.toString().replace(/\./g, '').trim();
  if (raw.length === 15) raw = raw.substring(0, 14); // quitar último char si es manzana
  return raw;
}

function _puntoDentroDeFeature(point, feature) {
  var geo = feature.geometry;
  if (!geo) return false;
  if (geo.type === 'Polygon') return _puntoDentroDePoligono(point, geo.coordinates[0]);
  if (geo.type === 'MultiPolygon') {
    for (var i = 0; i < geo.coordinates.length; i++) {
      if (_puntoDentroDePoligono(point, geo.coordinates[i][0])) return true;
    }
  }
  return false;
}

// Ray casting algorithm
function _puntoDentroDePoligono(punto, coords) {
  var x = punto[0], y = punto[1];
  var dentro = false;
  for (var i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    var xi = coords[i][0], yi = coords[i][1];
    var xj = coords[j][0], yj = coords[j][1];
    var intersecta = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersecta) dentro = !dentro;
  }
  return dentro;
}

// Contar establecimientos DENUE dentro de un feature (bbox aproximado)
function _contarDenueEnAgeb(feature) {
  if (typeof DENUE_DATA === 'undefined' || !DENUE_DATA) return 0;
  if (!feature.geometry) return 0;
  var bbox = _bboxDeFeature(feature);
  if (!bbox) return 0;
  return DENUE_DATA.filter(function(r) {
    return r[5] >= bbox.minLat && r[5] <= bbox.maxLat &&
           r[6] >= bbox.minLng && r[6] <= bbox.maxLng;
  }).length;
}

function _bboxDeFeature(feature) {
  var coords = [];
  var geo = feature.geometry;
  if (!geo) return null;
  var rings = geo.type === 'Polygon' ? geo.coordinates : (geo.type === 'MultiPolygon' ? geo.coordinates.flat() : []);
  rings.forEach(function(ring) { ring.forEach(function(c) { coords.push(c); }); });
  if (!coords.length) return null;
  var lngs = coords.map(function(c){ return c[0]; });
  var lats = coords.map(function(c){ return c[1]; });
  return { minLat: Math.min.apply(null,lats), maxLat: Math.max.apply(null,lats),
           minLng: Math.min.apply(null,lngs), maxLng: Math.max.apply(null,lngs) };
}

// Establecimientos DENUE en radio (delta en grados ≈ km/111)
function _denueRadio(lat, lng, delta) {
  if (typeof DENUE_DATA === 'undefined' || !DENUE_DATA) return [];
  return DENUE_DATA.filter(function(r) {
    return Math.abs(r[5] - lat) < delta && Math.abs(r[6] - lng) < delta;
  }).slice(0, 20);
}

function _textoContexto(datos, colorObj) {
  var nivel = colorObj ? colorObj.nivel : 0;
  var textos = [
    'Zona de bajo rezago social',
    'Zona de rezago social moderado',
    'Zona de rezago social medio-alto',
    'Zona de alto rezago social',
    'Zona de muy alto rezago social'
  ];
  return textos[nivel - 1] || 'Zona sin clasificar';
}

function _renderResumenConeval() {
  // Fallback cuando no hay GeoJSON: mostrar tabla de distribución de AGEBs
  if (!GEO.coneval) return;
  var conteos = {};
  Object.values(GEO.coneval.ageb).forEach(function(d) {
    var r = _normRango(d.rango);
    conteos[r] = (conteos[r] || 0) + 1;
  });
  console.info('[GEO] Distribución AGEBs Irapuato:', conteos);
}

// ── Auto-inicializar cuando el DOM esté listo ──
// No cargamos automáticamente para no consumir recursos si no se usa
// Llamar geoCargar() desde mapa.js cuando se active la capa

// ═══════════════════════════════════════════════════════════════
// CHOROPLETH DENUE — densidad de establecimientos por AGEB
// Carga instantánea: datos precalculados en denue_density.json
// ═══════════════════════════════════════════════════════════════

var DENUE_DENSITY     = null;
var denueChoroLayer   = null;
var denueChoroActivo  = false;
var denueChoroLeyenda = null;

// Escala de azules: 6 niveles, de casi transparente a azul intenso
var CHORO_ESCALA = [
  { min: 1,    max: 5,    fill: '#0a1f3a', label: '1–5',      opac: 0.35 },
  { min: 6,    max: 21,   fill: '#0d3a6e', label: '6–21',     opac: 0.50 },
  { min: 22,   max: 96,   fill: '#1060b8', label: '22–96',    opac: 0.60 },
  { min: 97,   max: 438,  fill: '#1a8ae0', label: '97–438',   opac: 0.72 },
  { min: 439,  max: 1000, fill: '#40c0ff', label: '439–1000', opac: 0.82 },
  { min: 1001, max: 9999, fill: '#80e0ff', label: '1001+',    opac: 0.90 }
];

function _choroColor(n) {
  for (var i = CHORO_ESCALA.length - 1; i >= 0; i--) {
    if (n >= CHORO_ESCALA[i].min) return CHORO_ESCALA[i];
  }
  return null;
}

function denueChoroCargar(callback) {
  if (DENUE_DENSITY) { if (callback) callback(); return; }
  fetch('denue_density.json')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      DENUE_DENSITY = d;
      if (callback) callback();
    })
    .catch(function(e) {
      console.warn('[GEO] denue_density.json no encontrado', e);
      if (typeof toast === 'function') toast('⚠ denue_density.json faltante', 'warn');
    });
}

function denueChoroRender(mapaLeaflet) {
  if (!mapaLeaflet) return;
  if (!GEO.geojson || !DENUE_DENSITY) return;

  // Limpiar capa anterior
  if (denueChoroLayer) { try { mapaLeaflet.removeLayer(denueChoroLayer); } catch(e) {} denueChoroLayer = null; }

  var density = DENUE_DENSITY.density;

  denueChoroLayer = L.geoJSON(GEO.geojson, {
    style: function(feature) {
      var clave = feature.properties.CVEGEO;
      var d = density[clave];
      if (!d || d.n === 0) return { fillOpacity: 0, opacity: 0, weight: 0 };
      var c = _choroColor(d.n);
      if (!c) return { fillOpacity: 0, opacity: 0, weight: 0 };
      return {
        fillColor:   c.fill,
        fillOpacity: c.opac,
        color:       '#0a2a4a',
        weight:      0.6,
        opacity:     0.5
      };
    },
    onEachFeature: function(feature, layer) {
      var clave = feature.properties.CVEGEO;
      var d = density[clave];
      if (!d) return;
      var c = _choroColor(d.n);
      var topCat = d.top || '';
      var topN   = d.cats ? (d.cats[topCat] || 0) : 0;
      layer.bindPopup(
        '<div style="font-family:monospace;background:#060d18;color:#c0e8ff;padding:8px 10px;border-radius:4px;min-width:160px;">' +
        '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:4px;">AGEB · ' + clave + '</div>' +
        '<div style="font-size:14px;font-weight:900;color:' + (c ? c.fill : '#fff') + ';margin-bottom:2px;">' + d.n.toLocaleString() + '</div>' +
        '<div style="font-size:8px;color:#7a9ab8;margin-bottom:4px;">establecimientos</div>' +
        (topCat ? '<div style="font-size:7px;color:#ffcc00;">Sector dominante: ' + topCat + ' (' + topN + ')</div>' : '') +
        '</div>',
        { maxWidth: 200 }
      );
      layer.on('mouseover', function() { this.setStyle({ fillOpacity: Math.min((c ? c.opac : 0.5) + 0.15, 1), weight: 1.2 }); });
      layer.on('mouseout',  function() { denueChoroLayer && denueChoroLayer.resetStyle(this); });
    }
  });

  denueChoroLayer.addTo(mapaLeaflet);
  _denueChoroLeyenda(mapaLeaflet);
}

function _denueChoroLeyenda(mapaLeaflet) {
  if (denueChoroLeyenda) { try { mapaLeaflet.removeControl(denueChoroLeyenda); } catch(e) {} }
  denueChoroLeyenda = L.control({ position: 'bottomleft' });
  denueChoroLeyenda.onAdd = function() {
    var div = L.DomUtil.create('div', '');
    div.style.cssText = 'background:rgba(6,13,24,0.92);border:1px solid #0d2040;border-radius:4px;padding:8px 10px;font-family:monospace;font-size:8px;color:#c0e8ff;';
    div.innerHTML =
      '<div style="font-size:7px;color:#3a6a9a;letter-spacing:1px;margin-bottom:6px;">ESTABLECIMIENTOS POR AGEB · DENUE</div>' +
      '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;"><div style="width:14px;height:10px;background:#0d2040;border:1px solid #1a3050;border-radius:1px;"></div><span style="color:#3a5a7a;">0</span></div>' +
      CHORO_ESCALA.map(function(c) {
        return '<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">' +
          '<div style="width:14px;height:10px;background:' + c.fill + ';opacity:' + c.opac + ';border-radius:1px;flex-shrink:0;"></div>' +
          '<span>' + c.label + '</span></div>';
      }).join('') +
      '<div style="margin-top:5px;border-top:1px solid #1a3050;padding-top:4px;font-size:7px;color:#3a5a7a;">Toca un AGEB para detalles</div>';
    return div;
  };
  denueChoroLeyenda.addTo(mapaLeaflet);
}

function denueChoroToggle(mapaLeaflet, btnEl) {
  // Cargar GeoJSON y density si no están
  var doToggle = function() {
    if (denueChoroActivo) {
      if (denueChoroLayer)   { try { mapaLeaflet.removeLayer(denueChoroLayer); }   catch(e) {} denueChoroLayer = null; }
      if (denueChoroLeyenda) { try { mapaLeaflet.removeControl(denueChoroLeyenda); } catch(e) {} denueChoroLeyenda = null; }
      denueChoroActivo = false;
      if (btnEl) { btnEl.textContent = '🔵 MACRO'; btnEl.classList.remove('on'); }
      var lbl = document.getElementById('denue-modo-label');
      if (lbl) lbl.textContent = 'MARKERS · detalle';
      // Limpiar cualquier capa de markers residual y re-renderizar puntos normales
      if (typeof denueMarkersLayer !== 'undefined' && denueMarkersLayer) {
        try { mapaLeaflet.removeLayer(denueMarkersLayer); } catch(e) {}
        denueMarkersLayer = null;
      }
      if (typeof renderDenueMapa === 'function') renderDenueMapa();
    } else {
      // Limpiar markers individuales y de colonia que estuvieran activos
      if (typeof denueHeatLayer !== 'undefined' && denueHeatLayer) {
        try { mapaLeaflet.removeLayer(denueHeatLayer); } catch(e) {} denueHeatLayer = null;
      }
      if (typeof denueMarkersLayer !== 'undefined' && denueMarkersLayer) {
        try { mapaLeaflet.removeLayer(denueMarkersLayer); } catch(e) {} denueMarkersLayer = null;
      }
      if (typeof _denueColoniasLayer !== 'undefined' && _denueColoniasLayer) {
        try { mapaLeaflet.removeLayer(_denueColoniasLayer); } catch(e) {} _denueColoniasLayer = null;
      }
      denueChoroRender(mapaLeaflet);
      denueChoroActivo = true;
      if (btnEl) { btnEl.textContent = '🔵 MACRO ON'; btnEl.classList.add('on'); }
      var lbl2 = document.getElementById('denue-modo-label');
      if (lbl2) lbl2.textContent = 'MACRO · densidad por AGEB';
      if (typeof toast === 'function') toast('📊 Densidad DENUE por AGEB · ' + Object.keys(DENUE_DENSITY.density).length + ' zonas', 'ok');
    }
  };

  // Asegurarse de tener ambos datasets
  var needGeo  = !GEO.geojson;
  var needDens = !DENUE_DENSITY;

  if (!needGeo && !needDens) { doToggle(); return; }

  if (typeof toast === 'function') toast('⏳ Cargando capas…', 'ok');

  var loaded = 0;
  var total  = (needGeo ? 1 : 0) + (needDens ? 1 : 0);
  var check  = function() { loaded++; if (loaded === total) doToggle(); };

  if (needGeo)  geoCargar(check);
  if (needDens) denueChoroCargar(check);
  if (!needGeo)  check();  // ya tenía geo
  if (!needDens) check();  // ya tenía density — nunca ocurre aquí pero por seguridad
}
window.denueChoroToggle = denueChoroToggle;
