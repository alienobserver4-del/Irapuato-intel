// ══════════════════════════════════════════════════
// MAPA INTEL — Mapa de incidentes/noticias
// ══════════════════════════════════════════════════
var intelObj = null;
var intelIniciado = false;
var intelMarkers = [];
var intelHeatLayer = null;
var intelHeatActivo = false;
var intelFiltros = {
  seguridad:true, accidente:true, evento:true, gobierno:true, rumor:true,
  desaparecido:true, salud:true, transporte:true, politica:true,
  ambiental:true, corrupcion:true, crimen_organizado:true
};
var intelDias = 14; // por defecto 2 semanas

// Base interna de geo-relaciones calle→colonia (se nutre con cada corrección manual)
var GEO_BASE = {}; // { "calle_normalizada": { colonia: "X", lat: N, lng: N, hits: N } }

function iniciarIntel() {
  try {
    var el = document.getElementById('intel-leaflet');
    var cont = document.getElementById('intel-container');
    var secEl = document.getElementById('sec-intel');
    if (!el || typeof L === 'undefined') return;

    if (intelIniciado && intelObj) {
      intelObj.invalidateSize(true);
      setTimeout(function() {
        intelObj.invalidateSize({animate:false});
        intelObj.setView([20.6795, -101.3540], 12, {animate:false});
        renderIntel();
      }, 300);
      return;
    }

    intelIniciado = true;
    intelObj = L.map('intel-leaflet', { center:[20.6795,-101.3540], zoom:12, zoomControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'&copy; OSM', maxZoom:18
    }).addTo(intelObj);

    setTimeout(function() { intelObj.invalidateSize(true); }, 100);
    setTimeout(function() {
      intelObj.invalidateSize({animate:false});
      intelObj.setView([20.6795,-101.3540], 12, {animate:false});
      renderIntel();
    }, 600);
  } catch(e) {}
}
window.iniciarIntel = iniciarIntel;

// Definición de colores y etiquetas para Intel (incluye nuevas categorías)
var INTEL_META = {
  seguridad:        { color: '#ff2255', label: 'SEG' },
  accidente:        { color: '#ff8800', label: 'ACC' },
  evento:           { color: '#00ccff', label: 'EVE' },
  gobierno:         { color: '#0096ff', label: 'GOB' },
  rumor:            { color: '#3a5a7a', label: 'RUM' },
  desaparecido:     { color: '#ffa500', label: 'DES' },
  salud:            { color: '#00c864', label: 'SAL' },
  transporte:       { color: '#b464ff', label: 'VIA' },
  politica:         { color: '#c040ff', label: 'POL' },
  ambiental:        { color: '#00aa44', label: 'AMB' },
  corrupcion:       { color: '#ffcc00', label: 'COR' },
  crimen_organizado:{ color: '#cc0022', label: 'C.O.' }
};

function renderIntelFiltros() {
  var bar = document.getElementById('intel-filtros');
  if (!bar) return;
  bar.innerHTML = '';
  Object.keys(intelFiltros).forEach(function(tipo) {
    var meta = INTEL_META[tipo] || { color: '#3a5a7a', label: tipo.substring(0,3).toUpperCase() };
    var btn = document.createElement('button');
    btn.className = 'mapa-filtro-btn' + (intelFiltros[tipo] ? ' activo' : ' inactivo');
    btn.style.color = meta.color;
    btn.style.borderColor = meta.color;
    btn.textContent = meta.label;
    btn.onclick = function() { filtrarIntel(tipo, btn); };
    bar.appendChild(btn);
  });
  // Botón TODOS
  var btnTodos = document.createElement('button');
  btnTodos.className = 'mapa-filtro-btn activo';
  btnTodos.style.cssText = 'color:#00f5ff;border-color:#00f5ff;';
  btnTodos.textContent = 'TODOS';
  btnTodos.onclick = function() { filtrarIntel('todos', null); };
  bar.appendChild(btnTodos);
}

function renderIntelContadores(cuentas, tot) {
  var bar = document.getElementById('intel-contadores');
  if (!bar) return;
  bar.innerHTML = '';
  Object.keys(cuentas).forEach(function(tipo) {
    if (!cuentas[tipo]) return; // ocultar tipos con 0
    var meta = INTEL_META[tipo] || { color: '#3a5a7a', label: tipo.substring(0,3).toUpperCase() };
    var div = document.createElement('div');
    div.className = 'mapa-stat';
    div.innerHTML = '<div class="mapa-dot" style="background:' + meta.color + '"></div>' +
      '<span>' + cuentas[tipo] + '</span> ' + meta.label;
    bar.appendChild(div);
  });
  var totEl = document.getElementById('intel-cnt-tot');
  if (totEl) totEl.textContent = tot + ' noticias';
}

function renderIntel() {
  if (!intelObj) return;
  renderIntelFiltros();
  // Limpiar markers anteriores
  for (var i = 0; i < intelMarkers.length; i++) {
    intelObj.removeLayer(intelMarkers[i]);
  }
  intelMarkers = [];
  // Construir cuentas dinámicamente con todos los tipos posibles
  var cuentas = {};
  Object.keys(intelFiltros).forEach(function(k){ cuentas[k] = 0; });
  var heatData = [];

  var ahora = new Date();
  var limiteMs = intelDias > 0 ? intelDias * 24 * 60 * 60 * 1000 : null;

  // Actualizar label de tiempo
  var tLabel = document.getElementById('intel-t-label');
  if (tLabel) {
    if (intelDias === 0) {
      tLabel.textContent = 'Todo el historial';
    } else {
      tLabel.textContent = 'Últimos ' + intelDias + ' días';
    }
  }

  // Filtrar noticias candidatas
  var candidatas = [];
  for (var i = 0; i < noticias.length; i++) {
    var n = noticias[i];
    if (!n.lat || !n.lng) continue;
    var tipo = n.tipo || 'rumor';
    // Si el tipo no está en filtros, se trata como activo (categoría nueva)
    if (intelFiltros.hasOwnProperty(tipo) && !intelFiltros[tipo]) continue;
    if (limiteMs) {
      var fechaN = parsearFechaNoticia(n);
      if (fechaN && (ahora - fechaN) > limiteMs) continue;
    }
    candidatas.push(n);
  }

  // ── Deduplicación geográfica: agrupar las que son el mismo hecho ──
  // Criterio: misma fecha_evento + coordenadas < 100m
  var usadasIntel = {};
  var grupos = []; // [{principal: n, relacionadas: [n, ...]}]

  for (var i = 0; i < candidatas.length; i++) {
    var n = candidatas[i];
    if (usadasIntel[n.id]) continue;
    usadasIntel[n.id] = true;
    var grupo = { principal: n, relacionadas: [] };

    // Explícitas
    var explicitasIds = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids : [];

    for (var j = 0; j < candidatas.length; j++) {
      var m = candidatas[j];
      if (m.id === n.id || usadasIntel[m.id]) continue;
      var esExp = explicitasIds.indexOf(m.id) >= 0;
      if (!esExp) {
        var mIds = Array.isArray(m.relacionadas_ids) ? m.relacionadas_ids : [];
        esExp = mIds.indexOf(n.id) >= 0;
      }
      var esAuto = false;
      if (!esExp && n.fecha_evento && m.fecha_evento && n.fecha_evento === m.fecha_evento) {
        var latN = parseFloat(n.lat), lngN = parseFloat(n.lng);
        var latM = parseFloat(m.lat), lngM = parseFloat(m.lng);
        if (latN && latM && latN !== 20.6795 && latM !== 20.6795) {
          if (distanciaMetros(latN, lngN, latM, lngM) < 100) esAuto = true;
        }
      }
      if (esExp || esAuto) {
        grupo.relacionadas.push(m);
        usadasIntel[m.id] = true;
      }
    }

    // Elegir la principal: resumen más largo
    if (grupo.relacionadas.length > 0) {
      var todas = [n].concat(grupo.relacionadas);
      todas.sort(function(a, b) {
        return (b.resumen||'').length - (a.resumen||'').length;
      });
      grupo.principal = todas[0];
      grupo.relacionadas = todas.slice(1);
    }

    grupos.push(grupo);
  }

  // ── Renderizar un marker por grupo ──
  for (var gi = 0; gi < grupos.length; gi++) {
    var g = grupos[gi];
    var n = g.principal;
    var tipo = n.tipo || 'rumor';
    var lat = parseFloat(n.lat), lng = parseFloat(n.lng);
    cuentas[tipo] = (cuentas[tipo] || 0) + 1;

    var marker = crearIconoMapa ? L.marker([lat, lng], {icon: crearIconoMapa(tipo)}) : L.marker([lat, lng]);
    var _nId = n.id || '';
    var _colorT = COLORES_TIPO[tipo] || '#3a5a7a';

    // Sección de relacionadas en el popup (si hay)
    var relPopupHtml = '';
    if (g.relacionadas.length > 0) {
      var relLinks = '';
      for (var ri = 0; ri < g.relacionadas.length; ri++) {
        var r = g.relacionadas[ri];
        var tituloSafe = (r.titulo || 'Sin título').slice(0, 70).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        var fuenteSafe = (r.fuente||'').replace(/"/g, '&quot;');
        relLinks += '<div class="intel-rel-link" data-rel-id="' + r.id + '">' +
          tituloSafe +
          '<span style="display:block;font-size:6.5px;color:#4a6a8a;margin-top:1px;">' + fuenteSafe + '</span>' +
          '</div>';
      }
      var relGrupoId = 'intel-rel-' + n.id;
      relPopupHtml =
        '<button class="intel-rel-btn" data-rel-grupo="' + relGrupoId + '">' +
          '&#128240; RELACIONADAS (' + g.relacionadas.length + ')' +
        '</button>' +
        '<div class="intel-rel-expand" id="' + relGrupoId + '">' + relLinks + '</div>';
    }

    var popup =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<div style="font-family:\'Orbitron\',monospace;font-size:7px;padding:2px 5px;border-radius:2px;background:' + _colorT + '22;color:' + _colorT + ';border:1px solid ' + _colorT + '44;">' + tipo.toUpperCase() + '</div>' +
        '<div style="display:flex;gap:4px;">' +
          ((n.url||n.link) ? '<a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(255,200,0,.15);color:#ffc800;border:1px solid #ffc80066;border-radius:2px;text-decoration:none;letter-spacing:1px;">&#128279; VER</a>' : '') +
          '<button onclick="verDetallesBD(\'' + _nId + '\')" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(0,245,255,.15);color:#00f5ff;border:1px solid #00f5ff66;border-radius:2px;cursor:pointer;letter-spacing:1px;">DETALLE &#9654;</button>' +
        '</div>' +
      '</div>' +
      (lat && lat !== 20.6795 && typeof analisisBadgeHTML === 'function' ? analisisBadgeHTML(lat, lng) + ' ' : '') +
      '<div style="font-size:10px;color:#c0e8ff;margin-bottom:4px;line-height:1.3;margin-top:4px;">' + (n.titulo||'') + '</div>' +
      '<div style="font-size:7px;color:#5a8aaa;line-height:1.8;">' +
        (n.fuente ? '&#128240; ' + n.fuente + '<br>' : '') +
        (n.calle ? '&#128205; ' + n.calle + (n.calle2 ? ' / ' + n.calle2 : '') + '<br>' : '') +
        (n.colonia ? '&#127968; ' + n.colonia : '') +
      '</div>' +
      (n.resumen ? '<div style="font-size:8px;color:#7a9ab8;margin-top:4px;border-top:1px solid #0d2040;padding-top:4px;">' + n.resumen + '</div>' : '') +
      relPopupHtml;

    marker.noticiaId = _nId;
    marker.bindPopup(popup, {maxWidth:300, minWidth:200, className:'mapa-popup-custom'});
    marker.addTo(intelObj);
    intelMarkers.push(marker);
    heatData.push([lat, lng, 1]);
  }

  // Heatmap
  if (intelHeatLayer) { try { intelObj.removeLayer(intelHeatLayer); } catch(e){} intelHeatLayer = null; }
  if (intelHeatActivo && heatData.length > 0 && typeof L.heatLayer !== 'undefined') {
    intelHeatLayer = L.heatLayer(heatData, {radius:30, blur:20, maxZoom:14});
    intelHeatLayer.addTo(intelObj);
  }

  // Contadores
  var tot = 0;
  for (var k in cuentas) { tot += cuentas[k] || 0; }
  renderIntelContadores(cuentas, tot);
}
window.renderIntel = renderIntel;

// ── Ir al tab BD y mostrar la tarjeta que agrupa una noticia relacionada ──
// La noticia puede ser la principal o una relacionada; en ambos casos buscamos su grupo
function irABD(id) {
  // Cerrar el popup del mapa
  if (intelObj) intelObj.closePopup();
  verTab('bd');
  setTimeout(function() {
    // Buscar la tarjeta en DOM — puede estar directamente o bajo su principal
    var card = document.getElementById('bd-' + id);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.outline = '2px solid #b060ff';
      setTimeout(function() { card.style.outline = ''; }, 2000);
      return;
    }
    // Si no tiene tarjeta propia (es secundaria del grupo), buscar cuál grupo la contiene
    // Para eso buscamos en los grupos actuales
    var grupos = agruparNoticias(noticias);
    for (var gi = 0; gi < grupos.length; gi++) {
      var g = grupos[gi];
      var esRel = false;
      for (var ri = 0; ri < g.relacionadas.length; ri++) {
        if (g.relacionadas[ri].id === id) { esRel = true; break; }
      }
      if (esRel) {
        var cardPrincipal = document.getElementById('bd-' + g.principal.id);
        if (cardPrincipal) {
          cardPrincipal.scrollIntoView({ behavior: 'smooth', block: 'center' });
          cardPrincipal.style.outline = '2px solid #b060ff';
          // Abrir automáticamente la lista de relacionadas
          var relLista = document.getElementById('rel-lista-' + g.principal.id);
          if (relLista) relLista.classList.add('visible');
          setTimeout(function() { cardPrincipal.style.outline = ''; }, 2500);
        }
        break;
      }
    }
  }, 350);
}
window.irABD = irABD;

// ── Toggle del panel de relacionadas dentro del popup de Intel ──
function toggleIntelRel(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('visible');
}
window.toggleIntelRel = toggleIntelRel;

// ── Event delegation para popups de Intel (data-attributes evitan problemas con IDs) ──
document.addEventListener('click', function(e) {
  var btn = e.target.closest ? e.target.closest('[data-rel-grupo]') : null;
  if (btn) { toggleIntelRel(btn.getAttribute('data-rel-grupo')); return; }
  var link = e.target.closest ? e.target.closest('[data-rel-id]') : null;
  if (link) { irABD(link.getAttribute('data-rel-id')); return; }
});

function filtrarIntel(tipo, btn) {
  if (tipo === 'todos') {
    for (var k in intelFiltros) intelFiltros[k] = true;
    var btns = document.querySelectorAll('#intel-filtros .mapa-filtro-btn');
    for (var i = 0; i < btns.length; i++) btns[i].classList.add('activo');
  } else {
    intelFiltros[tipo] = !intelFiltros[tipo];
    if (btn) btn.classList.toggle('activo', intelFiltros[tipo]);
    if (btn) btn.classList.toggle('inactivo', !intelFiltros[tipo]);
  }
  renderIntel();
}
window.filtrarIntel = filtrarIntel;

function filtrarIntelTiempo(dias, btn) {
  intelDias = dias;
  var btns = document.querySelectorAll('.intel-t-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  renderIntel();
}
window.filtrarIntelTiempo = filtrarIntelTiempo;

// Parsear fecha de noticia a objeto Date
function parsearFechaNoticia(n) {
  // Intentar campo fecha_evento primero (DD/MM/YYYY), luego captura (timestamp)
  if (n.fecha_evento) {
    var parts = n.fecha_evento.split('/');
    if (parts.length === 3) {
      var d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
      if (!isNaN(d.getTime())) return d;
    }
  }
  if (n.captura) {
    // captura puede ser "7/3/2026 11:53" o timestamp numérico
    var d = new Date(n.captura);
    if (!isNaN(d.getTime())) return d;
  }
  if (n.fecha) {
    var d = new Date(n.fecha);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function toggleIntelHeat(btn) {
  intelHeatActivo = !intelHeatActivo;
  if (btn) btn.classList.toggle('activo', intelHeatActivo);
  renderIntel();
}
window.toggleIntelHeat = toggleIntelHeat;

function posicionarEnIntel(id) {
  var card = document.getElementById(id);
  if (!card) { toast('Card no encontrado', 'error'); return; }

  // Leer datos del formulario (campos editados por el usuario)
  var titulo  = (document.getElementById(id + '-tit')  ? document.getElementById(id + '-tit').value  : '') || card.querySelector('.nc-titulo') ? card.querySelector('.nc-titulo').textContent : 'Sin titulo';
  var tipo    = (document.getElementById(id + '-tipo') ? document.getElementById(id + '-tipo').value : '') || 'rumor';
  var calle1  = (document.getElementById(id + '-cal1') ? document.getElementById(id + '-cal1').value : '') || '';
  var colonia = (document.getElementById(id + '-col')  ? document.getElementById(id + '-col').value  : '') || '';
  var resumen = (document.getElementById(id + '-sum')  ? document.getElementById(id + '-sum').value  : '') || '';
  var fecha   = (document.getElementById(id + '-fev')  ? document.getElementById(id + '-fev').value  : '') || '';

  // Coordenadas: primero del dataset (análisis IA), luego default
  var lat = parseFloat(card.dataset.lat) || 0;
  var lng = parseFloat(card.dataset.lng) || 0;

  // Si las coords son el centro genérico o inválidas, intentar geocodificar con calle+colonia
  var esCentroGenerico = (Math.abs(lat - 20.6795) < 0.001 && Math.abs(lng - (-101.3540)) < 0.001);
  if ((!lat || !lng || esCentroGenerico) && (calle1 || colonia)) {
    var query = encodeURIComponent((calle1 + ' ' + colonia + ' Irapuato Guanajuato Mexico').trim());
    var url = 'https://nominatim.openstreetmap.org/search?q=' + query + '&format=json&limit=1&bounded=1&viewbox=-101.60,20.45,-101.10,20.85';
    fetch(url)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data && data[0]) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
        } else {
          lat = 20.6795; lng = -101.3540;
        }
        _colocarEnIntel(id, titulo, tipo, calle1, colonia, resumen, fecha, lat, lng);
      })
      .catch(function() {
        _colocarEnIntel(id, titulo, tipo, calle1, colonia, resumen, fecha, 20.6795, -101.3540);
      });
    toast('Geocodificando ubicación...', 'ok');
    return;
  }

  if (!lat || !lng) { lat = 20.6795; lng = -101.3540; }
  _colocarEnIntel(id, titulo, tipo, calle1, colonia, resumen, fecha, lat, lng);
}
window.posicionarEnIntel = posicionarEnIntel;

function _colocarEnIntel(id, titulo, tipo, calle1, colonia, resumen, fecha, lat, lng) {
  // Guardar coords en el card para futuro uso
  var card = document.getElementById(id);
  if (card) { card.dataset.lat = lat; card.dataset.lng = lng; }

  // Ir al tab INTEL
  verTab('intel');

  // Esperar a que el mapa esté listo y agregar el marcador
  setTimeout(function() {
    if (!intelObj) { toast('Mapa INTEL no listo, intenta de nuevo', 'error'); return; }

    var color = COLORES_TIPO[tipo] || '#3a5a7a';
    var marker = L.marker([lat, lng], { icon: crearIconoMapa(tipo) });
    // Buscar noticia completa en array para obtener url/resumen
    var _nd = null; for (var _i=0;_i<noticias.length;_i++){if(noticias[_i].id===id){_nd=noticias[_i];break;}}
    var _url = (_nd && (_nd.url||_nd.link)) ? (_nd.url||_nd.link) : '';
    var popup =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<div style="font-family:\'Orbitron\',monospace;font-size:7px;padding:2px 5px;border-radius:2px;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;">' + tipo.toUpperCase() + '</div>' +
        '<div style="display:flex;gap:4px;">' +
          (_url ? '<a href="' + _url + '" target="_blank" rel="noopener" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(255,200,0,.15);color:#ffc800;border:1px solid #ffc80066;border-radius:2px;text-decoration:none;letter-spacing:1px;">&#128279; VER</a>' : '') +
          '<button onclick="verDetallesBD(\'' + id + '\')" style="font-family:\'Orbitron\',monospace;font-size:7px;padding:3px 7px;background:rgba(0,245,255,.15);color:#00f5ff;border:1px solid #00f5ff66;border-radius:2px;cursor:pointer;letter-spacing:1px;">DETALLE &#9654;</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:#c0e8ff;margin-bottom:4px;line-height:1.3;">' + titulo + '</div>' +
      '<div style="font-size:7px;color:#5a8aaa;line-height:1.8;">' +
        (calle1 ? '&#128205; ' + calle1 + (colonia ? ' / ' + colonia : '') + '<br>' : '') +
        (colonia && !calle1 ? '&#127968; ' + colonia : '') +
      '</div>' +
      (resumen ? '<div style="font-size:8px;color:#7a9ab8;margin-top:4px;border-top:1px solid #0d2040;padding-top:4px;">' + resumen + '</div>' : '');
    marker.noticiaId = id || null;
    marker.bindPopup(popup, {maxWidth:300, minWidth:200, className:'mapa-popup-custom'});
    marker.addTo(intelObj);
    intelMarkers.push(marker);
    intelObj.setView([lat, lng], 15, {animate:true});
    marker.openPopup();
    toast('Noticia posicionada en INTEL', 'ok');

    // Marcar el botón como ya posicionado
    var btnPos = document.getElementById(id + '-btn-pos');
    if (btnPos) { btnPos.textContent = '✅ MAPA'; btnPos.disabled = true; }
  }, 400);
}
window._colocarEnIntel = _colocarEnIntel;


// ── POSICIONAR NOTICIA DE BD EN MAPA INTEL ──
function posicionarBDEnIntel(id) {
  // Leer campos del formulario de edición (los que el usuario acaba de completar)
  var calle1  = document.getElementById('bde-cal-'  + id) ? document.getElementById('bde-cal-'  + id).value.trim()  : '';
  var calle2  = document.getElementById('bde-cal2-' + id) ? document.getElementById('bde-cal2-' + id).value.trim()  : '';
  var colonia = document.getElementById('bde-col-'  + id) ? document.getElementById('bde-col-'  + id).value.trim()  : '';
  var titulo  = document.getElementById('bde-tit-'  + id) ? document.getElementById('bde-tit-'  + id).value.trim()  : '';
  var tipo    = document.getElementById('bde-tipo-' + id) ? document.getElementById('bde-tipo-' + id).value         : 'rumor';
  var resumen = document.getElementById('bde-res-'  + id) ? document.getElementById('bde-res-'  + id).value.trim()  : '';
  var fecha   = document.getElementById('bde-fev-'  + id) ? document.getElementById('bde-fev-'  + id).value.trim()  : '';
  var status  = document.getElementById('bde-geo-status-' + id);

  if (!calle1 && !colonia) {
    if (status) status.textContent = '⚠ Necesitas al menos Calle 1 o Colonia para ubicar';
    if (status) status.style.color = '#ff8800';
    return;
  }

  if (status) { status.textContent = '⏳ Geocodificando...'; status.style.color = '#00ccff'; }

  // Consultar base interna primero
  var keyBusca = calle1.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (keyBusca && GEO_BASE[keyBusca] && GEO_BASE[keyBusca].lat) {
    var geoLocal = GEO_BASE[keyBusca];
    if (status) { status.textContent = '✅ Base interna: ' + geoLocal.colonia; status.style.color = '#00ff88'; }
    if (db) db.collection('noticias-fase1').doc(id).update({ lat: geoLocal.lat, lng: geoLocal.lng });
    for (var i = 0; i < noticias.length; i++) {
      if (noticias[i].id === id) { noticias[i].lat = geoLocal.lat; noticias[i].lng = geoLocal.lng; break; }
    }
    _colocarEnIntel(id, titulo, tipo, calle1, colonia || geoLocal.colonia, resumen, fecha, geoLocal.lat, geoLocal.lng);
    return;
  }

  var query = [calle1, calle2, colonia, 'Irapuato Guanajuato Mexico'].filter(Boolean).join(' ');
  var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) +
            '&format=json&limit=1&bounded=1&viewbox=-101.60,20.45,-101.10,20.85';

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var lat, lng;
      if (data && data[0]) {
        lat = parseFloat(data[0].lat);
        lng = parseFloat(data[0].lon);
        if (status) { status.textContent = '✅ Ubicado: ' + (data[0].display_name||'').split(',').slice(0,2).join(','); status.style.color = '#00ff88'; }
      } else {
        lat = 20.6795; lng = -101.3540;
        if (status) { status.textContent = '⚠ No encontrado — colocado en centro de Irapuato'; status.style.color = '#ff8800'; }
      }
      // Guardar coords en Firebase
      if (db) {
        db.collection('noticias-fase1').doc(id).update({ lat: lat, lng: lng });
      }
      // Actualizar en el array local
      for (var i = 0; i < noticias.length; i++) {
        if (noticias[i].id === id) { noticias[i].lat = lat; noticias[i].lng = lng; break; }
      }
      // Colocar en INTEL
      _colocarEnIntel(id, titulo, tipo, calle1, colonia, resumen, fecha, lat, lng);
    })
    .catch(function() {
      if (status) { status.textContent = '✗ Error de red. Verifica conexión.'; status.style.color = '#ff2255'; }
    });
}
window.posicionarBDEnIntel = posicionarBDEnIntel;

// ── QUITAR NOTICIA DEL MAPA INTEL ──
function quitarDeIntel(id) {
  // Quitar marcador del mapa intel si existe
  var quitados = 0;
  for (var i = intelMarkers.length - 1; i >= 0; i--) {
    var m = intelMarkers[i];
    if (m.noticiaId === id) {
      if (intelObj) { try { intelObj.removeLayer(m); } catch(e) {} }
      intelMarkers.splice(i, 1);
      quitados++;
    }
  }
  // Limpiar coords en Firebase (poner null para que no aparezca)
  if (db) {
    db.collection('noticias-fase1').doc(id).update({ lat: null, lng: null });
  }
  for (var i = 0; i < noticias.length; i++) {
    if (noticias[i].id === id) { noticias[i].lat = null; noticias[i].lng = null; break; }
  }
  var status = document.getElementById('bde-geo-status-' + id);
  if (status) { status.textContent = quitados > 0 ? '✅ Quitado del mapa INTEL' : '⚠ No había punto activo'; status.style.color = quitados > 0 ? '#00ff88' : '#ff8800'; }
  toast('Punto quitado del mapa', 'ok');
}
window.quitarDeIntel = quitarDeIntel;
