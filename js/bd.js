// ═══════════════════════════════════════════════════════════════
// BD.JS — Base de datos, corpus, aprendizaje, buscador predictivo
// IRA INTEL v4.3 — Hotfix coords manuales (22-Mar-2026)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// INIT FIREBASE
// ═══════════════════════════════════════════════════════════════

function escucharBD() {
  if (!db) return;
  // Sin orderBy en Firestore — evita el bug de Firebase SDK 8.10.x donde
  // serverTimestamp + orderBy causa loop infinito (oi→gy→yy) al escribir desde móvil.
  // El orden se aplica localmente después de recibir los datos.
  db.collection('noticias-fase1').onSnapshot(
    { includeMetadataChanges: false },
    function(snap) {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      noticias = snap.docs.map(function(d) {
        var o = d.data();
        o.id = d.id;
        return o;
      });
      // Orden descendente por ts (nuevo) o fechaGuardado.seconds (legado)
      noticias.sort(function(a, b) {
        var ta = a.ts || (a.fechaGuardado && a.fechaGuardado.seconds ? a.fechaGuardado.seconds * 1000 : 0);
        var tb = b.ts || (b.fechaGuardado && b.fechaGuardado.seconds ? b.fechaGuardado.seconds * 1000 : 0);
        return tb - ta;
      });
      if (typeof analisisInvalidar === 'function') analisisInvalidar();
      renderBD();
      actualizarBadge();
      if (typeof dataOnNoticiasCambiaron === 'function') dataOnNoticiasCambiaron();
      if (mapaIniciado) renderMapa();
      if (intelIniciado) renderIntel();
      if (gobMapaIniciado) renderGobMapaMarkers();
      renderGobNoticias();
    },
    function(err) { console.warn('[BD] onSnapshot error:', err.message); }
  );
}

// Auto-completar colonia al salir del campo calle
// Si se ingresa calle2, busca la interseccion de ambas (mas preciso)
function autoColonia(id) {
  var cal1El = document.getElementById(id + '-cal1');
  var cal2El = document.getElementById(id + '-cal2');
  var colEl = document.getElementById(id + '-col');
  if (!cal1El || !colEl || !cal1El.value.trim()) return;
  var cal1 = cal1El.value.trim();
  var cal2 = cal2El ? cal2El.value.trim() : '';
  // Si hay calle2, buscar la interseccion para mayor precision
  var query = cal2
    ? 'intersection of ' + cal1 + ' and ' + cal2 + ' Irapuato Guanajuato Mexico'
    : cal1 + ' Irapuato Guanajuato Mexico';
  _geocodificarColonia(query, function(colonia) {
    if (colonia && colEl && !colEl.value.trim()) colEl.value = colonia;
  });
}
window.autoColonia = autoColonia;

// Geocodificar colonia a partir de dirección
function _geocodificarColonia(query, callback) {
  var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) +
    '&format=json&addressdetails=1&limit=1&bounded=1&viewbox=-101.60,20.45,-101.10,20.85&countrycodes=mx';
  fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'IrapuatoIntel/1.0' } })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data[0] && data[0].address) {
      var addr = data[0].address;
      var colonia = addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || addr.city_district || '';
      if (!colonia && addr.city) {
        colonia = (addr.road ? addr.road + ', ' : '') + (addr.municipality ? addr.municipality : '');
      }
      callback(colonia.trim());
    } else {
      // Segundo intento sin bounded para carreteras interurbanas
      var url2 = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) +
        '&format=json&addressdetails=1&limit=1&countrycodes=mx';
      fetch(url2, { headers: { 'Accept-Language': 'es', 'User-Agent': 'IrapuatoIntel/1.0' } })
      .then(function(r2) { return r2.json(); })
      .then(function(data2) {
        if (data2 && data2[0] && data2[0].address) {
          var a2 = data2[0].address;
          var col2 = a2.suburb || a2.neighbourhood || a2.village || a2.hamlet || a2.city_district || '';
          callback(col2.trim());
        } else { callback(''); }
      })
      .catch(function() { callback(''); });
    }
  })
  .catch(function() { callback(''); });
}


function analizarConIA(id, texto, fuente, link) {
  var proc = document.getElementById(id + '-proc');
  var edit = document.getElementById(id + '-edit');
  if (proc) { proc.className = 'nc-procesando visible'; }
  if (edit) { edit.className = 'nc-edit'; }

  llamarIA(buildPrompt(texto), function(r, err) {
    if (proc) proc.className = 'nc-procesando';
    if (!r) {
      r = clasificarLocal(texto);
      toast('IA no disponible — clasificación local', 'warn');
    }
    // Actualizar badge de tipo
    var badge = document.getElementById(id + '-tipo-badge');
    if (badge) { badge.className = 'nc-tipo ' + (r.tipo||'rumor'); badge.textContent = (r.tipo||'rumor').toUpperCase(); }

    var lugarEl = document.getElementById(id + '-lugar');
    if (lugarEl) lugarEl.textContent = '📍 ' + (r.lugar||'');

    var confEl = document.getElementById(id + '-conf');
    if (confEl) {
      confEl.className = 'nc-conf-' + (r.confianza||'baja');
      confEl.textContent = '▲ ' + (r.confianza||'baja').toUpperCase();
    }

    var resEl = document.getElementById(id + '-res');
    if (resEl && r.resumen) {
      // Si es un textarea editable, usar .value; si es div, usar textContent
      if (resEl.tagName === 'TEXTAREA') {
        resEl.value = r.resumen;
      } else {
        resEl.textContent = r.resumen;
      }
    }
    // Sprint 7: también rellenar textarea editable de resumen si existe
    var resEditEl = document.getElementById(id + '-res-edit');
    if (resEditEl && r.resumen) resEditEl.value = r.resumen;

    // Rellenar campos editables
    var titEl = document.getElementById(id + '-tit');
    if (titEl) {
      if (r.titulo === 'SIN CONTENIDO') {
        var card = document.getElementById(id);
        if (card) card.style.opacity = '0.5';
        var confEl2 = document.getElementById(id + '-conf');
        if (confEl2) { confEl2.textContent = '⚠ TEXTO NO VÁLIDO'; confEl2.style.color = '#ff8800'; }
        titEl.value = 'SIN CONTENIDO — descarta esta tarjeta';
      } else if (r.titulo && r.titulo.length < 120) {
        titEl.value = r.titulo;
      } else if (r.resumen) {
        titEl.value = r.resumen.split('.')[0].trim();
      }
    }

    var cal1El = document.getElementById(id + '-cal1');
    if (cal1El && r.calle) cal1El.value = r.calle;
    var cal2El = document.getElementById(id + '-cal2');
    if (cal2El && r.calle2) cal2El.value = r.calle2;
    var fevEl = document.getElementById(id + '-fev');
    if (fevEl && r.fecha_evento) fevEl.value = r.fecha_evento;
    var nomEl = document.getElementById(id + '-nom');
    if (nomEl && r.nombres) nomEl.value = r.nombres;
    var comEl = document.getElementById(id + '-com');
    if (comEl && r.comunidad) comEl.value = r.comunidad;

    // Tipo en select
    var tipoEl = document.getElementById(id + '-tipo');
    if (tipoEl && r.tipo) {
      tipoEl.value = r.tipo;
      // Sprint 7: activar subtipo si tipo = seguridad
      if (typeof subtipoSegOnTipoCambio === 'function') subtipoSegOnTipoCambio(id, r.tipo);
    }

    // tiempo_dia
    var tdiaEl = document.getElementById(id + '-tdia');
    if (tdiaEl && r.tiempo_dia) tdiaEl.value = r.tiempo_dia;

    // subtipo_seguridad si la IA lo propone
    if (r.subtipo_seguridad) {
      var subtipoEl = document.getElementById('subtipo-seg-' + id);
      if (subtipoEl) subtipoEl.value = r.subtipo_seguridad;
    }

    // Colonia — si la IA la tiene, usarla; si no, geocodificar
    var colEl = document.getElementById(id + '-col');
    if (colEl && r.colonia) {
      colEl.value = r.colonia;
    } else if ((r.calle || r.calle2) && colEl && !colEl.value.trim()) {
      var qc = r.calle2
        ? 'intersection of ' + r.calle + ' and ' + r.calle2 + ' Irapuato Guanajuato Mexico'
        : (r.calle || '') + ' Irapuato Guanajuato Mexico';
      _geocodificarColonia(qc, function(col) { if (col && colEl) colEl.value = col; });
    }

    // Guardar contexto IA en dataset para aprendizaje
    var card = document.getElementById(id);
    if (card) {
      card.dataset.ia_tematica   = JSON.stringify(r.tematica   || []);
      card.dataset.ia_verbos     = JSON.stringify(r.verbos     || []);
      card.dataset.ia_sustantivos= JSON.stringify(r.sustantivos|| []);
    }

    // Guardar lat/lng si la IA los da
    if (r.lat && r.lng && card) {
      card.dataset.lat = r.lat;
      card.dataset.lng = r.lng;
    }

    var edit2 = document.getElementById(id + '-edit');
    if (edit2) edit2.className = 'nc-edit visible';

    // Guardar ia_raw en dataset para diff posterior
    if (card) card.dataset.ia_raw = JSON.stringify(r);
  });
}
window.analizarConIA = analizarConIA;

// ═══════════════════════════════════════════════════════════════
// APROBAR CARD
// ═══════════════════════════════════════════════════════════════

function aprobarCard(id, fuente, link) {
  if (typeof db === 'undefined' || !db) { toast('Firebase no disponible — verifica conexión', 'err'); return; }

  var card = document.getElementById(id);
  if (!card) { toast('Tarjeta no encontrada', 'err'); return; }

  var tit   = document.getElementById(id + '-tit');
  var tipo  = document.getElementById(id + '-tipo');
  var cal1  = document.getElementById(id + '-cal1');
  var cal2  = document.getElementById(id + '-cal2');
  var col   = document.getElementById(id + '-col');
  var com   = document.getElementById(id + '-com');
  var nom   = document.getElementById(id + '-nom');
  var fev   = document.getElementById(id + '-fev');
  var tdia  = document.getElementById(id + '-tdia');
  var res   = document.getElementById(id + '-res');
  var conf  = document.getElementById(id + '-conf');
  // Sprint 7: también leer resumen de textarea si existe (entrada manual)
  var resTA = document.getElementById(id + '-res-edit');

  var lat = parseFloat(card.dataset.lat) || 0;
  var lng = parseFloat(card.dataset.lng) || 0;
  // Sprint 7: no usar centro como fallback — si no hay coords reales, dejar null
  var latValida = lat && Math.abs(lat - 20.6795) > 0.001;
  var lngValida = lng && Math.abs(lng - (-101.3540)) > 0.001;
  if (!latValida) lat = null;
  if (!lngValida) lng = null;

  var ia_raw = null;
  try { ia_raw = card.dataset.ia_raw ? JSON.parse(card.dataset.ia_raw) : null; } catch(e) {}

  var usuario_aprobacion = {
    tipo:         tipo  ? tipo.value  : 'rumor',
    titulo:       tit   ? tit.value   : '',
    calle:        cal1  ? cal1.value.trim()  : '',
    calle2:       cal2  ? cal2.value.trim()  : '',
    colonia:      col   ? col.value.trim()   : '',
    comunidad:    com   ? com.value.trim()   : '',
    nombres:      nom   ? nom.value.trim()   : '',
    fecha_evento: fev   ? fev.value.trim()   : '',
    tiempo_dia:   tdia  ? tdia.value  : 'desconocido',
    resumen:      resTA ? resTA.value.trim() : (res ? res.textContent.trim() : ''),
    confianza:    conf  ? (conf.className.replace('nc-conf-','')) : 'baja',
    subtipo_seguridad: (typeof subtipoSegLeer === 'function') ? subtipoSegLeer(id) : ''
  };

  // Calcular diff IA vs usuario
  var aprendizaje_diff = {};
  var aprendizaje_campos_corregidos = [];
  if (ia_raw) {
    Object.keys(usuario_aprobacion).forEach(function(k) {
      var iaVal  = (ia_raw[k] || '').toString().trim();
      var usrVal = (usuario_aprobacion[k] || '').toString().trim();
      if (iaVal !== usrVal) {
        aprendizaje_diff[k] = { ia: iaVal, usuario: usrVal };
        aprendizaje_campos_corregidos.push(k);
      }
    });
  }

  var noticia = {
    tipo:         usuario_aprobacion.tipo,
    tipo2:        card.dataset.tipo2 || '',
    subtipo_seguridad: usuario_aprobacion.subtipo_seguridad || '',
    titulo:       usuario_aprobacion.titulo,
    titulo_real:  card.dataset.titulo_real || usuario_aprobacion.titulo,
    lugar:        (usuario_aprobacion.calle || '') + (usuario_aprobacion.colonia ? ', ' + usuario_aprobacion.colonia : ''),
    calle:        usuario_aprobacion.calle,
    calle2:       usuario_aprobacion.calle2,
    colonia:      usuario_aprobacion.colonia,
    comunidad:    usuario_aprobacion.comunidad,
    nombres:      usuario_aprobacion.nombres,
    fecha_evento: usuario_aprobacion.fecha_evento,
    fecha_publicacion: card.dataset.fecha_publicacion || '',
    tiempo_dia:   usuario_aprobacion.tiempo_dia,
    resumen:      usuario_aprobacion.resumen,
    fuente:       fuente || fuenteManual || 'Desconocida',
    url:          link   || (document.getElementById('fb-url') ? document.getElementById('fb-url').value.trim() : '') || '',
    lat:          lat,
    lng:          lng,
    confianza:    usuario_aprobacion.confianza,
    ts:           Date.now(),
    fechaGuardado: firebase.firestore.FieldValue.serverTimestamp(),
    fechaCaptura:  (function() {
      var d = new Date();
      return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear() + ' ' + d.getHours() + ':' + (d.getMinutes()<10?'0':'')+d.getMinutes();
    })(),
    viaIA:        !!ia_raw,
    ia_raw:       ia_raw,
    usuario_aprobacion: usuario_aprobacion,
    aprendizaje_diff:   aprendizaje_diff,
    aprendizaje_campos_corregidos: aprendizaje_campos_corregidos,
    relacionadas_ids: [],
    texto_original: card.dataset.texto || '',
    tematica:    (function() { try { var c=document.getElementById(id); return c&&c.dataset.ia_tematica ? JSON.parse(c.dataset.ia_tematica) : []; } catch(e){ return []; } })(),
    verbos:      (function() { try { var c=document.getElementById(id); return c&&c.dataset.ia_verbos ? JSON.parse(c.dataset.ia_verbos) : []; } catch(e){ return []; } })(),
    sustantivos: (function() { try { var c=document.getElementById(id); return c&&c.dataset.ia_sustantivos ? JSON.parse(c.dataset.ia_sustantivos) : []; } catch(e){ return []; } })()
  };
  // Limpiar campos null para no contaminar Firestore
  if (!noticia.lat) delete noticia.lat;
  if (!noticia.lng) delete noticia.lng;

  if (db) {
    if (noticia.calle || noticia.colonia) {
      var geoKey = ((noticia.calle || '') + '-' + (noticia.colonia || '')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
      db.collection('geo-irapuato').doc(geoKey).set({
        calle: noticia.calle,
        colonia: noticia.colonia,
        comunidad: noticia.comunidad,
        lat: noticia.lat || null,
        lng: noticia.lng || null,
        veces: firebase.firestore.FieldValue.increment(1),
        ultimaVez: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    // Sprint 7: nutrir base de calles con sinónimos
    if (noticia.calle && noticia.lat && noticia.lng && typeof callesRegistrar === 'function') {
      callesRegistrar(noticia.calle, noticia.lat, noticia.lng, noticia.colonia);
      if (noticia.calle2) callesRegistrar(noticia.calle2, noticia.lat, noticia.lng, noticia.colonia);
      // Detectar posibles sinónimos automáticamente
      if (typeof callesDetectarSinonimo === 'function') {
        callesDetectarSinonimo(noticia.calle, noticia.lat, noticia.lng);
      }
    }
    db.collection('noticias-fase1').add(noticia)
    .then(function() {
      toast('Noticia guardada', 'ok');
      // Refrescar nodos viales si el tab movilidad está activo
      if (typeof movilidadRefrescarNodos === 'function') {
        movilidadRefrescarNodos();
      }
      // Marcar en feed-visto como aprobada
      if (typeof feedVistaMarcarAprobada === 'function' && noticia.url) {
        feedVistaMarcarAprobada(noticia.url);
      }
      if (makeWebhookURL) {
        var payload = JSON.parse(JSON.stringify(noticia));
        delete payload.fechaGuardado;
        fetch(makeWebhookURL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function() {});
      }
      descartarCard(id);
    })
    .catch(function(e) {
      toast('Error al guardar: ' + e.message, 'err');
    });
  } else {
    noticia.id = 'local-' + Date.now();
    noticia.fechaGuardado = { toDate: function(){ return new Date(); } };
    noticias.unshift(noticia);
    renderBD();
    actualizarBadge();
    toast('Guardado localmente (sin Firebase)', 'warn');
    descartarCard(id);
  }
}
window.aprobarCard = aprobarCard;

function aprobarFB(id, fuente, btnEl) {
  var url = document.getElementById('fb-url') ? document.getElementById('fb-url').value.trim() : '';
  var tipo2El = document.getElementById(id + '-tipo2');
  var tipo2 = tipo2El ? tipo2El.value : '';
  var card = document.getElementById(id);
  if (card && tipo2) card.dataset.tipo2 = tipo2;
  aprobarCard(id, fuente, url);
}
window.aprobarFB = aprobarFB;

function descartarCard(id) {
  var card = document.getElementById(id);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateX(100%)';
    card.style.transition = 'all .3s';
    setTimeout(function() { if (card.parentNode) card.parentNode.removeChild(card); }, 300);
  }
}
window.descartarCard = descartarCard;

// ═══════════════════════════════════════════════════════════════
// BASE DE DATOS
// ═══════════════════════════════════════════════════════════════
function filtrarBD(tipo, el) {
  filtroBD = tipo;
  var btns = document.querySelectorAll('.filtro-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('sel');
  if (el) el.classList.add('sel');
  renderBD();
}
window.filtrarBD = filtrarBD;

// ── Distancia en metros entre dos coordenadas (Haversine simplificado) ──
function distanciaMetros(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Agrupar noticias que cubren el mismo hecho ──
function agruparNoticias(lista) {
  var usadas = {};
  var grupos = [];

  for (var i = 0; i < lista.length; i++) {
    var n = lista[i];
    if (!n || !n.id || usadas[n.id]) continue;
    usadas[n.id] = true;

    var grupo = { principal: n, relacionadas: [] };
    var explicitasIds = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids : [];

    for (var j = 0; j < lista.length; j++) {
      var m = lista[j];
      if (!m || !m.id || m.id === n.id || usadas[m.id]) continue;

      var esExplicita = explicitasIds.indexOf(m.id) >= 0;

      var esAutomatica = false;
      if (!esExplicita && n.fecha_evento && n.fecha_evento.length > 0 &&
          m.fecha_evento && m.fecha_evento === n.fecha_evento) {
        var latN = parseFloat(n.lat), lngN = parseFloat(n.lng);
        var latM = parseFloat(m.lat), lngM = parseFloat(m.lng);
        // Umbral más estricto: coords deben estar > 500m del centro genérico
        // para considerarse "ubicadas con precisión real" y poder agrupar auto.
        // Antes era 0.0001 (~11m) — demasiado permisivo, agrupaba noticias
        // de colonias distintas que compartían fecha y coords aproximadas.
        var UMBRAL_CENTRO = 0.005; // ~500m — solo coords realmente distintas del centro
        var RADIO_AGRUP   = 50;    // metros — mismo predio/cuadra para agrupar
        if (!isNaN(latN) && !isNaN(latM) &&
            Math.abs(latN - 20.6795) > UMBRAL_CENTRO &&
            Math.abs(latM - 20.6795) > UMBRAL_CENTRO &&
            Math.abs(lngN - (-101.3540)) > UMBRAL_CENTRO &&
            Math.abs(lngM - (-101.3540)) > UMBRAL_CENTRO) {
          if (distanciaMetros(latN, lngN, latM, lngM) < RADIO_AGRUP) esAutomatica = true;
        }
      }

      if (esExplicita || esAutomatica) {
        grupo.relacionadas.push(m);
        usadas[m.id] = true;
      }
    }

    if (grupo.relacionadas.length > 0) {
      var todas = [n].concat(grupo.relacionadas);
      todas.sort(function(a, b) {
        return (b.resumen || '').length - (a.resumen || '').length;
      });
      grupo.principal = todas[0];
      grupo.relacionadas = todas.slice(1);
    }

    grupos.push(grupo);
  }
  return grupos;
}
window.agruparNoticias = agruparNoticias;

var _renderBDActivo = false;
function renderBD() {
  if (_renderBDActivo) return;
  _renderBDActivo = true;
  try { _renderBDImpl(); } finally { _renderBDActivo = false; }
}

function comparadorBD(a, b) {
  if (ordenBD === 'suceso') {
    var fa = _parseFechaBD(a.fecha_evento), fb = _parseFechaBD(b.fecha_evento);
    if (fa && fb) return fb - fa;
    if (fa) return -1;
    if (fb) return 1;
  }
  if (ordenBD === 'confianza') {
    var orden = { alta: 0, media: 1, baja: 2 };
    var ca = orden[a.confianza] !== undefined ? orden[a.confianza] : 3;
    var cb = orden[b.confianza] !== undefined ? orden[b.confianza] : 3;
    if (ca !== cb) return ca - cb;
  }
  var ta = a.ts || (a.fechaGuardado && a.fechaGuardado.seconds ? a.fechaGuardado.seconds * 1000 : 0);
  var tb = b.ts || (b.fechaGuardado && b.fechaGuardado.seconds ? b.fechaGuardado.seconds * 1000 : 0);
  return tb - ta;
}

function _parseFechaBD(str) {
  if (!str) return null;
  var parts = str.split('/');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
  }
  return null;
}

function ordenarBD(campo, el) {
  ordenBD = campo;
  var btns = document.querySelectorAll('.bd-orden-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (el) el.classList.add('activo');
  var label = document.getElementById('bd-orden-label');
  if (label) {
    if (campo === 'suceso') label.textContent = 'fecha suceso ↓';
    else if (campo === 'confianza') label.textContent = 'confianza ↓';
    else label.textContent = 'fecha captura ↓';
  }
  renderBD();
}
window.ordenarBD = ordenarBD;

function _renderBDImpl() {
  var lista = document.getElementById('lista-bd');
  var base = (filtroBD === 'todos' ? noticias.slice() : noticias.filter(function(n) { return n.tipo === filtroBD; }));
  base.sort(comparadorBD);

  document.getElementById('stat-tot').textContent = noticias.length;
  document.getElementById('stat-seg').textContent = noticias.filter(function(n){ return n.tipo==='seguridad'; }).length;
  document.getElementById('stat-acc').textContent = noticias.filter(function(n){ return n.tipo==='accidente'; }).length;
  document.getElementById('stat-eve').textContent = noticias.filter(function(n){ return n.tipo==='evento'; }).length;
  var statDesp = document.getElementById('stat-desp');
  if (statDesp) statDesp.textContent = noticias.filter(function(n){ return n.tipo==='desaparecido'; }).length;

  if (base.length === 0) {
    lista.innerHTML = '<div class="vacio"><div class="vacio-ico">🗄</div>Sin noticias ' + (filtroBD !== 'todos' ? 'de tipo "' + filtroBD + '"' : 'en la base de datos') + '.</div>';
    return;
  }

  var grupos = agruparNoticias(base);
  var html = '';

  for (var gi = 0; gi < grupos.length; gi++) {
    var g = grupos[gi];
    var n = g.principal;
    var lat = parseFloat(n.lat) || 20.6795;
    var lng = parseFloat(n.lng) || -101.3540;
    var tieneCoords = (Math.abs(lat - 20.6795) > 0.001 || Math.abs(lng - (-101.3540)) > 0.001);

    // Badge de riesgo
    var badgeRiesgo = (typeof analisisBadgeHTML === 'function') ? analisisBadgeHTML(lat, lng) : '';

    // Footer de coords visibles
    var coordsLabel = tieneCoords
      ? '<span style="color:#3a7a5a;font-size:6.5px;font-family:monospace;">📍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</span>'
      : '<span style="color:#3a5a7a;font-size:6.5px;font-family:monospace;">📍 sin ubicar</span>';

    // ID visible con copia
    var idCorto = n.id ? n.id.slice(0, 8) : '?';
    var idBtn = '<span style="font-size:6px;color:#2a4a6a;font-family:monospace;cursor:pointer;padding:1px 4px;border:1px solid #1a3050;border-radius:2px;" ' +
      'onclick="(function(){var t=document.createElement(\'textarea\');t.value=\'' + n.id + '\';document.body.appendChild(t);t.select();document.execCommand(\'copy\');document.body.removeChild(t);toast(\'ID copiado\',\'ok\');})()" ' +
      'title="' + n.id + '">ID:' + idCorto + '</span>';

    // Relacionadas badge
    var relBadge = '';
    if (g.relacionadas.length > 0) {
      relBadge = '<span style="font-size:6.5px;color:#b060ff;cursor:pointer;padding:1px 5px;background:rgba(176,96,255,.08);border:1px solid #b060ff44;border-radius:2px;" ' +
        'onclick="toggleRelLista(\'' + n.id + '\')" title="Noticias relacionadas">🔗 +' + g.relacionadas.length + '</span>';
    }

    // Panel relacionadas
    var relListaHtml = '';
    if (g.relacionadas.length > 0) {
      relListaHtml = '<div id="rel-lista-' + n.id + '" class="rel-lista">';
      for (var ri = 0; ri < g.relacionadas.length; ri++) {
        var rm = g.relacionadas[ri];
        relListaHtml += '<div class="rel-item" onclick="abrirRelModal(\'' + rm.id + '\')">' +
          '<span class="rel-item-tipo" style="color:' + (_colorTipo(rm.tipo)) + ';">' + (rm.tipo||'?').toUpperCase() + '</span> ' +
          '<span class="rel-item-tit">' + (rm.titulo||'Sin título').slice(0,60) + '</span>' +
          '</div>';
      }
      relListaHtml += '</div>';
    }

    // Panel edición
    var relEditHtml = _buildRelEditHtml(n);

    var coordsIniciales = (n.lat && Math.abs(parseFloat(n.lat) - 20.6795) > 0.0001)
      ? (parseFloat(n.lat).toFixed(6) + ', ' + parseFloat(n.lng).toFixed(6))
      : '';

    var editPanel =
      '<div id="bd-edit-' + n.id + '" style="display:none;padding:8px;background:#040c18;border-top:1px solid #0d2040;">' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">TIPO</div>' +
        '<select id="bde-tipo-' + n.id + '" class="nc-input" style="margin-bottom:6px;font-size:8px;"' +
          ' onchange="subtipoSegOnTipoCambio(\'bde-' + n.id + '\', this.value)">' +
          '<option value="seguridad"'          + (n.tipo==='seguridad'?          ' selected':'') + '>Seguridad</option>' +
          '<option value="accidente"'          + (n.tipo==='accidente'?          ' selected':'') + '>Accidente</option>' +
          '<option value="evento"'             + (n.tipo==='evento'?             ' selected':'') + '>Evento</option>' +
          '<option value="gobierno"'           + (n.tipo==='gobierno'?           ' selected':'') + '>Gobierno</option>' +
          '<option value="rumor"'              + (n.tipo==='rumor'?              ' selected':'') + '>Rumor</option>' +
          '<option value="desaparecido"'       + (n.tipo==='desaparecido'?       ' selected':'') + '>Desaparecido</option>' +
          '<option value="salud"'              + (n.tipo==='salud'?              ' selected':'') + '>Salud</option>' +
          '<option value="transporte"'         + (n.tipo==='transporte'?         ' selected':'') + '>Transporte</option>' +
          '<option value="politica"'           + (n.tipo==='politica'?           ' selected':'') + '>Política</option>' +
          '<option value="ambiental"'          + (n.tipo==='ambiental'?          ' selected':'') + '>Ambiental</option>' +
          '<option value="corrupcion"'         + (n.tipo==='corrupcion'?         ' selected':'') + '>Corrupción</option>' +
          '<option value="crimen_organizado"'  + (n.tipo==='crimen_organizado'?  ' selected':'') + '>Crimen Org.</option>' +
        '</select>' +
        // Subtipo SESNSP — solo visible cuando tipo = seguridad
        (typeof subtipoSegContenedor === 'function'
          ? subtipoSegContenedor('bde-' + n.id, n.tipo, n.subtipo_seguridad || n.tipo2_seg || '')
          : '') +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">TIPO 2 (opcional)</div>' +
        '<select id="bde-tipo2-' + n.id + '" class="nc-input" style="margin-bottom:6px;font-size:8px;">' +
          '<option value="">— ninguno —</option>' +
          '<option value="seguridad"'         + (n.tipo2==='seguridad'?         ' selected':'') + '>Seguridad</option>' +
          '<option value="accidente"'         + (n.tipo2==='accidente'?         ' selected':'') + '>Accidente</option>' +
          '<option value="evento"'            + (n.tipo2==='evento'?            ' selected':'') + '>Evento</option>' +
          '<option value="gobierno"'          + (n.tipo2==='gobierno'?          ' selected':'') + '>Gobierno</option>' +
          '<option value="rumor"'             + (n.tipo2==='rumor'?             ' selected':'') + '>Rumor</option>' +
          '<option value="desaparecido"'      + (n.tipo2==='desaparecido'?      ' selected':'') + '>Desaparecido</option>' +
          '<option value="salud"'             + (n.tipo2==='salud'?             ' selected':'') + '>Salud</option>' +
          '<option value="transporte"'        + (n.tipo2==='transporte'?        ' selected':'') + '>Transporte</option>' +
          '<option value="politica"'          + (n.tipo2==='politica'?          ' selected':'') + '>Política</option>' +
          '<option value="ambiental"'         + (n.tipo2==='ambiental'?         ' selected':'') + '>Ambiental</option>' +
          '<option value="corrupcion"'        + (n.tipo2==='corrupcion'?        ' selected':'') + '>Corrupción</option>' +
          '<option value="crimen_organizado"' + (n.tipo2==='crimen_organizado'? ' selected':'') + '>Crimen Org.</option>' +
        '</select>' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">TÍTULO</div>' +
        '<input id="bde-tit-' + n.id + '" class="nc-input" value="' + _esc(n.titulo) + '" style="margin-bottom:6px;font-size:8px;">' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">RESUMEN</div>' +
        '<textarea id="bde-res-' + n.id + '" class="nc-input" style="margin-bottom:6px;font-size:8px;min-height:50px;">' + _esc(n.resumen) + '</textarea>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">CALLE 1</div>' +
            '<input id="bde-cal-' + n.id + '" class="nc-input" value="' + _esc(n.calle) + '" style="font-size:8px;">' +
          '</div>' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">CALLE 2</div>' +
            '<input id="bde-cal2-' + n.id + '" class="nc-input" value="' + _esc(n.calle2) + '" style="font-size:8px;">' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">COLONIA</div>' +
            '<input id="bde-col-' + n.id + '" class="nc-input" value="' + _esc(n.colonia) + '" style="font-size:8px;">' +
          '</div>' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">COMUNIDAD</div>' +
            '<input id="bde-com-' + n.id + '" class="nc-input" value="' + _esc(n.comunidad) + '" style="font-size:8px;">' +
          '</div>' +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">NOMBRES</div>' +
        '<input id="bde-nom-' + n.id + '" class="nc-input" value="' + _esc(n.nombres) + '" style="margin-bottom:6px;font-size:8px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:6px;">' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">FECHA EVENTO</div>' +
            '<input id="bde-fev-' + n.id + '" class="nc-input" value="' + _esc(n.fecha_evento) + '" style="font-size:8px;" placeholder="DD/MM/YYYY">' +
          '</div>' +
          '<div>' +
            '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:2px 0 4px;">MOMENTO</div>' +
            '<select id="bde-tdia-' + n.id + '" class="nc-input" style="font-size:8px;">' +
              '<option value="desconocido"' + (n.tiempo_dia==='desconocido'||!n.tiempo_dia?' selected':'') + '>Desconocido</option>' +
              '<option value="manana"' + (n.tiempo_dia==='manana'?' selected':'') + '>Mañana (6-12h)</option>' +
              '<option value="tarde"' + (n.tiempo_dia==='tarde'?' selected':'') + '>Tarde (12-19h)</option>' +
              '<option value="noche"' + (n.tiempo_dia==='noche'?' selected':'') + '>Noche (19-0h)</option>' +
              '<option value="madrugada"' + (n.tiempo_dia==='madrugada'?' selected':'') + '>Madrugada (0-6h)</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:4px 0 2px;">ENLACE / URL</div>' +
        '<input id="bde-url-' + n.id + '" class="nc-input" placeholder="https://..." style="margin-bottom:6px;font-size:8px;" value="">' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:4px 0 2px;">COORDENADAS MANUALES (lat, lng) — sobreescribe autubicación</div>' +
        '<input id="bde-coords-' + n.id + '" class="nc-input" value="' + coordsIniciales + '" placeholder="Ej: 20.6510, -101.3780" style="margin-bottom:6px;font-size:8px;">' +
        relEditHtml +
        '<button onclick="guardarEditBD(\'' + n.id + '\')" style="width:100%;padding:8px;background:rgba(0,255,136,.1);color:#00ff88;border:1px solid #00ff88;font-family:var(--title);font-size:8px;cursor:pointer;margin-bottom:4px;margin-top:8px;">GUARDAR CAMBIOS</button>' +
        '<div style="display:flex;gap:4px;">' +
          '<button id="bde-btn-pos-' + n.id + '" onclick="posicionarBDEnIntel(\'' + n.id + '\')" style="flex:1;padding:6px;background:rgba(0,200,100,.08);color:#00c864;border:1px solid #00c864;font-family:var(--title);font-size:7px;cursor:pointer;letter-spacing:.5px;">📍 AUTO-UBICAR</button>' +
          '<button id="bde-btn-del-' + n.id + '" onclick="quitarDeIntel(\'' + n.id + '\')" style="flex:1;padding:6px;background:rgba(255,34,85,.06);color:#ff2255;border:1px solid #ff2255;font-family:var(--title);font-size:7px;cursor:pointer;letter-spacing:.5px;">🗑 QUITAR MAPA</button>' +
        '</div>' +
        '<div id="bde-geo-status-' + n.id + '" style="font-size:7px;color:#3a7ab8;margin-top:3px;min-height:12px;">' +
          (tieneCoords ? '✅ Base interna: ' + (n.colonia || 'coords guardadas') : '') +
        '</div>' +
      '</div>';

    var colorTipo = _colorTipo(n.tipo);

    html +=
      '<div class="bd-card" id="bd-' + n.id + '" data-lat="' + lat + '" data-lng="' + lng + '" data-tipo="' + (n.tipo||'rumor') + '">' +
        // Cabecera
        '<div style="display:flex;align-items:center;gap:5px;padding:6px 8px 4px;border-bottom:1px solid #0d2040;">' +
          '<div style="font-size:7px;font-family:var(--title);padding:2px 6px;border-radius:2px;background:' + colorTipo + '22;color:' + colorTipo + ';border:1px solid ' + colorTipo + '44;letter-spacing:1px;">' + (n.tipo||'rumor').toUpperCase() + '</div>' +
          (n.tipo2 ? '<div style="font-size:6px;font-family:var(--title);padding:1px 4px;border-radius:2px;color:#3a5a7a;border:1px solid #1a3050;">' + n.tipo2.toUpperCase() + '</div>' : '') +
          (n.subtipo_seguridad && typeof subtipoSegBadge === 'function' ? subtipoSegBadge(n.subtipo_seguridad) : '') +
          '<div style="margin-left:auto;display:flex;align-items:center;gap:4px;">' +
            '<span style="font-size:6.5px;color:#2a4a6a;font-family:var(--mono);">' + (n.fechaCaptura || n.fecha_evento || '') + '</span>' +
            idBtn +
            relBadge +
          '</div>' +
        '</div>' +
        // Cuerpo
        '<div style="padding:6px 8px;">' +
          badgeRiesgo +
          '<div style="font-size:10px;color:#c0e8ff;margin:4px 0;line-height:1.35;font-family:var(--title);">' + _esc(n.titulo) + '</div>' +
          '<div style="font-size:7.5px;color:#5a8aaa;line-height:1.8;">' +
            (n.fuente ? '📰 ' + n.fuente + '<br>' : '') +
            (n.calle ? '📍 ' + n.calle + (n.calle2 ? ' / ' + n.calle2 : '') + '<br>' : '') +
            (n.colonia ? '🏘 ' + n.colonia : '') +
            (n.comunidad ? (n.colonia ? ' · ' : '') + n.comunidad : '') +
          '</div>' +
          (n.resumen ? '<div style="font-size:8px;color:#7a9ab8;margin-top:5px;border-top:1px solid #0d2040;padding-top:5px;line-height:1.4;">' + _esc(n.resumen) + '</div>' : '') +
          relListaHtml +
        '</div>' +
        // Footer
        '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:5px 8px;border-top:1px solid #0d2040;align-items:center;">' +
          (n.url||n.link ? '<a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" style="font-size:6.5px;color:#ffc800;padding:3px 7px;border:1px solid #ffc80044;border-radius:2px;font-family:var(--title);text-decoration:none;">🔗 VER</a>' : '') +
          '<button onclick="verEnMapa(\'mapa\',' + lat + ',' + lng + ')" style="font-size:6.5px;color:#00c8ff;padding:3px 7px;border:1px solid #00c8ff44;border-radius:2px;background:transparent;cursor:pointer;font-family:var(--title);">MAPA</button>' +
          '<button onclick="verEnMapa(\'intel\',' + lat + ',' + lng + ')" style="font-size:6.5px;color:#ff8800;padding:3px 7px;border:1px solid #ff880044;border-radius:2px;background:transparent;cursor:pointer;font-family:var(--title);">INTEL</button>' +
          coordsLabel +
          '<div style="margin-left:auto;display:flex;gap:4px;">' +
            '<button id="bde-toggle-' + n.id + '" onclick="editarBD(\'' + n.id + '\')" style="font-size:6.5px;color:#00c8ff;padding:3px 9px;border:1px solid #00c8ff44;border-radius:2px;background:rgba(0,200,255,.06);cursor:pointer;font-family:var(--title);">✏ EDITAR</button>' +
            '<button onclick="eliminarBD(\'' + n.id + '\')" style="font-size:6.5px;color:#ff5050;padding:3px 9px;border:1px solid #ff505044;border-radius:2px;background:rgba(255,80,80,.06);cursor:pointer;font-family:var(--title);">🗑 ELIMINAR</button>' +
          '</div>' +
        '</div>' +
        editPanel +
      '</div>';
  }

  lista.innerHTML = html;

  // Setear URLs post-render
  for (var gi2 = 0; gi2 < grupos.length; gi2++) {
    var n2 = grupos[gi2].principal;
    var urlInput = document.getElementById('bde-url-' + n2.id);
    if (urlInput) urlInput.value = n2.url || n2.link || '';
  }
}

function _esc(str) {
  if (!str) return '';
  return ('' + str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _colorTipo(tipo) {
  var mapa = {
    seguridad:'#ff2255', accidente:'#ff8800', evento:'#00ccff', gobierno:'#0096ff',
    rumor:'#3a5a7a', desaparecido:'#ffa500', salud:'#00c864', transporte:'#b464ff',
    politica:'#c040ff', ambiental:'#00aa44', corrupcion:'#ffcc00', crimen_organizado:'#cc0022'
  };
  return mapa[tipo] || '#3a5a7a';
}

function _buildRelEditHtml(n) {
  var ids = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids : [];
  var html = '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:4px 0 2px;">NOTICIAS RELACIONADAS</div>';
  if (ids.length === 0) {
    html += '<div style="font-size:7px;color:#2a4a6a;margin-bottom:4px;">Sin relacionadas vinculadas</div>';
  } else {
    html += '<div style="margin-bottom:4px;">';
    for (var i = 0; i < ids.length; i++) {
      html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">' +
        '<span style="font-size:7px;color:#b060ff;font-family:monospace;">' + ids[i].slice(0,8) + '...</span>' +
        '<button onclick="desvincularRelacionada(\'' + n.id + '\',\'' + ids[i] + '\')" style="font-size:6px;color:#ff5050;padding:1px 4px;border:1px solid #ff505044;background:transparent;cursor:pointer;">✕</button>' +
        '</div>';
    }
    html += '</div>';
  }
  html += '<div style="display:flex;gap:4px;margin-bottom:6px;">' +
    '<input id="bde-rel-input-' + n.id + '" class="nc-input" placeholder="ID de noticia a vincular" style="flex:1;font-size:7px;">' +
    '<button onclick="vincularRelacionada(\'' + n.id + '\')" style="padding:4px 8px;background:rgba(176,96,255,.1);color:#b060ff;border:1px solid #b060ff44;font-family:var(--title);font-size:7px;cursor:pointer;white-space:nowrap;">+ VINCULAR</button>' +
    '</div>';
  return html;
}

function vincularRelacionada(id) {
  var input = document.getElementById('bde-rel-input-' + id);
  if (!input || !input.value.trim()) return;
  var idVincular = input.value.trim();
  if (idVincular === id) { toast('No puedes vincular una noticia consigo misma', 'warn'); return; }
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;
  var ids = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids.slice() : [];
  if (ids.indexOf(idVincular) >= 0) { toast('Ya está vinculada', 'warn'); return; }
  ids.push(idVincular);
  if (db) {
    db.collection('noticias-fase1').doc(id).update({ relacionadas_ids: ids })
    .then(function() { toast('Vinculada ✓', 'ok'); input.value = ''; })
    .catch(function(e) { toast('Error: ' + e.message, 'err'); });
  }
}
window.vincularRelacionada = vincularRelacionada;

function desvincularRelacionada(id, idQuitar) {
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;
  var ids = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids.filter(function(x){ return x !== idQuitar; }) : [];
  if (db) {
    db.collection('noticias-fase1').doc(id).update({ relacionadas_ids: ids })
    .then(function() { toast('Desvinculada', 'ok'); })
    .catch(function(e) { toast('Error: ' + e.message, 'err'); });
  }
}
window.desvincularRelacionada = desvincularRelacionada;

// ── Navegar desde tarjeta BD a un mapa en coordenadas específicas ──
function verEnMapa(tab, lat, lng) {
  verTab(tab);
  var zoom = 16;
  setTimeout(function() {
    if (tab === 'mapa' && mapaObj) {
      mapaObj.setView([lat, lng], zoom);
    } else if (tab === 'intel' && intelObj) {
      intelObj.setView([lat, lng], zoom);
    } else if (tab === 'denue' && denueMapaObj) {
      denueMapaObj.setView([lat, lng], zoom);
    } else if (tab === 'gobierno' && gobMapaObj) {
      gobMapaObj.setView([lat, lng], zoom);
    }
  }, 600);
}
window.verEnMapa = verEnMapa;

function toggleRelLista(id) {
  var lista = document.getElementById('rel-lista-' + id);
  if (!lista) return;
  lista.classList.toggle('visible');
}
window.toggleRelLista = toggleRelLista;

function abrirRelModal(id) {
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;
  var html =
    '<div class="rel-modal-tit">' + _esc(n.titulo||'Sin título') + '</div>' +
    '<div class="rel-modal-fuente">📰 ' + _esc(n.fuente||'Fuente desconocida') + (n.fecha_evento ? ' · ' + n.fecha_evento : '') + '</div>' +
    '<div class="rel-modal-res">' + _esc(n.resumen||'Sin resumen') + '</div>' +
    (n.url||n.link ? '<a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" class="rel-modal-link">🔗 Ver fuente original</a>' : '');
  var modal = document.getElementById('rel-modal');
  var body  = document.getElementById('rel-modal-body');
  if (!modal || !body) return;
  body.innerHTML = html;
  modal.style.display = 'flex';
}
window.abrirRelModal = abrirRelModal;

function cerrarRelModal() {
  var modal = document.getElementById('rel-modal');
  if (modal) modal.style.display = 'none';
}
window.cerrarRelModal = cerrarRelModal;

function actualizarBadge() {
  var badge = document.getElementById('bd-badge');
  if (badge) badge.textContent = noticias.length;
}

// ── EDITAR / GUARDAR BD ──

function editarBD(id) {
  var panel = document.getElementById('bd-edit-' + id);
  var btn   = document.getElementById('bde-toggle-' + id);
  if (!panel) return;
  var open = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = open ? 'block' : 'none';
  if (btn) btn.textContent = open ? '✕ CERRAR' : '✏ EDITAR';
  if (btn) btn.style.color  = open ? '#ff8800' : '#00c8ff';
  if (btn) btn.style.borderColor = open ? '#ff880055' : '#00c8ff55';
  if (btn) btn.style.background  = open ? 'rgba(255,136,0,.08)' : 'rgba(0,200,255,.08)';
  if (open) { setTimeout(function(){ panel.scrollIntoView({behavior:'smooth',block:'nearest'}); }, 80); }
}
window.editarBD = editarBD;

function guardarEditBD(id) {
  if (typeof db === 'undefined' || !db) { toast('Firebase no disponible — verifica conexión', 'err'); return; }
  var tit     = document.getElementById('bde-tit-'  + id);
  var cal     = document.getElementById('bde-cal-'  + id);
  var col     = document.getElementById('bde-col-'  + id);
  var com     = document.getElementById('bde-com-'  + id);
  var nom     = document.getElementById('bde-nom-'  + id);
  var tipoEl2 = document.getElementById('bde-tipo-' + id);
  var cal2El2 = document.getElementById('bde-cal2-' + id);
  var fevEl2  = document.getElementById('bde-fev-'  + id);
  var tdiaEl2 = document.getElementById('bde-tdia-' + id);
  var resEl2  = document.getElementById('bde-res-'  + id);
  var coordsBD = document.getElementById('bde-coords-' + id);

  // ── Parsear coordenadas manuales ──
  var latBD = null, lngBD = null;
  if (coordsBD && coordsBD.value.trim()) {
    var cp = coordsBD.value.split(',');
    if (cp.length === 2) {
      latBD = parseFloat(cp[0].trim());
      lngBD = parseFloat(cp[1].trim());
      if (isNaN(latBD) || isNaN(lngBD)) { latBD = null; lngBD = null; }
    }
  }

  var calleVal   = cal ? cal.value.trim() : '';
  var coloniaVal = col ? col.value.trim() : '';

  // ── Nutrir base interna geo-relaciones si hay coords manuales ──
  if (latBD && lngBD && (calleVal || coloniaVal)) {
    var key = calleVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && !GEO_BASE[key]) {
      GEO_BASE[key] = { colonia: coloniaVal, lat: latBD, lng: lngBD, hits: 1 };
    } else if (key) {
      GEO_BASE[key].hits++;
      GEO_BASE[key].lat = (GEO_BASE[key].lat + latBD) / 2;
      GEO_BASE[key].lng = (GEO_BASE[key].lng + lngBD) / 2;
      if (coloniaVal) GEO_BASE[key].colonia = coloniaVal;
    }
    if (db) {
      db.collection('geo-irapuato').doc(key).set(
        { calle: calleVal, colonia: coloniaVal, lat: latBD, lng: lngBD, hits: (GEO_BASE[key]||{hits:1}).hits },
        { merge: true }
      );
    }
  }

  var urlEl2   = document.getElementById('bde-url-'   + id);
  var tipo2El2 = document.getElementById('bde-tipo2-' + id);
  // Sprint 6: subtipo SESNSP
  var subtipoSegVal = (typeof subtipoSegLeer === 'function') ? subtipoSegLeer('bde-' + id) : '';

  var usuario_edicion = {
    tipo:                tipoEl2 ? tipoEl2.value : 'rumor',
    titulo:              tit     ? tit.value     : '',
    calle:               calleVal,
    calle2:              cal2El2 ? cal2El2.value.trim() : '',
    colonia:             coloniaVal,
    comunidad:           com     ? com.value.trim()  : '',
    nombres:             nom     ? nom.value.trim()  : '',
    fecha_evento:        fevEl2  ? fevEl2.value.trim() : '',
    tiempo_dia:          tdiaEl2 ? tdiaEl2.value : 'desconocido',
    resumen:             resEl2  ? resEl2.value.trim() : '',
    url:                 urlEl2  ? urlEl2.value.trim() : '',
    tipo2:               tipo2El2 ? tipo2El2.value : '',
    subtipo_seguridad:   subtipoSegVal
  };

  // Recalcular diff contra ia_raw
  var nActual = null;
  for (var ix = 0; ix < noticias.length; ix++) { if (noticias[ix].id === id) { nActual = noticias[ix]; break; } }
  var diff_edicion = {};
  if (nActual && nActual.ia_raw) {
    var keysIA = Object.keys(usuario_edicion);
    for (var ki = 0; ki < keysIA.length; ki++) {
      var k = keysIA[ki];
      if (k === 'url') continue;
      var iaVal  = (nActual.ia_raw[k] || '').toString().trim();
      var usrVal = (usuario_edicion[k] || '').toString().trim();
      if (iaVal !== usrVal) diff_edicion[k] = { ia: iaVal, usuario: usrVal };
    }
  }

  var updates = {
    tipo:                 usuario_edicion.tipo,
    titulo:               usuario_edicion.titulo,
    calle:                usuario_edicion.calle,
    calle2:               usuario_edicion.calle2,
    colonia:              usuario_edicion.colonia,
    comunidad:            usuario_edicion.comunidad,
    nombres:              usuario_edicion.nombres,
    fecha_evento:         usuario_edicion.fecha_evento,
    tiempo_dia:           usuario_edicion.tiempo_dia,
    resumen:              usuario_edicion.resumen,
    url:                  usuario_edicion.url,
    tipo2:                usuario_edicion.tipo2,
    subtipo_seguridad:    usuario_edicion.subtipo_seguridad,
    usuario_edicion: {
      tipo:               usuario_edicion.tipo,
      titulo:             usuario_edicion.titulo,
      calle:              usuario_edicion.calle,
      calle2:             usuario_edicion.calle2,
      colonia:            usuario_edicion.colonia,
      comunidad:          usuario_edicion.comunidad,
      nombres:            usuario_edicion.nombres,
      fecha_evento:       usuario_edicion.fecha_evento,
      tiempo_dia:         usuario_edicion.tiempo_dia,
      resumen:            usuario_edicion.resumen,
      url:                usuario_edicion.url,
      tipo2:              usuario_edicion.tipo2,
      subtipo_seguridad:  usuario_edicion.subtipo_seguridad
    },
    aprendizaje_diff:              diff_edicion,
    aprendizaje_campos_corregidos: Object.keys(diff_edicion),
    ultima_edicion_usuario:        new Date().toISOString()
  };
  if (latBD && lngBD) { updates.lat = latBD; updates.lng = lngBD; }

  db.collection('noticias-fase1').doc(id).update(updates)
  .then(function() {
    toast('✓ Cambios guardados', 'ok');

    // ══════════════════════════════════════════════════════════
    // FIX: actualizar noticias[] en memoria INMEDIATAMENTE,
    // sin esperar el onSnapshot (evita condición de carrera
    // donde el mapa Intel renderiza con coords viejas)
    // ══════════════════════════════════════════════════════════
    for (var fi = 0; fi < noticias.length; fi++) {
      if (noticias[fi].id === id) {
        noticias[fi].tipo         = updates.tipo;
        noticias[fi].titulo       = updates.titulo;
        noticias[fi].calle        = updates.calle;
        noticias[fi].calle2       = updates.calle2;
        noticias[fi].colonia      = updates.colonia;
        noticias[fi].comunidad    = updates.comunidad;
        noticias[fi].nombres      = updates.nombres;
        noticias[fi].fecha_evento = updates.fecha_evento;
        noticias[fi].tiempo_dia   = updates.tiempo_dia;
        noticias[fi].resumen      = updates.resumen;
        noticias[fi].url          = updates.url;
        noticias[fi].tipo2             = updates.tipo2;
        noticias[fi].subtipo_seguridad = updates.subtipo_seguridad;
        // ── Coords manuales: aplicar de inmediato ──
        if (latBD && lngBD) {
          noticias[fi].lat = latBD;
          noticias[fi].lng = lngBD;
        }
        break;
      }
    }

    // Re-render mapa Intel si está activo para reflejar nueva posición
    if (intelIniciado && typeof renderIntel === 'function') {
      renderIntel();
    }
    // Re-render corpus para que el label de coords se actualice
    renderBD();
  })
  .catch(function(e) { toast('Error: ' + e.message, 'err'); });
}
window.guardarEditBD = guardarEditBD;


function eliminarBD(id) {
  if (!confirm('¿Eliminar esta noticia de la base de datos?')) return;
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  db.collection('noticias-fase1').doc(id).delete()
  .then(function() { toast('Noticia eliminada', 'ok'); })
  .catch(function(e) { toast('Error al eliminar: ' + e.message, 'err'); });
}
window.eliminarBD = eliminarBD;

// ═══════════════════════════════════════════════════════════════
// DETALLE MODAL
// ═══════════════════════════════════════════════════════════════

function verDetallesBD(id) {
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;
  var modal = document.getElementById('detalle-modal');
  var body  = document.getElementById('detalle-modal-body');
  if (!modal || !body) return;

  var badgeRiesgo = (typeof analisisBadgeHTML === 'function') ? analisisBadgeHTML(n.lat||20.6795, n.lng||(-101.3540)) : '';
  var colorT = _colorTipo(n.tipo);

  body.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">' +
      '<div style="font-size:8px;font-family:var(--title);padding:3px 8px;border-radius:2px;background:' + colorT + '22;color:' + colorT + ';border:1px solid ' + colorT + '44;">' + (n.tipo||'?').toUpperCase() + '</div>' +
      (n.tipo2 ? '<div style="font-size:7px;font-family:var(--title);padding:2px 5px;border-radius:2px;color:#3a5a7a;border:1px solid #1a3050;">' + n.tipo2.toUpperCase() + '</div>' : '') +
      '<div style="margin-left:auto;font-size:7px;color:#2a4a6a;font-family:var(--mono);">' + (n.fechaCaptura||'') + '</div>' +
    '</div>' +
    badgeRiesgo +
    '<div style="font-size:13px;color:#c0e8ff;margin:8px 0;font-family:var(--title);line-height:1.3;">' + _esc(n.titulo||'Sin título') + '</div>' +
    '<div style="font-size:8px;color:#5a8aaa;line-height:1.9;margin-bottom:8px;">' +
      (n.fuente ? '📰 ' + _esc(n.fuente) + '<br>' : '') +
      (n.calle  ? '📍 ' + _esc(n.calle) + (n.calle2 ? ' / ' + _esc(n.calle2) : '') + '<br>' : '') +
      (n.colonia ? '🏘 ' + _esc(n.colonia) + '<br>' : '') +
      (n.comunidad ? '🌄 ' + _esc(n.comunidad) + '<br>' : '') +
      (n.nombres ? '👤 ' + _esc(n.nombres) + '<br>' : '') +
      (n.fecha_evento ? '📅 ' + n.fecha_evento + (n.tiempo_dia && n.tiempo_dia !== 'desconocido' ? ' · ' + n.tiempo_dia : '') + '<br>' : '') +
    '</div>' +
    (n.resumen ? '<div style="font-size:9px;color:#9abcd0;line-height:1.5;padding:8px;background:#040c18;border:1px solid #0d2040;border-radius:3px;margin-bottom:8px;">' + _esc(n.resumen) + '</div>' : '') +
    (n.lat && Math.abs(parseFloat(n.lat) - 20.6795) > 0.001
      ? '<div style="font-size:7px;color:#3a7a5a;font-family:monospace;margin-bottom:8px;">📍 ' + parseFloat(n.lat).toFixed(6) + ', ' + parseFloat(n.lng).toFixed(6) + '</div>'
      : '<div style="font-size:7px;color:#3a5a7a;font-family:monospace;margin-bottom:8px;">📍 sin ubicar precisamente</div>') +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
      (n.url||n.link ? '<a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" style="font-size:7px;color:#ffc800;padding:4px 10px;border:1px solid #ffc80044;border-radius:2px;text-decoration:none;font-family:var(--title);">🔗 VER FUENTE</a>' : '') +
      '<button onclick="verEnMapa(\'intel\',' + (n.lat||20.6795) + ',' + (n.lng||(-101.3540)) + ');cerrarDetalle();" style="font-size:7px;color:#ff8800;padding:4px 10px;border:1px solid #ff880044;border-radius:2px;background:transparent;cursor:pointer;font-family:var(--title);">📡 INTEL</button>' +
    '</div>';

  modal.style.display = 'flex';
}
window.verDetallesBD = verDetallesBD;

function cerrarDetalle() {
  var modal = document.getElementById('detalle-modal');
  if (modal) modal.style.display = 'none';
}
window.cerrarDetalle = cerrarDetalle;

// ═══════════════════════════════════════════════════════════════
// APRENDIZAJE
// ═══════════════════════════════════════════════════════════════

var _aprData = [];

function mkStatBox(label, valor, color) {
  return '<div style="background:#040c18;border:1px solid #0d2040;border-radius:3px;padding:6px 10px;text-align:center;">' +
    '<div style="font-size:16px;color:' + color + ';font-family:var(--title);">' + valor + '</div>' +
    '<div style="font-size:6px;color:#3a5a7a;font-family:var(--mono);margin-top:2px;">' + label + '</div>' +
    '</div>';
}

function renderReglasBD() {
  var lista = document.getElementById('apr-reglas-lista');
  if (!lista) return;
  if (!_promptRules || _promptRules.length === 0) {
    lista.innerHTML = '<div style="color:#2a4a6a;font-size:8px;padding:8px;">Sin reglas generadas aún. Se necesitan ' + (typeof UMBRAL_APRENDIZAJE !== 'undefined' ? UMBRAL_APRENDIZAJE : 10) + ' correcciones del mismo campo.</div>';
    return;
  }
  lista.innerHTML = _promptRules.map(function(r, i) {
    var activa = r.activa !== false;
    return '<div style="padding:6px 8px;border-bottom:1px solid #0d2040;display:flex;align-items:flex-start;gap:6px;">' +
      '<button onclick="toggleRegla(' + i + ')" style="font-size:7px;padding:2px 6px;background:' + (activa?'rgba(0,255,136,.1)':'rgba(255,34,85,.08)') + ';color:' + (activa?'#00ff88':'#ff2255') + ';border:1px solid ' + (activa?'#00ff88':'#ff2255') + '44;cursor:pointer;white-space:nowrap;">' + (activa?'ON':'OFF') + '</button>' +
      '<div style="font-size:7.5px;color:#7a9ab8;font-family:monospace;line-height:1.5;flex:1;">' + _esc(r.regla) + '</div>' +
      '<div style="font-size:6px;color:#2a4a6a;white-space:nowrap;">' + (r.campo||'') + '<br>' + (r.count||0) + '×' + '</div>' +
      '</div>';
  }).join('');
}
window.renderReglasBD = renderReglasBD;

function toggleRegla(i) {
  if (!_promptRules[i]) return;
  _promptRules[i].activa = _promptRules[i].activa === false ? true : false;
  guardarReglasPrompt(_promptRules);
  renderReglasBD();
  var activas = _promptRules.filter(function(r){ return r.activa !== false; }).length;
  toast('Regla ' + (_promptRules[i].activa ? 'activada' : 'desactivada') + ' — ' + activas + ' activas', 'ok');
}
window.toggleRegla = toggleRegla;

function cargarAprendizaje() {
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  var lista = document.getElementById('apr-lista');
  if (lista) lista.innerHTML = '<div style="color:#2a4a6a;font-size:8px;padding:10px;">Cargando...</div>';

  db.collection('noticias-fase1')
    .where('viaIA', '==', true)
    .orderBy('fechaGuardado', 'desc')
    .limit(200)
    .get()
    .then(function(snap) {
      _aprData = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        if (d.ia_raw && d.aprendizaje_diff) _aprData.push(d);
      });
      renderAprendizaje();
    })
    .catch(function(e) {
      toast('Error cargando datos: ' + e.message, 'err');
    });
}
window.cargarAprendizaje = cargarAprendizaje;

function renderAprendizaje() {
  var total = _aprData.length;
  var conCorreccion = _aprData.filter(function(d) { return Object.keys(d.aprendizaje_diff || {}).length > 0; }).length;
  var pct = total > 0 ? Math.round((conCorreccion / total) * 100) : 0;

  var porCampo = {};
  _aprData.forEach(function(d) {
    var keys = Object.keys(d.aprendizaje_diff || {});
    for (var i = 0; i < keys.length; i++) {
      porCampo[keys[i]] = (porCampo[keys[i]] || 0) + 1;
    }
  });
  var camposOrdenados = Object.keys(porCampo).sort(function(a,b){ return porCampo[b]-porCampo[a]; });

  var statsEl = document.getElementById('apr-stats');
  if (statsEl) statsEl.innerHTML =
    mkStatBox('NOTICIAS CON IA', total, '#b060ff') +
    mkStatBox('CON CORRECCIONES', conCorreccion, '#ffc800') +
    mkStatBox('TASA DE ERROR', pct + '%', pct > 50 ? '#ff2255' : pct > 25 ? '#ff8800' : '#00c864');

  var camposEl = document.getElementById('apr-campos');
  if (camposEl) {
    camposEl.innerHTML = camposOrdenados.slice(0, 8).map(function(c) {
      var pctC = total > 0 ? Math.round((porCampo[c]/total)*100) : 0;
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
        '<div style="font-size:7px;color:#c0e8ff;font-family:var(--mono);min-width:80px;">' + c + '</div>' +
        '<div style="flex:1;background:#040c18;height:6px;border-radius:3px;overflow:hidden;">' +
          '<div style="height:100%;background:#b060ff;width:' + pctC + '%;transition:width .3s;"></div>' +
        '</div>' +
        '<div style="font-size:7px;color:#b060ff;font-family:var(--mono);min-width:30px;text-align:right;">' + porCampo[c] + 'x</div>' +
        '</div>';
    }).join('');
  }

  var listaEl = document.getElementById('apr-lista');
  if (!listaEl) return;
  var conDiff = _aprData.filter(function(d){ return Object.keys(d.aprendizaje_diff||{}).length > 0; });
  if (conDiff.length === 0) {
    listaEl.innerHTML = '<div style="color:#2a4a6a;font-size:8px;padding:10px;">Sin correcciones registradas aún.</div>';
    return;
  }
  listaEl.innerHTML = conDiff.slice(0, 50).map(function(d) {
    var diffs = Object.keys(d.aprendizaje_diff||{}).map(function(k) {
      var df = d.aprendizaje_diff[k];
      return '<div style="margin-left:8px;font-size:6.5px;color:#5a7a9a;">' +
        '<span style="color:#3a5a7a;">' + k + ':</span> ' +
        '<span style="color:#ff6655;">' + _esc(df.ia) + '</span> → ' +
        '<span style="color:#00c864;">' + _esc(df.usuario) + '</span>' +
        '</div>';
    }).join('');
    return '<div style="padding:6px 8px;border-bottom:1px solid #0d2040;">' +
      '<div style="font-size:8px;color:#c0e8ff;margin-bottom:3px;">' + _esc(d.titulo||'Sin título') + '</div>' +
      diffs +
      '</div>';
  }).join('');
}
window.renderAprendizaje = renderAprendizaje;

function verPromptSugerido() {
  var porCampo = {};
  _aprData.forEach(function(d) {
    var keys = Object.keys(d.aprendizaje_diff || {});
    for (var i = 0; i < keys.length; i++) {
      porCampo[keys[i]] = (porCampo[keys[i]] || 0) + 1;
    }
  });

  var promptBase = typeof buildPrompt === 'function' ? buildPrompt('TEXTO_DE_EJEMPLO') : '(buildPrompt no disponible)';
  var sugerencias =
    '// ═══ SUGERENCIAS AUTOMÁTICAS DE MEJORA ═══\n' +
    (porCampo['tipo'] ? '// - El campo TIPO ha sido corregido ' + porCampo['tipo'] + ' veces. Revisa categorías.\n' : '') +
    (porCampo['calle'] ? '// - El campo CALLE ha sido corregido ' + porCampo['calle'] + ' veces. Extrae nombres de calles textuales exactamente.\n' : '') +
    (porCampo['colonia'] ? '// - El campo COLONIA ha sido corregido ' + porCampo['colonia'] + ' veces. Si no hay colonia explícita, deja vacío.\n' : '') +
    (porCampo['tiempo_dia'] ? '// - El campo MOMENTO DEL DÍA ha sido corregido ' + porCampo['tiempo_dia'] + ' veces. Solo usa mañana/tarde/noche/madrugada si hay hora explícita.\n' : '') +
    (porCampo['resumen'] ? '// - El campo RESUMEN ha sido corregido ' + porCampo['resumen'] + ' veces. Sé más conciso y objetivo.\n' : '') +
    '\n// ═══ PROMPT BASE ═══\n' + promptBase;

  var txtEl = document.getElementById('apr-prompt-txt');
  var areaEl = document.getElementById('apr-prompt-area');
  if (txtEl) txtEl.value = sugerencias;
  if (areaEl) areaEl.style.display = 'block';
}
window.verPromptSugerido = verPromptSugerido;

function copiarPrompt() {
  var txt = document.getElementById('apr-prompt-txt');
  if (!txt) return;
  txt.select();
  document.execCommand('copy');
  toast('Prompt copiado al portapapeles', 'ok');
}
window.copiarPrompt = copiarPrompt;

function iniciarAprende() {
  renderReglasBD();
  if (_aprData.length === 0) cargarAprendizaje();
}
window.iniciarAprende = iniciarAprende;

// ═══════════════════════════════════════════════════════════════
// BUSCADOR PREDICTIVO — Corpus BD
// ═══════════════════════════════════════════════════════════════

var _bdFiltroTexto = '';

function bdBuscarInput(val) {
  _bdFiltroTexto = val.trim().toLowerCase();
  var acLista = document.getElementById('bd-ac-lista');

  if (_bdFiltroTexto.length >= 2 && acLista) {
    var sugerencias = _bdGenerarSugerencias(_bdFiltroTexto);
    if (sugerencias.length > 0) {
      acLista.innerHTML = sugerencias.map(function(s) {
        return '<div onclick="bdSeleccionarSugerencia(\'' + s.texto.replace(/'/g, "\\'") + '\')" ' +
          'style="padding:6px 10px;font-size:8px;color:#c0e8ff;cursor:pointer;border-bottom:1px solid #0d2040;' +
          'font-family:monospace;display:flex;gap:6px;align-items:center;" ' +
          'onmouseover="this.style.background=\'#0d2040\'" onmouseout="this.style.background=\'\'">' +
          '<span style="font-size:7px;color:' + s.color + ';min-width:50px;">' + s.tipo + '</span>' +
          '<span>' + s.label + '</span>' +
          '</div>';
      }).join('');
      acLista.style.display = 'block';
    } else {
      acLista.style.display = 'none';
    }
  } else if (acLista) {
    acLista.style.display = 'none';
  }

  renderBD();
}
window.bdBuscarInput = bdBuscarInput;

function bdSeleccionarSugerencia(texto) {
  var input = document.getElementById('bd-buscador');
  if (input) input.value = texto;
  _bdFiltroTexto = texto.toLowerCase();
  bdBuscarCerrarAC();
  renderBD();
}
window.bdSeleccionarSugerencia = bdSeleccionarSugerencia;

function bdBuscarCerrarAC() {
  var acLista = document.getElementById('bd-ac-lista');
  if (acLista) acLista.style.display = 'none';
}
window.bdBuscarCerrarAC = bdBuscarCerrarAC;

function _bdGenerarSugerencias(q) {
  var vistos = {};
  var resultado = [];
  var COLORES = {
    seguridad: '#ff4466', accidente: '#ffa500', evento: '#00c864',
    rumor: '#888', desaparecido: '#ff88cc', gobierno: '#00ccff',
    politica: '#c040ff', salud: '#00e5a0', transporte: '#ffcc00',
    ambiental: '#88ff44', corrupcion: '#ff6600', crimen_organizado: '#ff2222'
  };
  for (var ni = 0; ni < noticias.length; ni++) {
    var n = noticias[ni];
    if (n.titulo && n.titulo.toLowerCase().indexOf(q) >= 0) {
      var key = 'tit:' + n.titulo.slice(0, 40);
      if (!vistos[key]) { vistos[key] = 1; resultado.push({ label: n.titulo.slice(0, 60), texto: n.titulo.slice(0, 60), tipo: n.tipo || 'rumor', color: COLORES[n.tipo] || '#888' }); }
    }
    if (n.colonia && n.colonia.toLowerCase().indexOf(q) >= 0) {
      var key2 = 'col:' + n.colonia;
      if (!vistos[key2]) { vistos[key2] = 1; resultado.push({ label: '📍 ' + n.colonia, texto: n.colonia, tipo: 'colonia', color: '#3a8aaa' }); }
    }
    if (n.calle && n.calle.toLowerCase().indexOf(q) >= 0) {
      var key3 = 'cal:' + n.calle;
      if (!vistos[key3]) { vistos[key3] = 1; resultado.push({ label: '🛣 ' + n.calle, texto: n.calle, tipo: 'calle', color: '#4a7a8a' }); }
    }
    if (n.fuente && n.fuente.toLowerCase().indexOf(q) >= 0) {
      var key4 = 'fue:' + n.fuente;
      if (!vistos[key4]) { vistos[key4] = 1; resultado.push({ label: '📰 ' + n.fuente, texto: n.fuente, tipo: 'fuente', color: '#6a5aaa' }); }
    }
  }
  return resultado.slice(0, 8);
}

// ── Hook en renderBD para aplicar filtro de texto ──
var _renderBDImplOriginal = _renderBDImpl;
_renderBDImpl = function() {
  if (_bdFiltroTexto) {
    var _noticiasBkp = noticias;
    noticias = noticias.filter(function(n) {
      var q = _bdFiltroTexto;
      return (n.titulo    && n.titulo.toLowerCase().indexOf(q)    >= 0) ||
             (n.colonia   && n.colonia.toLowerCase().indexOf(q)   >= 0) ||
             (n.calle     && n.calle.toLowerCase().indexOf(q)     >= 0) ||
             (n.fuente    && n.fuente.toLowerCase().indexOf(q)    >= 0) ||
             (n.resumen   && n.resumen.toLowerCase().indexOf(q)   >= 0) ||
             (n.nombres   && n.nombres.toLowerCase().indexOf(q)   >= 0) ||
             (n.comunidad && n.comunidad.toLowerCase().indexOf(q) >= 0);
    });
    _renderBDImplOriginal();
    noticias = _noticiasBkp;
  } else {
    _renderBDImplOriginal();
  }
};
