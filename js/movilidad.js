// movilidad.js — Módulo MOVILIDAD URBANA v3
// Capas: GOV | Semáforos OSM | Semáforos Manuales | Nodos Críticos
// Firestore: colección 'semaforos-irapuato'
// ES5 estricto — sin arrow functions, sin const/let, sin template literals

// ═══════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════
var MOVILIDAD = {
  mapa:    null,
  capas:   { gov: null, semOSM: null, semManuales: null, nodos: null, vialidad: null, redOSM: null },
  toggles: { gov: true, semOSM: false, semManuales: true, nodos: false, vialidad: true, redOSM: false },
  cache:   { semOSM: null, semOSM_ts: 0, TTL: 7*24*3600*1000,
             redOSM: null, redOSM_ts: 0, redOSM_TTL: 30*24*3600*1000 },
  cargando:{ semOSM: false, redOSM: false },
  edicion: false,
  modoEdicion: 'sem',     // 'sem' | 'via'
  editandoId: null,
  semManualesData: [],
  vialidadData: [],
  _obsId: null,
  _viaPolyline: null,     // L.polyline activo durante trazado
  _viaPuntos: [],         // puntos del segmento en construcción
  _viaRedoPuntos: [],     // puntos deshechados (para redo)
  _viaNodosLayer: null,   // layer de nodos snap existentes
  _modoSatelital: true,
  _tilesSatelital: null,
  _tilesCalles: null,
  _tilesNombres: null,
  _tilesDark: null,
  _tilesDarkLabels: null,
  _osmFallback: false,
  _autoOscuro: false
};

// Bbox ajustado a Irapuato — excluye Salamanca/Silao/Abasolo
var MOV_BBOX      = '20.5700,-101.4800,20.7900,-101.2200';
var MOV_CENTRO    = [20.6795, -101.3540];
var MOV_RADIO_MAX = 18; // km — filtro adicional por distancia al centro

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
function movilidadInit() {
  try {
    var el = document.getElementById('movilidad-mapa');
    if (!el || typeof L === 'undefined') return;

    // Si ya existe — misma lógica que iniciarIntel:
    // solo invalidar y re-renderizar, NO recrear
    if (MOVILIDAD.mapa) {
      MOVILIDAD.mapa.invalidateSize(true);
      setTimeout(function() {
        MOVILIDAD.mapa.invalidateSize({ animate: false });
        MOVILIDAD.mapa.setView(MOV_CENTRO, 12, { animate: false });
        // Reaplicar filtro oscuro si estaba activo (se pierde al ocultar/mostrar el tab)
        if (MOVILIDAD._modoOscuro) {
          var cont = document.getElementById('movilidad-mapa');
          if (cont) cont.style.filter = 'invert(1) hue-rotate(200deg) brightness(0.85) saturate(0.9)';
        }
        movilidadRenderGov();
        if (MOVILIDAD.toggles.semManuales) movilidadRenderSemManuales();
        if (MOVILIDAD.toggles.vialidad)    _vialidadRender();
      }, 300);
      return;
    }

    // Primera vez — crear el mapa
    MOVILIDAD.mapa = L.map('movilidad-mapa', {
      center: MOV_CENTRO, zoom: 12, zoomControl: true
    });

    // OSM — mismo tile que Intel y DENUE
    var tilesOSM = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OSM', maxZoom: 18 }
    );
    tilesOSM.addTo(MOVILIDAD.mapa);
    MOVILIDAD._tilesOSM = tilesOSM;

    // Satelital Esri — se agrega/quita con botón SAT
    MOVILIDAD._tilesSatelital = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    );
    // Si Esri falla, volver a OSM automáticamente
    MOVILIDAD._tilesSatelital.on('tileerror', function() {
      if (MOVILIDAD._modoSatelital) _movilidadAplicarOSM(true);
    });

    MOVILIDAD._modoSatelital = false;
    MOVILIDAD._modoOscuro    = false;
    MOVILIDAD._autoOscuro    = false;

    // Eventos del mapa
    MOVILIDAD.mapa.on('click', function(e) {
      if (!MOVILIDAD.edicion) return;
      if (MOVILIDAD.modoEdicion === 'sem') {
        movilidadAbrirPanelNuevo(e.latlng.lat, e.latlng.lng);
      }
    });
    MOVILIDAD.mapa.on('dblclick', function(e) {
      if (!MOVILIDAD.edicion) return;
      if (MOVILIDAD.modoEdicion === 'via') {
        L.DomEvent.stopPropagation(e);
        _vialidadTerminarTrazado(e);
      }
    });

    movilidadCargarCacheOSM();
    movilidadBindBotones();

    // Patrón exacto de iniciarIntel: dos invalidateSize + setView explícito
    setTimeout(function() { MOVILIDAD.mapa.invalidateSize(true); }, 100);
    setTimeout(function() {
      MOVILIDAD.mapa.invalidateSize({ animate: false });
      MOVILIDAD.mapa.setView(MOV_CENTRO, 12, { animate: false });
      movilidadRenderGov();
      movilidadCargarSemManuales();
      movilidadCargarVialidad();
    }, 600);

  } catch(e) { console.log('movilidadInit error:', e.message); }
}
window.movilidadInit = movilidadInit;

// ═══════════════════════════════════════════════════════════
// HELPERS INTERNOS DE TILES
// ═══════════════════════════════════════════════════════════
// ── Aplicar OSM normal (claro) ──
function _movilidadAplicarOSM(silencioso) {
  var m = MOVILIDAD.mapa;
  if (!m) return;
  try { m.removeLayer(MOVILIDAD._tilesSatelital); } catch(e) {}
  if (!m.hasLayer(MOVILIDAD._tilesOSM)) MOVILIDAD._tilesOSM.addTo(m);
  // Quitar filtro oscuro
  var cont = document.getElementById('movilidad-mapa');
  if (cont) cont.style.filter = '';
  MOVILIDAD._modoSatelital = false;
  MOVILIDAD._modoOscuro    = false;
  var btn = document.getElementById('mov-btn-sat');
  if (btn) { btn.textContent = '\uD83D\uDEF0 SAT'; btn.classList.remove('on'); }
  var btnD = document.getElementById('mov-btn-oscuro');
  if (btnD) btnD.classList.remove('on');
}

// ── Aplicar satelital Esri ──
function _movilidadAplicarSatelital(silencioso) {
  var m = MOVILIDAD.mapa;
  if (!m) return;
  // Quitar filtro oscuro
  var cont = document.getElementById('movilidad-mapa');
  if (cont) cont.style.filter = '';
  try { m.removeLayer(MOVILIDAD._tilesOSM); } catch(e) {}
  if (!m.hasLayer(MOVILIDAD._tilesSatelital)) MOVILIDAD._tilesSatelital.addTo(m);
  MOVILIDAD._modoSatelital = true;
  MOVILIDAD._modoOscuro    = false;
  var btn = document.getElementById('mov-btn-sat');
  if (btn) { btn.textContent = '\uD83D\uDEF0 SAT ON'; btn.classList.add('on'); }
}

// ── Aplicar modo oscuro: OSM + CSS invert ──
// Esta técnica invierte los colores del mapa en el canvas directamente.
// No depende de ningún servidor externo — funciona en cualquier WebView.
function _movilidadAplicarOscuro(silencioso) {
  var m = MOVILIDAD.mapa;
  if (!m) return;
  // Asegurar OSM activo como base
  try { m.removeLayer(MOVILIDAD._tilesSatelital); } catch(e) {}
  if (!m.hasLayer(MOVILIDAD._tilesOSM)) MOVILIDAD._tilesOSM.addTo(m);
  // CSS filter: invert + hue-rotate da resultado azul-noche oscuro
  var cont = document.getElementById('movilidad-mapa');
  if (cont) cont.style.filter = 'invert(1) hue-rotate(200deg) brightness(0.85) saturate(0.9)';
  MOVILIDAD._modoSatelital = false;
  MOVILIDAD._modoOscuro    = true;
  var btn = document.getElementById('mov-btn-sat');
  if (btn) { btn.textContent = '\uD83D\uDEF0 SAT'; btn.classList.remove('on'); }
  var btnD = document.getElementById('mov-btn-oscuro');
  if (btnD) btnD.classList.add('on');
}

// ═══════════════════════════════════════════════════════════
// TOGGLE SATELITAL / OSCURO (botón manual)
// ═══════════════════════════════════════════════════════════
// Botón SAT: alterna entre OSM y Satelital
function movilidadToggleSatelital() {
  if (!MOVILIDAD.mapa) return;
  MOVILIDAD._autoOscuro = false;
  if (MOVILIDAD._modoSatelital) {
    _movilidadAplicarOSM(false);
  } else {
    _movilidadAplicarSatelital(false);
  }
}
window.movilidadToggleSatelital = movilidadToggleSatelital;

// Botón OSCURO: alterna modo oscuro CSS sobre OSM
function movilidadToggleOscuro() {
  if (!MOVILIDAD.mapa) return;
  MOVILIDAD._autoOscuro = false;
  if (MOVILIDAD._modoOscuro) {
    _movilidadAplicarOSM(false);
  } else {
    _movilidadAplicarOscuro(false);
  }
}
window.movilidadToggleOscuro = movilidadToggleOscuro;

// ═══════════════════════════════════════════════════════════
// CACHE OSM — localStorage, TTL 7 días
// ═══════════════════════════════════════════════════════════
function movilidadCargarCacheOSM() {
  try {
    var raw = localStorage.getItem('mov_sem_osm_v2');
    if (!raw) return;
    var obj = JSON.parse(raw);
    if (obj && obj.ts && obj.data) {
      MOVILIDAD.cache.semOSM    = obj.data;
      MOVILIDAD.cache.semOSM_ts = obj.ts;
    }
  } catch(e) {}
}
function movilidadGuardarCacheOSM(data) {
  try {
    localStorage.setItem('mov_sem_osm_v2', JSON.stringify({ ts: Date.now(), data: data }));
    MOVILIDAD.cache.semOSM    = data;
    MOVILIDAD.cache.semOSM_ts = Date.now();
  } catch(e) {}
}
function movilidadCacheOSMVigente() {
  return MOVILIDAD.cache.semOSM && (Date.now() - MOVILIDAD.cache.semOSM_ts) < MOVILIDAD.cache.TTL;
}

// ═══════════════════════════════════════════════════════════
// DISPERSIÓN — evita apilamiento en mismo edificio
// ═══════════════════════════════════════════════════════════
function movilidadDispersar(deps) {
  var grupos = {};
  deps.forEach(function(d, i) {
    if (!d.lat || !d.lng) return;
    var k = d.lat.toFixed(4) + ',' + d.lng.toFixed(4);
    if (!grupos[k]) grupos[k] = [];
    grupos[k].push(i);
  });
  var res = deps.map(function(d) { return { lat: d.lat, lng: d.lng, dep: d }; });
  Object.keys(grupos).forEach(function(k) {
    var idxs = grupos[k];
    if (idxs.length < 2) return;
    var radio = 0.00045;
    idxs.forEach(function(idx, pos) {
      var ang = (2 * Math.PI / idxs.length) * pos;
      res[idx].lat = deps[idx].lat + radio * Math.cos(ang);
      res[idx].lng = deps[idx].lng + radio * Math.sin(ang) / Math.cos(deps[idx].lat * Math.PI / 180);
    });
  });
  return res;
}

// ═══════════════════════════════════════════════════════════
// CAPA GOV
// ═══════════════════════════════════════════════════════════
function movilidadToggleGov() {
  MOVILIDAD.toggles.gov = !MOVILIDAD.toggles.gov;
  movilidadActualizarBoton('mov-btn-gov', MOVILIDAD.toggles.gov);
  movilidadRenderGov();
}
window.movilidadToggleGov = movilidadToggleGov;

function movilidadRenderGov() {
  if (!MOVILIDAD.mapa) return;
  if (MOVILIDAD.capas.gov) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.gov); MOVILIDAD.capas.gov = null; }
  if (!MOVILIDAD.toggles.gov) return;
  if (typeof DEPENDENCIAS_GOB === 'undefined' || !DEPENDENCIAS_GOB.length) return;

  var colores = (typeof GOB_COLORES !== 'undefined') ? GOB_COLORES : {};
  var iconos  = (typeof GOB_ICONOS  !== 'undefined') ? GOB_ICONOS  : {};
  var grupo   = L.layerGroup();
  var count   = 0;

  movilidadDispersar(DEPENDENCIAS_GOB).forEach(function(item) {
    var dep = item.dep;
    if (!dep || !dep.lat || !dep.lng) return;
    var color = colores[dep.funcion] || '#00ccff';
    var emoji = iconos[dep.funcion]  || '\uD83C\uDFDB';
    var ic = L.divIcon({
      className: '', iconSize: [26,26], iconAnchor: [13,13], popupAnchor: [0,-14],
      html: '<div style="width:24px;height:24px;border-radius:50%;background:' + color + '22;' +
            'border:2px solid ' + color + ';display:flex;align-items:center;justify-content:center;' +
            'font-size:13px;box-shadow:0 0 8px ' + color + '55;">' + emoji + '</div>'
    });
    var mk = L.marker([item.lat, item.lng], { icon: ic });
    mk.bindPopup(
      '<div style="font-family:monospace;font-size:11px;min-width:190px;max-width:240px;color:#e0e0e0;">' +
      '<div style="font-weight:700;color:' + color + ';font-size:12px;margin-bottom:3px;">' + emoji + ' ' + dep.nombre + '</div>' +
      '<div style="color:#777;font-size:9px;margin-bottom:4px;">' + (dep.funcionLabel||'') + '</div>' +
      (dep.titular ? '<div style="color:#aaa;font-size:9px;">\uD83D\uDC64 ' + dep.titular + '</div>' : '') +
      (dep.dir     ? '<div style="color:#666;font-size:9px;">\uD83D\uDCCD ' + dep.dir + '</div>' : '') +
      (dep.tel     ? '<div style="color:#666;font-size:9px;">\uD83D\uDCDE ' + dep.tel + (dep.ext ? ' ext.'+dep.ext : '') + '</div>' : '') +
      (dep.desc    ? '<div style="color:#555;font-size:9px;margin-top:4px;border-top:1px solid #222;padding-top:3px;">' + dep.desc + '</div>' : '') +
      (dep.web     ? '<div style="margin-top:4px;"><a href="https://' + dep.web + '" target="_blank" style="font-size:9px;color:' + color + ';">\uD83C\uDF10 ' + dep.web + '</a></div>' : '') +
      '</div>', { maxWidth: 260 }
    );
    mk.addTo(grupo); count++;
  });

  MOVILIDAD.capas.gov = grupo;
  grupo.addTo(MOVILIDAD.mapa);
  movilidadActualizarContador('gov', count);
}

// ═══════════════════════════════════════════════════════════
// CAPA SEMÁFOROS OSM (solo lectura)
// ═══════════════════════════════════════════════════════════
function movilidadToggleSemOSM() {
  MOVILIDAD.toggles.semOSM = !MOVILIDAD.toggles.semOSM;
  movilidadActualizarBoton('mov-btn-semaforos', MOVILIDAD.toggles.semOSM);
  if (!MOVILIDAD.toggles.semOSM) {
    if (MOVILIDAD.capas.semOSM) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.semOSM); MOVILIDAD.capas.semOSM = null; }
    movilidadActualizarContador('semaforos', null);
    return;
  }
  movilidadCacheOSMVigente() ? movilidadRenderSemOSM(MOVILIDAD.cache.semOSM) : movilidadFetchSemOSM();
}
window.movilidadToggleSemOSM = movilidadToggleSemOSM;

function movilidadFetchSemOSM() {
  if (MOVILIDAD.cargando.semOSM) return;
  MOVILIDAD.cargando.semOSM = true;
  movilidadSetStatus('Consultando Overpass...');
  var query = '[out:json][timeout:25];node["highway"="traffic_signals"](' + MOV_BBOX + ');out body;';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), true);
  xhr.timeout = 30000;
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    MOVILIDAD.cargando.semOSM = false;
    if (xhr.status === 200) {
      try {
        var elems = JSON.parse(xhr.responseText).elements || [];
        movilidadGuardarCacheOSM(elems);
        movilidadRenderSemOSM(elems);
        movilidadSetStatus('');
      } catch(e) { movilidadSetStatus('Error al parsear'); }
    } else if (xhr.status === 429) {
      movilidadSetStatus('Overpass ocupada \u2014 espera 1 min');
    } else {
      movilidadSetStatus('Error Overpass (' + xhr.status + ')');
    }
  };
  xhr.ontimeout = function() { MOVILIDAD.cargando.semOSM = false; movilidadSetStatus('Timeout'); };
  xhr.send();
}

function movilidadRenderSemOSM(nodos) {
  if (!MOVILIDAD.mapa || !nodos) return;
  if (MOVILIDAD.capas.semOSM) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.semOSM); MOVILIDAD.capas.semOSM = null; }

  var grupo = L.layerGroup();
  var count = 0;

  nodos.forEach(function(n) {
    if (!n.lat || !n.lon) return;
    // Filtro de distancia — descarta semáforos fuera de Irapuato
    if (movilidadDistKm(n.lat, n.lon, MOV_CENTRO[0], MOV_CENTRO[1]) > MOV_RADIO_MAX) return;

    var ic = L.divIcon({
      className: '', iconSize: [13,13], iconAnchor: [6,6],
      html: '<div style="width:11px;height:11px;border-radius:2px;' +
            'background:#ffcc00;border:1.5px solid #aa8800;' +
            'box-shadow:0 0 5px #ffcc0066;opacity:0.85;"></div>'
    });
    var mk = L.marker([n.lat, n.lon], { icon: ic });
    var tags = n.tags || {};
    mk.bindPopup(
      '<div style="font-family:monospace;font-size:10px;color:#e0e0e0;min-width:160px;">' +
      '<div style="color:#ffcc00;font-weight:700;margin-bottom:3px;">\uD83D\uDEA6 Sem\u00e1foro OSM</div>' +
      '<div style="color:#666;font-size:9px;">id: ' + n.id + '</div>' +
      (tags.traffic_signals ? '<div style="color:#888;font-size:9px;">tipo: '+tags.traffic_signals+'</div>' : '') +
      '<div style="color:#333;font-size:8px;margin-top:5px;font-style:italic;">Solo lectura \u2014 activa \u270F EDITAR para agregar datos de campo</div>' +
      '</div>', { maxWidth: 200 }
    );
    mk.addTo(grupo); count++;
  });

  MOVILIDAD.capas.semOSM = grupo;
  grupo.addTo(MOVILIDAD.mapa);
  movilidadActualizarContador('semaforos', count);
  if (typeof toast === 'function') toast(count + ' sem\u00e1foros OSM en Irapuato', 'ok');
}

// ═══════════════════════════════════════════════════════════
// SEMÁFOROS MANUALES — Firestore 'semaforos-irapuato'
//
// Esquema:
// { id, lat, lng, calle1, calle2, estado (funcionando|mantenimiento|apagado),
//   t_verde, t_amarillo, t_rojo (segundos),
//   offset_inicio, grupo_sincronizacion,
//   foto_url, notas,
//   observaciones: [{ts, hora_local, luz_observada, notas}],
//   creado, actualizado }
// ═══════════════════════════════════════════════════════════
function movilidadCargarSemManuales() {
  if (typeof db === 'undefined') return;
  db.collection('semaforos-irapuato')
    .orderBy('creado', 'desc')
    .onSnapshot(function(snap) {
      MOVILIDAD.semManualesData = [];
      snap.forEach(function(doc) {
        var d = doc.data(); d.id = doc.id;
        MOVILIDAD.semManualesData.push(d);
      });
      if (MOVILIDAD.toggles.semManuales) movilidadRenderSemManuales();
      movilidadActualizarContador('manuales', MOVILIDAD.semManualesData.length);
    }, function(err) {
      if (typeof toast === 'function') toast('Error sem. manuales: ' + err.message, 'err');
    });
}

function movilidadToggleSemManuales() {
  MOVILIDAD.toggles.semManuales = !MOVILIDAD.toggles.semManuales;
  movilidadActualizarBoton('mov-btn-manuales', MOVILIDAD.toggles.semManuales);
  if (!MOVILIDAD.toggles.semManuales) {
    if (MOVILIDAD.capas.semManuales) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.semManuales); MOVILIDAD.capas.semManuales = null; }
    movilidadActualizarContador('manuales', null);
  } else {
    movilidadRenderSemManuales();
  }
}
window.movilidadToggleSemManuales = movilidadToggleSemManuales;

function movilidadRenderSemManuales() {
  if (!MOVILIDAD.mapa) return;
  if (MOVILIDAD.capas.semManuales) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.semManuales); MOVILIDAD.capas.semManuales = null; }
  if (!MOVILIDAD.toggles.semManuales) return;

  var grupo = L.layerGroup();
  var ECOL = { funcionando:'#00ff88', mantenimiento:'#ffaa00', apagado:'#ff3333' };

  MOVILIDAD.semManualesData.forEach(function(s) {
    if (!s.lat || !s.lng) return;
    var color = ECOL[s.estado] || '#00ff88';
    var label = s.calle1 ? (s.calle1 + (s.calle2 ? ' x ' + s.calle2 : '')) : 'Sem\u00e1foro';
    var sid   = s.id;

    // Ícono semáforo con 3 luces reales
    var encendido = s.estado === 'funcionando';
    var ic = L.divIcon({
      className: '', iconSize: [20,28], iconAnchor: [10,28], popupAnchor: [0,-30],
      html: '<div style="position:relative;width:20px;height:28px;">' +
        '<div style="position:absolute;bottom:0;left:9px;width:2px;height:8px;background:#444;"></div>' +
        '<div style="position:absolute;top:0;left:2px;width:16px;height:20px;' +
          'background:#1a1a1a;border:2px solid ' + color + ';border-radius:4px;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:2px 0;' +
          'box-shadow:0 0 7px ' + color + '99;">' +
          '<div style="width:6px;height:6px;border-radius:50%;background:' + (encendido ? '#ff2200' : '#2a1111') + ';box-shadow:' + (encendido ? '0 0 4px #ff2200' : 'none') + ';"></div>' +
          '<div style="width:6px;height:6px;border-radius:50%;background:' + (encendido ? '#ffaa00' : '#2a1e00') + ';box-shadow:' + (encendido ? '0 0 4px #ffaa00' : 'none') + ';"></div>' +
          '<div style="width:6px;height:6px;border-radius:50%;background:' + (encendido ? '#00cc44' : '#001a0d') + ';box-shadow:' + (encendido ? '0 0 4px #00cc44' : 'none') + ';"></div>' +
        '</div>' +
      '</div>'
    });

    var mk = L.marker([s.lat, s.lng], { icon: ic });
    var nObs = (s.observaciones ? s.observaciones.length : 0);
    var predHtml = _movPredHtml(s);
    var ciclo = (s.t_verde && s.t_amarillo && s.t_rojo)
      ? (parseInt(s.t_verde||0) + parseInt(s.t_amarillo||0) + parseInt(s.t_rojo||0)) + 's ciclo'
      : 'Sin tiempos';

    mk.bindPopup(
      '<div style="font-family:monospace;font-size:11px;color:#e0e0e0;min-width:230px;max-width:290px;">' +
      // Título y estado
      '<div style="font-weight:700;color:' + color + ';font-size:12px;margin-bottom:4px;">\uD83D\uDEA6 ' + label + '</div>' +
      '<span style="background:' + color + '22;border:1px solid ' + color + '55;border-radius:3px;padding:2px 7px;font-size:9px;color:' + color + ';">' + (s.estado||'').toUpperCase() + '</span>' +
      // Tiempos
      '<div style="display:flex;gap:5px;margin:7px 0 3px;">' +
        _movBadgeT('V', s.t_verde,    '#00cc44') +
        _movBadgeT('A', s.t_amarillo, '#ffaa00') +
        _movBadgeT('R', s.t_rojo,     '#ff2200') +
      '</div>' +
      '<div style="color:#444;font-size:9px;margin-bottom:5px;">' + ciclo + ' \u00b7 ' + nObs + ' observaciones</div>' +
      predHtml +
      (s.notas    ? '<div style="color:#555;font-size:9px;border-top:1px solid #1a1a1a;padding-top:4px;margin-top:4px;">' + s.notas + '</div>' : '') +
      (s.foto_url ? '<div style="margin-top:4px;"><a href="' + s.foto_url + '" target="_blank" style="font-size:9px;color:#44aaff;">\uD83D\uDCF7 Foto</a></div>' : '') +
      // Botones
      '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;padding-top:6px;border-top:1px solid #1a1a1a;">' +
        '<button onclick="movilidadAgregarObservacion(\'' + sid + '\')" style="font-family:monospace;font-size:9px;padding:3px 8px;background:#0d1f0d;color:#00ff88;border:1px solid #00aa44;border-radius:3px;cursor:pointer;">\uD83D\uDC41 OBSERVAR</button>' +
        '<button onclick="movilidadAbrirPanelEditar(\'' + sid + '\')" style="font-family:monospace;font-size:9px;padding:3px 8px;background:#0d0d2a;color:#8888ff;border:1px solid #4444aa;border-radius:3px;cursor:pointer;">\u270F EDITAR</button>' +
        '<button onclick="movilidadConfirmarBorrar(\'' + sid + '\',\'' + label.replace(/'/g,'') + '\')" style="font-family:monospace;font-size:9px;padding:3px 8px;background:#2a0d0d;color:#ff4444;border:1px solid #aa2222;border-radius:3px;cursor:pointer;">\uD83D\uDDD1 BORRAR</button>' +
      '</div>' +
      '</div>', { maxWidth: 310 }
    );
    mk.addTo(grupo);
  });

  MOVILIDAD.capas.semManuales = grupo;
  grupo.addTo(MOVILIDAD.mapa);
  movilidadActualizarContador('manuales', MOVILIDAD.semManualesData.length);
}

function _movBadgeT(letra, val, color) {
  return '<div style="background:' + color + '22;border:1px solid ' + color + '55;border-radius:3px;padding:2px 7px;text-align:center;min-width:32px;">' +
    '<div style="color:' + color + ';font-size:10px;font-weight:700;">' + letra + '</div>' +
    '<div style="color:' + color + ';font-size:10px;">' + (val ? val+'s' : '?') + '</div>' +
    '</div>';
}

// Predicción de fase por hora basada en observaciones acumuladas
function _movPredHtml(s) {
  if (!s.observaciones || s.observaciones.length < 3) {
    return '<div style="color:#2a2a2a;font-size:8px;margin-bottom:4px;font-style:italic;">Necesita 3+ observaciones para predicci\u00f3n</div>';
  }
  var porHora = {};
  s.observaciones.forEach(function(obs) {
    if (!obs.hora_local || !obs.luz_observada) return;
    var h = parseInt(obs.hora_local.split(':')[0], 10);
    if (!porHora[h]) porHora[h] = { verde:0, amarillo:0, rojo:0, total:0 };
    porHora[h][obs.luz_observada] = (porHora[h][obs.luz_observada]||0) + 1;
    porHora[h].total++;
  });
  var horas = Object.keys(porHora).map(Number).sort(function(a,b){return a-b;});
  if (!horas.length) return '';

  var colLuz = { verde:'#00cc44', amarillo:'#ffaa00', rojo:'#ff2200' };
  var html = '<div style="border-top:1px solid #1a1a1a;padding-top:5px;margin-bottom:5px;">' +
    '<div style="color:#444;font-size:8px;margin-bottom:3px;letter-spacing:1px;">PATR\u00d3N POR HORA</div>';

  horas.forEach(function(h) {
    var d = porHora[h];
    var dom = 'verde';
    if ((d.amarillo||0) > (d[dom]||0)) dom = 'amarillo';
    if ((d.rojo||0)     > (d[dom]||0)) dom = 'rojo';
    var pct = d.total > 0 ? Math.round((d[dom]/d.total)*100) : 0;
    html += '<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;">' +
      '<span style="color:#333;font-size:8px;width:24px;text-align:right;">' + h + ':xx</span>' +
      '<div style="height:5px;width:' + Math.round(pct*0.7) + 'px;background:' + colLuz[dom] + ';border-radius:2px;"></div>' +
      '<span style="font-size:8px;color:' + colLuz[dom] + ';">' + dom + ' ' + pct + '%(' + d.total + 'obs)</span>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
// PANEL FLOTANTE — NUEVO / EDITAR SEMÁFORO
// ═══════════════════════════════════════════════════════════
function movilidadAbrirPanelNuevo(lat, lng) {
  MOVILIDAD.editandoId = null;
  _movMostrarPanel({ lat:lat, lng:lng, calle1:'', calle2:'', estado:'funcionando',
    t_verde:'', t_amarillo:'', t_rojo:'', foto_url:'', notas:'', grupo_sincronizacion:'' });
}
window.movilidadAbrirPanelNuevo = movilidadAbrirPanelNuevo;

function movilidadAbrirPanelEditar(id) {
  var s = null;
  MOVILIDAD.semManualesData.forEach(function(d) { if (d.id === id) s = d; });
  if (!s) return;
  MOVILIDAD.editandoId = id;
  if (MOVILIDAD.mapa) MOVILIDAD.mapa.closePopup();
  _movMostrarPanel(s);
}
window.movilidadAbrirPanelEditar = movilidadAbrirPanelEditar;

function _movMostrarPanel(datos) {
  var p = document.getElementById('mov-panel-sem');
  if (!p) return;
  _movSetVal('movp-lat',    datos.lat    || '');
  _movSetVal('movp-lng',    datos.lng    || '');
  _movSetVal('movp-calle1', datos.calle1 || '');
  _movSetVal('movp-calle2', datos.calle2 || '');
  _movSetVal('movp-estado', datos.estado || 'funcionando');
  _movSetVal('movp-verde',  datos.t_verde    || '');
  _movSetVal('movp-amarillo',datos.t_amarillo|| '');
  _movSetVal('movp-rojo',   datos.t_rojo     || '');
  _movSetVal('movp-foto',   datos.foto_url   || '');
  _movSetVal('movp-notas',  datos.notas      || '');
  _movSetVal('movp-grupo',  datos.grupo_sincronizacion || '');
  var tit = document.getElementById('movp-titulo');
  if (tit) tit.textContent = MOVILIDAD.editandoId ? '\u270F Editar Sem\u00e1foro' : '+ Nuevo Sem\u00e1foro';
  var btn = document.getElementById('movp-btn-guardar');
  if (btn) btn.disabled = false;
  p.style.display = 'flex';
}

function _movSetVal(id, val) {
  var el = document.getElementById(id);
  if (el) el.value = val;
}

function movilidadCerrarPanel() {
  var p = document.getElementById('mov-panel-sem');
  if (p) p.style.display = 'none';
  MOVILIDAD.editandoId = null;
}
window.movilidadCerrarPanel = movilidadCerrarPanel;

function movilidadGuardarSemaforo() {
  if (typeof db === 'undefined') { if (typeof toast==='function') toast('Firebase no disponible','err'); return; }
  var lat = parseFloat(document.getElementById('movp-lat').value);
  var lng = parseFloat(document.getElementById('movp-lng').value);
  if (isNaN(lat) || isNaN(lng)) { if (typeof toast==='function') toast('Coordenadas inv\u00e1lidas','err'); return; }

  var datos = {
    lat: lat, lng: lng,
    calle1:  document.getElementById('movp-calle1').value.trim(),
    calle2:  document.getElementById('movp-calle2').value.trim(),
    estado:  document.getElementById('movp-estado').value,
    t_verde:    parseInt(document.getElementById('movp-verde').value)     || null,
    t_amarillo: parseInt(document.getElementById('movp-amarillo').value)  || null,
    t_rojo:     parseInt(document.getElementById('movp-rojo').value)      || null,
    foto_url:   document.getElementById('movp-foto').value.trim(),
    notas:      document.getElementById('movp-notas').value.trim(),
    grupo_sincronizacion: document.getElementById('movp-grupo').value.trim(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  var btn = document.getElementById('movp-btn-guardar');
  if (btn) btn.disabled = true;

  if (MOVILIDAD.editandoId) {
    db.collection('semaforos-irapuato').doc(MOVILIDAD.editandoId).update(datos)
    .then(function() {
      if (typeof toast==='function') toast('Sem\u00e1foro actualizado','ok');
      movilidadCerrarPanel();
    }).catch(function(e) {
      if (typeof toast==='function') toast('Error: '+e.message,'err');
      if (btn) btn.disabled = false;
    });
  } else {
    datos.creado = firebase.firestore.FieldValue.serverTimestamp();
    datos.observaciones = [];
    db.collection('semaforos-irapuato').add(datos)
    .then(function() {
      if (typeof toast==='function') toast('Sem\u00e1foro guardado','ok');
      movilidadCerrarPanel();
    }).catch(function(e) {
      if (typeof toast==='function') toast('Error: '+e.message,'err');
      if (btn) btn.disabled = false;
    });
  }
}
window.movilidadGuardarSemaforo = movilidadGuardarSemaforo;

// ─── Confirmación de borrado ───
function movilidadConfirmarBorrar(id, label) {
  if (MOVILIDAD.mapa) MOVILIDAD.mapa.closePopup();
  var panel = document.getElementById('mov-panel-confirmar');
  if (!panel) { if (window.confirm('Borrar "' + label + '"?')) movilidadBorrarSemaforo(id); return; }
  document.getElementById('mov-confirmar-label').textContent = '\uD83D\uDDD1 Borrar "' + label + '"?';
  panel._idPendiente = id;
  panel.style.display = 'flex';
}
window.movilidadConfirmarBorrar = movilidadConfirmarBorrar;

function movilidadConfirmarBorrarOk() {
  var panel = document.getElementById('mov-panel-confirmar');
  if (!panel || !panel._idPendiente) return;
  movilidadBorrarSemaforo(panel._idPendiente);
  panel.style.display = 'none'; panel._idPendiente = null;
}
window.movilidadConfirmarBorrarOk = movilidadConfirmarBorrarOk;

function movilidadConfirmarBorrarCancelar() {
  var panel = document.getElementById('mov-panel-confirmar');
  if (panel) { panel.style.display = 'none'; panel._idPendiente = null; }
}
window.movilidadConfirmarBorrarCancelar = movilidadConfirmarBorrarCancelar;

function movilidadBorrarSemaforo(id) {
  if (typeof db === 'undefined') return;
  db.collection('semaforos-irapuato').doc(id).delete()
  .then(function() { if (typeof toast==='function') toast('Sem\u00e1foro eliminado','ok'); })
  .catch(function(e) { if (typeof toast==='function') toast('Error al borrar: '+e.message,'err'); });
}
window.movilidadBorrarSemaforo = movilidadBorrarSemaforo;

// ═══════════════════════════════════════════════════════════
// PANEL OBSERVACIONES DE CAMPO
// ═══════════════════════════════════════════════════════════
function movilidadAgregarObservacion(id) {
  if (MOVILIDAD.mapa) MOVILIDAD.mapa.closePopup();
  MOVILIDAD._obsId = id;
  var ahora = new Date();
  _movSetVal('movobs-hora', ('0'+ahora.getHours()).slice(-2) + ':' + ('0'+ahora.getMinutes()).slice(-2));
  _movSetVal('movobs-luz', 'verde');
  _movSetVal('movobs-notas', '');
  var panel = document.getElementById('mov-panel-obs');
  if (panel) panel.style.display = 'flex';
}
window.movilidadAgregarObservacion = movilidadAgregarObservacion;

function movilidadCerrarObs() {
  var panel = document.getElementById('mov-panel-obs');
  if (panel) panel.style.display = 'none';
  MOVILIDAD._obsId = null;
}
window.movilidadCerrarObs = movilidadCerrarObs;

function movilidadGuardarObservacion() {
  if (!MOVILIDAD._obsId || typeof db === 'undefined') return;
  var hora  = document.getElementById('movobs-hora').value.trim();
  var luz   = document.getElementById('movobs-luz').value;
  var notas = document.getElementById('movobs-notas').value.trim();
  if (!hora || !luz) { if (typeof toast==='function') toast('Hora y luz requeridos','warn'); return; }

  var obs = { ts: Date.now(), hora_local: hora, luz_observada: luz, notas: notas };
  var btn = document.getElementById('movobs-btn-guardar');
  if (btn) btn.disabled = true;

  db.collection('semaforos-irapuato').doc(MOVILIDAD._obsId).update({
    observaciones: firebase.firestore.FieldValue.arrayUnion(obs),
    actualizado:   firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    if (typeof toast==='function') toast('Observaci\u00f3n registrada','ok');
    movilidadCerrarObs();
    if (btn) btn.disabled = false;
  }).catch(function(e) {
    if (typeof toast==='function') toast('Error: '+e.message,'err');
    if (btn) btn.disabled = false;
  });
}
window.movilidadGuardarObservacion = movilidadGuardarObservacion;

// ═══════════════════════════════════════════════════════════
// MODO EDICIÓN
// ═══════════════════════════════════════════════════════════
function movilidadToggleEdicion() {
  MOVILIDAD.edicion = !MOVILIDAD.edicion;
  var btn = document.getElementById('mov-btn-editar');
  var cont = document.getElementById('movilidad-mapa');
  if (MOVILIDAD.edicion) {
    if (btn) { btn.textContent = '\u270F ON'; btn.classList.add('on'); }
    if (cont) cont.style.cursor = 'crosshair';
    _movMostrarSubModos(true);
    if (typeof toast==='function') toast('Modo edici\u00f3n activo — selecciona SEM o VIA','ok');
  } else {
    if (btn) { btn.textContent = '\u270F EDITAR'; btn.classList.remove('on'); }
    if (cont) cont.style.cursor = '';
    _movMostrarSubModos(false);
    movilidadCerrarPanel();
    _vialidadCancelarTrazado();
  }
}
window.movilidadToggleEdicion = movilidadToggleEdicion;

function movilidadSetModoEdicion(modo) {
  MOVILIDAD.modoEdicion = modo;
  var btnSem = document.getElementById('mov-subbtn-sem');
  var btnVia = document.getElementById('mov-subbtn-via');
  if (btnSem) btnSem.classList.toggle('on', modo === 'sem');
  if (btnVia) btnVia.classList.toggle('on', modo === 'via');
  var cont = document.getElementById('movilidad-mapa');
  if (cont) cont.style.cursor = 'crosshair';
  if (modo === 'via') {
    _vialidadIniciarTrazado();
    var hint = document.getElementById('mov-modo-hint');
    if (hint) hint.textContent = 'Click=punto  Doble-click=terminar  Ctrl+Z=deshacer';
    if (typeof toast==='function') toast('VIA: toca para agregar puntos','ok');
  } else {
    _vialidadCancelarTrazado();
    var hintEl = document.getElementById('mov-modo-hint');
    if (hintEl) hintEl.textContent = 'Toca el mapa para colocar semaforo';
    if (typeof toast==='function') toast('SEM: toca el mapa para colocar','ok');
  }
}
window.movilidadSetModoEdicion = movilidadSetModoEdicion;

function _movMostrarSubModos(visible) {
  var el = document.getElementById('mov-submodos');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ═══════════════════════════════════════════════════════════
// NODOS VIALES CRÍTICOS (corpus)
// ═══════════════════════════════════════════════════════════
function movilidadToggleNodos() {
  MOVILIDAD.toggles.nodos = !MOVILIDAD.toggles.nodos;
  movilidadActualizarBoton('mov-btn-nodos', MOVILIDAD.toggles.nodos);
  if (!MOVILIDAD.toggles.nodos) {
    if (MOVILIDAD.capas.nodos) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.nodos); MOVILIDAD.capas.nodos = null; }
    movilidadActualizarContador('nodos', null);
  } else { movilidadRenderNodos(); }
}
window.movilidadToggleNodos = movilidadToggleNodos;

function movilidadRenderNodos() {
  if (!MOVILIDAD.mapa) return;
  if (MOVILIDAD.capas.nodos) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.nodos); MOVILIDAD.capas.nodos = null; }
  if (typeof noticias === 'undefined' || !noticias.length) {
    if (typeof toast==='function') toast('Sin datos en corpus','warn'); return;
  }
  var conCoords = [];
  noticias.forEach(function(n) {
    if (n.lat && n.lng && Math.abs(n.lat-20.6795)>0.0001 &&
        (n.tipo==='seguridad'||n.tipo==='accidente'||n.tipo==='crimen_organizado'))
      conCoords.push(n);
  });
  if (conCoords.length < 3) { if (typeof toast==='function') toast('Pocas noticias con coords','warn'); return; }

  var clusters = [];
  conCoords.forEach(function(n) {
    var ok = false;
    clusters.forEach(function(cl) {
      if (ok) return;
      if (movilidadDistKm(n.lat,n.lng,cl.lat,cl.lng) <= 0.15) {
        cl.lat = (cl.lat*cl.items.length+n.lat)/(cl.items.length+1);
        cl.lng = (cl.lng*cl.items.length+n.lng)/(cl.items.length+1);
        cl.items.push(n); ok = true;
      }
    });
    if (!ok) clusters.push({ lat:n.lat, lng:n.lng, items:[n] });
  });

  var criticos = clusters.filter(function(cl){return cl.items.length>=2;});
  if (!criticos.length) { if (typeof toast==='function') toast('No hay nodos cr\u00edticos','warn'); return; }
  var maxN = 1;
  criticos.forEach(function(cl){if(cl.items.length>maxN)maxN=cl.items.length;});

  var grupo = L.layerGroup();
  criticos.forEach(function(cl) {
    var n = cl.items.length;
    var ratio = Math.min(1, n/maxN);
    var sz = Math.round(12+ratio*20);
    var color = 'rgb(255,' + Math.round(150*(1-ratio)) + ',0)';
    var ic = L.divIcon({
      className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2],
      html:'<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+color+';opacity:0.82;' +
           'border:2px solid '+color+';box-shadow:0 0 '+Math.round(sz*0.6)+'px '+color+'66;' +
           'display:flex;align-items:center;justify-content:center;' +
           'font-family:monospace;font-weight:700;font-size:'+Math.max(8,sz-10)+'px;color:#fff;">'+n+'</div>'
    });
    var mk = L.marker([cl.lat,cl.lng],{icon:ic});
    var tipos = {};
    cl.items.forEach(function(it){tipos[it.tipo]=(tipos[it.tipo]||0)+1;});
    mk.bindPopup(
      '<div style="font-family:monospace;font-size:11px;color:#e0e0e0;min-width:180px;">' +
      '<div style="font-weight:700;color:'+color+';font-size:13px;margin-bottom:5px;">\u26A0 NODO CR\u00cdTICO \u00b7 '+n+' incid.</div>' +
      '<div style="color:#777;font-size:9px;">'+Object.keys(tipos).map(function(k){return k+'('+tipos[k]+')';}).join(', ')+'</div>' +
      '</div>', {maxWidth:240}
    );
    mk.addTo(grupo);
  });

  MOVILIDAD.capas.nodos = grupo;
  grupo.addTo(MOVILIDAD.mapa);
  movilidadActualizarContador('nodos', criticos.length);
  if (typeof toast==='function') toast(criticos.length+' nodos cr\u00edticos','ok');
}
window.movilidadRenderNodos = movilidadRenderNodos;

// ═══════════════════════════════════════════════════════════
// HELPERS UI
// ═══════════════════════════════════════════════════════════
function movilidadActualizarBoton(id, activo) {
  var el = document.getElementById(id);
  if (!el) return;
  if (activo) el.classList.add('on'); else el.classList.remove('on');
}
function movilidadActualizarContador(capa, n) {
  var el = document.getElementById('mov-cnt-' + capa);
  if (el) el.textContent = (n === null || n === undefined) ? '' : n;
}
function movilidadSetStatus(msg) {
  var el = document.getElementById('mov-status');
  if (el) el.textContent = msg;
}
function movilidadBindBotones() {
  var b;
  b = document.getElementById('mov-btn-gov');       if(b) b.onclick = movilidadToggleGov;
  b = document.getElementById('mov-btn-semaforos'); if(b) b.onclick = movilidadToggleSemOSM;
  b = document.getElementById('mov-btn-manuales');  if(b) b.onclick = movilidadToggleSemManuales;
  b = document.getElementById('mov-btn-nodos');     if(b) b.onclick = movilidadToggleNodos;
  b = document.getElementById('mov-btn-vialidad');  if(b) b.onclick = movilidadToggleVialidad;
  b = document.getElementById('mov-btn-red-osm');   if(b) b.onclick = movilidadToggleRedOSM;
  b = document.getElementById('mov-btn-sat');    if(b) b.onclick = movilidadToggleSatelital;
  b = document.getElementById('mov-btn-oscuro'); if(b) b.onclick = movilidadToggleOscuro;
  b = document.getElementById('mov-btn-editar');    if(b) b.onclick = movilidadToggleEdicion;
  // Sub-modos: inicio en SEM por defecto
  movilidadToggleTipoSemaforo('vehicular');
}

// ═══════════════════════════════════════════════════════════
// GEOMETRÍA
// ═══════════════════════════════════════════════════════════
function movilidadDistKm(lat1,lng1,lat2,lng2) {
  var dLat = (lat2-lat1)*Math.PI/180;
  var dLng = (lng2-lng1)*Math.PI/180*Math.cos(lat1*Math.PI/180);
  return Math.sqrt(dLat*dLat+dLng*dLng)*111;
}

// ═══════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════
function movilidadRefrescarNodos() {
  if (MOVILIDAD.toggles.nodos && MOVILIDAD.mapa) movilidadRenderNodos();
}
window.movilidadRefrescarNodos = movilidadRefrescarNodos;

function movilidadOnShow() {
  // Igual que Intel: siempre llama init, que maneja si ya existe o no
  movilidadInit();
}
window.movilidadOnShow = movilidadOnShow;

// ═══════════════════════════════════════════════════════════
// MÓDULO VIALIDAD — Grafo vial dirigido
// Colección Firestore: 'vialidad-irapuato'
//
// Esquema:
// { id, nombre, puntos:[[lat,lng],...], sentido:'uno'|'dos',
//   carriles:1|2|3|4, vel_max:20|30|40|50|60|80,
//   notas, creado, actualizado }
// ═══════════════════════════════════════════════════════════

var VIA_SNAP_RADIO = 0.020; // km — ~20m para snap a nodo existente
var VIA_COLOR_VEL = { 20:'#00ff88', 30:'#00cc66', 40:'#ffcc00', 50:'#ffaa00', 60:'#ff6600', 80:'#ff2200' };

// ─── Cargar y renderizar vialidad ───
function movilidadCargarVialidad() {
  if (typeof db === 'undefined') return;
  db.collection('vialidad-irapuato')
    .orderBy('creado', 'desc')
    .onSnapshot(function(snap) {
      MOVILIDAD.vialidadData = [];
      snap.forEach(function(doc) {
        var d = doc.data(); d.id = doc.id;
        MOVILIDAD.vialidadData.push(d);
      });
      if (MOVILIDAD.toggles.vialidad) _vialidadRender();
      movilidadActualizarContador('vialidad', MOVILIDAD.vialidadData.length);
    });
}

function movilidadToggleVialidad() {
  MOVILIDAD.toggles.vialidad = !MOVILIDAD.toggles.vialidad;
  movilidadActualizarBoton('mov-btn-vialidad', MOVILIDAD.toggles.vialidad);
  if (!MOVILIDAD.toggles.vialidad) {
    if (MOVILIDAD.capas.vialidad) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.vialidad); MOVILIDAD.capas.vialidad = null; }
    movilidadActualizarContador('vialidad', null);
  } else {
    _vialidadRender();
  }
}
window.movilidadToggleVialidad = movilidadToggleVialidad;

function _vialidadRender() {
  if (!MOVILIDAD.mapa) return;
  if (MOVILIDAD.capas.vialidad) { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.vialidad); MOVILIDAD.capas.vialidad = null; }
  if (!MOVILIDAD.toggles.vialidad || !MOVILIDAD.vialidadData.length) return;

  var grupo = L.layerGroup();

  MOVILIDAD.vialidadData.forEach(function(seg) {
    if (!seg.puntos || seg.puntos.length < 2) return;
    var color = VIA_COLOR_VEL[seg.vel_max] || '#44aaff';
    var peso  = seg.carriles === 1 ? 2 : seg.carriles === 2 ? 3 : seg.carriles >= 3 ? 4 : 2;
    var sid   = seg.id;

    // Polyline principal
    var line = L.polyline(seg.puntos, {
      color: color, weight: peso + 1, opacity: 0.15
    }).addTo(grupo);
    var lineInner = L.polyline(seg.puntos, {
      color: color, weight: peso, opacity: 0.85
    }).addTo(grupo);

    // Flechas de dirección en el centro del segmento
    _vialidadAgregarFlechas(seg.puntos, color, seg.sentido, grupo);

    // Popup
    var sentidoStr = seg.sentido === 'dos' ? '&#8645; Doble sentido' : '&#8594; Un sentido';
    lineInner.bindPopup(
      '<div style="font-family:monospace;font-size:11px;color:#e0e0e0;min-width:180px;">' +
      '<div style="font-weight:700;color:' + color + ';font-size:12px;margin-bottom:4px;">' + (seg.nombre || 'Segmento vial') + '</div>' +
      '<div style="color:#888;font-size:9px;margin-bottom:2px;">' + sentidoStr + '</div>' +
      '<div style="color:#888;font-size:9px;margin-bottom:2px;">Carriles: ' + (seg.carriles || '?') + '</div>' +
      '<div style="color:' + color + ';font-size:9px;margin-bottom:6px;">Vel. max: ' + (seg.vel_max || '?') + ' km/h</div>' +
      (seg.notas ? '<div style="color:#555;font-size:9px;margin-bottom:6px;">' + seg.notas + '</div>' : '') +
      '<div style="display:flex;gap:5px;">' +
        '<button onclick="vialidadEditar(\'' + sid + '\')" style="font-family:monospace;font-size:9px;padding:3px 8px;background:#0d0d2a;color:#8888ff;border:1px solid #4444aa;border-radius:3px;cursor:pointer;">&#x270F; EDITAR</button>' +
        '<button onclick="vialidadConfirmarBorrar(\'' + sid + '\',\'' + (seg.nombre||'segmento').replace(/'/g,'') + '\')" style="font-family:monospace;font-size:9px;padding:3px 8px;background:#2a0d0d;color:#ff4444;border:1px solid #aa2222;border-radius:3px;cursor:pointer;">&#x1f5d1; BORRAR</button>' +
      '</div>' +
      '</div>', { maxWidth: 240 }
    );
  });

  MOVILIDAD.capas.vialidad = grupo;
  grupo.addTo(MOVILIDAD.mapa);
  movilidadActualizarContador('vialidad', MOVILIDAD.vialidadData.length);
}

function _vialidadAgregarFlechas(puntos, color, sentido, grupo) {
  // Calcular punto medio del segmento
  var total = puntos.length;
  var mid = Math.floor(total / 2);
  if (total < 2) return;

  var p1 = puntos[Math.max(0, mid-1)];
  var p2 = puntos[mid];

  var lat1 = p1[0], lng1 = p1[1];
  var lat2 = p2[0], lng2 = p2[1];
  var latM = (lat1 + lat2) / 2;
  var lngM = (lng1 + lng2) / 2;

  // Ángulo de la flecha en grados
  var ang = Math.atan2(lat2 - lat1, (lng2 - lng1) * Math.cos(lat1 * Math.PI / 180)) * 180 / Math.PI;

  function hacerFlecha(angulo) {
    var ic = L.divIcon({
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: '<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;' +
            'transform:rotate(' + (90 - angulo) + 'deg);font-size:12px;color:' + color + ';line-height:1;' +
            'text-shadow:0 0 3px #000;">&#x27A4;</div>'
    });
    L.marker([latM, lngM], { icon: ic, interactive: false }).addTo(grupo);
  }

  hacerFlecha(ang);
  if (sentido === 'dos') {
    hacerFlecha(ang + 180);
  }
}

// ─── Trazado interactivo ───
function _vialidadIniciarTrazado() {
  _vialidadCancelarTrazado();
  MOVILIDAD._viaPuntos     = [];
  MOVILIDAD._viaRedoPuntos = [];

  // Mostrar panel de control de trazado
  var panelTrazado = document.getElementById('mov-panel-trazado');
  if (panelTrazado) panelTrazado.style.display = 'block';
  _vialidadActualizarPanelTrazado();

  // Mostrar nodos existentes para snap visual
  _vialidadMostrarNodosSnap();

  // Handler de click para agregar puntos
  MOVILIDAD._viaClickHandler = function(e) {
    if (!MOVILIDAD.edicion || MOVILIDAD.modoEdicion !== 'via') return;
    var lat = e.latlng.lat;
    var lng = e.latlng.lng;

    // Snap: buscar nodo cercano
    var snap = _vialidadBuscarSnap(lat, lng);
    if (snap) { lat = snap[0]; lng = snap[1]; }

    MOVILIDAD._viaPuntos.push([lat, lng]);
    MOVILIDAD._viaRedoPuntos = []; // limpiar redo al agregar punto nuevo

    // Dibujar/actualizar polyline de preview
    if (MOVILIDAD._viaPolyline) {
      MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaPolyline);
    }
    MOVILIDAD._viaPolyline = L.polyline(MOVILIDAD._viaPuntos, {
      color: '#00ccff', weight: 3, dashArray: '6 4', opacity: 0.9
    }).addTo(MOVILIDAD.mapa);

    // Marker en el punto
    var ptIc = L.divIcon({
      className: '', iconSize: [8,8], iconAnchor: [4,4],
      html: '<div style="width:8px;height:8px;border-radius:50%;background:' + (snap ? '#00ff88' : '#00ccff') + ';border:1.5px solid #fff;box-shadow:0 0 4px #000;"></div>'
    });
    L.marker([lat, lng], { icon: ptIc, interactive: false }).addTo(MOVILIDAD._viaPolyline);

    movilidadSetStatus(MOVILIDAD._viaPuntos.length + ' pts \u2014 doble-click para terminar');
    _vialidadActualizarPanelTrazado();
  };

  MOVILIDAD.mapa.on('click', MOVILIDAD._viaClickHandler);
}

function _vialidadMostrarNodosSnap() {
  if (MOVILIDAD._viaNodosLayer) { MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaNodosLayer); }
  var grupo = L.layerGroup();

  // Recolectar todos los nodos únicos de segmentos existentes
  var nodos = {};
  MOVILIDAD.vialidadData.forEach(function(seg) {
    if (!seg.puntos) return;
    seg.puntos.forEach(function(p) {
      var k = p[0].toFixed(5) + ',' + p[1].toFixed(5);
      nodos[k] = p;
    });
  });

  Object.keys(nodos).forEach(function(k) {
    var p = nodos[k];
    var ic = L.divIcon({
      className: '', iconSize: [10,10], iconAnchor: [5,5],
      html: '<div style="width:8px;height:8px;border-radius:50%;background:#00ff8844;border:1.5px solid #00ff88;"></div>'
    });
    L.marker(p, { icon: ic, interactive: false }).addTo(grupo);
  });

  MOVILIDAD._viaNodosLayer = grupo;
  grupo.addTo(MOVILIDAD.mapa);
}

function _vialidadBuscarSnap(lat, lng) {
  var mejorDist = VIA_SNAP_RADIO;
  var mejorPunto = null;

  MOVILIDAD.vialidadData.forEach(function(seg) {
    if (!seg.puntos) return;
    seg.puntos.forEach(function(p) {
      var d = movilidadDistKm(lat, lng, p[0], p[1]);
      if (d < mejorDist) { mejorDist = d; mejorPunto = p; }
    });
  });

  return mejorPunto;
}

function _vialidadTerminarTrazado(e) {
  if (MOVILIDAD._viaPuntos.length < 2) {
    if (typeof toast === 'function') toast('Necesitas al menos 2 puntos', 'warn');
    return;
  }

  // Agregar último punto del dblclick
  var lat = e.latlng.lat;
  var lng = e.latlng.lng;
  var snap = _vialidadBuscarSnap(lat, lng);
  if (snap) { lat = snap[0]; lng = snap[1]; }
  MOVILIDAD._viaPuntos.push([lat, lng]);

  // Limpiar preview y abrir panel de atributos
  var pt = document.getElementById('mov-panel-trazado');
  if (pt) pt.style.display = 'none';
  if (MOVILIDAD._viaPolyline) {
    MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaPolyline);
    MOVILIDAD._viaPolyline = null;
  }
  if (MOVILIDAD._viaNodosLayer) {
    MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaNodosLayer);
    MOVILIDAD._viaNodosLayer = null;
  }
  if (MOVILIDAD._viaClickHandler) {
    MOVILIDAD.mapa.off('click', MOVILIDAD._viaClickHandler);
    MOVILIDAD._viaClickHandler = null;
  }
  movilidadSetStatus('');

  // Mostrar panel de atributos del segmento
  _vialidadAbrirPanel(null, MOVILIDAD._viaPuntos.slice());
  MOVILIDAD._viaPuntos     = [];
  MOVILIDAD._viaRedoPuntos = [];
}

function _vialidadCancelarTrazado() {
  if (MOVILIDAD._viaPolyline) { try { MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaPolyline); } catch(e) {} MOVILIDAD._viaPolyline = null; }
  if (MOVILIDAD._viaNodosLayer) { try { MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaNodosLayer); } catch(e) {} MOVILIDAD._viaNodosLayer = null; }
  if (MOVILIDAD._viaClickHandler) { try { MOVILIDAD.mapa.off('click', MOVILIDAD._viaClickHandler); } catch(e) {} MOVILIDAD._viaClickHandler = null; }
  MOVILIDAD._viaPuntos     = [];
  MOVILIDAD._viaRedoPuntos = [];
  movilidadSetStatus('');
  var pt = document.getElementById('mov-panel-trazado');
  if (pt) pt.style.display = 'none';
}

// ─── Panel de atributos del segmento ───
function _vialidadAbrirPanel(id, puntos) {
  MOVILIDAD._viaEditId = id;
  MOVILIDAD._viaEditPuntos = puntos || [];

  var datos = { nombre:'', sentido:'uno', carriles:2, vel_max:40, notas:'' };
  if (id) {
    MOVILIDAD.vialidadData.forEach(function(s){ if(s.id===id) datos=s; });
  }

  var p = document.getElementById('mov-panel-via');
  if (!p) return;

  var t = document.getElementById('movvia-titulo');
  if (t) t.textContent = id ? 'Editar segmento' : 'Nuevo segmento vial';

  _movSetVal('movvia-nombre',   datos.nombre  || '');
  _movSetVal('movvia-sentido',  datos.sentido || 'uno');
  _movSetVal('movvia-carriles', datos.carriles || 2);
  _movSetVal('movvia-vel',      datos.vel_max || 40);
  _movSetVal('movvia-notas',    datos.notas   || '');

  var cntPts = document.getElementById('movvia-cnt-pts');
  if (cntPts) cntPts.textContent = MOVILIDAD._viaEditPuntos.length + ' puntos';

  var btn = document.getElementById('movvia-btn-guardar');
  if (btn) btn.disabled = false;

  p.style.display = 'flex';
}

function movilidadCerrarPanelVia() {
  var p = document.getElementById('mov-panel-via');
  if (p) p.style.display = 'none';
  MOVILIDAD._viaEditId = null;
  MOVILIDAD._viaEditPuntos = [];
  // Reiniciar trazado si sigue en modo VIA
  if (MOVILIDAD.edicion && MOVILIDAD.modoEdicion === 'via') {
    _vialidadIniciarTrazado();
  }
}
window.movilidadCerrarPanelVia = movilidadCerrarPanelVia;

function vialidadGuardar() {
  if (typeof db === 'undefined') { if(typeof toast==='function') toast('Firebase no disponible','err'); return; }

  var puntos = MOVILIDAD._viaEditPuntos;
  if (!puntos || puntos.length < 2) {
    if (typeof toast==='function') toast('Segmento sin puntos v\u00e1lidos','err'); return;
  }

  var datos = {
    nombre:   document.getElementById('movvia-nombre').value.trim(),
    sentido:  document.getElementById('movvia-sentido').value,
    carriles: parseInt(document.getElementById('movvia-carriles').value) || 2,
    vel_max:  parseInt(document.getElementById('movvia-vel').value) || 40,
    notas:    document.getElementById('movvia-notas').value.trim(),
    puntos:   puntos,
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  var btn = document.getElementById('movvia-btn-guardar');
  if (btn) btn.disabled = true;

  if (MOVILIDAD._viaEditId) {
    db.collection('vialidad-irapuato').doc(MOVILIDAD._viaEditId).update(datos)
    .then(function() {
      if(typeof toast==='function') toast('Segmento actualizado','ok');
      movilidadCerrarPanelVia();
    }).catch(function(e) {
      if(typeof toast==='function') toast('Error: '+e.message,'err');
      if(btn) btn.disabled=false;
    });
  } else {
    datos.creado = firebase.firestore.FieldValue.serverTimestamp();
    db.collection('vialidad-irapuato').add(datos)
    .then(function() {
      if(typeof toast==='function') toast('Segmento guardado','ok');
      movilidadCerrarPanelVia();
    }).catch(function(e) {
      if(typeof toast==='function') toast('Error: '+e.message,'err');
      if(btn) btn.disabled=false;
    });
  }
}
window.vialidadGuardar = vialidadGuardar;

function vialidadEditar(id) {
  if (MOVILIDAD.mapa) MOVILIDAD.mapa.closePopup();
  var datos = null;
  MOVILIDAD.vialidadData.forEach(function(s){ if(s.id===id) datos=s; });
  if (!datos) return;
  _vialidadAbrirPanel(id, datos.puntos || []);
}
window.vialidadEditar = vialidadEditar;

function vialidadConfirmarBorrar(id, nombre) {
  if (MOVILIDAD.mapa) MOVILIDAD.mapa.closePopup();
  var panel = document.getElementById('mov-panel-confirmar');
  if (!panel) { if(window.confirm('Borrar "'+nombre+'"?')) _vialidadBorrar(id); return; }
  document.getElementById('mov-confirmar-label').textContent = 'Borrar segmento "' + nombre + '"?';
  panel._idPendiente = id;
  panel._tipoPendiente = 'via';
  panel.style.display = 'flex';
}
window.vialidadConfirmarBorrar = vialidadConfirmarBorrar;

// ─── Actualizar panel de trazado ───
function _vialidadActualizarPanelTrazado() {
  var n = MOVILIDAD._viaPuntos.length;
  var cnt = document.getElementById('trazado-cnt');
  if (cnt) cnt.textContent = n + (n === 1 ? ' punto' : ' puntos');

  // Undo habilitado si hay puntos
  var btnUndo = document.getElementById('trazado-btn-undo');
  if (btnUndo) {
    btnUndo.style.color   = n > 0 ? '#00ccff' : '#333';
    btnUndo.style.borderColor = n > 0 ? '#224444' : '#222';
    btnUndo.disabled = n === 0;
  }
  // Redo habilitado si hay puntos en pila redo
  var btnRedo = document.getElementById('trazado-btn-redo');
  var nr = MOVILIDAD._viaRedoPuntos.length;
  if (btnRedo) {
    btnRedo.style.color   = nr > 0 ? '#88aaff' : '#333';
    btnRedo.style.borderColor = nr > 0 ? '#223355' : '#222';
    btnRedo.disabled = nr === 0;
  }
}
window._vialidadActualizarPanelTrazado = _vialidadActualizarPanelTrazado;

// ─── Deshacer último punto ───
function vialidadUndo() {
  if (!MOVILIDAD._viaPuntos.length) return;
  var ultimo = MOVILIDAD._viaPuntos.pop();
  MOVILIDAD._viaRedoPuntos.push(ultimo);
  _vialidadRedibujarPreview();
  _vialidadActualizarPanelTrazado();
}
window.vialidadUndo = vialidadUndo;

// ─── Rehacer punto ───
function vialidadRedo() {
  if (!MOVILIDAD._viaRedoPuntos.length) return;
  var punto = MOVILIDAD._viaRedoPuntos.pop();
  MOVILIDAD._viaPuntos.push(punto);
  _vialidadRedibujarPreview();
  _vialidadActualizarPanelTrazado();
}
window.vialidadRedo = vialidadRedo;

// ─── Redibujar polyline de preview ───
function _vialidadRedibujarPreview() {
  if (MOVILIDAD._viaPolyline) {
    try { MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaPolyline); } catch(e) {}
    MOVILIDAD._viaPolyline = null;
  }
  if (MOVILIDAD._viaPuntos.length >= 1) {
    MOVILIDAD._viaPolyline = L.polyline(MOVILIDAD._viaPuntos, {
      color: '#00ccff', weight: 3, dashArray: '6 4', opacity: 0.9
    }).addTo(MOVILIDAD.mapa);
  }
  movilidadSetStatus(MOVILIDAD._viaPuntos.length + ' pts');
}

// ─── Terminar trazo desde botón ───
function vialidadTerminarDesdeBtn() {
  if (MOVILIDAD._viaPuntos.length < 2) {
    if (typeof toast === 'function') toast('Necesitas al menos 2 puntos', 'warn');
    return;
  }
  // Ocultar panel trazado y limpiar preview
  var pt = document.getElementById('mov-panel-trazado');
  if (pt) pt.style.display = 'none';
  if (MOVILIDAD._viaPolyline) {
    MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaPolyline);
    MOVILIDAD._viaPolyline = null;
  }
  if (MOVILIDAD._viaNodosLayer) {
    MOVILIDAD.mapa.removeLayer(MOVILIDAD._viaNodosLayer);
    MOVILIDAD._viaNodosLayer = null;
  }
  if (MOVILIDAD._viaClickHandler) {
    MOVILIDAD.mapa.off('click', MOVILIDAD._viaClickHandler);
    MOVILIDAD._viaClickHandler = null;
  }
  movilidadSetStatus('');
  _vialidadAbrirPanel(null, MOVILIDAD._viaPuntos.slice());
  MOVILIDAD._viaPuntos     = [];
  MOVILIDAD._viaRedoPuntos = [];
}
window.vialidadTerminarDesdeBtn = vialidadTerminarDesdeBtn;

// ─── Cancelar trazo desde botón ───
function vialidadCancelarDesdeBtn() {
  _vialidadCancelarTrazado();
  if (typeof toast === 'function') toast('Trazo cancelado', 'warn');
  // Reiniciar trazado para el próximo segmento
  if (MOVILIDAD.edicion && MOVILIDAD.modoEdicion === 'via') {
    setTimeout(_vialidadIniciarTrazado, 100);
  }
}
window.vialidadCancelarDesdeBtn = vialidadCancelarDesdeBtn;

// ─── Ctrl+Z y Ctrl+Y en escritorio ───
(function() {
  function _viaKeyHandler(e) {
    if (!MOVILIDAD.edicion || MOVILIDAD.modoEdicion !== 'via') return;
    var isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key === 'z') { e.preventDefault(); vialidadUndo(); }
    if (isCtrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); vialidadRedo(); }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', _viaKeyHandler);
  }
})();

function _vialidadBorrar(id) {
  if (typeof db === 'undefined') return;
  db.collection('vialidad-irapuato').doc(id).delete()
  .then(function(){ if(typeof toast==='function') toast('Segmento eliminado','ok'); })
  .catch(function(e){ if(typeof toast==='function') toast('Error: '+e.message,'err'); });
}

// ─── Patch: confirmarBorrarOk ahora maneja vialidad también ───
var _origConfirmarBorrarOk = window.movilidadConfirmarBorrarOk;
window.movilidadConfirmarBorrarOk = function() {
  var panel = document.getElementById('mov-panel-confirmar');
  if (!panel || !panel._idPendiente) return;
  if (panel._tipoPendiente === 'via') {
    _vialidadBorrar(panel._idPendiente);
  } else {
    movilidadBorrarSemaforo(panel._idPendiente);
  }
  panel.style.display = 'none';
  panel._idPendiente = null;
  panel._tipoPendiente = null;
};

// ═══════════════════════════════════════════════════════════
// SEMÁFORO PEATONAL — extiende el panel de semáforos
// tipo: 'peatonal' | 'vehicular' (default vehicular)
// ═══════════════════════════════════════════════════════════
function movilidadToggleTipoSemaforo(tipo) {
  var contV = document.getElementById('movp-campos-vehicular');
  var contP = document.getElementById('movp-campos-peatonal');
  var btnV  = document.getElementById('movp-tipo-v');
  var btnP  = document.getElementById('movp-tipo-p');

  if (contV) contV.style.display = tipo === 'vehicular' ? 'flex' : 'none';
  if (contP) contP.style.display = tipo === 'peatonal'  ? 'flex' : 'none';
  if (btnV)  { btnV.classList.toggle('on', tipo === 'vehicular'); }
  if (btnP)  { btnP.classList.toggle('on', tipo === 'peatonal'); }

  var inp = document.getElementById('movp-tipo-val');
  if (inp) inp.value = tipo;
}
window.movilidadToggleTipoSemaforo = movilidadToggleTipoSemaforo;

// Patch guardarSemaforo para incluir tipo y campos peatonales
var _origGuardarSemaforo = window.movilidadGuardarSemaforo;
window.movilidadGuardarSemaforo = function() {
  if (typeof db === 'undefined') { if(typeof toast==='function') toast('Firebase no disponible','err'); return; }
  var lat = parseFloat(document.getElementById('movp-lat').value);
  var lng = parseFloat(document.getElementById('movp-lng').value);
  if (isNaN(lat)||isNaN(lng)) { if(typeof toast==='function') toast('Coords inv\u00e1lidas','err'); return; }

  var tipo = (document.getElementById('movp-tipo-val') || {}).value || 'vehicular';

  var datos = {
    lat: lat, lng: lng, tipo: tipo,
    calle1:  document.getElementById('movp-calle1').value.trim(),
    calle2:  document.getElementById('movp-calle2').value.trim(),
    estado:  document.getElementById('movp-estado').value,
    foto_url: document.getElementById('movp-foto').value.trim(),
    notas:   document.getElementById('movp-notas').value.trim(),
    grupo_sincronizacion: document.getElementById('movp-grupo').value.trim(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (tipo === 'vehicular') {
    datos.t_verde    = parseInt(document.getElementById('movp-verde').value)    || null;
    datos.t_amarillo = parseInt(document.getElementById('movp-amarillo').value) || null;
    datos.t_rojo     = parseInt(document.getElementById('movp-rojo').value)     || null;
  } else {
    datos.t_paso  = parseInt(document.getElementById('movp-paso').value)  || null;
    datos.t_pausa = parseInt(document.getElementById('movp-pausa').value) || null;
    datos.t_verde = datos.t_amarillo = datos.t_rojo = null;
  }

  var btn = document.getElementById('movp-btn-guardar');
  if (btn) btn.disabled = true;

  if (MOVILIDAD.editandoId) {
    db.collection('semaforos-irapuato').doc(MOVILIDAD.editandoId).update(datos)
    .then(function(){ if(typeof toast==='function') toast('Sem\u00e1foro actualizado','ok'); movilidadCerrarPanel(); })
    .catch(function(e){ if(typeof toast==='function') toast('Error: '+e.message,'err'); if(btn) btn.disabled=false; });
  } else {
    datos.creado = firebase.firestore.FieldValue.serverTimestamp();
    datos.observaciones = [];
    db.collection('semaforos-irapuato').add(datos)
    .then(function(){ if(typeof toast==='function') toast('Sem\u00e1foro guardado','ok'); movilidadCerrarPanel(); })
    .catch(function(e){ if(typeof toast==='function') toast('Error: '+e.message,'err'); if(btn) btn.disabled=false; });
  }
};

// Cargar vialidad al init (llamado desde movilidadInit setTimeout)
function _movilidadCargarVialidadInit() {
  movilidadCargarVialidad();
}
window._movilidadCargarVialidadInit = _movilidadCargarVialidadInit;

// ═══════════════════════════════════════════════════════════
// RED VIAL OSM — Carga desde Overpass API
//
// Capa de solo lectura. Complementa (NO reemplaza) el grafo
// manual de 'vialidad-irapuato'. Sirve como referencia visual
// y base para el futuro snap a calles reales.
//
// Clasificación visual por tipo de vía:
//   motorway / trunk          → rojo        #ff2200  peso 5
//   primary                   → naranja     #ff8800  peso 4
//   secondary                 → amarillo    #ffcc00  peso 3
//   tertiary                  → verde-azul  #44ccaa  peso 2
//   residential / living_street / unclassified → gris-azul #4488aa peso 1.5
//   service / track / path    → gris        #336655  peso 1  (solo si zoom >= 15)
//
// Cache: localStorage 'mov_red_osm_v1' con TTL 30 días.
// ═══════════════════════════════════════════════════════════

var MOV_RED_OSM_CACHE_KEY = 'mov_red_osm_v1';

// Paleta de colores y pesos por tipo de highway
var MOV_RED_OSM_ESTILOS = {
  motorway:        { color: '#ff2200', peso: 5,   opacidad: 0.90 },
  trunk:           { color: '#ff2200', peso: 5,   opacidad: 0.90 },
  primary:         { color: '#ff8800', peso: 4,   opacidad: 0.85 },
  secondary:       { color: '#ffcc00', peso: 3,   opacidad: 0.80 },
  tertiary:        { color: '#44ccaa', peso: 2,   opacidad: 0.75 },
  residential:     { color: '#4488aa', peso: 1.5, opacidad: 0.65 },
  living_street:   { color: '#4488aa', peso: 1.5, opacidad: 0.65 },
  unclassified:    { color: '#4488aa', peso: 1.5, opacidad: 0.65 },
  service:         { color: '#336655', peso: 1,   opacidad: 0.50 },
  track:           { color: '#336655', peso: 1,   opacidad: 0.50 },
  path:            { color: '#336655', peso: 1,   opacidad: 0.50 },
  _default:        { color: '#334455', peso: 1,   opacidad: 0.45 }
};

// Tipos que solo se muestran en zoom >= 15 para no saturar
var MOV_RED_OSM_ZOOM_ALTO = { service: true, track: true, path: true };

// ─── Toggle ───
function movilidadToggleRedOSM() {
  MOVILIDAD.toggles.redOSM = !MOVILIDAD.toggles.redOSM;
  movilidadActualizarBoton('mov-btn-red-osm', MOVILIDAD.toggles.redOSM);
  if (!MOVILIDAD.toggles.redOSM) {
    _redOSMLimpiarCapa();
    movilidadActualizarContador('red-osm', null);
    return;
  }
  // Intentar desde cache primero
  if (_redOSMCacheVigente()) {
    _redOSMRender(MOVILIDAD.cache.redOSM);
  } else {
    _redOSMFetch();
  }
}
window.movilidadToggleRedOSM = movilidadToggleRedOSM;

// ─── Cache localStorage ───
function _redOSMCargarCache() {
  try {
    var raw = localStorage.getItem(MOV_RED_OSM_CACHE_KEY);
    if (!raw) return;
    var obj = JSON.parse(raw);
    if (obj && obj.ts && obj.data) {
      MOVILIDAD.cache.redOSM    = obj.data;
      MOVILIDAD.cache.redOSM_ts = obj.ts;
    }
  } catch(e) {}
}

function _redOSMGuardarCache(elementos) {
  try {
    var payload = JSON.stringify({ ts: Date.now(), data: elementos });
    localStorage.setItem(MOV_RED_OSM_CACHE_KEY, payload);
    MOVILIDAD.cache.redOSM    = elementos;
    MOVILIDAD.cache.redOSM_ts = Date.now();
  } catch(e) {
    // localStorage lleno — guardar solo en memoria
    MOVILIDAD.cache.redOSM    = elementos;
    MOVILIDAD.cache.redOSM_ts = Date.now();
    console.log('movilidad: localStorage lleno, cache redOSM solo en memoria');
  }
}

function _redOSMCacheVigente() {
  return MOVILIDAD.cache.redOSM &&
         MOVILIDAD.cache.redOSM.length > 0 &&
         (Date.now() - MOVILIDAD.cache.redOSM_ts) < MOVILIDAD.cache.redOSM_TTL;
}

// ─── Fetch Overpass ───
// Query: ways con tag highway dentro del bbox de Irapuato.
// Usamos [out:json][timeout:60] porque la red vial es grande.
// Se pide 'out body geom' para obtener geometría inline (sin second pass).
function _redOSMFetch() {
  if (MOVILIDAD.cargando.redOSM) return;
  MOVILIDAD.cargando.redOSM = true;
  movilidadSetStatus('Cargando red vial OSM...');

  var btn = document.getElementById('mov-btn-red-osm');
  if (btn) btn.textContent = '🛣 RED...';

  // Query Overpass: ways highway en el bbox
  // Excluimos footway/cycleway/steps para no saturar
  var query = '[out:json][timeout:60];' +
    'way["highway"]["highway"!~"^(footway|cycleway|steps|pedestrian|corridor|elevator|escalator|proposed|construction|abandoned|disused)$"]' +
    '(' + MOV_BBOX + ');' +
    'out body geom;';

  var url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.timeout = 65000;

  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    MOVILIDAD.cargando.redOSM = false;

    if (xhr.status === 200) {
      try {
        var respuesta = JSON.parse(xhr.responseText);
        var elementos = respuesta.elements || [];
        _redOSMGuardarCache(elementos);
        _redOSMRender(elementos);
        movilidadSetStatus('');
      } catch(e) {
        movilidadSetStatus('Error al parsear red OSM');
        if (typeof toast === 'function') toast('Error al parsear la red vial', 'err');
        if (btn) btn.textContent = '🛣 RED OSM';
      }
    } else if (xhr.status === 429) {
      movilidadSetStatus('Overpass ocupada — espera 1 min');
      if (typeof toast === 'function') toast('Overpass ocupada, intenta en 1 min', 'warn');
      MOVILIDAD.toggles.redOSM = false;
      movilidadActualizarBoton('mov-btn-red-osm', false);
      if (btn) btn.textContent = '🛣 RED OSM';
    } else {
      movilidadSetStatus('Error Overpass (' + xhr.status + ')');
      if (typeof toast === 'function') toast('Error cargando red vial (' + xhr.status + ')', 'err');
      MOVILIDAD.toggles.redOSM = false;
      movilidadActualizarBoton('mov-btn-red-osm', false);
      if (btn) btn.textContent = '🛣 RED OSM';
    }
  };

  xhr.ontimeout = function() {
    MOVILIDAD.cargando.redOSM = false;
    movilidadSetStatus('Timeout red OSM');
    if (typeof toast === 'function') toast('Timeout al cargar red vial', 'warn');
    MOVILIDAD.toggles.redOSM = false;
    movilidadActualizarBoton('mov-btn-red-osm', false);
    var btn2 = document.getElementById('mov-btn-red-osm');
    if (btn2) btn2.textContent = '🛣 RED OSM';
  };

  xhr.send();
}

// ─── Render ───
// Cada elemento de Overpass con 'geometry' es un array de {lat,lon}.
// Se construye un L.polyline por segmento.
// El zoom listener filtra vías de servicio en zoom bajo.
function _redOSMRender(elementos) {
  if (!MOVILIDAD.mapa) return;
  _redOSMLimpiarCapa();
  if (!MOVILIDAD.toggles.redOSM || !elementos || !elementos.length) return;

  var zoomActual = MOVILIDAD.mapa.getZoom();
  var grupo = L.layerGroup();
  var conteo = { total: 0, omitidos: 0 };

  elementos.forEach(function(elem) {
    if (elem.type !== 'way' || !elem.geometry || elem.geometry.length < 2) return;
    var tags    = elem.tags || {};
    var highway = tags.highway || '';
    var estilo  = MOV_RED_OSM_ESTILOS[highway] || MOV_RED_OSM_ESTILOS['_default'];

    // Filtrar vías de servicio/sendero en zoom bajo
    if (MOV_RED_OSM_ZOOM_ALTO[highway] && zoomActual < 15) {
      conteo.omitidos++;
      return;
    }

    // Construir array de coords Leaflet desde geometry Overpass
    var coords = [];
    for (var i = 0; i < elem.geometry.length; i++) {
      var pt = elem.geometry[i];
      if (pt && pt.lat !== undefined && pt.lon !== undefined) {
        coords.push([pt.lat, pt.lon]);
      }
    }
    if (coords.length < 2) return;

    // Nombre de la vía para popup
    var nombre = tags.name || tags['name:es'] || '';
    var maxVel = tags.maxspeed ? tags.maxspeed + ' km/h' : '';
    var sentido = tags.oneway === 'yes' ? 'Un sentido' :
                  tags.oneway === '-1'  ? 'Un sentido (inverso)' : 'Doble sentido';

    // Polyline con glow sutil (doble capa: halo + línea)
    var halo = L.polyline(coords, {
      color: estilo.color,
      weight: estilo.peso + 2,
      opacity: estilo.opacidad * 0.15,
      interactive: false
    }).addTo(grupo);

    var linea = L.polyline(coords, {
      color: estilo.color,
      weight: estilo.peso,
      opacity: estilo.opacidad
    }).addTo(grupo);

    // Popup informativo — compatible con el sistema de segmentos manuales
    linea.bindPopup(
      '<div style="font-family:monospace;font-size:11px;color:#e0e0e0;min-width:180px;max-width:260px;">' +
      '<div style="font-weight:700;color:' + estilo.color + ';font-size:12px;margin-bottom:4px;">' +
        (nombre ? nombre : '\u2014') +
      '</div>' +
      '<div style="color:#888;font-size:9px;margin-bottom:2px;">tipo: <span style="color:' + estilo.color + ';">' + highway + '</span></div>' +
      (sentido ? '<div style="color:#777;font-size:9px;margin-bottom:2px;">' + sentido + '</div>' : '') +
      (maxVel  ? '<div style="color:#777;font-size:9px;margin-bottom:2px;">vel. m\u00e1x: ' + maxVel + '</div>' : '') +
      '<div style="color:#333;font-size:8px;margin-top:6px;font-style:italic;border-top:1px solid #1a1a1a;padding-top:4px;">' +
        'OSM id: ' + elem.id + ' \u2014 solo lectura' +
      '</div>' +
      '<div style="color:#2a2a2a;font-size:8px;margin-top:3px;font-style:italic;">' +
        'Activa \u270F EDITAR &gt; VIA para trazar segmentos propios sobre esta base' +
      '</div>' +
      '</div>',
      { maxWidth: 280 }
    );

    conteo.total++;
  });

  // La capa OSM va DEBAJO de vialidad manual — se agrega antes
  // Para lograr esto, insertamos en el mapa antes de re-renderizar vialidad
  MOVILIDAD.capas.redOSM = grupo;
  grupo.addTo(MOVILIDAD.mapa);

  // Si hay segmentos manuales activos, re-renderizarlos encima
  if (MOVILIDAD.toggles.vialidad && MOVILIDAD.vialidadData.length) {
    _vialidadRender();
  }

  movilidadActualizarContador('red-osm', conteo.total);

  var btn = document.getElementById('mov-btn-red-osm');
  if (btn) btn.textContent = '🛣 RED OSM';

  if (typeof toast === 'function') {
    toast(conteo.total + ' tramos OSM cargados', 'ok');
  }

  // Listener de zoom para filtrar vías de servicio dinámicamente
  _redOSMBindZoomListener();
}

// ─── Limpiar capa OSM del mapa ───
function _redOSMLimpiarCapa() {
  if (MOVILIDAD.capas.redOSM && MOVILIDAD.mapa) {
    try { MOVILIDAD.mapa.removeLayer(MOVILIDAD.capas.redOSM); } catch(e) {}
    MOVILIDAD.capas.redOSM = null;
  }
  _redOSMUnbindZoomListener();
}

// ─── Zoom listener: re-render al cambiar zoom para mostrar/ocultar vías de servicio ───
var _redOSM_zoomHandler = null;

function _redOSMBindZoomListener() {
  _redOSMUnbindZoomListener();
  _redOSM_zoomHandler = function() {
    if (!MOVILIDAD.toggles.redOSM || !MOVILIDAD.cache.redOSM) return;
    _redOSMRender(MOVILIDAD.cache.redOSM);
  };
  if (MOVILIDAD.mapa) {
    MOVILIDAD.mapa.on('zoomend', _redOSM_zoomHandler);
  }
}

function _redOSMUnbindZoomListener() {
  if (_redOSM_zoomHandler && MOVILIDAD.mapa) {
    try { MOVILIDAD.mapa.off('zoomend', _redOSM_zoomHandler); } catch(e) {}
    _redOSM_zoomHandler = null;
  }
}

// ─── Invalidar cache (para forzar recarga manual) ───
function movilidadInvalidarRedOSM() {
  try { localStorage.removeItem(MOV_RED_OSM_CACHE_KEY); } catch(e) {}
  MOVILIDAD.cache.redOSM    = null;
  MOVILIDAD.cache.redOSM_ts = 0;
  _redOSMLimpiarCapa();
  movilidadActualizarContador('red-osm', null);
  if (MOVILIDAD.toggles.redOSM) {
    _redOSMFetch();
  } else {
    if (typeof toast === 'function') toast('Cache red OSM eliminado', 'ok');
  }
}
window.movilidadInvalidarRedOSM = movilidadInvalidarRedOSM;

// ─── Cargar cache al arrancar (igual que semOSM) ───
(function() {
  _redOSMCargarCache();
}());
