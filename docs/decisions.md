# Decisiones

## 2026-09-21 · Reutilización
Hecho: gta-v-map era un repositorio vacío, HEAD 321ce24, main, sin remote.
El checkout vecino RDR2 tenía cambios ajenos. Se inspeccionó la base remota exacta
`belcaik/rdr2-map@a6f8e47046c3bba11b0492c5858f4e50f915a33b` en copia temporal separada.
Se reutilizan manifests/lockfiles npm, configuración TS/ESLint, patrón React-Leaflet y licencia.
Se reemplazan importador/extractor/componentes específicos: borraban progreso, confundían fotos/iconos
y usaban una transformación de otro juego. No se copia DB, tiles ni dataset RDR2.
Rama local autorizada `feature/gta-v-local-p0`, sin remoto nuevo ni publicación.

## 2026-09-21 · Transporte de extracción
curl HEAD/GET devolvieron 403. Chrome normal con Selenium devolvió 200 y cargó la aplicación.
Se mantiene Selenium: no stealth, suplantación, cookies exportadas, login ni evasión.
Las descargas se hacen con fetch normal dentro del navegador, redirect:error y credentials:omit,
con lista cerrada de hosts comprobados, validación DNS y límites. Concurrencia 1 evita
compartir un WebDriver entre threads. Fallos se registran y reintentos son acotados.
No cambiar herramienta solo por familiaridad.

## 2026-09-21 · Medios y seguridad
JSON de sprite con rectángulos 32×37 permite recortar a PNG autónomo; no se incluye CSS remoto.
Diez nombres de categoría no existen en sprite ni tienen regla CSS específica. La fuente usa
posición por defecto en esos casos. Se muestra fallback con motivo en vez de copiar un símbolo erróneo.
PNG local simplifica MIME, dimensiones y elimina contenido activo SVG; fotos JPEG/WebP se transcodifican.
Tradeoff: más disco. La deduplicación es por SHA256 del PNG normalizado.
URLs de terceros no comprobados quedan failed, con procedencia intacta.

## 2026-09-21 · Dependencias y runtimes
Node 22.22.3 cumple Vite 7; Python 3.12.11 evita las dependencias antiguas de Python de la base.
Se conservan npm y sus dos lockfiles, actualizados con fixes compatibles reportados por npm audit.
Ajv/jsonschema validan el contrato; json-schema-to-typescript evita tipos manuales;
Sharp verifica medios en importación; Pillow transforma medios; React Markdown con rehype
raw/sanitize preserva formato sin HTML ejecutable; Playwright solo para pruebas UI.
Sharp actualizado a 0.35.4 por avisos libvips de npm audit; no cambio de stack.
En sistemas con libvips global usar SHARP_IGNORE_GLOBAL_LIBVIPS=1 para el binario empaquetado.

## 2026-09-21 · Progreso y cobertura
Progreso separado por juego/mapa/punto. Importación parcial nunca deduce retiradas.
Se rechaza complete=true si tiene filtros/omisiones/fallos. Extracción actual marca parcial incluso
con --sample 0 porque selecciona capa/zoom. Desactivación de ausentes existe y tiene prueba sintética,
pero no se aplica a esta extracción real incompleta.
Dos coordenadas imposibles para la extensión se omiten con IDs y valores en report.json.

## 2026-09-21 · Interfaz
Borrador visual funcional sin dirección de marca aportada; ENERGY 1 / RHYTHM 1 / MOTION 1.
Mapa ocupa el espacio principal, panel lateral para grupos reales y detalle superpuesto cerrable.
Verde oscuro identifica acciones de progreso; símbolos multicolor provienen de la fuente.
Tipografía del sistema evita descargas y mejora legibilidad offline. Solo sombra del detalle
para indicar superposición; sin animaciones decorativas. En móvil, categorías plegables y
detalle inferior conservan un acceso explícito al mapa.
