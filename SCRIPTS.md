# SCRIPTS.md — Orden de carga de scripts
# Irapuato Intel — Documentacion de arquitectura
# Actualizado: Entrega 1 refactorizacion (Marzo 2026)

## Orden de carga en index.html (todos con `defer`)

```
config.js
datos.js
geo.js
censo.js
analisis.js
ia.js
bd.js
aprende.js
calles.js
intel.js
rss.js
mapa.js
gob.js          ← NUEVO (Entrega 1) — extraido de mapa.js
data.js
sesnsp.js
prediccion.js
co.js
ingesta.js
subtipo_seg.js
movilidad.js
app.js
```

## Por qué el orden importa

Cada archivo puede llamar funciones de los archivos anteriores al cargarse.
Con `defer`, todos se ejecutan en orden *después* de que el HTML está parseado.

## Dependencias críticas

| Archivo | Necesita que ya exista | Por qué |
|---|---|---|
| `geo.js` | `config.js` | Lee `db` y llama `toast()` |
| `analisis.js` | `geo.js`, `censo.js` | `calcularIndiceRiesgo()` usa `GEO` y `CENSO` |
| `ia.js` | `config.js` | Pool de API keys en `GEMINI_KEYS` |
| `bd.js` | `ia.js`, `geo.js` | `buildPrompt()`, `geoLookup()` |
| `gob.js` | `mapa.js` | Usa `mapaObj` del mapa principal (tab gobierno-mapa) |
| `prediccion.js` | `geo.js`, `bd.js` | `GEO.geojson`, `noticias[]` |
| `app.js` | todos | `verTab()` llama funciones de todos los modulos |

## Qué pasa si se rompe el orden

- `gob.js` antes de `mapa.js` → `iniciarGobMapa()` puede no encontrar Leaflet listo
- `analisis.js` antes de `geo.js` → `GEO` es undefined → IRZ retorna 0 en todo
- `app.js` antes de cualquier otro → `verTab('denue')` llamaría `iniciarDenue` que no existe

## Regla para agregar un módulo nuevo

1. Identificar de qué funciones globales depende
2. Ubicarlo *después* del último archivo que define esas funciones
3. Si expone funciones para la IA, registrarlas en `IA_CONTEXT_PROVIDERS` al final del archivo
4. Si tiene una tab, agregar su entrada en `TAB_CONFIG` en `app.js`
5. Agregar la entrada en este archivo

## Archivos y sus responsabilidades

| Archivo | Responsabilidad única |
|---|---|
| `config.js` | Configuración, pool API keys, estado global (`noticias[]`), `proxyPool()` |
| `datos.js` | `DEPENDENCIAS_GOB[]`, `GOB_COLORES`, `GOB_ICONOS` — datos estáticos de gobierno |
| `geo.js` | CONEVAL 2015+2020, GeoJSON AGEBs, `geoLookup()`, `normalizarClaveAGEB()` |
| `censo.js` | Censo 2020 por AGEB, IVC, `censoLookup()` |
| `analisis.js` | IRZ (Índice de Riesgo Zonal), `calcularIndiceRiesgo()` |
| `ia.js` | `buildPrompt()`, `llamarGemini()`, `llamarOpenRouter()`, `IA_CONTEXT_PROVIDERS[]` |
| `bd.js` | Corpus Firestore, `escucharBD()`, `renderBD()`, aprobación/edición |
| `aprende.js` | Observabilidad editorial, `feed-visto` Firestore, `aprendeRenderPanel()` |
| `calles.js` | Base de calles con sinónimos, `callesLookup()`, `callesRegistrar()` |
| `intel.js` | Mapa de incidentes, `intelObj`, `renderIntel()`, filtros |
| `rss.js` | Scraping RSS/HTML, `fetchContenidoArticulo()` |
| `mapa.js` | Mapa DENUE (3 niveles zoom) + mapa principal de noticias |
| `gob.js` | Cabildo 2024-2027, `CABILDO_DATA[]`, `renderGobCabildo()`, mapa gobierno |
| `data.js` | Análisis lingüístico del corpus (sub-tab DATA) |
| `sesnsp.js` | SESNSP 2015-2025, `sesnspcRenderTab()` |
| `prediccion.js` | Media móvil 7d, anomalías >2σ, badges ZONA ACTIVA |
| `co.js` | Crimen organizado, CJNG/CSRL, `coInit()` |
| `ingesta.js` | Importador JSON + cola RSS + búsqueda web |
| `subtipo_seg.js` | 23 subcategorías SESNSP para tipo=seguridad |
| `movilidad.js` | Grafo vial, semáforos, rutas, `movilidadOnShow()` |
| `app.js` | `verTab()` + `TAB_CONFIG`, `toast()`, Firebase init |
