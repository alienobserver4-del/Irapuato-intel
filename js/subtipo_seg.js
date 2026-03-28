/**
 * subtipo_seg.js — Sprint 6: Sub-tipo de seguridad (categorías SESNSP)
 * Se carga después de bd.js y sesnsp.js
 * Irapuato Intel · 4Alien
 */

// Categorías SESNSP — espejo exacto de los delitos en sesnsp_irapuato.json
var SUBTIPO_SEG = [
  // Homicidios
  { val: 'homicidio_doloso',       label: 'Homicidio doloso' },
  { val: 'homicidio_culposo',      label: 'Homicidio culposo' },
  { val: 'feminicidio',            label: 'Feminicidio' },
  // Lesiones
  { val: 'lesiones_dolosas',       label: 'Lesiones dolosas' },
  { val: 'lesiones_culposas',      label: 'Lesiones culposas' },
  // Robos
  { val: 'robo_con_violencia',     label: 'Robo con violencia' },
  { val: 'robo_sin_violencia',     label: 'Robo sin violencia' },
  { val: 'robo_vehiculo',          label: 'Robo de vehículo' },
  { val: 'robo_casa',              label: 'Robo a casa habitación' },
  { val: 'robo_negocio',           label: 'Robo a negocio' },
  { val: 'robo_transeunte',        label: 'Robo a transeúnte' },
  // Crimen organizado / alto impacto
  { val: 'secuestro',              label: 'Secuestro' },
  { val: 'extorsion',              label: 'Extorsión' },
  { val: 'narcomenudeo',           label: 'Narcomenudeo' },
  { val: 'portacion_armas',        label: 'Portación de armas' },
  { val: 'privacion_libertad',     label: 'Privación de la libertad' },
  { val: 'desaparicion_forzada',   label: 'Desaparición forzada' },
  // Violencia de género / personas
  { val: 'violacion',              label: 'Violación' },
  { val: 'violencia_familiar',     label: 'Violencia familiar' },
  { val: 'abuso_sexual',           label: 'Abuso sexual' },
  // Otros
  { val: 'amenazas',               label: 'Amenazas' },
  { val: 'fraude',                 label: 'Fraude' },
  { val: 'otro_seguridad',         label: 'Otro (seguridad)' }
];

// HTML del select de subtipo — usado en bd.js y ingesta.js
window.subtipoSegHTML = function(idSufijo, valorActual) {
  var sel = '<select id="subtipo-seg-' + idSufijo + '" ' +
    'style="width:100%;background:#060d18;border:1px solid #ff225544;color:#ff8080;' +
    'font-size:10px;padding:4px 6px;border-radius:3px;margin-top:4px;" ' +
    'onchange="subtipoSegActualizar(\'' + idSufijo + '\')">' +
    '<option value="">— Subtipo delito —</option>';
  for (var i = 0; i < SUBTIPO_SEG.length; i++) {
    var s = SUBTIPO_SEG[i];
    sel += '<option value="' + s.val + '"' +
      (s.val === valorActual ? ' selected' : '') + '>' + s.label + '</option>';
  }
  sel += '</select>';
  return sel;
};

// Contenedor completo (label + select) — se inyecta bajo el select de tipo principal
window.subtipoSegContenedor = function(idSufijo, tipoActual, subtipoActual) {
  var visible = tipoActual === 'seguridad' ? 'block' : 'none';
  return '<div id="subtipo-seg-wrap-' + idSufijo + '" style="display:' + visible + ';margin-top:4px;">' +
    '<div style="font-size:9px;color:#ff4466;letter-spacing:.5px;margin-bottom:2px;">SUBTIPO DELITO</div>' +
    subtipoSegHTML(idSufijo, subtipoActual || '') +
    '</div>';
};

// Mostrar/ocultar según tipo — llamar al cambiar el select de tipo principal
window.subtipoSegOnTipoCambio = function(idSufijo, tipoValor) {
  var wrap = document.getElementById('subtipo-seg-wrap-' + idSufijo);
  if (!wrap) return;
  wrap.style.display = tipoValor === 'seguridad' ? 'block' : 'none';
  if (tipoValor !== 'seguridad') {
    var sel = document.getElementById('subtipo-seg-' + idSufijo);
    if (sel) sel.value = '';
  }
};

window.subtipoSegActualizar = function(idSufijo) {
  // Hook para futuro uso — por ahora no hace nada especial
};

// Leer valor actual del subtipo dado un idSufijo
window.subtipoSegLeer = function(idSufijo) {
  var sel = document.getElementById('subtipo-seg-' + idSufijo);
  return sel ? sel.value : '';
};

// Badge HTML para mostrar el subtipo en tarjetas
window.subtipoSegBadge = function(subtipo) {
  if (!subtipo) return '';
  var label = subtipo;
  for (var i = 0; i < SUBTIPO_SEG.length; i++) {
    if (SUBTIPO_SEG[i].val === subtipo) { label = SUBTIPO_SEG[i].label; break; }
  }
  return '<span style="background:rgba(255,34,85,.15);color:#ff6688;border:1px solid #ff225533;' +
    'font-size:9px;padding:1px 5px;border-radius:2px;font-family:monospace;margin-left:3px;">' +
    label + '</span>';
};

// Prompt IA: texto adicional para buildPrompt cuando tipo = seguridad
window.subtipoSegPromptExtra = function() {
  var vals = SUBTIPO_SEG.map(function(s){ return s.val; }).join(', ');
  return 'subtipo_seguridad: Si tipo="seguridad", clasifica en uno de estos valores: ' + vals +
    '. Si no aplica o no es seguridad, deja vacío "".';
};
