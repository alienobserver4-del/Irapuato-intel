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
// MODAL FACEBOOK
// ═══════════════════════════════════════════════════════════════
var fuenteFB = 'Tinta Negra FB';
var makeWebhookURL = '';
try { makeWebhookURL = localStorage.getItem('make_webhook') || ''; } catch(e) {}

function abrirFacebook() {
  var modal = document.getElementById('fb-modal');
  modal.style.display = 'flex';
  // Mostrar webhook guardado si existe
  if (makeWebhookURL) {
    document.getElementById('make-webhook-url').value = makeWebhookURL;
    document.getElementById('make-status').textContent = 'Configurado ✓';
    document.getElementById('make-status').style.color = '#00ff88';
  }
}
window.abrirFacebook = abrirFacebook;

function cerrarFB() {
  document.getElementById('fb-modal').style.display = 'none';
  document.getElementById('fb-resultado').innerHTML = '';
}
window.cerrarFB = cerrarFB;

function selFuenteFB(el, nombre) {
  fuenteFB = nombre;
  var opts = document.querySelectorAll('#fb-fuentes .fuente-opt');
  for (var i = 0; i < opts.length; i++) opts[i].classList.remove('sel');
  el.classList.add('sel');
}
window.selFuenteFB = selFuenteFB;

function analizarFB() {
  var texto = document.getElementById('fb-texto').value.trim();
  if (!texto) { toast('Pega el texto de la publicacion primero', 'err'); return; }
  var url = document.getElementById('fb-url').value.trim();
  var fuente = fuenteFB;

  // Cerrar modal y mandar al feed RSS igual que las demás noticias
  cerrarFB();
  verTab('noticias');

  // Crear tarjeta en el feed igual que RSS
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

  // Analizar con IA exactamente igual que las demás tarjetas
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




