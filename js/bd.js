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
      renderBD();
      actualizarBadge();
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
  var query = cal2 ? (cal1 + ' esquina ' + cal2) : cal1;
  colEl.style.borderColor = '#00ccff';
  buscarColoniaOSM(query, function(col) {
    if (col && colEl) {
      colEl.value = col;
      colEl.style.borderColor = '#00ff88';
    } else if (cal2) {
      // Si fallo con interseccion, intentar solo con calle1
      buscarColoniaOSM(cal1, function(col2) {
        if (col2 && colEl) { colEl.value = col2; colEl.style.borderColor = '#ffcc00'; }
        else if (colEl) colEl.style.borderColor = '';
      });
    } else if (colEl) { colEl.style.borderColor = ''; }
  });
}
window.autoColonia = autoColonia;

// Recalcular colonia cuando se llena calle2 (mas preciso que solo calle1)
function autoColoniaCalle2(id) {
  var cal1El = document.getElementById(id + '-cal1');
  var cal2El = document.getElementById(id + '-cal2');
  var colEl = document.getElementById(id + '-col');
  if (!cal1El || !cal2El || !colEl) return;
  var cal1 = cal1El.value.trim();
  var cal2 = cal2El.value.trim();
  // Solo recalcular si hay ambas calles
  if (!cal1 || !cal2) return;
  colEl.style.borderColor = '#00ccff';
  buscarColoniaOSM(cal1 + ' esquina ' + cal2, function(col) {
    if (col && colEl) {
      colEl.value = col;
      colEl.style.borderColor = '#00ff88';
      toast('Colonia actualizada con interseccion', 'ok');
    } else {
      colEl.style.borderColor = '';
    }
  });
}
window.autoColoniaCalle2 = autoColoniaCalle2;

// Buscar colonia en OpenStreetMap Nominatim
function buscarColoniaOSM(calle, callback) {
  // Bounding box del municipio completo de Irapuato (incluye rancherias y comunidades rurales)
  // SW: 20.45,-101.60  NE: 20.85,-101.10
  var bbox = '20.45,-101.60,20.85,-101.10';
  var query = calle + ', Irapuato, Guanajuato, Mexico';
  var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query) +
    '&format=json&addressdetails=1&limit=3&countrycodes=mx&viewbox=-101.60,20.85,-101.10,20.45&bounded=1';
  fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'IrapuatoIntel/1.0' } })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data && data[0] && data[0].address) {
      var addr = data[0].address;
      // Prioridad: colonia > barrio > localidad rural > municipio de referencia
      var colonia = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district ||
                    addr.village || addr.hamlet || addr.locality || '';
      // Si la referencia es rural, agregar municipio para mayor contexto
      if (!addr.suburb && !addr.neighbourhood && (addr.village || addr.hamlet)) {
        colonia = (addr.village || addr.hamlet || '') + (addr.municipality ? ', ' + addr.municipality : '');
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
    if (resEl && r.resumen) resEl.textContent = r.resumen;

    // Rellenar campos editables
    var titEl = document.getElementById(id + '-tit');
    if (titEl) {
      if (r.titulo === 'SIN CONTENIDO') {
        // El texto era basura (footer/menú) — avisar al usuario
        var card = document.getElementById(id);
        if (card) card.style.opacity = '0.5';
        var confEl2 = document.getElementById(id + '-conf');
        if (confEl2) { confEl2.textContent = '⚠ TEXTO NO VÁLIDO'; confEl2.style.color = '#ff8800'; }
        titEl.value = 'SIN CONTENIDO — descarta esta tarjeta';
      } else if (r.titulo && r.titulo.length < 120) {
        titEl.value = r.titulo;
      } else if (r.resumen) {
        titEl.value = r.resumen.split('.')[0].slice(0,80).trim();
      }
    }
    var tipoEl = document.getElementById(id + '-tipo');
    if (tipoEl && r.tipo) tipoEl.value = r.tipo;
    var lugEl = document.getElementById(id + '-lug');
    if (lugEl && r.lugar) lugEl.value = r.lugar;
    var sumEl = document.getElementById(id + '-sum');
    if (sumEl && r.resumen) sumEl.value = r.resumen.slice(0,200);
    var cal1El = document.getElementById(id + '-cal1');
    if (cal1El) cal1El.value = r.calle1 || r.calle || '';
    var cal2El = document.getElementById(id + '-cal2');
    if (cal2El) cal2El.value = r.calle2 || '';
    var colEl = document.getElementById(id + '-col');
    if (colEl) colEl.value = r.colonia || '';
    // Si hay calle pero no colonia, buscar en OSM
    if ((r.calle1 || r.calle) && !r.colonia) {
      var calBuscar = r.calle1 || r.calle;
      buscarColoniaOSM(calBuscar, function(coloniaOSM) {
        if (coloniaOSM && colEl) colEl.value = coloniaOSM;
      });
    }
    var comEl = document.getElementById(id + '-com');
    if (comEl) comEl.value = r.comunidad || '';
    var nomEl = document.getElementById(id + '-nom');
    if (nomEl) nomEl.value = r.nombres || '';
    var fevEl = document.getElementById(id + '-fev');
    if (fevEl) fevEl.value = r.fecha_evento || '';
    var tdiaEl = document.getElementById(id + '-tdia');
    if (tdiaEl && r.tiempo_dia) tdiaEl.value = r.tiempo_dia;
    // Mostrar nombres si los hay
    var nomDiv = document.getElementById(id + '-nombres');
    if (nomDiv && r.nombres) { nomDiv.style.display = 'block'; nomDiv.textContent = 'Implicados: ' + r.nombres; }

    // Guardar datos en el card para el aprobar
    var card = document.getElementById(id);
    if (card) {
      card.dataset.lat = r.lat || 20.6795;
      card.dataset.lng = r.lng || -101.3540;
      card.dataset.colonia = r.colonia || '';
      card.dataset.confianza = r.confianza || 'baja';
      // Guardar snapshot completo de lo que propuso la IA
      card.dataset.ia_raw = JSON.stringify({
        titulo: r.titulo || '',
        tipo: r.tipo || 'rumor',
        tipo2: r.tipo2 || '',
        calle: r.calle1 || r.calle || '',
        calle2: r.calle2 || '',
        colonia: r.colonia || '',
        comunidad: r.comunidad || '',
        nombres: r.nombres || '',
        fecha_evento: r.fecha_evento || '',
        tiempo_dia: r.tiempo_dia || 'desconocido',
        resumen: r.resumen || '',
        confianza: r.confianza || 'baja',
        lat: r.lat || 20.6795,
        lng: r.lng || -101.3540
      });
    }

    // Mostrar edicion automaticamente
    var editEl = document.getElementById(id + '-edit');
    if (editEl) editEl.className = 'nc-edit visible';

    toast('✓ Análisis completo', 'ok');
  });
}
window.analizarConIA = analizarConIA;

function toggleEdit(id) {
  var el = document.getElementById(id + '-edit');
  if (!el) return;
  el.className = el.className.indexOf('visible') >= 0 ? 'nc-edit' : 'nc-edit visible';
}
window.toggleEdit = toggleEdit;

function aprobarCard(id, fuente, link) {
  var card = document.getElementById(id);
  if (!card) return;
  // Fallback: leer URL del dataset si no viene en parámetro
  if (!link && card.dataset.url) link = card.dataset.url;
  if (!link && card.dataset.link) link = card.dataset.link;
  var titulo = (document.getElementById(id + '-tit') ? document.getElementById(id + '-tit').value : '') || card.querySelector('.nc-titulo').textContent;
  var tipo = document.getElementById(id + '-tipo') ? document.getElementById(id + '-tipo').value : 'rumor';
  var card2 = document.getElementById(id);
  var tipo2 = (card2 && card2.dataset.tipo2) ? card2.dataset.tipo2 : (document.getElementById(id + '-tipo2') ? document.getElementById(id + '-tipo2').value : '');
  var lugar = document.getElementById(id + '-lug') ? document.getElementById(id + '-lug').value : 'Irapuato';
  var calle = document.getElementById(id + '-cal1') ? document.getElementById(id + '-cal1').value : (document.getElementById(id + '-cal') ? document.getElementById(id + '-cal').value : '');
  var calle2 = document.getElementById(id + '-cal2') ? document.getElementById(id + '-cal2').value : '';
  var colonia = document.getElementById(id + '-col') ? document.getElementById(id + '-col').value : (card.dataset.colonia || '');
  var comunidad = document.getElementById(id + '-com') ? document.getElementById(id + '-com').value : '';
  var nombres = document.getElementById(id + '-nom') ? document.getElementById(id + '-nom').value : '';
  var fechaEvento = document.getElementById(id + '-fev') ? document.getElementById(id + '-fev').value : '';
  var tiempodia = document.getElementById(id + '-tdia') ? document.getElementById(id + '-tdia').value : 'desconocido';
  var resumen = document.getElementById(id + '-sum') ? document.getElementById(id + '-sum').value : '';

  var ahora = new Date();
  var fechaCaptura = ahora.getDate() + '/' + (ahora.getMonth()+1) + '/' + ahora.getFullYear() + ' ' + ahora.getHours() + ':' + (ahora.getMinutes()<10?'0':'') + ahora.getMinutes();

  // Snapshot final del usuario al aprobar
  var usuario_aprobacion = {
    titulo: titulo.trim(),
    tipo: tipo,
    tipo2: tipo2 || '',
    calle: calle.trim(),
    calle2: calle2.trim(),
    colonia: colonia.trim(),
    comunidad: comunidad.trim(),
    nombres: nombres.trim(),
    fecha_evento: fechaEvento.trim(),
    tiempo_dia: tiempodia,
    resumen: resumen.trim()
  };

  // Recuperar snapshot de la IA si existe
  var ia_raw = null;
  try {
    if (card.dataset.ia_raw) ia_raw = JSON.parse(card.dataset.ia_raw);
  } catch(e) {}

  // Calcular diff: campos donde el usuario cambió lo que propuso la IA
  var diff = {};
  if (ia_raw) {
    Object.keys(usuario_aprobacion).forEach(function(k) {
      var iaVal = (ia_raw[k] || '').toString().trim();
      var usrVal = (usuario_aprobacion[k] || '').toString().trim();
      if (iaVal !== usrVal) {
        diff[k] = { ia: iaVal, usuario: usrVal };
      }
    });
  }

  var noticia = {
    titulo: titulo.trim(),
    tipo: tipo,
    tipo2: tipo2 || '',
    lugar: lugar.trim(),
    calle: calle.trim(),
    calle2: calle2.trim(),
    colonia: colonia.trim(),
    comunidad: comunidad.trim(),
    nombres: nombres.trim(),
    fecha_evento: fechaEvento.trim(),
    tiempo_dia: tiempodia,
    resumen: resumen.trim(),
    fuente: fuente || fuenteManual,
    url: link || '',
    lat: parseFloat(card.dataset.lat) || 20.6795,
    lng: parseFloat(card.dataset.lng) || -101.3540,
    confianza: card.dataset.confianza || 'baja',
    score_veracidad: (fuente === 'El Sol - Policiaca' || fuente === 'El Sol - Local' || fuente === 'AM Irapuato' || fuente === 'Periódico Correo' || fuente === 'Tinta Negra — Irapuato') ? 0.9 : (fuente === 'Ciudadano' ? 0.5 : 0.7),
    fechaCaptura: fechaCaptura,
    viaIA: true,
    ts: Date.now(),
    fechaGuardado: firebase.firestore.FieldValue.serverTimestamp(),
    // Sistema de aprendizaje
    ia_raw: ia_raw || null,
    usuario_aprobacion: usuario_aprobacion,
    aprendizaje_diff: diff,
    aprendizaje_campos_corregidos: Object.keys(diff)
  };

  if (db) {
    // Guardar en base geográfica si hay datos de ubicación
    if (noticia.calle || noticia.colonia) {
      var geoKey = ((noticia.calle || '') + '-' + (noticia.colonia || '')).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
      db.collection('geo-irapuato').doc(geoKey).set({
        calle: noticia.calle,
        colonia: noticia.colonia,
        comunidad: noticia.comunidad,
        lat: noticia.lat,
        lng: noticia.lng,
        veces: firebase.firestore.FieldValue.increment(1),
        ultimaVez: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    db.collection('noticias-fase1').add(noticia)
    .then(function() {
      toast('Noticia guardada', 'ok');
      // Enviar a Make.com si webhook configurado
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
// Criterio: misma fecha_evento + coordenadas < 100m (≈1 calle) O relacionadas_ids explícitas
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

      // Vinculación explícita (solo un sentido para evitar ciclos — el que tenga el id en su lista)
      var esExplicita = explicitasIds.indexOf(m.id) >= 0;

      // Vinculación automática: misma fecha_evento (exacta, no vacía) + coordenadas < 100m
      var esAutomatica = false;
      if (!esExplicita && n.fecha_evento && n.fecha_evento.length > 0 &&
          m.fecha_evento && m.fecha_evento === n.fecha_evento) {
        var latN = parseFloat(n.lat), lngN = parseFloat(n.lng);
        var latM = parseFloat(m.lat), lngM = parseFloat(m.lng);
        // Solo si ambas tienen coordenadas no genéricas
        if (!isNaN(latN) && !isNaN(latM) &&
            Math.abs(latN - 20.6795) > 0.0001 && Math.abs(latM - 20.6795) > 0.0001) {
          if (distanciaMetros(latN, lngN, latM, lngM) < 100) esAutomatica = true;
        }
      }

      if (esExplicita || esAutomatica) {
        grupo.relacionadas.push(m);
        usadas[m.id] = true;
      }
    }

    // Elegir principal: resumen más largo
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
  if (_renderBDActivo) return; // evitar re-entrancia
  _renderBDActivo = true;
  try { _renderBDImpl(); } finally { _renderBDActivo = false; }
}

function _renderBDImpl() {
  var lista = document.getElementById('lista-bd');
  var base = (filtroBD === 'todos' ? noticias.slice() : noticias.filter(function(n) { return n.tipo === filtroBD; }));
  base.sort(comparadorBD);

  // Stats
  document.getElementById('stat-tot').textContent = noticias.length;
  document.getElementById('stat-seg').textContent = noticias.filter(function(n){ return n.tipo==='seguridad'; }).length;
  document.getElementById('stat-acc').textContent = noticias.filter(function(n){ return n.tipo==='accidente'; }).length;
  document.getElementById('stat-eve').textContent = noticias.filter(function(n){ return n.tipo==='evento'; }).length;
  var statDesp = document.getElementById('stat-desp');
  if (statDesp) statDesp.textContent = noticias.filter(function(n){ return n.tipo==='desaparecido'; }).length;

  if (base.length === 0) {
    lista.innerHTML = '<div class="vacio"><div class="vacio-ico">base</div>Sin noticias ' + (filtroBD !== 'todos' ? 'de tipo ' + filtroBD : 'aprobadas') + ' aun.</div>';
    return;
  }

  // Agrupar
  var grupos = agruparNoticias(base);
  lista.innerHTML = '';

  for (var gi = 0; gi < grupos.length; gi++) {
    var g = grupos[gi];
    var n = g.principal;
    var relacionadas = g.relacionadas;
    var fecha = n.fechaCaptura || '';
    if (!fecha && n.fechaGuardado && n.fechaGuardado.toDate) {
      fecha = n.fechaGuardado.toDate().toLocaleDateString('es-MX', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    }
    var div = document.createElement('div');
    div.className = 'bd-card';
    div.id = 'bd-' + n.id;

    var extraInfo = '';
    if (n.calle) extraInfo += '<span class="nc-lugar">Calle: ' + n.calle + '</span>';
    if (n.colonia) extraInfo += '<span class="nc-lugar">Col: ' + n.colonia + '</span>';
    if (n.comunidad) extraInfo += '<span class="nc-lugar">Com: ' + n.comunidad + '</span>';
    if (n.nombres) extraInfo += '<span style="color:#ffa500;font-size:7px;">Nombres: ' + n.nombres + '</span>';

    // HTML de sección "noticias relacionadas" para BD
    var relHtml = '';
    if (relacionadas.length > 0) {
      var relItems = '';
      for (var ri = 0; ri < relacionadas.length; ri++) {
        var r = relacionadas[ri];
        var rfecha = r.fechaCaptura ? r.fechaCaptura.split(' ')[0] : (r.fecha_evento || '');
        relItems +=
          '<div class="rel-item" onclick="abrirRelModal(\'' + r.id + '\')">' +
            '<div class="rel-item-tit">' + (r.titulo||'Sin título') + '</div>' +
            '<div class="rel-item-meta">' + (r.fuente||'') + '<br>' + rfecha + '</div>' +
          '</div>';
      }
      relHtml =
        '<div style="margin-top:6px;">' +
          '<button class="rel-btn" onclick="toggleRelLista(\'' + n.id + '\')">' +
            '<span class="rel-badge">' + relacionadas.length + '</span>' +
            '&#128240; VER NOTICIAS RELACIONADAS' +
          '</button>' +
          '<div class="rel-lista" id="rel-lista-' + n.id + '">' + relItems + '</div>' +
        '</div>';
    }

    // Campo de gestión manual de relacionadas en el panel de edición
    var relEditItems = '';
    var todasRel = relacionadas.concat();
    // Agregar las que están explícitamente vinculadas a otras no en este grupo visual
    var idsExplicitas = Array.isArray(n.relacionadas_ids) ? n.relacionadas_ids : [];
    for (var rei = 0; rei < todasRel.length; rei++) {
      var re = todasRel[rei];
      relEditItems +=
        '<div class="rel-edit-item">' +
          '<span class="rel-edit-item-tit">' + (re.titulo||'').slice(0,50) + '</span>' +
          '<span style="font-size:6.5px;color:var(--muted);margin:0 4px;">' + (re.fuente||'') + '</span>' +
          '<button class="rel-edit-rm" onclick="quitarRelacionada(\'' + n.id + '\',\'' + re.id + '\')" title="Quitar vinculación">&#10005;</button>' +
        '</div>';
    }
    var relEditHtml =
      '<div class="rel-edit-wrap">' +
        '<div class="rel-edit-label">NOTICIAS RELACIONADAS</div>' +
        '<div class="rel-edit-list" id="rel-edit-list-' + n.id + '">' +
          (relEditItems || '<div style="font-size:7px;color:#2a4a6a;padding:3px 0;">Sin relacionadas vinculadas</div>') +
        '</div>' +
        '<div style="display:flex;gap:4px;margin-top:2px;">' +
          '<input id="rel-add-id-' + n.id + '" class="nc-input" placeholder="ID de noticia a vincular" style="flex:1;font-size:7.5px;">' +
          '<button onclick="agregarRelacionada(\'' + n.id + '\')" style="padding:4px 8px;font-family:var(--title);font-size:6.5px;letter-spacing:.5px;background:rgba(176,96,255,.1);color:#b060ff;border:1px solid #b060ff55;border-radius:3px;cursor:pointer;white-space:nowrap;">+ VINCULAR</button>' +
        '</div>' +
        '<div id="rel-edit-status-' + n.id + '" style="font-size:7px;color:#3a7ab8;min-height:10px;margin-top:2px;"></div>' +
      '</div>';

    div.innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
        '<button style="padding:8px;font-family:var(--title);font-size:8px;font-weight:700;background:rgba(0,200,255,.1);color:#00c8ff;border:1px solid #00c8ff;border-radius:3px;cursor:pointer;" onclick="editarBD(\'' + n.id + '\')">EDITAR</button>' +
        '<button style="padding:8px;font-family:var(--title);font-size:8px;font-weight:700;background:rgba(255,50,50,.1);color:#ff5050;border:1px solid #ff5050;border-radius:3px;cursor:pointer;" onclick="eliminarBD(\'' + n.id + '\')">ELIMINAR</button>' +
      '</div>' +
      '<span class="bd-tipo ' + (n.tipo||'rumor') + '">' + (n.tipo||'rumor').toUpperCase() + '</span>' +
      (n.tipo2 ? ' <span class="bd-tipo ' + n.tipo2 + '" style="margin-left:4px;opacity:.7;">' + n.tipo2.toUpperCase() + '</span>' : '') +
      (n.tiempo_dia && n.tiempo_dia !== 'desconocido' ? ' <span class="bd-tiempo ' + n.tiempo_dia + '">' + n.tiempo_dia.toUpperCase() + '</span>' : '') +
      '<div class="bd-card-tit" onclick="verDetallesBD(\'' + n.id + '\')" style="cursor:pointer;text-decoration:underline;text-decoration-color:#00c8ff44;margin-top:4px;">' + (n.titulo||'Sin titulo') + '</div>' +
      (n.resumen ? '<div style="font-size:8px;color:#5a8aaa;line-height:1.5;margin-top:4px;padding-top:4px;border-top:1px solid #0d2040;">' + n.resumen + '</div>' : '') +
      relHtml +
      '<div class="bd-card-meta" style="margin-top:4px;">' +
        '<span class="nc-fuente">' + (n.fuente||'') + '</span>' +
        (n.calle ? '<span class="nc-lugar">&#128205; ' + n.calle + (n.calle2 ? ' / ' + n.calle2 : '') + '</span>' : '') +
        (n.colonia ? '<span class="nc-lugar">Col: ' + n.colonia + '</span>' : '') +
        (n.comunidad ? '<span class="nc-lugar">Com: ' + n.comunidad + '</span>' : '') +
        (n.nombres ? '<span style="color:#ffa500;font-size:7px;">Implicados: ' + n.nombres + '</span>' : '') +
        '<span style="color:var(--muted);font-size:7px;">Captura: ' + fecha + (n.fecha_evento ? ' | Evento: ' + n.fecha_evento : '') + '</span>' +
        ((n.url||n.link) ? '<div style="margin-top:6px;"><a href="' + (n.url||n.link) + '" target="_blank" rel="noopener" style="font-family:var(--title);font-size:7px;font-weight:700;color:#00f5ff;text-decoration:none;border:1px solid #00f5ff44;padding:3px 8px;border-radius:2px;background:rgba(0,245,255,.08);letter-spacing:1px;">&#128279; VER NOTICIA</a></div>' : '') +
        (n.lat && n.lat !== 20.6795 ?
          '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">' +
            '<span style="font-family:var(--title);font-size:5.5px;color:#3a5a7a;letter-spacing:1px;align-self:center;">📍 VER EN:</span>' +
            '<button onclick="verEnMapa(\'mapa\',' + n.lat + ',' + n.lng + ')" style="padding:3px 7px;font-family:var(--title);font-size:6px;letter-spacing:.5px;border-radius:3px;cursor:pointer;border:1px solid #00ff8855;background:rgba(0,255,136,.06);color:#00ff88;">🗺 MAPA</button>' +
            '<button onclick="verEnMapa(\'intel\',' + n.lat + ',' + n.lng + ')" style="padding:3px 7px;font-family:var(--title);font-size:6px;letter-spacing:.5px;border-radius:3px;cursor:pointer;border:1px solid #ff225555;background:rgba(255,34,85,.06);color:#ff6688;">⚡ INTEL</button>' +
            '<button onclick="verEnMapa(\'denue\',' + n.lat + ',' + n.lng + ')" style="padding:3px 7px;font-family:var(--title);font-size:6px;letter-spacing:.5px;border-radius:3px;cursor:pointer;border:1px solid #ffcc0055;background:rgba(255,204,0,.06);color:#ffcc00;">💰 ECON.</button>' +
            '<button onclick="verEnMapa(\'gobierno\',' + n.lat + ',' + n.lng + ')" style="padding:3px 7px;font-family:var(--title);font-size:6px;letter-spacing:.5px;border-radius:3px;cursor:pointer;border:1px solid #00ccff55;background:rgba(0,204,255,.06);color:#00ccff;">🏛 GOB.</button>' +
          '</div>'
        : '') +
      '</div>' +
      '<div id="bd-edit-' + n.id + '" style="display:none;margin-top:8px;border-top:1px solid #0d2040;padding-top:8px;">' +
        '<select id="bde-tipo-' + n.id + '" class="nc-select" style="margin-bottom:4px;">' +
          '<option value="seguridad"' + (n.tipo==='seguridad'?' selected':'') + '>Seguridad</option>' +
          '<option value="accidente"' + (n.tipo==='accidente'?' selected':'') + '>Accidente</option>' +
          '<option value="evento"' + (n.tipo==='evento'?' selected':'') + '>Evento</option>' +
          '<option value="rumor"' + (n.tipo==='rumor'?' selected':'') + '>Rumor</option>' +
          '<option value="desaparecido"' + (n.tipo==='desaparecido'?' selected':'') + '>Desaparecido</option>' +
          '<option value="gobierno"' + (n.tipo==='gobierno'?' selected':'') + '>Gobierno</option>' +
          '<option value="politica"' + (n.tipo==='politica'?' selected':'') + '>Política</option>' +
          '<option value="salud"' + (n.tipo==='salud'?' selected':'') + '>Salud</option>' +
          '<option value="transporte"' + (n.tipo==='transporte'?' selected':'') + '>Transporte/Vialidad</option>' +
        '</select>' +
        '<input id="bde-tit-' + n.id + '" class="nc-input" value="' + (n.titulo||'').replace(/"/g,'') + '" placeholder="Titulo" style="margin-bottom:4px;">' +
        '<input id="bde-cal-' + n.id + '" class="nc-input" value="' + (n.calle||'').replace(/"/g,'') + '" placeholder="Calle 1" style="margin-bottom:4px;">' +
        '<input id="bde-cal2-' + n.id + '" class="nc-input" value="' + (n.calle2||'').replace(/"/g,'') + '" placeholder="Calle 2 (esquina/cruce)" style="margin-bottom:4px;">' +
        '<input id="bde-col-' + n.id + '" class="nc-input" value="' + (n.colonia||'').replace(/"/g,'') + '" placeholder="Colonia" style="margin-bottom:4px;">' +
        '<input id="bde-com-' + n.id + '" class="nc-input" value="' + (n.comunidad||'').replace(/"/g,'') + '" placeholder="Comunidad" style="margin-bottom:4px;">' +
        '<input id="bde-nom-' + n.id + '" class="nc-input" value="' + (n.nombres||'').replace(/"/g,'') + '" placeholder="Nombres implicados" style="margin-bottom:6px;">' +
        '<input id="bde-fev-' + n.id + '" class="nc-input" value="' + (n.fecha_evento||'') + '" placeholder="Fecha evento DD/MM/YYYY" style="margin-bottom:4px;">' +
        '<textarea id="bde-res-' + n.id + '" class="nc-input" placeholder="Resumen" style="min-height:60px;resize:vertical;margin-bottom:4px;">' + (n.resumen||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea>' +
        '<select id="bde-tdia-' + n.id + '" class="nc-select" style="margin-bottom:6px;">' +
          '<option value="desconocido"' + (n.tiempo_dia==='desconocido'||!n.tiempo_dia?' selected':'') + '>Momento: Desconocido</option>' +
          '<option value="manana"' + (n.tiempo_dia==='manana'?' selected':'') + '>Manana (6-12h)</option>' +
          '<option value="tarde"' + (n.tiempo_dia==='tarde'?' selected':'') + '>Tarde (12-19h)</option>' +
          '<option value="noche"' + (n.tiempo_dia==='noche'?' selected':'') + '>Noche (19-24h)</option>' +
          '<option value="madrugada"' + (n.tiempo_dia==='madrugada'?' selected':'') + '>Madrugada (0-6h)</option>' +
        '</select>' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:4px 0 2px;">ENLACE / URL</div>' +
        '<input id="bde-url-' + n.id + '" class="nc-input" placeholder="https://..." style="margin-bottom:6px;font-size:8px;" value="">' +
        '<div style="font-family:var(--mono);font-size:7px;color:#3a5a7a;padding:4px 0 2px;">COORDENADAS MANUALES (lat, lng) — sobreescribe autubicación</div>' +
        '<input id="bde-coords-' + n.id + '" class="nc-input" value="' + (n.lat && n.lat !== 20.6795 ? (n.lat + ', ' + n.lng) : '') + '" placeholder="Ej: 20.6510, -101.3780" style="margin-bottom:6px;font-size:8px;">' +
        relEditHtml +
        '<button onclick="guardarEditBD(\'' + n.id + '\')" style="width:100%;padding:8px;background:rgba(0,255,136,.1);color:#00ff88;border:1px solid #00ff88;font-family:var(--title);font-size:8px;cursor:pointer;margin-bottom:4px;margin-top:8px;">GUARDAR CAMBIOS</button>' +
        '<div style="display:flex;gap:4px;">' +
          '<button id="bde-btn-pos-' + n.id + '" onclick="posicionarBDEnIntel(\'' + n.id + '\')" style="flex:1;padding:6px;background:rgba(0,200,100,.08);color:#00c864;border:1px solid #00c864;font-family:var(--title);font-size:7px;cursor:pointer;letter-spacing:.5px;">📍 AUTO-UBICAR</button>' +
          '<button id="bde-btn-del-' + n.id + '" onclick="quitarDeIntel(\'' + n.id + '\')" style="flex:1;padding:6px;background:rgba(255,34,85,.06);color:#ff2255;border:1px solid #ff2255;font-family:var(--title);font-size:7px;cursor:pointer;letter-spacing:.5px;">🗑 QUITAR MAPA</button>' +
        '</div>' +
        '<div id="bde-geo-status-' + n.id + '" style="font-size:7px;color:#3a7ab8;margin-top:3px;min-height:12px;"></div>' +
      '</div>';
    lista.appendChild(div);
    // Setear URL después de insertar al DOM (evita script inline problemático en móvil)
    var urlInput = document.getElementById('bde-url-' + n.id);
    if (urlInput) urlInput.value = n.url || n.link || '';
  }
}

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

// ── Toggle desplegable de lista de relacionadas en BD ──
function toggleRelLista(id) {
  var lista = document.getElementById('rel-lista-' + id);
  if (!lista) return;
  lista.classList.toggle('visible');
}
window.toggleRelLista = toggleRelLista;

// ── Abrir modal flotante con resumen de una noticia relacionada ──
function abrirRelModal(id) {
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;
  var html =
    '<div class="rel-modal-tit">' + (n.titulo||'Sin título') + '</div>' +
    '<div class="rel-modal-fuente">&#128240; ' + (n.fuente||'Fuente desconocida') + (n.fecha_evento ? ' &nbsp;|&nbsp; ' + n.fecha_evento : '') + '</div>' +
    '<div class="rel-modal-res">' + (n.resumen || '<span style="color:#2a4a6a;font-style:italic;">Sin resumen disponible</span>') + '</div>' +
    ((n.url||n.link) ? '<a class="rel-modal-link" href="' + (n.url||n.link) + '" target="_blank" rel="noopener">&#128279; ENLACE</a>' : '');
  document.getElementById('rel-modal-contenido').innerHTML = html;
  document.getElementById('rel-modal').className = 'rel-modal visible';
}
window.abrirRelModal = abrirRelModal;

function cerrarRelModal(e) {
  if (e && e.target && e.target.id !== 'rel-modal') return;
  document.getElementById('rel-modal').className = 'rel-modal';
}
window.cerrarRelModal = cerrarRelModal;

function cerrarRelModalBtn() {
  document.getElementById('rel-modal').className = 'rel-modal';
}
window.cerrarRelModalBtn = cerrarRelModalBtn;

// ── Vincular manualmente dos noticias como relacionadas ──
function agregarRelacionada(id) {
  var input = document.getElementById('rel-add-id-' + id);
  var status = document.getElementById('rel-edit-status-' + id);
  if (!input || !input.value.trim()) { if (status) { status.textContent = 'Introduce el ID de la noticia'; status.style.color = '#ff4455'; } return; }
  var idB = input.value.trim();
  // Verificar que existe
  var existe = false;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === idB) { existe = true; break; } }
  if (!existe) { if (status) { status.textContent = 'ID no encontrado en BD local'; status.style.color = '#ff4455'; } return; }
  if (idB === id) { if (status) { status.textContent = 'No puedes vincular una noticia consigo misma'; status.style.color = '#ff4455'; } return; }

  if (!db) { if (status) { status.textContent = 'Firebase no disponible'; status.style.color = '#ff4455'; } return; }

  // Actualizar los relacionadas_ids de ambas noticias en Firebase
  var notA = null, notB = null;
  for (var j = 0; j < noticias.length; j++) {
    if (noticias[j].id === id) notA = noticias[j];
    if (noticias[j].id === idB) notB = noticias[j];
  }
  var idsA = Array.isArray(notA.relacionadas_ids) ? notA.relacionadas_ids.slice() : [];
  var idsB = Array.isArray(notB.relacionadas_ids) ? notB.relacionadas_ids.slice() : [];
  if (idsA.indexOf(idB) < 0) idsA.push(idB);
  if (idsB.indexOf(id) < 0) idsB.push(id);

  if (status) { status.textContent = 'Guardando...'; status.style.color = '#ffcc00'; }
  var batch = db.batch();
  batch.update(db.collection('noticias-fase1').doc(id), { relacionadas_ids: idsA });
  batch.update(db.collection('noticias-fase1').doc(idB), { relacionadas_ids: idsB });
  batch.commit()
    .then(function() {
      notA.relacionadas_ids = idsA;
      notB.relacionadas_ids = idsB;
      input.value = '';
      if (status) { status.textContent = '✓ Vinculadas'; status.style.color = '#00ff88'; }
      renderBD();
      toast('Noticias vinculadas como relacionadas', 'ok');
    })
    .catch(function(e) {
      if (status) { status.textContent = 'Error: ' + e.message; status.style.color = '#ff4455'; }
    });
}
window.agregarRelacionada = agregarRelacionada;

// ── Quitar vínculo de noticia relacionada ──
function quitarRelacionada(idA, idB) {
  if (!db) return;
  var notA = null, notB = null;
  for (var j = 0; j < noticias.length; j++) {
    if (noticias[j].id === idA) notA = noticias[j];
    if (noticias[j].id === idB) notB = noticias[j];
  }
  if (!notA) return;
  var idsA = Array.isArray(notA.relacionadas_ids) ? notA.relacionadas_ids.filter(function(x){ return x !== idB; }) : [];
  var batch = db.batch();
  batch.update(db.collection('noticias-fase1').doc(idA), { relacionadas_ids: idsA });
  if (notB) {
    var idsB = Array.isArray(notB.relacionadas_ids) ? notB.relacionadas_ids.filter(function(x){ return x !== idA; }) : [];
    batch.update(db.collection('noticias-fase1').doc(idB), { relacionadas_ids: idsB });
    notB.relacionadas_ids = idsB;
  }
  notA.relacionadas_ids = idsA;
  batch.commit()
    .then(function() { renderBD(); toast('Vínculo eliminado', 'ok'); })
    .catch(function(e) { toast('Error: ' + e.message, 'err'); });
}
window.quitarRelacionada = quitarRelacionada;

function verDetallesBD(id) {
  var n = null;
  for (var i = 0; i < noticias.length; i++) { if (noticias[i].id === id) { n = noticias[i]; break; } }
  if (!n) return;

  var tiempoHtml = '';
  if (n.tiempo_dia && n.tiempo_dia !== 'desconocido') {
    tiempoHtml = '<span class="bd-tiempo ' + n.tiempo_dia + '">' + n.tiempo_dia.toUpperCase() + '</span>';
  }

  var html = '<div class="bd-modal-titulo">' + tiempoHtml + ' ' + (n.titulo||'Sin titulo') + '</div>';
  html += '<div class="bd-mf"><div class="bd-ml">TIPO</div><div class="bd-mv"><span class="bd-tipo ' + (n.tipo||'rumor') + '">' + (n.tipo||'').toUpperCase() + '</span>' + (n.tipo2 ? '<span class="bd-tipo ' + n.tipo2 + '" style="margin-left:6px;opacity:.8;">' + n.tipo2.toUpperCase() + '</span>' : '') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">RESUMEN</div><div class="bd-mv">' + (n.resumen || '<span class="vacio">Sin resumen</span>') + '</div></div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;">';
  html += '<div class="bd-mf"><div class="bd-ml">CALLE 1</div><div class="bd-mv ' + (n.calle?'':'vacio') + '">' + (n.calle||'No registrada') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">CALLE 2</div><div class="bd-mv ' + (n.calle2?'':'vacio') + '">' + (n.calle2||'No registrada') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">COLONIA</div><div class="bd-mv ' + (n.colonia?'':'vacio') + '">' + (n.colonia||'No registrada') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">COMUNIDAD</div><div class="bd-mv ' + (n.comunidad?'':'vacio') + '">' + (n.comunidad||'No registrada') + '</div></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;">';
  html += '<div class="bd-mf"><div class="bd-ml">FECHA EVENTO</div><div class="bd-mv ' + (n.fecha_evento?'':'vacio') + '">' + (n.fecha_evento||'No identificada') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">MOMENTO</div><div class="bd-mv ' + (n.tiempo_dia?'':'vacio') + '">' + (n.tiempo_dia||'Desconocido') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">FECHA CAPTURA</div><div class="bd-mv">' + (n.fechaCaptura||'') + '</div></div>';
  html += '<div class="bd-mf"><div class="bd-ml">CONFIANZA IA</div><div class="bd-mv">' + (n.confianza||'baja').toUpperCase() + '</div></div>';
  html += '</div>';

  if (n.nombres) { html += '<div class="bd-mf"><div class="bd-ml">PERSONAS IMPLICADAS</div><div class="bd-mv" style="color:#ffa500;">' + n.nombres + '</div></div>'; }
  html += '<div class="bd-mf"><div class="bd-ml">FUENTE</div><div class="bd-mv"><a href="' + (n.url||'#') + '" target="_blank" style="color:var(--cyan);">' + (n.fuente||'') + '</a></div></div>';

  // Mini mapa si tiene coordenadas
  var lat = parseFloat(n.lat) || 20.6795;
  var lng = parseFloat(n.lng) || -101.3540;
  var tieneUbicacion = (n.calle || n.colonia || n.comunidad || (lat !== 20.6795 || lng !== -101.3540));
  if (tieneUbicacion) {
    html += '<div class="bd-ml" style="margin-top:10px;margin-bottom:4px;">UBICACION</div>';
    html += '<div id="bd-mini-mapa"></div>';
    // Botón para ir al mapa principal centrado en esta noticia
    html += '<button onclick="irAlMapaEn(' + lat + ',' + lng + ')" style="width:100%;margin-top:6px;padding:7px;font-family:var(--title);font-size:7px;letter-spacing:1px;background:rgba(0,245,255,.06);color:var(--cyan);border:1px solid #00f5ff33;border-radius:3px;cursor:pointer;">&#128506; ABRIR EN MAPA COMPLETO</button>';
  }

  document.getElementById('bd-modal-contenido').innerHTML = html;
  document.getElementById('bd-modal').className = 'bd-modal-overlay visible';

  // Iniciar mini mapa si aplica
  if (tieneUbicacion) {
    iniciarMiniMapa(lat, lng, n.tipo || 'rumor');
  }
}
window.verDetallesBD = verDetallesBD;

// Ir al mapa principal centrado en una coordenada específica
function irAlMapaEn(lat, lng) {
  document.getElementById('bd-modal').className = 'bd-modal-overlay';
  verTab('mapa');
  setTimeout(function() {
    if (mapaObj) {
      mapaObj.setView([lat, lng], 16);
      mapaObj.invalidateSize();
    }
  }, 200);
}
window.irAlMapaEn = irAlMapaEn;

function cerrarModalBD(e) {
  if (e && e.target && e.target.id !== 'bd-modal') return;
  document.getElementById('bd-modal').className = 'bd-modal-overlay';
  // Destruir mini mapa para liberar memoria
  if (miniMapaObj) {
    try { miniMapaObj.remove(); } catch(ex) {}
    miniMapaObj = null;
  }
}
window.cerrarModalBD = cerrarModalBD;

// También cerrar con botón X
function cerrarModalBDBtn() {
  document.getElementById('bd-modal').className = 'bd-modal-overlay';
  if (miniMapaObj) {
    try { miniMapaObj.remove(); } catch(ex) {}
    miniMapaObj = null;
  }
}
window.cerrarModalBDBtn = cerrarModalBDBtn;

function editarBD(id) {
  var panel = document.getElementById('bd-edit-' + id);
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
window.editarBD = editarBD;

function guardarEditBD(id) {
  if (typeof db === 'undefined' || !db) { toast('Firebase no disponible — verifica conexión', 'err'); return; }
  var tit = document.getElementById('bde-tit-' + id);
  var cal = document.getElementById('bde-cal-' + id);
  var col = document.getElementById('bde-col-' + id);
  var com = document.getElementById('bde-com-' + id);
  var nom = document.getElementById('bde-nom-' + id);
  var tipoEl2 = document.getElementById('bde-tipo-' + id);
  var cal2El2 = document.getElementById('bde-cal2-' + id);
  var fevEl2 = document.getElementById('bde-fev-' + id);
  var tdiaEl2 = document.getElementById('bde-tdia-' + id);
  var resEl2 = document.getElementById('bde-res-' + id);
  var coordsBD = document.getElementById('bde-coords-' + id);
  var latBD = null, lngBD = null;
  if (coordsBD && coordsBD.value.trim()) {
    var cp = coordsBD.value.split(',');
    if (cp.length === 2) {
      latBD = parseFloat(cp[0].trim());
      lngBD = parseFloat(cp[1].trim());
      if (isNaN(latBD) || isNaN(lngBD)) { latBD = null; lngBD = null; }
    }
  }

  var calleVal  = cal ? cal.value.trim() : '';
  var coloniaVal = col ? col.value.trim() : '';

  // Nutrir base interna de geo-relaciones si hay coords manuales + calle/colonia
  if (latBD && lngBD && (calleVal || coloniaVal)) {
    var key = calleVal.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key && !GEO_BASE[key]) {
      GEO_BASE[key] = { colonia: coloniaVal, lat: latBD, lng: lngBD, hits: 1 };
    } else if (key) {
      GEO_BASE[key].hits++;
      // Promedio ponderado de coords
      GEO_BASE[key].lat = (GEO_BASE[key].lat + latBD) / 2;
      GEO_BASE[key].lng = (GEO_BASE[key].lng + lngBD) / 2;
      if (coloniaVal) GEO_BASE[key].colonia = coloniaVal;
    }
    // Guardar en Firebase para persistencia
    if (db) {
      db.collection('geo-irapuato').doc(key).set({ calle: calleVal, colonia: coloniaVal, lat: latBD, lng: lngBD, hits: (GEO_BASE[key]||{hits:1}).hits }, { merge: true });
    }
  }

  var urlEl2 = document.getElementById('bde-url-' + id);
  // Snapshot de edición del usuario en BD
  var usuario_edicion = {
    tipo: tipoEl2 ? tipoEl2.value : 'rumor',
    titulo: tit ? tit.value : '',
    calle: calleVal,
    calle2: cal2El2 ? cal2El2.value.trim() : '',
    colonia: coloniaVal,
    comunidad: com ? com.value.trim() : '',
    nombres: nom ? nom.value.trim() : '',
    fecha_evento: fevEl2 ? fevEl2.value.trim() : '',
    tiempo_dia: tdiaEl2 ? tdiaEl2.value : 'desconocido',
    resumen: resEl2 ? resEl2.value.trim() : '',
    url: urlEl2 ? urlEl2.value.trim() : ''
  };

  // Recalcular diff contra ia_raw si existe en el registro
  var nActual = null;
  for (var ix = 0; ix < noticias.length; ix++) { if (noticias[ix].id === id) { nActual = noticias[ix]; break; } }
  var diff_edicion = {};
  if (nActual && nActual.ia_raw) {
    Object.keys(usuario_edicion).forEach(function(k) {
      if (k === 'url') return; // URL no es campo de IA
      var iaVal = (nActual.ia_raw[k] || '').toString().trim();
      var usrVal = (usuario_edicion[k] || '').toString().trim();
      if (iaVal !== usrVal) diff_edicion[k] = { ia: iaVal, usuario: usrVal };
    });
  }

  // Copiar usuario_edicion para evitar referencia circular al asignarlo como propiedad
  var updates = {
    tipo:            usuario_edicion.tipo,
    titulo:          usuario_edicion.titulo,
    calle:           usuario_edicion.calle,
    calle2:          usuario_edicion.calle2,
    colonia:         usuario_edicion.colonia,
    comunidad:       usuario_edicion.comunidad,
    nombres:         usuario_edicion.nombres,
    fecha_evento:    usuario_edicion.fecha_evento,
    tiempo_dia:      usuario_edicion.tiempo_dia,
    resumen:         usuario_edicion.resumen,
    url:             usuario_edicion.url,
    usuario_edicion: {
      tipo:         usuario_edicion.tipo,
      titulo:       usuario_edicion.titulo,
      calle:        usuario_edicion.calle,
      calle2:       usuario_edicion.calle2,
      colonia:      usuario_edicion.colonia,
      comunidad:    usuario_edicion.comunidad,
      nombres:      usuario_edicion.nombres,
      fecha_evento: usuario_edicion.fecha_evento,
      tiempo_dia:   usuario_edicion.tiempo_dia,
      resumen:      usuario_edicion.resumen,
      url:          usuario_edicion.url
    },
    aprendizaje_diff:              diff_edicion,
    aprendizaje_campos_corregidos: Object.keys(diff_edicion),
    ultima_edicion_usuario:        new Date().toISOString()
  };
  if (latBD && lngBD) { updates.lat = latBD; updates.lng = lngBD; }
  db.collection('noticias-fase1').doc(id).update(updates)
  .then(function() {
    toast('✓ Cambios guardados', 'ok');
    // onSnapshot detecta el cambio y actualiza noticias[] + renderBD() automáticamente
  })
  .catch(function(e) { toast('Error: ' + e.message, 'err'); });
}
window.guardarEditBD = guardarEditBD;


function eliminarBD(id) {
  if (!confirm('¿Eliminar esta noticia de la base de datos?')) return;
  if (db) {
    db.collection('noticias-fase1').doc(id).delete()
    .then(function() { toast('Eliminada', 'ok'); })
    .catch(function(e) { toast('Error: ' + e.message, 'err'); });
  }
}
window.eliminarBD = eliminarBD;

function actualizarBadge() {
  var badge = document.getElementById('badge-bd');
  if (!badge) return;
  if (noticias.length > 0) {
    badge.style.display = 'inline-flex';
    badge.textContent = noticias.length;
  } else {
    badge.style.display = 'none';
  }
}


// ═══════════════════════════════════════════════════════════════
// SISTEMA DE APRENDIZAJE — IA vs Correcciones del Usuario
// ═══════════════════════════════════════════════════════════════

var _aprData = []; // cache local de correcciones

var CAMPOS_LABELS = {
  titulo: 'Título',
  tipo: 'Tipo',
  tipo2: 'Tipo 2',
  calle: 'Calle 1',
  calle2: 'Calle 2',
  colonia: 'Colonia',
  comunidad: 'Comunidad',
  nombres: 'Nombres',
  fecha_evento: 'Fecha evento',
  tiempo_dia: 'Momento del día',
  resumen: 'Resumen'
};


function evaluarYAjustarPrompt() {
  if (!db) return;
  // Leer todas las noticias con diff para calcular patrones
  db.collection('noticias-fase1')
    .where('viaIA', '==', true)
    .orderBy('fechaGuardado', 'desc')
    .limit(500)
    .get()
    .then(function(snap) {
      // Contar correcciones por campo + recopilar ejemplos
      var porCampo = {};
      var ejemplosPorCampo = {};
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d.aprendizaje_diff) return;
        Object.keys(d.aprendizaje_diff).forEach(function(k) {
          var dv = d.aprendizaje_diff[k];
          if (!dv.ia && !dv.usuario) return; // skip vacíos
          porCampo[k] = (porCampo[k] || 0) + 1;
          if (!ejemplosPorCampo[k]) ejemplosPorCampo[k] = [];
          if (ejemplosPorCampo[k].length < 5) {
            ejemplosPorCampo[k].push({ ia: dv.ia, usr: dv.usuario });
          }
        });
      });

      // Generar reglas para campos que superen el umbral
      var reglasNuevas = [];
      Object.keys(porCampo).forEach(function(campo) {
        if (porCampo[campo] < UMBRAL_APRENDIZAJE) return;
        var ejs = ejemplosPorCampo[campo] || [];
        var reglaTexto = generarRegla(campo, porCampo[campo], ejs);
        if (reglaTexto) {
          // Verificar si ya existe una regla para este campo
          var existente = _promptRules.find(function(r){ return r.campo === campo; });
          if (existente) {
            existente.regla = reglaTexto;
            existente.veces = porCampo[campo];
            existente.fecha = new Date().toISOString();
            reglasNuevas.push(existente);
          } else {
            reglasNuevas.push({
              campo: campo,
              regla: reglaTexto,
              veces: porCampo[campo],
              fecha: new Date().toISOString(),
              activa: true
            });
          }
        }
      });

      // También mantener reglas existentes de campos que no llegaron al umbral aún
      _promptRules.forEach(function(r) {
        var yaIncluida = reglasNuevas.find(function(nr){ return nr.campo === r.campo; });
        if (!yaIncluida) reglasNuevas.push(r);
      });

      if (reglasNuevas.length > 0) {
        _promptRules = reglasNuevas;
        guardarReglasPrompt(reglasNuevas);
        renderReglasBD();
        toast('🧠 Prompt ajustado automáticamente: ' + reglasNuevas.filter(function(r){return r.activa!==false;}).length + ' reglas activas', 'ok');
      }
    })
    .catch(function(e) { console.warn('[Aprendizaje] Error evaluando:', e.message); });
}
window.evaluarYAjustarPrompt = evaluarYAjustarPrompt;

function generarRegla(campo, veces, ejemplos) {
  var LABELS = {
    titulo: 'TÍTULO', tipo: 'TIPO', tipo2: 'TIPO SECUNDARIO',
    calle: 'CALLE 1', calle2: 'CALLE 2', colonia: 'COLONIA',
    comunidad: 'COMUNIDAD', nombres: 'NOMBRES',
    fecha_evento: 'FECHA DEL EVENTO', tiempo_dia: 'MOMENTO DEL DÍA', resumen: 'RESUMEN'
  };
  var label = LABELS[campo] || campo.toUpperCase();

  // Detectar patrón más común: IA deja vacío cuando no debería
  var iaVacio = ejemplos.filter(function(e){ return !e.ia && e.usr; }).length;
  var usuarioVacio = ejemplos.filter(function(e){ return e.ia && !e.usr; }).length;
  var ambosLlenos = ejemplos.filter(function(e){ return e.ia && e.usr && e.ia !== e.usr; }).length;

  var regla = 'APRENDIDO (' + veces + ' correcciones en ' + label + '): ';

  if (iaVacio > ambosLlenos && iaVacio > usuarioVacio) {
    regla += 'NO dejes ' + label + ' vacío si hay información disponible en el texto.';
  } else if (usuarioVacio > ambosLlenos && usuarioVacio > iaVacio) {
    regla += 'No inventes ' + label + ' si el texto no lo menciona explícitamente. Déjalo vacío.';
  } else if (campo === 'tipo' && ambosLlenos > 0) {
    // Detectar confusión de tipos más frecuente
    var confusiones = {};
    ejemplos.forEach(function(e) {
      if (e.ia && e.usr && e.ia !== e.usr) {
        var k = e.ia + '->' + e.usr;
        confusiones[k] = (confusiones[k] || 0) + 1;
      }
    });
    var topConfusion = Object.keys(confusiones).sort(function(a,b){ return confusiones[b]-confusiones[a]; })[0];
    if (topConfusion) {
      var parts = topConfusion.split('->');
      regla += 'Cuando clasificas como "' + parts[0] + '", el usuario lo corrige a "' + parts[1] + '". Revisa bien esta distinción.';
    } else {
      regla += 'Sé más cuidadoso clasificando ' + label + '.';
    }
  } else if (campo === 'tiempo_dia' && ambosLlenos > 0) {
    regla += 'Solo asigna momento del día si el texto menciona hora explícita o palabra "mañana/tarde/noche/madrugada". Si no, usa "desconocido".';
  } else if (campo === 'colonia' && usuarioVacio > 0) {
    regla += 'Solo extrae COLONIA si el texto dice explícitamente "colonia X" o "col. X". No inferir por ubicación.';
  } else {
    regla += 'Presta más atención al campo ' + label + ' (' + veces + ' correcciones registradas).';
  }

  return regla;
}
window.generarRegla = generarRegla;

function renderReglasBD() {
  var el = document.getElementById('apr-reglas');
  if (!el) return;
  var activas = _promptRules.filter(function(r){ return r.activa !== false; });
  var inactivas = _promptRules.filter(function(r){ return r.activa === false; });
  if (_promptRules.length === 0) {
    el.innerHTML = '<div style="color:#2a4a6a;font-size:8px;">Sin reglas generadas aún. Se crean automáticamente cuando un campo supera ' + UMBRAL_APRENDIZAJE + ' correcciones.</div>';
    return;
  }
  el.innerHTML = _promptRules.map(function(r, i) {
    var isActiva = r.activa !== false;
    return '<div style="background:#060d18;border:1px solid ' + (isActiva ? '#b060ff44' : '#0d2040') + ';border-left:3px solid ' + (isActiva ? '#b060ff' : '#2a4a6a') + ';border-radius:3px;padding:8px 10px;margin-bottom:6px;opacity:' + (isActiva ? '1' : '0.5') + ';">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<span style="font-family:var(--title);font-size:7px;color:' + (isActiva ? '#b060ff' : '#3a5a7a') + ';letter-spacing:1px;">' + (r.campo||'').toUpperCase() + ' — ' + (r.veces||0) + ' correcciones</span>' +
        '<div style="display:flex;gap:4px;">' +
          '<button onclick="toggleRegla(' + i + ')" style="font-size:7px;padding:2px 6px;background:' + (isActiva ? 'rgba(255,34,85,.1)' : 'rgba(0,255,136,.1)') + ';color:' + (isActiva ? '#ff2255' : '#00ff88') + ';border:1px solid ' + (isActiva ? '#ff225544' : '#00ff8844') + ';border-radius:2px;cursor:pointer;font-family:var(--title);">' + (isActiva ? 'DESACTIVAR' : 'ACTIVAR') + '</button>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:8px;color:#8aa8c0;line-height:1.5;">' + (r.regla||'') + '</div>' +
      '<div style="font-size:6px;color:#2a4a6a;margin-top:3px;">' + (r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '') + '</div>' +
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
  var stats = document.getElementById('apr-stats');
  var campos = document.getElementById('apr-campos');
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
  // Estadísticas globales
  var total = _aprData.length;
  var conCorreccion = _aprData.filter(function(d) { return Object.keys(d.aprendizaje_diff || {}).length > 0; }).length;
  var pct = total > 0 ? Math.round((conCorreccion / total) * 100) : 0;

  // Contar correcciones por campo
  var porCampo = {};
  _aprData.forEach(function(d) {
    Object.keys(d.aprendizaje_diff || {}).forEach(function(k) {
      porCampo[k] = (porCampo[k] || 0) + 1;
    });
  });
  var camposOrdenados = Object.keys(porCampo).sort(function(a,b){ return porCampo[b]-porCampo[a]; });

  // Render stats
  var statsEl = document.getElementById('apr-stats');
  if (statsEl) statsEl.innerHTML =
    mkStatBox('NOTICIAS CON IA', total, '#b060ff') +
    mkStatBox('CON CORRECCIONES', conCorreccion, '#ffc800') +
    mkStatBox('TASA DE ERROR', pct + '%', pct > 50 ? '#ff2255' : pct > 25 ? '#ffc800' : '#00ff88') +
    mkStatBox('CAMPOS DISTINTOS', camposOrdenados.length, '#00f5ff');

  // Render campos más corregidos
  var camposEl = document.getElementById('apr-campos');
  if (camposEl) {
    if (camposOrdenados.length === 0) {
      camposEl.innerHTML = '<div style="color:#2a4a6a;font-size:8px;">Sin correcciones registradas aún</div>';
    } else {
      var maxVal = porCampo[camposOrdenados[0]] || 1;
      camposEl.innerHTML = camposOrdenados.map(function(k) {
        var pctBar = Math.round((porCampo[k] / maxVal) * 100);
        var label = CAMPOS_LABELS[k] || k;
        return '<div style="margin-bottom:6px;">' +
          '<div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:7px;color:#8aa8c0;margin-bottom:2px;">' +
            '<span>' + label + '</span><span>' + porCampo[k] + ' correcciones</span>' +
          '</div>' +
          '<div style="height:4px;background:#0d2040;border-radius:2px;">' +
            '<div style="height:4px;background:#b060ff;border-radius:2px;width:' + pctBar + '%;transition:width .4s;"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // Render lista de correcciones recientes
  var listaEl = document.getElementById('apr-lista');
  if (listaEl) {
    var conDiff = _aprData.filter(function(d){ return Object.keys(d.aprendizaje_diff||{}).length > 0; });
    if (conDiff.length === 0) {
      listaEl.innerHTML = '<div style="color:#2a4a6a;font-size:8px;padding:10px 0;">Sin correcciones registradas aún. Aprueba y edita algunas noticias para comenzar.</div>';
    } else {
      listaEl.innerHTML = conDiff.slice(0, 30).map(function(d) {
        var diffs = d.aprendizaje_diff || {};
        var campos = Object.keys(diffs);
        return '<div style="background:#060d18;border:1px solid #0d2040;border-left:3px solid #b060ff;border-radius:3px;padding:8px 10px;">' +
          '<div style="font-size:8px;color:#c0e8ff;margin-bottom:5px;font-family:var(--mono);">' + (d.titulo||'Sin título') + '</div>' +
          '<div style="font-size:7px;color:#2a4a6a;margin-bottom:6px;">' + (d.fuente||'') + ' — ' + (d.fechaCaptura||'') + '</div>' +
          campos.map(function(k) {
            var dv = diffs[k];
            var label = CAMPOS_LABELS[k] || k;
            return '<div style="margin-bottom:4px;background:#030810;border-radius:2px;padding:5px 7px;">' +
              '<div style="font-family:var(--title);font-size:6px;color:#b060ff;letter-spacing:1px;margin-bottom:3px;">' + label.toUpperCase() + '</div>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:80px;">' +
                  '<div style="font-size:6px;color:#ff4466;font-family:var(--mono);margin-bottom:1px;">IA propuso:</div>' +
                  '<div style="font-size:7px;color:#ff8899;">' + (dv.ia || '(vacío)') + '</div>' +
                '</div>' +
                '<div style="color:#2a4a6a;font-size:10px;align-self:center;">→</div>' +
                '<div style="flex:1;min-width:80px;">' +
                  '<div style="font-size:6px;color:#00ff88;font-family:var(--mono);margin-bottom:1px;">Tú pusiste:</div>' +
                  '<div style="font-size:7px;color:#88ffcc;">' + (dv.usuario || '(vacío)') + '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>';
      }).join('');
    }
  }
}

function mkStatBox(label, val, color) {
  return '<div style="background:#060d18;border:1px solid ' + color + '33;border-radius:4px;padding:10px;text-align:center;">' +
    '<div style="font-family:var(--title);font-size:16px;color:' + color + ';font-weight:700;">' + val + '</div>' +
    '<div style="font-family:var(--mono);font-size:6px;color:#3a5a7a;margin-top:3px;letter-spacing:1px;">' + label + '</div>' +
  '</div>';
}

function exportarCorrecciones() {
  if (_aprData.length === 0) { toast('Primero actualiza los datos', 'warn'); return; }
  var rows = ['id,fuente,fecha_captura,campo,ia_propuso,usuario_puso'];
  _aprData.forEach(function(d) {
    Object.keys(d.aprendizaje_diff || {}).forEach(function(k) {
      var dv = d.aprendizaje_diff[k];
      var esc = function(s) { return '"' + (s||'').replace(/"/g,'""') + '"'; };
      rows.push([esc(d._id), esc(d.fuente), esc(d.fechaCaptura), esc(k), esc(dv.ia), esc(dv.usuario)].join(','));
    });
  });
  var blob = new Blob([rows.join('\n')], {type:'text/csv;charset=utf-8;'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'correcciones-ia-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('CSV exportado', 'ok');
}
window.exportarCorrecciones = exportarCorrecciones;

function verPromptSugerido() {
  var modal = document.getElementById('apr-prompt-modal');
  var txt = document.getElementById('apr-prompt-txt');
  if (!modal || !txt) return;
  modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
  if (modal.style.display === 'none') return;

  // Analizar patrones para ajustar prompt
  var porCampo = {};
  var ejemplos = {};
  _aprData.forEach(function(d) {
    Object.keys(d.aprendizaje_diff || {}).forEach(function(k) {
      var dv = d.aprendizaje_diff[k];
      porCampo[k] = (porCampo[k] || 0) + 1;
      if (!ejemplos[k]) ejemplos[k] = [];
      if (ejemplos[k].length < 3) ejemplos[k].push({ ia: dv.ia, usr: dv.usuario });
    });
  });

  var ajustes = '';
  var camposTop = Object.keys(porCampo).sort(function(a,b){ return porCampo[b]-porCampo[a]; }).slice(0,5);
  camposTop.forEach(function(k) {
    var label = CAMPOS_LABELS[k] || k;
    ajustes += '\n// CAMPO: ' + label.toUpperCase() + ' (corregido ' + porCampo[k] + ' veces)\n';
    (ejemplos[k] || []).forEach(function(ej) {
      if (ej.ia && ej.usr && ej.ia !== ej.usr) {
        ajustes += '//   IA dijo "' + ej.ia.slice(0,50) + '" → correcto: "' + ej.usr.slice(0,50) + '"\n';
      }
    });
  });

  var promptBase = obtenerPromptBase ? obtenerPromptBase() : '[Prompt base no disponible]';

  txt.value = '// PROMPT AJUSTADO — Generado automáticamente basado en ' + _aprData.length + ' noticias\n' +
    '// Fecha: ' + new Date().toLocaleDateString('es-MX') + '\n' +
    (ajustes ? '\n// ═══ PATRONES DE CORRECCIÓN DETECTADOS ═══' + ajustes + '\n' : '') +
    '// ═══ INSTRUCCIONES ADICIONALES SUGERIDAS ═══\n' +
    (porCampo['tipo'] ? '// - El campo TIPO ha sido corregido ' + porCampo['tipo'] + ' veces. Sé más conservador con la clasificación.\n' : '') +
    (porCampo['calle'] ? '// - El campo CALLE ha sido corregido ' + porCampo['calle'] + ' veces. Extrae nombres de calles textuales exactamente.\n' : '') +
    (porCampo['colonia'] ? '// - El campo COLONIA ha sido corregido ' + porCampo['colonia'] + ' veces. Si no hay colonia explícita, deja vacío.\n' : '') +
    (porCampo['tiempo_dia'] ? '// - El campo MOMENTO DEL DÍA ha sido corregido ' + porCampo['tiempo_dia'] + ' veces. Solo usa mañana/tarde/noche/madrugada si hay hora explícita.\n' : '') +
    (porCampo['resumen'] ? '// - El campo RESUMEN ha sido corregido ' + porCampo['resumen'] + ' veces. Sé más conciso y objetivo.\n' : '') +
    '\n// ═══ PROMPT BASE ═══\n' + promptBase;
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

// Auto-cargar cuando se abre el tab
function iniciarAprende() {
  renderReglasBD(); // siempre mostrar reglas actuales
  if (_aprData.length === 0) cargarAprendizaje();
}
window.iniciarAprende = iniciarAprende;
