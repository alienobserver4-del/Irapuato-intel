/**
 * aprende.js — Sistema de observabilidad editorial
 * Irapuato Intel · 4Alien
 *
 * Colección Firestore: 'feed-visto'
 * Documento: { titulo, fuente, url, fecha_pub, fecha_vista, aprobada, hash }
 *
 * API pública:
 *   feedVistaRegistrar(titulo, fuente, url, fecha_pub) — llamado desde rss.js al renderizar tarjeta
 *   feedVistaMarcarAprobada(url)                       — llamado desde bd.js al aprobar
 *   aprendeRenderPanel()                               — renderiza el panel en sub-tab Aprende
 *   evaluarYAjustarPrompt()                            — stub para compatibilidad
 *   exportarCorrecciones()                             — exporta CSV de correcciones IA vs usuario
 */

// ── Estado ───────────────────────────────────────────────────────────────────

var APRENDE = {
  feedVisto:  {},   // hash → {titulo, fuente, url, fecha_pub, fecha_vista, aprobada}
  cargado:    false,
  cargando:   false
};

// ── Hash simple de título para deduplicar ────────────────────────────────────

function _aprendeHash(titulo) {
  if (!titulo) return '';
  var s = titulo.toLowerCase().trim()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n')
    .replace(/[^a-z0-9]/g,'').slice(0, 60);
  // Hash numérico simple (djb2)
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0x7fffffff; // mantener positivo
  }
  return 'fv' + h.toString(36);
}

// ── Registrar aparición en feed ──────────────────────────────────────────────

window.feedVistaRegistrar = function(titulo, fuente, url, fecha_pub) {
  if (!titulo || !db) return;
  var hash = _aprendeHash(titulo);
  if (!hash) return;

  // Si ya está en caché local, no escribir de nuevo
  if (APRENDE.feedVisto[hash]) return;

  var doc = {
    titulo:      titulo.trim(),
    fuente:      fuente  || '',
    url:         url     || '',
    fecha_pub:   fecha_pub || '',
    fecha_vista: firebase.firestore.FieldValue.serverTimestamp(),
    aprobada:    false,
    hash:        hash
  };

  // Escribir en Firestore solo si no existe
  db.collection('feed-visto').doc(hash).set(doc, { merge: false })
    .then(function() {
      APRENDE.feedVisto[hash] = {
        titulo: doc.titulo, fuente: doc.fuente, url: doc.url,
        fecha_pub: doc.fecha_pub, aprobada: false, hash: hash
      };
    })
    .catch(function() {
      // Si ya existe (merge: false lanza error en doc existente), marcar en caché igualmente
      APRENDE.feedVisto[hash] = APRENDE.feedVisto[hash] || { aprobada: false, hash: hash };
    });
};

// ── Marcar como aprobada ─────────────────────────────────────────────────────

window.feedVistaMarcarAprobada = function(url) {
  if (!url || !db) return;
  // Buscar por URL en caché local
  var claves = Object.keys(APRENDE.feedVisto);
  for (var i = 0; i < claves.length; i++) {
    var e = APRENDE.feedVisto[claves[i]];
    if (e && e.url === url) {
      e.aprobada = true;
      db.collection('feed-visto').doc(claves[i]).update({ aprobada: true })
        .catch(function() {});
      return;
    }
  }
  // Si no está en caché local, buscar por URL en Firestore
  db.collection('feed-visto').where('url', '==', url).limit(1).get()
    .then(function(snap) {
      snap.forEach(function(doc) {
        doc.ref.update({ aprobada: true });
        if (APRENDE.feedVisto[doc.id]) APRENDE.feedVisto[doc.id].aprobada = true;
      });
    })
    .catch(function() {});
};

// ── Verificar si un título ya fue visto ──────────────────────────────────────
// Devuelve: null | { aprobada: bool } — usado en rss.js para badge

window.feedVistaEstado = function(titulo) {
  var hash = _aprendeHash(titulo);
  return APRENDE.feedVisto[hash] || null;
};

// ── Cargar caché inicial desde Firestore ─────────────────────────────────────

window.aprendeCargarCache = function() {
  if (!db || APRENDE.cargado || APRENDE.cargando) return;
  APRENDE.cargando = true;
  // Cargar los últimos 500 vistos para tener caché local
  db.collection('feed-visto').orderBy('fecha_vista', 'desc').limit(500).get()
    .then(function(snap) {
      snap.forEach(function(doc) {
        var d = doc.data();
        APRENDE.feedVisto[doc.id] = {
          titulo:    d.titulo    || '',
          fuente:    d.fuente    || '',
          url:       d.url       || '',
          fecha_pub: d.fecha_pub || '',
          aprobada:  d.aprobada  || false,
          hash:      doc.id
        };
      });
      APRENDE.cargado  = true;
      APRENDE.cargando = false;
    })
    .catch(function(e) {
      APRENDE.cargando = false;
      console.warn('[Aprende] Error cargando caché:', e.message);
    });
};

// ── Render del panel principal ───────────────────────────────────────────────

window.aprendeRenderPanel = function() {
  var contenedor = document.getElementById('bd-aprende');
  if (!contenedor) return;

  if (!APRENDE.cargado) {
    contenedor.innerHTML = '<div style="color:#2a4a6a;font-size:9px;padding:12px;">⏳ Cargando datos...</div>';
    aprendeCargarCache();
    setTimeout(aprendeRenderPanel, 1200);
    return;
  }

  var todos = Object.values(APRENDE.feedVisto);
  var total = todos.length;
  var aprobadas = todos.filter(function(e) { return e.aprobada; }).length;
  var ignoradas = total - aprobadas;
  var tasaAprobacion = total > 0 ? Math.round((aprobadas / total) * 100) : 0;

  var html = '<div style="padding:12px 0;">';

  // ── A. KPIs ──
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;">';
  html += _aprendeKpi('TOTAL VISTAS', total, '#0cf');
  html += _aprendeKpi('APROBADAS', aprobadas, '#0f8');
  html += _aprendeKpi('IGNORADAS', ignoradas, '#f84');
  html += '</div>';

  // ── B. Tasa de aprobación general ──
  html += '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:6px;">TASA DE APROBACIÓN GENERAL</div>';
  html += '<div style="height:8px;background:#0d2040;border-radius:4px;overflow:hidden;margin-bottom:4px;">';
  html += '<div style="height:100%;width:' + tasaAprobacion + '%;background:linear-gradient(90deg,#0f8,#0cf);border-radius:4px;"></div>';
  html += '</div>';
  html += '<div style="font-size:9px;color:#7aaabb;">' + tasaAprobacion + '% de noticias vistas fueron aprobadas para el corpus</div>';
  html += '</div>';

  if (total === 0) {
    html += '<div style="color:#2a4a6a;font-size:9px;padding:8px;">Sin datos aún. Las noticias aparecerán aquí automáticamente al cargar feeds RSS.</div>';
    html += '</div>';
    contenedor.innerHTML = html;
    return;
  }

  // ── C. Por fuente ──
  html += _aprendeSeccionFuentes(todos, aprobadas);

  // ── D. Palabras clave en ignoradas vs aprobadas ──
  html += _aprendeSeccionKeywords(todos);

  // ── E. Calles ──
  html += '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:8px;">🗺 BASE DE CALLES</div>';
  html += '<div id="apr-calles"></div>';
  html += '</div>';

  // ── F. Sistema de aprendizaje IA ──
  html += _aprendeSeccionIA();

  html += '</div>';
  contenedor.innerHTML = html;

  // Renderizar panel de calles
  if (typeof callesRenderPanel === 'function') callesRenderPanel();
};

function _aprendeKpi(label, valor, color) {
  return '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;text-align:center;">' +
    '<div style="color:' + color + ';font-size:22px;font-weight:700;font-family:var(--mono);">' + valor + '</div>' +
    '<div style="color:#2a4a6a;font-size:8px;margin-top:2px;letter-spacing:.5px;">' + label + '</div>' +
    '</div>';
}

function _aprendeSeccionFuentes(todos, totalAprobadas) {
  // Agrupar por fuente
  var porFuente = {};
  for (var i = 0; i < todos.length; i++) {
    var e = todos[i];
    var f = e.fuente || 'Desconocida';
    if (!porFuente[f]) porFuente[f] = { total: 0, aprobadas: 0 };
    porFuente[f].total++;
    if (e.aprobada) porFuente[f].aprobadas++;
  }

  var fuentes = Object.keys(porFuente).sort(function(a, b) {
    return porFuente[b].total - porFuente[a].total;
  });

  var html = '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:8px;">📰 SESGO POR FUENTE</div>';
  html += '<div style="font-size:8px;color:#2a4a6a;margin-bottom:6px;">% = tasa de aprobación · barra verde = aprobadas · barra naranja = ignoradas</div>';

  for (var fi = 0; fi < fuentes.length; fi++) {
    var f = fuentes[fi];
    var d = porFuente[f];
    var tasa = Math.round((d.aprobadas / d.total) * 100);
    var wApro = Math.round((d.aprobadas / d.total) * 100);
    var wIgn  = 100 - wApro;
    html += '<div style="margin-bottom:7px;">';
    html += '<div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:2px;">';
    html += '<span style="color:#c0e8ff;">' + f + '</span>';
    html += '<span style="color:#3a6a8a;">' + d.aprobadas + '/' + d.total + ' <span style="color:' + (tasa > 30 ? '#0f8' : '#f84') + '">(' + tasa + '%)</span></span>';
    html += '</div>';
    html += '<div style="display:flex;height:5px;background:#0d2040;border-radius:3px;overflow:hidden;">';
    html += '<div style="width:' + wApro + '%;background:#0f8;"></div>';
    html += '<div style="width:' + wIgn  + '%;background:#f84;opacity:.5;"></div>';
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function _aprendeSeccionKeywords(todos) {
  // Frecuencia de palabras en títulos ignorados vs aprobados
  var freqIgn = {};
  var freqApr = {};
  var STOP = ['de','la','el','en','un','una','los','las','del','al','que','se','con','por',
              'para','como','este','esta','fue','han','hay','las','sus','más','pero','también',
              'irapuato','guanajuato','silao','gto'];

  function contarPalabras(texto, freq) {
    var palabras = texto.toLowerCase()
      .replace(/[^a-záéíóúñ\s]/gi,'').split(/\s+/);
    for (var i = 0; i < palabras.length; i++) {
      var p = palabras[i];
      if (p.length < 4) continue;
      if (STOP.indexOf(p) >= 0) continue;
      freq[p] = (freq[p] || 0) + 1;
    }
  }

  for (var i = 0; i < todos.length; i++) {
    var e = todos[i];
    if (!e.titulo) continue;
    if (e.aprobada) contarPalabras(e.titulo, freqApr);
    else            contarPalabras(e.titulo, freqIgn);
  }

  function topN(freq, n) {
    return Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; }).slice(0, n);
  }

  var topApr = topN(freqApr, 12);
  var topIgn = topN(freqIgn, 12);

  var html = '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:8px;">🔤 PALABRAS CLAVE — APROBADAS vs IGNORADAS</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';

  // Aprobadas
  html += '<div>';
  html += '<div style="font-size:8px;color:#0f8;margin-bottom:5px;font-family:var(--title);">✓ EN APROBADAS</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
  for (var ai = 0; ai < topApr.length; ai++) {
    var w = topApr[ai];
    var cnt = freqApr[w];
    var intensidad = Math.min(1, cnt / 10);
    var op = Math.round(40 + intensidad * 60);
    html += '<span style="background:rgba(0,255,136,' + (op/100).toFixed(2) + ');color:#0f8;' +
      'font-size:8px;padding:2px 5px;border-radius:2px;font-family:var(--mono);">' +
      w + ' <span style="opacity:.6;">' + cnt + '</span></span>';
  }
  html += '</div></div>';

  // Ignoradas
  html += '<div>';
  html += '<div style="font-size:8px;color:#f84;margin-bottom:5px;font-family:var(--title);">✗ EN IGNORADAS</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
  for (var ii = 0; ii < topIgn.length; ii++) {
    var wi = topIgn[ii];
    var cnti = freqIgn[wi];
    var intI = Math.min(1, cnti / 10);
    var opI  = Math.round(40 + intI * 60);
    html += '<span style="background:rgba(255,136,0,' + (opI/100).toFixed(2) + ');color:#f84;' +
      'font-size:8px;padding:2px 5px;border-radius:2px;font-family:var(--mono);">' +
      wi + ' <span style="opacity:.6;">' + cnti + '</span></span>';
  }
  html += '</div></div>';

  html += '</div>'; // grid
  html += '</div>';
  return html;
}

function _aprendeSeccionIA() {
  var html = '<div style="background:#0a0f1a;border:1px solid #1a2a3a;border-radius:4px;padding:10px;margin-bottom:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:8px;">🤖 APRENDIZAJE IA</div>';

  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">';
  html += '<button onclick="evaluarYAjustarPrompt()" ' +
    'style="padding:7px 12px;font-family:var(--title);font-size:8px;background:rgba(255,200,0,.12);' +
    'color:#ffc800;border:1px solid #ffc800;border-radius:3px;cursor:pointer;letter-spacing:1px;">⚡ AUTO-AJUSTAR PROMPT</button>';
  html += '<button onclick="exportarCorrecciones()" ' +
    'style="padding:7px 12px;font-family:var(--title);font-size:8px;background:rgba(0,245,255,.1);' +
    'color:#00f5ff;border:1px solid #00f5ff;border-radius:3px;cursor:pointer;letter-spacing:1px;">📥 EXPORTAR CSV</button>';
  html += '</div>';

  html += '<div id="apr-stats"   style="margin-bottom:10px;"></div>';
  html += '<div id="apr-reglas"  style="margin-bottom:10px;"><div style="color:#2a4a6a;font-size:8px;">Cargando reglas...</div></div>';
  html += '<div id="apr-campos"  style="margin-bottom:10px;"></div>';
  html += '<div id="apr-lista"   style="display:flex;flex-direction:column;gap:6px;"></div>';
  html += '<div id="apr-prompt-modal" style="display:none;background:#030810;border:1px solid #b060ff44;border-radius:4px;padding:12px;margin-top:12px;">';
  html += '<div style="font-family:var(--title);font-size:8px;color:#b060ff;margin-bottom:8px;">PROMPT AJUSTADO</div>';
  html += '<textarea id="apr-prompt-txt" style="width:100%;min-height:200px;background:#020810;border:1px solid #0d2040;color:#c0e8ff;' +
    'font-family:var(--mono);font-size:8px;padding:10px;border-radius:3px;resize:vertical;line-height:1.5;" readonly></textarea>';
  html += '</div>';
  html += '</div>';

  // Cargar datos de aprendizaje IA
  setTimeout(_aprendeCargarDatosIA, 200);
  return html;
}

// ── Cargar estadísticas de aprendizaje IA ────────────────────────────────────

function _aprendeCargarDatosIA() {
  if (!db) return;
  db.collection('noticias-fase1')
    .where('viaIA', '==', true)
    .orderBy('fechaGuardado', 'desc')
    .limit(200)
    .get()
    .then(function(snap) {
      var docs = [];
      snap.forEach(function(d) { docs.push(d.data()); });
      _aprendeRenderDatosIA(docs);
    })
    .catch(function(e) {
      var el = document.getElementById('apr-reglas');
      if (el) el.innerHTML = '<div style="color:#2a4a6a;font-size:8px;">Requiere índice Firestore — sigue el link del error en consola.</div>';
    });
}

function _aprendeRenderDatosIA(docs) {
  var statsEl  = document.getElementById('apr-stats');
  var camposEl = document.getElementById('apr-campos');
  var listaEl  = document.getElementById('apr-lista');
  if (!statsEl || !camposEl || !listaEl) return;

  var total = docs.length;
  var conDiff = docs.filter(function(d) { return d.aprendizaje_campos_corregidos && d.aprendizaje_campos_corregidos.length > 0; }).length;

  // Stats
  statsEl.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
    _aprendeKpi('CON IA', total, '#b060ff') +
    _aprendeKpi('CORREGIDAS', conDiff, '#ffc800') +
    '</div>';

  // Frecuencia de campos corregidos
  var freqCampos = {};
  for (var i = 0; i < docs.length; i++) {
    var campos = docs[i].aprendizaje_campos_corregidos || [];
    for (var ci = 0; ci < campos.length; ci++) {
      freqCampos[campos[ci]] = (freqCampos[campos[ci]] || 0) + 1;
    }
  }
  var camposOrdenados = Object.keys(freqCampos).sort(function(a,b){ return freqCampos[b] - freqCampos[a]; });

  var camposHtml = '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:6px;">CAMPOS MÁS CORREGIDOS</div>';
  var maxVal = camposOrdenados.length > 0 ? freqCampos[camposOrdenados[0]] : 1;
  for (var ci2 = 0; ci2 < Math.min(camposOrdenados.length, 8); ci2++) {
    var campo = camposOrdenados[ci2];
    var cnt   = freqCampos[campo];
    var w     = Math.round((cnt / maxVal) * 100);
    camposHtml += '<div style="margin-bottom:5px;">';
    camposHtml += '<div style="display:flex;justify-content:space-between;font-size:8px;margin-bottom:1px;">';
    camposHtml += '<span style="color:#c0e8ff;font-family:var(--mono);">' + campo + '</span>';
    camposHtml += '<span style="color:#ffc800;">' + cnt + '</span>';
    camposHtml += '</div>';
    camposHtml += '<div style="height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">';
    camposHtml += '<div style="width:' + w + '%;height:100%;background:#ffc800;opacity:.8;border-radius:2px;"></div>';
    camposHtml += '</div></div>';
  }
  camposEl.innerHTML = camposHtml;

  // Últimas correcciones
  var conDiffs = docs.filter(function(d) { return d.aprendizaje_diff && Object.keys(d.aprendizaje_diff).length > 0; }).slice(0, 10);
  var listaHtml = '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:6px;">ÚLTIMAS CORRECCIONES</div>';
  for (var li = 0; li < conDiffs.length; li++) {
    var n = conDiffs[li];
    var diff = n.aprendizaje_diff || {};
    listaHtml += '<div style="background:#060d18;border:1px solid #1a2a3a;border-radius:3px;padding:7px;margin-bottom:5px;">';
    listaHtml += '<div style="font-size:8px;color:#7aaabb;margin-bottom:4px;font-family:var(--mono);">' + (n.titulo || '').slice(0, 60) + '</div>';
    Object.keys(diff).forEach(function(k) {
      listaHtml += '<div style="font-size:7px;margin-bottom:2px;display:flex;gap:4px;flex-wrap:wrap;">';
      listaHtml += '<span style="color:#3a6a8a;font-family:var(--mono);">' + k + ':</span>';
      listaHtml += '<span style="color:#f44;text-decoration:line-through;opacity:.7;">' + (diff[k].ia || '—').slice(0,30) + '</span>';
      listaHtml += '<span style="color:#3a6a8a;">→</span>';
      listaHtml += '<span style="color:#0f8;">' + (diff[k].usuario || '—').slice(0,30) + '</span>';
      listaHtml += '</div>';
    });
    listaHtml += '</div>';
  }
  listaEl.innerHTML = listaHtml;

  // Cargar reglas
  _aprendeCargarReglas();
}

function _aprendeCargarReglas() {
  var reglasEl = document.getElementById('apr-reglas');
  if (!reglasEl || !db) return;
  db.collection('prompt-rules').orderBy('creado', 'desc').limit(10).get()
    .then(function(snap) {
      if (snap.empty) {
        reglasEl.innerHTML = '<div style="color:#2a4a6a;font-size:8px;">Sin reglas generadas aún. Se crean automáticamente al acumular ' + (typeof UMBRAL_APRENDIZAJE !== 'undefined' ? UMBRAL_APRENDIZAJE : 10) + ' correcciones del mismo campo.</div>';
        return;
      }
      var html = '<div style="font-family:var(--title);font-size:8px;color:#3a6a8a;letter-spacing:1px;margin-bottom:6px;">REGLAS ACTIVAS</div>';
      snap.forEach(function(doc) {
        var r = doc.data();
        html += '<div style="background:#060d18;border:1px solid #b060ff33;border-radius:3px;padding:6px;margin-bottom:4px;font-size:8px;color:#c0c8ff;">' +
          (r.regla || doc.id) + '</div>';
      });
      reglasEl.innerHTML = html;
    })
    .catch(function() {
      reglasEl.innerHTML = '<div style="color:#2a4a6a;font-size:8px;">Sin reglas aún.</div>';
    });
}

// ── Stubs públicos (compatibilidad con botones del HTML viejo) ────────────────

window.evaluarYAjustarPrompt = function() {
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  toast('⏳ Analizando correcciones...', 'ok');
  _aprendeCargarDatosIA();
  var modal = document.getElementById('apr-prompt-modal');
  if (modal) {
    modal.style.display = 'block';
    var txt = document.getElementById('apr-prompt-txt');
    if (txt) {
      txt.value = '// Auto-ajuste basado en correcciones acumuladas.\n' +
        '// Abre la consola para ver el prompt completo generado por ia.js\n' +
        '// Los ajustes se aplican automáticamente en el próximo análisis.';
    }
  }
};

window.exportarCorrecciones = function() {
  if (!db) { toast('Firebase no disponible', 'err'); return; }
  toast('⏳ Preparando CSV...', 'ok');
  db.collection('noticias-fase1')
    .where('viaIA', '==', true)
    .orderBy('fechaGuardado', 'desc')
    .limit(500)
    .get()
    .then(function(snap) {
      var filas = ['titulo,campo,ia,usuario,fecha'];
      snap.forEach(function(doc) {
        var n = doc.data();
        var diff = n.aprendizaje_diff || {};
        var fecha = n.fechaCaptura || '';
        Object.keys(diff).forEach(function(k) {
          var ia  = (diff[k].ia  || '').replace(/,/g,';').replace(/\n/g,' ');
          var usr = (diff[k].usuario || '').replace(/,/g,';').replace(/\n/g,' ');
          var tit = (n.titulo || '').replace(/,/g,';');
          filas.push('"' + tit + '","' + k + '","' + ia + '","' + usr + '","' + fecha + '"');
        });
      });
      if (filas.length <= 1) { toast('Sin correcciones para exportar', 'warn'); return; }
      var blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'correcciones-ia-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('CSV descargado (' + (filas.length - 1) + ' correcciones)', 'ok');
    })
    .catch(function(e) {
      toast('Error: ' + e.message, 'err');
    });
};
