# Descubrimiento de la fuente

Fecha: **2026-09-21**. Fuente: https://gta-5-map.com/.
Evidencia local ignorada: data/discovery{,2,3}/, data/real/capture.json,
data/source-verification/{capture,styles,details,projections}.json y capturas PNG.
No se publican dumps, cookies, cabeceras de autenticación ni identificadores de anuncios.

## Acceso y acciones observadas

- HEAD y GET directos con curl: 403 sin cuerpo. Web de búsqueda: denegado por robots.
- Chrome normal + Selenium, sin stealth ni cookies suministradas: 200, título
  GTA 5 Interactive Map | MapGenie. DOM, estilos computados y respuestas de red inspeccionados.
- Se abrió el mapa y enlaces públicos `?locationIds=12627,13607,12684,12815,13236`
  individualmente; se inspeccionaron imágenes y descripciones de los popups.
- Se verificaron nombres/categorías, capas y proyección con map.getStyle(), mapData y map.project().
- El enlace a locationIds es el formato que genera el JS público observado; no se inventó.
- Las aperturas observadas cargan el mismo endpoint de mapa y los archivos media del popup;
  no se observó un endpoint adicional de detalle necesario para imágenes.
- Tras extracción, las pruebas locales bloquearon toda petición fuera del origen de la app.

El bloqueo HTTP no se generaliza a todos los clientes: el navegador ordinario funcionó.
No hubo login, bypass, rotación de identidad, proxy ni descarga de contenido protegido.
El extractor admite reusar capture.json legítimo si otra ejecución no puede navegar.

## Mapa base

mapData.map: `id=27, slug=los-santos, title=Los Santos`.
mapData.maps también enumera `315, cayo-perico`, no inspeccionado funcionalmente ni importado.

| Capa | ID tileset | Patrón observado |
|---|---|---|
| Atlas | 28 | gta5/los-santos/atlas/{z}/{x}/{y}.png |
| Satellite | 29 | gta5/los-santos/satellite/{z}/{x}/{y}.png |
| Road | 30 | gta5/los-santos/road/{z}/{x}/{y}.png |
| UV | 31 | gta5/los-santos/uv/{z}/{x}/{y}.jpg |

Base observada `window.tilesCdnUrl=https://tiles.mapgenie.io/games/`.
Ejemplo de solicitud real:
`https://tiles.mapgenie.io/games/gta5/los-santos/atlas/5/4/9.png`.
Extensión de URL no garantiza MIME: algunas respuestas .png se entregan como image/webp.
El downloader decodifica y normaliza PNG local.

MapLibre usa fuentes raster con **tileSize=256**, coordenadas **XYZ**, sin inversión TMS.
mapConfig marca min_zoom=3, max_zoom=7, tiles_max_zoom=7; la fuente MapLibre resuelta
tiene minzoom=2 (ajuste del SDK). La UI local usa zoom de tiles/Leaflet 3–7 según selección.
MapLibre usa worldSize 512×2^zoom; mismo tamaño visual equivale a Leaflet zoom+1 con tiles256.

Extensión por nivel, ambos ejes desde 0 hasta máximo inclusive:

| z | máximo x/y | tiles |
|---|---|---|
| 3 | 2 | 9 |
| 4 | 5 | 36 |
| 5 | 10 | 121 |
| 6 | 21 | 484 |
| 7 | 42 | 1.849 |

La configuración también describe z1/2, pero no se ofrecen fuera de min_zoom.
La muestra usa z3–5, 166 tiles. No se descarga toda la pirámide por defecto.
Límites de cámara/estilo originales: [oeste=-175,sur=55,este=-80,norte=85].
El contrato usa extensión real del grid z7:
`[[50.73645513701065,-180],[85.0511287798066,-59.0625]]`.
Así no descarta puntos meridionales válidos por límites de cámara más restrictivos.

## Coordenadas y controles

Payload: latitude/longitude son strings decimales. Son coordenadas del mapa web artificial,
no ubicaciones geográficas reales ni coordenadas nativas x/y/z del juego.
Normalización conserva `x=latitude, y=longitude`; Leaflet EPSG3857 usa [x,y] directamente.
Norte aumenta latitude; este aumenta longitude; origen del tile grid es noroeste Web Mercator.
No se aplica calibración empírica, escala RDR2 ni desplazamiento manual.

| Control | ID | latitude | longitude |
|---|---|---|---|
| Mount Chiliad Peak | 12684 | 81.975499209866 | -119.99267578125 |
| Los Santos International Airport | 12815 | 59.159035 | -136.713867 |
| Del Perro Pier | 13236 | 66.813546 | -138.905639 |
| Hidden Package #1, control adicional | 13607 | 81.12293179558 | -135.38452148437 |

Comprobación: `python -m scraper.verify_source` guarda map.project de cuatro controles en
zoom MapLibre 3,4,5. `frontend/tests/projection-check.mjs` aplica la transformación real
compartida y proyección Leaflet en zoom 4,5,6, corrige únicamente centro/tamaño de viewport.
Error máximo observado **9.777068044058979e-12 px**, tolerancia de prueba 0,01 px.
Esto mide equivalencia de proyección, no precisión semántica del autor de cada waypoint.
Revisión visual local de montaña, aeropuerto y muelle en reports/real-*.png, con zoom/pan.

Anomalías de fuente:
`13344` (89.999994,29.83064) y `14162` (89.999867,-103.051758) fuera de extensión.
El normalizador registra ambos como omisión; no clampa ni modifica su localización.

## Categorías, grupos y carga completa

Endpoint **observado**: https://gta-5-map.com/api/v1/maps/27/data.
Devuelve locations y metadatos; mapData del window contiene categorías y grupos.
Se capturó la respuesta completa: **2.295 locations**, sin páginas/cursor observados.
La suma categories.locations_count también fue **2.295** para **74 categorías**.
No se leen solo markers renderizados: no depende de viewport, filtros ni zoom.

Campos: location.id → waypoint.id string; category_id → categoryId;
map_id → mapId; title, description → texto/Markdown; latitude/longitude → coordenadas.
category.id/title/group_id/icon; group.id/title preservados. El grupo **Online** es explícito;
otras categorías tienen referencias mixtas en descripciones. No se inventa una partición historia.

## Iconos

CSS observado: `https://cdn.mapgenie.io/css/themes/icons/gta5-icons.css?id=f2aea1c184a73c6c8b8a67256f517bb8`.
background-image referencia `https://cdn.mapgenie.io/images/games/gta5/markers.png?6`.
El mapa carga también markers.png y **markers.json?5TgxNDcza** en el mismo directorio.
JSON proporciona x,y,width,height,pixelRatio por nombre de símbolo.
Los recortes observados son 32×37, pixelRatio=1, anchor=bottom.
Se usa JSON de sprite para recortar PNG independiente; sourceUrl y Asset.sprite conservan origen.
No se carga CSS remoto en la aplicación local.

Estilos computados:
Ammu-Nation background-position 0 0; Barber 0 -88px; Hidden Package 0 -132px;
tamaño CSS 19,02×22, background-size 19,02px (escala de sprite original).
No hay glifo en ::before. Iconos no son fotos.

Diez categorías no tienen entrada en JSON ni reglas CSS específicas:
27037 parachute, 27038 actor, 27039 movie_prop, 27040 slasher_clue,
27041 arcade, 27042 agency, 27043 auto_shop, 3859 clothing_scrap,
3860 placeholder_1, 3869 placeholder_10.
Parachute/actor computan posición por defecto 0% 0%, no un símbolo propio verificable.
No se recorta el primer símbolo como falsa solución; quedan iconAssetId=null y motivo.

## Imágenes y matriz de evidencia

`locations[].media[]` incluye id, type=image, url, mime_type, title, attribution, order.
URLs observadas en media.mapgenie.io/storage/media/. La respuesta inicial ya incluye asociaciones.
El archivo de imagen se solicita al abrir el popup. En los casos comprobados srcset está vacío
y data-src ausente. No se incluyen anuncios, logos, thumbnails del sitio ni imágenes de categorías.
El parser también detecta imágenes explícitas en Markdown/HTML de la descripción, con URL relativa
resuelta contra la página fuente; ese caso se cubre mediante fixture sintética.

En el payload completo: 1.747 puntos con media vacía, 545 con una entrada, tres con dos.
El reporte final puede aumentar fotografías por imágenes embebidas en descripción.
Empates media.order=10 se conservan en el orden del array original.

| Categoría | ID punto | Símbolo | Fotos | Evidencia |
|---|---|---|---|---|
| Ammu-Nation (462) | 12627 | ammu_nation, sprite x0/y0 | 0 | media=[] y popup sin img |
| Hidden Package (492) | 13607 | hidden_package, sprite | 2 | media 91912/91913, ambos src del popup coinciden |
| Random Event (507) | 471053 | símbolo de evento, sprite | 1 | media 91180 y descarga local de muestra |
| Mountain Peak | 12684 | mountain_peak, sprite | 0 | media=[] y popup inspeccionado |
| Building | 12815 | building, sprite | 0 | popup aeropuerto y control visual |
| Miscellaneous | 13236 | miscellaneous, sprite | 0 | popup muelle y control visual |

Caso con fallo real: City Fibers Inc (14019) tiene una imagen histórica HTTP de i.imgur.com.
Se conserva URL, estado failed y motivo: fuera de destinos HTTPS comprobados.
No se reescribe a HTTPS ni se añade un CDN por intuición.

## Límites

No se verificó Cayo Perico ni la totalidad visual de 2.295 puntos. Zoom6/7 y capas alternativas
son configurables según evidencia, pero no descargadas en la muestra inicial.
La equivalencia numérica no corrige errores cartográficos de los datos comunitarios.
Si cambia la fuente, contrastar captura y fixtures antes de modificar el adaptador.
