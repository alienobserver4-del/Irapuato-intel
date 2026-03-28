/**
 * calles.js — Sprint 7: Base interna de calles con sinónimos
 * Irapuato Intel · 4Alien
 *
 * NO es para ejecución directa del mapa — es una base de conocimiento
 * que auto-nutre el posicionamiento IA cuando no hay coords disponibles.
 *
 * Colección Firestore: 'calles-irapuato'
 * Documento: { calle_id, nombre_oficial, sinonimos[], lat, lng, hits, colonia, ageb }
 *
 * API pública:
 *   callesInit()                  — carga desde Firestore al inicio
 *   callesLookup(texto)           → { lat, lng, colonia, nombre_oficial } | null
 *   callesNormalizar(texto)       → string normalizado para búsqueda
 *   callesRegistrar(calle, lat, lng, colonia) — aprender nueva calle confirmada
 *   callesAgregarSinonimo(calle_id, sinonimo) — vincular variante de nombre
 *   callesRenderPanel()           — panel de gestión en tab Aprende
 *   CALLES                        — objeto de estado global
 */

var CALLES = {
  data: {},      // { clave_normalizada: { nombre_oficial, sinonimos[], lat, lng, hits, colonia } }
  loaded: false,
  pendientes: [] // sinónimos detectados automáticamente esperando confirmación
};

// ─── Normalización ───────────────────────────────────────────────────────────

window.callesNormalizar = function(texto) {
  if (!texto) return '';
  return texto.toLowerCase().trim()
    // Quitar acentos
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    // Abreviaturas comunes
    .replace(/\bblvd\.?\b/g,'boulevard').replace(/\bbulevar\b/g,'boulevard')
    .replace(/\bav\.?\b/g,'avenida').replace(/\bave\.?\b/g,'avenida')
    .replace(/\bcal\.?\b/g,'calle').replace(/\bclle\.?\b/g,'calle')
    .replace(/\bcarr\.?\b/g,'carretera').replace(/\bcrr\.?\b/g,'carretera')
    .replace(/\bprol\.?\b/g,'prolongacion').replace(/\bprolog\.?\b/g,'prolongacion')
    .replace(/\bfracc\.?\b/g,'fraccionamiento').replace(/\bcol\.?\b/g,'colonia')
    // Quitar puntuación y espacios extra
    .replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
};

function _callesId(texto) {
  return callesNormalizar(texto).replace(/\s+/g,'-').slice(0, 80);
}

// ─── Carga desde Firestore ───────────────────────────────────────────────────

window.callesInit = function() {
  if (!db) return;
  db.collection('calles-irapuato').limit(500).get()
    .then(function(snap) {
      snap.forEach(function(doc) {
        var d = doc.data();
        // Indexar por nombre oficial normalizado
        var claveOficial = _callesId(d.nombre_oficial || doc.id);
        CALLES.data[claveOficial] = {
          id: doc.id,
          nombre_oficial: d.nombre_oficial || doc.id,
          sinonimos: Array.isArray(d.sinonimos) ? d.sinonimos : [],
          lat: d.lat || 0,
          lng: d.lng || 0,
          hits: d.hits || 1,
          colonia: d.colonia || ''
        };
        // También indexar por cada sinónimo normalizado
        var sinos = Array.isArray(d.sinonimos) ? d.sinonimos : [];
        for (var si = 0; si < sinos.length; si++) {
          var claveSino = _callesId(sinos[si]);
          if (claveSino && claveSino !== claveOficial) {
            CALLES.data[claveSino] = CALLES.data[claveOficial]; // apunta al mismo objeto
          }
        }
      });
      CALLES.loaded = true;
      console.log('[Calles] ' + Object.keys(CALLES.data).length + ' entradas cargadas');
    })
    .catch(function(e) {
      console.warn('[Calles] Error cargando:', e.message);
    });
};

// ─── Lookup: dado un texto, buscar coords ────────────────────────────────────

window.callesLookup = function(texto) {
  if (!texto || !CALLES.loaded) return null;
  var clave = _callesId(texto);
  if (!clave) return null;

  // Búsqueda exacta
  if (CALLES.data[clave] && CALLES.data[clave].lat) return CALLES.data[clave];

  // Búsqueda parcial — buscar si alguna clave contiene el texto buscado
  var claves = Object.keys(CALLES.data);
  for (var i = 0; i < claves.length; i++) {
    if (claves[i].indexOf(clave) >= 0 || clave.indexOf(claves[i]) >= 0) {
      if (CALLES.data[claves[i]] && CALLES.data[claves[i]].lat) {
        return CALLES.data[claves[i]];
      }
    }
  }
  return null;
};

// Buscar por calle + colonia combinados
window.callesLookupCompleto = function(calle, colonia) {
  var r = callesLookup(calle);
  if (r) return r;
  // Intentar también solo colonia si no hay calle
  if (!calle && colonia) return callesLookup(colonia);
  return null;
};

// ─── Registrar nueva calle confirmada ────────────────────────────────────────

window.callesRegistrar = function(calle, lat, lng, colonia) {
  if (!calle || !lat || !lng) return;
  if (!db) return;

  var id = _callesId(calle);
  if (!id) return;

  // Si ya existe, solo actualizar hits y coords (promedio ponderado)
  if (CALLES.data[id]) {
    var existing = CALLES.data[id];
    existing.hits = (existing.hits || 1) + 1;
    existing.lat = (existing.lat * (existing.hits - 1) + lat) / existing.hits;
    existing.lng = (existing.lng * (existing.hits - 1) + lng) / existing.hits;
    if (colonia && !existing.colonia) existing.colonia = colonia;

    db.collection('calles-irapuato').doc(existing.id || id).set({
      nombre_oficial: existing.nombre_oficial,
      sinonimos: existing.sinonimos,
      lat: existing.lat,
      lng: existing.lng,
      colonia: existing.colonia,
      hits: existing.hits,
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return;
  }

  // Nueva entrada
  var nueva = {
    nombre_oficial: calle.trim(),
    sinonimos: [],
    lat: lat,
    lng: lng,
    colonia: colonia || '',
    hits: 1,
    creado: firebase.firestore.FieldValue.serverTimestamp()
  };

  db.collection('calles-irapuato').doc(id).set(nueva)
    .then(function() {
      CALLES.data[id] = { id: id, nombre_oficial: calle.trim(), sinonimos: [], lat: lat, lng: lng, hits: 1, colonia: colonia || '' };
      console.log('[Calles] Nueva calle registrada:', calle);
    })
    .catch(function(e) { console.warn('[Calles] Error registrando:', e.message); });
};

// ─── Agregar sinónimo ────────────────────────────────────────────────────────

window.callesAgregarSinonimo = function(calleIdONombre, sinonimo) {
  if (!sinonimo) return;
  var id = _callesId(calleIdONombre);
  var entrada = CALLES.data[id];
  if (!entrada) { toast('Calle no encontrada: ' + calleIdONombre, 'err'); return; }

  // Evitar duplicado
  var sinoNorm = callesNormalizar(sinonimo);
  for (var si = 0; si < entrada.sinonimos.length; si++) {
    if (callesNormalizar(entrada.sinonimos[si]) === sinoNorm) return;
  }

  entrada.sinonimos.push(sinonimo.trim());

  // Indexar el sinónimo en memoria
  var claveSino = _callesId(sinonimo);
  CALLES.data[claveSino] = entrada;

  // Guardar en Firestore
  if (db) {
    db.collection('calles-irapuato').doc(entrada.id || id).update({
      sinonimos: entrada.sinonimos,
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(e) { console.warn('[Calles] Error guardando sinónimo:', e.message); });
  }
  toast('Sinónimo "' + sinonimo + '" vinculado a ' + entrada.nombre_oficial, 'ok');
};

// ─── Detección automática de sinónimos ───────────────────────────────────────
// Cuando dos nombres distintos terminan en el mismo punto geográfico (<50m)
// se detectan como posibles sinónimos y se guardan como pendientes

window.callesDetectarSinonimo = function(nombre, lat, lng) {
  if (!nombre || !lat || !lng) return;
  var umbral = 0.0005; // ~50m
  var claves = Object.keys(CALLES.data);
  for (var i = 0; i < claves.length; i++) {
    var e = CALLES.data[claves[i]];
    if (!e || !e.lat) continue;
    if (e.nombre_oficial === nombre) continue;
    var dlat = Math.abs(e.lat - lat);
    var dlng = Math.abs(e.lng - lng);
    if (dlat < umbral && dlng < umbral) {
      // Posible sinónimo — agregar a pendientes si no está ya
      var ya = false;
      for (var pi = 0; pi < CALLES.pendientes.length; pi++) {
        if (CALLES.pendientes[pi].nombre === nombre) { ya = true; break; }
      }
      if (!ya) {
        CALLES.pendientes.push({
          nombre: nombre,
          oficial: e.nombre_oficial,
          lat: lat, lng: lng,
          detectado: new Date().toISOString()
        });
      }
      return;
    }
  }
};

// ─── Panel de gestión en tab Aprende ─────────────────────────────────────────

window.callesRenderPanel = function() {
  var contenedor = document.getElementById('apr-calles');
  if (!contenedor) return;

  var claves = Object.keys(CALLES.data);
  // Deduplicar (sinónimos apuntan al mismo objeto)
  var vistos = {};
  var unicas = [];
  for (var i = 0; i < claves.length; i++) {
    var e = CALLES.data[claves[i]];
    if (!e || !e.nombre_oficial) continue;
    var key = e.nombre_oficial;
    if (!vistos[key]) { vistos[key] = true; unicas.push(e); }
  }
  unicas.sort(function(a,b){ return (b.hits||1) - (a.hits||1); });

  if (unicas.length === 0) {
    contenedor.innerHTML = '<div style="color:#2a4a6a;font-size:8px;padding:4px;">Sin calles registradas aún. Se nutren automáticamente al aprobar noticias con calle + coordenadas.</div>';
    return;
  }

  var html = '<div style="font-size:9px;color:#444;margin-bottom:8px;">' + unicas.length + ' calles · ' + CALLES.pendientes.length + ' sinónimos detectados pendientes</div>';

  // Sinónimos pendientes de confirmación
  if (CALLES.pendientes.length > 0) {
    html += '<div style="background:rgba(255,200,0,.06);border:1px solid #ffc80033;padding:8px;border-radius:4px;margin-bottom:10px;">';
    html += '<div style="font-size:9px;color:#ffc800;font-weight:700;margin-bottom:6px;">⚡ SINÓNIMOS DETECTADOS AUTOMÁTICAMENTE</div>';
    for (var pi = 0; pi < Math.min(CALLES.pendientes.length, 5); pi++) {
      var p = CALLES.pendientes[pi];
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:9px;">' +
        '<span style="color:#aaa;">"' + p.nombre + '"</span>' +
        '<span style="color:#444;">→ mismo punto que</span>' +
        '<span style="color:#0ff;">"' + p.oficial + '"</span>' +
        '<button onclick="callesAgregarSinonimo(\'' + p.oficial.replace(/'/g,"\\'") + '\',\'' + p.nombre.replace(/'/g,"\\'") + '\');CALLES.pendientes.splice(' + pi + ',1);callesRenderPanel();" ' +
        'style="background:rgba(0,255,136,.1);border:1px solid #0f8;color:#0f8;font-size:9px;padding:2px 7px;cursor:pointer;border-radius:2px;">✓ VINCULAR</button>' +
        '<button onclick="CALLES.pendientes.splice(' + pi + ',1);callesRenderPanel();" ' +
        'style="background:none;border:1px solid #f4466;color:#f44;font-size:9px;padding:2px 7px;cursor:pointer;border-radius:2px;">✗</button>' +
        '</div>';
    }
    html += '</div>';
  }

  // Lista de calles conocidas
  html += '<div style="font-size:9px;color:#3a5a7a;margin-bottom:4px;">// CALLES CONOCIDAS (top 20 por frecuencia)</div>';
  var top = unicas.slice(0, 20);
  for (var ti = 0; ti < top.length; ti++) {
    var e = top[ti];
    html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #0d2040;flex-wrap:wrap;">' +
      '<span style="font-family:monospace;font-size:9px;color:#c0e8ff;flex:1;">' + e.nombre_oficial + '</span>' +
      '<span style="font-size:8px;color:#3a5a7a;">' + e.hits + ' usos</span>' +
      (e.sinonimos.length > 0
        ? '<span style="font-size:8px;color:#555;">' + e.sinonimos.join(', ') + '</span>'
        : '') +
      '<span style="font-size:7px;color:#2a3a4a;">' + (e.lat ? e.lat.toFixed(4) + ',' + e.lng.toFixed(4) : 'sin coords') + '</span>' +
    '</div>';
  }

  // Campo para agregar sinónimo manualmente
  html += '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">' +
    '<input id="calles-add-oficial" placeholder="Nombre oficial" ' +
    'style="flex:1;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;font-size:9px;padding:4px 6px;border-radius:3px;">' +
    '<input id="calles-add-sino" placeholder="Sinónimo a vincular" ' +
    'style="flex:1;background:#060d18;border:1px solid #1a2a3a;color:#c0e8ff;font-size:9px;padding:4px 6px;border-radius:3px;">' +
    '<button onclick="_callesAgregarManual()" ' +
    'style="background:rgba(0,200,255,.1);border:1px solid #0cf;color:#0cf;font-size:9px;padding:4px 10px;cursor:pointer;border-radius:3px;">+ VINCULAR</button>' +
    '</div>';

  contenedor.innerHTML = html;
};

window._callesAgregarManual = function() {
  var ofi = document.getElementById('calles-add-oficial');
  var sino = document.getElementById('calles-add-sino');
  if (!ofi || !sino || !ofi.value.trim() || !sino.value.trim()) {
    toast('Rellena ambos campos', 'warn'); return;
  }
  callesAgregarSinonimo(ofi.value.trim(), sino.value.trim());
  ofi.value = ''; sino.value = '';
  setTimeout(callesRenderPanel, 300);
};
