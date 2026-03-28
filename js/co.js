// ═══════════════════════════════════════════════════════════════
// CO.JS — Módulo Crimen Organizado
// Colecciones Firestore: co-actores, co-eventos, co-territorios
// Versión: Sprint CO-1
// ═══════════════════════════════════════════════════════════════

// ── Estado del módulo ──────────────────────────────────────────
var CO = {
  iniciado:     false,
  actores:      [],      // cache local co-actores
  eventos:      [],      // cache local co-eventos
  territorios:  [],      // cache local co-territorios
  filtroMapa:   'todos',
  filtroActores:'todos',
  filtroEventos:'todos',
  busquedaActores: '',
  eventosLayer: null,    // Leaflet layer marcadores eventos
  choroLayer:   null,    // Leaflet layer choropleth territorial
  editId:       null     // ID del documento en edición
};

var coMapaObj      = null;
var coMapaIniciado = false;

// ── Colores por grupo ──────────────────────────────────────────
var CO_COLORES = {
  cjng:      '#ff3333',
  csrl:      '#ff8800',
  cds:       '#aa44ff',
  cdg:       '#44aaff',
  union_leon:'#ff44aa',
  disputado: '#ffcc00',
  otro:      '#556677',
  sin_datos: '#1a2030'
};

// ─────────────────────────────────────────────────────────────
// 1. INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────
function coInit() {
  if (CO.iniciado) {
    // Ya iniciado: sólo re-ajustar altura del mapa
    if (coMapaObj) {
      setTimeout(function() { coMapaObj.invalidateSize(); }, 100);
    }
    return;
  }
  CO.iniciado = true;
  coVerSubtab('mapa');
  coCargarDatos();
}
window.coInit = coInit;

// Cargar las 3 colecciones desde Firestore
function coCargarDatos() {
  if (!db) {
    setTimeout(coCargarDatos, 800);
    return;
  }

  // Actores
  db.collection('co-actores').orderBy('cartel').onSnapshot(function(snap) {
    CO.actores = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      CO.actores.push(d);
    });
    _coRenderActores();
  }, function(e) {
    console.warn('[CO] actores:', e.message);
  });

  // Eventos
  db.collection('co-eventos').orderBy('ts', 'desc').onSnapshot(function(snap) {
    CO.eventos = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      CO.eventos.push(d);
    });
    _coRenderEventos();
    _coActualizarEventosLayer();
  }, function(e) {
    console.warn('[CO] eventos:', e.message);
  });

  // Territorios
  db.collection('co-territorios').onSnapshot(function(snap) {
    CO.territorios = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      CO.territorios.push(d);
    });
    _coRenderChoroTerritorial();
  }, function(e) {
    console.warn('[CO] territorios:', e.message);
  });
}

// ─────────────────────────────────────────────────────────────
// 2. SUB-TABS
// ─────────────────────────────────────────────────────────────
function coVerSubtab(cual) {
  var subs = ['mapa', 'actores', 'eventos', 'red'];
  for (var i = 0; i < subs.length; i++) {
    var s = subs[i];
    var el  = document.getElementById('co-sec-' + s);
    var btn = document.getElementById('co-stab-' + s);
    if (el)  { el.style.display = (s === cual) ? 'flex' : 'none'; }
    if (btn) { btn.classList.toggle('activo', s === cual); }
  }
  if (cual === 'mapa') {
    setTimeout(function() {
      _coIniciarMapa();
    }, 150);
  }
  if (cual === 'red') {
    setTimeout(coRenderRed, 200);
  }
}
window.coVerSubtab = coVerSubtab;

// ─────────────────────────────────────────────────────────────
// 3. MAPA TERRITORIAL
// ─────────────────────────────────────────────────────────────
function _coIniciarMapa() {
  if (coMapaIniciado && coMapaObj) {
    coMapaObj.invalidateSize();
    return;
  }
  var el = document.getElementById('co-leaflet');
  if (!el) return;

  coMapaObj = L.map('co-leaflet', {
    center: [20.6795, -101.3540],
    zoom: 12,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(coMapaObj);

  coMapaIniciado = true;

  // Renderizar choropleth si ya hay datos
  if (GEO && GEO.geojson) {
    _coRenderChoroTerritorial();
  }
  // Renderizar eventos si ya hay datos
  if (CO.eventos.length > 0) {
    _coActualizarEventosLayer();
  }
}

// Choropleth territorial sobre AGEBs
function _coRenderChoroTerritorial() {
  if (!coMapaObj) return;
  if (!GEO || !GEO.geojson) return;

  // Remover capa previa
  if (CO.choroLayer) { coMapaObj.removeLayer(CO.choroLayer); CO.choroLayer = null; }

  // Construir índice: ageb_clave → control
  var idx = {};
  for (var i = 0; i < CO.territorios.length; i++) {
    var t = CO.territorios[i];
    if (t.ageb_clave) {
      idx[t.ageb_clave] = t.disputado ? 'disputado' : (t.controlado_por || 'otro');
    }
  }

  // Contadores
  var cnt = { cjng: 0, csrl: 0, disputado: 0, otros: 0 };

  CO.choroLayer = L.geoJSON(GEO.geojson, {
    style: function(feature) {
      var clave = feature.properties && (feature.properties.CVEGEO || feature.properties.clave_ageb || '');
      var control = idx[clave] || 'sin_datos';

      // Aplicar filtro
      var visible = (CO.filtroMapa === 'todos') ||
                    (CO.filtroMapa === 'cjng'      && control === 'cjng') ||
                    (CO.filtroMapa === 'csrl'      && control === 'csrl') ||
                    (CO.filtroMapa === 'disputado' && control === 'disputado') ||
                    (CO.filtroMapa === 'otros'     && (control !== 'cjng' && control !== 'csrl' && control !== 'disputado' && control !== 'sin_datos'));

      if (control === 'cjng')      cnt.cjng++;
      else if (control === 'csrl') cnt.csrl++;
      else if (control === 'disputado') cnt.disputado++;

      return {
        fillColor: visible ? (CO_COLORES[control] || CO_COLORES.sin_datos) : CO_COLORES.sin_datos,
        fillOpacity: visible ? (control === 'sin_datos' ? 0.08 : 0.35) : 0.04,
        color: '#0a1020',
        weight: 0.5
      };
    },
    onEachFeature: function(feature, layer) {
      var clave = feature.properties && (feature.properties.CVEGEO || feature.properties.clave_ageb || '');
      var tData = null;
      for (var i = 0; i < CO.territorios.length; i++) {
        if (CO.territorios[i].ageb_clave === clave) { tData = CO.territorios[i]; break; }
      }
      layer.on('click', function() {
        _coMostrarAgebPanel(clave, tData);
      });
    }
  }).addTo(coMapaObj);

  // Actualizar contadores UI
  var el_cjng = document.getElementById('co-cnt-cjng');
  var el_csrl = document.getElementById('co-cnt-csrl');
  var el_disp = document.getElementById('co-cnt-disp');
  var el_tot  = document.getElementById('co-cnt-total');
  if (el_cjng) el_cjng.textContent = cnt.cjng;
  if (el_csrl) el_csrl.textContent = cnt.csrl;
  if (el_disp) el_disp.textContent = cnt.disputado;
  if (el_tot)  el_tot.textContent  = CO.territorios.length + ' AGEBs con datos';

  var lbl = document.getElementById('co-mapa-label');
  if (lbl) lbl.textContent = CO.territorios.length + ' territorios · ' + CO.actores.length + ' actores · ' + CO.eventos.length + ' eventos';
}

// Panel info AGEB al hacer click
function _coMostrarAgebPanel(clave, tData) {
  var panel = document.getElementById('co-ageb-panel');
  var titulo = document.getElementById('co-ageb-titulo');
  var info   = document.getElementById('co-ageb-info');
  if (!panel) return;

  if (titulo) titulo.textContent = 'AGEB ' + clave;
  var html = '';
  if (tData) {
    var ctrl = tData.disputado ? 'DISPUTADO' : (tData.controlado_por || '—').toUpperCase();
    var color = CO_COLORES[tData.controlado_por] || '#888';
    html += '<div style="color:' + color + ';font-family:var(--title);font-size:8px;margin-bottom:4px;">' + ctrl + '</div>';
    if (tData.colonia) html += '<div>Colonia: ' + tData.colonia + '</div>';
    if (tData.inicio_control) html += '<div>Desde: ' + tData.inicio_control + '</div>';
    if (tData.notas) html += '<div style="margin-top:4px;">' + tData.notas + '</div>';
    html += '<div style="margin-top:4px;font-size:5.5px;color:#3a5a7a;">Confianza: ' + (tData.confianza || '—') + '</div>';
  } else {
    html = '<div style="color:#3a5a7a;">Sin datos de control territorial registrados.</div>';
    html += '<button onclick="coNuevoTerritorio(\'' + clave + '\')" style="margin-top:8px;width:100%;padding:4px;font-family:var(--title);font-size:6px;background:rgba(255,68,68,.1);color:#ff4444;border:1px solid #ff444444;border-radius:2px;cursor:pointer;">+ REGISTRAR CONTROL</button>';
  }
  if (info) info.innerHTML = html;
  panel.style.display = 'block';
}

// Filtrar mapa por grupo
function coFiltrarMapa(cual, btn) {
  CO.filtroMapa = cual;
  var btns = document.querySelectorAll('.co-filtro-btn[id^="co-f-"]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  _coRenderChoroTerritorial();
}
window.coFiltrarMapa = coFiltrarMapa;

// Toggle capa de eventos sobre el mapa
function coToggleEventosLayer(btn) {
  if (CO.eventosLayer && coMapaObj.hasLayer(CO.eventosLayer)) {
    coMapaObj.removeLayer(CO.eventosLayer);
    if (btn) { btn.classList.remove('activo'); btn.style.color = ''; }
  } else {
    _coActualizarEventosLayer();
    if (btn) { btn.classList.add('activo'); btn.style.color = '#ff4444'; }
  }
}
window.coToggleEventosLayer = coToggleEventosLayer;

// Iconos por tipo de evento
var CO_ICONOS_EVENTO = {
  masacre:         '💀',
  ejecucion:       '🔴',
  detencion:       '🔵',
  narcofosa:       '⚫',
  narcomanta:      '📋',
  casa_seguridad:  '🏠',
  enfrentamiento:  '💥',
  ataque_policia:  '🚔',
  coche_bomba:     '💣',
  extorsion:       '💰',
  otro:            '⚠'
};

function _coActualizarEventosLayer() {
  if (!coMapaObj) return;
  if (CO.eventosLayer) { try { coMapaObj.removeLayer(CO.eventosLayer); } catch(e) {} }

  var markers = [];
  for (var i = 0; i < CO.eventos.length; i++) {
    var ev = CO.eventos[i];
    var lat = parseFloat(ev.lat);
    var lng = parseFloat(ev.lng);
    if (!lat || !lng) continue;

    var icono = CO_ICONOS_EVENTO[ev.tipo_evento] || '⚠';
    var colorBorde = (ev.tipo_evento === 'masacre') ? '#ff0000' :
                     (ev.tipo_evento === 'detencion') ? '#00ccff' :
                     (ev.tipo_evento === 'narcofosa') ? '#666633' : '#ff4444';

    var marker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: '<div style="width:22px;height:22px;border-radius:50%;background:#060810;border:2px solid ' + colorBorde + ';display:flex;align-items:center;justify-content:center;font-size:10px;box-shadow:0 0 6px ' + colorBorde + '44;">' + icono + '</div>',
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    });

    (function(evData) {
      marker.on('click', function() {
        var popup = '<div style="font-family:var(--title);font-size:7px;color:#ff4444;letter-spacing:1px;">' + (evData.tipo_evento || '').toUpperCase() + '</div>' +
          '<div style="font-size:7.5px;color:#c0d8f0;margin-top:3px;">' + (evData.fecha || '') + '</div>' +
          '<div style="font-size:7px;color:#8aa8c8;margin-top:2px;">' + (evData.lugar || '') + '</div>' +
          (evData.victimas_n ? '<div style="font-size:7px;color:#ff4444;margin-top:2px;">Víctimas: ' + evData.victimas_n + '</div>' : '') +
          '<div style="font-size:7px;color:#5a7a9a;margin-top:3px;max-width:180px;">' + (evData.resumen || '').slice(0, 120) + '</div>';
        L.popup({ className: 'co-popup', maxWidth: 220 })
          .setLatLng([parseFloat(evData.lat), parseFloat(evData.lng)])
          .setContent(popup)
          .openOn(coMapaObj);
      });
    })(ev);

    markers.push(marker);
  }

  CO.eventosLayer = L.layerGroup(markers);
  // Solo mostrar si el botón está activo
  var btn = document.getElementById('co-btn-ev');
  if (btn && btn.classList.contains('activo')) {
    CO.eventosLayer.addTo(coMapaObj);
  }
}

// ─────────────────────────────────────────────────────────────
// 4. ACTORES
// ─────────────────────────────────────────────────────────────
function _coRenderActores() {
  var lista = document.getElementById('co-actores-lista');
  if (!lista) return;

  var filtro = CO.filtroActores;
  var busq   = (CO.busquedaActores || '').toLowerCase();

  var arr = CO.actores.filter(function(a) {
    if (filtro === 'cjng'    && a.cartel !== 'cjng')    return false;
    if (filtro === 'csrl'    && a.cartel !== 'csrl')    return false;
    if (filtro === 'activo'  && a.status !== 'activo')  return false;
    if (filtro === 'preso'   && a.status !== 'preso')   return false;
    if (filtro === 'abatido' && a.status !== 'abatido') return false;
    if (busq) {
      var texto = ((a.nombre || '') + ' ' + (a.alias || []).join(' ') + ' ' + (a.rango || '')).toLowerCase();
      if (texto.indexOf(busq) === -1) return false;
    }
    return true;
  });

  if (arr.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:30px;color:#2a4a6a;font-family:var(--mono);font-size:8px;">Sin actores registrados con este filtro.<br><br>Usa <strong style="color:#ff4444">+ ACTOR</strong> para agregar el primer registro.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < arr.length; i++) {
    var a = arr[i];
    var colorCartel = CO_COLORES[a.cartel] || '#556677';
    var alias = Array.isArray(a.alias) ? a.alias.join(', ') : (a.alias || '');
    var badgeClass = a.status === 'preso' ? 'preso' : a.status === 'abatido' ? 'abatido' : a.status === 'desaparecido' ? 'profugo' : 'activo';
    var badgeTxt = (a.status || 'activo').toUpperCase();

    html += '<div class="co-actor-card ' + (a.cartel || '') + ' ' + (a.status || '') + '" id="co-actor-' + a._id + '">' +
      '<div style="flex:1;">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">' +
          '<div class="co-actor-nombre">' + (a.nombre || '—') + '</div>' +
          '<span class="co-badge ' + badgeClass + '">' + badgeTxt + '</span>' +
        '</div>' +
        (alias ? '<div class="co-actor-alias">"' + alias + '"</div>' : '') +
        '<div class="co-actor-meta">' +
          '<span style="color:' + colorCartel + ';">' + (a.cartel || '').toUpperCase() + '</span>' +
          (a.rango ? ' · ' + a.rango : '') +
          (a.zona  ? ' · ' + a.zona  : '') +
        '</div>' +
        (a.notas ? '<div style="font-size:6.5px;color:#3a5a7a;margin-top:4px;">' + a.notas + '</div>' : '') +
      '</div>' +
      '<button onclick="coEditarActor(\'' + a._id + '\')" style="padding:3px 8px;font-family:var(--title);font-size:5.5px;background:transparent;color:#2a4a6a;border:1px solid #1a2a3a;border-radius:2px;cursor:pointer;flex-shrink:0;">✏</button>' +
    '</div>';
  }
  lista.innerHTML = html;
}

function coFiltrarActores(cual, btn) {
  CO.filtroActores = cual;
  var btns = document.querySelectorAll('#co-sec-actores .co-filtro-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  _coRenderActores();
}
window.coFiltrarActores = coFiltrarActores;

function coFiltrarActoresBuscar(val) {
  CO.busquedaActores = val;
  _coRenderActores();
}
window.coFiltrarActoresBuscar = coFiltrarActoresBuscar;

// ─────────────────────────────────────────────────────────────
// 5. EVENTOS
// ─────────────────────────────────────────────────────────────
function _coRenderEventos() {
  var lista = document.getElementById('co-eventos-lista');
  if (!lista) return;

  var filtro = CO.filtroEventos;
  var arr = CO.eventos.filter(function(e) {
    if (filtro !== 'todos' && e.tipo_evento !== filtro) return false;
    return true;
  });

  if (arr.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:30px;color:#2a4a6a;font-family:var(--mono);font-size:8px;">Sin eventos registrados con este filtro.<br><br>Usa <strong style="color:#ff4444">+ EVENTO</strong> para agregar el primer registro.</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < arr.length; i++) {
    var ev = arr[i];
    var icono = CO_ICONOS_EVENTO[ev.tipo_evento] || '⚠';
    var grupos = Array.isArray(ev.grupos_resp) ? ev.grupos_resp.join(', ') : (ev.grupos_resp || '—');

    html += '<div class="co-evento-card ' + (ev.tipo_evento || '') + '">' +
      '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">' +
        '<span style="font-size:12px;">' + icono + '</span>' +
        '<span class="co-evento-tipo">' + (ev.tipo_evento || '').replace('_', ' ') + '</span>' +
        '<span class="co-evento-fecha">' + (ev.fecha || '') + '</span>' +
        (ev.victimas_n && ev.victimas_n > 0 ? '<span class="co-evento-victimas" style="margin-left:auto;">' + ev.victimas_n + ' víct.</span>' : '') +
      '</div>' +
      '<div class="co-evento-lugar">' + (ev.lugar || '—') + '</div>' +
      '<div class="co-evento-resumen">' + (ev.resumen || '') + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:5px;">' +
        '<span style="font-family:var(--title);font-size:5.5px;color:#3a4a5a;letter-spacing:1px;">GRUPOS: </span>' +
        '<span style="font-size:6.5px;color:#ff8844;">' + grupos + '</span>' +
        '<span style="margin-left:auto;font-family:var(--title);font-size:5px;color:#2a3a4a;letter-spacing:1px;">' + (ev.confianza || '').toUpperCase() + '</span>' +
        '<button onclick="coEditarEvento(\'' + ev._id + '\')" style="padding:2px 7px;font-family:var(--title);font-size:5.5px;background:transparent;color:#2a4a6a;border:1px solid #1a2a3a;border-radius:2px;cursor:pointer;">✏</button>' +
      '</div>' +
    '</div>';
  }
  lista.innerHTML = html;
}

function coFiltrarEventos(cual, btn) {
  CO.filtroEventos = cual;
  var btns = document.querySelectorAll('#co-sec-eventos .co-filtro-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  _coRenderEventos();
}
window.coFiltrarEventos = coFiltrarEventos;

// ─────────────────────────────────────────────────────────────
// 6. RED DE ACTORES (grafo canvas)
// ─────────────────────────────────────────────────────────────
var _coRedState = { nodes: [], edges: [], drag: null, offset: {x:0,y:0}, animFrame: null };

function coRenderRed() {
  var canvas = document.getElementById('co-red-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth  || 400;
  canvas.height = canvas.offsetHeight || 400;

  var W = canvas.width;
  var H = canvas.height;

  // Construir nodos desde actores activos (máx 60 para no saturar)
  var actoresActivos = CO.actores.filter(function(a) {
    return a.status !== 'abatido';
  }).slice(0, 60);

  // Posición inicial en círculo
  var nodes = [];
  var n = actoresActivos.length;
  for (var i = 0; i < n; i++) {
    var ang = (2 * Math.PI * i / n) - Math.PI / 2;
    var r   = Math.min(W, H) * 0.35;
    nodes.push({
      id:    actoresActivos[i]._id,
      label: (actoresActivos[i].alias && actoresActivos[i].alias[0]) || actoresActivos[i].nombre || '?',
      cartel: actoresActivos[i].cartel || 'otro',
      status: actoresActivos[i].status || 'activo',
      x: W / 2 + r * Math.cos(ang),
      y: H / 2 + r * Math.sin(ang),
      vx: 0, vy: 0
    });
  }

  _coRedState.nodes = nodes;
  _coRedState.edges = []; // sin relaciones aún (se cargarán de co-relaciones en sprint futuro)

  var info = document.getElementById('co-red-info');
  if (info) info.textContent = nodes.length + ' actores · ' + _coRedState.edges.length + ' relaciones';

  // Cancelar animación previa
  if (_coRedState.animFrame) cancelAnimationFrame(_coRedState.animFrame);

  function dibujar() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#030810';
    ctx.fillRect(0, 0, W, H);

    // Aristas
    for (var e = 0; e < _coRedState.edges.length; e++) {
      var edge = _coRedState.edges[e];
      var na = null, nb = null;
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].id === edge.a) na = nodes[j];
        if (nodes[j].id === edge.b) nb = nodes[j];
      }
      if (!na || !nb) continue;
      ctx.beginPath();
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.strokeStyle = 'rgba(100,100,150,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Nodos
    for (var k = 0; k < nodes.length; k++) {
      var nd = nodes[k];
      var col = CO_COLORES[nd.cartel] || '#556677';
      var radio = nd.status === 'preso' ? 5 : 7;

      // Círculo
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, radio, 0, 2 * Math.PI);
      ctx.fillStyle = col + (nd.status === 'preso' ? '66' : 'cc');
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = nd.status === 'preso' ? '#444' : '#99b8cc';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(nd.label.slice(0, 10), nd.x, nd.y + radio + 9);
    }

    // Fuerzas de separación simples (spring layout básico)
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[b].x - nodes[a].x;
        var dy = nodes[b].y - nodes[a].y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var fuerza = 800 / (dist * dist);
        nodes[a].vx -= fuerza * dx / dist;
        nodes[a].vy -= fuerza * dy / dist;
        nodes[b].vx += fuerza * dx / dist;
        nodes[b].vy += fuerza * dy / dist;
      }
    }

    // Gravedad al centro
    for (var m = 0; m < nodes.length; m++) {
      var nd2 = nodes[m];
      nd2.vx += (W / 2 - nd2.x) * 0.002;
      nd2.vy += (H / 2 - nd2.y) * 0.002;
      // Amortiguación
      nd2.vx *= 0.85;
      nd2.vy *= 0.85;
      // Solo aplicar si no está siendo arrastrado
      if (!_coRedState.drag || _coRedState.drag !== nd2) {
        nd2.x += nd2.vx;
        nd2.y += nd2.vy;
      }
    }

    _coRedState.animFrame = requestAnimationFrame(dibujar);
  }

  dibujar();

  // Drag
  canvas.onmousedown = function(ev) {
    var rect = canvas.getBoundingClientRect();
    var mx = ev.clientX - rect.left;
    var my = ev.clientY - rect.top;
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (Math.abs(nd.x - mx) < 12 && Math.abs(nd.y - my) < 12) {
        _coRedState.drag = nd;
        _coRedState.offset = { x: mx - nd.x, y: my - nd.y };
        break;
      }
    }
  };
  canvas.onmousemove = function(ev) {
    if (!_coRedState.drag) return;
    var rect = canvas.getBoundingClientRect();
    _coRedState.drag.x = ev.clientX - rect.left - _coRedState.offset.x;
    _coRedState.drag.y = ev.clientY - rect.top  - _coRedState.offset.y;
    _coRedState.drag.vx = 0;
    _coRedState.drag.vy = 0;
  };
  canvas.onmouseup = function() { _coRedState.drag = null; };
  canvas.onmouseleave = function() { _coRedState.drag = null; };
}
window.coRenderRed = coRenderRed;

// ─────────────────────────────────────────────────────────────
// 7. GUARDAR / EDITAR — ACTORES
// ─────────────────────────────────────────────────────────────
function coNuevoActor() {
  CO.editId = null;
  // Limpiar campos
  var ids = ['co-a-nombre','co-a-alias','co-a-rango','co-a-zona','co-a-notas','co-a-fuentes'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.value = '';
  }
  var sel = document.getElementById('co-a-cartel');
  if (sel) sel.value = 'cjng';
  var sel2 = document.getElementById('co-a-status');
  if (sel2) sel2.value = 'activo';
  document.getElementById('co-actor-modal').style.display = 'block';
}
window.coNuevoActor = coNuevoActor;

function coEditarActor(id) {
  var actor = null;
  for (var i = 0; i < CO.actores.length; i++) {
    if (CO.actores[i]._id === id) { actor = CO.actores[i]; break; }
  }
  if (!actor) return;
  CO.editId = id;

  var map = {
    'co-a-nombre':  actor.nombre  || '',
    'co-a-alias':   Array.isArray(actor.alias) ? actor.alias.join(', ') : (actor.alias || ''),
    'co-a-rango':   actor.rango   || '',
    'co-a-zona':    actor.zona    || '',
    'co-a-notas':   actor.notas   || '',
    'co-a-fuentes': Array.isArray(actor.fuentes) ? actor.fuentes.join(', ') : (actor.fuentes || '')
  };
  for (var k in map) {
    var el = document.getElementById(k);
    if (el) el.value = map[k];
  }
  var sel = document.getElementById('co-a-cartel');
  if (sel) sel.value = actor.cartel || 'cjng';
  var sel2 = document.getElementById('co-a-status');
  if (sel2) sel2.value = actor.status || 'activo';

  document.getElementById('co-actor-modal').style.display = 'block';
}
window.coEditarActor = coEditarActor;

function coGuardarActor() {
  if (!db) { toast('Firebase no disponible', 'err'); return; }

  var nombre = (document.getElementById('co-a-nombre').value || '').trim();
  if (!nombre) { toast('El nombre es obligatorio', 'err'); return; }

  var aliasRaw = (document.getElementById('co-a-alias').value || '').trim();
  var alias = aliasRaw ? aliasRaw.split(',').map(function(s) { return s.trim(); }) : [];

  var fuentesRaw = (document.getElementById('co-a-fuentes').value || '').trim();
  var fuentes = fuentesRaw ? fuentesRaw.split(',').map(function(s) { return s.trim(); }) : [];

  var doc = {
    nombre:  nombre,
    alias:   alias,
    cartel:  document.getElementById('co-a-cartel').value,
    rango:   (document.getElementById('co-a-rango').value || '').trim(),
    status:  document.getElementById('co-a-status').value,
    zona:    (document.getElementById('co-a-zona').value || '').trim(),
    notas:   (document.getElementById('co-a-notas').value || '').trim(),
    fuentes: fuentes,
    ts:      Date.now(),
    actualizado: firebase.firestore.FieldValue.serverTimestamp()
  };

  var ref = CO.editId
    ? db.collection('co-actores').doc(CO.editId)
    : db.collection('co-actores').doc();

  if (!CO.editId) doc.creado = firebase.firestore.FieldValue.serverTimestamp();

  ref.set(doc, { merge: true })
    .then(function() {
      toast('✓ Actor guardado: ' + nombre, 'ok');
      document.getElementById('co-actor-modal').style.display = 'none';
      CO.editId = null;
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'err');
    });
}
window.coGuardarActor = coGuardarActor;

// ─────────────────────────────────────────────────────────────
// 8. GUARDAR / EDITAR — EVENTOS
// ─────────────────────────────────────────────────────────────
function coNuevoEvento() {
  CO.editId = null;
  var ids = ['co-e-fecha','co-e-lugar','co-e-lat','co-e-lng','co-e-grupos',
             'co-e-victimas','co-e-resumen','co-e-noticia-id','co-e-fuentes'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el) el.value = '';
  }
  document.getElementById('co-e-tipo').value = 'masacre';
  document.getElementById('co-e-confianza').value = 'media';
  document.getElementById('co-evento-modal').style.display = 'block';
}
window.coNuevoEvento = coNuevoEvento;

function coEditarEvento(id) {
  var ev = null;
  for (var i = 0; i < CO.eventos.length; i++) {
    if (CO.eventos[i]._id === id) { ev = CO.eventos[i]; break; }
  }
  if (!ev) return;
  CO.editId = id;

  var map = {
    'co-e-fecha':       ev.fecha        || '',
    'co-e-lugar':       ev.lugar        || '',
    'co-e-lat':         ev.lat          || '',
    'co-e-lng':         ev.lng          || '',
    'co-e-grupos':      Array.isArray(ev.grupos_resp) ? ev.grupos_resp.join(', ') : (ev.grupos_resp || ''),
    'co-e-victimas':    ev.victimas_n   || 0,
    'co-e-resumen':     ev.resumen      || '',
    'co-e-noticia-id':  ev.noticia_id   || '',
    'co-e-fuentes':     Array.isArray(ev.fuentes) ? ev.fuentes.join(', ') : (ev.fuentes || '')
  };
  for (var k in map) {
    var el = document.getElementById(k);
    if (el) el.value = map[k];
  }
  document.getElementById('co-e-tipo').value = ev.tipo_evento  || 'otro';
  document.getElementById('co-e-confianza').value = ev.confianza || 'media';
  document.getElementById('co-evento-modal').style.display = 'block';
}
window.coEditarEvento = coEditarEvento;

function coGuardarEvento() {
  if (!db) { toast('Firebase no disponible', 'err'); return; }

  var tipo  = document.getElementById('co-e-tipo').value;
  var lugar = (document.getElementById('co-e-lugar').value || '').trim();

  var grupos = (document.getElementById('co-e-grupos').value || '').trim();
  var gruposArr = grupos ? grupos.split(',').map(function(s){ return s.trim(); }) : [];

  var fuentesRaw = (document.getElementById('co-e-fuentes').value || '').trim();
  var fuentes = fuentesRaw ? fuentesRaw.split(',').map(function(s){ return s.trim(); }) : [];

  var lat = parseFloat(document.getElementById('co-e-lat').value) || null;
  var lng = parseFloat(document.getElementById('co-e-lng').value) || null;
  // Default: centro Irapuato si no se puso
  if (!lat) lat = 20.6795;
  if (!lng) lng = -101.3540;

  var doc = {
    tipo_evento:  tipo,
    fecha:        (document.getElementById('co-e-fecha').value || '').trim(),
    lugar:        lugar,
    lat:          lat,
    lng:          lng,
    grupos_resp:  gruposArr,
    victimas_n:   parseInt(document.getElementById('co-e-victimas').value) || 0,
    resumen:      (document.getElementById('co-e-resumen').value || '').trim(),
    confianza:    document.getElementById('co-e-confianza').value,
    noticia_id:   (document.getElementById('co-e-noticia-id').value || '').trim(),
    fuentes:      fuentes,
    ts:           Date.now(),
    actualizado:  firebase.firestore.FieldValue.serverTimestamp()
  };

  var ref = CO.editId
    ? db.collection('co-eventos').doc(CO.editId)
    : db.collection('co-eventos').doc();

  if (!CO.editId) doc.creado = firebase.firestore.FieldValue.serverTimestamp();

  ref.set(doc, { merge: true })
    .then(function() {
      toast('✓ Evento guardado: ' + tipo + ' · ' + lugar, 'ok');
      document.getElementById('co-evento-modal').style.display = 'none';
      CO.editId = null;
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'err');
    });
}
window.coGuardarEvento = coGuardarEvento;

// ─────────────────────────────────────────────────────────────
// 9. TERRITORIO DESDE MAPA
// ─────────────────────────────────────────────────────────────
function coNuevoTerritorio(ageb_clave) {
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  // Modal simple via prompt (se reemplazará con modal dedicado en sprint siguiente)
  var grupo = window.prompt('Grupo que controla este AGEB (' + ageb_clave + '):\ncjng / csrl / cds / cdg / disputado / otro');
  if (!grupo) return;
  var disputado = (grupo.trim().toLowerCase() === 'disputado');

  db.collection('co-territorios').add({
    ageb_clave:      ageb_clave,
    controlado_por:  disputado ? '' : grupo.trim().toLowerCase(),
    disputado:       disputado,
    confianza:       'baja',
    inicio_control:  '',
    notas:           '',
    fuentes:         [],
    ts:              Date.now(),
    creado:          firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    toast('✓ Territorio registrado: AGEB ' + ageb_clave, 'ok');
  }).catch(function(e) {
    toast('Error: ' + e.message, 'err');
  });
}
window.coNuevoTerritorio = coNuevoTerritorio;

// ─────────────────────────────────────────────────────────────
// 10. CONTEXTO PARA IA (analisisContextoIA equivalente)
// ─────────────────────────────────────────────────────────────
// Devuelve un string de contexto sobre CO para agregar al prompt de IA
function coContextoIA(lat, lng) {
  if (!lat || !lng) return '';
  if (!CO.actores.length && !CO.eventos.length) return '';

  // Actores activos cercanos (~5km)
  var actoresCerca = CO.actores.filter(function(a) {
    return a.status === 'activo' && a.lat && a.lng &&
      Math.abs(a.lat - lat) < 0.05 && Math.abs(a.lng - lng) < 0.05;
  });

  // Eventos recientes (90 días) cercanos
  var limite = Date.now() - 90 * 24 * 3600 * 1000;
  var eventosCerca = CO.eventos.filter(function(e) {
    return (e.ts || 0) > limite && e.lat && e.lng &&
      Math.abs(e.lat - lat) < 0.05 && Math.abs(e.lng - lng) < 0.05;
  });

  if (!actoresCerca.length && !eventosCerca.length) return '';

  var ctx = 'CONTEXTO CRIMEN ORGANIZADO (zona del incidente):';
  if (eventosCerca.length) {
    ctx += ' Eventos recientes en la zona: ';
    ctx += eventosCerca.slice(0, 3).map(function(e) {
      return e.tipo_evento + ' (' + e.fecha + ')';
    }).join(', ') + '.';
  }
  if (actoresCerca.length) {
    ctx += ' Actores activos conocidos en zona: ';
    ctx += actoresCerca.slice(0, 3).map(function(a) {
      return (a.nombre || a.alias[0] || '?') + ' [' + (a.cartel || '').toUpperCase() + ']';
    }).join(', ') + '.';
  }
  return ctx;
}
window.coContextoIA = coContextoIA;

// Exponer estado para análisis externo
window.CO = CO;
