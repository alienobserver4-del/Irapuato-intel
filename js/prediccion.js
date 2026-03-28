/**
 * prediccion.js — Sprint 4: Inteligencia Predictiva Territorial
 * Irapuato Intel · 4Alien
 *
 * API pública:
 *   prediccionInit()              — llamar desde app.js tras escucharBD()
 *   prediccionRecalcular()        — fuerza recálculo (llamar tras noticias[] actualizado)
 *   prediccionRenderTab()         — renderiza la tab PREDIC completa
 *   prediccionPanelIntel()        — renderiza panel colapsable en tab Intel
 *   prediccionContextoIA(lat,lng) — texto de tendencia para buildPrompt()
 *   prediccionBadgeHTML(ageb)     — badge ⚠ ZONA ACTIVA para markers Intel
 *   PREDIC                        — objeto de estado global
 */

var PREDIC = {
  listo: false,
  ultimoCalculo: 0,
  ageb: {},        // { clave_ageb: { ... stats } }
  anomalias: [],   // AGEBs con anomalía activa, ordenados por severidad
  TIPOS_RELEVANTES: ['seguridad', 'accidente', 'crimen_organizado',
                     'transporte', 'ambiental', 'corrupcion', 'gobierno',
                     'politica', 'salud', 'evento', 'rumor', 'desaparecido'],
  MIN_NOTICIAS: 5,
  VENTANA_MOVIL_DIAS: 7,
  VENTANA_HISTORICO_DIAS: 90,
  SIGMA_UMBRAL: 2.0,
  DIAS_RECIENTE: 14  // ventana para considerar anomalía "activa"
};

// ─── Utilidades internas ────────────────────────────────────────────────────

function _predicMs(diasAtras) {
  return Date.now() - (diasAtras * 86400000);
}

function _predicDiaSemana(ts) {
  // 0=Dom, 1=Lun, ..., 6=Sab
  return new Date(ts).getDay();
}

function _predicNombreDia(n) {
  return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][n];
}

function _predicMedia(arr) {
  if (!arr || arr.length === 0) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function _predicDesv(arr, media) {
  if (!arr || arr.length < 2) return 0;
  var s = 0;
  for (var i = 0; i < arr.length; i++) {
    s += Math.pow(arr[i] - media, 2);
  }
  return Math.sqrt(s / arr.length);
}

// Divide noticias en ventanas de 7 días dentro del histórico de 90 días
function _predicVentanas(lista, diasTotal, diasVentana) {
  var ventanas = [];
  var nVentanas = Math.floor(diasTotal / diasVentana);
  var ahora = Date.now();
  for (var v = 0; v < nVentanas; v++) {
    var fin = ahora - (v * diasVentana * 86400000);
    var inicio = fin - (diasVentana * 86400000);
    var count = 0;
    for (var i = 0; i < lista.length; i++) {
      var t = lista[i].ts || 0;
      if (t >= inicio && t < fin) count++;
    }
    ventanas.push(count);
  }
  return ventanas; // ventanas[0] = más reciente
}

// ─── Cálculo principal ──────────────────────────────────────────────────────

function prediccionRecalcular() {
  if (!noticias || noticias.length === 0) return;
  if (typeof geoLookup !== 'function') return;

  PREDIC.ageb = {};
  PREDIC.anomalias = [];

  // 1. Agrupar noticias por AGEB
  var agebNoticias = {};
  var ahora90 = _predicMs(PREDIC.VENTANA_HISTORICO_DIAS);

  for (var i = 0; i < noticias.length; i++) {
    var n = noticias[i];
    if (!n.lat || !n.lng) continue;
    if (!n.ts) continue;
    if (n.ts < ahora90) continue; // solo últimos 90 días

    var geo = geoLookup(n.lat, n.lng);
    if (!geo || !geo.clave_ageb) continue;

    var clave = geo.clave_ageb;
    if (!agebNoticias[clave]) agebNoticias[clave] = [];
    agebNoticias[clave].push(n);
  }

  // 2. Calcular estadísticas por AGEB
  var agrebClaves = Object.keys(agebNoticias);
  for (var k = 0; k < agrebClaves.length; k++) {
    var clave = agrebClaves[k];
    var lista = agebNoticias[clave];

    if (lista.length < PREDIC.MIN_NOTICIAS) continue;

    // Ventanas de 7 días (12 ventanas en 90 días)
    var ventanas = _predicVentanas(lista, PREDIC.VENTANA_HISTORICO_DIAS, PREDIC.VENTANA_MOVIL_DIAS);
    var mediaVentanas = _predicMedia(ventanas);
    var desvVentanas = _predicDesv(ventanas, mediaVentanas);

    // Ventana actual (últimos 7 días)
    var ahora7 = _predicMs(PREDIC.VENTANA_MOVIL_DIAS);
    var recientes = [];
    var ahoraDias14 = _predicMs(PREDIC.DIAS_RECIENTE);
    var recientes14 = [];

    for (var r = 0; r < lista.length; r++) {
      if (lista[r].ts >= ahora7) recientes.push(lista[r]);
      if (lista[r].ts >= ahoraDias14) recientes14.push(lista[r]);
    }

    var countActual = recientes.length;
    var sigma = desvVentanas > 0 ? (countActual - mediaVentanas) / desvVentanas : 0;
    var anomalia = sigma >= PREDIC.SIGMA_UMBRAL;

    // Periodicidad: día de la semana con más incidentes
    var diasCount = [0,0,0,0,0,0,0];
    for (var d = 0; d < lista.length; d++) {
      diasCount[_predicDiaSemana(lista[d].ts)]++;
    }
    var diaPico = 0;
    for (var di = 1; di < 7; di++) {
      if (diasCount[di] > diasCount[diaPico]) diaPico = di;
    }

    // Tendencia: comparar primera mitad vs segunda mitad del histórico
    var mitad = _predicMs(45);
    var primeraM = 0, segundaM = 0;
    for (var t = 0; t < lista.length; t++) {
      if (lista[t].ts < mitad) primeraM++;
      else segundaM++;
    }
    var tendencia = 'estable';
    if (segundaM > primeraM * 1.3) tendencia = 'subiendo';
    else if (segundaM < primeraM * 0.7) tendencia = 'bajando';

    // Tipos de incidente en los últimos 14 días
    var tiposRecientes = {};
    for (var tr = 0; tr < recientes14.length; tr++) {
      var tipo = recientes14[tr].tipo || 'otro';
      tiposRecientes[tipo] = (tiposRecientes[tipo] || 0) + 1;
    }

    PREDIC.ageb[clave] = {
      clave: clave,
      total90: lista.length,
      countActual: countActual,  // últimos 7 días
      count14: recientes14.length,
      mediaVentanas: mediaVentanas,
      desvVentanas: desvVentanas,
      sigma: sigma,
      anomalia: anomalia,
      tendencia: tendencia,
      diaPico: diaPico,
      diasCount: diasCount,
      tiposRecientes: tiposRecientes,
      ventanas: ventanas,
      // coordenadas representativas (centroide de noticias recientes)
      lat: lista[0].lat,
      lng: lista[0].lng
    };

    if (anomalia) {
      PREDIC.anomalias.push(PREDIC.ageb[clave]);
    }
  }

  // Ordenar anomalías por sigma descendente
  PREDIC.anomalias.sort(function(a, b) { return b.sigma - a.sigma; });

  PREDIC.listo = true;
  PREDIC.ultimoCalculo = Date.now();

  // Notificar a Intel si está abierto
  if (typeof _predicActualizarBadgesIntel === 'function') {
    _predicActualizarBadgesIntel();
  }
}

// ─── Badge para tarjetas / markers ─────────────────────────────────────────

window.prediccionBadgeHTML = function(clave_ageb) {
  if (!PREDIC.listo || !clave_ageb) return '';
  var s = PREDIC.ageb[clave_ageb];
  if (!s || !s.anomalia) return '';
  var col = s.sigma >= 3 ? '#ff2d2d' : '#ff8c00';
  return '<span style="background:' + col + ';color:#fff;font-size:10px;' +
    'font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:.5px;' +
    'margin-left:4px;">⚠ ZONA ACTIVA</span>';
};

window.prediccionTendenciaBadge = function(clave_ageb) {
  if (!PREDIC.listo || !clave_ageb) return '';
  var s = PREDIC.ageb[clave_ageb];
  if (!s) return '';
  var icons = { subiendo: '↑', estable: '→', bajando: '↓' };
  var cols  = { subiendo: '#ff4444', estable: '#aaa', bajando: '#4caf50' };
  return '<span style="color:' + cols[s.tendencia] + ';font-size:11px;font-weight:700;">' +
    icons[s.tendencia] + ' ' + s.tendencia.toUpperCase() + '</span>';
};

// ─── Contexto para IA ───────────────────────────────────────────────────────

window.prediccionContextoIA = function(lat, lng) {
  if (!PREDIC.listo) return '';
  if (typeof geoLookup !== 'function') return '';
  var geo = geoLookup(lat, lng);
  if (!geo || !geo.clave_ageb) return '';
  var s = PREDIC.ageb[geo.clave_ageb];
  if (!s) return '';

  var txt = 'PREDICCIÓN TERRITORIAL: ';
  txt += 'Últimos 7 días: ' + s.countActual + ' incidentes en este AGEB. ';
  txt += 'Media histórica (90d): ' + s.mediaVentanas.toFixed(1) + '/semana. ';
  if (s.anomalia) {
    txt += '⚠ ZONA ACTIVA: ' + s.sigma.toFixed(1) + 'σ sobre la media histórica. ';
  }
  txt += 'Tendencia: ' + s.tendencia + '. ';
  txt += 'Día de mayor actividad: ' + _predicNombreDia(s.diaPico) + '.';
  return txt;
};

// ─── Panel colapsable para tab Intel ───────────────────────────────────────

window.prediccionPanelIntel = function() {
  var div = document.getElementById('predic-panel-intel');
  if (!div) return;

  if (!PREDIC.listo || PREDIC.anomalias.length === 0) {
    div.innerHTML = '<div style="color:#666;font-size:12px;padding:8px;">Sin datos de predicción aún. Se necesitan ≥5 noticias por zona.</div>';
    return;
  }

  var html = '<div style="font-size:11px;color:#0ff;font-weight:700;margin-bottom:6px;">' +
    '⚠ ZONAS ACTIVAS (' + PREDIC.anomalias.length + ')' +
    '</div>';

  var max = Math.min(PREDIC.anomalias.length, 8);
  for (var i = 0; i < max; i++) {
    var s = PREDIC.anomalias[i];
    var col = s.sigma >= 3 ? '#ff2d2d' : '#ff8c00';
    html += '<div style="border-left:3px solid ' + col + ';padding:4px 6px;margin-bottom:4px;' +
      'background:rgba(255,100,0,0.07);cursor:pointer;" ' +
      'onclick="prediccionIrAIntel(\'' + s.clave + '\')">' +
      '<span style="color:' + col + ';font-weight:700;">' + s.clave + '</span> ' +
      '<span style="color:#fff;">' + s.countActual + ' en 7d</span> ' +
      '<span style="color:#888;">(+' + s.sigma.toFixed(1) + 'σ)</span>' +
      '</div>';
  }
  div.innerHTML = html;
};

window.prediccionIrAIntel = function(clave_ageb) {
  var s = PREDIC.ageb[clave_ageb];
  if (!s || !intelObj) return;
  intelObj.setView([s.lat, s.lng], 15);
};

// Actualizar badges en markers existentes de Intel
function _predicActualizarBadgesIntel() {
  // intel.js llama a prediccionBadgeHTML() al crear cada marker popup
  // Aquí forzamos re-render si Intel ya está activo
  if (typeof renderIntel === 'function' && document.getElementById('sec-intel') &&
      document.getElementById('sec-intel').style.display !== 'none') {
    // no re-render completo — los badges se inyectan en el próximo renderIntel()
  }
  if (typeof prediccionPanelIntel === 'function') {
    prediccionPanelIntel();
  }
}

// ─── Tab PREDIC completa ────────────────────────────────────────────────────

window.prediccionRenderTab = function() {
  var sec = document.getElementById('sec-predic');
  if (!sec) return;

  if (!PREDIC.listo) {
    sec.innerHTML = '<div style="padding:20px;color:#666;text-align:center;">' +
      'Calculando predicciones...<br><small>Cargando datos del corpus</small></div>';
    return;
  }

  var totalAgebs = Object.keys(PREDIC.ageb).length;
  var totalAnomalia = PREDIC.anomalias.length;
  var ts = new Date(PREDIC.ultimoCalculo);
  var tsStr = ts.getDate() + '/' + (ts.getMonth()+1) + '/' + ts.getFullYear() +
    ' ' + ts.getHours() + ':' + (ts.getMinutes()<10?'0':'') + ts.getMinutes();

  var html = '<div style="padding:12px;max-width:900px;margin:0 auto;">';

  // Cabecera
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">' +
    '<div style="color:#0ff;font-size:15px;font-weight:700;letter-spacing:1px;">⚡ PREDICCIÓN TERRITORIAL</div>' +
    '<div style="font-size:10px;color:#444;">Calculado: ' + tsStr + ' · ' + totalAgebs + ' zonas analizadas</div>' +
    '<button onclick="prediccionRecalcular();prediccionRenderTab();" ' +
    'style="background:#1a1a2e;border:1px solid #0ff;color:#0ff;padding:4px 10px;font-size:11px;cursor:pointer;border-radius:3px;">↺ RECALCULAR</button>' +
    '</div>';

  // KPIs
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:16px;">';
  html += _predicKpi('ZONAS CON DATOS', totalAgebs, '#0ff');
  html += _predicKpi('ZONAS ACTIVAS ⚠', totalAnomalia, totalAnomalia > 0 ? '#ff8c00' : '#4caf50');
  // Tendencia general
  var subiendo = 0, bajando = 0;
  var claves = Object.keys(PREDIC.ageb);
  for (var i = 0; i < claves.length; i++) {
    var s = PREDIC.ageb[claves[i]];
    if (s.tendencia === 'subiendo') subiendo++;
    if (s.tendencia === 'bajando') bajando++;
  }
  html += _predicKpi('↑ TENDENCIA ALTA', subiendo, '#ff4444');
  html += _predicKpi('↓ TENDENCIA BAJA', bajando, '#4caf50');
  html += '</div>';

  // Tabla de zonas activas
  if (totalAnomalia > 0) {
    html += '<div style="color:#ff8c00;font-size:13px;font-weight:700;margin-bottom:8px;">⚠ Zonas con anomalía activa (>' + PREDIC.SIGMA_UMBRAL + 'σ)</div>';
    html += '<div style="overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="color:#0ff;border-bottom:1px solid #222;">' +
      '<th style="text-align:left;padding:5px 8px;">AGEB</th>' +
      '<th style="padding:5px 8px;">7 días</th>' +
      '<th style="padding:5px 8px;">Media/sem</th>' +
      '<th style="padding:5px 8px;">σ</th>' +
      '<th style="padding:5px 8px;">Tendencia</th>' +
      '<th style="padding:5px 8px;">Día pico</th>' +
      '<th style="padding:5px 8px;">14d total</th>' +
      '<th style="padding:5px 8px;">Acción</th>' +
      '</tr></thead><tbody>';

    for (var j = 0; j < PREDIC.anomalias.length; j++) {
      var a = PREDIC.anomalias[j];
      var bgRow = j % 2 === 0 ? 'rgba(255,140,0,0.05)' : 'transparent';
      var sigmaColor = a.sigma >= 3 ? '#ff2d2d' : '#ff8c00';
      var tendIcon = a.tendencia === 'subiendo' ? '↑' : (a.tendencia === 'bajando' ? '↓' : '→');
      var tendColor = a.tendencia === 'subiendo' ? '#ff4444' : (a.tendencia === 'bajando' ? '#4caf50' : '#aaa');
      html += '<tr style="background:' + bgRow + ';border-bottom:1px solid #1a1a1a;">' +
        '<td style="padding:5px 8px;font-family:monospace;color:#fff;">' + a.clave + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:#fff;font-weight:700;">' + a.countActual + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:#888;">' + a.mediaVentanas.toFixed(1) + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:' + sigmaColor + ';font-weight:700;">' + a.sigma.toFixed(1) + 'σ</td>' +
        '<td style="padding:5px 8px;text-align:center;color:' + tendColor + ';font-weight:700;">' + tendIcon + ' ' + a.tendencia + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:#ccc;">' + _predicNombreDia(a.diaPico) + '</td>' +
        '<td style="padding:5px 8px;text-align:center;color:#aaa;">' + a.count14 + '</td>' +
        '<td style="padding:5px 8px;text-align:center;">' +
        '<button onclick="prediccionIrAIntel(\'' + a.clave + '\');verTab(\'intel\');" ' +
        'style="background:#1a1a2e;border:1px solid #ff8c00;color:#ff8c00;padding:2px 7px;font-size:10px;cursor:pointer;border-radius:2px;">📍 VER</button>' +
        '</td>' +
        '</tr>';
    }
    html += '</tbody></table></div>';
  } else {
    html += '<div style="background:rgba(0,255,0,0.05);border:1px solid #1a3a1a;padding:12px;border-radius:4px;color:#4caf50;margin-bottom:16px;">' +
      '✓ Sin anomalías detectadas en las últimas 2 semanas. Actividad dentro de parámetros normales.</div>';
  }

  // Gráfica de barras de ventanas móviles — top 3 AGEBs
  if (PREDIC.anomalias.length > 0) {
    html += '<div style="margin-top:20px;">';
    html += '<div style="color:#0ff;font-size:13px;font-weight:700;margin-bottom:10px;">📈 Media móvil (ventanas de 7 días · últimos 90 días)</div>';
    var topN = Math.min(3, PREDIC.anomalias.length);
    for (var tk = 0; tk < topN; tk++) {
      html += _predicGraficaVentanas(PREDIC.anomalias[tk]);
    }
    html += '</div>';
  }

  // Tabla de todas las zonas con datos (tendencia general)
  html += '<div style="margin-top:20px;">';
  html += '<div style="color:#0ff;font-size:13px;font-weight:700;margin-bottom:8px;">📊 Todas las zonas con datos</div>';
  html += '<div style="overflow-x:auto;">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
  html += '<thead><tr style="color:#555;border-bottom:1px solid #1a1a1a;">' +
    '<th style="text-align:left;padding:4px 6px;">AGEB</th>' +
    '<th style="padding:4px 6px;">Total 90d</th>' +
    '<th style="padding:4px 6px;">Últ. 7d</th>' +
    '<th style="padding:4px 6px;">Media/sem</th>' +
    '<th style="padding:4px 6px;">Tendencia</th>' +
    '<th style="padding:4px 6px;">Día pico</th>' +
    '</tr></thead><tbody>';

  // Ordenar por total90 desc
  var ordenadas = claves.slice().sort(function(a,b) {
    return PREDIC.ageb[b].total90 - PREDIC.ageb[a].total90;
  });
  for (var oi = 0; oi < ordenadas.length; oi++) {
    var oa = PREDIC.ageb[ordenadas[oi]];
    var bgOi = oi % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
    var tendCol = oa.tendencia === 'subiendo' ? '#ff4444' : (oa.tendencia === 'bajando' ? '#4caf50' : '#666');
    var tendIc = oa.tendencia === 'subiendo' ? '↑' : (oa.tendencia === 'bajando' ? '↓' : '→');
    var anomMark = oa.anomalia ? ' <span style="color:#ff8c00;font-size:9px;">⚠</span>' : '';
    html += '<tr style="background:' + bgOi + ';border-bottom:1px solid #111;">' +
      '<td style="padding:4px 6px;font-family:monospace;color:#ccc;">' + oa.clave + anomMark + '</td>' +
      '<td style="padding:4px 6px;text-align:center;color:#888;">' + oa.total90 + '</td>' +
      '<td style="padding:4px 6px;text-align:center;color:#fff;font-weight:' + (oa.anomalia?'700':'400') + ';">' + oa.countActual + '</td>' +
      '<td style="padding:4px 6px;text-align:center;color:#666;">' + oa.mediaVentanas.toFixed(1) + '</td>' +
      '<td style="padding:4px 6px;text-align:center;color:' + tendCol + ';font-weight:700;">' + tendIc + ' ' + oa.tendencia + '</td>' +
      '<td style="padding:4px 6px;text-align:center;color:#888;">' + _predicNombreDia(oa.diaPico) + '</td>' +
      '</tr>';
  }
  html += '</tbody></table></div></div>';

  html += '</div>'; // fin padding div
  sec.innerHTML = html;
};

function _predicKpi(label, valor, color) {
  return '<div style="background:#0d0d1a;border:1px solid #1a1a2e;padding:10px;border-radius:4px;text-align:center;">' +
    '<div style="color:' + color + ';font-size:22px;font-weight:700;">' + valor + '</div>' +
    '<div style="color:#444;font-size:10px;margin-top:2px;letter-spacing:.5px;">' + label + '</div>' +
    '</div>';
}

function _predicGraficaVentanas(s) {
  var html = '<div style="margin-bottom:14px;background:#0d0d1a;border:1px solid #1a1a2e;padding:10px;border-radius:4px;">';
  html += '<div style="font-size:11px;color:#888;margin-bottom:6px;">AGEB <span style="color:#fff;font-family:monospace;">' + s.clave + '</span> — ';
  html += 'Media ' + s.mediaVentanas.toFixed(1) + '/sem · σ=' + s.desvVentanas.toFixed(1) + '</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:2px;height:40px;">';

  var vmax = Math.max.apply(null, s.ventanas);
  if (vmax < 1) vmax = 1;
  // ventanas[0] = más reciente → mostrar de izq (antigua) a der (reciente)
  var ordenadas = s.ventanas.slice().reverse();
  for (var v = 0; v < ordenadas.length; v++) {
    var pct = ordenadas[v] / vmax;
    var h = Math.max(2, Math.round(pct * 38));
    var isLast = v === ordenadas.length - 1;
    var col = isLast && s.anomalia ? '#ff2d2d' : (isLast ? '#0ff' : '#1a3a4a');
    html += '<div title="Semana -' + (ordenadas.length - 1 - v) + ': ' + ordenadas[v] + ' incidentes" ' +
      'style="flex:1;height:' + h + 'px;background:' + col + ';border-radius:1px;"></div>';
  }
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:#333;margin-top:2px;">' +
    '<span>-' + (s.ventanas.length) + ' sem</span><span>hoy</span></div>';
  html += '</div>';
  return html;
}

// ─── Init ───────────────────────────────────────────────────────────────────

window.prediccionInit = function() {
  // Esperar a que geo.js esté cargado y noticias[] disponible
  var intentos = 0;
  var check = setInterval(function() {
    intentos++;
    if (typeof geoLookup === 'function' && noticias && noticias.length > 0) {
      clearInterval(check);
      prediccionRecalcular();
    }
    if (intentos > 30) clearInterval(check); // 15s timeout
  }, 500);
};

window.prediccionRecalcular = prediccionRecalcular;

// ─── Registro de proveedor de contexto IA ────────────────────────────────────
(function() {
  window.IA_CONTEXT_PROVIDERS = window.IA_CONTEXT_PROVIDERS || [];
  window.IA_CONTEXT_PROVIDERS.push(function(lat, lng) {
    if (typeof prediccionContextoIA === 'function') return prediccionContextoIA(lat, lng);
    return null;
  });
}());
