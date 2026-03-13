// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
function verTab(cual) {
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.remove('active');
  }
  // Ocultar todas las secciones normales
  var secs = document.querySelectorAll('.seccion');
  for (var i = 0; i < secs.length; i++) {
    secs[i].classList.remove('activa');
    secs[i].style.display = 'none';
  }
  // Ocultar mapa y intel si vamos a otra sección
  var secMapa = document.getElementById('sec-mapa');
  if (cual !== 'mapa' && secMapa) {
    secMapa.style.display = 'none';
    secMapa.classList.remove('activa');
  }
  var secIntel = document.getElementById('sec-intel');
  if (cual !== 'intel' && secIntel) {
    secIntel.style.display = 'none';
    secIntel.classList.remove('activa');
  }
  var secGobHide = document.getElementById('sec-gobierno');
  if (cual !== 'gobierno' && secGobHide) {
    secGobHide.style.display = 'none';
  }
  var secDenueHide = document.getElementById('sec-denue');
  if (cual !== 'denue' && secDenueHide) {
    secDenueHide.style.display = 'none';
  }
  var tabEl = document.querySelector('.tab.' + cual);
  if (tabEl) tabEl.classList.add('active');
  var secEl = document.getElementById('sec-' + cual);
  if (secEl) {
    secEl.classList.add('activa');
    secEl.style.display = 'block';
  }
  if (cual === 'aprende') {
    setTimeout(function() { if (typeof iniciarAprende === 'function') iniciarAprende(); }, 100);
  }
  if (cual === 'intel') {
    // INTEL: mapa de incidentes — se maneja como sec-mapa (position:fixed)
    var secIntelEl = document.getElementById('sec-intel');
    if (secIntelEl) {
      var headerH = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
      var tabsH = document.getElementById('tabs') ? document.getElementById('tabs').offsetHeight : 40;
      var topOffset = headerH + tabsH;
      var altoReal = window.innerHeight - topOffset;
      secIntelEl.style.display = 'block';
      secIntelEl.style.top = topOffset + 'px';
      secIntelEl.style.height = altoReal + 'px';
      var contEl = document.getElementById('intel-container');
      if (contEl) { contEl.style.height = altoReal + 'px'; contEl.style.display = 'flex'; }
      var mapaEl = document.getElementById('intel-leaflet');
      if (mapaEl) mapaEl.style.height = (altoReal - 40) + 'px';
    }
    if (intelObj) { intelObj.remove(); intelObj = null; intelIniciado = false; }
    setTimeout(iniciarIntel, 200);
  }
  if (cual === 'mapa') {
    var headerH = document.querySelector('header') ? document.querySelector('header').offsetHeight : 45;
    var tabsH   = document.getElementById('tabs')  ? document.getElementById('tabs').offsetHeight  : 38;
    var alto    = window.innerHeight - headerH - tabsH;
    if (alto < 200) alto = 500;
    var mapaEl  = document.getElementById('mapa-leaflet');
    var contEl  = document.getElementById('mapa-container');
    var topOffset = headerH + tabsH;
    var altoReal = window.innerHeight - topOffset;
    if (altoReal < 200) altoReal = 400;
    if (secEl)  {
      secEl.style.display = 'block';
      secEl.style.position = 'fixed';
      secEl.style.top = topOffset + 'px';
      secEl.style.left = '0';
      secEl.style.width = '100vw';
      secEl.style.height = altoReal + 'px';
    }
    if (contEl) { contEl.style.display = 'flex'; contEl.style.height = altoReal + 'px'; contEl.style.width = '100%'; }
    if (mapaEl) { mapaEl.style.display = 'block'; mapaEl.style.height = altoReal + 'px'; mapaEl.style.width = '100%'; }
    // Destruir mapa anterior para recrearlo con dimensiones correctas
    if (mapaObj) { try { mapaObj.remove(); } catch(e) {} mapaObj = null; mapaIniciado = false; }
    // Delay para que browser aplique estilos ANTES de que Leaflet lea el DOM
    setTimeout(iniciarMapa, 200);
  }
  if (cual === 'gobierno') {
    var secGobEl = document.getElementById('sec-gobierno');
    var headerH2 = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
    var tabsH2 = document.getElementById('tabs') ? document.getElementById('tabs').offsetHeight : 36;
    var topOff2 = headerH2 + tabsH2;
    var altoG = window.innerHeight - topOff2;
    if (secGobEl) {
      secGobEl.style.display = 'flex';
      secGobEl.style.top = topOff2 + 'px';
      secGobEl.style.height = altoG + 'px';
    }
    // Mostrar sub-tab activo por defecto
    verGobSubtab('ayuntamiento');
  }
  if (cual === 'denue') {
    var secDenueEl = document.getElementById('sec-denue');
    var hH3 = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
    var tH3 = document.getElementById('tabs') ? document.getElementById('tabs').offsetHeight : 36;
    var off3 = hH3 + tH3;
    if (secDenueEl) { secDenueEl.style.display='flex'; secDenueEl.style.top=off3+'px'; secDenueEl.style.height=(window.innerHeight-off3)+'px'; }
    setTimeout(iniciarDenue, 150);
  }
}


window.verTab = verTab;

// ── Sub-tabs de BD (Corpus / Data) ──
function verBDSubtab(cual) {
  ['corpus','data'].forEach(function(s) {
    var el = document.getElementById('bd-' + s);
    var btn = document.getElementById('bd-stab-' + s);
    if (el)  el.style.display  = (s === cual) ? 'block' : 'none';
    if (btn) btn.classList.toggle('activo', s === cual);
  });
  if (cual === 'data' && typeof iniciarData === 'function') {
    iniciarData();
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

  // Esperar a que db esté listo antes de llamar funciones dependientes
  function esperarDBYCargar(intentos) {
    intentos = intentos || 0;
    if (typeof db !== 'undefined' && db) {
      cargarKeysFirebase();
      setTimeout(function() { cargarReglasPrompt(function() { renderReglasBD(); }); }, 400);
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




