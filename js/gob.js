// ═══════════════════════════════════════════════════════════════
// gob.js — Modulo Gobierno / Cabildo
// Extraido de mapa.js — Entrega 1 refactorizacion arquitectonica
// Contiene: CABILDO_DATA, PARTIDO_COLOR, renderGobCabildo(),
//           iniciarGobMapa(), renderGobMapaMarkers(), DISTRITOS_IRAPUATO
// Dependencias: Leaflet (L), noticias[], verTab()
// Orden de carga: despues de mapa.js, antes de data.js
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// SECCIÓN GOBIERNO
// ═══════════════════════════════════════════════════════════════
var gobMapaObj = null;
var gobMapaIniciado = false;
var gobMapaFiltro = 'todos';
var gobDistritosLayer = null;
var gobDistritosActivo = false;

// ═══════════════════════════════════════════════════════════════════════════
// CABILDO_DATA — Ayuntamiento de Irapuato 2024-2027
// Toma de protesta: 10 oct 2024
// Sprint 8: datos completos con perfil, comisiones, controversias y redes
// ═══════════════════════════════════════════════════════════════════════════
var CABILDO_DATA = [

  // ─── 1. PRESIDENTA MUNICIPAL ──────────────────────────────────────────────
  {
    id: 'lorena-alfaro',
    nombre: 'Lorena del Carmen Alfaro García',
    rolKey: 'pres', rol: 'Presidenta Municipal', partido: 'PAN', emoji: '🏛',
    edad: 52, nacimiento: '11 ago 1973, Irapuato, Gto.',
    licenciatura: 'Contaduría Pública', posgrado: 'M. en Política y Gestión Pública',
    institucion: 'U. de Guanajuato / Iberoamericana León',
    tipo_eleccion: 'mayoria', veces_boleta: 5, es_suplente: false,
    comision_principal: 'Presidencia Municipal',
    descripcion: '1ª mujer electa y reelecta Presidenta de Irapuato. 2° mandato consecutivo (2024-2027). Militante PAN desde 1994. Regidora 2000-03, diputada local 2003-06, tesorera 2007-09, diputada federal 2015-18, presidenta del Congreso Gto. 2018-21.',
    nexos: 'Cercana a gobernadora Libia García; respaldada por presidente nacional PAN Marko Cortés.',
    controversias: [
      { titulo: 'Represión a feministas may. 2022 — disculpa pública oct. 2022', url: 'https://www.jornada.com.mx/2022/10/03/estados/030n1est' },
      { titulo: 'Denuncia por tráfico de influencias y red inmobiliaria (2024)', url: 'https://memoriasguanajuato.mx/2024/05/24/por-trafico-de-influencias-y-abuso-de-autoridad-denuncian-a-lorena-alfaro/' },
      { titulo: 'Investigación por red de corrupción inmobiliaria', url: 'https://www.la-prensa.com.mx/republica/investigan-a-lorena-alfaro-por-red-de-corrupcion-inmobiliaria-en-irapuato-11779937.html' },
      { titulo: 'Caso TRAESA: anticipo no recuperado (2007-2009)', url: 'https://www.elsoldeirapuato.com.mx/local/caso-traesa-ya-es-asunto-juzgado-precandidata-irapuato-6198890.html' }
    ],
    noticias: [
      { titulo: '2° informe — Irapuato 27 refrenda compromiso con la gente', url: 'https://www.irapuato.gob.mx/2025/08/14/irapuato-27-refrenda-lorena-alfaro-compromiso-con-la-gente/', anio: 2025 },
      { titulo: 'Acepta reforzar seguridad en Irapuato', url: 'https://kuali.com.mx/web/2025/12/20/acepta-lorena-alfaro-reforzar-seguridad-en-irapuato/', anio: 2025 },
      { titulo: 'Irapuato 16° en ranking de ciudades más violentas del mundo', url: 'https://www.am.com.mx/irapuato/2026/02/15/cuestiona-seguridad-de-irapuato-ranking-de-las-ciudades-mas-peligrosas-del-mundo-1748558.html', anio: 2026 }
    ],
    redes: { twitter: 'https://x.com/lorenaalfarog', instagram: 'https://www.instagram.com/lorenaalfarog/', facebook: 'https://www.facebook.com/LorenaAlfaroG', tiktok: 'https://www.tiktok.com/@lorenaalfarog', web: 'https://www.irapuato.gob.mx/presidenta/' }
  },

  // ─── 2. PRIMER SÍNDICO ────────────────────────────────────────────────────
  {
    id: 'christian-enriquez',
    nombre: 'Christian Enríquez Hernández',
    rolKey: 'sind', rol: 'Primer Síndico', partido: 'PAN', emoji: '⚖️',
    edad: null, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Administración de Empresas / Contabilidad', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'mayoria', veces_boleta: 2, es_suplente: true,
    nota_suplente: 'Suplente de Rogelio Pérez Espinoza (licencia oct. 2024)',
    comision_principal: 'Hacienda, Patrimonio y Cuenta Pública (vocal)',
    descripcion: 'Empresario y ex jugador de fuerzas básicas del Club Irapuato. Fue 3er regidor PAN 2021-2024. Nombrado Dir. General del CODE Guanajuato por Diego Sinhue (abr. 2024); dejó el cargo al asumir como síndico suplente.',
    nexos: 'Cercano al exgobernador Diego Sinhue Rodríguez Vallejo.',
    controversias: [],
    noticias: [
      { titulo: 'Enríquez toma las riendas del CODE Guanajuato', url: 'https://boletines.guanajuato.gob.mx/2024/04/07/va-por-el-deporte-social-y-el-competitivo-enriquez-hernandez-toma-las-riendas-de-code/', anio: 2024 }
    ],
    redes: { facebook: 'https://www.facebook.com/chrisenriquezh/' }
  },

  // ─── 3. SEGUNDA SÍNDICA ───────────────────────────────────────────────────
  {
    id: 'karen-guerra',
    nombre: 'Karen Marlen Guerra Ramírez',
    rolKey: 'sind', rol: 'Segunda Síndica', partido: 'PRI', emoji: '⚖️',
    edad: 43, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Derecho', posgrado: 'M. en Innovación Educativa',
    institucion: 'U. de Guanajuato / UPN',
    tipo_eleccion: 'coalicion', veces_boleta: 3, es_suplente: false,
    comision_principal: 'Hacienda, Patrimonio y Cuenta Pública (secretaria)',
    descripcion: 'Militante del PRI desde 1998. Regidora 2018-2021 (presidenta Comisión Equidad de Género), candidata a la presidencia municipal 2021 (1ª priista mujer en ese cargo). Pre-aspirante a la alcaldía 2027. Docente SEP.',
    nexos: 'Presidenta del Comité Municipal PRI en Irapuato. Vinculada a liderazgos priistas estatales.',
    controversias: [],
    noticias: [
      { titulo: 'Karen Guerra destapa aspiración a la presidencia municipal 2027', url: 'https://oem.com.mx/elsoldeirapuato/local/karen-guerra-destapa-su-aspiracion-a-la-presidencia-municipal-de-irapuato-por-el-pri-28832207', anio: 2025 },
      { titulo: 'Cabildo reprueba informe de Seguridad Ciudadana (voto clave)', url: 'https://periodicocorreo.com.mx/irapuato/2025/may/30/reprueba-cabildo-de-irapuato-informe-de-seguridad-ciudadana-128984.html', anio: 2025 }
    ],
    redes: { facebook: 'https://www.facebook.com/KarenGuerra00', instagram: 'https://www.instagram.com/guerrakaren', web: 'https://karenguerra.mx' }
  },

  // ─── 4. REGIDOR 1 — GERARDO BARROSO ──────────────────────────────────────
  {
    id: 'gerardo-barroso',
    nombre: 'Gerardo Barroso Rangel',
    rolKey: 'regi', rol: 'Regidor 1', partido: 'PAN', emoji: '🎗',
    edad: 39, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Ciencias de la Comunicación', posgrado: 'M. en Comunicación Social y Política (trunca)',
    institucion: 'U. de León plantel Irapuato / La Salle Bajío',
    tipo_eleccion: 'mayoria', veces_boleta: 1, es_suplente: false,
    comision_principal: 'Seguridad Pública, Gobierno y Movilidad (presidente)',
    descripcion: 'Periodista y comunicólogo. Ex director de Comunicación Social del municipio 2013-2015 y 2021-2024. Reportero en Correo y AM. Coordinador de la Fracción PAN en cabildo (nov. 2024).',
    nexos: 'Operador de comunicación política de Lorena Alfaro.',
    controversias: [],
    noticias: [
      { titulo: 'Regidor defiende reducción de delincuencia en Irapuato', url: 'https://zonafranca.mx/politica-sociedad/regidor-defiende-reduccion-de-la-delincuencia-en-irapuato/', anio: 2025 },
      { titulo: 'Regidor respalda actuar policial ante hechos del domingo', url: 'https://primerplanoirapuato.com/index.php/2026/02/24/regidor-respalda-actuar-de-la-policia-ante-hechos-del-domingo/', anio: 2026 }
    ],
    redes: { facebook: 'https://www.facebook.com/gbarrosor/' }
  },

  // ─── 5. REGIDORA 2 — ROCÍO JIMÉNEZ ────────────────────────────────────────
  {
    id: 'rocio-jimenez',
    nombre: 'Ma. del Rocío Jiménez Chávez',
    rolKey: 'regi', rol: 'Regidora 2', partido: 'PAN', emoji: '🎗',
    edad: 47, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Informática', posgrado: 'M. en Administración y Economía Pública',
    institucion: 'No especificada',
    tipo_eleccion: 'mayoria', veces_boleta: 4, es_suplente: false,
    comision_principal: 'Igualdad de Género (presidenta) / Salud Pública (presidenta)',
    descripcion: 'La edil con mayor trayectoria en administración pública municipal. Secretaria de Transparencia 9 años (2004-2013). Regidora en 2015 y 2021-2024 (coordinadora PAN). Tomó licencia ago. 2024 para dirigir Desarrollo Social; renunció para presidir el CDM PAN Irapuato (2025).',
    nexos: 'Presidenta del Comité Municipal del PAN en Irapuato (2025). Consejera estatal PAN.',
    controversias: [],
    noticias: [
      { titulo: 'Presupuesto INMIRA sube a 5.5 MDP', url: 'https://zonafranca.mx/politica-sociedad/irapuato-presupuesto-para-inmira-aumento-a-5-5-mdp/', anio: 2025 }
    ],
    redes: {}
  },

  // ─── 6. REGIDOR 3 — EMMANUEL JAIME ────────────────────────────────────────
  {
    id: 'emmanuel-jaime',
    nombre: 'Emmanuel Jaime Barrientos',
    rolKey: 'regi', rol: 'Regidor 3', partido: 'PAN', emoji: '🎗',
    edad: 43, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Ing. en Sistemas / Derecho', posgrado: 'M. en Derecho Civil',
    institucion: 'ITESI / CEUG',
    tipo_eleccion: 'mayoria', veces_boleta: 3, es_suplente: false,
    comision_principal: 'Desarrollo Urbano y Planeación (presidente) / Obra Pública (presidente)',
    descripcion: 'Estructura orgánica del PAN desde 2003. Secretario Electoral estatal, representante ante IEEG e INE. Ingeniero en sistemas y abogado. Representante del Ayuntamiento ante el IMPLAN. Denunció modificación irregular del PDU sin autorización del cabildo (feb. 2025).',
    nexos: 'Secretario Técnico del CDE PAN Guanajuato. Capacitador nacional PAN desde 2004.',
    controversias: [
      { titulo: 'Denuncia irregularidad en IMPLAN — PDU modificado sin autorización', url: 'https://www.am.com.mx/irapuato/2025/02/13/directora-del-implan-deja-plan-de-ordenamiento-de-irapuato-en-manos-del-ayuntamiento-732025.html' }
    ],
    noticias: [
      { titulo: 'Quiénes presiden las comisiones del Ayuntamiento 2024-2027', url: 'https://www.elsoldeirapuato.com.mx/local/quienes-presidiran-las-comisiones-de-ayuntamiento-en-irapuato-2024-2027-te-decimos-12695736.html', anio: 2024 }
    ],
    redes: {}
  },

  // ─── 7. REGIDORA 4 — ELVA GARCÍA MELGAR ───────────────────────────────────
  {
    id: 'elva-garcia',
    nombre: 'Elva García Melgar',
    rolKey: 'regi', rol: 'Regidora 4', partido: 'PAN', emoji: '🎗',
    edad: null, nacimiento: 'Col. Valle Verde, Irapuato, Gto.',
    licenciatura: 'No especificada', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'mayoria', veces_boleta: 2, es_suplente: true,
    nota_suplente: 'Suplente de Liliana Flores Rodríguez (licencia ago. 2025)',
    comision_principal: 'Desarrollo Urbano / Servicios Municipales (vocal)',
    descripcion: 'Regidora 2021-2024 (presidenta Comisión de Obra y Servicios, +$1,000 MDP supervisados). Líder comunitaria y presidenta de colonos en Valle Verde. Incorporada como suplente en agosto 2025.',
    nexos: 'Una de las regidoras con mayor cercanía política a Lorena Alfaro.',
    controversias: [
      { titulo: 'Asesinato de su hijo José Francisco Mejía García (3 jun. 2024)', url: 'https://www.periodicocorreo.com.mx/seguridad/a-un-dia-de-las-elecciones-asesinan-a-hijo-de-la-regidora-elva-garcia-en-irapuato-20240603-101056.html' },
      { titulo: 'Propuso cobrar por toallas y tampones en edificios públicos (mar. 2026)', url: 'https://periodicocorreo.com.mx/irapuato/2026/mar/10/regidora-de-irapuato-quiere-cobrar-por-toallas-y-tampones-de-presidencia-porque-se-mal-acostumbran-a-lo-gratis-152185.html' }
    ],
    noticias: [
      { titulo: 'Rindió protesta Elva García como regidora suplente', url: 'https://kuali.com.mx/web/2025/08/29/rindio-protesta-elva-garcia-como-regidora/', anio: 2025 }
    ],
    redes: {}
  },

  // ─── 8. REGIDOR 5 — OMAR GÓMEZ ────────────────────────────────────────────
  {
    id: 'omar-gomez',
    nombre: 'Omar Ignacio Gómez Benítez',
    rolKey: 'regi', rol: 'Regidor 5', partido: 'PAN', emoji: '🎗',
    edad: 34, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'No especificada', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'mayoria', veces_boleta: 1, es_suplente: false,
    comision_principal: 'Derechos Humanos (presidente)',
    descripcion: 'Empresario. Gerente General de ORVITEL (telecomunicaciones y seguridad civil) desde 2012. Primer cargo de elección popular. Perfil técnico-empresarial enfocado en infraestructura.',
    nexos: 'Sin nexos políticos familiares documentados.',
    controversias: [],
    noticias: [],
    redes: {}
  },

  // ─── 9. REGIDORA 6 — KRISTIAN LIRA ────────────────────────────────────────
  {
    id: 'kristian-lira',
    nombre: 'Kristian Carel Lira Trujillo',
    rolKey: 'regi', rol: 'Regidora 6', partido: 'PRI', emoji: '🎗',
    edad: 37, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Derecho', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'rp', veces_boleta: 3, es_suplente: false,
    comision_principal: 'Igualdad de Género (presidenta)',
    descripcion: 'Abogada. Candidata regidora PRI 2021. Representante proporcional PRI. Presidió inauguración de Sala de Lactancia Materna (ene. 2026). Impulsó dispensadores de productos menstruales en edificios públicos. Votó contra el informe de Seguridad (may. 2025).',
    nexos: 'Posible nexo familiar con Carlos Abel Lira Trujillo, presidente del CDM PRI Irapuato (comparten ambos apellidos).',
    controversias: [],
    noticias: [
      { titulo: 'PAN lidera comisiones — oposición acusa falta de paridad', url: 'https://periodicocorreo.com.mx/irapuato/pan-lidera-comisiones-en-el-ayuntamiento-de-irapuato-oposicion-acusa-falta-de-paridad-20241016-112268.html', anio: 2024 }
    ],
    redes: {}
  },

  // ─── 10. REGIDORA 7 — REGINA IRASTORZA ────────────────────────────────────
  {
    id: 'regina-irastorza',
    nombre: 'Regina Irastorza Tomé',
    rolKey: 'regi', rol: 'Regidora 7', partido: 'MC', emoji: '🎗',
    edad: 27, nacimiento: 'Irapuato, Gto. (~1997)',
    licenciatura: 'No especificada', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'rp', veces_boleta: 2, es_suplente: false,
    comision_principal: 'Educación y Cultura (presidenta)',
    descripcion: 'La regidora más joven del cabildo. Ex Reina de la Ciudad de Irapuato. Candidata suplente PRI 2021; migró a MC para 2024. Voto bisagra: apoyó comisiones con PAN en sesión inaugural pero votó con oposición en seguridad (may. 2025). Denunció presunta violación por exfuncionario PAN (2021, proceso activo).',
    nexos: 'Familia con historial priista. Cambio partidista PRI→MC entre 2021 y 2024.',
    controversias: [
      { titulo: 'Denuncia por presunta violación contra diputado PAN (2021, proceso activo)', url: 'https://periodicocorreo.com.mx/irapuato/como-quedo-el-ayuntamiento-del-municipio-de-irapuato-y-quien-es-la-nueva-alcaldesa-20241010-111763.html' }
    ],
    noticias: [
      { titulo: 'Así quedará integrado el Ayuntamiento 2024-2027', url: 'https://lasillarota.com/guanajuato/estado/2024/8/19/asi-quedara-integrado-el-ayuntamiento-del-municipio-de-irapuato-para-el-periodo-2024-2027-497786.html', anio: 2024 }
    ],
    redes: { twitter: 'https://x.com/irastorzaregina' }
  },

  // ─── 11. REGIDOR 8 — JOSÉ EDUARDO RAMÍREZ ─────────────────────────────────
  {
    id: 'jose-ramirez',
    nombre: 'José Eduardo Ramírez Vergara',
    rolKey: 'regi', rol: 'Regidor 8', partido: 'Morena', emoji: '🎗',
    edad: 35, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Derecho', posgrado: 'M. en Administración',
    institucion: 'Instituto Irapuato',
    tipo_eleccion: 'rp', veces_boleta: 2, es_suplente: false,
    comision_principal: 'Economía y Turismo (presidente)',
    descripcion: 'Abogado. Regidor Morena 2018-2021. Primer regidor en la planilla de Irma Leticia González Sánchez 2024. Defensor del bienestar federal. Posible aspirante Morena a la alcaldía 2027.',
    nexos: 'Afín a Irma Leticia González Sánchez (ex candidata Morena, aspirante 2027). Bloque: Ramírez-Rosales-Vargas.',
    controversias: [
      { titulo: 'Señalado por diputado Aguirre por ausentarse de reuniones Morena', url: 'https://periodicocorreo.com.mx/irapuato/como-quedo-el-ayuntamiento-del-municipio-de-irapuato-y-quien-es-la-nueva-alcaldesa-20241010-111763.html' }
    ],
    noticias: [
      { titulo: 'Morena lidera intención de voto para alcaldía 2027', url: 'https://primerplanoirapuato.com/index.php/2026/03/10/morena-lidera-intencion-de-voto-rumbo-a-la-alcaldia-de-irapuato-massive-caller/', anio: 2026 }
    ],
    redes: {}
  },

  // ─── 12. REGIDORA 9 — KARINA ROSALES ──────────────────────────────────────
  {
    id: 'karina-rosales',
    nombre: 'Karina Rosales Zúñiga',
    rolKey: 'regi', rol: 'Regidora 9', partido: 'Morena', emoji: '🎗',
    edad: null, nacimiento: 'Sin datos públicos',
    licenciatura: 'Sin datos públicos', posgrado: null,
    institucion: 'Sin datos públicos',
    tipo_eleccion: 'rp', veces_boleta: 1, es_suplente: false,
    comision_principal: 'Juventud, Deporte y Recreación (presidenta)',
    descripcion: '⚠ La única integrante del cabildo de quien ninguna fuente periodística ni oficial proporcionó datos biográficos. Vota consistentemente con el bloque morenista.',
    nexos: 'Afín a Irma Leticia González Sánchez. Bloque: Ramírez-Rosales-Vargas.',
    controversias: [
      { titulo: 'Señalada por diputado Aguirre por ausentarse de rendición de cuentas', url: 'https://www.am.com.mx/irapuato/2024/6/8/los-ganones-son-morena-el-pri-en-ayuntamiento-de-irapuato-aumentan-ediles-708077.html' }
    ],
    noticias: [],
    redes: {}
  },

  // ─── 13. REGIDOR 10 — IGNACIO MORALES ─────────────────────────────────────
  {
    id: 'ignacio-morales',
    nombre: 'Ignacio Morales Rojas',
    rolKey: 'regi', rol: 'Regidor 10', partido: 'Morena', emoji: '🎗',
    edad: 49, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Derecho', posgrado: null,
    institucion: 'No especificada',
    tipo_eleccion: 'rp', veces_boleta: 2, es_suplente: false,
    comision_principal: 'Contraloría y Combate a la Corrupción (presidente)',
    descripcion: 'El regidor de oposición más vocal y activo. Ex Director de Asuntos Jurídicos de la Contraloría Municipal. Regidor Morena 2018. Líder de facto de la fracción morenista. Co-coordinador del Movimiento Social Organizado. Impulsó solicitud de intervención federal en seguridad (feb. 2026).',
    nexos: 'Cercano al diputado Aguirre Gallardo. Bloque: Morales-Aguado.',
    controversias: [
      { titulo: 'Calificó arrendamiento de patrullas como "el robo más cínico de la historia"', url: 'https://periodicocorreo.com.mx/irapuato/2025/may/30/reprueba-cabildo-de-irapuato-informe-de-seguridad-ciudadana-128984.html' }
    ],
    noticias: [
      { titulo: 'Destaca regidor acciones de grupos especiales de seguridad', url: 'https://lasillarota.com/guanajuato/estado/2025/4/3/destaca-regidor-acciones-de-grupos-especiales-de-seguridad-en-irapuato-530228.html', anio: 2025 },
      { titulo: 'Cabildo reprueba informe de Seguridad Ciudadana', url: 'https://periodicocorreo.com.mx/irapuato/2025/may/30/reprueba-cabildo-de-irapuato-informe-de-seguridad-ciudadana-128984.html', anio: 2025 }
    ],
    redes: {}
  },

  // ─── 14. REGIDORA 11 — ELVIA AGUADO ───────────────────────────────────────
  {
    id: 'elvia-aguado',
    nombre: 'Elvia Aguado López',
    rolKey: 'regi', rol: 'Regidora 11', partido: 'Morena', emoji: '🎗',
    edad: 50, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Derecho', posgrado: 'M. en Derecho Constitucional',
    institucion: 'No especificada',
    tipo_eleccion: 'rp', veces_boleta: 1, es_suplente: false,
    comision_principal: 'Medio Ambiente (presidenta)',
    descripcion: 'Abogada constitucionalista. La regidora con mayor preparación académica de Morena. Ex gerente administrativa de la Unión de Campesinos y Emigrantes Mexicanos A.C. Su casa de gestión (Av. Álvaro Obregón 618) opera como Centro de Capacitación Morena.',
    nexos: 'Bloque Morales-Aguado. Cercana al diputado Aguirre Gallardo.',
    controversias: [],
    noticias: [
      { titulo: 'PAN lidera comisiones — oposición acusa falta de paridad', url: 'https://periodicocorreo.com.mx/irapuato/pan-lidera-comisiones-en-el-ayuntamiento-de-irapuato-oposicion-acusa-falta-de-paridad-20241016-112268.html', anio: 2024 }
    ],
    redes: {}
  },

  // ─── 15. REGIDOR 12 — BONIFACIO VARGAS ────────────────────────────────────
  {
    id: 'bonifacio-vargas',
    nombre: 'Bonifacio Vargas Guerra',
    rolKey: 'regi', rol: 'Regidor 12', partido: 'Morena', emoji: '🎗',
    edad: 33, nacimiento: 'Irapuato, Gto.',
    licenciatura: 'Sin estudios formales reportados', posgrado: null,
    institucion: 'Sin datos',
    tipo_eleccion: 'rp', veces_boleta: 1, es_suplente: false,
    comision_principal: 'Atención a Personas con Discapacidad (presidente) / Grupos Vulnerables (presidente)',
    descripcion: 'Productor de fresa con más de 20 años en el campo. Ganador del concurso "La Fresa de Oro" 2014. Único regidor sin estudios formales reportados. Primer cargo público. Cuestionó el manejo de $129 MDP en Desarrollo Rural; la alcaldesa lo respondió calificándolo de "barbaridad y mentira".',
    nexos: 'Afín a Irma Leticia González Sánchez. Bloque: Ramírez-Rosales-Vargas.',
    controversias: [
      { titulo: 'Conflicto con alcaldesa por cifras de Desarrollo Rural ($129 MDP)', url: 'https://periodicocorreo.com.mx/irapuato/como-quedo-el-ayuntamiento-del-municipio-de-irapuato-y-quien-es-la-nueva-alcaldesa-20241010-111763.html' }
    ],
    noticias: [],
    redes: { facebook: 'https://www.facebook.com/bonifacio.vargas.900/', instagram: 'https://www.instagram.com/compagoryla' }
  }

];

// Paleta de colores por partido
var PARTIDO_COLOR = {
  'PAN':    { bg: '#003087', fg: '#ffffff', border: '#0040b0' },
  'Morena': { bg: '#5e0021', fg: '#ffffff', border: '#8b0033' },
  'PRI':    { bg: '#006847', fg: '#ffffff', border: '#009060' },
  'MC':     { bg: '#f04e12', fg: '#ffffff', border: '#ff6530' },
  'PRD':    { bg: '#ffcc00', fg: '#000000', border: '#ddaa00' }
};

function renderGobContador() {
  var el = document.getElementById('gob-contador');
  if (!el) return;
  // Última elección municipal Irapuato: 2 junio 2024 (toma de poder: 10 oct 2024)
  var ultimaEleccion = new Date('2024-06-02');
  var tomaPoder = new Date('2024-10-10');
  var hoy = new Date();
  // Próxima elección: primer domingo de junio 2027
  var proxEleccion = new Date('2027-06-06');
  var diasDesdeEleccion = Math.floor((hoy - ultimaEleccion) / 86400000);
  var diasGestion = Math.floor((hoy - tomaPoder) / 86400000);
  var diasParaEleccion = Math.floor((proxEleccion - hoy) / 86400000);
  var pct = Math.max(0, Math.min(100, Math.round(diasGestion / (3*365) * 100)));

  el.innerHTML = [
    '<div class="gob-cnt-card"><div class="gob-cnt-n" style="color:#00ccff">' + diasDesdeEleccion + '</div><div class="gob-cnt-l">DÍAS DESDE ÚLTIMA ELECCIÓN</div><div style="font-size:7px;color:#3a6a9a;margin-top:3px;">2 Jun 2024</div></div>',
    '<div class="gob-cnt-card"><div class="gob-cnt-n" style="color:#00ff88">' + diasGestion + '</div><div class="gob-cnt-l">DÍAS DE GESTIÓN</div><div style="font-size:7px;color:#3a6a9a;margin-top:3px;">Toma: 10 Oct 2024</div></div>',
    '<div class="gob-cnt-card" style="grid-column:span 2"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;"><span style="font-family:var(--title);font-size:6px;color:var(--muted);letter-spacing:1px;">AVANCE DEL TRIENIO</span><span style="font-family:var(--title);font-size:9px;color:#ffcc00;">' + pct + '%</span></div><div style="background:#0d2040;border-radius:2px;height:6px;width:100%;overflow:hidden;"><div style="height:100%;background:linear-gradient(90deg,#00ccff,#00ff88);border-radius:2px;transition:width .5s;" style="width:' + pct + '%"></div></div><div style="display:flex;justify-content:space-between;margin-top:4px;"><span style="font-size:6px;color:var(--muted);">Oct 2024</span><div class="gob-cnt-n" style="color:#ff4466;font-size:18px;">' + diasParaEleccion.toLocaleString() + ' días</div><span style="font-size:6px;color:var(--muted);">Jun 2027</span></div><div style="font-family:var(--title);font-size:6px;color:var(--muted);letter-spacing:1px;text-align:center;margin-top:2px;">PARA PRÓXIMAS ELECCIONES</div></div>'
  ].join('');
  // Fijar ancho barra de progreso
  var barra = el.querySelector('div[style*="background:linear-gradient"]');
  if (barra) barra.style.width = pct + '%';
}

// ─── Variables estado cabildo ────────────────────────────────────────────────
var _gobFiltroPartido = 'todos';
var _gobExpandidos = {};

function gobSetFiltroPartido(partido) {
  _gobFiltroPartido = partido;
  var btns = document.querySelectorAll('.gob-filtro-btn');
  for (var i = 0; i < btns.length; i++) {
    var isActive = (btns[i].getAttribute('data-partido') === partido);
    btns[i].style.background  = isActive ? '#1a3a5c' : 'transparent';
    btns[i].style.color       = isActive ? '#00ccff' : '#3a6a9a';
    btns[i].style.borderColor = isActive ? '#00ccff' : '#0d2040';
  }
  renderGobCabildo();
}
window.gobSetFiltroPartido = gobSetFiltroPartido;

function gobToggleCard(id) {
  _gobExpandidos[id] = !_gobExpandidos[id];
  var detalle = document.getElementById('gob-det-' + id);
  var btn     = document.getElementById('gob-exp-btn-' + id);
  if (!detalle) return;
  if (_gobExpandidos[id]) {
    detalle.style.display = 'block';
    if (btn) btn.innerHTML = '▲ MENOS';
  } else {
    detalle.style.display = 'none';
    if (btn) btn.innerHTML = '▼ MÁS';
  }
}
window.gobToggleCard = gobToggleCard;

function _gobBadgePartido(partido) {
  var c = PARTIDO_COLOR[partido] || { bg:'#1a2a3a', fg:'#aaa', border:'#2a4a6a' };
  return '<span style="display:inline-block;padding:1px 6px;border-radius:2px;'
    + 'font-family:var(--title);font-size:7px;letter-spacing:.5px;vertical-align:middle;'
    + 'background:' + c.bg + ';color:' + c.fg + ';border:1px solid ' + c.border + ';">'
    + partido + '</span>';
}

function _gobBadgeTipo(tipo) {
  if (tipo === 'mayoria') return '<span style="font-size:7px;color:#00ccff;font-family:var(--mono);">MR</span>';
  if (tipo === 'rp')      return '<span style="font-size:7px;color:#ffcc00;font-family:var(--mono);">RP</span>';
  if (tipo === 'coalicion') return '<span style="font-size:7px;color:#44ff88;font-family:var(--mono);">COAL</span>';
  return '';
}

function _gobIndicadorExp(veces) {
  var html = '';
  for (var i = 0; i < 5; i++) {
    html += '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 1px;'
      + 'background:' + (i < veces ? '#00ccff' : '#0d2040') + ';'
      + 'border:1px solid ' + (i < veces ? '#00ccff' : '#1a3a5c') + ';"></span>';
  }
  return '<span title="' + veces + ' vez(ces) en boleta">' + html + '</span>';
}

function _gobBadgeControversia(n) {
  if (!n) return '';
  return '<span style="display:inline-block;padding:1px 5px;border-radius:2px;'
    + 'background:#2a0a0a;color:#ff4444;font-family:var(--title);font-size:7px;'
    + 'border:1px solid #660000;margin-left:4px;" title="Tiene señalamientos públicos">🔴 ' + n + '</span>';
}

function _gobLinksRedes(redes) {
  var iconos = { twitter:'𝕏', instagram:'IG', facebook:'FB', tiktok:'TK', web:'🌐' };
  var colors = { twitter:'#1da1f2', instagram:'#e1306c', facebook:'#4267b2', tiktok:'#ff0050', web:'#00ccff' };
  var html = '';
  for (var red in iconos) {
    if (redes[red]) {
      html += '<a href="' + redes[red] + '" target="_blank" rel="noopener" '
        + 'style="display:inline-block;padding:2px 6px;margin:2px;border-radius:2px;'
        + 'font-family:var(--mono);font-size:7px;text-decoration:none;'
        + 'background:#0a1a2a;border:1px solid #0d2040;color:' + colors[red] + ';">'
        + iconos[red] + '</a>';
    }
  }
  return html;
}

function _gobSeccionLinks(titulo, items, colorBorde) {
  if (!items || !items.length) return '';
  var html = '<div style="margin-top:8px;">'
    + '<div style="font-family:var(--title);font-size:7px;color:' + colorBorde + ';letter-spacing:.5px;margin-bottom:4px;">' + titulo + '</div>';
  for (var i = 0; i < items.length; i++) {
    html += '<div style="margin-bottom:3px;">'
      + '<a href="' + items[i].url + '" target="_blank" rel="noopener" '
      + 'style="font-family:var(--mono);font-size:7px;color:' + colorBorde + ';text-decoration:none;'
      + 'border-bottom:1px dotted ' + colorBorde + ';line-height:1.5;">'
      + items[i].titulo + (items[i].anio ? ' (' + items[i].anio + ')' : '') + '</a></div>';
  }
  html += '</div>';
  return html;
}

function _gobTarjeta(p) {
  var nContr   = p.controversias ? p.controversias.length : 0;
  var esSuplLbl = p.es_suplente
    ? '<span style="font-family:var(--mono);font-size:6px;color:#ffcc00;border:1px solid #554400;padding:1px 4px;border-radius:2px;margin-left:4px;">SUPLENTE</span>'
    : '';
  var tieneRedes = p.redes && Object.keys(p.redes).length > 0;

  var cabecera = '<div onclick="gobToggleCard(\'' + p.id + '\')" '
    + 'style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;padding:8px 10px;border-bottom:1px solid #0d2040;user-select:none;">'

    + '<div style="flex-shrink:0;width:32px;text-align:center;">'
    + '<div style="font-size:16px;line-height:1;">' + p.emoji + '</div>'
    + '<div style="margin-top:3px;">' + _gobBadgePartido(p.partido) + '</div>'
    + '</div>'

    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-family:var(--title);font-size:9px;color:#e0f0ff;letter-spacing:.3px;">'
    + p.nombre + esSuplLbl + '</div>'
    + '<div style="font-family:var(--mono);font-size:7px;color:#3a6a9a;margin-top:2px;">'
    + p.rol + ' &nbsp;' + _gobBadgeTipo(p.tipo_eleccion) + (nContr ? _gobBadgeControversia(nContr) : '') + '</div>'
    + '<div style="font-family:var(--mono);font-size:7px;color:#2a5a7a;margin-top:3px;">'
    + (p.edad ? p.edad + ' años &nbsp;·&nbsp; ' : '')
    + (p.licenciatura && p.licenciatura !== 'Sin datos públicos' && p.licenciatura !== 'Sin estudios formales reportados'
        ? p.licenciatura
        : '<span style="color:#664444;">' + (p.licenciatura || '—') + '</span>')
    + '</div>'
    + '<div style="margin-top:4px;">' + _gobIndicadorExp(p.veces_boleta)
    + '<span style="font-family:var(--mono);font-size:6px;color:#2a5a7a;margin-left:4px;">' + p.veces_boleta + ' vez(ces) en boleta</span></div>'
    + '</div>'

    + '<div style="flex-shrink:0;">'
    + '<span id="gob-exp-btn-' + p.id + '" style="font-family:var(--title);font-size:6px;color:#1a5a8a;border:1px solid #0d2040;padding:2px 5px;border-radius:2px;">▼ MÁS</span>'
    + '</div>'
    + '</div>';

  var detalle = '<div id="gob-det-' + p.id + '" style="display:none;padding:8px 10px 10px;border-bottom:1px solid #0a1828;background:#040c18;">'
    + '<div style="font-family:var(--mono);font-size:7.5px;color:#4a8ab0;line-height:1.5;margin-bottom:6px;">' + p.descripcion + '</div>'
    + '<div style="font-family:var(--mono);font-size:7px;color:#2a6a4a;margin-bottom:4px;">📋 <strong style="color:#3a8a60;">Comisión principal:</strong> ' + p.comision_principal + '</div>'
    + '<div style="font-family:var(--mono);font-size:7px;color:#4a4a2a;margin-bottom:4px;">🔗 <strong style="color:#8a8a40;">Nexos:</strong> ' + p.nexos + '</div>'
    + (p.nota_suplente ? '<div style="font-family:var(--mono);font-size:7px;color:#8a6a00;margin-bottom:4px;">⚠ ' + p.nota_suplente + '</div>' : '')
    + '<div style="font-family:var(--mono);font-size:7px;color:#2a5a7a;margin-bottom:4px;">🎓 <strong style="color:#3a7a9a;">Formación:</strong> '
    + (p.licenciatura || '—') + (p.posgrado ? ' · ' + p.posgrado : '')
    + (p.institucion && p.institucion !== 'No especificada' && p.institucion !== 'Sin datos' ? ' (' + p.institucion + ')' : '') + '</div>'
    + (nContr ? _gobSeccionLinks('🔴 SEÑALAMIENTOS / CONTROVERSIAS', p.controversias, '#884444') : '')
    + (p.noticias && p.noticias.length ? _gobSeccionLinks('📰 NOTICIAS RELACIONADAS', p.noticias, '#1a5a8a') : '')
    + (tieneRedes ? '<div style="margin-top:8px;"><div style="font-family:var(--title);font-size:7px;color:#2a5a7a;letter-spacing:.5px;margin-bottom:3px;">REDES</div>' + _gobLinksRedes(p.redes) + '</div>' : '')
    + '</div>';

  return '<div style="background:#070f1c;border:1px solid #0d2040;border-radius:3px;margin-bottom:5px;overflow:hidden;">'
    + cabecera + detalle + '</div>';
}

function _gobFiltroBtns() {
  var partidos = ['todos', 'PAN', 'Morena', 'PRI', 'MC'];
  var labels   = ['TODOS', 'PAN', 'MORENA', 'PRI', 'MC'];
  var html = '<div style="display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap;">';
  for (var i = 0; i < partidos.length; i++) {
    var isActive = (_gobFiltroPartido === partidos[i]);
    html += '<button class="gob-filtro-btn" data-partido="' + partidos[i] + '" '
      + 'onclick="gobSetFiltroPartido(\'' + partidos[i] + '\')" '
      + 'style="font-family:var(--title);font-size:7px;letter-spacing:.5px;padding:3px 8px;border-radius:2px;cursor:pointer;'
      + 'background:' + (isActive ? '#1a3a5c' : 'transparent') + ';'
      + 'color:' + (isActive ? '#00ccff' : '#3a6a9a') + ';'
      + 'border:1px solid ' + (isActive ? '#00ccff' : '#0d2040') + ';">'
      + labels[i] + '</button>';
  }
  html += '</div>';
  return html;
}

function renderGobCabildo() {
  var ctn     = document.getElementById('gob-cabildo-lista');
  if (!ctn) return;

  // Filtrar lista
  var lista = [];
  for (var i = 0; i < CABILDO_DATA.length; i++) {
    if (_gobFiltroPartido === 'todos' || CABILDO_DATA[i].partido === _gobFiltroPartido) {
      lista.push(CABILDO_DATA[i]);
    }
  }

  // Contadores de partido (siempre con todos)
  var cont = { PAN:0, Morena:0, PRI:0, MC:0 };
  for (var j = 0; j < CABILDO_DATA.length; j++) {
    if (cont[CABILDO_DATA[j].partido] !== undefined) cont[CABILDO_DATA[j].partido]++;
  }
  var contCtn = document.getElementById('gob-contador-partidos');
  if (contCtn) {
    var cHtml = '';
    var pp = ['PAN','Morena','PRI','MC'];
    for (var k = 0; k < pp.length; k++) {
      var c = PARTIDO_COLOR[pp[k]] || { bg:'#1a2a3a', fg:'#fff', border:'#2a4a6a' };
      cHtml += '<div style="background:#070f1c;border:1px solid ' + c.border + ';border-radius:3px;padding:6px 8px;text-align:center;">'
        + '<div style="font-family:var(--title);font-size:18px;color:' + c.fg + ';font-weight:bold;">' + cont[pp[k]] + '</div>'
        + '<div style="font-family:var(--title);font-size:8px;color:' + c.fg + ';letter-spacing:.5px;">' + pp[k] + '</div>'
        + '<div style="font-family:var(--mono);font-size:6px;color:#2a5a7a;margin-top:2px;">' + Math.round(cont[pp[k]]/15*100) + '%</div>'
        + '</div>';
    }
    contCtn.innerHTML = cHtml;
  }

  // Contexto
  var html = '<div style="font-family:var(--mono);font-size:7px;color:#1a5a8a;margin-bottom:8px;">'
    + 'Toma de protesta: 10 oct 2024 &nbsp;·&nbsp; '
    + '<span style="color:#00ccff;">PAN: mayoría relativa</span> &nbsp;·&nbsp; '
    + '<span style="color:#cc4444;">Morena: 5 RP</span> &nbsp;·&nbsp; '
    + '<span style="color:#44cc88;">PRI: 2</span> &nbsp;·&nbsp; '
    + '<span style="color:#ff8844;">MC: 1 RP</span>'
    + '</div>';

  html += _gobFiltroBtns();

  // Grupos
  var grupos = [
    { key:'pres', label:'// PRESIDENTA MUNICIPAL', color:'#00ccff' },
    { key:'sind', label:'// SÍNDICOS',              color:'#44ff88' },
    { key:'regi', label:'// REGIDORES',             color:'#ffcc00' }
  ];
  for (var g = 0; g < grupos.length; g++) {
    var miembros = [];
    for (var m = 0; m < lista.length; m++) {
      if (lista[m].rolKey === grupos[g].key) miembros.push(lista[m]);
    }
    if (!miembros.length) continue;
    html += '<div style="font-family:var(--title);font-size:7px;color:' + grupos[g].color + ';letter-spacing:1px;margin:10px 0 5px;">' + grupos[g].label + '</div>';
    for (var t = 0; t < miembros.length; t++) {
      html += _gobTarjeta(miembros[t]);
    }
  }

  ctn.innerHTML = html;
}

function renderGobNoticias() {
  var el = document.getElementById('gob-noticias-lista');
  if (!el) return;
  var items = noticias.filter(function(n) { return n.tipo === 'gobierno' || n.tipo === 'politica'; });
  if (!items.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:8px;padding:10px 0;">Sin noticias de gobierno aprobadas aún.</div>';
    return;
  }
  el.innerHTML = items.slice(0, 30).map(function(n) {
    var esP = n.tipo === 'politica';
    return '<div class="gob-noticia-card' + (esP ? ' politica' : '') + '">' +
      '<div style="display:flex;gap:6px;align-items:flex-start;">' +
        '<span class="nc-tipo ' + n.tipo + '" style="flex-shrink:0;margin-top:2px;">' + (esP ? 'POLÍTICA' : 'GOBIERNO') + '</span>' +
        '<div class="gob-noticia-tit">' + (n.titulo || '') + '</div>' +
      '</div>' +
      '<div class="gob-noticia-meta">' +
        '<span style="color:var(--cyan);">' + (n.fuente || '') + '</span>' +
        (n.colonia ? '<span style="color:var(--green);">📍 ' + n.colonia + '</span>' : '') +
        (n.fecha_evento ? '<span>' + n.fecha_evento + '</span>' : '') +
        (n.confianza ? '<span class="nc-conf-' + n.confianza + '">▲ ' + n.confianza + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function verGobSubtab(cual) {
  var tabs = document.querySelectorAll('.gob-stab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var t = document.getElementById('gstab-' + (cual === 'ayuntamiento' ? 'ayto' : 'mapa'));
  if (t) t.classList.add('active');
  var secAyto = document.getElementById('gsec-ayuntamiento');
  var secMapa = document.getElementById('gsec-mapa');
  if (cual === 'ayuntamiento') {
    if (secAyto) secAyto.style.display = 'block';
    if (secMapa) secMapa.style.display = 'none';
    renderGobContador();
    renderGobCabildo();
    renderGobNoticias();
  } else {
    if (secAyto) secAyto.style.display = 'none';
    if (secMapa) { secMapa.style.display = 'flex'; }
    setTimeout(iniciarGobMapa, 200);
  }
}
window.verGobSubtab = verGobSubtab;

function iniciarGobMapa() {
  var el = document.getElementById('gob-mapa-leaflet');
  if (!el) return;
  var secGob = document.getElementById('sec-gobierno');
  var subH = document.getElementById('gob-subtabs') ? document.getElementById('gob-subtabs').offsetHeight : 36;
  var headerH = document.querySelector('header') ? document.querySelector('header').offsetHeight : 44;
  var tabsH = document.getElementById('tabs') ? document.getElementById('tabs').offsetHeight : 36;
  var topOffset = headerH + tabsH;
  var altoTotal = window.innerHeight - topOffset - subH - 28; // 28 = barra inferior
  el.style.height = Math.max(200, altoTotal) + 'px';
  el.style.width = '100%';

  if (gobMapaObj) { try { gobMapaObj.remove(); } catch(e) {} gobMapaObj = null; gobMapaIniciado = false; }

  gobMapaObj = L.map('gob-mapa-leaflet', { center: [20.6795, -101.354], zoom: 12, zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM', maxZoom: 19 }).addTo(gobMapaObj);
  gobMapaIniciado = true;

  renderGobMapaMarkers();
}

function renderGobMapaMarkers() {
  if (!gobMapaObj) return;
  // Limpiar markers previos
  gobMapaObj.eachLayer(function(layer) {
    if (layer._isGobMarker) { try { gobMapaObj.removeLayer(layer); } catch(e) {} }
  });

  var items = noticias.filter(function(n) {
    if (!n.lat || !n.lng) return false;
    if (gobMapaFiltro === 'todos') return n.tipo === 'gobierno' || n.tipo === 'politica';
    return n.tipo === gobMapaFiltro;
  });

  var cntP = 0, cntG = 0;
  items.forEach(function(n) {
    var esP = n.tipo === 'politica';
    if (esP) cntP++; else cntG++;
    var color = esP ? '#c040ff' : '#0096ff';
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:' + color + ';border-radius:50%;border:2px solid rgba(255,255,255,.4);box-shadow:0 0 8px ' + color + '88;"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7]
    });
    var mk = L.marker([n.lat, n.lng], { icon: icon }).addTo(gobMapaObj);
    mk._isGobMarker = true;
    var tipoBadge = '<span style="background:' + color + '22;color:' + color + ';font-size:6px;font-family:Orbitron,monospace;padding:2px 5px;border-radius:2px;letter-spacing:1px;">' + (esP ? 'POLÍTICA' : 'GOBIERNO') + '</span>';
    mk.bindPopup('<div>' + tipoBadge + '<div style="font-size:10px;color:#c0e8ff;margin:4px 0 2px;line-height:1.3;">' + (n.titulo||'') + '</div><div style="font-size:7px;color:#5a8aaa;">' + (n.fuente||'') + (n.colonia ? ' · ' + n.colonia : '') + '</div></div>');
  });

  var cEl = document.getElementById('gpol-cnt-pol'); if (cEl) cEl.textContent = cntP;
  var cEl2 = document.getElementById('gpol-cnt-gob'); if (cEl2) cEl2.textContent = cntG;
  var cEl3 = document.getElementById('gpol-cnt-tot'); if (cEl3) cEl3.textContent = (cntP + cntG) + ' eventos';
}

function filtrarGobMapa(tipo, btn) {
  gobMapaFiltro = tipo;
  var btns = document.querySelectorAll('#gsec-mapa .mapa-filtro-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('activo');
  if (btn) btn.classList.add('activo');
  renderGobMapaMarkers();
}
window.filtrarGobMapa = filtrarGobMapa;

// ── Layer de distritos electorales de Irapuato ──
// Datos extraídos del PDF cartográfico INE (distritos federales 04, 07, 08, 09, 13, 15)
// Se representan como polígonos aproximados basados en la carta electoral
var DISTRITOS_IRAPUATO = [
  {
    id: 'DTTO-FED-04', nombre: 'Distrito Federal 04', color: '#ff6600',
    coords: [[20.7350,-101.4500],[20.7350,-101.2800],[20.6200,-101.2800],[20.5800,-101.3500],[20.6200,-101.4500]]
  },
  {
    id: 'DTTO-FED-07', nombre: 'Distrito Federal 07', color: '#ffcc00',
    coords: [[20.7350,-101.5200],[20.7350,-101.4500],[20.6200,-101.4500],[20.5800,-101.4800],[20.6000,-101.5200]]
  },
  {
    id: 'DTTO-FED-08', nombre: 'Distrito Federal 08', color: '#00ccff',
    coords: [[20.6200,-101.4500],[20.6200,-101.3500],[20.5200,-101.3500],[20.4800,-101.4000],[20.5200,-101.4500]]
  },
  {
    id: 'DTTO-FED-09', nombre: 'Distrito Federal 09', color: '#00ff88',
    coords: [[20.7350,-101.3500],[20.7350,-101.2800],[20.6700,-101.2800],[20.6200,-101.2800],[20.6200,-101.3500],[20.6800,-101.3500]]
  },
  {
    id: 'DTTO-FED-13', nombre: 'Distrito Federal 13', color: '#ff44aa',
    coords: [[20.6200,-101.4500],[20.5800,-101.4800],[20.5200,-101.4500],[20.4800,-101.3500],[20.5200,-101.3500],[20.6200,-101.3500]]
  },
  {
    id: 'DTTO-FED-15', nombre: 'Distrito Federal 15', color: '#cc88ff',
    coords: [[20.6000,-101.5200],[20.5800,-101.4800],[20.4800,-101.4000],[20.4500,-101.4500],[20.4500,-101.5200],[20.5500,-101.5500]]
  }
];

function toggleDistritosLayer() {
  var btn = document.getElementById('btn-distritos');
  if (!gobMapaObj) { toast('Abre el mapa primero', 'warn'); return; }

  if (gobDistritosActivo) {
    // Remover
    if (gobDistritosLayer) { gobMapaObj.removeLayer(gobDistritosLayer); gobDistritosLayer = null; }
    gobDistritosActivo = false;
    if (btn) { btn.textContent = '⬡ DISTRITOS OFF'; btn.style.background = 'rgba(3,5,10,.88)'; btn.style.color = '#ffcc00'; }
    toast('Layer de distritos desactivado', 'ok');
  } else {
    // Agregar
    var group = L.layerGroup();
    DISTRITOS_IRAPUATO.forEach(function(d) {
      var poly = L.polygon(d.coords, {
        color: d.color, weight: 2, opacity: .9,
        fillColor: d.color, fillOpacity: .08,
        dashArray: '6 4'
      });
      poly.bindTooltip('<span style="font-family:Orbitron,monospace;font-size:8px;color:#c0e8ff;">' + d.nombre + '</span>', { permanent: false, direction: 'center' });
      group.addLayer(poly);
    });
    gobDistritosLayer = group;
    group.addTo(gobMapaObj);
    gobDistritosActivo = true;
    if (btn) { btn.textContent = '⬡ DISTRITOS ON'; btn.style.background = 'rgba(255,204,0,.15)'; btn.style.color = '#ffe066'; }
    toast('📍 6 distritos federales activos', 'ok');
  }
}
window.toggleDistritosLayer = toggleDistritosLayer;

// ═══════════════════════════════════════════════════════════════
// MAPA LEAFLET — con heatmap, click detalle y mini-mapa en BD
// ═══════════════════════════════════════════════════════════════
var mapaIniciado = false;
var mapaObj = null;
var mapaMarkers = [];
var mapaHeatLayer = null;
var mapaHeatActivo = false;
var miniMapaObj = null;
var mapaFiltrosActivos = { seguridad:true, accidente:true, evento:true, gobierno:true, rumor:true, desaparecido:true, salud:true, transporte:true };

var COLORES_TIPO = {
  seguridad:        '#ff2255',
  accidente:        '#ff8800',
  evento:           '#00ccff',
  gobierno:         '#0096ff',
  salud:            '#00c864',
  transporte:       '#b464ff',
  desaparecido:     '#ffa500',
  rumor:            '#3a5a7a',
  politica:         '#c040ff',
  ambiental:        '#00aa44',
  corrupcion:       '#ffcc00',
  crimen_organizado:'#cc0022'
};

// Intensidad de cada tipo en el heatmap (seguridad pesa mas)
var HEAT_PESO = {
  seguridad:1.0, crimen_organizado:0.95, desaparecido:0.9, accidente:0.7,
  corrupcion:0.6, transporte:0.5, salud:0.5, rumor:0.4,
  gobierno:0.3, politica:0.3, ambiental:0.2, evento:0.2
};



// ── Exposicion global explicita ──
window.gobSetFiltroPartido  = gobSetFiltroPartido;
window.gobToggleCard        = gobToggleCard;
window.renderGobCabildo     = renderGobCabildo;
window.renderGobNoticias    = renderGobNoticias;
window.verGobSubtab         = verGobSubtab;
window.iniciarGobMapa       = iniciarGobMapa;
window.renderGobMapaMarkers = renderGobMapaMarkers;
window.filtrarGobMapa       = filtrarGobMapa;
window.toggleDistritosLayer = toggleDistritosLayer;
window.renderGobContador    = renderGobContador;
