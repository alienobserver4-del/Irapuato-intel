// ═══════════════════════════════════════════════════════════════
// SESNSP.JS — Incidencia Delictiva Municipal 2015-2025
// Irapuato Intel · Sprint 3
//
// Fuente: Secretariado Ejecutivo del Sistema Nacional de
//         Seguridad Pública (SESNSP) — datos abiertos
//
// Responsabilidades:
//   1. Cargar sesnsp_irapuato.json
//   2. Agregar datos por tipo de delito / año / mes
//   3. Renderizar tab SESNSP: gráfica tendencia + tabla descargable
//   4. Exponer sesnspComponenteDelitos(año, mes) para el IRZ
// ═══════════════════════════════════════════════════════════════

var SESNSP = {
  data:    [],
  loaded:  false,
  loading: false,
  loadCallbacks: []
};

var SESNSP_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Delitos de alto impacto para destacar en gráficas
var SESNSP_ALTO_IMPACTO = [
  'Homicidio',
  'Feminicidio',
  'Secuestro',
  'Extorsión',
  'Robo',
  'Lesiones',
  'Narcomenudeo',
  'Violación simple',
  'Violencia familiar'
];

// Colores por tipo de delito
var SESNSP_COLORES = {
  'Homicidio':         '#ff2244',
  'Feminicidio':       '#ff66aa',
  'Secuestro':         '#cc00ff',
  'Extorsión':         '#ff8800',
  'Robo':              '#ffcc00',
  'Lesiones':          '#ff6600',
  'Narcomenudeo':      '#00ccff',
  'Violación simple':  '#ff44aa',
  'Violencia familiar':'#aa44ff',
  'default':           '#4488aa'
};

// ═══════════════════════════════════════════════════════════════
// 1. CARGA
// ═══════════════════════════════════════════════════════════════

function sesnspcCargar(callback) {
  if (SESNSP.loaded)  { if (callback) callback(); return; }
  if (SESNSP.loading) { if (callback) SESNSP.loadCallbacks.push(callback); return; }
  SESNSP.loading = true;
  if (callback) SESNSP.loadCallbacks.push(callback);

  fetch('sesnsp_irapuato.json')
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      SESNSP.data   = data;
      SESNSP.loaded = true;
      SESNSP.loading = false;
      console.log('[SESNSP] ' + data.length + ' registros cargados (2015-2025)');
      var cbs = SESNSP.loadCallbacks.slice();
      SESNSP.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
    })
    .catch(function(err) {
      SESNSP.loading = false;
      SESNSP.loaded  = true;
      console.warn('[SESNSP] Error:', err.message);
      var cbs = SESNSP.loadCallbacks.slice();
      SESNSP.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
    });
}

// ═══════════════════════════════════════════════════════════════
// 2. FUNCIONES DE AGREGACIÓN
// ═══════════════════════════════════════════════════════════════

// Total de un tipo de delito en un año (suma todos los meses y modalidades)
function sesnspcTotalAnioTipo(anio, tipo) {
  var total = 0;
  SESNSP.data.forEach(function(r) {
    if (r['Año'] !== String(anio)) return;
    if (tipo && r['Tipo de delito'] !== tipo) return;
    SESNSP_MESES.forEach(function(m) {
      total += parseInt(r[m] || '0', 10);
    });
  });
  return total;
}

// Serie mensual de un tipo de delito en un año específico
// Retorna array de 12 números [ene, feb, ..., dic]
function sesnspcSerieMensual(anio, tipo) {
  var serie = [0,0,0,0,0,0,0,0,0,0,0,0];
  SESNSP.data.forEach(function(r) {
    if (r['Año'] !== String(anio)) return;
    if (tipo && r['Tipo de delito'] !== tipo) return;
    SESNSP_MESES.forEach(function(m, i) {
      serie[i] += parseInt(r[m] || '0', 10);
    });
  });
  return serie;
}

// Serie anual de un tipo de delito (total por año, todos los años)
function sesnspcSerieAnual(tipo) {
  var anios = ['2015','2016','2017','2018','2019','2020',
               '2021','2022','2023','2024','2025'];
  return anios.map(function(a) {
    return sesnspcTotalAnioTipo(a, tipo);
  });
}

// Últimos N meses como serie continua para un tipo de delito
function sesnspcUltimosNMeses(n, tipo) {
  var hoy    = new Date();
  var puntos = [];
  for (var i = n - 1; i >= 0; i--) {
    var d    = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    var anio = String(d.getFullYear());
    var mes  = SESNSP_MESES[d.getMonth()];
    var val  = 0;
    SESNSP.data.forEach(function(r) {
      if (r['Año'] !== anio) return;
      if (tipo && r['Tipo de delito'] !== tipo) return;
      val += parseInt(r[mes] || '0', 10);
    });
    puntos.push({ label: mes.substring(0,3) + ' ' + anio.substring(2), valor: val });
  }
  return puntos;
}

// Total general del año más reciente con datos completos
function sesnspcResumenReciente() {
  var resumen = {};
  SESNSP_ALTO_IMPACTO.forEach(function(tipo) {
    resumen[tipo] = {
      anio_actual:   sesnspcTotalAnioTipo('2025', tipo),
      anio_anterior: sesnspcTotalAnioTipo('2024', tipo),
      serie_12m:     sesnspcUltimosNMeses(12, tipo)
    };
    var prev = resumen[tipo].anio_anterior;
    var curr = resumen[tipo].anio_actual;
    resumen[tipo].variacion = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  });
  return resumen;
}

// Componente para el IRZ: total de delitos de alto impacto en los últimos 12 meses
// Retorna valor normalizado 0-100
function sesnspcComponenteIRZ() {
  if (!SESNSP.loaded || !SESNSP.data.length) return 0;
  var total = 0;
  var hoy   = new Date();
  for (var i = 0; i < 12; i++) {
    var d    = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    var anio = String(d.getFullYear());
    var mes  = SESNSP_MESES[d.getMonth()];
    SESNSP_ALTO_IMPACTO.forEach(function(tipo) {
      SESNSP.data.forEach(function(r) {
        if (r['Año'] !== anio) return;
        if (r['Tipo de delito'] !== tipo) return;
        total += parseInt(r[mes] || '0', 10);
      });
    });
  }
  // Normalizar: Irapuato histórico ~800-1200 delitos/año → 100 puntos máx a 1500
  return Math.min(Math.round((total / 1500) * 100), 100);
}

// ═══════════════════════════════════════════════════════════════
// 3. RENDER DEL TAB SESNSP
// ═══════════════════════════════════════════════════════════════

function sesnspcRenderTab() {
  var el = document.getElementById('tab-sesnsp-contenido');
  if (!el) return;

  if (!SESNSP.loaded) {
    el.innerHTML = '<div style="padding:20px;color:#3a8a6a;font-family:monospace;font-size:11px;">Cargando datos SESNSP...</div>';
    sesnspcCargar(sesnspcRenderTab);
    return;
  }

  var resumen = sesnspcResumenReciente();
  var anios   = ['2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];

  // ── Selector de tipo de delito y año ──
  var opcionesTipo = SESNSP_ALTO_IMPACTO.map(function(t) {
    return '<option value="' + t + '">' + t + '</option>';
  }).join('');

  var opcionesAnio = anios.map(function(a) {
    return '<option value="' + a + '"' + (a === '2025' ? ' selected' : '') + '>' + a + '</option>';
  }).join('');

  // ── Cards de resumen ──
  var cards = SESNSP_ALTO_IMPACTO.map(function(tipo) {
    var d     = resumen[tipo];
    var color = SESNSP_COLORES[tipo] || SESNSP_COLORES['default'];
    var varHTML = '';
    if (d.variacion !== null) {
      var signo = d.variacion >= 0 ? '▲' : '▼';
      var cvar  = d.variacion >= 0 ? '#ff4466' : '#00c864';
      varHTML   = '<span style="color:' + cvar + ';font-size:9px;">' + signo + ' ' + Math.abs(d.variacion) + '%</span>';
    }
    return '<div style="background:#0a1a14;border:1px solid ' + color + '33;border-left:3px solid ' + color + ';' +
      'border-radius:4px;padding:8px 10px;min-width:110px;">' +
      '<div style="font-size:8px;color:#4a8a6a;margin-bottom:3px;">' + tipo + '</div>' +
      '<div style="font-size:18px;color:' + color + ';font-family:monospace;font-weight:bold;">' + d.anio_actual + '</div>' +
      '<div style="font-size:8px;color:#3a6a5a;">2025 ' + varHTML + '</div>' +
      '<div style="font-size:7px;color:#2a4a3a;">2024: ' + d.anio_anterior + '</div>' +
      '</div>';
  }).join('');

  el.innerHTML =
    '<div style="padding:12px;font-family:monospace;">' +

    // Título
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
    '<div>' +
    '<div style="font-size:13px;color:#00ff88;font-weight:bold;">📊 Incidencia Delictiva — SESNSP</div>' +
    '<div style="font-size:9px;color:#3a6a5a;">Fuente: Secretariado Ejecutivo del SNSP · 2015–2025 · Irapuato, Gto.</div>' +
    '</div>' +
    '<button onclick="sesnspcDescargarCSV()" style="background:#0a2a1a;border:1px solid #00ff8844;' +
    'color:#00ff88;padding:5px 10px;border-radius:4px;font-size:9px;cursor:pointer;font-family:monospace;">⬇ CSV</button>' +
    '</div>' +

    // Cards resumen
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' + cards + '</div>' +

    // Controles de gráfica
    '<div style="background:#0a1a14;border:1px solid #1a3a2a;border-radius:6px;padding:12px;margin-bottom:12px;">' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">' +
    '<div style="font-size:9px;color:#4a8a6a;">Tipo de delito:</div>' +
    '<select id="sesnsp-tipo-sel" onchange="sesnspcActualizarGrafica()" ' +
    'style="background:#0a2a1a;border:1px solid #1a4a2a;color:#00ff88;padding:3px 6px;' +
    'font-size:9px;border-radius:3px;font-family:monospace;">' + opcionesTipo + '</select>' +
    '<div style="font-size:9px;color:#4a8a6a;">Vista:</div>' +
    '<select id="sesnsp-vista-sel" onchange="sesnspcActualizarGrafica()" ' +
    'style="background:#0a2a1a;border:1px solid #1a4a2a;color:#00ff88;padding:3px 6px;' +
    'font-size:9px;border-radius:3px;font-family:monospace;">' +
    '<option value="12m">Últimos 12 meses</option>' +
    '<option value="anual">Serie anual 2015-2025</option>' +
    '<option value="mensual">Mensual por año</option>' +
    '</select>' +
    '<select id="sesnsp-anio-sel" onchange="sesnspcActualizarGrafica()" ' +
    'style="background:#0a2a1a;border:1px solid #1a4a2a;color:#00ff88;padding:3px 6px;' +
    'font-size:9px;border-radius:3px;font-family:monospace;display:none;">' + opcionesAnio + '</select>' +
    '</div>' +
    '<canvas id="sesnsp-canvas" height="160" style="width:100%;"></canvas>' +
    '</div>' +

    // Tabla
    '<div style="background:#0a1a14;border:1px solid #1a3a2a;border-radius:6px;padding:12px;">' +
    '<div style="font-size:10px;color:#00ff88;margin-bottom:8px;">Tabla histórica por tipo de delito</div>' +
    '<div id="sesnsp-tabla-contenido">' + _sesnspcGenerarTabla() + '</div>' +
    '</div>' +

    '</div>';

  // Dibujar gráfica inicial
  setTimeout(sesnspcActualizarGrafica, 100);
}

// ── Actualizar gráfica según selección ──
function sesnspcActualizarGrafica() {
  var tipo  = (document.getElementById('sesnsp-tipo-sel')  || {}).value || 'Homicidio';
  var vista = (document.getElementById('sesnsp-vista-sel') || {}).value || '12m';
  var anio  = (document.getElementById('sesnsp-anio-sel')  || {}).value || '2025';
  var selAnio = document.getElementById('sesnsp-anio-sel');
  if (selAnio) selAnio.style.display = vista === 'mensual' ? 'inline-block' : 'none';

  var labels = [], valores = [];

  if (vista === '12m') {
    var puntos = sesnspcUltimosNMeses(12, tipo);
    puntos.forEach(function(p) { labels.push(p.label); valores.push(p.valor); });
  } else if (vista === 'anual') {
    labels  = ['2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];
    valores = sesnspcSerieAnual(tipo);
  } else {
    labels  = SESNSP_MESES.map(function(m) { return m.substring(0,3); });
    valores = sesnspcSerieMensual(anio, tipo);
  }

  _sesnspcDibujarBarras('sesnsp-canvas', labels, valores,
    SESNSP_COLORES[tipo] || SESNSP_COLORES['default'], tipo);
}

// ── Dibujador de barras en canvas (vanilla, sin Chart.js) ──
function _sesnspcDibujarBarras(canvasId, labels, valores, color, titulo) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 600;
  var W = canvas.width, H = canvas.height || 160;

  ctx.clearRect(0, 0, W, H);

  // Fondo
  ctx.fillStyle = '#060f0a';
  ctx.fillRect(0, 0, W, H);

  if (!valores.length) return;

  var maxVal = Math.max.apply(null, valores) || 1;
  var pad    = { top: 20, right: 10, bottom: 30, left: 35 };
  var gW     = W - pad.left - pad.right;
  var gH     = H - pad.top  - pad.bottom;
  var barW   = Math.max(2, (gW / valores.length) - 2);

  // Líneas de referencia
  ctx.strokeStyle = '#1a3a2a';
  ctx.lineWidth   = 0.5;
  for (var g = 0; g <= 4; g++) {
    var y = pad.top + gH - (g / 4) * gH;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#2a5a3a';
    ctx.font      = '8px monospace';
    ctx.fillText(Math.round((g / 4) * maxVal), 2, y + 3);
  }

  // Barras
  valores.forEach(function(v, i) {
    var x  = pad.left + i * (gW / valores.length);
    var bH = (v / maxVal) * gH;
    var y  = pad.top + gH - bH;

    // Barra con gradiente
    var grad = ctx.createLinearGradient(0, y, 0, y + bH);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + '44');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y, barW, bH);

    // Valor encima si hay espacio
    if (bH > 14) {
      ctx.fillStyle = '#ffffff';
      ctx.font      = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(v, x + barW / 2 + 1, y + 10);
    }

    // Label eje X
    ctx.fillStyle = '#3a6a4a';
    ctx.font      = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i] || '', x + barW / 2 + 1, H - 4);
  });

  // Título
  ctx.fillStyle = color;
  ctx.font      = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(titulo, pad.left, 12);
}

// ── Generar tabla HTML ──
function _sesnspcGenerarTabla() {
  var anios = ['2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];

  var thead = '<tr><th style="text-align:left;padding:4px 8px;color:#4a8a6a;font-size:8px;border-bottom:1px solid #1a3a2a;">Delito</th>';
  anios.forEach(function(a) {
    thead += '<th style="text-align:right;padding:4px 6px;color:#4a8a6a;font-size:8px;border-bottom:1px solid #1a3a2a;">' + a + '</th>';
  });
  thead += '</tr>';

  var tbody = SESNSP_ALTO_IMPACTO.map(function(tipo) {
    var color = SESNSP_COLORES[tipo] || SESNSP_COLORES['default'];
    var fila  = '<tr>' +
      '<td style="padding:4px 8px;color:' + color + ';font-size:8px;white-space:nowrap;">' + tipo + '</td>';
    var vals = anios.map(function(a) { return sesnspcTotalAnioTipo(a, tipo); });
    var maxV = Math.max.apply(null, vals) || 1;
    vals.forEach(function(v) {
      var intens = Math.round((v / maxV) * 80);
      fila += '<td style="text-align:right;padding:4px 6px;font-size:8px;' +
        'color:#ccffdd;background:' + color + Math.min(intens, 99).toString(16).padStart(2,'0') + ';">' + v + '</td>';
    });
    fila += '</tr>';
    return fila;
  }).join('');

  return '<table style="width:100%;border-collapse:collapse;">' +
    '<thead>' + thead + '</thead>' +
    '<tbody>' + tbody + '</tbody>' +
    '</table>';
}

// ── Descarga CSV ──
function sesnspcDescargarCSV() {
  if (!SESNSP.loaded || !SESNSP.data.length) return;
  var anios = ['2015','2016','2017','2018','2019','2020','2021','2022','2023','2024','2025'];
  var lineas = ['Tipo de delito,' + anios.join(',')];

  SESNSP_ALTO_IMPACTO.forEach(function(tipo) {
    var fila = [tipo];
    anios.forEach(function(a) { fila.push(sesnspcTotalAnioTipo(a, tipo)); });
    lineas.push(fila.join(','));
  });

  var blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'sesnsp_irapuato_' + new Date().getFullYear() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV descargado', 'ok');
}

// Iniciar carga automática
sesnspcCargar(null);

// Exponer API pública
window.SESNSP                  = SESNSP;
window.sesnspcCargar           = sesnspcCargar;
window.sesnspcRenderTab        = sesnspcRenderTab;
window.sesnspcActualizarGrafica = sesnspcActualizarGrafica;
window.sesnspcDescargarCSV     = sesnspcDescargarCSV;
window.sesnspcComponenteIRZ    = sesnspcComponenteIRZ;
window.sesnspcTotalAnioTipo    = sesnspcTotalAnioTipo;
window.sesnspcSerieMensual     = sesnspcSerieMensual;
