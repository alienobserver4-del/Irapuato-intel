// ═══════════════════════════════════════════════════════════════
// GEMINI
// ═══════════════════════════════════════════════════════════════
function llamarGemini(prompt, callback) {
  // Intenta Gemini primero. Si falla, usa OpenRouter (gratis con registro)
  var pool = (window._appGeminiKeys && window._appGeminiKeys.length) ? window._appGeminiKeys : GEMINI_KEYS;
  var orKey = window._openRouterKey || (typeof OPENROUTER_KEY !== 'undefined' ? OPENROUTER_KEY : '');

  // Si no hay keys de Gemini, ir directo a OpenRouter
  if (!pool || pool.length === 0) {
    if (orKey) { llamarOpenRouter(prompt, orKey, callback); return; }
    toast('⚠ Agrega una API Key — toca 🤖 en el header', 'err');
    callback(null, 'sin keys');
    return;
  }

  var modelos = ['gemini-2.0-flash-lite', 'gemini-1.5-flash-latest'];
  var keyIdx = _geminiKeyIdx % pool.length;
  var modelIdx = 0;
  var intentos = 0;
  var maxRondas = pool.length * modelos.length;

  function siguiente() {
    if (intentos++ > maxRondas) {
      // Gemini agotado — ir a OpenRouter si está configurado
      var orK = window._openRouterKey || '';
      if (orK) {
        console.log('[IA] Gemini agotado — usando OpenRouter');
        var statusEl2 = document.getElementById('gemini-status');
        if (statusEl2) { statusEl2.textContent = '🔀 OpenRouter'; statusEl2.style.color = '#ff8800'; }
        llamarOpenRouter(prompt, orK, callback);
      } else {
        console.log('[IA] Sin IA disponible — clasificación local');
        callback(null, 'agotado');
      }
      return;
    }

    var key = pool[keyIdx % pool.length];
    var modelo = modelos[modelIdx % modelos.length];
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + key;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.05, maxOutputTokens: 800 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    })
    .then(function(res) {
      var status = res.status;
      return res.json().then(function(data) {
        if (status === 200) {
          var cand = data.candidates && data.candidates[0];
          if (!cand) { modelIdx++; siguiente(); return; }
          var txt = cand.content && cand.content.parts && cand.content.parts[0] && cand.content.parts[0].text;
          if (!txt) { modelIdx++; siguiente(); return; }
          var match = txt.match(/\{[\s\S]*\}/);
          if (!match) { modelIdx++; siguiente(); return; }
          try {
            var r = JSON.parse(match[0]);
            console.log('[Gemini] OK — ' + modelo + ' key' + (keyIdx % pool.length + 1));
            _geminiKeyIdx = keyIdx % pool.length;
            if (typeof actualizarStatusGemini === 'function') actualizarStatusGemini();
            callback(r, null);
          } catch(e) { modelIdx++; siguiente(); }

        } else if (status === 429) {
          var msg = (data.error && data.error.message) || '';
          var retryMatch = msg.match(/retry in ([0-9.]+)s/i);
          var waitMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500 : 15000;
          var segs = Math.ceil(waitMs / 1000);
          // Marcar esta key como en rate-limit temporalmente
          marcarKeyAgotada(pool[keyIdx % pool.length]);
          keyIdx++;
          var keysRestantes = 0;
          for (var ki = 0; ki < pool.length; ki++) {
            if (!_geminiKeyAgotadas[ki]) keysRestantes++;
          }
          if (keysRestantes > 0) {
            // Todavía hay keys disponibles — rotar sin esperar
            console.log('[Gemini] 429 key' + ((keyIdx-1) % pool.length + 1) + ' → rotando a key' + (keyIdx % pool.length + 1));
            setTimeout(siguiente, 300);
          } else {
            // Todas en rate-limit — esperar y luego reintentar
            console.warn('[Gemini] Todas las keys en rate limit — esperando ' + segs + 's');
            var statusEl5 = document.getElementById('gemini-status');
            if (statusEl5) {
              var t0c = Date.now();
              var cdc = setInterval(function() {
                var rem = segs - Math.floor((Date.now()-t0c)/1000);
                if (rem <= 0) {
                  clearInterval(cdc);
                  // Limpiar agotadas para reintentar
                  _geminiKeyAgotadas = {};
                  keyIdx = 0;
                  if (typeof actualizarStatusGemini === 'function') actualizarStatusGemini();
                  return;
                }
                statusEl5.textContent = '⏳ Gemini ' + rem + 's';
                statusEl5.style.color = '#ffcc00';
              }, 500);
            }
            setTimeout(function() {
              _geminiKeyAgotadas = {};
              keyIdx = 0;
              siguiente();
            }, waitMs);
          }

        } else if (status === 404) {
          modelIdx++;
          siguiente();

        } else if (status === 403) {
          var msg2 = (data.error && data.error.message) || '';
          console.warn('[Gemini] 403 key' + (keyIdx % pool.length + 1) + ': ' + msg2.slice(0,60));
          keyIdx++;
          siguiente();

        } else {
          modelIdx++;
          siguiente();
        }
      });
    })
    .catch(function() { modelIdx++; siguiente(); });
  }
  siguiente();
}

// ── OpenRouter — pool de keys × modelos ──
// Estrategia: para cada combinación (modelo, key), si da 429 cambia de MODELO primero.
// Si todos los modelos con esa key dan 429, rota a la siguiente KEY.
// Así evitamos el loop donde todas las keys fallan en el mismo modelo.

var _orModelosAgotados = {}; // modelo → true si dio 429 en esta sesión
window._orModelosAgotados = _orModelosAgotados; // expuesto para reset desde llamarIA

function llamarOpenRouterPool(prompt, callback, onAgotado) {
  var pool = (window._appORKeys && window._appORKeys.length) ? window._appORKeys : OPENROUTER_KEYS;
  if (!pool || pool.length === 0) { onAgotado && onAgotado(); return; }

  // Lista de modelos free verificada — marzo 2026
  // openrouter/free = router automático de OR que elige el mejor disponible
  var modelos = [
    'openrouter/free',                                // Router automático — primer intento siempre
    'meta-llama/llama-3.3-70b-instruct:free',         // Llama 3.3 70B
    'mistralai/mistral-small-3.1-24b-instruct:free',  // Mistral Small 3.1
    'nousresearch/hermes-3-llama-3.1-405b:free',      // Hermes 3 405B
    'openai/gpt-oss-20b:free',                        // GPT OSS 20B
    'meta-llama/llama-3.2-3b-instruct:free',          // Llama 3.2 3B
    'google/gemma-3-27b-it:free',                     // Gemma 3 27B
    'google/gemma-3-12b-it:free',                     // Gemma 3 12B
    'google/gemma-3-4b-it:free'                       // Gemma 3 4B
  ];

  // Modelos que NO soportan system role (requieren todo en user)
  var sinSystemRole = ['gemma'];
  // Modelos que NO soportan response_format json_object
  var sinJsonFormat = ['gemma', 'hermes', 'llama-3.2-3b', 'gpt-oss', 'openrouter/free'];

  var statusEl = document.getElementById('gemini-status');

  // Estado de intentos: recorre keys×modelos en orden lógico
  // Estrategia: primero probar openrouter/free con TODAS las keys antes de pasar a modelos fijos
  var secuencia = [];
  modelos.forEach(function(m) {
    pool.forEach(function(k, ki) {
      // Para openrouter/free probar todas las keys primero
      secuencia.push({ modelo: m, keyIdx: ki });
    });
  });

  var intentoIdx = 0;
  var errores404Permanentes = {}; // modelos con 404 nunca se recuperan → saltar siempre

  function siguiente() {
    // Saltar entradas con 404 permanente
    while (intentoIdx < secuencia.length && errores404Permanentes[secuencia[intentoIdx].modelo]) {
      intentoIdx++;
    }
    if (intentoIdx >= secuencia.length) {
      console.warn('[OpenRouter] Todos los intentos agotados');
      if (statusEl) { statusEl.textContent = '⚠ OR agotado'; statusEl.style.color = '#ff4466'; }
      onAgotado && onAgotado();
      return;
    }

    var item    = secuencia[intentoIdx];
    var key     = pool[item.keyIdx];
    var modelo  = item.modelo;
    var nombreCorto = (modelo.split('/')[1] || modelo).split(':')[0].slice(0, 16);
    if (statusEl) { statusEl.textContent = '🔀 ' + nombreCorto; statusEl.style.color = '#ff8800'; }

    var sysPrompt = 'Eres un extractor de datos de noticias locales de Irapuato, Mexico. Respondes UNICAMENTE con JSON valido, sin texto adicional ni markdown.';
    var promptCorto = prompt.length > 6000 ? prompt.slice(0, 6000) + '\n\nJSON:' : prompt;

    // Adaptar messages según soporte de system role
    var esModSinSys = sinSystemRole.some(function(s) { return modelo.indexOf(s) !== -1; });
    var messages = esModSinSys
      ? [{ role: 'user', content: sysPrompt + '\n\n' + promptCorto }]
      : [{ role: 'system', content: sysPrompt }, { role: 'user', content: promptCorto }];

    // Adaptar body según soporte de response_format
    var esModSinJson = sinJsonFormat.some(function(s) { return modelo.indexOf(s) !== -1; });
    var body = {
      model: modelo,
      messages: messages,
      max_tokens: 800,
      temperature: 0.05
    };
    if (!esModSinJson) {
      body.response_format = { type: 'json_object' };
    }

    console.log('[OpenRouter] Intentando ' + modelo + ' key' + (item.keyIdx+1));

    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'HTTP-Referer': 'https://alienobserver4-del.github.io',
        'X-Title': 'Irapuato Intel'
      },
      body: JSON.stringify(body)
    })
    .then(function(res) { return res.json().then(function(d) { return { status: res.status, data: d }; }); })
    .then(function(rd) {

      if (rd.status === 429) {
        // Rate limit — este modelo+key está saturado, saltar a siguiente
        console.log('[OpenRouter] 429 — ' + nombreCorto + ' key' + (item.keyIdx+1) + ' → siguiente');
        intentoIdx++;
        setTimeout(siguiente, 200);
        return;
      }

      if (rd.status === 404) {
        // Modelo no existe en free — marcarlo permanente para no reintentar nunca
        var errMsg = (rd.data && rd.data.error && rd.data.error.message) ? rd.data.error.message.slice(0,60) : '404';
        console.warn('[OpenRouter] 404 permanente — ' + modelo + ': ' + errMsg);
        errores404Permanentes[modelo] = true;
        intentoIdx++;
        siguiente();
        return;
      }

      if (rd.status === 400) {
        var errMsg = (rd.data && rd.data.error && rd.data.error.message) ? rd.data.error.message.slice(0,80) : 'bad request';
        console.warn('[OpenRouter] 400 — ' + nombreCorto + ': ' + errMsg);
        // Si el error menciona response_format, reintentar sin él
        if (errMsg.indexOf('response_format') !== -1 || errMsg.indexOf('json') !== -1) {
          console.log('[OpenRouter] Reintentando ' + nombreCorto + ' sin response_format');
          delete body.response_format;
          fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + key,
              'HTTP-Referer': 'https://alienobserver4-del.github.io',
              'X-Title': 'Irapuato Intel'
            },
            body: JSON.stringify(body)
          })
          .then(function(r2) { return r2.json().then(function(d2) { return { status: r2.status, data: d2 }; }); })
          .then(function(rd2) {
            if (rd2.status === 200) {
              procesarRespuesta(rd2, modelo, item.keyIdx);
            } else {
              intentoIdx++; siguiente();
            }
          }).catch(function() { intentoIdx++; siguiente(); });
          return;
        }
        intentoIdx++;
        siguiente();
        return;
      }

      if (rd.status === 401 || rd.status === 403) {
        console.warn('[OpenRouter] Key' + (item.keyIdx+1) + ' inválida (' + rd.status + ')');
        // Saltar todas las entradas de esta key
        intentoIdx++;
        while (intentoIdx < secuencia.length && secuencia[intentoIdx].keyIdx === item.keyIdx) intentoIdx++;
        siguiente();
        return;
      }

      if (rd.status !== 200) {
        var e = (rd.data && rd.data.error && rd.data.error.message) ? rd.data.error.message.slice(0,60) : '';
        console.warn('[OpenRouter] ' + rd.status + ' — ' + nombreCorto + (e ? ': '+e : ''));
        intentoIdx++;
        siguiente();
        return;
      }

      procesarRespuesta(rd, modelo, item.keyIdx);
    })
    .catch(function(err) {
      console.warn('[OpenRouter] fetch error — ' + nombreCorto + ':', err);
      intentoIdx++;
      setTimeout(siguiente, 500);
    });
  }

  function procesarRespuesta(rd, modelo, keyIdx) {
    var txt = rd.data.choices && rd.data.choices[0] && rd.data.choices[0].message && rd.data.choices[0].message.content;
    if (!txt) {
      console.warn('[OpenRouter] Respuesta vacía — ' + modelo);
      intentoIdx++; siguiente(); return;
    }
    // Extraer JSON de la respuesta
    var match = txt.match(/```json\s*([\s\S]*?)```/) || txt.match(/```([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\})/);
    if (!match) {
      console.warn('[OpenRouter] Sin JSON en ' + modelo + ' — texto: ' + txt.slice(0,100));
      intentoIdx++; siguiente(); return;
    }
    var jsonStr = match[1] || match[0];
    try {
      var r = JSON.parse(jsonStr.trim());
      var modeloReal  = (rd.data.model || modelo);
      var modeloCorto = (modeloReal.split('/')[1] || modeloReal).split(':')[0].slice(0, 18);
      console.log('[OpenRouter] ✓ OK — ' + modeloReal + ' key' + (keyIdx+1));
      window._orKeyIdx = keyIdx;
      if (statusEl) { statusEl.textContent = '🤖 ' + modeloCorto; statusEl.style.color = '#00ff88'; }
      callback(r, null);
    } catch(e) {
      console.warn('[OpenRouter] JSON inválido en ' + modelo + ' — ' + jsonStr.slice(0,80));
      intentoIdx++; siguiente();
    }
  }

  siguiente();
}
window.llamarOpenRouterPool = llamarOpenRouterPool;

// Wrapper para compatibilidad con llamadas directas
function llamarOpenRouter(prompt, apiKey, callback) {
  window._appORKeys = [apiKey];
  llamarOpenRouterPool(prompt, callback, function() { callback(null, 'agotado'); });
}
window.llamarOpenRouter = llamarOpenRouter;


// ── Función central de IA — OpenRouter primero, Gemini como fallback ──
function llamarIA(prompt, callback) {
  var orPool = (window._appORKeys && window._appORKeys.length) ? window._appORKeys : OPENROUTER_KEYS;
  var gPool  = (window._appGeminiKeys && window._appGeminiKeys.length) ? window._appGeminiKeys : GEMINI_KEYS;

  if (orPool && orPool.length > 0) {
    // OpenRouter es el motor principal
    // Si todos los modelos+keys dan 429 simultáneamente (rate limit), esperar 60s y reintentar 1 vez
    // antes de caer a Gemini (que es inferior para extracción de JSON)
    var reintentos = 0;
    var maxReintentos = 1;

    function intentarOR() {
      llamarOpenRouterPool(prompt, callback, function() {
        if (reintentos < maxReintentos) {
          reintentos++;
          var statusEl = document.getElementById('gemini-status');
          var segs = 60;
          console.warn('[IA] OR rate-limit — esperando ' + segs + 's antes de reintentar');
          if (statusEl) {
            var t0 = Date.now();
            var cd = setInterval(function() {
              var rem = segs - Math.floor((Date.now() - t0) / 1000);
              if (rem <= 0) { clearInterval(cd); return; }
              statusEl.textContent = '⏳ OR espera ' + rem + 's';
              statusEl.style.color = '#ff8800';
            }, 1000);
          }
          setTimeout(intentarOR, segs * 1000);
        } else {
          // Usar Gemini como último recurso
          if (gPool && gPool.length > 0) {
            console.warn('[IA] OR agotado — usando Gemini como último recurso');
            var statusEl2 = document.getElementById('gemini-status');
            if (statusEl2) { statusEl2.textContent = '⚠ Gemini (último recurso)'; statusEl2.style.color = '#ffcc00'; }
            llamarGemini(prompt, callback);
          } else {
            callback(null, 'sin IA disponible — revisa tus keys en 🤖');
          }
        }
      });
    }

    intentarOR();

  } else if (gPool && gPool.length > 0) {
    console.log('[IA] Sin OR configurado — usando Gemini');
    llamarGemini(prompt, callback);
  } else {
    callback(null, 'sin keys configuradas — abre 🤖 para agregar');
  }
}
window.llamarIA = llamarIA;

function clasificarLocal(txt) {
  var t = txt.toLowerCase();
  var tipo = 'rumor';
  var seg = ['bala','disparo','herido','fallecio','homicid','asesinat','ejecut','asalto','robo','secuestr','narcot','cartel','detenido','captura','asesin','muerto','cadaver','armado','balacera'];
  var acc = ['accidente','choque','volcadura','atropell','colision','incendio','explosion','derrumbe'];
  var eve = ['festival','feria','concierto','evento','ceremonia','inauguracion','aniversario','celebracion'];
  var desp = ['desaparecido','desaparecida','se busca','extraviado','extraviada','paradero'];
  var gob = ['municipio','alcalde','presidente municipal','obra publica','programa','ayuntamiento','secretaria de'];
  var pol = ['eleccion','candidato','partido','votacion','campaña','diputado','senador','congreso','ine','proceso electoral','participacion ciudadana','plebiscito','referendum'];
  var sal = ['hospital','clinica','imss','issste','salud','enfermedad','brote','vacuna'];
  var trans = ['transporte publico','camion urbano','vialidad','cierre vial','bache','pavimento','semaforo'];
  var amb = ['contaminacion','rio turbio','residuos','basura ilegal','deforestacion','tala','medio ambiente','ecologia','inundacion','sequía','fauna','flora'];
  var cor = ['corrupcion','desvio','malversacion','soborno','mordida','abuso de cargo','enriquecimiento','cohecho','peculado','fraude municipal'];
  var co = ['cartel','crimen organizado','celula delictiva','plaza','extorsion','piso','huachicol','combustible robado','narco','cjng','sinaloa'];
  for (var i = 0; i < desp.length; i++) { if (t.indexOf(desp[i]) >= 0) { tipo = 'desaparecido'; break; } }
  if (tipo==='rumor') { for (var i = 0; i < co.length; i++) { if (t.indexOf(co[i]) >= 0) { tipo = 'crimen_organizado'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < seg.length; i++) { if (t.indexOf(seg[i]) >= 0) { tipo = 'seguridad'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < acc.length; i++) { if (t.indexOf(acc[i]) >= 0) { tipo = 'accidente'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < eve.length; i++) { if (t.indexOf(eve[i]) >= 0) { tipo = 'evento'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < gob.length; i++) { if (t.indexOf(gob[i]) >= 0) { tipo = 'gobierno'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < pol.length; i++) { if (t.indexOf(pol[i]) >= 0) { tipo = 'politica'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < sal.length; i++) { if (t.indexOf(sal[i]) >= 0) { tipo = 'salud'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < trans.length; i++) { if (t.indexOf(trans[i]) >= 0) { tipo = 'transporte'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < amb.length; i++) { if (t.indexOf(amb[i]) >= 0) { tipo = 'ambiental'; break; } } }
  if (tipo==='rumor') { for (var i = 0; i < cor.length; i++) { if (t.indexOf(cor[i]) >= 0) { tipo = 'corrupcion'; break; } } }
    var partes = txt.split('.');
  var titulo = (partes[0] || txt).trim().slice(0, 80);
  return { titulo: titulo, tipo: tipo, calle1: '', calle2: '', colonia: '', comunidad: '', nombres: '', resumen: txt.slice(0, 300), lat: 20.6795, lng: -101.3540, confianza: 'baja' };
}

function obtenerPromptBase() {
  // Devuelve el sistema prompt para mostrarlo en el panel de aprendizaje
  return buildPrompt('[TEXTO DE EJEMPLO]');
}
window.obtenerPromptBase = obtenerPromptBase;

// Reglas de aprendizaje cargadas desde Firebase (se aplican al prompt en tiempo real)
var _promptRules = []; // [{campo, regla, veces, fecha}]
var _promptRulesLoaded = false;
var UMBRAL_APRENDIZAJE = 10; // correcciones antes de auto-ajustar prompt

function cargarReglasPrompt(callback) {
  if (!db) { if (callback) callback(); return; }
  db.collection('config').doc('prompt-rules').get()
    .then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        _promptRules = Array.isArray(data.rules) ? data.rules : [];
        _promptRulesLoaded = true;
        console.log('[Prompt] ' + _promptRules.length + ' reglas de aprendizaje cargadas');
      }
      if (callback) callback();
    })
    .catch(function(e) { console.warn('[Prompt] Error cargando reglas:', e.message); if (callback) callback(); });
}
window.cargarReglasPrompt = cargarReglasPrompt;

function guardarReglasPrompt(rules) {
  if (!db) return;
  db.collection('config').doc('prompt-rules').set({ rules: rules, updatedAt: new Date().toISOString() })
    .then(function() { console.log('[Prompt] Reglas guardadas en Firebase ✓'); })
    .catch(function(e) { console.warn('[Prompt] Error guardando reglas:', e.message); });
}

// Hook para pasar coordenadas al prompt de IA
function iaSetGeoContext(lat, lng) {
  window._iaGeoLat = lat;
  window._iaGeoLng = lng;
  // Pre-cargar datos geo si no están listos
  if (typeof geoCargar === 'function' && !(window.GEO && window.GEO.loaded)) {
    geoCargar(function() {});
  }
}
window.iaSetGeoContext = iaSetGeoContext;

function buildPrompt(texto) {
  var frag = texto.slice(0, 3000);
  var p = 'Eres extractor de datos estructurados de noticias locales de Irapuato, Guanajuato, Mexico.\n';
  p += 'Responde UNICAMENTE con el objeto JSON valido. Sin texto antes, sin texto despues, sin markdown.\n\n';
  p += 'EJEMPLOS (aprende el patron):\n\n';
  p += 'TEXTO: "Reportan herido tras ataque armado en la colonia El Cantador de Irapuato. El hecho ocurrio la tarde del jueves."\n';
  p += 'JSON: {"titulo":"Herido tras ataque armado en colonia El Cantador","tipo":"seguridad","calle1":"","calle2":"","colonia":"El Cantador","comunidad":"","nombres":"","resumen":"Un hombre resulto herido en un ataque armado en la colonia El Cantador. El hecho ocurrio en la tarde del jueves.","fecha_evento":"","tiempo_dia":"tarde","lat":20.68,"lng":-101.35,"confianza":"media"}\n\n';
  p += 'TEXTO: "Una camioneta volco en la carretera Irapuato-Leon a la altura del ITESI. Aproximadamente a las 9:15 de la manana de este viernes."\n';
  p += 'JSON: {"titulo":"Camioneta vuelca en carretera Irapuato-Leon frente a ITESI","tipo":"accidente","calle1":"Carretera Irapuato-Leon","calle2":"Altura del ITESI","colonia":"","comunidad":"","nombres":"","resumen":"Una camioneta volco en la carretera Irapuato-Leon a la altura del ITESI el viernes por la manana.","fecha_evento":"","tiempo_dia":"manana","lat":20.68,"lng":-101.41,"confianza":"alta"}\n\n';
  p += 'TEXTO: "Refuerzan formacion policial. El director Andres Clemente Carrillo Marrot destaco los beneficios otorgados en la Academia de Seguridad Publica."\n';
  p += 'JSON: {"titulo":"Refuerzan formacion policial con becas y prestaciones","tipo":"gobierno","calle1":"","calle2":"","colonia":"","comunidad":"","nombres":"Andres Clemente Carrillo Marrot","resumen":"El director de la Academia de Seguridad, Andres Clemente Carrillo Marrot, destaco mejoras en la formacion policial con becas y salarios.","fecha_evento":"","tiempo_dia":"desconocido","lat":20.6795,"lng":-101.354,"confianza":"alta"}\n\n';
  p += 'REGLAS CRITICAS:\n';
  p += '1. colonia: Si el texto dice "colonia X", "col. X", "fraccionamiento X", "barrio X" => pon X en colonia. SIEMPRE.\n';
  p += '2. nombres: Extrae TODOS los nombres propios de personas mencionadas (funcionarios, victimas, testigos). Separados por coma.\n';
  p += '3. calle1: Cualquier via: calle, avenida, carretera, periferico, bulevar, camino, corredor. NUNCA vacio si hay referencia vial.\n';
  p += '4. calle2: Segunda via, esquina, cruce o referencia ("altura del hospital", "frente a la plaza").\n';
  p += '5. tiempo_dia: manana=6-12h o dice "manana". tarde=12-19h. noche=19-24h. madrugada=0-6h. desconocido=sin hora.\n';
  p += '6. tipo: seguridad=violencia/robos/disparos/agresiones. accidente=choques/volcaduras/caidas/incendios. gobierno=autoridades/obras municipales/programas. politica=elecciones/candidatos/partidos/diputados. crimen_organizado=carteles/extorsion/huachicol/celulas/plaza. corrupcion=desvio/soborno/malversacion/cohecho. ambiental=contaminacion/basura/rio turbio/inundacion/fauna. desaparecido=personas no localizadas. salud=brotes/clinicas/hospital. transporte=vialidad/cierre vial/camion.\n';
  p += '7. comunidad: rancho, ejido, comunidad rural (NO colonias urbanas).\n';
  p += '8. titulo: MAXIMO 80 caracteres. Es el TITULAR periodistico: corto, accionable, sin repetir detalles del resumen. INCORRECTO: "Localizan cuerpo en el Trebol del Libramiento Sur a metros del reten de la GN". CORRECTO: "Hallan cuerpo de mujer en Avenida Insurgentes". NUNCA empieces el titulo igual que el resumen.\n';
  p += '9. resumen: 2-3 oraciones. Comienza diferente al titulo. Amplifica detalles: donde exactamente, quienes intervinieron, que encontraron. Ej: "El cuerpo de una mujer fue localizado en un baldio de Av. Insurgentes, a la altura del Trebol del Libramiento Sur. Personal de la FGE inicio investigacion por huellas de violencia."\n';
  p += '10. TEXTO BASURA: Si el texto parece ser menu de navegacion, footer o publicidad (repite el nombre del sitio, dice "Aviso de Privacidad", "Contacto", "Siguenos", "Lo mas leido") => pon titulo="SIN CONTENIDO" y tipo="rumor".\n\n';
  p += 'TEXTO: "Zona Franca Zona Franca es un producto de Fabrica de Contenidos. Aviso de PrivacidadContacto Siguenos"\n';
  p += 'JSON: {"titulo":"SIN CONTENIDO","tipo":"rumor","calle1":"","calle2":"","colonia":"","comunidad":"","nombres":"","resumen":"El texto capturado no contiene una noticia valida.","fecha_evento":"","tiempo_dia":"desconocido","lat":20.6795,"lng":-101.354,"confianza":"baja"}\n\n';
  p += 'TEXTO: "Localizan cuerpo en el Trebol del Libramiento Sur. Irapuato, Gto. El cuerpo de una mujer sin vida fue localizado en la avenida Insurgentes, a la altura del Trebol del Libramiento Sur, a metros del reten de la Guardia Nacional, la tarde del martes 3 de marzo."\n';
  p += 'JSON: {"titulo":"Hallan cuerpo de mujer con huellas de violencia en Av. Insurgentes","tipo":"seguridad","calle1":"Avenida Insurgentes","calle2":"Trebol del Libramiento Sur","colonia":"","comunidad":"","nombres":"","resumen":"El cuerpo de una mujer sin vida fue encontrado en un baldio de Av. Insurgentes, a metros del reten de la Guardia Nacional. Paramédicos confirmaron ausencia de signos vitales y el cuerpo presentaba huellas de violencia. La FGE inicio investigacion.","fecha_evento":"03/03/2026","tiempo_dia":"tarde","lat":20.65,"lng":-101.37,"confianza":"alta"}\n\n';
  // Inyectar contexto territorial CONEVAL si geo.js está disponible
  if (typeof geoTextoParaIA === 'function' && window._iaGeoLat && window._iaGeoLng) {
    var geoCtx = geoTextoParaIA(window._iaGeoLat, window._iaGeoLng);
    if (geoCtx) {
      p += 'CONTEXTO TERRITORIAL DE LA ZONA DEL EVENTO: ' + geoCtx + '\n';
      p += 'Usa este contexto para enriquecer el análisis y resumen si es relevante.\n\n';
    }
  }
  p += 'TEXTO A ANALIZAR:\n' + frag + '\n\nJSON:';

  // Inyectar reglas de aprendizaje automático si existen
  if (_promptRules && _promptRules.length > 0) {
    var reglasActivas = _promptRules.filter(function(r){ return r.activa !== false; });
    if (reglasActivas.length > 0) {
      p = p.replace('REGLAS CRITICAS:\n', 'REGLAS CRITICAS (ajustadas por aprendizaje automático):\n');
      var extra = '\n// APRENDIDO DE CORRECCIONES REALES:\n';
      reglasActivas.forEach(function(r) {
        extra += r.regla + '\n';
      });
      p = p.replace('TEXTO A ANALIZAR:', extra + 'TEXTO A ANALIZAR:');
    }
  }

  return p;
}

// ── Gestor de keys (fuera del DOMContentLoaded para acceso global) ──
function renderKeysList() {
  var lista = document.getElementById('keys-lista');
  if (!lista) return;
  var keys = window._appGeminiKeys || [];
  if (keys.length === 0) {
    lista.innerHTML = '<div style="font-size:8px;color:#2a4a6a;padding:8px;">No hay keys guardadas. Agrega al menos una.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var agotada = window._geminiKeyAgotadas && window._geminiKeyAgotadas[i];
    var esActual = window._geminiKeyIdx === i;
    var preview = k.slice(0,8) + '...' + k.slice(-4);
    html += '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #0d2040;">';
    html += '<span style="font-size:8px;color:' + (agotada ? '#ff4466' : (esActual ? '#00ff88' : '#5a8aaa')) + ';min-width:60px;">';
    html += (esActual ? '▶ ACTIVA' : (agotada ? '⚠ AGOTADA' : '○ EN POOL'));
    html += '</span>';
    html += '<span style="font-family:monospace;font-size:8px;color:#c0e8ff;flex:1;">' + preview + '</span>';
    html += '<button onclick="eliminarKey(' + i + ')" style="font-size:8px;background:none;border:none;color:#ff4466;cursor:pointer;padding:2px 6px;">✕</button>';
    html += '</div>';
  }
  lista.innerHTML = html;
}

function abrirGestorKeys() {
  renderKeysList();
  renderORKeysList();
  document.getElementById('modal-keys').style.display = 'block';
}
window.abrirGestorKeys = abrirGestorKeys;

function cerrarGestorKeys() {
  document.getElementById('modal-keys').style.display = 'none';
}
window.cerrarGestorKeys = cerrarGestorKeys;

function agregarKeyDesdeModal() {
  var input = document.getElementById('nueva-key-input');
  var key = input ? input.value.trim() : '';
  if (!key || key.length < 20) {
    alert('Pega una API key válida (empieza con AIzaSy...)');
    return;
  }
  if (!window._appGeminiKeys) window._appGeminiKeys = [];
  if (window._appGeminiKeys.indexOf(key) >= 0) {
    alert('Esa key ya está en el pool.');
    return;
  }
  window._appGeminiKeys.push(key);
  // Sincronizar con todos los arrays que usa llamarGemini
  if (typeof GEMINI_KEYS !== 'undefined' && GEMINI_KEYS.indexOf(key) < 0) GEMINI_KEYS.push(key);
  try { localStorage.setItem('gemini_keys_pool', JSON.stringify(window._appGeminiKeys)); } catch(e) {}
  syncKeysFirebase();
  if (input) input.value = '';
  renderKeysList();
  actualizarStatusGemini();
  var n = window._appGeminiKeys.length;
  toast('✓ Key Gemini guardada. Pool: ' + n + ' key' + (n > 1 ? 's' : ''), 'ok');
}
window.agregarKeyDesdeModal = agregarKeyDesdeModal;

function eliminarKey(idx) {
  if (!window._appGeminiKeys) return;
  window._appGeminiKeys.splice(idx, 1);
  if (typeof GEMINI_KEYS !== 'undefined') { GEMINI_KEYS.splice(idx, 1); }
  try { localStorage.setItem('gemini_keys_pool', JSON.stringify(window._appGeminiKeys)); } catch(e) {}
  syncKeysFirebase();
  if (window._geminiKeyIdx >= window._appGeminiKeys.length) window._geminiKeyIdx = 0;
  renderKeysList();
  actualizarStatusGemini();
}
window.eliminarKey = eliminarKey;

function probarKeys() {
  var keys = window._appGeminiKeys || [];
  if (!keys.length) { alert('No hay keys para probar.'); return; }
  var btn = event.target;
  btn.textContent = '⏳ Probando...';
  btn.disabled = true;
  var resultados = [];
  var pendientes = keys.length;
  keys.forEach(function(k, i) {
    // Usar solo listModels (GET, sin costo de tokens) para verificar que la key es válida
    var urlCheck = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + k + '&pageSize=1';
    fetch(urlCheck)
    .then(function(res) { resultados[i] = res.status; })
    .catch(function() { resultados[i] = 'error'; })
    .finally(function() {
      pendientes--;
      if (pendientes === 0) {
        btn.textContent = '🧪 PROBAR';
        btn.disabled = false;
        var msg = 'Resultados:\n';
        keys.forEach(function(k2, j) {
          var st = resultados[j];
          msg += 'Key ' + (j+1) + ': ' + (st === 200 ? '✓ Válida' : st === 429 ? '⚠ Rate limit temporal' : st === 403 ? '✗ Bloqueada/sin permiso' : st === 400 ? '✗ Key inválida' : '? ' + st) + '\n';
        });
        alert(msg);
        renderKeysList();
      }
    });
  });
}
window.probarKeys = probarKeys;

function actualizarStatusGemini() {
  var el = document.getElementById('gemini-status');
  if (!el) return;
  // Leer del pool más actualizado (localStorage ya cargado + hardcoded)
  var keys = (window._appGeminiKeys && window._appGeminiKeys.length) ? window._appGeminiKeys
           : (typeof GEMINI_KEYS !== 'undefined' && GEMINI_KEYS.length ? GEMINI_KEYS : []);
  var agotadas = Object.keys(window._geminiKeyAgotadas || {}).length;
  var disponibles = keys.length - agotadas;
  var orPool = (window._appORKeys && window._appORKeys.length) ? window._appORKeys
             : (typeof OPENROUTER_KEYS !== 'undefined' && OPENROUTER_KEYS.length ? OPENROUTER_KEYS : []);
  var hasOR = orPool.length > 0;
  if (hasOR) {
    el.textContent = '🔀 OR ' + orPool.length + (keys.length ? ' + G' + disponibles : '') + ' keys';
    el.style.color = '#ff8800';
    el.style.borderColor = '#ff880044';
    el.style.background = 'rgba(255,136,0,.06)';
  } else if (disponibles > 0) {
    el.textContent = '🤖 G ' + disponibles + '/' + keys.length + ' keys';
    el.style.color = '#00ff88';
    el.style.borderColor = '#00ff8844';
    el.style.background = 'rgba(0,255,136,.06)';
  } else {
    el.textContent = '⚠ Sin IA — toca para agregar';
    el.style.color = '#ffcc00';
    el.style.borderColor = '#ffcc0044';
    el.style.background = 'rgba(255,204,0,.06)';
    el.style.cursor = 'pointer';
    el.onclick = function() { if(typeof abrirGestorKeys === 'function') abrirGestorKeys(); };
  }
}
window.actualizarStatusGemini = actualizarStatusGemini;

// ── Pool OpenRouter ──
function renderORKeysList() {
  var lista = document.getElementById('or-keys-lista');
  if (!lista) return;
  var keys = window._appORKeys || [];
  // Actualizar contador en el título del modal
  var tit = document.getElementById('or-keys-count');
  if (tit) tit.textContent = keys.length ? keys.length + ' key' + (keys.length > 1 ? 's' : '') : 'sin keys';

  if (!keys.length) {
    lista.innerHTML = '<div style="font-size:8px;color:#6a5a2a;padding:8px;border:1px dashed #3a3a1a;border-radius:3px;text-align:center;">Sin keys OpenRouter — agrega una abajo ↓</div>';
    return;
  }
  var activo = (window._orKeyIdx || 0) % keys.length;
  var html = '';
  keys.forEach(function(k, i) {
    var short = k.slice(0, 14) + '...' + k.slice(-5);
    var esActual = (i === activo);
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;margin-bottom:3px;' +
      'background:' + (esActual ? 'rgba(255,136,0,.12)' : 'rgba(10,20,35,.8)') + ';' +
      'border:1px solid ' + (esActual ? '#ff880055' : '#0d2040') + ';border-radius:3px;">' +
      '<span style="font-family:monospace;font-size:8px;">' +
        '<span style="color:' + (esActual ? '#ff8800' : '#336655') + ';margin-right:6px;">' + (esActual ? '▶' : '○') + '</span>' +
        '<span style="color:#7a9aaa;">OR Key ' + (i+1) + '</span> ' +
        '<span style="color:#3a6a5a;letter-spacing:1px;">' + short + '</span>' +
        (esActual ? ' <span style="color:#ff8800;font-size:6px;">ACTIVA</span>' : '') +
      '</span>' +
      '<div style="display:flex;gap:5px;align-items:center;">' +
        '<span id="or-key-st-' + i + '" style="font-size:7px;min-width:14px;text-align:center;"></span>' +
        '<button onclick="eliminarORKey(' + i + ')" style="font-size:7px;padding:2px 8px;background:rgba(255,0,0,.08);color:#ff4466;border:1px solid #ff446633;border-radius:2px;cursor:pointer;letter-spacing:1px;">✕</button>' +
      '</div>' +
    '</div>';
  });
  lista.innerHTML = html;
}
window.renderORKeysList = renderORKeysList;

function agregarORKey() {
  var input = document.getElementById('or-key-input');
  var key = input ? input.value.trim() : '';
  if (!key || key.length < 20) { alert('Pega una key válida de OpenRouter (sk-or-v1-...)'); return; }
  var pool = window._appORKeys || [];
  if (pool.indexOf(key) >= 0) { alert('Esta key ya está en el pool.'); return; }
  pool.push(key);
  window._appORKeys = pool;
  // Sincronizar con OPENROUTER_KEYS que usa llamarOpenRouterPool
  if (typeof OPENROUTER_KEYS !== 'undefined' && OPENROUTER_KEYS.indexOf(key) < 0) OPENROUTER_KEYS.push(key);
  try { localStorage.setItem('or_keys_pool', JSON.stringify(pool)); } catch(e) {}
  syncKeysFirebase();
  if (input) input.value = '';
  renderORKeysList();
  actualizarStatusGemini();
  var st = document.getElementById('or-key-status');
  if (st) { st.textContent = '✓ Key ' + pool.length + ' agregada'; st.style.color = '#00ff88'; }
  // Probar la key recién agregada
  probarORKey(key, pool.length - 1);
}
window.agregarORKey = agregarORKey;

function eliminarORKey(i) {
  var pool = window._appORKeys || [];
  pool.splice(i, 1);
  window._appORKeys = pool;
  if ((window._orKeyIdx||0) >= pool.length) { window._orKeyIdx = 0; }
  try { localStorage.setItem('or_keys_pool', JSON.stringify(pool)); } catch(e) {}
  syncKeysFirebase();
  renderORKeysList();
  actualizarStatusGemini();
}
window.eliminarORKey = eliminarORKey;

function probarORKey(key, idx) {
  var stEl = document.getElementById('or-key-st-' + idx);
  if (stEl) stEl.textContent = '⏳';
  fetch('https://openrouter.ai/api/v1/models', { headers: { 'Authorization': 'Bearer ' + key } })
  .then(function(res) {
    if (stEl) {
      stEl.textContent = res.status === 200 ? '✓' : '✗' + res.status;
      stEl.style.color = res.status === 200 ? '#00ff88' : '#ff4466';
    }
  })
  .catch(function() { if (stEl) { stEl.textContent = '?'; stEl.style.color = '#ffcc00'; } });
}
window.probarORKey = probarORKey;

function probarKeysOR() {
  var pool = window._appORKeys || [];
  if (!pool.length) { alert('No hay keys OR para probar.'); return; }
  var st = document.getElementById('or-key-status');
  if (st) { st.textContent = 'Probando ' + pool.length + ' keys...'; st.style.color = '#ffcc00'; }
  pool.forEach(function(k, i) { probarORKey(k, i); });
  setTimeout(function() { if (st) { st.textContent = ''; } }, 4000);
}
window.probarKeysOR = probarKeysOR;

// Legado — mantener por compatibilidad
function guardarORKey() { agregarORKey(); }
window.guardarORKey = guardarORKey;
function probarOpenRouter(key) { probarORKey(key, 0); }
window.probarOpenRouter = probarOpenRouter;


// ── Sincronización de keys con Firebase ──
function syncKeysFirebase() {
  if (!db) return;
  var data = {
    gemini: window._appGeminiKeys || [],
    openrouter: window._appORKeys || [],
    updatedAt: new Date().toISOString()
  };
  db.collection('config').doc('keys').set(data)
    .then(function() { console.log('[Keys] Keys guardadas en Firebase ✓'); })
    .catch(function(e) {
      console.error('[Keys] Error guardando en Firebase:', e.code, e.message);
      if (e.code === 'permission-denied') {
        toast('⚠️ Firestore: sin permiso de escritura en config/keys. Revisa las reglas.', 'err');
      }
    });
}
window.syncKeysFirebase = syncKeysFirebase;

function cargarKeysFirebase(callback) {
  if (!db) {
    console.warn('[Keys] Firebase no listo al cargar keys');
    if (callback) callback();
    return;
  }
  console.log('[Keys] Buscando keys en Firebase...');
  db.collection('config').doc('keys').get()
    .then(function(doc) {
      if (!doc.exists) {
        console.log('[Keys] No hay keys guardadas en Firebase aún');
        if (callback) callback();
        return;
      }
      var data = doc.data();
      var totalCargadas = 0;

      if (Array.isArray(data.gemini) && data.gemini.length) {
        window._appGeminiKeys = data.gemini.slice(); // reemplazar completo, no solo fusionar
        try { localStorage.setItem('gemini_keys_pool', JSON.stringify(window._appGeminiKeys)); } catch(e) {}
        if (typeof GEMINI_KEYS !== 'undefined') {
          GEMINI_KEYS.length = 0;
          window._appGeminiKeys.forEach(function(k){ GEMINI_KEYS.push(k); });
        }
        totalCargadas += data.gemini.length;
      }

      if (Array.isArray(data.openrouter) && data.openrouter.length) {
        window._appORKeys = data.openrouter.slice(); // reemplazar completo
        try { localStorage.setItem('or_keys_pool', JSON.stringify(window._appORKeys)); } catch(e) {}
        if (typeof OPENROUTER_KEYS !== 'undefined') {
          OPENROUTER_KEYS.length = 0;
          window._appORKeys.forEach(function(k){ OPENROUTER_KEYS.push(k); });
        }
        totalCargadas += data.openrouter.length;
      }

      console.log('[Keys] ' + totalCargadas + ' keys cargadas desde Firebase ✓');

      // Siempre actualizar UI aunque ya tuviera keys
      if (typeof actualizarStatusGemini === 'function') actualizarStatusGemini();
      if (typeof renderKeysList === 'function') renderKeysList();
      if (typeof renderORKeysList === 'function') renderORKeysList();

      if (totalCargadas > 0) {
        toast('🔑 ' + totalCargadas + ' keys cargadas desde Firebase', 'ok');
      }

      if (callback) callback();
    })
    .catch(function(e) {
      console.error('[Keys] Error leyendo config/keys de Firebase:', e.code, e.message);
      // Si es error de permisos, mostrar alerta útil
      if (e.code === 'permission-denied') {
        toast('⚠️ Firebase: sin permiso para leer keys. Revisa reglas Firestore.', 'err');
      }
      if (callback) callback();
    });
}
window.cargarKeysFirebase = cargarKeysFirebase;

// ── Carga de keys desde localStorage — se ejecuta inmediatamente al cargar el script ──
// Se llama dos veces: aquí (para tenerlas disponibles) y en DOMContentLoaded (para actualizar UI)
(function cargarKeysGuardadas() {
  try {
    var saved = localStorage.getItem('gemini_keys_pool');
    if (saved) {
      var arr = JSON.parse(saved);
      if (Array.isArray(arr) && arr.length) {
        window._appGeminiKeys = arr;
        console.log('[Gemini] ' + arr.length + ' keys pre-cargadas del localStorage');
      }
    }
  } catch(e) {}
  try {
    var orPoolSaved = localStorage.getItem('or_keys_pool');
    if (orPoolSaved) {
      var orArr = JSON.parse(orPoolSaved);
      if (Array.isArray(orArr) && orArr.length) {
        window._appORKeys = orArr;
        console.log('[OpenRouter] ' + orArr.length + ' keys pre-cargadas del localStorage');
      }
    }
    if (!window._appORKeys || !window._appORKeys.length) {
      var orLegacy = localStorage.getItem('openrouter_key');
      if (orLegacy) { window._appORKeys = [orLegacy]; }
    }
  } catch(e) {}
  // Actualizar UI del indicador si el DOM ya está listo
  setTimeout(function() {
    if (typeof actualizarStatusGemini === 'function') actualizarStatusGemini();
    if (typeof renderORKeysList === 'function') renderORKeysList();
  }, 200);
})();

// Asegurar que al completar DOMContentLoaded también actualice el indicador
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    if (typeof actualizarStatusGemini === 'function') actualizarStatusGemini();
  }, 300);
});
