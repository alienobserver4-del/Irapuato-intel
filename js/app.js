// ═══════════════════════════════════════════════════════════════
// TAB_CONFIG — tabla declarativa de tabs
// Para agregar una tab nueva: agregar una entrada aqui. Sin tocar verTab().
// Campos:
//   display    : 'block' | 'flex'  — CSS display al mostrar
//   fixed      : true              — aplica layout position:fixed con altura calculada
//   onShow     : string            — nombre de funcion window[] al activar
//   onShowDelay: ms                — delay del onShow (default 0, 150+ para mapas)
// ═══════════════════════════════════════════════════════════════
var TAB_CONFIG = {
  entrada:  { display: 'block',  fixed: false, onShow: '_tabEntradaInit' },
  bd:       { display: 'block',  fixed: false },
  intel:    { display: 'block',  fixed: true,  onShow: '_tabIntelInit',  onShowDelay: 200 },
  mapa:     { display: 'flex',   fixed: true,  onShow: '_tabMapaInit',   onShowDelay: 200 },
  gobierno: { display: 'flex',   fixed: true,  onShow: '_tabGobiernoInit' },
  denue:    { display: 'flex',   fixed: true,  onShow: '_tabDenueInit',  onShowDelay: 150 },
  sesnsp:   { display: 'block',  fixed: true,  onShow: '_tabSesnspInit' },
  predic:   { display: 'block',  fixed: true,  onShow: '_tabPredicInit' },
  ingesta:  { display: 'block',  fixed: true,  onShow: '_tabIngestaInit' },
  co:       { display: 'flex',   fixed: true,  onShow: '_tabCoInit' }
};

// ── Helpers de layout ───────────────────────────────────────────────────────
function _tabOffsetTop() {
  var hH = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
  var tH = document.getElementById('tabs')  ? document.getElementById('tabs').offsetHeight  : 36;
  return hH + tH;
}
function _tabApplyFixed(secEl, displayMode, extraHeight) {
  var off = _tabOffsetTop();
  var h   = window.innerHeight - off - (extraHeight || 0);
  if (h < 200) h = 400;
  secEl.style.display  = displayMode || 'block';
  secEl.style.position = 'fixed';
  secEl.style.top      = off + 'px';
  secEl.style.left     = '0';
  secEl.style.width    = '100vw';
  secEl.style.height   = h + 'px';
}
window._tabApplyFixed = _tabApplyFixed;
window._tabOffsetTop  = _tabOffsetTop;

// ── Callbacks de activacion por tab ─────────────────────────────────────────
function _tabEntradaInit() {
  var subActivo = document.querySelector('#entrada-subtabs .bd-stab.activo');
  if (!subActivo && typeof verEntradaSubtab === 'function') verEntradaSubtab('rss');
}
function _tabIntelInit() {
  var secEl = document.getElementById('sec-intel');
  if (secEl) {
    _tabApplyFixed(secEl, 'block');
    var off = _tabOffsetTop();
    var h   = window.innerHeight - off;
    var contEl = document.getElementById('intel-container');
    if (contEl) { contEl.style.height = h + 'px'; contEl.style.display = 'flex'; }
    var mapaEl = document.getElementById('intel-leaflet');
    if (mapaEl) mapaEl.style.height = (h - 40) + 'px';
  }
  if (typeof intelObj !== 'undefined' && intelObj) {
    try { intelObj.remove(); } catch(e) {}
    intelObj = null; intelIniciado = false;
  }
  setTimeout(iniciarIntel, 200);
}
function _tabMapaInit() {
  var secEl = document.getElementById('sec-mapa');
  if (secEl) _tabApplyFixed(secEl, 'flex');
  if (typeof movilidadOnShow === 'function') setTimeout(movilidadOnShow, 200);
}
function _tabGobiernoInit() {
  var secEl = document.getElementById('sec-gobierno');
  if (secEl) _tabApplyFixed(secEl, 'flex');
  if (typeof verGobSubtab === 'function') verGobSubtab('ayuntamiento');
}
function _tabDenueInit() {
  var secEl = document.getElementById('sec-denue');
  if (secEl) _tabApplyFixed(secEl, 'flex');
  setTimeout(iniciarDenue, 150);
}
function _tabSesnspInit() {
  var secEl = document.getElementById('sec-sesnsp');
  if (secEl) _tabApplyFixed(secEl, 'block');
  if (typeof sesnspcRenderTab === 'function') sesnspcRenderTab();
}
function _tabPredicInit() {
  var secEl = document.getElementById('sec-predic');
  if (secEl) _tabApplyFixed(secEl, 'block');
  if (typeof prediccionRenderTab === 'function') prediccionRenderTab();
}
function _tabIngestaInit() {
  var secEl = document.getElementById('sec-ingesta');
  if (secEl) _tabApplyFixed(secEl, 'block');
  if (typeof ingestaRenderTab === 'function') ingestaRenderTab();
}
function _tabCoInit() {
  var secEl = document.getElementById('sec-co');
  if (secEl) _tabApplyFixed(secEl, 'flex');
  if (typeof coInit === 'function') coInit();
}
window._tabEntradaInit  = _tabEntradaInit;
window._tabIntelInit    = _tabIntelInit;
window._tabMapaInit     = _tabMapaInit;
window._tabGobiernoInit = _tabGobiernoInit;
window._tabDenueInit    = _tabDenueInit;
window._tabSesnspInit   = _tabSesnspInit;
window._tabPredicInit   = _tabPredicInit;
window._tabIngestaInit  = _tabIngestaInit;
window._tabCoInit       = _tabCoInit;

// ── verTab() — motor de navegacion ──────────────────────────────────────────
function verTab(cual) {
  // 1. Quitar activo de todos los botones de tab
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');

  // 2. Ocultar todas las secciones
  var secs = document.querySelectorAll('.seccion');
  for (var i = 0; i < secs.length; i++) {
    secs[i].classList.remove('activa');
    secs[i].style.display = 'none';
  }
  var fixedIds = ['sec-mapa','sec-intel','sec-gobierno','sec-denue',
                  'sec-sesnsp','sec-predic','sec-ingesta','sec-co'];
  for (var j = 0; j < fixedIds.length; j++) {
    var fEl = document.getElementById(fixedIds[j]);
    if (fEl) fEl.style.display = 'none';
  }

  // 3. Marcar tab activa
  var tabEl = document.querySelector('.tab.' + cual);
  if (tabEl) tabEl.classList.add('active');

  // 4. Mostrar seccion destino
  var secEl = document.getElementById('sec-' + cual);
  var cfg   = TAB_CONFIG[cual] || {};
  if (secEl) {
    secEl.classList.add('activa');
    if (!cfg.fixed) secEl.style.display = cfg.display || 'block';
  }

  // 5. Ejecutar callback de activacion
  if (cfg.onShow) {
    var fn = window[cfg.onShow];
    if (typeof fn === 'function') {
      if (cfg.onShowDelay) setTimeout(fn, cfg.onShowDelay);
      else fn();
    }
  }
}
window.verTab = verTab;

// ── Sub-tabs de BD (Corpus / Data) ──
function verBDSubtab(cual) {
  ['corpus','data','aprende'].forEach(function(s) {
    var el = document.getElementById('bd-' + s);
    var btn = document.getElementById('bd-stab-' + s);
    if (el)  el.style.display  = (s === cual) ? 'block' : 'none';
    if (btn) btn.classList.toggle('activo', s === cual);
  });
  if (cual === 'data' && typeof iniciarData === 'function') {
    iniciarData();
  }
  if (cual === 'aprende' && typeof aprendeRenderPanel === 'function') {
    aprendeRenderPanel();
  }
}
window.verBDSubtab = verBDSubtab;

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
var toastTimer = null;
function toast(msg, tipo) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = (tipo === 'err' ? 'err' : tipo === 'warn' ? 'warn' : '') + ' visible';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    el.classList.remove('visible');
  }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// MODAL FACEBOOK — con sistema de fuentes predictivo (Firebase)
// ═══════════════════════════════════════════════════════════════
var fuenteFB = '';
var _fuentesFB = []; // caché local de fuentes
var makeWebhookURL = '';
try { makeWebhookURL = localStorage.getItem('make_webhook') || ''; } catch(e) {}

// Fuentes semilla — se migran a Firebase en primera carga
var _FUENTES_SEMILLA = [
  'Tinta Negra FB','Gerardo Hernandez','TV Consecuencias','El Pena',
  'Irapuato Despierta','Noticias al Momento','Opinion Bajio','Noticias Irapuato',
  'Contacto Noticias','Hermoso Irapuato','Irapuato Alerta','Ciudadano'
];

// Normalizar nombre: quitar acentos, minúsculas, trim — para deduplicación
function _normFuente(s) {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Cargar fuentes desde Firebase (colección 'fuentes-fb')
function cargarFuentesFB() {
  if (!db) return;
  db.collection('fuentes-fb').orderBy('veces', 'desc').limit(200).get()
    .then(function(snap) {
      var arr = [];
      snap.forEach(function(doc) { arr.push(doc.data().nombre); });
      // Si Firebase está vacío, sembrar con fuentes semilla
      if (arr.length === 0) {
        _sembrarFuentesFB();
        _fuentesFB = _FUENTES_SEMILLA.slice();
      } else {
        _fuentesFB = arr;
      }
    })
    .catch(function() { _fuentesFB = _FUENTES_SEMILLA.slice(); });
}

function _sembrarFuentesFB() {
  if (!db) return;
  var batch = db.batch();
  _FUENTES_SEMILLA.forEach(function(nombre) {
    var key = _normFuente(nombre).replace(/[^a-z0-9]/g, '-').slice(0, 60);
    batch.set(db.collection('fuentes-fb').doc(key), {
      nombre: nombre,
      clave: key,
      veces: 1,
      creada: firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  batch.commit().catch(function(){});
}

// Guardar o incrementar una fuente en Firebase (deduplicada por clave normalizada)
function guardarFuenteFBEnFirebase(nombre) {
  if (!db || !nombre.trim()) return;
  var clave = _normFuente(nombre).replace(/[^a-z0-9]/g, '-').slice(0, 60);
  // Buscar si ya existe con distinto capitalizado
  var existe = _fuentesFB.find(function(f){ return _normFuente(f) === _normFuente(nombre); });
  var nombreFinal = existe || nombre.trim();
  // Actualizar caché local
  if (!existe) _fuentesFB.unshift(nombreFinal);
  db.collection('fuentes-fb').doc(clave).set({
    nombre: nombreFinal,
    clave: clave,
    veces: firebase.firestore.FieldValue.increment(1),
    ultima: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(function(){});
}

// Autocompletar en el campo de fuente FB
function onFuenteFBInput(input) {
  var q = input.value.trim();
  fuenteFB = q;
  var lista = document.getElementById('fb-fuente-lista');
  if (!lista) return;
  if (q.length < 1) { lista.style.display = 'none'; return; }
  var qNorm = _normFuente(q);
  var matches = _fuentesFB.filter(function(f) {
    return _normFuente(f).indexOf(qNorm) !== -1;
  }).slice(0, 8);
  if (matches.length === 0) { lista.style.display = 'none'; return; }
  lista.innerHTML = matches.map(function(f) {
    return '<div class="fb-sugg-item" onmousedown="seleccionarFuenteFB(\'' + f.replace(/'/g,"\\'") + '\')">' + f + '</div>';
  }).join('');
  lista.style.display = 'block';
}
window.onFuenteFBInput = onFuenteFBInput;

function seleccionarFuenteFB(nombre) {
  fuenteFB = nombre;
  var inp = document.getElementById('fb-fuente-input');
  if (inp) inp.value = nombre;
  var lista = document.getElementById('fb-fuente-lista');
  if (lista) lista.style.display = 'none';
}
window.seleccionarFuenteFB = seleccionarFuenteFB;

function abrirFacebook() {
  cargarFuentesFB();
  var modal = document.getElementById('fb-modal');
  modal.style.display = 'flex';
  if (makeWebhookURL) {
    document.getElementById('make-webhook-url').value = makeWebhookURL;
    document.getElementById('make-status').textContent = 'Configurado ✓';
    document.getElementById('make-status').style.color = '#00ff88';
  }
  // Resetear campo de fuente
  var inp = document.getElementById('fb-fuente-input');
  if (inp) inp.value = fuenteFB || '';
}
window.abrirFacebook = abrirFacebook;

function cerrarFB() {
  document.getElementById('fb-modal').style.display = 'none';
  document.getElementById('fb-resultado').innerHTML = '';
  var lista = document.getElementById('fb-fuente-lista');
  if (lista) lista.style.display = 'none';
}
window.cerrarFB = cerrarFB;

// Mantener compatibilidad (botones viejos ya no existen pero por si acaso)
function selFuenteFB(el, nombre) { seleccionarFuenteFB(nombre); }
window.selFuenteFB = selFuenteFB;

function analizarFB() {
  var texto = document.getElementById('fb-texto').value.trim();
  if (!texto) { toast('Pega el texto de la publicacion primero', 'err'); return; }
  // Tomar fuente del input
  var inp = document.getElementById('fb-fuente-input');
  var fuente = (inp ? inp.value.trim() : fuenteFB) || 'Facebook';
  fuenteFB = fuente;
  // Guardar/incrementar en Firebase
  guardarFuenteFBEnFirebase(fuente);

  var url = document.getElementById('fb-url').value.trim();

  cerrarFB();
  verTab('noticias');

  var item = {
    titulo: texto.slice(0, 100),
    desc: texto,
    link: url || '',
    fecha: new Date().toLocaleDateString('es-MX'),
    fuente: fuente
  };
  var lista = document.getElementById('lista-rss');
  var card = crearTarjetaRSS(item);
  lista.insertBefore(card, lista.firstChild);

  toast('Analizando con IA...', 'ok');
  analizarConIA(card.id, texto, fuente, url);
}
window.analizarFB = analizarFB;

function guardarWebhook() {
  var url = document.getElementById('make-webhook-url').value.trim();
  if (!url) { toast('Pega la URL del webhook primero', 'err'); return; }
  makeWebhookURL = url;
  try { localStorage.setItem('make_webhook', url); } catch(e) {}
  document.getElementById('make-status').textContent = 'Configurado ✓';
  document.getElementById('make-status').style.color = '#00ff88';
  toast('✓ Webhook de Make.com guardado', 'ok');
}
window.guardarWebhook = guardarWebhook;

// Escuchar noticias entrantes del webhook de Make.com via Firebase
function escucharMake() {
  if (!db) return;
  db.collection('make-entrantes').orderBy('fecha', 'desc').limit(20)
  .onSnapshot(function(snap) {
    snap.docChanges().forEach(function(change) {
      if (change.type === 'added') {
        var d = change.doc.data();
        var lista = document.getElementById('lista-rss');
        var item = {
          titulo: d.titulo || d.message || 'Publicación de Facebook',
          desc: d.texto || d.message || '',
          link: d.url || '',
          fecha: 'Facebook',
          fuente: d.fuente || 'Facebook'
        };
        lista.insertBefore(crearTarjetaRSS(item), lista.firstChild);
        toast('📘 Nueva publicación de Facebook recibida', 'ok');
      }
    });
  }, function(e) {  });
}
try {
if (typeof firebase === 'undefined') {
  console.error('Firebase no cargó — verifica tu conexión a internet');
} else {
  firebase.initializeApp(firebaseConfig);
}
  db = firebase.firestore();
  escucharBD();

  function esperarDBYCargar(intentos) {
    intentos = intentos || 0;
    if (typeof db !== 'undefined' && db) {
      cargarKeysFirebase();
      setTimeout(function() { cargarReglasPrompt(function() { renderReglasBD(); }); }, 400);
      // Sprint 7: iniciar base de calles con sinónimos
      setTimeout(function() { if (typeof callesInit === 'function') callesInit(); }, 800);
      // Aprende: cargar caché de feed-visto
      setTimeout(function() { if (typeof aprendeCargarCache === 'function') aprendeCargarCache(); }, 1200);
    } else if (intentos < 20) {
      setTimeout(function() { esperarDBYCargar(intentos + 1); }, 300);
    } else {
      console.warn('[Init] Firebase db no disponible tras 6s');
    }
  }
  setTimeout(function() { esperarDBYCargar(); }, 500);
  // Cargar base geo-interna
  setTimeout(function() {
    db.collection('geo-irapuato').limit(300).get()
      .then(function(snap) {
        snap.forEach(function(doc) {
          var d = doc.data();
          if (d.lat && d.lng) GEO_BASE[doc.id] = { calle: d.calle||'', colonia: d.colonia||'', lat: d.lat, lng: d.lng, hits: d.hits||1 };
        });
      })
      .catch(function() {});
  }, 1000);
} catch(e) {
}
escucharMake();

// Indicador de que JS cargó correctamente
document.getElementById('rss-estado').textContent = 'Sistema listo. Elige una fuente.';
document.getElementById('rss-estado').className = 'rss-estado ok';
// Actualizar indicador de IA con las keys ya cargadas del localStorage
actualizarStatusGemini();

// Sprint 4: iniciar módulo de predicción
setTimeout(function() {
  if (typeof prediccionInit === 'function') prediccionInit();
}, 2000);

// Sprint 4: toggle del panel colapsable ZONAS ACTIVAS en mapa Intel
window.prediccionTogglePanel = function() {
  var panel = document.getElementById('predic-panel-intel');
  var btn   = document.getElementById('predic-panel-btn');
  if (!panel) return;
  if (panel.style.display === 'none' || panel.style.display === '') {
    panel.style.display = 'block';
    if (btn) btn.innerHTML = '⚠ ZONAS ACTIVAS ▲';
    if (typeof prediccionPanelIntel === 'function') prediccionPanelIntel();
  } else {
    panel.style.display = 'none';
    if (btn) btn.innerHTML = '⚠ ZONAS ACTIVAS ▼';
  }
};

// Sprint 6: sub-tabs de ENTRADA (RSS / Manual / Ingesta)
window.verEntradaSubtab = function(cual) {
  var subs = ['rss', 'manual', 'ingesta'];
  for (var i = 0; i < subs.length; i++) {
    var s = subs[i];
    var el  = document.getElementById('entrada-' + s);
    var btn = document.getElementById('entrada-stab-' + s);
    if (el)  el.style.display  = (s === cual) ? 'block' : 'none';
    if (btn) {
      btn.classList.remove('activo');
      if (s === cual) btn.classList.add('activo');
    }
  }
  // Si abre ingesta, inicializar/refrescar
  if (cual === 'ingesta') {
    // Redirigir el target de ingesta al div embebido
    var inner = document.getElementById('sec-ingesta-inner');
    if (inner) {
      // Monkey-patch temporal: ingestaRenderTab busca 'sec-ingesta',
      // sustituimos momentáneamente el id
      if (!document.getElementById('sec-ingesta')) {
        inner.id = 'sec-ingesta';
      }
    }
    if (typeof ingestaRenderTab === 'function') ingestaRenderTab();
  }
};
window.verEntradaSubtab = verEntradaSubtab;




