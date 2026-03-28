// ═══════════════════════════════════════════════════════════════
// CENSO.JS — Módulo Censo de Población y Vivienda 2020 por AGEB
// Irapuato Intel · Sprint 3 — Integración datos INEGI
//
// Responsabilidades:
//   1. Cargar y parsear censo_ageb_11017.csv (tabulador como separador)
//   2. Filtrar solo filas de AGEB individual (MZA=0, AGEB!='0000')
//   3. Indexar por clave AGEB de 14 dígitos (igual formato que coneval)
//   4. Exponer CENSO_DATA{} con variables socioeconómicas por AGEB
//   5. Exponer censoLookup(clave_ageb) → objeto con variables
//   6. Exponer censoContextoIA(clave_ageb) → texto para prompts Gemini
// ═══════════════════════════════════════════════════════════════

// ── Estado del módulo ──
var CENSO = {
  data:          {},   // { clave_ageb_14: { variables... } }
  loaded:        false,
  loading:       false,
  loadCallbacks: [],
  totalAgebs:    0,
  errMsg:        null
};

// Variables a extraer del CSV (subset relevante para análisis territorial)
// Formato: { columnaCSV: 'alias_interno' }
var CENSO_VARS = {
  // Demografía base
  'POBTOT':       'pobtot',       // Población total
  'POBFEM':       'pobfem',       // Población femenina
  'POBMAS':       'pobmas',       // Población masculina
  'POB0_14':      'pob0_14',      // Población 0-14 años
  'POB15_64':     'pob15_64',     // Población 15-64 años
  'POB65_MAS':    'pob65_mas',    // Población 65+ años
  'P_60YMAS':     'p_60ymas',     // Adultos mayores
  'P_18YMAS':     'p_18ymas',     // Adultos
  // Educación
  'GRAPROES':     'graproes',     // Grado promedio de escolaridad
  'P15YM_AN':     'p15ym_an',     // Población 15+ analfabeta
  'P15YM_SE':     'p15ym_se',     // Población 15+ sin escolaridad
  'P18YM_PB':     'p18ym_pb',     // Población 18+ con educación básica completa
  // Economía
  'PEA':          'pea',          // Población económicamente activa
  'POCUPADA':     'pocupada',     // Población ocupada
  'PDESOCUP':     'pdesocup',     // Población desocupada
  'PE_INAC':      'pe_inac',      // Población económicamente inactiva
  // Salud y seguridad social
  'PSINDER':      'psinder',      // Población sin derechohabiencia a salud
  'PDER_IMSS':    'pder_imss',    // Derechohabientes IMSS
  'PDER_ISTE':    'pder_iste',    // Derechohabientes ISSSTE
  'PDER_SEGP':    'pder_segp',    // Derechohabientes Seguro Popular/IMSS Bienestar
  // Discapacidad y vulnerabilidad
  'PCON_DISC':    'pcon_disc',    // Población con discapacidad
  'PCON_LIMI':    'pcon_limi',    // Población con alguna limitación
  // Vivienda y servicios
  'VIVTOT':       'vivtot',       // Total de viviendas
  'TVIVHAB':      'tvivhab',      // Viviendas habitadas
  'VIVPAR_HAB':   'vivpar_hab',   // Viviendas particulares habitadas
  'PROM_OCUP':    'prom_ocup',    // Promedio de ocupantes por vivienda
  'VPH_C_ELEC':   'vph_c_elec',  // Viviendas con electricidad
  'VPH_S_ELEC':   'vph_s_elec',  // Viviendas SIN electricidad
  'VPH_AGUADV':   'vph_aguadv',  // Viviendas con agua dentro de la vivienda
  'VPH_AGUAFV':   'vph_aguafv',  // Viviendas con agua fuera pero en el terreno
  'VPH_DRENAJ':   'vph_drenaj',  // Viviendas con drenaje
  'VPH_NODREN':   'vph_nodren',  // Viviendas SIN drenaje
  'VPH_EXCSA':    'vph_excsa',   // Viviendas con excusado
  'VPH_SNBIEN':   'vph_snbien',  // Viviendas sin ningún bien
  'VPH_SINCINT':  'vph_sincint', // Viviendas sin internet
  // Bienes en vivienda
  'VPH_AUTOM':    'vph_autom',   // Viviendas con automóvil
  'VPH_CEL':      'vph_cel',     // Viviendas con celular
  'VPH_INTER':    'vph_inter',   // Viviendas con internet
  'VPH_TV':       'vph_tv',      // Viviendas con televisión
  'VPH_PC':       'vph_pc',      // Viviendas con computadora
  // Hogares
  'TOTHOG':       'tothog',      // Total de hogares
  'HOGJEF_F':     'hogjef_f',    // Hogares con jefatura femenina
  'HOGJEF_M':     'hogjef_m',    // Hogares con jefatura masculina
  // Hacinamiento (calculado)
  'VPH_1CUART':   'vph_1cuart',  // Viviendas con 1 cuarto
  'VPH_2CUART':   'vph_2cuart',  // Viviendas con 2 cuartos
  // Migración
  'PNACOE':       'pnacoe',      // Población nacida en otra entidad
  // Religión (proxy de identidad comunitaria)
  'PCATOLICA':    'pcatolica',   // Población católica
  'PSIN_RELIG':   'psin_relig'   // Población sin religión
};

// ═══════════════════════════════════════════════════════════════
// 1. CARGA Y PARSEO DEL CSV
// ═══════════════════════════════════════════════════════════════

function censoCargar(callback) {
  if (CENSO.loaded) { if (callback) callback(); return; }
  if (CENSO.loading) { if (callback) CENSO.loadCallbacks.push(callback); return; }
  CENSO.loading = true;
  if (callback) CENSO.loadCallbacks.push(callback);

  fetch('censo_ageb_11017.csv')
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(function(texto) {
      _parsearCSV(texto);
      CENSO.loaded = true;
      CENSO.loading = false;
      console.log('[CENSO] Cargados ' + CENSO.totalAgebs + ' AGEBs del Censo 2020');
      var cbs = CENSO.loadCallbacks.slice();
      CENSO.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
    })
    .catch(function(err) {
      CENSO.errMsg = err.message;
      CENSO.loading = false;
      CENSO.loaded = true; // marcar loaded para no reintentar en loop
      console.warn('[CENSO] Error al cargar CSV:', err.message);
      var cbs = CENSO.loadCallbacks.slice();
      CENSO.loadCallbacks = [];
      cbs.forEach(function(cb) { try { cb(); } catch(e) {} });
      if (typeof toast === 'function') {
        toast('⚠ censo_ageb_11017.csv no encontrado — IRZ usa solo CONEVAL', 'warn');
      }
    });
}

function _parsearCSV(texto) {
  // Detectar separador: tabulador (INEGI) o coma
  var sep = '\t';
  var primeraLinea = texto.split('\n')[0];
  if (primeraLinea.indexOf('\t') === -1) sep = ',';

  var lineas = texto.split('\n');
  if (!lineas.length) return;

  // Parsear encabezados
  var headers = lineas[0].replace(/\r/g, '').split(sep);
  var idxMap = {}; // { nombreColumna: indiceNumerico }
  for (var i = 0; i < headers.length; i++) {
    idxMap[headers[i].trim()] = i;
  }

  // Índices necesarios para filtrado
  var iMUN  = idxMap['MUN'];
  var iAGEB = idxMap['AGEB'];
  var iMZA  = idxMap['MZA'];
  var iENT  = idxMap['ENTIDAD'] !== undefined ? idxMap['ENTIDAD'] : idxMap['ENTIDAD'];

  // Construir mapa de índices para las variables que nos interesan
  var varIdx = {};
  for (var col in CENSO_VARS) {
    if (idxMap[col] !== undefined) {
      varIdx[col] = idxMap[col];
    }
  }

  var count = 0;

  for (var r = 1; r < lineas.length; r++) {
    var linea = lineas[r].replace(/\r/g, '').trim();
    if (!linea) continue;

    var campos = linea.split(sep);

    // Filtro 1: solo municipio 017 (Irapuato)
    var mun = (campos[iMUN] || '').trim();
    if (mun !== '017' && mun !== '17') continue;

    // Filtro 2: solo filas de AGEB (MZA = 0 y AGEB no es '0000' ni '0')
    var ageb = (campos[iAGEB] || '').trim();
    var mza  = (campos[iMZA]  || '').trim();
    if (mza !== '0' && mza !== '000') continue;
    if (ageb === '0' || ageb === '0000' || ageb === '') continue;

    // Construir clave AGEB de 14 dígitos: 11 (ent) + 017 (mun) + 0001 (loc) + AGEB
    // El CSV viene sin la localidad, la clave AGEB del INEGI es: ENTIDAD(2)+MUN(3)+LOC(4)+AGEB(4)
    // Tomamos LOC del CSV también
    var iLOC = idxMap['LOC'];
    var loc  = (campos[iLOC] || '1').trim();
    // Pad de 4 dígitos para localidad
    while (loc.length < 4) loc = '0' + loc;
    // Pad de 4 dígitos para AGEB
    while (ageb.length < 4) ageb = '0' + ageb;
    // Entidad siempre 11
    var ent = '11';
    // Municipio siempre 017
    var munPad = '017';

    var clave14 = ent + munPad + loc + ageb; // e.g. '1101700010001'

    // Extraer variables numéricas
    var obj = { _clave: clave14, _ageb: ageb, _loc: loc };
    for (var col in varIdx) {
      var val = (campos[varIdx[col]] || '').trim();
      // Convertir a número; '*' o vacío → null (dato suprimido INEGI)
      if (val === '*' || val === '' || val === 'N/D') {
        obj[CENSO_VARS[col]] = null;
      } else {
        var num = parseFloat(val);
        obj[CENSO_VARS[col]] = isNaN(num) ? null : num;
      }
    }

    // Calcular indicadores derivados (porcentajes)
    var pobtot = obj.pobtot || 1; // evitar división por cero
    var vivhab = obj.vivpar_hab || 1;

    obj._pct_analfabeta     = obj.p15ym_an  ? _pct(obj.p15ym_an,  obj.p_18ymas || pobtot) : null;
    obj._pct_sin_escuela    = obj.p15ym_se  ? _pct(obj.p15ym_se,  obj.p_18ymas || pobtot) : null;
    obj._pct_desocupados    = obj.pdesocup  ? _pct(obj.pdesocup,  obj.pea || 1)            : null;
    obj._pct_sin_salud      = obj.psinder   ? _pct(obj.psinder,   pobtot)                  : null;
    obj._pct_sin_internet   = obj.vph_sincint ? _pct(obj.vph_sincint, vivhab)              : null;
    obj._pct_sin_drenaje    = obj.vph_nodren  ? _pct(obj.vph_nodren,  vivhab)              : null;
    obj._pct_sin_agua       = obj.vph_aguafv !== null && obj.vph_aguadv !== null
                                ? _pct(vivhab - (obj.vph_aguadv || 0) - (obj.vph_aguafv || 0), vivhab)
                                : null;
    obj._pct_jefa_hogar_f   = obj.hogjef_f  ? _pct(obj.hogjef_f,  obj.tothog || 1)        : null;
    obj._pct_adultos_mayores = obj.p_60ymas ? _pct(obj.p_60ymas,  pobtot)                  : null;
    obj._pct_discapacidad   = obj.pcon_disc ? _pct(obj.pcon_disc, pobtot)                  : null;
    obj._pct_sin_bienes     = obj.vph_snbien ? _pct(obj.vph_snbien, vivhab)                : null;
    obj._pct_con_auto       = obj.vph_autom  ? _pct(obj.vph_autom,  vivhab)               : null;
    obj._pct_con_internet   = obj.vph_inter  ? _pct(obj.vph_inter,  vivhab)               : null;

    // Índice de vulnerabilidad censal (IVC) — 0 a 100
    // Promedio ponderado de carencias
    obj._ivc = _calcularIVC(obj);

    CENSO.data[clave14] = obj;
    count++;
  }

  CENSO.totalAgebs = count;
}

// Helper: porcentaje redondeado a 1 decimal
function _pct(num, den) {
  if (!den || den === 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

// Índice de Vulnerabilidad Censal (IVC) — escala 0-100 (100 = máx. vulnerabilidad)
// Componentes con peso igual
function _calcularIVC(o) {
  var factores = [];
  var pesos = [];

  // Carencia educativa (peso 2)
  if (o._pct_analfabeta !== null) {
    factores.push(Math.min(o._pct_analfabeta / 20, 1)); // normalizar: 20% analfabetismo = máximo
    pesos.push(2);
  }

  // Desempleo (peso 1.5)
  if (o._pct_desocupados !== null) {
    factores.push(Math.min(o._pct_desocupados / 15, 1)); // 15% desempleo = máximo
    pesos.push(1.5);
  }

  // Sin salud (peso 2)
  if (o._pct_sin_salud !== null) {
    factores.push(Math.min(o._pct_sin_salud / 60, 1)); // 60% sin salud = máximo
    pesos.push(2);
  }

  // Sin internet (peso 1)
  if (o._pct_sin_internet !== null) {
    factores.push(Math.min(o._pct_sin_internet / 80, 1)); // 80% sin internet = máximo
    pesos.push(1);
  }

  // Sin drenaje (peso 2)
  if (o._pct_sin_drenaje !== null) {
    factores.push(Math.min(o._pct_sin_drenaje / 30, 1)); // 30% sin drenaje = máximo
    pesos.push(2);
  }

  // Sin bienes (peso 1.5)
  if (o._pct_sin_bienes !== null) {
    factores.push(Math.min(o._pct_sin_bienes / 20, 1)); // 20% sin bienes = máximo
    pesos.push(1.5);
  }

  if (!factores.length) return null;

  var sumaPeso = 0;
  var sumaVal  = 0;
  for (var i = 0; i < factores.length; i++) {
    sumaVal  += factores[i] * pesos[i];
    sumaPeso += pesos[i];
  }

  return Math.round((sumaVal / sumaPeso) * 100);
}

// ═══════════════════════════════════════════════════════════════
// 2. API PÚBLICA
// ═══════════════════════════════════════════════════════════════

// Obtener datos censales de una AGEB por clave de 14 dígitos
function censoLookup(clave14) {
  if (!CENSO.loaded || !clave14) return null;
  // Normalizar a 14 digitos (formato canonico del indice CENSO.data)
  var clave = (typeof normalizarClaveAGEB === 'function') ? normalizarClaveAGEB(clave14) : clave14;
  if (clave && CENSO.data[clave]) return CENSO.data[clave];
  // Fallback: match exacto con lo que llego (por si normalizacion falla)
  if (CENSO.data[clave14]) return CENSO.data[clave14];
  return null;
}

// Texto enriquecido para prompts de Gemini
function censoContextoIA(clave14) {
  var d = censoLookup(clave14);
  if (!d) return '';

  var partes = ['[Censo 2020 AGEB]'];

  if (d.pobtot) partes.push('Población: ' + d.pobtot.toLocaleString());
  if (d.graproes) partes.push('Escolaridad promedio: ' + d.graproes + ' años');
  if (d._pct_analfabeta !== null) partes.push('Analfabetismo: ' + d._pct_analfabeta + '%');
  if (d._pct_sin_salud !== null) partes.push('Sin acceso a salud: ' + d._pct_sin_salud + '%');
  if (d._pct_desocupados !== null) partes.push('Desempleo: ' + d._pct_desocupados + '%');
  if (d._pct_sin_drenaje !== null && d._pct_sin_drenaje > 0) partes.push('Sin drenaje: ' + d._pct_sin_drenaje + '%');
  if (d._pct_sin_internet !== null) partes.push('Sin internet: ' + d._pct_sin_internet + '%');
  if (d._pct_jefa_hogar_f !== null) partes.push('Hogares jefatura femenina: ' + d._pct_jefa_hogar_f + '%');
  if (d._pct_adultos_mayores !== null) partes.push('Adultos mayores: ' + d._pct_adultos_mayores + '%');
  if (d._ivc !== null) partes.push('IVC (Índice Vulnerabilidad Censal): ' + d._ivc + '/100');

  return partes.join(' | ');
}

// Badge HTML para mostrar en tarjetas del corpus
function censoBadgeHTML(clave14) {
  var d = censoLookup(clave14);
  if (!d || d._ivc === null) return '';

  var ivc  = d._ivc;
  var color, label;

  if (ivc < 20) {
    color = '#1a6e3c'; label = 'Vuln. Baja';
  } else if (ivc < 40) {
    color = '#d97706'; label = 'Vuln. Media';
  } else if (ivc < 60) {
    color = '#dc2626'; label = 'Vuln. Alta';
  } else {
    color = '#9f1239'; label = 'Vuln. Crítica';
  }

  return '<span style="display:inline-flex;align-items:center;gap:3px;' +
    'background:' + color + '22;border:1px solid ' + color + '66;' +
    'border-radius:3px;padding:1px 5px;font-size:7px;color:' + color + ';' +
    'font-family:monospace;margin-left:3px;" title="IVC ' + ivc + '/100 · Censo 2020">' +
    '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + color + ';"></span>' +
    label + ' C20' +
    '</span>';
}

// Obtener estadísticas resumen del municipio (todas las AGEBs)
function censoResumenMunicipal() {
  var totalPob = 0, totalViv = 0, sumGrado = 0, contGrado = 0;
  var totalSinSalud = 0, totalPobRef = 0;
  var count = 0;

  for (var clave in CENSO.data) {
    var d = CENSO.data[clave];
    if (d.pobtot) totalPob += d.pobtot;
    if (d.vivpar_hab) totalViv += d.vivpar_hab;
    if (d.graproes) { sumGrado += d.graproes; contGrado++; }
    if (d.psinder && d.pobtot) { totalSinSalud += d.psinder; totalPobRef += d.pobtot; }
    count++;
  }

  return {
    total_agebs:      count,
    poblacion_total:  totalPob,
    viviendas_hab:    totalViv,
    graproes_prom:    contGrado ? Math.round((sumGrado / contGrado) * 10) / 10 : null,
    pct_sin_salud:    totalPobRef ? _pct(totalSinSalud, totalPobRef) : null
  };
}

// Iniciar carga automática al cargar el script
censoCargar(null);

// Exponer API pública
window.CENSO            = CENSO;
window.censoCargar      = censoCargar;
window.censoLookup      = censoLookup;
window.censoContextoIA  = censoContextoIA;
window.censoBadgeHTML   = censoBadgeHTML;
window.censoResumenMunicipal = censoResumenMunicipal;
