// ── POOL DE API KEYS GEMINI ──
// Agrega aquí todas las keys que tengas (una por cuenta Google en aistudio.google.com)
// El sistema rota automáticamente cuando una alcanza su límite diario
var OPENROUTER_KEY = ''; // Legado — ahora se usa el pool
var OPENROUTER_KEYS = []; // Pool de keys OpenRouter
var _orKeyIdx = 0; // Índice de rotación
window._orKeyIdx = 0; // Expuesto globalmente para el gestor visual

// Google Custom Search — para búsqueda retrospectiva en INGESTA
var GOOGLE_SEARCH_KEY = 'AIzaSyDqzM9xtYBD9usxljaM-Nif0MEt9YMtU6o';
var GEMINI_KEYS = [
  // Agrega tus keys aquí o usa el gestor visual (toca 🤖 en el header)
  // Obtén keys gratis en: aistudio.google.com → Get API Key
  // 'AIzaSy....',  // key 1
  // 'AIzaSy....',  // key 2
];
var _geminiKeyIdx = 0;
var _geminiKeyAgotadas = {};

// Fusionar keys guardadas en localStorage con el pool activo
if (window._appGeminiKeys && window._appGeminiKeys.length) {
  window._appGeminiKeys.forEach(function(k) { if (GEMINI_KEYS.indexOf(k) < 0) GEMINI_KEYS.push(k); });
}
if (window._appORKeys && window._appORKeys.length) {
  window._appORKeys.forEach(function(k) { if (OPENROUTER_KEYS.indexOf(k) < 0) OPENROUTER_KEYS.push(k); });
}

function getGeminiKey() {
  // Usar siempre el array más actualizado (puede incluir keys del localStorage)
  var pool = (window._appGeminiKeys && window._appGeminiKeys.length) ? window._appGeminiKeys : GEMINI_KEYS;
  if (!pool || pool.length === 0) return '';
  for (var i = 0; i < pool.length; i++) {
    var idx = (_geminiKeyIdx + i) % pool.length;
    if (!_geminiKeyAgotadas[idx]) {
      _geminiKeyIdx = idx;
      return pool[idx];
    }
  }
  // Todas agotadas — limpiar y reintentar desde el inicio
  _geminiKeyAgotadas = {};
  _geminiKeyIdx = 0;
  return pool[0];
}

function marcarKeyAgotada(key) {
  var pool = (window._appGeminiKeys && window._appGeminiKeys.length) ? window._appGeminiKeys : GEMINI_KEYS;
  var idx = pool.indexOf(key);
  if (idx >= 0) {
    _geminiKeyAgotadas[idx] = true;
    console.warn('[Gemini] Key ' + (idx+1) + ' agotada, rotando...');
    _geminiKeyIdx = (idx + 1) % pool.length;
  }
}
var GEMINI_KEY = GEMINI_KEYS[0]; // compatibilidad

var firebaseConfig = {
  apiKey: "AIzaSyDQ0DDscWK0HR5nNkhMyzOVk_sxYZ0pGg4",
  authDomain: "irapuato-intel.firebaseapp.com",
  projectId: "irapuato-intel",
  storageBucket: "irapuato-intel.firebasestorage.app",
  messagingSenderId: "39562297804",
  appId: "1:39562297804:web:5d5c488450b21dbcfbdd69"
};

// ── Pool de proxies CORS — ordenados por confiabilidad 2026 ──
// allorigins.win está degradado (408/500/CORS) — usar como último recurso
var PROXY_GAS  = 'https://script.google.com/macros/s/AKfycbyNA58J2fWoOqD9kUGqQ_KnPy-HFaNXwYFVYF0Op3jrgF0HaIJcGkGNqw4mpb7wDNSu2A/exec?url='; // Google Apps Script — proxy propio
var PROXY1     = 'https://corsproxy.io/?';                        // secundario
var PROXY2     = 'https://corsproxy.io/?';                        // alias (compatibilidad)
var PROXY_OEM  = 'https://corsproxy.io/?';                        // OEM bloquea allorigins
var PROXY_CORS = 'https://proxy.cors.sh/';                        // sin rate limit agresivo
var PROXY_TABS = 'https://api.codetabs.com/v1/proxy?quest=';      // bueno para RSS
var PROXY_THIN = 'https://thingproxy.freeboard.io/fetch/';        // fallback 4
var PROXY_ALT  = 'https://api.allorigins.win/raw?url=';           // último recurso

// Función global para construir el pool ordenado dado una URL
window.proxyPool = function(url) {
  return [
    'https://script.google.com/macros/s/AKfycbyNA58J2fWoOqD9kUGqQ_KnPy-HFaNXwYFVYF0Op3jrgF0HaIJcGkGNqw4mpb7wDNSu2A/exec?url=' + encodeURIComponent(url),
    'https://corsproxy.io/?' + encodeURIComponent(url),
    'https://proxy.cors.sh/' + url,
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
    'https://thingproxy.freeboard.io/fetch/' + url,
    'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
  ];
};

var FUENTES_RSS = {
  sol_local: {
    nombre: 'El Sol — Local',
    tipo: 'scraping_oem',
    proxy: PROXY_OEM + encodeURIComponent('https://oem.com.mx/elsoldeirapuato/local/')
  },
  sol_policiaca: {
    nombre: 'El Sol — Policiaca',
    tipo: 'scraping_oem',
    proxy: PROXY_OEM + encodeURIComponent('https://oem.com.mx/elsoldeirapuato/policiaca/')
  },
  am_irapuato: {
    nombre: 'AM Irapuato',
    tipo: 'scraping',
    proxy: PROXY1 + encodeURIComponent('https://www.am.com.mx/irapuato')
  },
  am_sucesos: {
    nombre: 'AM Sucesos GTO',
    tipo: 'scraping',
    proxy: PROXY1 + encodeURIComponent('https://www.am.com.mx/temas/sucesos-9287.html')
  },
  am_rss: {
    nombre: 'AM RSS (filtrado)',
    tipo: 'rss',
    proxy: PROXY1 + encodeURIComponent('https://am.com.mx/rss')
  },
  correo: {
    nombre: 'Periódico Correo',
    tipo: 'rss',
    proxy: PROXY1 + encodeURIComponent('https://periodicocorreo.com.mx/guanajuato/irapuato/feed/')
  },
  tinta: {
    nombre: 'Tinta Negra — Irapuato',
    tipo: 'rss',
    proxy: PROXY1 + encodeURIComponent('https://entintanegra.com/category/irapuato/feed/')
  },
  am_policia: {
    nombre: 'AM Policía Irapuato',
    tipo: 'scraping',
    proxy: PROXY1 + encodeURIComponent('https://www.am.com.mx/tag/policia-de-irapuato')
  },
  correo_seg: {
    nombre: 'Correo Seguridad',
    tipo: 'scraping',
    proxy: PROXY1 + encodeURIComponent('https://periodicocorreo.com.mx/seccion/seguridad/')
  },
  silla_rota: {
    nombre: 'La Silla Rota — Irapuato',
    tipo: 'scraping_silla',
    proxy: PROXY1 + encodeURIComponent('https://lasillarota.com/temas/irapuato-1082.html')
  },
  zona_franca: {
    nombre: 'Zona Franca — Irapuato',
    tipo: 'scraping_zf',
    proxy: PROXY1 + encodeURIComponent('https://zonafranca.mx/location/irapuato/')
  },
  make_webhook: {
    nombre: 'Facebook (via Make.com)',
    tipo: 'webhook',
    proxy: ''
  }
};

// ═══════════════════════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════════════════════
var db = null;
var noticias = [];         // aprobadas en Firebase
var fuenteManual = 'El Sol de Irapuato';
var filtroBD = 'todos';
var ordenBD = 'captura';   // 'captura' | 'suceso' | 'confianza'
var cardCounter = 0;

function ordenarBD(modo, btn) {
  ordenBD = modo;
  var btns = document.querySelectorAll('.bd-orden-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  var label = document.getElementById('bd-orden-label');
  if (label) {
    if (modo === 'captura')   label.textContent = 'fecha captura ↓';
    if (modo === 'suceso')    label.textContent = 'fecha suceso ↓';
    if (modo === 'confianza') label.textContent = 'confianza ↓';
  }
  renderBD();
}
window.ordenarBD = ordenarBD;

function comparadorBD(a, b) {
  if (ordenBD === 'captura') {
    // Fecha de captura (Firestore timestamp o string)
    var ta = 0, tb = 0;
    if (a.fechaGuardado && a.fechaGuardado.toDate) ta = a.fechaGuardado.toDate().getTime();
    else if (a.fechaCaptura) ta = new Date(a.fechaCaptura).getTime() || 0;
    if (b.fechaGuardado && b.fechaGuardado.toDate) tb = b.fechaGuardado.toDate().getTime();
    else if (b.fechaCaptura) tb = new Date(b.fechaCaptura).getTime() || 0;
    return tb - ta; // más reciente primero
  }
  if (ordenBD === 'suceso') {
    // Fecha del suceso (DD/MM/YYYY)
    function parseFecha(str) {
      if (!str) return 0;
      var p = str.split('/');
      if (p.length === 3) { var d = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])); return isNaN(d.getTime()) ? 0 : d.getTime(); }
      return new Date(str).getTime() || 0;
    }
    return parseFecha(b.fecha_evento) - parseFecha(a.fecha_evento);
  }
  if (ordenBD === 'confianza') {
    var ord = { alta: 3, media: 2, baja: 1 };
    return (ord[b.confianza] || 0) - (ord[a.confianza] || 0);
  }
  return 0;
}

// ── Cola de auto-fetch de artículos ──
var fetchQueue = [];       // [{id, url, reintentos}]
var fetchActivo = false;   // ¿hay un fetch corriendo?
var FETCH_DELAY = 1800;    // ms entre fetches (respetar proxies — OEM necesita más tiempo)
var FETCH_MAX_REINTENTOS = 2;

function encolarFetch(id, url) {
  if (!url || url.indexOf('http') < 0) return;
  fetchQueue.push({ id: id, url: url, reintentos: 0 });
  if (!fetchActivo) procesarColaFetch();
}

function procesarColaFetch() {
  // Actualizar estado de la cola
  var estadoEl = document.getElementById('rss-estado');
  if (estadoEl && fetchQueue.length > 0) {
    var spanCola = document.getElementById('fetch-queue-badge');
    if (!spanCola) {
      spanCola = document.createElement('span');
      spanCola.id = 'fetch-queue-badge';
      spanCola.style.cssText = 'margin-left:8px;color:#3a7ab8;font-size:7px;font-family:var(--mono);';
      estadoEl.appendChild(spanCola);
    }
    spanCola.textContent = '⏳ cargando textos: ' + fetchQueue.length + ' pendientes';
  } else {
    var badge = document.getElementById('fetch-queue-badge');
    if (badge) badge.textContent = '';
  }
  if (fetchQueue.length === 0) { fetchActivo = false; return; }
  fetchActivo = true;
  var item = fetchQueue.shift();
  var card = document.getElementById(item.id);
  if (!card) { procesarColaFetch(); return; } // card ya descartada

  // Indicador sutil de carga en la card
  var resEl = document.getElementById(item.id + '-res');
  if (resEl && !resEl.dataset.cargado) {
    resEl.style.color = '#2a4a6a';
    resEl.textContent = '⏳ Cargando texto del artículo...';
  }

  fetchContenidoArticulo(item.url, function(texto) {
    var cardViva = document.getElementById(item.id);
    if (!cardViva) { setTimeout(procesarColaFetch, 200); return; }

    if (texto && texto.length > 120) {
      cardViva.dataset.texto = texto;
      cardViva.dataset.textoCargado = '1';
      var resEl2 = document.getElementById(item.id + '-res');
      if (resEl2) {
        resEl2.style.color = '';
        // Mostrar primeros 400 chars como preview
        resEl2.textContent = texto.slice(0, 400) + (texto.length > 400 ? '...' : '');
      }
      // Indicador verde pequeño en la card
      var confEl = document.getElementById(item.id + '-conf');
      if (confEl && !confEl.textContent) {
        var proxyNombre = ['allorigins','corsproxy','allorigins/get','codetabs','thingproxy'];
        confEl.textContent = '✓ texto (' + (proxyNombre[proxyIdx] || 'p' + proxyIdx) + ')';
        confEl.style.color = '#2a6a4a';
        confEl.style.fontSize = '7px';
      }
    } else if (item.reintentos < FETCH_MAX_REINTENTOS) {
      item.reintentos++;
      fetchQueue.push(item); // reintentar al final
      var resEl3 = document.getElementById(item.id + '-res');
      if (resEl3) resEl3.textContent = '⚠ Sin texto aún (reintento ' + item.reintentos + ')...';
    } else {
      var resEl4 = document.getElementById(item.id + '-res');
      if (resEl4) {
        resEl4.style.color = '#4a2a2a';
        resEl4.textContent = '(No se pudo obtener el texto completo — usa ANALIZAR o escribe en ENTRADA MANUAL)';
      }
    }
    setTimeout(procesarColaFetch, FETCH_DELAY);
  });
}       // ID único para cada tarjeta
