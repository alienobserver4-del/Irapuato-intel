/**
 * ingesta.js — Sprint 5: Ingesta masiva + Cola rápida de aprobación
 * Irapuato Intel · 4Alien
 *
 * API pública:
 *   ingestaRenderTab()         — renderiza la tab INGESTA completa
 *   ingestaRenderCola()        — renderiza la cola rápida de aprobación
 *   ingestaAprobarCola(id)     — aprueba un item de la cola
 *   ingestaDescartarCola(id)   — descarta un item de la cola
 *   ingestaAprobarTodos()      — aprueba toda la cola de golpe
 *   INGESTA                    — objeto de estado global
 */

var INGESTA = {
  cola: [],           // [{id_temp, datos, fuente}] — pendientes de aprobar
  procesados: 0,
  aprobados: 0,
  descartados: 0,
  importando: false
};

// Filtro de período para scraping
var ingestaModoRango = false;  // false = modo maxDias, true = modo desde/hasta
var ingestaMaxDias   = 7;      // días hacia atrás en modo rápido
var ingestaDesde     = null;   // Date — inicio del rango (modo calendario)
var ingestaHasta     = null;   // Date — fin del rango (modo calendario)

function ingestaNoticiaDentroDeRango(fechaStr) {
  if (!fechaStr) return true;
  var d = new Date(fechaStr);
  if (isNaN(d.getTime())) return true;
  if (ingestaModoRango) {
    // Modo rango: comprobar entre ingestaDesde e ingestaHasta
    if (ingestaDesde && d < ingestaDesde) return false;
    if (ingestaHasta) {
      var hasta = new Date(ingestaHasta);
      hasta.setHours(23, 59, 59, 999); // incluir todo el día final
      if (d > hasta) return false;
    }
    return true;
  } else {
    // Modo maxDias: N días hacia atrás desde hoy
    if (ingestaMaxDias === 0) return true;
    var limite = new Date();
    limite.setDate(limite.getDate() - ingestaMaxDias);
    return d >= limite;
  }
}
window.ingestaNoticiaDentroDeRango = ingestaNoticiaDentroDeRango;

function ingestaSetMaxDias(dias, btn) {
  ingestaModoRango = false;
  ingestaMaxDias   = dias;
  var btns = document.querySelectorAll('.ingesta-periodo-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  // Ocultar fila de rango si estaba visible
  var rangoRow = document.getElementById('ingesta-rango-row');
  if (rangoRow) rangoRow.style.display = 'none';
  // Actualizar label
  var lbl = document.getElementById('ingesta-periodo-label');
  if (lbl) {
    var labels = { 7:'7 días', 30:'1 mes', 90:'3 meses', 180:'6 meses', 365:'1 año', 0:'sin límite' };
    lbl.textContent = labels[dias] || dias + ' días';
  }
}
window.ingestaSetMaxDias = ingestaSetMaxDias;

function ingestaToggleRango(btn) {
  ingestaModoRango = true;
  // Desactivar botones rápidos
  var btns = document.querySelectorAll('.ingesta-periodo-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  // Mostrar fila de rango
  var rangoRow = document.getElementById('ingesta-rango-row');
  if (rangoRow) rangoRow.style.display = 'flex';
  var lbl = document.getElementById('ingesta-periodo-label');
  if (lbl) lbl.textContent = 'rango personalizado';
}
window.ingestaToggleRango = ingestaToggleRango;

function ingestaAplicarRango() {
  var desdEl = document.getElementById('ingesta-fecha-desde');
  var hastaEl = document.getElementById('ingesta-fecha-hasta');
  if (!desdEl || !desdEl.value) { if (typeof toast === 'function') toast('Elige fecha inicial', 'warn'); return; }
  ingestaDesde = new Date(desdEl.value);
  ingestaHasta = hastaEl && hastaEl.value ? new Date(hastaEl.value) : new Date();
  ingestaModoRango = true;
  var lbl = document.getElementById('ingesta-periodo-label');
  if (lbl) {
    var dStr = desdEl.value;
    var hStr = hastaEl && hastaEl.value ? hastaEl.value : 'hoy';
    lbl.textContent = dStr + ' → ' + hStr;
  }
  if (typeof toast === 'function') toast('Rango: ' + desdEl.value + ' → ' + (hastaEl && hastaEl.value ? hastaEl.value : 'hoy'), 'ok');
}
window.ingestaAplicarRango = ingestaAplicarRango;

// ─── Utilidades ─────────────────────────────────────────────────────────────

function _ingestaId() {
  return 'ing_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
}

function _ingestaFechaCaptura() {
  var d = new Date();
  return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear() +
    ' ' + d.getHours() + ':' + (d.getMinutes()<10?'0':'') + d.getMinutes();
}

function _ingestaNormalizarDoc(raw) {
  // Acepta docs exportados de Firestore (con o sin wrapper __collections__)
  // o noticias simples {titulo, tipo, ...}
  var d = raw;
  if (raw && raw.fields) {
    // Formato export Firestore REST API — aplanar
    d = {};
    var fields = raw.fields;
    for (var k in fields) {
      var v = fields[k];
      if (v.stringValue !== undefined) d[k] = v.stringValue;
      else if (v.integerValue !== undefined) d[k] = parseInt(v.integerValue);
      else if (v.doubleValue !== undefined) d[k] = parseFloat(v.doubleValue);
      else if (v.booleanValue !== undefined) d[k] = v.booleanValue;
      else if (v.timestampValue !== undefined) d[k] = new Date(v.timestampValue).getTime();
      else if (v.arrayValue !== undefined) {
        d[k] = (v.arrayValue.values || []).map(function(av) {
          return av.stringValue || av.integerValue || '';
        });
      }
    }
  }
  // Asegurar campos mínimos
  return {
    titulo:        d.titulo        || d.title || 'Sin título',
    tipo:          d.tipo          || 'rumor',
    tipo2:         d.tipo2         || '',
    lugar:         d.lugar         || '',
    calle:         d.calle         || d.calle1 || '',
    calle2:        d.calle2        || '',
    colonia:       d.colonia       || '',
    comunidad:     d.comunidad     || '',
    nombres:       d.nombres       || '',
    fecha_evento:  d.fecha_evento  || '',
    tiempo_dia:    d.tiempo_dia    || 'desconocido',
    resumen:       d.resumen       || d.desc || d.description || '',
    fuente:        d.fuente        || d.source || 'Importado',
    url:           d.url           || d.link  || '',
    lat:           parseFloat(d.lat)  || 20.6795,
    lng:           parseFloat(d.lng)  || -101.3540,
    confianza:     d.confianza     || 'media',
    ts:            d.ts            || Date.now(),
    tematica:      Array.isArray(d.tematica)   ? d.tematica   : [],
    verbos:        Array.isArray(d.verbos)     ? d.verbos     : [],
    sustantivos:   Array.isArray(d.sustantivos)? d.sustantivos: [],
    texto_original:d.texto_original || '',
    viaIA:         false
  };
}

// ─── Importador JSON ─────────────────────────────────────────────────────────

window.ingestaCargarJSON = function(input) {
  var file = input.files[0];
  if (!file) return;
  var statusEl = document.getElementById('ingesta-status');
  if (statusEl) { statusEl.textContent = '⏳ Leyendo archivo...'; statusEl.style.color = '#0ff'; }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var raw = JSON.parse(e.target.result);
      var docs = [];

      // Detectar formato: array directo, {documents:[...]}, o export Firestore
      if (Array.isArray(raw)) {
        docs = raw;
      } else if (raw.documents && Array.isArray(raw.documents)) {
        docs = raw.documents;
      } else if (raw.noticias && Array.isArray(raw.noticias)) {
        docs = raw.noticias;
      } else if (typeof raw === 'object') {
        // Export de Firebase Console: objeto con IDs como keys
        var keys = Object.keys(raw);
        for (var ki = 0; ki < keys.length; ki++) {
          var val = raw[keys[ki]];
          if (val && typeof val === 'object') {
            val._importId = keys[ki];
            docs.push(val);
          }
        }
      }

      if (docs.length === 0) {
        if (statusEl) { statusEl.textContent = '✗ No se encontraron documentos en el JSON'; statusEl.style.color = '#f44'; }
        return;
      }

      // Normalizar y agregar a la cola
      var agregados = 0;
      for (var i = 0; i < docs.length; i++) {
        var norm = _ingestaNormalizarDoc(docs[i]);
        // Filtrar docs sin título real
        if (!norm.titulo || norm.titulo === 'Sin título') continue;
        // Deduplicar por título+fecha en la cola actual
        var dup = false;
        for (var ci = 0; ci < INGESTA.cola.length; ci++) {
          if (INGESTA.cola[ci].datos.titulo === norm.titulo &&
              INGESTA.cola[ci].datos.fecha_evento === norm.fecha_evento) {
            dup = true; break;
          }
        }
        if (dup) continue;
        INGESTA.cola.push({ id_temp: _ingestaId(), datos: norm });
        agregados++;
      }

      if (statusEl) {
        statusEl.textContent = '✓ ' + agregados + ' noticias agregadas a la cola (' + docs.length + ' en archivo)';
        statusEl.style.color = '#0f8';
      }
      ingestaRenderCola();
      _ingestaActualizarContadores();

    } catch(err) {
      if (statusEl) { statusEl.textContent = '✗ JSON inválido: ' + err.message; statusEl.style.color = '#f44'; }
    }
  };
  reader.readAsText(file);
};

// ─── Cola rápida ─────────────────────────────────────────────────────────────

window.ingestaAprobarCola = function(idTemp) {
  var idx = -1;
  for (var i = 0; i < INGESTA.cola.length; i++) {
    if (INGESTA.cola[i].id_temp === idTemp) { idx = i; break; }
  }
  if (idx < 0) return;

  var item = INGESTA.cola[idx];
  var datos = item.datos;

  // Guardar en Firestore
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  var docData = {};
  for (var k in datos) { docData[k] = datos[k]; }
  docData.fechaGuardado = firebase.firestore.FieldValue.serverTimestamp();
  docData.fechaCaptura  = _ingestaFechaCaptura();
  docData.ts            = docData.ts || Date.now();

  db.collection('noticias-fase1').add(docData)
    .then(function() {
      INGESTA.aprobados++;
      INGESTA.cola.splice(idx, 1);
      _ingestaRemoverCard(idTemp);
      _ingestaActualizarContadores();
    })
    .catch(function(e) {
      toast('Error guardando: ' + e.message, 'err');
    });
};

window.ingestaDescartarCola = function(idTemp) {
  for (var i = 0; i < INGESTA.cola.length; i++) {
    if (INGESTA.cola[i].id_temp === idTemp) {
      INGESTA.cola.splice(i, 1);
      INGESTA.descartados++;
      break;
    }
  }
  _ingestaRemoverCard(idTemp);
  _ingestaActualizarContadores();
};

function _ingestaRemoverCard(idTemp) {
  var card = document.getElementById('ingesta-card-' + idTemp);
  if (!card) return;
  card.style.transition = 'opacity .25s';
  card.style.opacity = '0';
  setTimeout(function() {
    if (card.parentNode) card.parentNode.removeChild(card);
  }, 260);
}

window.ingestaAprobarTodos = function() {
  if (INGESTA.cola.length === 0) { toast('La cola está vacía', 'warn'); return; }
  if (!db) { toast('Firebase no disponible', 'err'); return; }

  var btn = document.getElementById('ingesta-btn-aprobar-todos');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  var total = INGESTA.cola.length;
  var ok = 0;
  var errores = 0;
  var BATCH_SIZE = 400; // Firestore max 500 por batch
  var colaTemp = INGESTA.cola.slice();

  function procesarBatch(desde) {
    if (desde >= colaTemp.length) {
      INGESTA.aprobados += ok;
      INGESTA.cola = [];
      toast('✓ ' + ok + ' noticias guardadas' + (errores ? ' · ' + errores + ' errores' : ''), 'ok');
      ingestaRenderCola();
      _ingestaActualizarContadores();
      if (btn) { btn.disabled = false; btn.textContent = '✓ APROBAR TODOS (' + INGESTA.cola.length + ')'; }
      return;
    }

    var batch = db.batch();
    var hasta = Math.min(desde + BATCH_SIZE, colaTemp.length);

    for (var i = desde; i < hasta; i++) {
      var datos = colaTemp[i].datos;
      var docData = {};
      for (var k in datos) { docData[k] = datos[k]; }
      docData.fechaGuardado = firebase.firestore.FieldValue.serverTimestamp();
      docData.fechaCaptura  = _ingestaFechaCaptura();
      docData.ts            = docData.ts || Date.now();
      var ref = db.collection('noticias-fase1').doc();
      batch.set(ref, docData);
      ok++;
    }

    batch.commit()
      .then(function() { procesarBatch(hasta); })
      .catch(function(e) {
        errores++;
        console.warn('[Ingesta] Error batch:', e.message);
        procesarBatch(hasta); // continuar aunque falle un batch
      });
  }

  procesarBatch(0);
};

// ─── Colores por tipo ────────────────────────────────────────────────────────
var _INGESTA_TIPOS_COLOR = {
  seguridad:'#ff2255', accidente:'#ff8800', crimen_organizado:'#cc0022',
  gobierno:'#0096ff', politica:'#c040ff', salud:'#00c864',
  transporte:'#b464ff', ambiental:'#00aa44', corrupcion:'#ffcc00',
  desaparecido:'#ffa500', evento:'#00ccff', rumor:'#3a5a7a'
};
var _INGESTA_TIPOS_LISTA = [
  'seguridad','accidente','crimen_organizado','gobierno','politica',
  'salud','transporte','ambiental','corrupcion','desaparecido','evento','rumor'
];

// ─── Render de la cola ───────────────────────────────────────────────────────

window.ingestaRenderCola = function() {
  var contenedor = document.getElementById('ingesta-cola');
  if (!contenedor) return;

  if (INGESTA.cola.length === 0) {
    contenedor.innerHTML =
      '<div style="padding:30px;text-align:center;color:#444;">' +
      (INGESTA.aprobados > 0
        ? '✓ Cola vacía — ' + INGESTA.aprobados + ' noticias guardadas'
        : 'La cola está vacía. Importa un JSON o usa el scraping paginado.') +
      '</div>';
    return;
  }

  var html = '';
  var max = Math.min(INGESTA.cola.length, 200);
  for (var i = 0; i < max; i++) {
    html += _ingestaCardHTML(INGESTA.cola[i]);
  }
  if (INGESTA.cola.length > max) {
    html += '<div style="color:#444;font-size:11px;text-align:center;padding:8px;">' +
      '… y ' + (INGESTA.cola.length - max) + ' más</div>';
  }
  contenedor.innerHTML = html;
};

// Genera HTML de una tarjeta individual (estado colapsado)
function _ingestaCardHTML(item) {
  var d = item.datos;
  var color = _INGESTA_TIPOS_COLOR[d.tipo] || '#3a5a7a';
  var confColor = d.confianza === 'alta' ? '#0f8' : d.confianza === 'media' ? '#ff8' : '#f84';
  var lugar = [d.calle, d.colonia, d.comunidad].filter(Boolean).join(' · ') || d.lugar || '';
  var tid = item.id_temp;

  return '<div id="ingesta-card-' + tid + '" ' +
    'style="border-left:3px solid ' + color + ';background:#0a0a14;' +
    'margin-bottom:6px;border-radius:0 3px 3px 0;">' +

    // ── Fila superior: info + botones rápidos ──
    '<div style="padding:8px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +

      '<div style="flex-shrink:0;">' +
        '<span id="ingesta-tipo-badge-' + tid + '" ' +
        'style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;' +
        'font-size:9px;padding:1px 5px;border-radius:2px;font-family:monospace;">' +
        d.tipo.toUpperCase() + '</span> ' +
        '<span style="color:' + confColor + ';font-size:9px;">' + (d.confianza||'?') + '</span>' +
      '</div>' +

      '<div style="flex:1;min-width:180px;">' +
        '<div id="ingesta-titulo-' + tid + '" ' +
        'style="font-size:11px;color:#c0e8ff;font-weight:600;line-height:1.3;">' +
          (d.titulo||'').slice(0,100) +
        '</div>' +
        '<div style="font-size:9px;color:#5a8aaa;margin-top:1px;">' +
          '📰 ' + (d.fuente||'?') +
          (d.fecha_evento ? ' · 📅 ' + d.fecha_evento : '') +
          (lugar ? ' · 📍 ' + lugar.slice(0,40) : '') +
        '</div>' +
      '</div>' +

      // Botones fila superior
      '<div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;">' +
        // VER NOTA — solo si tiene URL
        (d.url ? '<a href="' + d.url + '" target="_blank" rel="noopener" ' +
          'style="background:rgba(255,200,0,.12);border:1px solid #ffc80055;color:#ffc800;' +
          'font-size:10px;padding:4px 8px;border-radius:3px;text-decoration:none;font-weight:700;">' +
          '🔗 VER</a>' : '') +
        // PEGAR TEXTO / ANALIZAR
        '<button onclick="ingestaToggleTexto(\'' + tid + '\')" ' +
        'id="ingesta-btn-texto-' + tid + '" ' +
        'style="background:rgba(0,200,255,.1);border:1px solid #00c8ff55;color:#00c8ff;' +
        'font-size:10px;padding:4px 8px;cursor:pointer;border-radius:3px;font-weight:700;">' +
          '📋 TEXTO + IA' +
        '</button>' +
        // APROBAR rápido (sin IA)
        '<button onclick="ingestaAprobarCola(\'' + tid + '\')" ' +
        'style="background:rgba(0,255,136,.12);border:1px solid #00ff8855;color:#00ff88;' +
        'font-size:10px;padding:4px 9px;cursor:pointer;border-radius:3px;font-weight:700;">✓</button>' +
        // DESCARTAR
        '<button onclick="ingestaDescartarCola(\'' + tid + '\')" ' +
        'style="background:rgba(255,34,85,.1);border:1px solid #ff225544;color:#ff4466;' +
        'font-size:10px;padding:4px 9px;cursor:pointer;border-radius:3px;font-weight:700;">✗</button>' +
      '</div>' +
    '</div>' +

    // ── Panel expandible: textarea + análisis IA ──
    '<div id="ingesta-panel-' + tid + '" style="display:none;' +
    'border-top:1px solid #1a1a2e;padding:10px;">' +
      '<div style="font-size:9px;color:#555;margin-bottom:4px;">' +
        '1. Abre la nota, copia el texto completo, pégalo aquí:' +
      '</div>' +
      '<textarea id="ingesta-textarea-' + tid + '" ' +
      'placeholder="Pega aquí el texto completo de la nota..." ' +
      'style="width:100%;height:80px;background:#060d18;border:1px solid #1a2a3a;' +
      'color:#c0e8ff;font-size:10px;padding:6px;border-radius:3px;resize:vertical;' +
      'box-sizing:border-box;font-family:monospace;"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
        '<button onclick="ingestaAnalizarIA(\'' + tid + '\')" ' +
        'id="ingesta-btn-analizar-' + tid + '" ' +
        'style="background:rgba(255,140,0,.15);border:1px solid #ff8c0066;color:#ff8c00;' +
        'font-size:11px;padding:5px 14px;cursor:pointer;border-radius:3px;font-weight:700;">' +
          '⚡ ANALIZAR CON IA' +
        '</button>' +
        '<div id="ingesta-ia-status-' + tid + '" style="font-size:10px;color:#555;"></div>' +
      '</div>' +

      // Panel de resultados IA (oculto hasta que responde)
      '<div id="ingesta-ia-result-' + tid + '" style="display:none;margin-top:10px;' +
      'border-top:1px solid #1a1a2e;padding-top:8px;">' +
        // Tipo + Confianza
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<div style="flex:1;min-width:140px;">' +
            '<div style="font-size:9px;color:#555;margin-bottom:2px;">TIPO</div>' +
            '<select id="ingesta-edit-tipo-' + tid + '" ' +
            'onchange="ingestaSubtipoOnTipo(\'' + tid + '\', this.value)" ' +
            'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
            'font-size:10px;padding:4px;border-radius:3px;">' +
              _ingestaTiposOptions('rumor') +
            '</select>' +
            // Subtipo seguridad — visible solo si tipo=seguridad
            '<div id="subtipo-seg-wrap-' + tid + '" style="display:none;margin-top:4px;">' +
              '<div style="font-size:9px;color:#ff4466;letter-spacing:.5px;margin-bottom:2px;">SUBTIPO DELITO</div>' +
              '<select id="subtipo-seg-' + tid + '" ' +
              'style="width:100%;background:#060d18;border:1px solid #ff225544;color:#ff8080;' +
              'font-size:10px;padding:4px;border-radius:3px;">' +
                _ingestaSubtiposOptions('') +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div style="flex:1;min-width:120px;">' +
            '<div style="font-size:9px;color:#555;margin-bottom:2px;">CONFIANZA</div>' +
            '<select id="ingesta-edit-conf-' + tid + '" ' +
            'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
            'font-size:10px;padding:4px;border-radius:3px;">' +
              '<option value="alta">alta</option>' +
              '<option value="media" selected>media</option>' +
              '<option value="baja">baja</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        // Título
        '<div style="margin-bottom:6px;">' +
          '<div style="font-size:9px;color:#555;margin-bottom:2px;">TÍTULO</div>' +
          '<input id="ingesta-edit-tit-' + tid + '" type="text" ' +
          'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
          'font-size:10px;padding:4px 6px;border-radius:3px;box-sizing:border-box;">' +
        '</div>' +
        // Calle + Colonia
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<div style="flex:1;min-width:140px;">' +
            '<div style="font-size:9px;color:#555;margin-bottom:2px;">CALLE</div>' +
            '<input id="ingesta-edit-calle-' + tid + '" type="text" ' +
            'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
            'font-size:10px;padding:4px 6px;border-radius:3px;box-sizing:border-box;">' +
          '</div>' +
          '<div style="flex:1;min-width:140px;">' +
            '<div style="font-size:9px;color:#555;margin-bottom:2px;">COLONIA</div>' +
            '<input id="ingesta-edit-col-' + tid + '" type="text" ' +
            'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
            'font-size:10px;padding:4px 6px;border-radius:3px;box-sizing:border-box;">' +
          '</div>' +
        '</div>' +
        // Resumen
        '<div style="margin-bottom:8px;">' +
          '<div style="font-size:9px;color:#555;margin-bottom:2px;">RESUMEN</div>' +
          '<textarea id="ingesta-edit-res-' + tid + '" rows="2" ' +
          'style="width:100%;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;' +
          'font-size:10px;padding:4px 6px;border-radius:3px;resize:vertical;' +
          'box-sizing:border-box;font-family:monospace;"></textarea>' +
        '</div>' +
        // Botones de aprobación con/sin IA
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          '<button onclick="ingestaAprobarConIA(\'' + tid + '\')" ' +
          'style="background:rgba(0,255,136,.15);border:1px solid #0f8;color:#0f8;' +
          'font-size:11px;padding:5px 14px;cursor:pointer;border-radius:3px;font-weight:700;">' +
            '✓ APROBAR CON ANÁLISIS' +
          '</button>' +
          '<button onclick="ingestaAprobarCola(\'' + tid + '\')" ' +
          'style="background:rgba(0,200,255,.1);border:1px solid #00c8ff55;color:#00c8ff;' +
          'font-size:10px;padding:5px 10px;cursor:pointer;border-radius:3px;">' +
            '✓ APROBAR SIN ANÁLISIS' +
          '</button>' +
        '</div>' +
      '</div>' + // fin ingesta-ia-result
    '</div>' + // fin panel expandible
  '</div>'; // fin card
}

function _ingestaSubtiposOptions(seleccionado) {
  var SUBS = [
    {v:'',                  l:'— Subtipo delito —'},
    {v:'homicidio_doloso',  l:'Homicidio doloso'},
    {v:'homicidio_culposo', l:'Homicidio culposo'},
    {v:'feminicidio',       l:'Feminicidio'},
    {v:'lesiones_dolosas',  l:'Lesiones dolosas'},
    {v:'lesiones_culposas', l:'Lesiones culposas'},
    {v:'robo_con_violencia',l:'Robo con violencia'},
    {v:'robo_sin_violencia',l:'Robo sin violencia'},
    {v:'robo_vehiculo',     l:'Robo de vehículo'},
    {v:'robo_casa',         l:'Robo a casa habitación'},
    {v:'robo_negocio',      l:'Robo a negocio'},
    {v:'robo_transeunte',   l:'Robo a transeúnte'},
    {v:'secuestro',         l:'Secuestro'},
    {v:'extorsion',         l:'Extorsión'},
    {v:'narcomenudeo',      l:'Narcomenudeo'},
    {v:'portacion_armas',   l:'Portación de armas'},
    {v:'privacion_libertad',l:'Privación de la libertad'},
    {v:'desaparicion_forzada',l:'Desaparición forzada'},
    {v:'violacion',         l:'Violación'},
    {v:'violencia_familiar',l:'Violencia familiar'},
    {v:'abuso_sexual',      l:'Abuso sexual'},
    {v:'amenazas',          l:'Amenazas'},
    {v:'fraude',            l:'Fraude'},
    {v:'otro_seguridad',    l:'Otro (seguridad)'}
  ];
  var html = '';
  for (var i = 0; i < SUBS.length; i++) {
    html += '<option value="' + SUBS[i].v + '"' +
      (SUBS[i].v === seleccionado ? ' selected' : '') + '>' + SUBS[i].l + '</option>';
  }
  return html;
}

// Mostrar/ocultar subtipo según tipo seleccionado
window.ingestaSubtipoOnTipo = function(tid, tipoValor) {
  var wrap = document.getElementById('ingesta-subtipo-wrap-' + tid);
  if (!wrap) return;
  wrap.style.display = tipoValor === 'seguridad' ? 'block' : 'none';
  if (tipoValor !== 'seguridad') {
    var sel = document.getElementById('ingesta-subtipo-' + tid);
    if (sel) sel.value = '';
  }
};

function _ingestaTiposOptions(seleccionado) {
  var html = '';
  for (var i = 0; i < _INGESTA_TIPOS_LISTA.length; i++) {
    var t = _INGESTA_TIPOS_LISTA[i];
    html += '<option value="' + t + '"' + (t === seleccionado ? ' selected' : '') + '>' + t + '</option>';
  }
  return html;
}

function _ingestaSubtiposOptions(seleccionado) {
  var lista = typeof SUBTIPO_SEG !== 'undefined' ? SUBTIPO_SEG : [];
  var html = '<option value="">— Subtipo delito —</option>';
  for (var i = 0; i < lista.length; i++) {
    var s = lista[i];
    html += '<option value="' + s.val + '"' + (s.val === seleccionado ? ' selected' : '') + '>' + s.label + '</option>';
  }
  return html;
}

// ─── Toggle panel de texto+IA ────────────────────────────────────────────────

window.ingestaToggleTexto = function(tid) {
  var panel = document.getElementById('ingesta-panel-' + tid);
  if (!panel) return;
  var abierto = panel.style.display !== 'none';
  panel.style.display = abierto ? 'none' : 'block';
  var btn = document.getElementById('ingesta-btn-texto-' + tid);
  if (btn) btn.style.borderColor = abierto ? '#00c8ff55' : '#00c8ff';
  if (!abierto) {
    setTimeout(function() {
      var ta = document.getElementById('ingesta-textarea-' + tid);
      if (ta) ta.focus();
    }, 100);
  }
};

// ─── Analizar con IA ─────────────────────────────────────────────────────────

window.ingestaAnalizarIA = function(tid) {
  var ta = document.getElementById('ingesta-textarea-' + tid);
  var texto = ta ? ta.value.trim() : '';
  if (!texto || texto.length < 30) {
    toast('Pega el texto completo de la nota primero', 'warn');
    return;
  }

  var btnAn = document.getElementById('ingesta-btn-analizar-' + tid);
  var statusEl = document.getElementById('ingesta-ia-status-' + tid);
  if (btnAn) { btnAn.disabled = true; btnAn.textContent = '⏳ Analizando...'; }
  if (statusEl) { statusEl.textContent = 'Enviando a IA...'; statusEl.style.color = '#ff8c00'; }

  // Buscar fuente del item para el prompt
  var item = null;
  for (var i = 0; i < INGESTA.cola.length; i++) {
    if (INGESTA.cola[i].id_temp === tid) { item = INGESTA.cola[i]; break; }
  }
  var fuente = item ? (item.datos.fuente || '') : '';
  var textoConFuente = fuente ? '[Fuente: ' + fuente + ']\n' + texto : texto;

  // Usar llamarIA() — OpenRouter primero, Gemini como fallback (igual que flujo RSS)
  if (typeof llamarIA !== 'function' || typeof buildPrompt !== 'function') {
    toast('Módulo IA no cargado', 'err');
    if (btnAn) { btnAn.disabled = false; btnAn.textContent = '⚡ ANALIZAR CON IA'; }
    return;
  }

  var prompt = buildPrompt(textoConFuente);
  llamarIA(prompt, function(resultado, error) {
    if (btnAn) { btnAn.disabled = false; btnAn.textContent = '⚡ ANALIZAR CON IA'; }

    if (error || !resultado) {
      if (statusEl) {
        statusEl.textContent = '✗ ' + (error || 'Sin respuesta');
        statusEl.style.color = '#f44';
      }
      return;
    }

    // Guardar ia_raw en el item de la cola
    if (item) {
      item.ia_raw = {};
      for (var k in resultado) { item.ia_raw[k] = resultado[k]; }
    }

    // Rellenar campos del panel de edición
    _ingestaRellenarCampos(tid, resultado);

    // Mostrar panel de resultados
    var resPanel = document.getElementById('ingesta-ia-result-' + tid);
    if (resPanel) resPanel.style.display = 'block';

    if (statusEl) {
      statusEl.textContent = '✓ Análisis listo · revisa y edita si necesitas';
      statusEl.style.color = '#0f8';
    }
  });
};

function _ingestaRellenarCampos(tid, r) {
  var setVal = function(id, val) {
    var el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  var setOpt = function(id, val) {
    var el = document.getElementById(id);
    if (!el || !val) return;
    for (var oi = 0; oi < el.options.length; oi++) {
      if (el.options[oi].value === val) { el.selectedIndex = oi; break; }
    }
  };
  setOpt('ingesta-edit-tipo-' + tid, r.tipo);
  setOpt('ingesta-edit-conf-' + tid, r.confianza);
  setVal('ingesta-edit-tit-'  + tid, r.titulo);
  setVal('ingesta-edit-calle-'+ tid, r.calle1 || r.calle || '');
  setVal('ingesta-edit-col-'  + tid, r.colonia);
  setVal('ingesta-edit-res-'  + tid, r.resumen);
}

// ─── Aprobar CON análisis IA (calcula diff automáticamente) ──────────────────

window.ingestaAprobarConIA = function(tid) {
  var item = null;
  var idx  = -1;
  for (var i = 0; i < INGESTA.cola.length; i++) {
    if (INGESTA.cola[i].id_temp === tid) { item = INGESTA.cola[i]; idx = i; break; }
  }
  if (!item) return;
  if (!db) { toast('Firebase no disponible', 'err'); return; }

  // Leer campos editados por el usuario
  var getVal = function(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };
  var tipo     = getVal('ingesta-edit-tipo-'  + tid) || item.datos.tipo;
  var subtipo  = getVal('ingesta-subtipo-'    + tid) || '';
  if (subtipo) item.datos.tipo2 = subtipo;
  var confianza= getVal('ingesta-edit-conf-'  + tid) || item.datos.confianza;
  var titulo   = getVal('ingesta-edit-tit-'   + tid) || item.datos.titulo;
  var calle    = getVal('ingesta-edit-calle-' + tid);
  var colonia  = getVal('ingesta-edit-col-'   + tid);
  var resumen  = getVal('ingesta-edit-res-'   + tid) || item.datos.resumen;
  var textoOrig= (document.getElementById('ingesta-textarea-' + tid)||{}).value || '';
  // Subtipo seguridad (Sprint 6)
  var subtipoSeg = tipo === 'seguridad' ? getVal('subtipo-seg-' + tid) : '';

  // usuario_aprobacion: lo que el usuario tiene en los campos ahora
  var usuAprobacion = {
    tipo: tipo, confianza: confianza, titulo: titulo,
    calle: calle, colonia: colonia, resumen: resumen
  };

  // Calcular diff vs ia_raw
  var iaRaw = item.ia_raw || {};
  var diff = {};
  var camposCorregidos = [];
  var camposAComparar = ['tipo','confianza','titulo','calle','colonia','resumen'];
  for (var ci = 0; ci < camposAComparar.length; ci++) {
    var campo = camposAComparar[ci];
    var valIA  = (iaRaw[campo]  || iaRaw['calle1'] && campo === 'calle' ? iaRaw['calle1'] : iaRaw[campo]) || '';
    var valUsr = usuAprobacion[campo] || '';
    if (valIA !== valUsr && valUsr !== '') {
      diff[campo] = { ia: valIA, usuario: valUsr };
      camposCorregidos.push(campo);
    }
  }

  // Construir documento final mezclando datos base + campos IA + ediciones usuario
  var docData = {};
  for (var k in item.datos) { docData[k] = item.datos[k]; }
  // Sobrescribir con lo que analizó la IA
  if (item.ia_raw) {
    var camposIA = ['lat','lng','tiempo_dia','fecha_evento','nombres',
                    'comunidad','calle2','tematica','verbos','sustantivos'];
    for (var ki = 0; ki < camposIA.length; ki++) {
      if (item.ia_raw[camposIA[ki]] !== undefined) {
        docData[camposIA[ki]] = item.ia_raw[camposIA[ki]];
      }
    }
  }
  // Sobrescribir con lo que editó el usuario (tiene prioridad)
  docData.tipo      = tipo;
  docData.confianza = confianza;
  docData.titulo    = titulo;
  docData.calle     = calle || docData.calle;
  docData.colonia   = colonia || docData.colonia;
  docData.resumen   = resumen;
  docData.texto_original = textoOrig || docData.texto_original;
  docData.viaIA     = true;
  // Metadatos de aprendizaje
  docData.ia_raw    = iaRaw;
  docData.usuario_aprobacion       = usuAprobacion;
  docData.aprendizaje_diff         = diff;
  docData.aprendizaje_campos_corregidos = camposCorregidos;
  // Timestamps
  docData.fechaGuardado = firebase.firestore.FieldValue.serverTimestamp();
  docData.fechaCaptura  = _ingestaFechaCaptura();
  docData.ts            = docData.ts || Date.now();

  db.collection('noticias-fase1').add(docData)
    .then(function() {
      INGESTA.aprobados++;
      INGESTA.cola.splice(idx, 1);
      _ingestaRemoverCard(tid);
      _ingestaActualizarContadores();
      var msg = camposCorregidos.length > 0
        ? '✓ Guardado · ' + camposCorregidos.length + ' correcciones registradas para Aprende'
        : '✓ Guardado sin correcciones';
      toast(msg, 'ok');
    })
    .catch(function(e) { toast('Error: ' + e.message, 'err'); });
};

// ─── Contadores ──────────────────────────────────────────────────────────────

function _ingestaActualizarContadores() {
  var elCola = document.getElementById('ingesta-cnt-cola');
  var elAprob = document.getElementById('ingesta-cnt-aprobados');
  var elDesc = document.getElementById('ingesta-cnt-descartados');
  var elBtnTodos = document.getElementById('ingesta-btn-aprobar-todos');
  if (elCola) elCola.textContent = INGESTA.cola.length;
  if (elAprob) elAprob.textContent = INGESTA.aprobados;
  if (elDesc) elDesc.textContent = INGESTA.descartados;
  if (elBtnTodos) elBtnTodos.textContent = '✓ APROBAR TODOS (' + INGESTA.cola.length + ')';
}

// ─── Render tab principal ────────────────────────────────────────────────────

window.ingestaRenderTab = function() {
  var sec = document.getElementById('sec-ingesta');
  if (!sec) return;

  // Si la tab ya está montada, solo refrescar datos sin re-renderizar
  if (document.getElementById('ingesta-cola')) {
    _ingestaActualizarContadores();
    ingestaRenderCola();
    return;
  }

  var html =
    '<div style="padding:12px 12px 120px 12px;max-width:960px;margin:0 auto;">' +

    // Cabecera
    '<div style="color:#0ff;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px;">📥 INGESTA MASIVA</div>' +

    // KPIs
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">' +
      _ingestaKpi('EN COLA', 'ingesta-cnt-cola', '#ff8c00') +
      _ingestaKpi('APROBADAS', 'ingesta-cnt-aprobados', '#0f8') +
      _ingestaKpi('DESCARTADAS', 'ingesta-cnt-descartados', '#f44') +
    '</div>' +

    // Sección: importar JSON
    '<div style="background:#0d0d1a;border:1px solid #1a1a2e;padding:12px;border-radius:4px;margin-bottom:14px;">' +
      '<div style="color:#0ff;font-size:12px;font-weight:700;margin-bottom:6px;">📂 IMPORTAR JSON</div>' +
      '<div style="font-size:10px;color:#555;margin-bottom:10px;">' +
        'Acepta: export de Firebase Console, array de noticias, o formato Firestore REST API' +
      '</div>' +
      '<label style="display:inline-block;background:#1a1a2e;border:1px solid #0ff;color:#0ff;' +
      'padding:7px 16px;font-size:11px;cursor:pointer;border-radius:3px;font-weight:700;">' +
        '📂 ELEGIR ARCHIVO JSON' +
        '<input type="file" accept=".json" onchange="ingestaCargarJSON(this)" style="display:none;">' +
      '</label>' +
      '<div id="ingesta-status" style="font-size:10px;color:#444;margin-top:8px;"></div>' +
    '</div>' +

    // Sección: scraping paginado
    '<div style="background:#0d0d1a;border:1px solid #1a1a2e;padding:12px;border-radius:4px;margin-bottom:14px;">' +
      '<div style="color:#0ff;font-size:12px;font-weight:700;margin-bottom:4px;">🕷 SCRAPING — TODAS LAS FUENTES RSS</div>' +
      '<div style="font-size:10px;color:#555;margin-bottom:10px;">' +
        'Rastrea todas las fuentes RSS disponibles · corsproxy.io + allorigins como fallback' +
      '</div>' +

      // Fila: selector de período
      '<div style="margin-bottom:8px;">' +
        '<div style="font-size:9px;color:#3a6a8a;letter-spacing:1px;margin-bottom:5px;">🗓 PERÍODO</div>' +
        '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">' +
          '<button class="ingesta-periodo-btn activo" onclick="ingestaSetMaxDias(7,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#0cf;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;font-weight:700;">7D</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaSetMaxDias(30,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#0cf;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">1M</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaSetMaxDias(90,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#0cf;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">3M</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaSetMaxDias(180,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#0cf;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">6M</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaSetMaxDias(365,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#0cf;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">1A</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaSetMaxDias(0,this)" ' +
          'style="background:#0d1a2a;border:1px solid #1a4a6a;color:#888;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">TODO</button>' +
          '<button class="ingesta-periodo-btn" onclick="ingestaToggleRango(this)" ' +
          'style="background:#0d1a2a;border:1px solid #3a4a1a;color:#aa0;padding:4px 9px;font-size:10px;cursor:pointer;border-radius:3px;">📅 RANGO</button>' +
          '<span id="ingesta-periodo-label" style="margin-left:4px;font-size:9px;color:#0066aa;font-family:monospace;">7 días</span>' +
        '</div>' +
      '</div>' +

      // Fila de rango de fechas (oculta hasta que se active)
      '<div id="ingesta-rango-row" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;' +
      'margin-bottom:8px;padding:8px;background:#0a1020;border:1px solid #2a3a1a;border-radius:3px;">' +
        '<span style="font-size:9px;color:#aa0;letter-spacing:1px;">DESDE</span>' +
        '<input type="date" id="ingesta-fecha-desde" ' +
        'style="background:#111;border:1px solid #3a4a1a;color:#cc0;padding:4px 6px;font-size:10px;border-radius:3px;">' +
        '<span style="font-size:9px;color:#aa0;letter-spacing:1px;">HASTA</span>' +
        '<input type="date" id="ingesta-fecha-hasta" ' +
        'style="background:#111;border:1px solid #3a4a1a;color:#cc0;padding:4px 6px;font-size:10px;border-radius:3px;">' +
        '<button onclick="ingestaAplicarRango()" ' +
        'style="background:#1a2a0a;border:1px solid #aa0;color:#cc0;padding:4px 10px;font-size:10px;cursor:pointer;border-radius:3px;font-weight:700;">APLICAR</button>' +
      '</div>' +

      // Botón disparador
      '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;">' +
        '<button onclick="ingestaScrapingPaginado()" id="ingesta-btn-scraping" ' +
        'style="background:#1a1a2e;border:1px solid #0ff;color:#0ff;padding:7px 18px;' +
        'font-size:11px;cursor:pointer;border-radius:3px;font-weight:700;">🕷 RASPAR TODAS LAS FUENTES</button>' +
      '</div>' +
      '<div id="ingesta-scraping-status" style="font-size:10px;color:#444;margin-top:8px;min-height:16px;"></div>' +
    '</div>' +

    // ── Sección: búsqueda web Google CSE ──────────────────────────
    '<div style="background:#0d0d1a;border:1px solid #1a2e1a;padding:12px;border-radius:4px;margin-bottom:14px;">' +
      '<div style="color:#0f8;font-size:12px;font-weight:700;margin-bottom:4px;">🔍 BÚSQUEDA WEB — GOOGLE</div>' +
      '<div style="font-size:10px;color:#555;margin-bottom:10px;">' +
        'Busca en los periódicos locales por palabras clave · 100 búsquedas/día gratis' +
      '</div>' +

      // Keywords predefinidas + campo libre
      '<div style="margin-bottom:8px;">' +
        '<div style="font-size:9px;color:#2a6a3a;letter-spacing:1px;margin-bottom:5px;">🏷 KEYWORDS RÁPIDAS</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">' +
          '<button onclick="ingestaBuscarWeb(\'balazos irapuato\',this)" class="ingesta-kw-btn">balazos</button>' +
          '<button onclick="ingestaBuscarWeb(\'ejecutan irapuato\',this)" class="ingesta-kw-btn">ejecutan</button>' +
          '<button onclick="ingestaBuscarWeb(\'homicidio irapuato\',this)" class="ingesta-kw-btn">homicidio</button>' +
          '<button onclick="ingestaBuscarWeb(\'asalto robo irapuato\',this)" class="ingesta-kw-btn">asalto/robo</button>' +
          '<button onclick="ingestaBuscarWeb(\'accidente vialidad irapuato\',this)" class="ingesta-kw-btn">accidente</button>' +
          '<button onclick="ingestaBuscarWeb(\'lesionados irapuato\",this)" class="ingesta-kw-btn">lesionados</button>' +
          '<button onclick="ingestaBuscarWeb(\'detenidos capturan irapuato\',this)" class="ingesta-kw-btn">detenidos</button>' +
          '<button onclick="ingestaBuscarWeb(\'disparo ataque irapuato\',this)" class="ingesta-kw-btn">disparos</button>' +
          '<button onclick="ingestaBuscarWeb(\'incendio irapuato\',this)" class="ingesta-kw-btn">incendio</button>' +
          '<button onclick="ingestaBuscarWeb(\'desaparecido irapuato\',this)" class="ingesta-kw-btn">desaparecido</button>' +
        '</div>' +
      '</div>' +

      // Campo libre
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">' +
        '<input id="ingesta-search-query" type="text" placeholder="Escribe términos de búsqueda..." ' +
        'style="flex:1;background:#111;border:1px solid #1a3a1a;color:#cfc;font-size:10px;padding:6px 8px;border-radius:3px;" ' +
        'onkeydown="if(event.key===\'Enter\')ingestaBuscarWeb(document.getElementById(\'ingesta-search-query\').value)">' +
        '<button onclick="ingestaBuscarWeb(document.getElementById(\'ingesta-search-query\').value)" ' +
        'style="background:#1a2e1a;border:1px solid #0f8;color:#0f8;padding:6px 14px;font-size:10px;cursor:pointer;border-radius:3px;font-weight:700;">🔍 BUSCAR</button>' +
      '</div>' +

      // Selector de período para búsqueda
      '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:6px;">' +
        '<span style="font-size:9px;color:#2a6a3a;">DESDE:</span>' +
        '<input type="date" id="ingesta-search-desde" ' +
        'style="background:#111;border:1px solid #1a3a1a;color:#8f8;padding:3px 6px;font-size:9px;border-radius:3px;">' +
        '<span style="font-size:9px;color:#2a6a3a;">HASTA:</span>' +
        '<input type="date" id="ingesta-search-hasta" ' +
        'style="background:#111;border:1px solid #1a3a1a;color:#8f8;padding:3px 6px;font-size:9px;border-radius:3px;">' +
        '<span id="ingesta-search-quota" style="margin-left:auto;font-size:8px;color:#2a5a2a;font-family:monospace;"></span>' +
      '</div>' +

      '<div id="ingesta-search-status" style="font-size:10px;color:#444;min-height:14px;"></div>' +
    '</div>' +

    // Cabecera cola + botones de acción
    '<div style="display:flex;justify-content:space-between;align-items:center;' +
    'margin-bottom:8px;flex-wrap:wrap;gap:6px;">' +
      '<div style="color:#0ff;font-size:12px;font-weight:700;">📋 COLA DE APROBACIÓN</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<button onclick="ingestaDescartarTodos()" ' +
        'style="background:rgba(255,34,85,.1);border:1px solid #f44;color:#f44;' +
        'padding:5px 12px;font-size:10px;cursor:pointer;border-radius:3px;">✗ DESCARTAR TODOS</button>' +
        '<button id="ingesta-btn-aprobar-todos" onclick="ingestaAprobarTodos()" ' +
        'style="background:rgba(0,255,136,.15);border:1px solid #0f8;color:#0f8;' +
        'padding:5px 14px;font-size:11px;cursor:pointer;border-radius:3px;font-weight:700;">' +
          '✓ APROBAR TODOS (' + INGESTA.cola.length + ')' +
        '</button>' +
      '</div>' +
    '</div>' +

    '<div id="ingesta-cola"></div>' +

    '</div>'; // fin padding con espacio inferior

  sec.innerHTML = html;
  _ingestaActualizarContadores();
  ingestaRenderCola();
};

function _ingestaKpi(label, elId, color) {
  return '<div style="background:#0d0d1a;border:1px solid #1a1a2e;padding:10px;border-radius:4px;text-align:center;">' +
    '<div id="' + elId + '" style="color:' + color + ';font-size:24px;font-weight:700;">0</div>' +
    '<div style="color:#444;font-size:10px;margin-top:2px;letter-spacing:.5px;">' + label + '</div>' +
    '</div>';
}

window.ingestaDescartarTodos = function() {
  INGESTA.descartados += INGESTA.cola.length;
  INGESTA.cola = [];
  ingestaRenderCola();
  _ingestaActualizarContadores();
};

// ─── Scraping paginado ───────────────────────────────────────────────────────

window.ingestaScrapingPaginado = function() {
  var btn = document.getElementById('ingesta-btn-scraping');
  var statusEl = document.getElementById('ingesta-scraping-status');
  // Para períodos largos (>30 días) se raspan más páginas automáticamente
  var nPaginas = ingestaMaxDias >= 180 ? 8 : ingestaMaxDias >= 90 ? 5 : ingestaMaxDias >= 30 ? 4 : 3;
  if (ingestaModoRango) nPaginas = 8; // rango calendario → máximo alcance

  if (INGESTA.importando) { toast('Scraping en curso, espera...', 'warn'); return; }
  INGESTA.importando = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Raspando...'; }
  if (statusEl) { statusEl.textContent = '⏳ Iniciando...'; statusEl.style.color = '#0ff'; }

  // Fuentes RSS paginables (las que tienen patrón de paginación URL)
  var FUENTES_PAGINADAS = [];
  if (typeof FUENTES_RSS !== 'undefined') {
    var claves = Object.keys(FUENTES_RSS);
    for (var ci = 0; ci < claves.length; ci++) {
      var src = FUENTES_RSS[claves[ci]];
      if (src && src.proxy && src.tipo === 'rss') {
        FUENTES_PAGINADAS.push({ nombre: src.nombre, proxy: src.proxy, tipo: src.tipo });
      }
    }
  }

  if (FUENTES_PAGINADAS.length === 0) {
    if (statusEl) { statusEl.textContent = '✗ No hay fuentes RSS configuradas'; statusEl.style.color = '#f44'; }
    INGESTA.importando = false;
    if (btn) { btn.disabled = false; btn.textContent = '🕷 RASPAR FUENTES'; }
    return;
  }

  var totalAgregados = 0;
  var fuenteIdx = 0;

  function procesarFuente() {
    if (fuenteIdx >= FUENTES_PAGINADAS.length) {
      // Terminado — siempre liberar el botón
      INGESTA.importando = false;
      if (btn) { btn.disabled = false; btn.textContent = '🕷 RASPAR FUENTES'; }
      if (statusEl) {
        statusEl.textContent = totalAgregados > 0
          ? '✓ ' + totalAgregados + ' noticias nuevas agregadas a la cola'
          : '⚠ Sin noticias nuevas — todas ya están en el corpus o las fuentes no respondieron';
        statusEl.style.color = totalAgregados > 0 ? '#0f8' : '#ff8c00';
      }
      ingestaRenderCola();
      _ingestaActualizarContadores();
      // Hacer scroll a la cola para que el usuario la vea
      setTimeout(function() {
        var colaEl = document.getElementById('ingesta-cola');
        if (colaEl) colaEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
      return;
    }
    var fuente = FUENTES_PAGINADAS[fuenteIdx];
    fuenteIdx++;
    if (statusEl) {
      statusEl.textContent = '⏳ ' + fuente.nombre + ' (' + fuenteIdx + '/' + FUENTES_PAGINADAS.length + ')...';
      statusEl.style.color = '#0ff';
    }

    var paginaIdx = 0;
    function procesarPagina() {
      if (paginaIdx >= nPaginas) { setTimeout(procesarFuente, 500); return; }
      paginaIdx++;

      // Extraer URL base del RSS desde el proxy configurado
      var proxyUrl = fuente.proxy;
      var urlBase = '';
      var m1 = proxyUrl.match(/raw\?url=(.+)/);
      var m2 = proxyUrl.match(/corsproxy\.io\/\?(.+)/);
      urlBase = m1 ? decodeURIComponent(m1[1]) : m2 ? decodeURIComponent(m2[1]) : proxyUrl;

      // Construir URL paginada
      var urlPaginada = urlBase;
      if (paginaIdx > 1) {
        urlPaginada = urlBase.indexOf('?') >= 0
          ? urlBase + '&paged=' + paginaIdx
          : urlBase + '?paged=' + paginaIdx;
      }

      // Pool unificado desde config.js — Apps Script primero, allorigins al final
      var proxies = (typeof proxyPool === 'function')
        ? proxyPool(urlPaginada)
        : [
            'https://script.google.com/macros/s/AKfycbyNA58J2fWoOqD9kUGqQ_KnPy-HFaNXwYFVYF0Op3jrgF0HaIJcGkGNqw4mpb7wDNSu2A/exec?url=' + encodeURIComponent(urlPaginada),
            'https://corsproxy.io/?' + encodeURIComponent(urlPaginada),
            'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(urlPaginada),
            'https://thingproxy.freeboard.io/fetch/' + urlPaginada,
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(urlPaginada)
          ];
      var pi = 0;

      function intentarProxy() {
        if (pi >= proxies.length) {
          // Todos los proxies fallaron — saltar esta página sin bloquear
          setTimeout(procesarPagina, 200);
          return;
        }
        var url = proxies[pi++];
        var abortado = false;
        var timeout = setTimeout(function() {
          abortado = true;
          intentarProxy(); // rotar al siguiente proxy
        }, 6000);

        fetch(url)
          .then(function(res) {
            clearTimeout(timeout);
            if (abortado) return;
            if (!res.ok) { intentarProxy(); return; }
            return res.text();
          })
          .then(function(txt) {
            if (abortado || !txt) return;
            if (txt.length < 100) { intentarProxy(); return; }
            if (txt.indexOf('<item') < 0 && txt.indexOf('<entry') < 0) {
              intentarProxy(); return;
            }
            var agregados = _ingestaParsearRSSTexto(txt, fuente.nombre);
            totalAgregados += agregados;
            if (statusEl) {
              statusEl.textContent = fuente.nombre + ' p.' + paginaIdx +
                ' +' + agregados + ' · total: ' + totalAgregados;
              statusEl.style.color = '#0ff';
            }
            setTimeout(procesarPagina, 500);
          })
          .catch(function() {
            clearTimeout(timeout);
            if (!abortado) intentarProxy();
          });
      }
      intentarProxy();
    }
    procesarPagina();
  }

  procesarFuente();
};

function _ingestaParsearRSSTexto(txt, nombreFuente) {
  var parser = new DOMParser();
  var xml = parser.parseFromString(txt, 'application/xml');
  var items = xml.querySelectorAll('item');
  var agregados = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var titulo = (item.querySelector('title') ? item.querySelector('title').textContent : '').trim();
    var desc = (item.querySelector('description') ? item.querySelector('description').textContent : '')
      .replace(/<[^>]*>/g, '').trim().slice(0, 400);
    var link = (item.querySelector('link') ? item.querySelector('link').textContent : '').trim();
    var fecha = (item.querySelector('pubDate') ? item.querySelector('pubDate').textContent : '').trim();

    // Filtro de período — descartar noticias fuera del rango configurado
    if (!ingestaNoticiaDentroDeRango(fecha)) continue;

    // Sprint 7: filtro policiaco — solo seguridad, accidente, crimen_organizado
    var TIPOS_INGESTA = ['seguridad', 'accidente', 'crimen_organizado', 'desaparecido'];
    var esPoliciaco = false;
    if (typeof clasificarLocal === 'function') {
      var tipoLocal = clasificarLocal(titulo + '. ' + desc).tipo;
      for (var ti2 = 0; ti2 < TIPOS_INGESTA.length; ti2++) {
        if (tipoLocal === TIPOS_INGESTA[ti2]) { esPoliciaco = true; break; }
      }
    } else {
      // Fallback: keywords básicos
      var kw = (titulo + ' ' + desc).toLowerCase();
      var KEYWORDS_POL = ['muerto','herido','balacera','robo','asalto','homicid','ejecut',
        'disparo','bala','detenido','captura','secuestr','extorsion','narco','cartel',
        'accidente','choque','volcadura','atropell','incendio','desaparecid','busca'];
      for (var ki = 0; ki < KEYWORDS_POL.length; ki++) {
        if (kw.indexOf(KEYWORDS_POL[ki]) >= 0) { esPoliciaco = true; break; }
      }
    }
    if (!esPoliciaco) continue;
    var esLocal = completo.indexOf('irapuato') >= 0 || completo.indexOf('silao') >= 0 ||
                  completo.indexOf('salamanca') >= 0 || completo.indexOf('guanajuato') >= 0;
    if (!esLocal) continue;

    // Deduplicar contra cola existente
    var dup = false;
    for (var ci = 0; ci < INGESTA.cola.length; ci++) {
      if (INGESTA.cola[ci].datos.titulo === titulo) { dup = true; break; }
    }
    // Deduplicar contra noticias ya aprobadas en Firestore
    if (!dup && typeof noticias !== 'undefined') {
      for (var ni = 0; ni < noticias.length; ni++) {
        if (noticias[ni].titulo === titulo) { dup = true; break; }
      }
    }
    if (dup) continue;

    // Clasificación local básica (sin IA) usando clasificarLocal si está disponible
    var norm;
    if (typeof clasificarLocal === 'function') {
      var local = clasificarLocal(titulo + '. ' + desc);
      norm = _ingestaNormalizarDoc({
        titulo: local.titulo || titulo,
        tipo: local.tipo,
        resumen: local.resumen || desc,
        fuente: nombreFuente,
        url: link,
        fecha_evento: _ingestaFechaDeRSS(fecha),
        confianza: 'media',
        lat: local.lat || 20.6795,
        lng: local.lng || -101.3540,
        texto_original: titulo + '. ' + desc
      });
    } else {
      norm = _ingestaNormalizarDoc({
        titulo: titulo, resumen: desc, fuente: nombreFuente,
        url: link, fecha_evento: _ingestaFechaDeRSS(fecha), confianza: 'media'
      });
    }

    INGESTA.cola.push({ id_temp: _ingestaId(), datos: norm });
    agregados++;
  }
  return agregados;
}

function _ingestaFechaDeRSS(pubDate) {
  if (!pubDate) return '';
  try {
    var d = new Date(pubDate);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
  } catch(e) { return ''; }
}

// ═══════════════════════════════════════════════════════════════
// BÚSQUEDA WEB — vía Google Apps Script (sin API key, sin facturación)
// El Apps Script hace fetch a Google Search y devuelve el HTML
// Este módulo parsea ese HTML para extraer títulos, URLs y snippets
// ═══════════════════════════════════════════════════════════════

var INGESTA_GAS_URL = 'https://script.google.com/macros/s/AKfycbyNA58J2fWoOqD9kUGqQ_KnPy-HFaNXwYFVYF0Op3jrgF0HaIJcGkGNqw4mpb7wDNSu2A/exec';
var _ingestaSearchUsado = 0;

window.ingestaBuscarWeb = function(query, btnEl) {
  if (!query || !query.trim()) { toast('Escribe un término de búsqueda', 'warn'); return; }
  query = query.trim();

  var statusEl = document.getElementById('ingesta-search-status');
  var quotaEl  = document.getElementById('ingesta-search-quota');
  var desdeEl  = document.getElementById('ingesta-search-desde');
  var hastaEl  = document.getElementById('ingesta-search-hasta');

  if (statusEl) { statusEl.textContent = '⏳ Buscando "' + query + '"...'; statusEl.style.color = '#0cf'; }
  if (btnEl) btnEl.disabled = true;

  var todosResultados = [];
  var paginasTotal    = 3;
  var paginaActual    = 0;

  function buscarPagina(start) {
    // Construir parámetros de fecha para Google Search (formato MM/DD/YYYY)
    var desdeParam = '';
    var hastaParam = '';
    if (desdeEl && desdeEl.value) {
      var dp = desdeEl.value.split('-');
      desdeParam = dp[1] + '/' + dp[2] + '/' + dp[0]; // YYYY-MM-DD → MM/DD/YYYY
    }
    if (hastaEl && hastaEl.value) {
      var hp = hastaEl.value.split('-');
      hastaParam = hp[1] + '/' + hp[2] + '/' + hp[0];
    }

    var gasUrl = INGESTA_GAS_URL +
      '?q='     + encodeURIComponent(query) +
      '&start=' + start +
      (desdeParam ? '&desde=' + encodeURIComponent(desdeParam) : '') +
      (hastaParam ? '&hasta=' + encodeURIComponent(hastaParam) : '');

    var abortado  = false;
    var timeoutId = setTimeout(function() {
      abortado = true;
      if (statusEl) { statusEl.textContent = '✗ Timeout — el Apps Script tardó demasiado'; statusEl.style.color = '#f44'; }
      if (btnEl) btnEl.disabled = false;
    }, 20000);

    fetch(gasUrl)
      .then(function(res) {
        clearTimeout(timeoutId);
        if (abortado) return null;
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(html) {
        if (!html) return;
        if (html.indexOf('error:') === 0) {
          if (statusEl) { statusEl.textContent = '✗ ' + html; statusEl.style.color = '#f44'; }
          if (btnEl) btnEl.disabled = false;
          return;
        }

        var resultados = _ingestaParseGoogleHTML(html);
        for (var i = 0; i < resultados.length; i++) todosResultados.push(resultados[i]);

        paginaActual++;
        _ingestaSearchUsado++;
        if (quotaEl) quotaEl.textContent = _ingestaSearchUsado + ' búsquedas esta sesión';

        if (statusEl) {
          statusEl.textContent = '⏳ Página ' + paginaActual + '/' + paginasTotal +
            ' · ' + todosResultados.length + ' resultados...';
        }

        if (paginaActual < paginasTotal && resultados.length >= 8) {
          setTimeout(function() { buscarPagina(start + 10); }, 1500);
        } else {
          _ingestaProcesarResultadosSearch(todosResultados, query, desdeEl, hastaEl, statusEl, btnEl);
        }
      })
      .catch(function(e) {
        clearTimeout(timeoutId);
        if (!abortado) {
          if (statusEl) { statusEl.textContent = '✗ Error: ' + e.message; statusEl.style.color = '#f44'; }
          if (btnEl) btnEl.disabled = false;
        }
      });
  }

  buscarPagina(1);
};

// Parsear HTML de Google Search y extraer resultados
function _ingestaParseGoogleHTML(html) {
  var resultados = [];
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  // Selectores de resultados orgánicos de Google
  // Google cambia su HTML frecuentemente — intentamos varios patrones
  var bloques = doc.querySelectorAll('div.g, div[data-sokoban-container], div.tF2Cxc, div.yuRUbf');

  if (bloques.length === 0) {
    // Fallback: buscar por estructura de links h3
    bloques = doc.querySelectorAll('div:has(> div > a > h3), div:has(h3)');
  }

  for (var i = 0; i < bloques.length && resultados.length < 15; i++) {
    var bloque = bloques[i];

    // Título
    var h3 = bloque.querySelector('h3');
    if (!h3) continue;
    var titulo = h3.textContent.trim();
    if (!titulo || titulo.length < 10) continue;

    // URL
    var linkEl = bloque.querySelector('a[href]');
    if (!linkEl) continue;
    var href = linkEl.getAttribute('href') || '';
    // Google envuelve URLs en /url?q=... — extraer la real
    var urlReal = href;
    var mUrl = href.match(/[?&]q=(https?[^&]+)/);
    if (mUrl) urlReal = decodeURIComponent(mUrl[1]);
    if (!urlReal || urlReal.indexOf('http') < 0) continue;
    // Filtrar URLs internas de Google
    if (urlReal.indexOf('google.com') >= 0) continue;

    // Snippet
    var snippetEl = bloque.querySelector('div.VwiC3b, span.aCOpRe, div[data-sncf], .s3v9rd, .st');
    var snippet   = snippetEl ? snippetEl.textContent.trim() : '';

    // Fecha aproximada del snippet (Google la muestra antes del texto a veces)
    var fechaPublicacion = '';
    var fechaEl = bloque.querySelector('span.MUxGbd, span.f, .LEwnzc span');
    if (fechaEl) {
      var fechaTxt = fechaEl.textContent.trim();
      // Intentar parsear "12 mar 2025" o "Mar 12, 2025"
      var dParsed = new Date(fechaTxt);
      if (!isNaN(dParsed.getTime())) {
        fechaPublicacion = dParsed.getDate() + '/' + (dParsed.getMonth()+1) + '/' + dParsed.getFullYear();
      }
    }

    resultados.push({
      title:   titulo,
      link:    urlReal,
      snippet: snippet,
      fecha:   fechaPublicacion
    });
  }

  // Si no encontró nada con selectores de clase, intentar extracción genérica
  if (resultados.length === 0) {
    var links = doc.querySelectorAll('a[href]');
    for (var li = 0; li < links.length && resultados.length < 15; li++) {
      var a = links[li];
      var h = a.querySelector('h3') || (a.parentElement && a.parentElement.querySelector('h3'));
      if (!h) continue;
      var t = h.textContent.trim();
      if (!t || t.length < 10) continue;
      var u = a.getAttribute('href') || '';
      var mu = u.match(/[?&]q=(https?[^&]+)/);
      if (mu) u = decodeURIComponent(mu[1]);
      if (!u || u.indexOf('http') < 0 || u.indexOf('google.com') >= 0) continue;
      resultados.push({ title: t, link: u, snippet: '', fecha: '' });
    }
  }

  return resultados;
}

function _ingestaProcesarResultadosSearch(items, query, desdeEl, hastaEl, statusEl, btnEl) {
  if (btnEl) btnEl.disabled = false;

  var desdeMs = desdeEl && desdeEl.value ? new Date(desdeEl.value).getTime() : 0;
  var hastaMs = hastaEl && hastaEl.value ? new Date(hastaEl.value + 'T23:59:59').getTime() : 0;

  var agregados = 0;
  var filtradas = 0;

  for (var i = 0; i < items.length; i++) {
    var item    = items[i];
    var titulo  = (item.title   || '').trim();
    var url     = (item.link    || '').trim();
    var snippet = (item.snippet || '').trim();
    var fechaPublicacion = item.fecha || '';

    if (!titulo || !url) continue;

    // Filtro de fecha si está definido y el item tiene fecha
    if (fechaPublicacion && (desdeMs || hastaMs)) {
      var partes = fechaPublicacion.split('/');
      if (partes.length === 3) {
        var fechaMs = new Date(
          parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0])
        ).getTime();
        if (desdeMs && fechaMs < desdeMs) { filtradas++; continue; }
        if (hastaMs && fechaMs > hastaMs) { filtradas++; continue; }
      }
    }

    // Deduplicar contra cola y corpus
    var dup = false;
    for (var ci = 0; ci < INGESTA.cola.length; ci++) {
      if (INGESTA.cola[ci].datos.url === url || INGESTA.cola[ci].datos.titulo === titulo) {
        dup = true; break;
      }
    }
    if (!dup && typeof noticias !== 'undefined') {
      for (var ni = 0; ni < noticias.length; ni++) {
        if (noticias[ni].url === url || noticias[ni].titulo === titulo) {
          dup = true; break;
        }
      }
    }
    if (dup) continue;

    // Clasificación local
    var norm;
    if (typeof clasificarLocal === 'function') {
      var local = clasificarLocal(titulo + '. ' + snippet);
      norm = _ingestaNormalizarDoc({
        titulo:         local.titulo || titulo,
        tipo:           local.tipo,
        resumen:        local.resumen || snippet,
        fuente:         _ingestaFuenteDeURL(url),
        url:            url,
        fecha_evento:   fechaPublicacion,
        confianza:      'media',
        texto_original: titulo + '. ' + snippet
      });
    } else {
      norm = _ingestaNormalizarDoc({
        titulo: titulo, resumen: snippet,
        fuente: _ingestaFuenteDeURL(url),
        url: url, fecha_evento: fechaPublicacion, confianza: 'media'
      });
    }

    INGESTA.cola.push({ id_temp: _ingestaId(), datos: norm });
    agregados++;
  }

  if (statusEl) {
    statusEl.textContent = agregados > 0
      ? '✓ ' + agregados + ' resultados agregados a la cola' +
        (filtradas > 0 ? ' · ' + filtradas + ' fuera de rango de fecha' : '')
      : '⚠ Sin resultados nuevos para "' + query + '"' +
        (filtradas > 0 ? ' (' + filtradas + ' fuera de rango)' : '') +
        ' — Google puede estar bloqueando el scraping temporalmente, intenta en unos minutos';
    statusEl.style.color = agregados > 0 ? '#0f8' : '#ff8c00';
  }

  if (agregados > 0) {
    ingestaRenderCola();
    _ingestaActualizarContadores();
    setTimeout(function() {
      var colaEl = document.getElementById('ingesta-cola');
      if (colaEl) colaEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }
}

function _ingestaFuenteDeURL(url) {
  var mapa = {
    'oem.com.mx':              'El Sol de Irapuato',
    'am.com.mx':               'AM Irapuato',
    'periodicocorreo.com.mx':  'Periódico Correo',
    'entintanegra.com':        'Tinta Negra',
    'lasillarota.com':         'La Silla Rota',
    'zonafranca.mx':           'Zona Franca'
  };
  var claves = Object.keys(mapa);
  for (var i = 0; i < claves.length; i++) {
    if (url.indexOf(claves[i]) >= 0) return mapa[claves[i]];
  }
  // Extraer dominio genérico
  var m = url.match(/https?:\/\/(?:www\.)?([^\/]+)/);
  return m ? m[1] : 'Web';
}
