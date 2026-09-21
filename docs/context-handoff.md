# Handoff

## Podman en baphomet — 2026-09-21

Despliegue real operativo en `baphomet`, puerto HTTP 8080; ubicación
`~/apps/gta-v-map`. Las direcciones LAN permanecen fuera de Git.
El usuario desbloqueó el disco tras el corte eléctrico y autorizó usar Podman.
Servidor: Ubuntu 24.04, Podman 4.9.3 rootless, podman-compose 1.0.6, `Linger=yes`.
No se instaló Docker ni se modificaron los servicios existentes.

- `CONTAINER_ENGINE=podman` selecciona el override `compose.podman.yaml` con
  `keep-id:uid=1000,gid=1000`; SQLite/medios pertenecen al usuario SSH en el host.
- Primera imagen: `localhost/gta-v-map:030b6c5`, transferida mediante `docker save`
  y `--image-archive`; no hubo push ni publicación en GHCR. `.env.docker` local y
  remoto apuntan a esa etiqueta. Para actualizar, proporcionar de nuevo el archivo
  o cambiar a una etiqueta GHCR publicada, como explica [despliegue](deployment.md).
- Dataset `data/full` importado: 2293 puntos. El progreso es el del servidor;
  no se copió la DB del PC. Las marcas usadas para validación se restauraron.
- Servicio `map-apps-gta-v-map.service` de systemd de usuario habilitado/activo.
  Arranque automático configurado tras desbloquear el disco; no se reinició el host.
- Healthcheck real de Podman saludable. Se corrigió el formato de Compose a cadena
  shell porque podman-compose 1.0.6 construye incorrectamente las comillas de `CMD`.
  Docker Compose también pasó `up --wait` con ese formato, en almacenamiento aislado.
- `frontend/tests/real-check.mjs` contra la URL LAN: escritorio/móvil, tres controles
  geográficos, fotos/galería, progreso y recarga pasan; cero solicitudes externas
  y cero errores JS. Reporte y capturas en `reports/` ignorado por Git.
- Despliegue repetido con el script, recreación del contenedor y reinicio de la unidad
  systemd: siguen los 2293 puntos y la marca de control; valor inicial restaurado.
- Cinco tests del script (`python3 -m unittest discover -s scripts/tests`),
  shellcheck, bash -n, actionlint y diff --check pasan. Tests añadidos al workflow CI.
- Faltaba rsync en el cliente: para esta ejecución se usó una copia temporal del
  binario del servidor bajo `/tmp/gta-deploy-bin`. Instalar rsync localmente antes de
  futuras transferencias `--dataset`; el script detecta su ausencia antes de modificar el host.

Pendiente opcional: publicar la rama/workflow y paquete GHCR para actualizaciones
sin archivo local; comprobación desde dispositivos físicos adicionales de la LAN.

## Docker y homeserver — 2026-09-21

Rama actual: `feat/docker-homeserver`, creada desde `origin/main` (`c1a1768`, PR #1
ya integrado). La rama local main seguía en el commit inicial; se conservaron los
datos y archivos ignorados al abrir esta rama. El registro anterior queda debajo
como evidencia histórica, no como estado actual de main.

T10 implementado con tres subagentes GPT-5.6 Luna en worktrees separados: runtime,
script y CI; integración/documentación por el agente principal. Entrada operativa:
[despliegue](deployment.md), incluyendo réplica en RDR2. Una imagen sirve UI/API;
Compose publica un puerto LAN configurable y conserva SQLite/medios en bind mount.
El script usa SSH verificado, importa datasets explícitos y conserva progreso.
Workflows públicos con runners estándar, sin artifacts/cachés; GHCR publica desde
main. La opción manual multi-arquitectura está implementada pero no probada en ARM64.

Validación local de la rama integrada:

- `npm run lint`, `npm run types`, `npm run build`: OK.
- `PATH="$PWD/.venv/bin:$PATH" npm test`: dos tests Node y seis Python pasan.
- `CHROME_PATH=/usr/bin/google-chrome-stable npm run test:e2e`: cuatro escenarios pasan.
- `docker build -t gta-v-map:smoke .`: construcción AMD64 limpia con lockfiles; imagen
  final como usuario node, sin compiladores ni dependencias de desarrollo.
- Smoke con dataset sintético, volumen aislado y puerto temporal: UI, API, icono,
  tile y 404 correctos; marcar, recrear contenedor y reimportar conserva progreso.
  Playwright contra la imagen: escritorio y móvil cargan bundles, seis marcadores,
  tiles y progreso compartido sin errores JS.
- Compose real con puerto/directorio/proyecto temporales: `up --wait` saludable y
  `/api/health` accesible en el puerto elegido. Contenedores/volúmenes de prueba retirados.
- `actionlint` 1.7.12, `shellcheck`, `bash -n scripts/deploy.sh`, dry-run con dataset
  y `git diff --check`: OK.
- Ejecución del script contra `baphomet`: falla en preflight con
  `Host key verification failed`, antes de copiar archivos o alterar el servidor.

En esta etapa inicial no hubo publicación ni despliegue real. El bloqueo SSH se
resolvió y la ejecución remota está acreditada en el seguimiento Podman de arriba.

## Etapa anterior: implementación y publicación P0

Fecha: 2026-09-21. Rama `feature/gta-v-local-p0`.
Original base: `321ce242975f09a8bf0100669270faf94651bbb1` (empty initial commit).
Publication authorized by the user: public `belcaik/gta-v-map`, feature PR into `main`.
Implementation is recorded as focused Conventional Commits, without co-author trailers.
Use `git log --oneline main..HEAD` to inspect the implementation commits.
Base inspeccionada: `belcaik/rdr2-map@a6f8e47046c3bba11b0492c5858f4e50f915a33b`.
El checkout vecino RDR2 mantiene exactamente sus cambios ajenos; no tocarlo.
Propietario de esta etapa: Codex. No hubo agentes simultáneos.

## Estado funcional

Recorrido real operativo: Selenium → captura → normalización → PNG/manifiesto → SQLite/API →
Leaflet/iconos/galería/progreso. No es solo una demo.
La app de desarrollo queda en http://127.0.0.1:5175 con API 127.0.0.1:3002.
Si los procesos ya no están, `npm run dev:api` y `npm run dev:web` desde raíz.
La DB local contiene el dataset ampliado Los Santos/Atlas z3–5.

| Cobertura ampliada | Resultado |
|---|---|
| Categorías observadas | 74 |
| Puntos descubiertos / importables | 2295 / 2293 |
| Iconos recortados | 64 downloaded; 10 sin símbolo verificable |
| Fotografías | 551 downloaded; 1 failed por HTTP/host no autorizado |
| Descubrimiento de imágenes | 549 present, 1744 none, 0 pendientes/fallidos |
| Tiles | 166 downloaded, z3–5 Atlas |
| Cobertura | complete=false, capa/zoom seleccionados y anomalías explícitas |

Muestra inicial: 12 puntos, 64 iconos, tres fotos, 166 tiles, sin fallos de descarga.
Archivos: `data/sample/`, `data/full/`, captura legítima original `data/real/capture.json`.
Reporte canónico de esta ejecución: `data/full/report.json`. Recursos/importación ocupan
varios GB porque las fotos se normalizan a PNG; no versionarlos.
Progreso de los controles fue restaurado después de pruebas.

## Verificaciones ejecutadas

- `npm run install:all` con npm ci en copia temporal sin node_modules; Python venv nuevo
  con `pip install -r scraper/requirements.lock`: OK, Node22.22.3/Python3.12.11.
- `npm run demo` en esa copia limpia: genera e importa seis fixtures sin red.
- `npm test`: integración Node pasa (contrato, importación doble, rollback, parcial/completo,
  progreso, reapertura DB, API, imágenes y rutas); seis tests Python pasan.
- `npm run lint`, `npm run types`, `npm run build`: OK. Build con Markdown separado por lazy import.
- `CHROME_PATH=/usr/bin/google-chrome-stable npm run test:e2e`: cuatro tests pasan
  (offline, galería/progreso/filtros, estados de medios, móvil y vacío).
  La versión de tres escenarios también se ejecutó desde instalación limpia.
- `npm audit --prefix backend` y `npm audit --prefix frontend`: cero vulnerabilidades reportadas.
- `python -m scraper.run --output data/sample --phase validate`: OK.
- `python -m scraper.run --capture data/real/capture.json --output data/sample --resume`:
  OK, reusa archivos sin navegador/descargas nuevos.
- `python -m scraper.run --output data/full --phase validate`: OK, verificó todos los archivos.
- `python -m scraper.run --capture data/real/capture.json --output data/full --resume`:
  OK (exit 0), conserva los 781 archivos descargados y el único asset rechazado, sin pendientes.
- `npm run verify:import --prefix backend -- ../data/full/dataset.json`: OK;
  importó el dataset real dos veces, marcó entre importaciones, reabrió SQLite y conservó found.
- Desde frontend, `CHROME_PATH=/usr/bin/google-chrome-stable node tests/real-check.mjs`:
  OK primero con muestra y luego con 2293 puntos. Cero solicitudes externas y cero errores JS;
  fotos locales, orden, ampliación/Escape, reload/progreso, filtros, zoom/pan y móvil.
- `python -m scraper.verify_source` + `node tests/projection-check.mjs` (desde frontend,
  CHROME_PATH configurado): cuatro controles × tres zoom, error máximo 9.777e-12 px.
- Revisión visual realizada abriendo PNG desktop/móvil/galería, montaña, aeropuerto y muelle.
- Whitespace comprobado incluyendo archivos nuevos con git diff --no-index --check;
  revisión de archivos publicables sin dumps, PNG de terceros, DB, secretos ni rutas privadas.

Capturas locales: `reports/real-desktop.png`, `reports/real-gallery.png`,
`reports/real-mobile.png`, `reports/real-mount-chiliad-peak.png`,
`reports/real-los-santos-international-airport.png`, `reports/real-del-perro-pier.png`.
Reportes: `reports/real-check.json`, `reports/projection-check.json`.
CI is configured; the original implementation stage verified its commands locally.

## Publication validation (2026-09-21)

- Re-ran `npm run lint`, `npm run types`, `npm test`, `npm run build`:
  all passed; one backend integration test and six Python tests.
- Re-ran `CHROME_PATH=/usr/bin/google-chrome-stable npm run test:e2e`:
  all four scenarios passed using an isolated synthetic database.
- README, contribution workflow and PR template are now in English. README documents
  installation, real extraction, demo, configuration, progress persistence, checks,
  coverage limitations and Conventional Commits without attribution trailers.
- Publication excludes local databases, extracted assets, reports, captures and secrets.
  Existing personal progress remains local and is not reset by these checks.
- `npm run generate --prefix backend` produced no type drift. Both npm audits
  reported zero vulnerabilities. The staged diff passed whitespace and excluded-file checks.
- Public repository: https://github.com/belcaik/gta-v-map
- Open PR: https://github.com/belcaik/gta-v-map/pull/1
  (`feature/gta-v-local-p0` into `main`). Main retains the original empty baseline;
  the complete application remains on the feature branch until review and merge.
- GitHub Actions runs the checks on push and PR. For current remote results, run
  `gh pr checks 1 --repo belcaik/gta-v-map` or inspect the PR Checks tab.
  Remote checks were still running when this publication record was written.
- No merge or public website deployment was performed. Next action: review PR #1,
  inspect its final CI results and explicitly authorize a merge if desired.

## Fallos encontrados y resueltos

Acceso HTTP directo 403, pero Selenium normal 200; no bypass. Un timeout de carga provocado
por espera de página se resolvió usando page_load_strategy=eager y espera explícita de datos.
Sharp detectó libvips global durante instalación: usar SHARP_IGNORE_GLOBAL_LIBVIPS=1.
Se actualizaron dependencias vulnerables indicadas por npm audit, sin cambio de stack.
Se corrigió reuso de un nodo DOM único entre marcadores de misma categoría;
cada marcador crea su nodo a partir del icono cacheado, prueba de seis imágenes.
Se corrigió un error sintáctico durante desarrollo y un selector E2E que también veía
contenido de dialog cerrado. Los checks finales no están desactivados.
La validación de reanudación dejó de reencodificar PNG: ahora decodifica y verifica hash/metadatos.
El proceso anterior ya había descargado todo; su validación redundante se interrumpió para
usar la fase validate actual (exit 0) y reanudación con la implementación corregida.

## Límites y siguiente acción

No hay bloqueo global de acceso: la integración real Los Santos está comprobada.
Quedan límites concretos de cobertura:

1. Diez categorías sin entrada de sprite/regla CSS: fallback `?` con motivo, no iconos inventados.
   Desbloqueo: nuevo recurso/mapeo verificable publicado por fuente o exportación legítima.
2. Punto 14019 City Fibers Inc enlaza HTTP i.imgur.com: asset failed, procedencia intacta.
   Desbloqueo: verificar destino HTTPS y política de acceso antes de ampliar allowlist.
3. Puntos 13344/14162 fuera de extensión: requieren corrección/evidencia de fuente.
4. Cayo Perico no inspeccionado; capas alternativas y zoom6/7 configurables pero no descargados aquí.
5. Con todas las categorías activas a zoom bajo hay solapamiento; filtrar categorías o acercar.
   No se añadió clustering ni se sustituyeron símbolos por círculos.

Siguiente acción concreta: abrir la app y revisar la selección de categorías deseada; para
ampliar detalle, ejecutar una nueva extracción Atlas z3–7 y reimportar (conserva progreso).
Para trabajo de código, elegir en tasks el límite de cobertura que se pueda verificar;
leer source-discovery y data-contract antes de modificar el adaptador.
