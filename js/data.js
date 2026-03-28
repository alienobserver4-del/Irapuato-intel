// ═══════════════════════════════════════════════════════════════
// DATA.JS — Análisis de Corpus
// Irapuato Intel · Sprint 2
//
// Subpestaña DATA en la sección BD/Corpus.
// Usa los campos lingüísticos precalculados por la IA (tematica,
// verbos, sustantivos) almacenados en Firestore, más procesamiento
// local de frecuencias.
// ═══════════════════════════════════════════════════════════════

var _dataActivo = false;
var _dataCache  = null;

// ── Agrupaciones de fuentes ──
var FUENTE_GRUPOS = {
  'El Sol de Irapuato': ['sol', 'sol local', 'el sol', 'sol irapuato', 'el sol de irapuato',
                          'sol - policiaca', 'sol policiaca', 'el sol - policiaca',
                          'el sol - local', 'sol_policiaca', 'sol_local'],
  'Correo': ['correo', 'periodico correo', 'periódico correo', 'correo seg', 'correo_seg',
              'correo seguridad', 'diario correo'],
  'Facebook': ['facebook', 'fb', 'tinta negra fb', 'tinta negra', 'gerardo hernandez',
                'tv consecuencias', 'el pena', 'irapuato despierta', 'noticias al momento',
                'opinion bajio', 'opinión bajio', 'noticias irapuato', 'contacto noticias',
                'hermoso irapuato', 'irapuato alerta', 'ciudadano']
};

function _grupoFuente(fuente) {
  if (!fuente) return fuente;
  var fl = fuente.toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (var grupo in FUENTE_GRUPOS) {
    var aliases = FUENTE_GRUPOS[grupo];
    for (var i = 0; i < aliases.length; i++) {
      var alias = aliases[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (fl === alias || fl.indexOf(alias) !== -1) return grupo;
    }
  }
  return fuente; // sin grupo → fuente tal cual
}

// ── Stopwords para procesamiento local ──
var STOPWORDS_ES = new Set([
  'a','al','ante','bajo','con','contra','de','del','desde','durante','el','en',
  'entre','hacia','hasta','la','las','le','les','lo','los','me','mi','mis','muy',
  'no','nos','o','para','pero','por','que','se','si','sin','sobre','su','sus',
  'también','tan','te','ti','tiene','todo','todos','tu','tus','un','una','unas',
  'unos','y','ya','yo','más','este','esta','estos','estas','ese','esa','esos','esas',
  'aquel','aquella','es','era','fue','han','ha','hay','le','les','les','lo','los',
  'cual','cuando','como','donde','quien','ser','estar','haber','tener','hacer',
  'esto','eso','aqui','alli','ahora','luego','después','antes','bien','mal',
  'tres','dos','uno','cuatro','cinco','seis','siete','ocho','nueve','diez',
  'señalo','segun','dijo','indico','informo','reporto','via','dentro','fuera',
  'mismo','misma','otro','otra','nuevo','nueva','gran','grande','dia','dias',
  'vez','veces','solo','sola','cada','todo','toda','todos','todas','pueden',
  'puede','ayer','hoy','martes','miercoles','jueves','viernes','sabado','lunes',
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre',
  'octubre','noviembre','diciembre','irapuato','guanajuato','gto','mx','ciudad',
  'municipio','colonia','calle','avenida','km','numero','numero','num'
]);

// ═══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL — Renderizar toda la pestaña Data
// ═══════════════════════════════════════════════════════════════

function renderData() {
  var cont = document.getElementById('data-contenido');
  if (!cont) return;
  if (!_dataActivo) return;

  cont.innerHTML = '<div style="padding:20px;text-align:center;font-family:monospace;font-size:8px;color:#3a6a9a;">⏳ Procesando corpus...</div>';

  // Usar los datos de 'noticias' globales (ya cargados por bd.js)
  if (typeof noticias === 'undefined' || !noticias) {
    cont.innerHTML = '<div style="padding:20px;text-align:center;font-size:8px;color:#3a5a7a;">Aún no hay datos. Aprueba noticias primero.</div>';
    return;
  }

  var data = _procesarCorpus(noticias);
  _dataCache = data;
  _renderDataHTML(cont, data);
}
window.renderData = renderData;

function _procesarCorpus(arr) {
  var total = arr.length;
  var porTipo = {};
  var porFuente = {};
  var tematicaCount = {};
  var verbosCount = {};
  var sustCount = {};
  var textosConcatenados = '';

  arr.forEach(function(n) {
    // Por tipo
    var tipo = n.tipo || 'rumor';
    porTipo[tipo] = (porTipo[tipo] || 0) + 1;

    // Por fuente (con agrupación)
    var grupo = _grupoFuente(n.fuente || 'Sin fuente');
    porFuente[grupo] = (porFuente[grupo] || 0) + 1;

    // Temática (precalculada por IA)
    if (Array.isArray(n.tematica)) {
      n.tematica.forEach(function(t) {
        var k = (t || '').toLowerCase().trim();
        if (k && k.length > 2) tematicaCount[k] = (tematicaCount[k] || 0) + 1;
      });
    }

    // Verbos (precalculados por IA)
    if (Array.isArray(n.verbos)) {
      n.verbos.forEach(function(v) {
        var k = (v || '').toLowerCase().trim();
        if (k && k.length > 2) verbosCount[k] = (verbosCount[k] || 0) + 1;
      });
    }

    // Sustantivos (precalculados por IA)
    if (Array.isArray(n.sustantivos)) {
      n.sustantivos.forEach(function(s) {
        var k = (s || '').toLowerCase().trim();
        if (k && k.length > 2 && !STOPWORDS_ES.has(k)) sustCount[k] = (sustCount[k] || 0) + 1;
      });
    }

    // Texto original para análisis local de respaldo
    if (n.texto_original) textosConcatenados += ' ' + n.texto_original;
    else if (n.resumen) textosConcatenados += ' ' + n.resumen;
  });

  // Si no hay suficientes datos de IA, hacer análisis local del texto
  var usarLocal = Object.keys(tematicaCount).length < 5;
  if (usarLocal && textosConcatenados.length > 50) {
    var localAnalisis = _analizarTextoLocal(textosConcatenados);
    // Mezclar con lo que haya de IA
    localAnalisis.sustantivos.forEach(function(p) {
      sustCount[p.palabra] = (sustCount[p.palabra] || 0) + p.n;
    });
  }

  // Campos semánticos de verbos
  var camposSemanticos = _agruparVerbos(verbosCount);

  // Análisis de discurso
  var discurso = _analisisDiscurso(arr, textosConcatenados);

  return {
    total: total,
    porTipo: porTipo,
    porFuente: porFuente,
    tematica: _top(tematicaCount, 10),
    verbos: _top(verbosCount, 30),
    sustantivos: _top(sustCount, 10),
    camposSemanticos: camposSemanticos,
    discurso: discurso,
    conTexto: arr.filter(function(n){ return !!n.texto_original; }).length,
    conLinguistico: arr.filter(function(n){ return Array.isArray(n.tematica) && n.tematica.length > 0; }).length
  };
}

function _top(obj, n) {
  return Object.keys(obj)
    .map(function(k) { return { palabra: k, n: obj[k] }; })
    .sort(function(a,b) { return b.n - a.n; })
    .slice(0, n);
}

// Análisis local básico (stopwords + frecuencias)
function _analizarTextoLocal(texto) {
  var palabras = texto.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-záéíóúüñ\s]/g, ' ')
    .split(/\s+/)
    .filter(function(p) { return p.length > 3 && !STOPWORDS_ES.has(p); });

  var freq = {};
  palabras.forEach(function(p) { freq[p] = (freq[p] || 0) + 1; });
  return { sustantivos: _top(freq, 20) };
}

// Agrupación semántica de verbos
function _agruparVerbos(verbosCount) {
  var CAMPOS = {
    'VIOLENCIA': ['atacar','disparar','matar','herir','golpear','amenazar','agredir',
                  'asesinar','ejecutar','balacear','apuñalar','secuestrar','extorsionar'],
    'INVESTIGACIÓN': ['investigar','detener','arrestar','aprehender','identificar',
                       'revisar','reportar','informar','confirmar','verificar'],
    'ACCIDENTE': ['volcar','chocar','caer','incendiar','derrapar','impactar','colapsar',
                   'atropellar'],
    'HALLAZGO': ['hallar','localizar','encontrar','descubrir','detectar','recuperar'],
    'GOBIERNO/GESTIÓN': ['inaugurar','anunciar','implementar','gestionar','aplicar',
                          'autorizar','autorizar','entregar','solicitar','declarar'],
    'MOVIMIENTO': ['trasladar','llegar','salir','escapar','huir','correr','moverse',
                    'desaparecer','abandonar'],
    'COMUNICACIÓN': ['decir','señalar','indicar','mencionar','denunciar','publicar',
                      'comunicar','pedir','exigir']
  };

  var resultado = {};
  var verbosArr = Object.keys(verbosCount);

  Object.keys(CAMPOS).forEach(function(campo) {
    var matches = [];
    CAMPOS[campo].forEach(function(v) {
      if (verbosCount[v]) matches.push({ palabra: v, n: verbosCount[v] });
    });
    // Incluir verbos de la BD que coincidan parcialmente
    verbosArr.forEach(function(v) {
      var yaEsta = matches.find(function(m){ return m.palabra === v; });
      if (!yaEsta) {
        CAMPOS[campo].forEach(function(raiz) {
          if (v.startsWith(raiz.slice(0,5))) {
            matches.push({ palabra: v, n: verbosCount[v] });
          }
        });
      }
    });
    if (matches.length > 0) {
      resultado[campo] = matches.sort(function(a,b){ return b.n-a.n; }).slice(0,6);
    }
  });
  return resultado;
}

// Análisis del discurso: temporalidad, agentes, objetivos, etc.
function _analisisDiscurso(arr, textoConcat) {
  var tiempos = { manana:0, tarde:0, noche:0, madrugada:0, desconocido:0 };
  var actores = {};
  var conNombres = 0;
  var conGeo = 0;
  var confianzas = { alta:0, media:0, baja:0 };

  arr.forEach(function(n) {
    // Distribución temporal
    var td = n.tiempo_dia || 'desconocido';
    tiempos[td] = (tiempos[td] || 0) + 1;
    // Actores mencionados
    if (n.nombres && n.nombres.trim()) {
      conNombres++;
      n.nombres.split(',').forEach(function(nombre) {
        var k = nombre.trim();
        if (k.length > 3) actores[k] = (actores[k] || 0) + 1;
      });
    }
    // Con geolocalización real
    if (n.lat && n.lat !== 20.6795) conGeo++;
    // Confianza
    var conf = n.confianza || 'baja';
    confianzas[conf] = (confianzas[conf] || 0) + 1;
  });

  // Top actores (aparecen en 2+ noticias)
  var topActores = Object.keys(actores)
    .filter(function(k){ return actores[k] >= 2; })
    .map(function(k){ return { nombre: k, n: actores[k] }; })
    .sort(function(a,b){ return b.n - a.n; })
    .slice(0, 10);

  // Densidad promedio de palabras por noticia
  var totalPalabras = textoConcat.split(/\s+/).filter(Boolean).length;
  var densidadMedia = arr.length > 0 ? Math.round(totalPalabras / arr.length) : 0;

  return {
    tiempos: tiempos,
    topActores: topActores,
    conNombres: conNombres,
    conGeo: conGeo,
    confianzas: confianzas,
    densidadMedia: densidadMedia
  };
}

// ═══════════════════════════════════════════════════════════════
// RENDERIZADO HTML
// ═══════════════════════════════════════════════════════════════

function _renderDataHTML(cont, d) {
  var total = d.total;
  if (total === 0) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;font-size:8px;color:#3a5a7a;">El corpus está vacío. Aprueba noticias primero.</div>';
    return;
  }

  var html = '';

  // ── A. Resumen del corpus ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">A · CORPUS GENERAL</div>';
  html += '<div class="data-stat-grid">';
  html += mkDataStat(total, 'NOTICIAS EN CORPUS', '#00f5ff');
  html += mkDataStat(d.conLinguistico, 'CON ANÁLISIS IA', '#00ff88');
  html += mkDataStat(d.conTexto, 'CON TEXTO ORIGINAL', '#b060ff');
  html += mkDataStat(d.discurso.conGeo, 'GEOLOCALIZADAS', '#ffc800');
  html += '</div>';
  html += '<div style="margin-top:8px;font-size:6.5px;color:#2a4a6a;font-family:monospace;">';
  if (d.conLinguistico < total) {
    html += '⚠ ' + (total - d.conLinguistico) + ' noticias sin campos lingüísticos (anteriores al Sprint 2). ';
    html += 'Se usó análisis local de respaldo.';
  } else {
    html += '✓ Todos los registros tienen análisis lingüístico completo.';
  }
  html += '</div></div>';

  // ── B. Por tipo ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">B · DISTRIBUCIÓN POR TIPO</div>';
  var tiposOrdenados = Object.keys(d.porTipo).sort(function(a,b){ return d.porTipo[b]-d.porTipo[a]; });
  tiposOrdenados.forEach(function(tipo) {
    var n = d.porTipo[tipo];
    var pct = Math.round((n / total) * 100);
    var color = _colorTipo(tipo);
    html += '<div style="margin-bottom:6px;">';
    html += '<div style="display:flex;justify-content:space-between;font-family:monospace;font-size:7.5px;margin-bottom:2px;">';
    html += '<span style="color:' + color + ';">' + tipo.toUpperCase() + '</span>';
    html += '<span style="color:#7a9ab8;">' + n + ' <span style="color:#3a5a7a;">(' + pct + '%)</span></span>';
    html += '</div>';
    html += '<div style="height:5px;background:#0d2040;border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:2px;opacity:.85;"></div>';
    html += '</div></div>';
  });
  html += '</div>';

  // ── C. Por fuente ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">C · FUENTES</div>';
  var fuentesOrdenadas = Object.keys(d.porFuente).sort(function(a,b){ return d.porFuente[b]-d.porFuente[a]; });
  var maxF = fuentesOrdenadas.length > 0 ? d.porFuente[fuentesOrdenadas[0]] : 1;
  fuentesOrdenadas.forEach(function(f) {
    var n = d.porFuente[f];
    var pct = Math.round((n / total) * 100);
    var w = Math.round((n / maxF) * 100);
    html += '<div class="data-fuente-row">';
    html += '<div style="min-width:110px;font-family:monospace;font-size:7.5px;color:#c0e8ff;">' + f + '</div>';
    html += '<div class="data-fuente-bar"><div class="data-fuente-fill" style="width:' + w + '%;"></div></div>';
    html += '<div style="min-width:50px;text-align:right;font-family:monospace;font-size:7px;color:#7a9ab8;">' + n + ' (' + pct + '%)</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── D. Análisis lingüístico ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">D · ANÁLISIS LINGÜÍSTICO</div>';

  // Da) Temas citados (de IA)
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-family:monospace;font-size:7px;color:#00ccff;letter-spacing:1px;margin-bottom:6px;">Da · TEMAS MÁS CITADOS <span style="color:#2a4a6a;font-size:6px;">(IA)</span></div>';
  if (d.tematica.length === 0) {
    html += '<div style="font-size:7px;color:#2a4a6a;">Sin datos suficientes aún. Aprueba más noticias con análisis IA.</div>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    var maxT = d.tematica[0] ? d.tematica[0].n : 1;
    d.tematica.forEach(function(t, i) {
      var size = 7 + Math.round((t.n / maxT) * 5);
      var opacity = 0.6 + (t.n / maxT) * 0.4;
      html += '<span class="data-tag" style="font-size:' + size + 'px;opacity:' + opacity + ';">';
      html += t.palabra + ' <span style="color:#3a6a9a;font-size:6px;">×' + t.n + '</span></span>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Db) Sustantivos más escritos (de IA + local)
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-family:monospace;font-size:7px;color:#00ccff;letter-spacing:1px;margin-bottom:6px;">Db · SUSTANTIVOS REFERENCIADOS <span style="color:#2a4a6a;font-size:6px;">(top 10)</span></div>';
  if (d.sustantivos.length === 0) {
    html += '<div style="font-size:7px;color:#2a4a6a;">Sin datos aún.</div>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    var maxS = d.sustantivos[0] ? d.sustantivos[0].n : 1;
    d.sustantivos.forEach(function(s) {
      var size = 7 + Math.round((s.n / maxS) * 4);
      html += '<span class="data-tag" style="font-size:' + size + 'px;">';
      html += s.palabra + ' <span style="color:#3a6a9a;font-size:6px;">×' + s.n + '</span></span>';
    });
    html += '</div>';
  }
  html += '</div>';
  html += '</div>'; // cierra data-bloque lingüístico

  // ── E. Lematización de verbos ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">E · LEMATIZACIÓN VERBAL <span style="font-size:6px;color:#3a5a7a;">(30 verbos en infinitivo más frecuentes)</span></div>';
  if (d.verbos.length === 0) {
    html += '<div style="font-size:7px;color:#2a4a6a;">Sin datos de verbos aún.</div>';
  } else {
    html += '<div class="data-verbo-grid">';
    d.verbos.forEach(function(v) {
      html += '<div class="data-verbo">' + v.palabra + '<span>×' + v.n + '</span></div>';
    });
    html += '</div>';
  }
  // Campos semánticos
  if (Object.keys(d.camposSemanticos).length > 0) {
    html += '<div style="margin-top:10px;border-top:1px solid #0d2040;padding-top:8px;">';
    html += '<div style="font-family:monospace;font-size:7px;color:#b060ff;letter-spacing:1px;margin-bottom:8px;">CAMPOS SEMÁNTICOS VERBALES</div>';
    Object.keys(d.camposSemanticos).forEach(function(campo) {
      var verbos = d.camposSemanticos[campo];
      html += '<div style="margin-bottom:8px;">';
      html += '<div style="font-family:monospace;font-size:6.5px;color:#7a5aaa;letter-spacing:1px;margin-bottom:4px;">' + campo + '</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      verbos.forEach(function(v) {
        html += '<span class="data-tag" style="border-color:#b060ff33;color:#c0a8f0;font-size:7px;">' + v.palabra + ' <span style="color:#5a3a8a;">×' + v.n + '</span></span>';
      });
      html += '</div></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // ── F. Análisis del discurso ──
  html += '<div class="data-bloque">';
  html += '<div class="data-bloque-titulo">F · ANÁLISIS DEL DISCURSO</div>';

  // Temporalidad
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-family:monospace;font-size:7px;color:#ffc800;letter-spacing:1px;margin-bottom:6px;">Fa · DISTRIBUCIÓN TEMPORAL DE EVENTOS</div>';
  var tiemposData = [
    { key:'manana', label:'Mañana', color:'#ffcc00', emoji:'🌅' },
    { key:'tarde', label:'Tarde', color:'#ff8800', emoji:'☀️' },
    { key:'noche', label:'Noche', color:'#0050aa', emoji:'🌙' },
    { key:'madrugada', label:'Madrugada', color:'#6030aa', emoji:'🌃' },
    { key:'desconocido', label:'Sin hora', color:'#3a5a7a', emoji:'❓' }
  ];
  var maxTime = Math.max.apply(null, tiemposData.map(function(t){ return d.discurso.tiempos[t.key]||0; })) || 1;
  tiemposData.forEach(function(t) {
    var n = d.discurso.tiempos[t.key] || 0;
    if (n === 0) return;
    var pct = Math.round((n / total) * 100);
    var w = Math.round((n / maxTime) * 100);
    html += '<div style="margin-bottom:5px;display:flex;align-items:center;gap:8px;">';
    html += '<span style="min-width:70px;font-family:monospace;font-size:7.5px;color:' + t.color + ';">' + t.emoji + ' ' + t.label + '</span>';
    html += '<div style="flex:1;height:5px;background:#0d2040;border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + w + '%;background:' + t.color + ';border-radius:2px;"></div></div>';
    html += '<span style="min-width:50px;font-family:monospace;font-size:7px;color:#7a9ab8;text-align:right;">' + n + ' (' + pct + '%)</span>';
    html += '</div>';
  });
  html += '</div>';

  // Actores recurrentes
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-family:monospace;font-size:7px;color:#ffc800;letter-spacing:1px;margin-bottom:6px;">Fb · ACTORES RECURRENTES <span style="color:#2a4a6a;font-size:6px;">(aparecen en 2+ noticias)</span></div>';
  if (d.discurso.topActores.length === 0) {
    html += '<div style="font-size:7px;color:#2a4a6a;">Sin actores recurrentes detectados aún.</div>';
  } else {
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    d.discurso.topActores.forEach(function(a) {
      html += '<span class="data-tag" style="border-color:#ffc80044;color:#ffd860;">';
      html += '👤 ' + a.nombre + ' <span style="color:#7a6a20;">×' + a.n + '</span></span>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Confiabilidad del corpus
  html += '<div style="margin-bottom:8px;">';
  html += '<div style="font-family:monospace;font-size:7px;color:#ffc800;letter-spacing:1px;margin-bottom:6px;">Fc · CONFIABILIDAD DEL CORPUS</div>';
  var confs = [
    { key:'alta', label:'Alta', color:'#00ff88' },
    { key:'media', label:'Media', color:'#ffc800' },
    { key:'baja', label:'Baja', color:'#ff4466' }
  ];
  confs.forEach(function(c) {
    var n = d.discurso.confianzas[c.key] || 0;
    if (n === 0) return;
    var pct = Math.round((n / total) * 100);
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span style="min-width:50px;font-family:monospace;font-size:7.5px;color:' + c.color + ';">' + c.label + '</span>';
    html += '<div style="flex:1;height:4px;background:#0d2040;border-radius:2px;overflow:hidden;">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + c.color + ';border-radius:2px;"></div></div>';
    html += '<span style="font-family:monospace;font-size:7px;color:#7a9ab8;">' + n + ' (' + pct + '%)</span>';
    html += '</div>';
  });
  html += '<div style="margin-top:6px;font-size:6.5px;color:#2a4a6a;font-family:monospace;">';
  html += 'Densidad media: ' + d.discurso.densidadMedia + ' palabras/noticia · ';
  html += d.discurso.conNombres + ' noticias con actores nombrados (' + Math.round((d.discurso.conNombres/total)*100) + '%)';
  html += '</div>';
  html += '</div>';

  html += '</div>'; // cierra discurso bloque

  // ── Botón refrescar ──
  html += '<div style="padding:10px 0;text-align:center;">';
  html += '<button onclick="renderData()" style="padding:8px 20px;font-family:monospace;font-size:7.5px;letter-spacing:1px;background:rgba(0,245,255,.08);color:#00f5ff;border:1px solid #00f5ff44;border-radius:3px;cursor:pointer;">↺ RECALCULAR ANÁLISIS</button>';
  html += '</div>';

  cont.innerHTML = html;
}

function mkDataStat(val, label, color) {
  return '<div class="data-stat">' +
    '<div class="data-stat-n" style="color:' + color + ';">' + val + '</div>' +
    '<div class="data-stat-l">' + label + '</div>' +
    '</div>';
}

function _colorTipo(tipo) {
  var COLORES = {
    seguridad:'#ff2255', accidente:'#ff8800', evento:'#00ccff',
    gobierno:'#0096ff', rumor:'#3a5a7a', desaparecido:'#ffa500',
    salud:'#00c864', transporte:'#b464ff', politica:'#c040ff',
    ambiental:'#00aa44', corrupcion:'#ffcc00', crimen_organizado:'#cc0022'
  };
  return COLORES[tipo] || '#7a9ab8';
}

// ── Hook: cuando bd.js actualiza noticias, también refrescar Data si está activo ──
function dataOnNoticiasCambiaron() {
  if (_dataActivo) renderData();
}
window.dataOnNoticiasCambiaron = dataOnNoticiasCambiaron;

function verBdSubtab(cual) {
  _dataActivo = (cual === 'data');
  var tabs = ['corpus', 'data'];
  tabs.forEach(function(t) {
    var btn = document.getElementById('bdstab-' + t);
    var sec = document.getElementById('bd-sec-' + t);
    if (btn) btn.classList.toggle('activo', t === cual);
    if (sec) sec.style.display = (t === cual) ? 'block' : 'none';
  });
  if (cual === 'data') renderData();
}
window.verBdSubtab = verBdSubtab;

// Alias para verBDSubtab en app.js
function iniciarData() { renderData(); }
window.iniciarData = iniciarData;
