# Contrato canónico v1

Especificación machine-readable: `schemas/dataset.schema.json` (JSON Schema draft-07).
Tipos TypeScript generados con `npm run generate --prefix backend`; nunca editarlos a mano.
Python usa jsonschema; API y navegador usan Ajv. Las invariantes relacionales se comprueban
en ambos runtimes con los mismos casos de `fixtures/contract-cases.json`.
Cambios incompatibles requieren nueva versión y migración, no un cast de TypeScript.

## Dataset e identidad

`schemaVersion: 1`, `gameId: gta-v`, `source` (URL, kind live/capture/synthetic y evidencia),
`extractedAt`, `runId`, `maps`, `categories`, `waypoints`, `assets`, `tiles`, `coverage`.
No se admiten propiedades desconocidas salvo las extensiones declaradas en el esquema.
IDs son strings originales, limitados a letras, números, guion y underscore para rutas seguras.
La extracción observada usa mapa 27, categorías numéricas y locations.id.

La identidad del punto/progreso es `(gta-v, mapId, waypointId)`; cambiar capa base no cambia
su identidad. v1 carga una capa base por extracción. La captura conserva otras capas observadas.
Iconos tienen ID `icon-{categoryId}`; fotos con media.id usan `media-{id}`.
Imágenes embebidas sin ID usan `description-{SHA256(URL absoluta)}`: misma URL, misma identidad.
Hash de contenido deduplica archivos, no sustituye IDs de fuente. Cualquier ID repetido en
el dataset se rechaza; un media.id observado con distintas URLs se rechaza durante normalización.

## Mapas y coordenadas

`MapConfig` contiene id, nombre de capa, CRS simple/EPSG3857, descripción de ejes,
transformación afín de seis coeficientes, límites en orden Leaflet
`[[sur,oeste],[norte,este]]`, tileSize=256, minZoom/maxZoom, xyz/tms,
plantilla local `/tiles/{mapId}/{z}/{x}/{y}.png` y evidencia.

`transform=[latX,latY,latOffset,lngX,lngY,lngOffset]`:
`lat=latX*x+latY*y+latOffset`; `lng=lngX*x+lngY*y+lngOffset`.
La UI aplica esta operación exclusivamente en `shared/coordinates.ts`.
Python solo la evalúa para validar límites; no reescribe coordenadas.
GTA V observado usa identidad `[1,0,0,0,1,0]`.
Nunca aplicar los coeficientes empíricos de RDR2.

## Categorías, puntos y fotos

Categoría: id, name, group nullable, iconAssetId nullable, iconReason nullable.
Sin iconAssetId se exige motivo. El asset referenciado debe ser category-icon.
Metadatos del sprite se guardan en `Asset.sprite`: name,x,y,width,height en píxeles originales.

Waypoint: id, mapId, categoryId, title, description, descriptionFormat text/markdown/html,
coordinates originales x/y, sourceUrl, images, imageDiscovery, discoveryError.
Descripción no confiable: la UI sanitiza HTML/Markdown y excluye imágenes remotas embebidas;
esas imágenes recorren la galería local. Los enlaces HTTPS útiles se conservan.

`images` es una lista de asociaciones `{assetId,order,caption,attribution}`.
Orden entero único por punto. Se conserva el orden fuente estable, incluso cuando media.order
empata: se asignan índices 0..n-1 después de ordenar establemente por media.order.
Dos puntos pueden compartir un asset. Dos assets pueden compartir archivo.
Iconos jamás sustituyen fotografías.

Estados de descubrimiento:

| Estado | Semántica |
|---|---|
| uninspected | No se inspeccionó el campo/fuente de imágenes; lista vacía |
| none | Se inspeccionó y no hay fotos; lista vacía |
| present | Hay asociaciones, independientemente del éxito de descarga |
| failed | Inspección falló; lista vacía y motivo obligatorio |

El adaptador observado inspecciona `locations[].media` y descripción. No necesita un endpoint
de detalle adicional para las fotos verificadas. Si el payload cambia se debe actualizar productor,
consumidor y fixtures; no asumir ausencia por un error.

## Archivos

Asset: id, kind category-icon/waypoint-image, sourceUrl, path relativo nullable,
mime, bytes, width, height, sha256, status y error. MIME local siempre image/png:
se decodifica JPEG/PNG/WebP y se normaliza a PNG. Se conservan URL y recorte de procedencia.
La URL de procedencia puede ser HTTP histórico; el downloader únicamente permite HTTPS
en los cuatro hosts comprobados. La procedencia no autoriza una petición.

| Estado | Semántica |
|---|---|
| pending | No descargado; path=null |
| downloaded | Archivo decodificado, MIME/dimensiones/hash/tamaño comprobados |
| failed | Descarga o validación falló; path=null y error obligatorio |

Archivos `icons/{sha256}.png` y `images/{sha256}.png`, deduplicados dentro de cada tipo.
Se mantiene la separación icono/foto aun si ambos tuvieran bytes idénticos.
Tile: mapId,z,x,y,sourceUrl,path,sha256,status,error; PNG local 256×256.
Su ruta exacta es `tiles/{mapId}/{z}/{x}/{y}.png`.
Escritura temporal y rename; nunca confiar en una extensión ni en Content-Type sin decodificar.

Se rechazan versiones, referencias huérfanas, duplicados, coordenadas no finitas/fuera de límites,
órdenes duplicados, tipo incorrecto de asset, traversal y metadatos de descargado incompletos.
El importador además comprueba contenido real, hash, dimensiones y confinamiento por realpath.

## Cobertura, importación y progreso

`coverage`: complete, filtros aplicados, total de waypoints descubiertos y omisiones explicadas.
`report.json` resume iconos/fotos/tiles por estado, categorías sin icono, puntos con/sin imágenes,
no inspeccionados/fallidos y errores individuales.
Un scrape con selección, fallos o puntos omitidos nunca es completo.
Actualmente el extractor siempre declara selección de capa/zoom y complete=false de forma conservadora.
`--sample 0` significa todos los puntos descubiertos, no todos los mapas/capas ni todos los recursos.

SQLite user_version=1. Importación en transacción con upsert, nunca INSERT OR REPLACE.
Los archivos se verifican antes de modificar tablas. La instalación de archivos precede al commit SQL;
un fallo de disco puede dejar archivos sin referencia, pero no reinicia progreso.
Parcial conserva ausentes. Complete=true válido desactiva ausentes solo en sus mapas, sin borrarlos.
El historial y progreso permanecen; reaparición reactiva el punto.
La UI cuenta puntos activos, no progreso histórico de retirados.

Progreso: game_id/map_id/waypoint_id, found 0/1, updated_at ISO, tabla independiente.
Solo `npm run reset-progress --prefix backend -- MAP_ID` borra explícitamente ese progreso.
Filtros son preferencias del navegador (localStorage); progreso es durable en SQLite.

## API local

| Método/ruta | Respuesta |
|---|---|
| GET /api/dataset | Dataset v1 validado: puntos activos de los mapas de la última importación, categorías, assets y tiles |
| GET /api/categories | Lista {category,icon:Asset\|null,iconUrl:string\|null}, con URL local resuelta |
| GET /api/waypoints/:mapId/:id | Waypoint del contrato, images ordenadas; 404 si ausente/inactivo |
| GET /api/progress | Lista {mapId,waypointId,found:0\|1,updatedAt} |
| PUT /api/progress/:mapId/:id | Body exacto {found:boolean}; misma fila de progreso; 400 inválido, 404 desconocido |
| GET /assets/:assetId | PNG local por referencia manifestada; 404 si pendiente/fallido/ausente |
| GET /tiles/:mapId/:z/:x/:y.png | PNG local manifestado; 404 si ausente |

Los DTO adicionales se validan con schemas/api.schema.json en backend y navegador.
No hay proxy remoto, descarga implícita ni listado de directorios. Las categorías resuelven
su icono con asset.kind/status y la ruta estable `/assets/{iconAssetId}`.
La API nunca devuelve paths absolutos. Errores JSON tienen `error`.
Sin dataset, GET /api/dataset responde 404 con instrucción de importar o ejecutar demo.
