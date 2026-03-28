// ═══════════════════════════════════════════════════════════════
// RSS
// ═══════════════════════════════════════════════════════════════
var rssActiva = '';
var rssItems = {};
var rssMaxDias = 7; // por defecto 7 días

function setRssMaxDias(dias, btn) {
  rssMaxDias = dias;
  var btns = document.querySelectorAll('.rss-fecha-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  var label = document.getElementById('rss-fecha-label');
  if (label) label.textContent = dias === 7 ? 'máx 7 días' : dias === 30 ? 'máx 1 mes' : dias === 60 ? 'máx 2 meses' : 'máx 3 meses';
  // Si hay una fuente activa, recargar con el nuevo filtro
  if (rssActiva) cargarRSS(rssActiva);
}
window.setRssMaxDias = setRssMaxDias;

function noticiaDentroDeRango(fechaStr) {
  if (!fechaStr || rssMaxDias === 0) return true; // sin fecha o sin límite: pasar
  var d = new Date(fechaStr);
  if (isNaN(d.getTime())) return true; // no se pudo parsear: pasar
  var limite = new Date();
  limite.setDate(limite.getDate() - rssMaxDias);
  return d >= limite;
}

function setEstadoRSS(msg, tipo) {
  var el = document.getElementById('rss-estado');
  el.textContent = msg;
  el.className = 'rss-estado' + (tipo ? ' ' + tipo : '');
}

function cargarRSS(fuente) {
  rssActiva = fuente;
  var src = FUENTES_RSS[fuente];
  if (!src) return;
  setEstadoRSS('⏳ Cargando ' + src.nombre + '...', 'cargando');
  document.getElementById('lista-rss').innerHTML = '';

  // Cola de proxies a intentar en orden
  // OEM bloquea allorigins → para OEM usar corsproxy primero, luego proxies alternativos
  var urlBase = src.url || src.proxy.replace(/https?:\/\/(api\.allorigins\.win\/raw\?url=|corsproxy\.io\/\?)/,'').replace(/^https?:\/\/[^/]+\/raw\?url=/,'');
  // Extraer URL real desde el proxy configurado
  var urlReal = '';
  var m1 = src.proxy.match(/raw\?url=(.+)/);
  var m2 = src.proxy.match(/corsproxy\.io\/\?(.+)/);
  if (m1) urlReal = decodeURIComponent(m1[1]);
  else if (m2) urlReal = decodeURIComponent(m2[1]);
  else urlReal = src.proxy; // fallback

  var esOEM = src.tipo === 'scraping_oem';

  // Pool unificado — corsproxy primero, allorigins al final (degradado en 2026)
  var proxies = (typeof proxyPool === 'function')
    ? proxyPool(urlReal)
    : [
        'https://corsproxy.io/?' + encodeURIComponent(urlReal),
        'https://proxy.cors.sh/' + urlReal,
        'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(urlReal),
        'https://thingproxy.freeboard.io/fetch/' + urlReal,
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(urlReal)
      ];

  var intentoActual = 0;

  function intentarFetch() {
    if (intentoActual >= proxies.length) {
      setEstadoRSS('❌ No se pudo cargar ' + src.nombre + ' — todos los proxies fallaron. Intenta más tarde.', 'error');
      return;
    }
    var url = proxies[intentoActual];
    intentoActual++;

    if (intentoActual > 1) {
      setEstadoRSS('⏳ Reintentando con proxy alternativo ' + intentoActual + '/' + proxies.length + '...', 'cargando');
    }

    fetch(url)
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(txt) {
      if (!txt || txt.trim().length < 100) throw new Error('Respuesta vacía');
      if (src.tipo === 'rss') {
        procesarRSS(txt, src.nombre);
      } else if (src.tipo === 'scraping_oem') {
        procesarScrapingOEM(txt, src.nombre, url);
      } else if (src.tipo === 'scraping_zf') {
        procesarScrapingZF(txt, src.nombre, url);
      } else if (src.tipo === 'scraping_silla') {
        procesarScrapingSilla(txt, src.nombre, url);
      } else {
        procesarScraping(txt, src.nombre, url);
      }
    })
    .catch(function() {
      intentarFetch();
    });
  }
  intentarFetch();
}

function procesarScrapingOEM(html, nombreFuente, proxyUrl) {
  // OEM / El Sol de Irapuato — CMS propio
  // Portada: artículos en <article class="note"> o <div class="note">
  // con <h2 class="note-title"><a href="..."> o <a class="note-link">
  var base = 'https://oem.com.mx';
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var arr = [];
  var seen = {};

  // Limpiar basura primero
  var basura = doc.querySelectorAll('nav, footer, header, aside, script, style, .widget, [class*="publicidad"], [class*="banner"], [class*="social"]');
  for (var b = 0; b < basura.length; b++) {
    if (basura[b].parentNode) basura[b].parentNode.removeChild(basura[b]);
  }

  // Estrategia 1: artículos OEM — nota con título
  var noteTitles = doc.querySelectorAll('.note-title a, .note-link, h2 a, h3 a, article a, .article-title a');
  for (var i = 0; i < noteTitles.length && arr.length < 20; i++) {
    var a = noteTitles[i];
    var titulo = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var href = a.getAttribute('href') || '';
    if (titulo.length < 20 || titulo.length > 200) continue;
    if (href.indexOf('#') >= 0 || href === '' || href === '/') continue;
    // Excluir links de categoría/sección (sin guiones en la ruta)
    var ruta = href.replace(/https?:\/\/[^/]+/, '');
    if (ruta.split('/').filter(Boolean).length < 2) continue;
    var urlCompleta = href.indexOf('http') === 0 ? href : base + (href.indexOf('/') === 0 ? href : '/' + href);
    if (seen[titulo]) continue;
    seen[titulo] = true;
    arr.push({ titulo: titulo, desc: '', link: urlCompleta, fecha: 'Hoy', fuente: nombreFuente });
  }

  // Estrategia 2: todos los links con texto de titular (fallback)
  if (arr.length < 5) {
    var links = doc.querySelectorAll('a[href]');
    for (var j = 0; j < links.length && arr.length < 20; j++) {
      var a2 = links[j];
      var titulo2 = (a2.textContent || '').trim().replace(/\s+/g, ' ');
      var href2 = a2.getAttribute('href') || '';
      if (titulo2.length < 25 || titulo2.length > 180) continue;
      if (href2.indexOf('#') >= 0) continue;
      if (href2.indexOf('oem.com.mx') < 0 && href2.indexOf('/') !== 0) continue;
      var urlC = href2.indexOf('http') === 0 ? href2 : base + (href2.indexOf('/') === 0 ? href2 : '/' + href2);
      if (seen[titulo2]) continue;
      seen[titulo2] = true;
      arr.push({ titulo: titulo2, desc: '', link: urlC, fecha: 'Hoy', fuente: nombreFuente });
    }
  }

  if (arr.length === 0) {
    procesarScraping(html, nombreFuente, proxyUrl);
    return;
  }
  setEstadoRSS(arr.length + ' noticias de ' + nombreFuente, 'ok');
  renderTarjetasRSS(arr, nombreFuente);
}

function procesarScrapingZF(html, nombreFuente, proxyUrl) {
  // Zona Franca — WordPress. Artículos en <article> o h2/h3 con links a /seguridad/ o /local/
  var urlMatch = proxyUrl.match(/url=([^&]+)/);
  var baseUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
  var base = 'https://zonafranca.mx';

  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var arr = [];

  // Buscar artículos en contenedores principales (evitar nav, footer, sidebar)
  var contenedores = doc.querySelectorAll('article, .post, .entry, main a[href], .td-module-title a, h2 a, h3 a');
  var seen = {};
  for (var i = 0; i < contenedores.length && arr.length < 18; i++) {
    var el = contenedores[i];
    var a = (el.tagName === 'A') ? el : el.querySelector('a');
    if (!a) continue;
    var titulo = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var href = a.getAttribute('href') || '';
    // Filtrar rutas de navegación (muy cortas o de sección)
    if (titulo.length < 20 || titulo.length > 200) continue;
    if (href.indexOf('#') >= 0) continue;
    // Excluir links de menú/nav
    var parent = a.parentElement;
    var enNav = false;
    while (parent) {
      var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
      if (tag === 'nav' || tag === 'footer' || tag === 'header') { enNav = true; break; }
      var cls = parent.className || '';
      if (cls.indexOf('menu') >= 0 || cls.indexOf('widget') >= 0 || cls.indexOf('sidebar') >= 0) { enNav = true; break; }
      parent = parent.parentElement;
    }
    if (enNav) continue;
    var urlCompleta = href.indexOf('http') === 0 ? href : base + (href.indexOf('/') === 0 ? href : '/' + href);
    if (seen[titulo]) continue;
    seen[titulo] = true;
    arr.push({ titulo: titulo, desc: '', link: urlCompleta, fecha: 'Hoy', fuente: nombreFuente });
  }

  if (arr.length === 0) {
    // Fallback: scraping genérico
    procesarScraping(html, nombreFuente, proxyUrl);
    return;
  }
  setEstadoRSS(arr.length + ' noticias extraídas de ' + nombreFuente, 'ok');
  renderTarjetasRSS(arr, nombreFuente);
}

function procesarScrapingSilla(html, nombreFuente, proxyUrl) {
  // La Silla Rota — buscar artículos evitando footer/menú
  var base = 'https://lasillarota.com';
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var arr = [];
  var seen = {};

  var candidatos = doc.querySelectorAll('.news-card a, .article-card a, .nota a, h2 a, h3 a, .title a, [class*="title"] a, article a');
  for (var i = 0; i < candidatos.length && arr.length < 18; i++) {
    var a = candidatos[i];
    var titulo = (a.textContent || '').trim().replace(/\s+/g, ' ');
    var href = a.getAttribute('href') || '';
    if (titulo.length < 20 || titulo.length > 200) continue;
    if (href.indexOf('#') >= 0) continue;
    var urlCompleta = href.indexOf('http') === 0 ? href : base + (href.indexOf('/') === 0 ? href : '/' + href);
    if (seen[titulo]) continue;
    seen[titulo] = true;
    arr.push({ titulo: titulo, desc: '', link: urlCompleta, fecha: 'Hoy', fuente: nombreFuente });
  }

  if (arr.length === 0) {
    procesarScraping(html, nombreFuente, proxyUrl);
    return;
  }
  setEstadoRSS(arr.length + ' noticias extraídas de ' + nombreFuente, 'ok');
  renderTarjetasRSS(arr, nombreFuente);
}

function procesarRSS(txt, nombreFuente) {
  var parser = new DOMParser();
  var xml = parser.parseFromString(txt, 'application/xml');
  var items = xml.querySelectorAll('item');
  var arr = [];
  var filtradas = 0;
  for (var i = 0; i < items.length && i < 60; i++) {
    var item = items[i];
    var titulo = (item.querySelector('title') ? item.querySelector('title').textContent : '').trim();
    var desc = (item.querySelector('description') ? item.querySelector('description').textContent : '').replace(/<[^>]*>/g, '').trim().slice(0, 400);
    var link = (item.querySelector('link') ? item.querySelector('link').textContent : '').trim();
    var fecha = (item.querySelector('pubDate') ? item.querySelector('pubDate').textContent : '').trim();
    // Filtro de antigüedad
    if (!noticiaDentroDeRango(fecha)) { filtradas++; continue; }
    var completo = (titulo + ' ' + desc).toLowerCase();
    if (completo.indexOf('irapuato') >= 0 || completo.indexOf('silao') >= 0 || completo.indexOf('salamanca') >= 0) {
      arr.push({ titulo: titulo, desc: desc, link: link, fecha: fecha, fuente: nombreFuente });
    }
  }
  if (arr.length === 0) {
    var msg = filtradas > 0
      ? 'Sin noticias en los últimos ' + rssMaxDias + ' días (' + filtradas + ' artículos fuera de rango). Amplía el período.'
      : 'Sin noticias del Bajío en este feed. Prueba otra fuente.';
    setEstadoRSS(msg, 'error');
    return;
  }
  setEstadoRSS(arr.length + ' noticias encontradas en ' + nombreFuente + (filtradas > 0 ? ' · ' + filtradas + ' fuera de rango' : ''), 'ok');
  renderTarjetasRSS(arr, nombreFuente);
}

function procesarScraping(html, nombreFuente, proxyUrl) {
  // Extraer URL base del periódico del proxy URL
  var urlMatch = proxyUrl.match(/url=([^&]+)/);
  var baseUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
  var dominio = baseUrl.match(/https?:\/\/[^\/]+/);
  var base = dominio ? dominio[0] : '';

  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var arr = [];

  // Buscar artículos/noticias — patrones comunes en sitios de noticias
  var selectores = ['article', '.post', '.news-item', '.nota', 'h2 a', 'h3 a', '.entry-title a'];
  var encontrados = [];

  // Buscar todos los enlaces con texto significativo
  var links = doc.querySelectorAll('a');
  for (var i = 0; i < links.length && arr.length < 15; i++) {
    var a = links[i];
    var titulo = (a.textContent || '').trim();
    var href = a.getAttribute('href') || '';
    // Filtrar: título largo (>20 chars), que sea noticia real
    if (titulo.length > 25 && titulo.length < 200 && href && href.indexOf('#') < 0) {
      // Construir URL completa
      var urlCompleta = href;
      if (href.indexOf('http') < 0) {
        urlCompleta = href.indexOf('/') === 0 ? base + href : base + '/' + href;
      }
      // Evitar duplicados
      var yaTiene = false;
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].titulo === titulo) { yaTiene = true; break; }
      }
      if (!yaTiene) {
        arr.push({ titulo: titulo, desc: '', link: urlCompleta, fecha: 'Hoy', fuente: nombreFuente });
      }
    }
  }

  if (arr.length === 0) {
    setEstadoRSS('No se pudieron extraer noticias de ' + nombreFuente + '. El sitio puede bloquear el acceso.', 'error');
    return;
  }
  setEstadoRSS(arr.length + ' noticias extraídas de ' + nombreFuente, 'ok');
  renderTarjetasRSS(arr, nombreFuente);
}
window.cargarRSS = cargarRSS;

function cargarTodas() {
  var fuentes = ['sol_local', 'sol_policiaca', 'am_irapuato', 'am_policia', 'correo_seg', 'silla_rota', 'zona_franca'];
  var idx = 0;
  document.getElementById('lista-rss').innerHTML = '';

  var siguiente = function() {
    if (idx >= fuentes.length) {
      var count = document.getElementById('lista-rss').children.length;
      setEstadoRSS(count + ' noticias cargadas de todas las fuentes', 'ok');
      return;
    }
    var f = fuentes[idx]; idx++;
    var src = FUENTES_RSS[f];
    if (!src) { siguiente(); return; }
    setEstadoRSS('⏳ Cargando ' + src.nombre + ' (' + idx + '/' + fuentes.length + ')...', 'cargando');

    var m1 = src.proxy.match(/raw\?url=(.+)/);
    var m2 = src.proxy.match(/corsproxy\.io\/\?(.+)/);
    var urlReal = m1 ? decodeURIComponent(m1[1]) : m2 ? decodeURIComponent(m2[1]) : src.proxy;

    // Pool unificado — corsproxy primero, allorigins al final
    var proxies = (typeof proxyPool === 'function')
      ? proxyPool(urlReal)
      : [
          'https://corsproxy.io/?' + encodeURIComponent(urlReal),
          'https://proxy.cors.sh/' + urlReal,
          'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(urlReal),
          'https://thingproxy.freeboard.io/fetch/' + urlReal,
          'https://api.allorigins.win/raw?url=' + encodeURIComponent(urlReal)
        ];

    var pi = 0;
    var intentar = function() {
      if (pi >= proxies.length) { setTimeout(siguiente, 1000); return; }
      var url = proxies[pi++];
      fetch(url)
      .then(function(res) { if (!res.ok) throw new Error('status ' + res.status); return res.text(); })
      .then(function(txt) {
        if (!txt || txt.trim().length < 100) throw new Error('vacio');
        if (src.tipo === 'rss') { procesarRSSAcumulado(txt, src.nombre); }
        else { procesarScrapingAcumulado(txt, src.nombre, url); }
        setTimeout(siguiente, 1500);
      })
      .catch(function() { intentar(); });
    };
    intentar();
  };
  siguiente();
}

function procesarRSSAcumulado(txt, nombreFuente) {
  var parser = new DOMParser();
  var xml = parser.parseFromString(txt, 'application/xml');
  var items = xml.querySelectorAll('item');
  var lista = document.getElementById('lista-rss');
  for (var i = 0; i < items.length && i < 60; i++) {
    var item = items[i];
    var titulo = (item.querySelector('title') ? item.querySelector('title').textContent : '').trim();
    var desc = (item.querySelector('description') ? item.querySelector('description').textContent : '').replace(/<[^>]*>/g,'').trim().slice(0,400);
    var link = (item.querySelector('link') ? item.querySelector('link').textContent : '').trim();
    var fecha = (item.querySelector('pubDate') ? item.querySelector('pubDate').textContent : '').trim();
    if (!noticiaDentroDeRango(fecha)) continue;
    var completo = (titulo + ' ' + desc).toLowerCase();
    if (completo.indexOf('irapuato') >= 0 || completo.indexOf('silao') >= 0 || completo.indexOf('salamanca') >= 0) {
      lista.appendChild(crearTarjetaRSS({ titulo:titulo, desc:desc, link:link, fecha:fecha, fuente:nombreFuente }));
    }
  }
}

function procesarScrapingAcumulado(html, nombreFuente, proxyUrl) {
  var urlMatch = proxyUrl.match(/url=([^&]+)/);
  var baseUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : '';
  var dominio = baseUrl.match(/https?:[/][/][^/]+/);
  var base = dominio ? dominio[0] : '';
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var lista = document.getElementById('lista-rss');
  var count = 0;
  var links = doc.querySelectorAll('a');
  for (var i = 0; i < links.length && count < 8; i++) {
    var a = links[i];
    var titulo = (a.textContent || '').trim();
    var href = a.getAttribute('href') || '';
    if (titulo.length > 25 && titulo.length < 200 && href && href.indexOf('#') < 0) {
      var urlCompleta = href;
      if (href.indexOf('http') < 0) {
        urlCompleta = href.charAt(0) === '/' ? base + href : base + '/' + href;
      }
      lista.appendChild(crearTarjetaRSS({ titulo:titulo, desc:'', link:urlCompleta, fecha:'', fuente:nombreFuente }));
      count++;
    }
  }
}
window.cargarTodas = cargarTodas;

function renderTarjetasRSS(arr, fuente) {
  var lista = document.getElementById('lista-rss');
  lista.innerHTML = '';
  for (var i = 0; i < arr.length; i++) {
    lista.appendChild(crearTarjetaRSS(arr[i]));
  }
}

function crearTarjetaRSS(item) {
  var id = 'card-' + (++cardCounter);
  var texto = (item.titulo + '. ' + (item.desc||'')).slice(0, 300);
  var card = document.createElement('div');
  card.className = 'noticia-card';
  card.id = id;
  card.dataset.texto = texto;
  card.dataset.fuente = item.fuente || '';
  card.dataset.link = item.link || '';

  // Registrar en feed-visto (deduplicado por hash en aprende.js)
  if (typeof feedVistaRegistrar === 'function') {
    feedVistaRegistrar(item.titulo, item.fuente, item.link, item.fecha);
  }

  // Verificar si ya fue aprobada previamente
  var yaAprobada = typeof feedVistaEstado === 'function'
    ? feedVistaEstado(item.titulo)
    : null;

  var tituloSeg = (item.titulo||'').replace(/['"]/g, '');
  var descSeg = (item.desc||'').slice(0,100).replace(/['"]/g, '');
  var linkSeg = (item.link||'').replace(/['"]/g, '');
  var fuenteSeg = (item.fuente||'').replace(/['"]/g, '');

  var h = '';
  h += '<div class="nc-header">';
  h += '<span class="nc-tipo rumor" id="' + id + '-tipo-badge">RUMOR</span>';
  // Badge "ya en corpus" si fue aprobada antes
  if (yaAprobada && yaAprobada.aprobada) {
    h += '<span style="background:rgba(0,255,136,.15);color:#0f8;border:1px solid #0f833;' +
      'font-size:7px;padding:1px 5px;border-radius:2px;margin-left:4px;">✓ EN CORPUS</span>';
  }
  h += '<div><div class="nc-titulo">' + (item.titulo||'') + '</div>';
  if (item.link) { h += '<a href="' + linkSeg + '" target="_blank" class="nc-link">ver noticia</a>'; }
  h += '</div></div>';
  var ahora = new Date();
  var fechaStr = ahora.getDate() + '/' + (ahora.getMonth()+1) + '/' + ahora.getFullYear() + ' ' + ahora.getHours() + ':' + (ahora.getMinutes()<10?'0':'') + ahora.getMinutes();
  h += '<div class="nc-fecha">Capturado: ' + fechaStr + (item.fecha ? ' | Publicado: ' + item.fecha : '') + '</div>';
  h += '<div class="nc-meta">';
  h += '<span class="nc-fuente">' + (item.fuente||'') + '</span>';
  h += '<span id="' + id + '-lugar" class="nc-lugar"></span>';
  h += '<span id="' + id + '-conf"></span>';
  h += '</div>';
  h += '<div class="nc-nombres" id="' + id + '-nombres" style="display:none"></div>';
  h += '<div class="nc-resumen" id="' + id + '-res">' + (item.desc||'') + '</div>';
  h += '<div style="margin:6px 0;padding:6px;background:#020810;border:1px solid #0d2040;border-radius:3px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
    '<span style="font-family:var(--title);font-size:6px;color:#2a5a7a;letter-spacing:1px;">📋 PEGA TEXTO COMPLETO — análisis más preciso</span>' +
    '<button onclick="limpiarTextoCard(\'' + id + '\')" style="font-family:var(--title);font-size:6px;padding:2px 7px;background:rgba(0,200,255,.08);color:var(--cyan);border:1px solid #00ccff44;border-radius:3px;cursor:pointer;">✦ LIMPIAR</button>' +
    '</div>' +
    '<textarea id="' + id + '-texto-manual" oninput="actualizarStatsCard(\'' + id + '\')" style="width:100%;min-height:60px;max-height:150px;resize:vertical;background:#030810;border:1px dashed #1a3a5a;color:#7aaabb;font-family:var(--mono);font-size:8px;padding:6px;border-radius:3px;box-sizing:border-box;" placeholder="Abre la nota → copia todo (Ctrl+A, Ctrl+C) → pega aquí → LIMPIAR → ANALIZAR"></textarea>' +
    '<div id="' + id + '-txt-stats" style="font-size:6px;color:#1a4a6a;height:11px;margin-top:1px;"></div>' +
    '</div>';
  h += '<div class="nc-procesando" id="' + id + '-proc"><div class="mini-spin"></div> Analizando...</div>';
  h += '<div class="nc-edit" id="' + id + '-edit">';
  h += '<div class="nc-campo"><div class="nc-label">TITULO</div>';
  h += '<input class="nc-input" id="' + id + '-tit" value="' + tituloSeg + '"></div>';
  h += '<div class="nc-campo"><div class="nc-label">TIPO</div>';
  h += '<select class="nc-select" id="' + id + '-tipo">';
  h += '<option value="seguridad">Seguridad</option>';
  h += '<option value="accidente">Accidente</option>';
  h += '<option value="evento">Evento</option>';
  h += '<option value="rumor" selected>Rumor</option>';
  h += '<option value="desaparecido">Desaparecido</option>';
  h += '<option value="gobierno">Gobierno</option>';
  h += '<option value="politica">Política</option>';
  h += '<option value="salud">Salud</option>';
  h += '<option value="transporte">Transporte/Vialidad</option>';
  h += '</select></div>';
  h += '<div class="nc-campo"><div class="nc-label">TIPO SECUNDARIO (opcional)</div>';
  h += '<select class="nc-select" id="' + id + '-tipo2">';
  h += '<option value="">-- Ninguno --</option>';
  h += '<option value="seguridad">Seguridad</option>';
  h += '<option value="accidente">Accidente</option>';
  h += '<option value="evento">Evento</option>';
  h += '<option value="rumor">Rumor</option>';
  h += '<option value="desaparecido">Desaparecido</option>';
  h += '<option value="gobierno">Gobierno</option>';
  h += '<option value="politica">Política</option>';
  h += '<option value="salud">Salud</option>';
  h += '<option value="transporte">Transporte/Vialidad</option>';
  h += '</select></div>';
  h += '<div class="nc-campo"><div class="nc-label">CALLE 1</div>';
  h += '<input class="nc-input" id="' + id + '-cal1" value="" placeholder="Primera calle mencionada..." onblur="autoColonia(\'' + id + '\')"></div>';
  h += '<div class="nc-campo"><div class="nc-label">CALLE 2</div>';
  h += '<input class="nc-input" id="' + id + '-cal2" value="" placeholder="Segunda calle (esquina/cruce)..." onblur="autoColoniaCalle2(\'' + id + '\')"></div>';
  h += '<div class="nc-campo"><div class="nc-label">COLONIA</div>';
  h += '<input class="nc-input" id="' + id + '-col" value="" placeholder="Se auto-completa por calles..."></div>';
  h += '<div class="nc-campo"><div class="nc-label">COMUNIDAD</div>';
  h += '<input class="nc-input" id="' + id + '-com" value=""></div>';
  h += '<div class="nc-campo"><div class="nc-label">NOMBRES</div>';
  h += '<input class="nc-input" id="' + id + '-nom" value="" placeholder="Nombres implicados..."></div>';
  h += '<div class="nc-campo"><div class="nc-label">COORDENADAS (lat, lng) — opcional</div>';
  h += '<input class="nc-input" id="' + id + '-coords" placeholder="Ej: 20.6721, -101.3475" style="font-size:8px;">';
  h += '</div>';
  h += '<div class="nc-campo"><div class="nc-label">FECHA DEL EVENTO</div>';
  h += '<input class="nc-input" id="' + id + '-fev" value="" placeholder="DD/MM/YYYY segun la noticia..."></div>';
  h += '<div class="nc-campo"><div class="nc-label">MOMENTO DEL DIA</div>';
  h += '<select class="nc-select" id="' + id + '-tdia">';
  h += '<option value="desconocido">Desconocido</option>';
  h += '<option value="manana">Mañana (6-12h)</option>';
  h += '<option value="tarde">Tarde (12-19h)</option>';
  h += '<option value="noche">Noche (19-24h)</option>';
  h += '<option value="madrugada">Madrugada (0-6h)</option>';
  h += '</select></div>';
  h += '<div class="nc-campo"><div class="nc-label">RESUMEN</div>';
  h += '<textarea class="nc-input" id="' + id + '-sum" style="min-height:60px;resize:vertical;"></textarea></div>';
  h += '</div>';
  h += '<div class="nc-acciones">';
  h += '<button class="btn-ia" onclick="analizarDesdeCard(\'' + id + '\')">ANALIZAR</button>';
  h += '<button class="btn-editar" onclick="toggleEdit(\'' + id + '\')">EDITAR</button>';

  h += '<button class="btn-aprobar" id="' + id + '-btn-apr" onclick="aprobarCard(\'' + id + '\',\'' + fuenteSeg + '\',\'' + linkSeg + '\')">APROBAR</button>';
  h += '<button class="btn-descartar" onclick="descartarCard(\'' + id + '\')">X</button>';
  h += '</div>';
  card.innerHTML = h;
  return card;
}

function analizarDesdeCard(id) {
  var card = document.getElementById(id);
  if (!card) return;
  var link = card.dataset.link || '';
  var fuente = card.dataset.fuente || '';
  // Preferir texto pegado manualmente en la tarjeta
  var textoManualEl = document.getElementById(id + '-texto-manual');
  var textoManual = textoManualEl ? textoManualEl.value.trim() : '';
  var texto = textoManual || card.dataset.texto || '';
  if (!texto) { toast('Sin texto para analizar', 'warn'); return; }
  analizarConIA(id, texto, fuente, link);
}
window.analizarDesdeCard = analizarDesdeCard;

// Descarga y extrae el texto limpio de un articulo periodistico
function fetchContenidoArticulo(url, callback) {
  // Pool unificado — corsproxy primero, allorigins al final (degradado en 2026)
  var proxies = (typeof proxyPool === 'function')
    ? proxyPool(url)
    : [
        'https://corsproxy.io/?' + encodeURIComponent(url),
        'https://proxy.cors.sh/' + url,
        'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url),
        'https://thingproxy.freeboard.io/fetch/' + url,
        'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
      ];

  function intentar(idx) {
    if (idx >= proxies.length) { callback(null); return; }
    var proxyUrl = proxies[idx];
    var timeoutId = setTimeout(function() { intentar(idx + 1); }, 8000); // timeout 8s
    fetch(proxyUrl)
    .then(function(res) {
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function(raw) {
      // allorigins /get devuelve JSON con {contents: "..."}
      var html = raw;
      if (raw && raw.indexOf('"contents"') >= 0) {
        try { var j = JSON.parse(raw); html = j.contents || raw; } catch(e) {}
      }
      var texto = extraerTextoArticulo(html);
      if (texto && texto.length > 120) {
        callback(texto, idx); // pasar idx del proxy que funcionó
      } else {
        intentar(idx + 1);
      }
    })
    .catch(function() { clearTimeout(timeoutId); intentar(idx + 1); });
  }
  intentar(0);
}

// Extrae el texto principal de un HTML periodistico
function extraerTextoArticulo(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  // ── PASO 1: Quitar basura estructural ──
  var selectoresBasura = [
    'script','style','nav','footer','aside','header','iframe','noscript',
    'figure','picture','video','audio','form',
    '[class*="share"]','[class*="social"]','[class*="related"]',
    '[class*="recommend"]','[class*="popular"]','[class*="trending"]',
    '[class*="newsletter"]','[class*="suscri"]','[class*="subscri"]',
    '[class*="publicidad"]','[class*="banner"]','[class*="publi"]',
    '[class*="ad-"]','[class*="-ad"]','[class*="ads"]',
    '[class*="menu"]','[class*="sidebar"]','[class*="widget"]',
    '[class*="comment"]','[class*="tag"]','[class*="categoria"]',
    '[class*="breadcrumb"]','[class*="pagination"]','[class*="paginacion"]',
    '[id*="share"]','[id*="social"]','[id*="menu"]',
    '[id*="sidebar"]','[id*="comment"]','[id*="newsletter"]',
    '.compartir','.redes','.tags','.etiquetas','.relacionadas',
    '.mas-noticias','.otras-noticias','.notas-relacionadas',
    '.nota-relacionada','.te-puede-interesar','.lee-tambien'
  ];
  for (var b = 0; b < selectoresBasura.length; b++) {
    try {
      var elems = doc.querySelectorAll(selectoresBasura[b]);
      for (var e = 0; e < elems.length; e++) {
        if (elems[e].parentNode) elems[e].parentNode.removeChild(elems[e]);
      }
    } catch(ex) {}
  }

  // ── PASO 2: Selectores específicos por periódico + genéricos ──
  // OEM/El Sol de Irapuato, AM, Correo, Tinta Negra, genéricos
  // Detectar el periódico por URL para usar selectores precisos primero
  var urlDoc = (doc.location && doc.location.href) ? doc.location.href : '';
  // Buscar en links canonicos
  var canonical = doc.querySelector('link[rel="canonical"]');
  if (canonical) urlDoc = canonical.getAttribute('href') || urlDoc;
  var metaOg = doc.querySelector('meta[property="og:url"]');
  if (metaOg) urlDoc = metaOg.getAttribute('content') || urlDoc;

  var selectoresContenido = [];

  // ── Selectores por periódico (orden: más específico primero) ──
  if (urlDoc.indexOf('zonafranca.mx') >= 0) {
    // Zona Franca — WordPress con Newspaper theme
    selectoresContenido = [
      '.entry-content', '.td-post-content', '.post-content',
      'article .entry-content', '.tdb-block-inner p', '.td-pb-span8 .entry-content'
    ];
  } else if (urlDoc.indexOf('lasillarota.com') >= 0) {
    // La Silla Rota
    selectoresContenido = [
      '.nota-container', '.article-body', '.content-nota',
      '.nota-content', 'article .content', '.singular-content'
    ];
  } else if (urlDoc.indexOf('am.com.mx') >= 0) {
    // AM Guanajuato
    selectoresContenido = [
      '.news-single-content', '.news-content', '.nota-content',
      '.article-body', '.news-detail-text', 'article .text-content',
      '[class*="single-content"]', '[itemprop="articleBody"]'
    ];
  } else if (urlDoc.indexOf('oem.com.mx') >= 0 || urlDoc.indexOf('elsoldeirapuato') >= 0) {
    // El Sol de Irapuato / OEM — CMS propio con clases note-*
    selectoresContenido = [
      '.note-body',          // contenedor principal OEM
      '.note-paragraph',     // cada párrafo individual
      '.article-note-content',
      '.note-content',
      '.note-text',
      '[itemprop="articleBody"]',
      '.article-body-content',
      '.story-content',
      '.nota-cuerpo',
      '.nota-interior',
      'article .content',
      '.article-content'
    ];
  } else if (urlDoc.indexOf('periodicocorreo.com.mx') >= 0) {
    // Periodico Correo
    selectoresContenido = [
      '.entry-content', '.post-content', '.article-content',
      '.nota-content', '[itemprop="articleBody"]', 'article .content'
    ];
  } else if (urlDoc.indexOf('entintanegra.com') >= 0) {
    // Tinta Negra
    selectoresContenido = [
      '.entry-content', '.post-content', 'article .content'
    ];
  }

  // Siempre agregar selectores genéricos al final como fallback
  selectoresContenido = selectoresContenido.concat([
    '[itemprop="articleBody"]',
    '.note-paragraph','.note-body','.nota-cuerpo','.nota-interior',
    '.article-body-content','.story-content',
    '.news-content','.nota-content','.contenido-articulo',
    '.entry-content','.post-content','.td-post-content',
    '.single-content','.article-content',
    'article .content','article .body','article .texto','article .cuerpo',
    '[class*="article-body"]','[class*="nota-body"]',
    '[class*="article-content"]','[class*="nota-content"]',
    '[class*="story-body"]','[class*="content-body"]',
    '[class*="cuerpo-nota"]','[class*="texto-nota"]',
    '[class*="cuerpo"]','[class*="contenido"]',
    '.nota-detalle','.contenido-nota','.article-text',
    'article','main article','main .content',
    '#article-body','#nota-body','#content-body','#cuerpo',
    'main'
  ]);

  var mejor = '';
  for (var s = 0; s < selectoresContenido.length; s++) {
    try {
      var el = doc.querySelector(selectoresContenido[s]);
      if (el) {
        // Extraer párrafos del elemento para evitar capturar títulos relacionados
        // Para OEM: párrafos con clase note-paragraph además de <p>
        var pElems = el.querySelectorAll('p, .note-paragraph, [class*="paragraph"]');
        var txts = [];
        if (pElems.length >= 1) {
          for (var pi = 0; pi < pElems.length; pi++) {
            var tp = limpiarTexto(pElems[pi].textContent || '');
            if (tp.length > 40) txts.push(tp);
          }
        }
        var txt = txts.length >= 1 ? txts.join(' ') : limpiarTexto(el.textContent || '');
        if (txt.length > mejor.length && txt.length > 100) { mejor = txt; }
      }
    } catch(ex) {}
  }

  // ── PASO 3: Fallback heurístico — todos los <p> del documento ──
  if (mejor.length < 200) {
    var todosP = doc.querySelectorAll('p');
    var bloques = [];
    for (var p = 0; p < todosP.length; p++) {
      var tp2 = limpiarTexto(todosP[p].textContent || '');
      // Solo párrafos sustanciales (más de 60 chars, no títulos cortos)
      if (tp2.length > 60 && tp2.length < 1500) bloques.push(tp2);
    }
    // Tomar los primeros 15 párrafos como máximo
    if (bloques.length > 0) mejor = bloques.slice(0, 15).join(' ');
  }

  // ── PASO 4: Último recurso body ──
  if (mejor.length < 100) {
    mejor = limpiarTexto(doc.body ? (doc.body.textContent || '') : '');
  }

  // Devolver hasta 4000 chars (suficiente para Gemini, nota completa)
  return mejor.slice(0, 4000);
}

function limpiarTexto(txt) {
  return txt
    // Quitar patrones tipicos de basura periodistica
    .replace(/Facebook\s*X?\s*WhatsApp\s*Telegram\s*E-?Mail\s*Copiar\s*link[A-Za-z]*/gi, '')
    .replace(/Compartir\s*(en\s*)?(Facebook|Twitter|WhatsApp|Telegram|Email|Link)?/gi, '')
    .replace(/Suscr[íi]bete?\s*(al?\s*newsletter)?/gi, '')
    .replace(/Lee\s*tambi[eé]n[:\s]*/gi, '')
    .replace(/Te\s*puede\s*interesar[:\s]*/gi, '')
    .replace(/Relacionadas?[:\s]*/gi, '')
    .replace(/Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo/g, '')
    .replace(/enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/gi, function(m){ return m; })
    .replace(/\d{1,2}\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*de\s*\d{4}/gi, '')
    .replace(/Local\s*(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/gi, '')
    .replace(/[A-Z][a-z]+\s*,\s*\d{1,2}\s*de\s*[a-z]+\s*de\s*\d{4}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════

// ── Limpieza de texto pegado en ENTRADA MANUAL ──
function limpiarTextoManual() {
  var ta = document.getElementById('m-texto');
  if (!ta || !ta.value.trim()) { toast('Primero pega el texto', 'warn'); return; }
  var texto = ta.value;

  // Patrones a eliminar — publicidad, nav, timestamps, redes sociales
  var patrones = [
    // Metadatos de periódico al inicio
    /^[\s\S]{0,300}?(Lunes|Martes|Miercoles|Miércoles|Jueves|Viernes|Sábado|Sabado|Domingo),?\s+\d{1,2}\s+de\s+\w+/i,
    // Líneas cortas de nav/menú (menos de 35 chars)
  ];

  // Dividir en líneas y filtrar basura
  var lineas = texto.split('\n');
  var buenas = [];
  var buenas = [];
  var patronesLinea = [
    /^(inicio|home|noticias|política|policia|seguridad|local|estado|deportes|espectáculos|espectaculos|opinion|opinión|contacto|aviso de privacidad|términos|terminos|buscar|busca|suscri|subscribe|newsletter|compartir|share|twitter|facebook|instagram|whatsapp|telegram|copiar enlace|copy link|publicidad|anuncio|patrocinado|sponsored)\s*$/i,
    /^(leer más|lee también|lee mas|ver también|ver mas|también te puede interesar|relacionado|notas relacionadas)\s*$/i,
    /^\s*[-•·|]\s*$/,   // separadores sueltos
    /^\s*\d+\s*$/,      // solo números (contadores)
    /^https?:\/\//i,    // URLs sueltas
    /^@\w+$/,           // menciones sueltas
    /^\s*[#]\w+/,       // hashtags
  ];
  var contadorBasura = 0;
  for (var i = 0; i < lineas.length; i++) {
    var l = lineas[i].trim();
    // Línea muy corta que no es parte del texto
    if (l.length > 0 && l.length < 4) { contadorBasura++; continue; }
    var esBasura = false;
    for (var p = 0; p < patronesLinea.length; p++) {
      if (patronesLinea[p].test(l)) { esBasura = true; contadorBasura++; break; }
    }
    if (!esBasura) buenas.push(lineas[i]);
  }

  // Eliminar líneas vacías consecutivas (más de 2 seguidas)
  var resultado = [];
  var vacias = 0;
  for (var j = 0; j < buenas.length; j++) {
    if (buenas[j].trim() === '') {
      vacias++;
      if (vacias <= 1) resultado.push(buenas[j]);
    } else {
      vacias = 0;
      resultado.push(buenas[j]);
    }
  }

  var textoLimpio = resultado.join('\n').trim();
  ta.value = textoLimpio;

  var palabras = textoLimpio.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
  var statsEl = document.getElementById('m-texto-stats');
  if (statsEl) statsEl.textContent = palabras + ' palabras · ' + textoLimpio.length + ' caracteres' + (contadorBasura > 0 ? ' · ' + contadorBasura + ' líneas de basura eliminadas' : '');
  if (contadorBasura > 0) toast(contadorBasura + ' líneas de publicidad/menú eliminadas', 'ok');
  else toast('Texto ya limpio (' + palabras + ' palabras)', 'ok');
}

window.limpiarTextoManual = limpiarTextoManual;

// Limpiar texto pegado en una tarjeta RSS individual
function limpiarTextoCard(id) {
  var ta = document.getElementById(id + '-texto-manual');
  if (!ta || !ta.value.trim()) { toast('Primero pega el texto en la tarjeta', 'warn'); return; }
  var texto = ta.value;
  var lineas = texto.split('\n');
  var buenas = [];
  var patronesLinea = [
    /^(inicio|home|noticias|pol[ií]tica|policia|seguridad|local|estado|deportes|espect[aá]culos|opinion|opinión|contacto|aviso de privacidad|t[eé]rminos|buscar|suscri|subscribe|newsletter|compartir|share|twitter|facebook|instagram|whatsapp|telegram|copiar enlace|copy link|publicidad|anuncio|patrocinado|sponsored)\s*$/i,
    /^(leer m[aá]s|lee tambi[eé]n|ver tambi[eé]n|tambi[eé]n te puede interesar|relacionado|notas relacionadas)\s*$/i,
    /^\s*[-•·|]\s*$/,
    /^\s*\d+\s*$/,
    /^https?:\/\//i,
    /^@\w+$/,
    /^\s*[#]\w+/,
  ];
  var contadorBasura = 0;
  for (var i = 0; i < lineas.length; i++) {
    var l = lineas[i].trim();
    if (l.length > 0 && l.length < 4) { contadorBasura++; continue; }
    var esBasura = false;
    for (var p = 0; p < patronesLinea.length; p++) {
      if (patronesLinea[p].test(l)) { esBasura = true; contadorBasura++; break; }
    }
    if (!esBasura) buenas.push(lineas[i]);
  }
  var resultado = [];
  var vacias = 0;
  for (var j = 0; j < buenas.length; j++) {
    if (buenas[j].trim() === '') {
      vacias++;
      if (vacias <= 1) resultado.push(buenas[j]);
    } else {
      vacias = 0;
      resultado.push(buenas[j]);
    }
  }
  var textoLimpio = resultado.join('\n').trim();
  ta.value = textoLimpio;
  var palabras = textoLimpio.split(/\s+/).filter(function(w){ return w.length > 0; }).length;
  var statsEl = document.getElementById(id + '-txt-stats');
  if (statsEl) statsEl.textContent = palabras + ' palabras' + (contadorBasura > 0 ? ' · ' + contadorBasura + ' líneas eliminadas' : '');
  if (contadorBasura > 0) toast(contadorBasura + ' líneas de basura eliminadas', 'ok');
  else toast('Texto ya limpio (' + palabras + ' palabras)', 'ok');
}
window.limpiarTextoCard = limpiarTextoCard;

function actualizarStatsCard(id) {
  var ta = document.getElementById(id + '-texto-manual');
  var statsEl = document.getElementById(id + '-txt-stats');
  if (!ta || !statsEl) return;
  var v = ta.value.trim();
  if (!v) { statsEl.textContent = ''; return; }
  var palabras = v.split(/\s+/).filter(function(w){ return w.length > 0; }).length;
  statsEl.textContent = palabras + ' palabras · ' + v.length + ' chars';
}
window.actualizarStatsCard = actualizarStatsCard;

// Contador de palabras en tiempo real para el textarea manual
function actualizarStatsManual() {
  var ta = document.getElementById('m-texto');
  var statsEl = document.getElementById('m-texto-stats');
  if (!ta || !statsEl) return;
  var v = ta.value.trim();
  if (!v) { statsEl.textContent = ''; return; }
  var palabras = v.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
  statsEl.textContent = palabras + ' palabras · ' + v.length + ' caracteres';
}
window.actualizarStatsManual = actualizarStatsManual;

// ENTRADA MANUAL
// ═══════════════════════════════════════════════════════════════
function selFuente(el, nombre) {
  fuenteManual = nombre;
  var opts = document.querySelectorAll('.fuente-opt');
  for (var i = 0; i < opts.length; i++) opts[i].classList.remove('sel');
  el.classList.add('sel');
}
window.selFuente = selFuente;

function analizarManual() {
  var texto = document.getElementById('m-texto').value.trim();
  if (!texto) { toast('Pega el texto de la noticia primero', 'err'); return; }

  var btn = document.getElementById('btn-analizar');
  btn.disabled = true;
  btn.textContent = '⏳ ANALIZANDO...';

  var url = document.getElementById('m-url').value.trim();

  llamarIA(buildPrompt(texto), function(r, err) {
    btn.disabled = false;
    btn.textContent = '🤖 ANALIZAR CON IA →';
    if (!r) {
      r = clasificarLocal(texto);
      toast('IA no disponible — clasificación local', 'warn');
    }

    var id = 'manual-' + (++cardCounter);
    var contenedor = document.getElementById('resultado-manual');

    var card = document.createElement('div');
    card.className = 'noticia-card';
    card.id = id;
    // Prioridad: campo manual > IA
    var coordInput = document.getElementById(id + '-coords');
    var manualLat = null, manualLng = null;
    if (coordInput && coordInput.value.trim()) {
      var cp = coordInput.value.split(',');
      if (cp.length === 2) { manualLat = parseFloat(cp[0]); manualLng = parseFloat(cp[1]); }
    }
    card.dataset.url = url || '';
    card.dataset.lat = (manualLat && !isNaN(manualLat)) ? manualLat : (r.lat || 20.6795);
    card.dataset.lng = (manualLng && !isNaN(manualLng)) ? manualLng : (r.lng || -101.3540);
    card.dataset.colonia = r.colonia || '';
    card.dataset.confianza = r.confianza || 'baja';
    card.style.marginTop = '10px';

    card.innerHTML =
      '<div class="nc-header">' +
        '<span class="nc-tipo ' + (r.tipo||'rumor') + '">' + (r.tipo||'rumor').toUpperCase() + '</span>' +
        '<div class="nc-titulo">' + (r.titulo||texto.slice(0,80)) + '</div>' +
      '</div>' +
      '<div class="nc-meta">' +
        '<span class="nc-fuente">' + fuenteManual + '</span>' +
        '<span class="nc-lugar">📍 ' + (r.lugar||'') + '</span>' +
        '<span class="nc-conf-' + (r.confianza||'baja') + '">▲ ' + (r.confianza||'baja').toUpperCase() + '</span>' +
      '</div>' +
      '<div class="nc-resumen">' + (r.resumen||texto.slice(0,300)) + '</div>' +
      '<div class="nc-edit visible">' +
        '<div class="nc-campo"><div class="nc-label">TÍTULO</div><input class="nc-input" id="' + id + '-tit" value="' + (r.titulo||'').replace(/"/g,'') + '"></div>' +
        '<div class="nc-campo"><div class="nc-label">TIPO</div>' +
          '<select class="nc-select" id="' + id + '-tipo">' +
            '<option value="seguridad"' + (r.tipo==='seguridad'?' selected':'') + '>Seguridad</option>' +
            '<option value="accidente"' + (r.tipo==='accidente'?' selected':'') + '>Accidente</option>' +
            '<option value="evento"' + (r.tipo==='evento'?' selected':'') + '>Evento</option>' +
            '<option value="rumor"' + (r.tipo==='rumor'||!r.tipo?' selected':'') + '>Rumor</option>' +
            '<option value="desaparecido"' + (r.tipo==='desaparecido'?' selected':'') + '>Desaparecido</option>' +
            '<option value="gobierno"' + (r.tipo==='gobierno'?' selected':'') + '>Gobierno</option>' +
            '<option value="politica"' + (r.tipo==='politica'?' selected':'') + '>Política</option>' +
            '<option value="salud"' + (r.tipo==='salud'?' selected':'') + '>Salud</option>' +
            '<option value="transporte"' + (r.tipo==='transporte'?' selected':'') + '>Transporte/Vialidad</option>' +
          '</select>' +
        '</div>' +
        '<div class="nc-campo"><div class="nc-label">LUGAR</div><input class="nc-input" id="' + id + '-lug" value="' + (r.lugar||'Irapuato').replace(/"/g,'') + '"></div>' +
        '<div class="nc-campo"><div class="nc-label">RESUMEN</div><textarea class="nc-input" id="' + id + '-sum" style="min-height:60px;resize:vertical;">' + (r.resumen||'').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</textarea></div>' +
      '</div>' +
      '<div class="nc-acciones">' +
        '<button class="btn-aprobar" onclick="aprobarCard(\'' + id + '\',\'' + fuenteManual + '\',\'' + url + '\')">✓ APROBAR Y GUARDAR</button>' +
        '<button class="btn-descartar" onclick="descartarCard(\'' + id + '\')">✕ DESCARTAR</button>' +
      '</div>';

    contenedor.innerHTML = '';
    contenedor.appendChild(card);
    toast('✓ Análisis completo — revisa y aprueba', 'ok');
  });
}

// ── VER TEXTO COMPLETO — para verificar qué extrae el scraper antes de analizar ──
function verTextoCompleto(id) {
  var card = document.getElementById(id);
  if (!card) return;
  var link = card.dataset.link || '';
  var textoActual = card.dataset.texto || '';

  var modal = document.getElementById('modal-texto-debug');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-texto-debug';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = '<div style="background:#0d1b2a;border:1px solid #1a3a5a;border-radius:6px;width:90vw;max-width:700px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #1a3a5a;">' +
        '<span style="font-family:var(--title);font-size:8px;letter-spacing:1px;color:#00ccff;">📄 TEXTO EXTRAÍDO DEL ARTÍCULO</span>' +
        '<button onclick="document.getElementById(\'modal-texto-debug\').remove()" style="background:none;border:1px solid #ff2255;color:#ff2255;padding:2px 8px;cursor:pointer;font-size:8px;border-radius:3px;">X CERRAR</button>' +
      '</div>' +
      '<div id="debug-texto-status" style="padding:6px 14px;font-family:var(--mono);font-size:8px;color:#3a7ab8;border-bottom:1px solid #0d2040;"></div>' +
      '<div id="debug-texto-body" style="padding:12px 14px;overflow-y:auto;font-family:var(--mono);font-size:8px;line-height:1.6;color:#c8d8e8;white-space:pre-wrap;flex:1;"></div>' +
      '<div style="padding:8px 14px;border-top:1px solid #0d2040;display:flex;gap:6px;">' +
        '<button id="debug-btn-usar" style="flex:1;padding:6px;background:rgba(0,255,136,.1);color:#00ff88;border:1px solid #00ff88;font-family:var(--title);font-size:7px;cursor:pointer;border-radius:3px;">✓ USAR ESTE TEXTO Y ANALIZAR</button>' +
      '</div>' +
    '</div>';
    modal.onclick = function(e) { if (e.target === modal) { modal.remove(); } };
    document.body.appendChild(modal);
  }

  var statusEl = document.getElementById('debug-texto-status');
  var bodyEl = document.getElementById('debug-texto-body');
  var btnUsar = document.getElementById('debug-btn-usar');

  // Mostrar texto actual mientras carga
  if (textoActual && textoActual.length > 50) {
    statusEl.textContent = 'Texto en caché (' + textoActual.length + ' chars). Recargando del artículo...';
    bodyEl.textContent = textoActual;
  } else {
    statusEl.textContent = '⏳ Obteniendo texto del artículo...';
    bodyEl.textContent = '';
  }

  btnUsar.onclick = function() {
    var textoFinal = bodyEl.textContent;
    if (card && textoFinal) card.dataset.texto = textoFinal;
    modal.remove();
    analizarConIA(id, textoFinal, card.dataset.fuente || '', link);
  };

  if (!link) {
    statusEl.textContent = '⚠ Esta tarjeta no tiene URL de artículo';
    return;
  }

  fetchContenidoArticulo(link, function(texto) {
    if (texto && texto.length > 80) {
      if (card) card.dataset.texto = texto;
      statusEl.textContent = '✅ Texto extraído: ' + texto.length + ' chars · ' + texto.split(' ').length + ' palabras · fuente: ' + (link.split('/')[2] || '');
      bodyEl.textContent = texto;
    } else {
      statusEl.textContent = '⚠ No se pudo extraer texto limpio. Revisa el selector CSS para este periódico.';
      bodyEl.textContent = textoActual || '(sin texto disponible)';
    }
  });
}
window.verTextoCompleto = verTextoCompleto;
