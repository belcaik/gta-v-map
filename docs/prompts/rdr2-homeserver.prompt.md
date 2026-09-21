# Prompt: replicar en rdr2-map la dockerización y el despliegue de gta-v-map

Trabaja en el repositorio **rdr2-map**. Implementa y verifica su dockerización,
workflows de GitHub Actions y despliegue LAN en mi homeserver usando el alias SSH
**baphomet**. Usa **Podman rootless existente** en el servidor y conserva compatibilidad
con Docker. Quiero una solución operativa, documentada y parametrizada, utilizando
solo servicios gratuitos de GitHub para construir y almacenar las imágenes.

Este prompt contiene lo aprendido en gta-v-map; no necesitas aquella conversación.
Los ejemplos proponen valores para RDR2: verifica su código y el estado real del
servidor antes de aplicarlos. Conserva los datos, progreso y servicios existentes.

## 1. Inspección, alcance y reparto

Lee AGENTS.md, README, handoff, manifiestos, lockfiles y configuración de rdr2-map.
Comprueba rama, cambios locales, origen y rama remota antes de elegir la base. En GTA
la rama local main estaba en un commit inicial vacío mientras origin/main ya tenía
la aplicación: se creó una rama nueva desde la base correcta sin borrar archivos.
No des por hecho que RDR2 está en esa misma situación.

Planifica con criterios de aceptación. Si está disponible, aplica writing-for-agents:
documentación ordenada por pasos, criterios verificables, referencias por necesidad
y un enlace corto desde AGENTS.md hacia la guía operativa. Evita convertir AGENTS.md
en un manual de despliegue.

Usa subagentes paralelos de menor costo para tareas independientes, como hicimos con
GPT-5.6 Luna: runtime/Docker, script SSH, workflows/documentación. Usa worktrees
separados y propiedad explícita de archivos; integra y verifica después. Si el
modelo no está disponible, explica cuál usaste. Los subagentes no despliegan en
paralelo sobre la misma instalación.

Alcance: implementar, probar y desplegar RDR2 en una instalación separada de la LAN.
No reinicies el homeserver ni cambies los servicios de GTA, Caddy u otros proyectos.
La publicación remota de commits, PR, merge o paquete requiere la autorización
correspondiente de esta sesión; este texto no hereda permisos de publicación de GTA.
Puedes completar el despliegue LAN con una imagen transferida por SSH mientras
queda pendiente publicar en GitHub.

**Cierre:** identifica build, arranque, importación, persistencia, rutas HTTP, versión
de runtime y checks de RDR2; registra el plan y la base elegida.

## 2. Referencia comprobada y límites

Estado observado en GTA el 2026-09-21:

- Frontend React/Vite/Leaflet; API Express; SQLite; extracción Python/Selenium.
- Una imagen sirve frontend y API por el mismo origen. SQLite no necesita otro
  contenedor. El scraper se ejecuta fuera de la imagen de producción.
- Homeserver Ubuntu 24.04, x86_64, Podman 4.9.3 rootless, podman-compose 1.0.6,
  usuario SSH UID/GID 1000 y `Linger=yes`. No había Docker; sudo pedía contraseña.
- GTA ocupa HTTP 8080, `~/apps/gta-v-map`, proyecto Compose `gta-v-map` y unidad
  `map-apps-gta-v-map.service`. Mantén esos recursos intactos.
- Se desplegaron 2293 puntos GTA con medios locales. Pasaron escritorio/móvil,
  galería, progreso, recreación del contenedor y reinicio del servicio systemd.
- No se reinició el servidor ni se comprobó desde teléfonos físicos: las vistas
  móviles se validaron con navegador automatizado.
- En el bootstrap la imagen se llevó con `docker save` y se cargó con Podman.
  Posteriormente se integró el PR #2 en main, CI y publicación pasaron en GitHub,
  el paquete GHCR quedó público y el servidor hizo pull anónimo del digest publicado.
  Ambos caminos quedaron verificados; el homeserver usa ahora la imagen GHCR.
  Evidencia: https://github.com/belcaik/gta-v-map/pull/2 y
  https://github.com/belcaik/gta-v-map/actions/runs/35664868975.

Si tienes acceso al checkout vecino `../gta-v-map`, consulta como referencia de
implementación su rama `main` tras el PR #2 (implementación original hasta `2c37da5`):
Dockerfile, .dockerignore, compose.yaml, compose.podman.yaml, .env.docker.example,
scripts/deploy.sh, scripts/tests/test_deploy.py, .github/workflows/{ci,docker}.yml,
docs/deployment.md y docs/context-handoff.md. La implementación ya está
publicada en main; consulta el handoff para el digest desplegado y sus pruebas.

Adapta rutas y comandos al código real de RDR2. Conserva sus IDs, coordenadas,
contratos y esquema de DB; nunca copies datos, SQL específico ni progreso de GTA.

## 3. Comprobar el entorno antes de modificarlo

Ejecuta comprobaciones de solo lectura:

```bash
command -v ssh
command -v scp
command -v rsync
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 baphomet \
  'uname -m; podman --version; podman-compose --version; command -v rsync'
ssh baphomet 'podman info; podman ps; ss -ltn; df -h /home'
ssh baphomet 'loginctl show-user "$USER" -p Linger; systemctl --user show-environment'
```

SSH debe conservar `StrictHostKeyChecking=yes`; no desactives la verificación.
En GTA apareció primero `Host key verification failed` tras un corte eléctrico:
el usuario tuvo que desbloquear el disco del servidor antes de recuperar su SSH
habitual. Comprueba que estás hablando con el servidor correcto; no sustituyas una
clave conocida sin verificar su huella. El alias SSH no implica que el teléfono
resuelva `baphomet`: la URL final debe usar una dirección LAN o DNS local válido.

El cliente GTA no tenía rsync. Se utilizó temporalmente una copia del binario del
servidor porque ambos equipos eran x86_64 y compatibles; no dependas de que siga
existiendo ni lo conviertas en un requisito de diseño. Usa una instalación local
normal. Comprueba dependencias antes de crear carpetas o transferir archivos.

Si `Linger=no`, documenta el requisito `loginctl enable-linger USUARIO_SSH`, que
puede requerir administrador. No pidas contraseñas en el chat. El disco cifrado
seguirá requiriendo desbloqueo tras un apagado: systemd no sustituye ese paso.

**Cierre:** SSH verificado, motor accesible sin sudo, dependencias presentes,
puerto libre, espacio para imagen más dataset de entrada más medios importados.

## 4. Parametrización y arquitectura de la aplicación

Propuesta para aislar RDR2; confirma que el puerto está libre:

| Parámetro | Valor propuesto / propósito |
| --- | --- |
| `SSH_HOST` | `baphomet` |
| `DEPLOY_DIR` | `apps/rdr2-map`, relativo al home remoto |
| `CONTAINER_ENGINE` | `podman` para este servidor; soportar también `docker` |
| `ENV_FILE` | `.env.docker`, local e ignorado por Git |
| `COMPOSE_PROJECT_NAME` | `rdr2-map` |
| `MAP_IMAGE` | `ghcr.io/belcaik/rdr2-map:sha-<SHA completo>`; confirmar origen real |
| `BIND_HOST` | `0.0.0.0` o interfaz LAN elegida |
| `HTTP_PORT` | `8081`, si está libre; GTA usa 8080 |
| `SERVER_DATA_DIR` | `./data`, relativo a `apps/rdr2-map` |
| `DATASET_DIR` | Directorio local RDR2 con manifiesto y archivos referenciados |

El puerto interno puede seguir el diseño de RDR2. En GTA fue 3002; cambia juntos
PORT, el destino del mapeo y el healthcheck si eliges otro. El puerto exterior debe
cambiar sin recompilar frontend ni imagen.

En GTA se parametrizaron `HOST`, `PORT`, `DATA_ROOT`, `DB_PATH`, `STATIC_ROOT`, y
para desarrollo `WEB_HOST`, `WEB_PORT`, `API_TARGET`. El backend conservó loopback
por defecto en desarrollo y escuchó en `0.0.0.0` dentro del contenedor.
El frontend usa URLs relativas para API y medios, sin localhost ni IP del servidor
compilados en el bundle. El proxy Vite es solo para desarrollo.

Sirve el frontend compilado desde la API si la arquitectura real lo permite.
Mantén los 404 de `/api`, `/assets` y `/tiles` fuera del fallback HTML de la SPA.
En GTA `/assets` era compartido por bundles Vite y medios de la API: se buscaron
primero los archivos compilados y después los assets de datos. Comprueba esta
colisión en RDR2; no envíes HTML cuando falta un JS o una imagen.

Añade `/api/health` que compruebe proceso y acceso a SQLite, sin exigir dataset.
Una instalación vacía sana debe explicar cómo importar datos. Valida el dataset
y sus medios por separado del healthcheck. Si RDR2 usa otras rutas, adáptalas.

**Cierre:** ningún cliente necesita configurar un host API; el mismo origen sirve
UI, API y medios; host/puerto son configurables y las rutas inexistentes dan 404.

## 5. Construir la imagen y Compose

Implementa un Dockerfile multi-stage con lockfiles y `npm ci`, ajustado al runtime
y estructura de RDR2. En GTA se usó Node 22.22.3 bookworm-slim, con g++, make y
python3 solo en la etapa build para las dependencias nativas better-sqlite3/Sharp.
Se compiló frontend y backend, se ejecutó `npm prune --omit=dev` para el backend y
se copiaron al runtime únicamente dependencias de producción y salidas compiladas.
No copies node_modules del host ni mezcles binarios de otra arquitectura.

El runtime debe correr sin root, servir el frontend y poder importar con JavaScript
compilado, sin tsx ni TypeScript de desarrollo. En GTA el cwd fue `/app/backend`,
el arranque `node dist/backend/src/index.js` y la importación:

```bash
node /app/backend/dist/backend/src/db/import.js /import/dataset.json
```

Esas rutas son referencia GTA, no hechos de RDR2. Reemplázalas tras inspeccionarlo.
Ajusta también archivos públicos del frontend y schemas requeridos en runtime.
Usa defaults ENV en la propia imagen para que `docker run` funcione sin Compose.
Monta DB y medios en `/data`; nunca los incorpores a capas de la imagen.

Crea .dockerignore que excluya .git, .env y variantes privadas, node_modules, dist
local, entornos Python, caches, datos, capturas, reportes, DB/WAL/SHM y logs.
Versiona los ejemplos de configuración; ignora `.env.docker` y variantes privadas.

Compose debe usar servicio `map`, imagen parametrizada, un solo puerto publicado,
`init: true`, `restart: unless-stopped`, volumen persistente y healthcheck.
Usa esta **forma escalar** para el healthcheck, adaptando el puerto:

```yaml
healthcheck:
  test: >-
    node -e "fetch('http://127.0.0.1:3002/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 5s
```

Lecciones de podman-compose 1.0.6: la forma `CMD` con argumentos JS quedó mal
escapada; un override con otra lista concatenó ambas; cambiar lista por string
solo en el override produjo un error de tipos. La solución verificada fue usar
la cadena shell directamente en el Compose base, sin redefinirla en el override.
Docker Compose también pasó el healthcheck con ese formato.

Override Podman para una imagen UID/GID 1000:

```yaml
services:
  map:
    userns_mode: keep-id:uid=1000,gid=1000
    user: "1000:1000"
```

Esto mapea al usuario SSH como 1000 dentro del contenedor, manteniendo la propiedad
de los datos en el host. En Podman evita el chown recursivo de la rama Docker;
verifica que `/data` es escribible. En Docker prepara el directorio para el UID del
runtime. La carpeta `import/` debe seguir siendo actualizable por el usuario SSH.

**Cierre:** build limpio, ejecución no root, Compose válido, healthcheck sano,
medios fuera de la imagen y escritura persistente con ambos motores previstos.

## 6. Workflows gratuitos de GitHub Actions y GHCR

Implementa dos responsabilidades, adaptando la CI existente:

1. **Verificación:** instalación reproducible, lint, tipos, tests, generación de
   contratos sin drift si aplica, build, E2E y tests del script. Usa fixtures y
   almacenamiento aislados; no hagas scraping de la fuente en CI.
2. **Imagen:** en PR solo build, sin login/push; en push a main y ejecución manual
   autorizada desde la rama por defecto, build y publicación GHCR.

Configuración aplicada en GTA:

- Todos los jobs con `if: github.event.repository.private == false`.
- Runner estándar `ubuntu-24.04`; sin runners grandes.
- Timeout de 30 minutos en CI y 20 en build/publicación.
- `concurrency` por workflow y PR/ref, con `cancel-in-progress: true`.
- `contents: read` general; `packages: write` solo en el job de publicación.
- Login GHCR con `github.actor` y `secrets.GITHUB_TOKEN`; sin PAT ni claves SSH.
- Nombre de imagen en minúsculas a partir de `GITHUB_REPOSITORY`.
- Etiquetas `latest` y `sha-${{ github.sha }}`; labels OCI source y revision.
- Buildx; sin artifacts ni caches de Actions; `DOCKER_BUILD_RECORD_UPLOAD: "false"`
  para desactivar también el archivo automático de build-push-action.
- Acciones Docker fijadas a SHAs comprobados en sus repositorios oficiales. Verifica
  los SHAs antes de usarlos; no inventes hashes ni copies una versión obsoleta a ciegas.
- AMD64 por defecto. Opción manual `linux/amd64,linux/arm64` con QEMU, si hace falta.
  No publiques ARM64 sola bajo las mismas etiquetas: reemplazaría el soporte AMD64.
  Los siguientes pushes automáticos vuelven a AMD64: documenta ese comportamiento
  o parametriza una política estable si el servidor objetivo requiere ARM64.

El repositorio debe ser público para esta estrategia de costo cero. Si es privado,
los jobs se omiten; no cambies su visibilidad sin autorización. Confirma la política
vigente en las fuentes oficiales y no prometas gratuidad futura:

- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/billing/concepts/product-billing/github-packages

Cuando exista autorización de publicación:

1. Publica la rama y abre PR; revisa los resultados de ambos workflows.
2. Integra cuando esté autorizado; el push a la rama principal publica la imagen.
3. En GitHub Packages, comprueba la visibilidad del paquete: GHCR puede crearlo
   privado aunque el repositorio sea público. Hazlo público con autorización para
   permitir pulls anónimos, o explica el requisito que sigue pendiente.
4. Comprueba pull anónimo de la etiqueta SHA con configuración Docker temporal vacía.
5. Configura esa imagen en el servidor. Si necesitas identidad de contenido estricta,
   fija el digest: una etiqueta SHA sigue siendo una etiqueta que puede sobrescribirse.

**Cierre:** workflows validados, permisos/eventos correctos y costos acotados por el
modelo público elegido. Distingue build local, validación estática y ejecución real
de Actions; acredita publicación solo con resultados remotos y pull verificado.

## 7. Script Bash de despliegue

Adapta scripts/deploy.sh o implementa uno equivalente, sin dependencias innecesarias.
Contrato: SSH_HOST, DEPLOY_DIR, ENV_FILE, CONTAINER_ENGINE y DATASET_DIR; opciones
`--help`, `--dry-run`, `--dataset DIR` y `--image-archive TAR`.

Secuencia:

1. Valida opciones, archivos y dependencias locales; limita el motor a docker/podman
   y las rutas remotas a un formato seguro. Rechaza alias con prefijo `-` y traversal.
2. Verifica SSH, motor, Compose y, en Podman, systemd de usuario y linger.
3. Crea el directorio propio RDR2 y copia Compose, override y `.env.docker`.
4. Si se pide dataset, transfiere manifiesto y medios conservando rutas relativas,
   con rsync sin `--delete`, excluyendo DB y archivos auxiliares SQLite.
5. Si hay archivo de imagen, cópialo, ejecuta `docker/podman load` y elimina solo
   ese archivo temporal remoto después de cargarlo. En otro caso, haz pull.
6. Prepara o verifica permisos del directorio persistente según el motor.
7. Si se pidió dataset, ejecuta la importación compilada en un contenedor temporal
   con `--rm -T` e `import/` montado como solo lectura. Conserva el progreso existente.
8. Inicia Docker con `up -d --wait --wait-timeout 120`. En Podman 1.0.6 usa
   `up -d --force-recreate map`, seguido de una espera acotada del healthcheck real.
   En GTA: hasta 30 intentos, pausa 2 s, obtener ID con `podman-compose ... ps -q`
   y comprobarlo mediante `podman healthcheck run ID`. Un curl manual no basta para
   detectar una configuración de healthcheck rota.
9. En Podman instala/habilita la unidad de usuario de la siguiente sección.
10. Informa éxito solo cuando pase la salud. Dry-run no conecta ni modifica archivos
    y termina indicando explícitamente que fue una simulación.

Todos los transportes, incluido `rsync -e`, usan BatchMode y verificación estricta
de clave. Escapa argumentos del shell remoto; no uses eval ni source sobre .env.
Un fallo de preflight debe terminar antes de transferir o arrancar servicios.

**Cierre:** shellcheck/bash -n y tests aislados pasan, incluidos rutas con espacios,
validación de entradas, fallo SSH, dry-run, exclusión de SQLite, orden pull/import/up
y rama Podman con archivo sin acceso al registro.

## 8. Arranque automático rootless

Unidad RDR2 propuesta: `map-apps-rdr2-map.service`, derivada de DEPLOY_DIR reemplazando
`/` por `-`. Instálala en `~/.config/systemd/user/` del usuario SSH:

```ini
[Unit]
Description=Local RDR2 map
After=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=%h/apps/rdr2-map
ExecStart=/usr/bin/env podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml up -d map
ExecStop=/usr/bin/env podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml stop map
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=default.target
```

Ejecuta `systemctl --user daemon-reload` y `systemctl --user enable --now UNIDAD`.
Comprueba tanto unidad activa/habilitada como contenedor saludable: Type=oneshot
no monitoriza continuamente la salud del proceso. El contenedor tiene su política
de reinicio. Prueba reiniciar esta unidad, no el homeserver completo.

Referencia de mapeo de usuarios:
https://docs.podman.io/en/v4.9.3/markdown/podman-run.1.html

**Cierre:** unidad habilitada, datos escribibles por el usuario correcto, aplicación
accesible tras reiniciar la unidad y progreso preservado. No declares un reboot
probado si solo reiniciaste el servicio.

## 9. Primer despliegue, sin esperar a GHCR

Si la imagen todavía no está publicada, usa el camino que funcionó en GTA:

```bash
cp .env.docker.example .env.docker
# Configura: proyecto rdr2-map, puerto 8081 libre, SERVER_DATA_DIR=./data,
# MAP_IMAGE=localhost/rdr2-map:local y los parámetros reales de RDR2.
docker build -t localhost/rdr2-map:local .
docker save -o /tmp/rdr2-map.tar localhost/rdr2-map:local

SSH_HOST=baphomet DEPLOY_DIR=apps/rdr2-map CONTAINER_ENGINE=podman \
  ./scripts/deploy.sh --dry-run --image-archive /tmp/rdr2-map.tar \
  --dataset RUTA_DATASET_RDR2
SSH_HOST=baphomet DEPLOY_DIR=apps/rdr2-map CONTAINER_ENGINE=podman \
  ./scripts/deploy.sh --image-archive /tmp/rdr2-map.tar \
  --dataset RUTA_DATASET_RDR2
```

Sustituye RUTA_DATASET_RDR2 por el directorio validado; no asumas que es data/full.
MAP_IMAGE debe coincidir exactamente con la etiqueta dentro del archivo.
En actualizaciones omite `--dataset` si no hay nuevos datos. Mientras la etiqueta
sea local, sigue pasando `--image-archive`; sin esa opción el script intenta pull.
Después de publicar GHCR, cambia MAP_IMAGE a la referencia publicada y omite el tar.

Importar un dataset nuevo no migra el progreso del PC. Para migrarlo, conserva una
copia consistente de su DB y medios, con la API detenida o backup nativo de SQLite,
y configura el destino antes de arrancar. No copies una DB viva con scp/rsync.
La instalación RDR2 nunca comparte el volumen de GTA.

**Cierre:** servicio accesible desde la LAN, dataset RDR2 correcto, medios locales,
GTA continúa funcionando y los recursos de ambas instalaciones están separados.

## 10. Verificación, respaldos y entrega

Ejecuta checks del proyecto, tests del script, shellcheck, actionlint y diff --check.
Construye la imagen y verifica primero con dataset/DB sintéticos aislados. Después
valida en el servidor con datos reales:

- HTML, bundles JS/CSS, API, iconos, fotos y tiles responden correctamente.
- 404 de recursos inexistentes siguen siendo 404, sin devolver la SPA.
- Escritorio y viewport móvil cargan el mapa; galería/filtros funcionan.
- Sin errores JS ni peticiones externas inesperadas tras importar recursos.
- Marca un punto de control, comprueba desde otro contexto de navegador, recrea
  el contenedor y reinicia la unidad: conserva progreso. Restaura el valor inicial.
- Reimportar una muestra preserva progreso; usa almacenamiento aislado si cambiar
  la selección activa alteraría el dataset personal.
- Comprueba dueño/permisos de SQLite y estado real de salud de Podman.
- Comprueba que GTA sigue accesible y saludable. No cambies sus marcas para probar RDR2.

Respaldo: detén el servicio propio, copia todo SERVER_DATA_DIR (DB, WAL/SHM que
existan y medios) más configuración/referencia de imagen y arranca de nuevo.
Prueba una restauración en otro directorio. Rollback de código: referencia de imagen
anterior y despliegue sin importación; si cambió el esquema, usa respaldo compatible.
No uses podman/docker system prune, down -v ni limpieza global como parte del flujo.

Documenta instalación, parámetros, comandos de ambos motores, carga por archivo,
publicación GHCR, actualizaciones, backups, rollback, salud, permisos, linger y disco
cifrado. Añade README → guía y AGENTS.md → guía para cambios de despliegue. Actualiza
handoff/tareas con comandos realmente ejecutados y limitaciones.

Entrega final: rama/commits, archivos principales, URL LAN real, resultado de checks,
estado de systemd y del contenedor, persistencia verificada, y qué falta de publicación
GitHub si no estaba autorizada. Las IP privadas, credenciales, datos, capturas y DB
permanecen fuera del contenido versionado y de las imágenes públicas.

**Cierre global:** RDR2 utilizable en la LAN con Podman, GTA intacto, persistencia y
reinicio de servicio comprobados; workflows listos y su ejecución/publicación
claramente diferenciadas de lo que solo se verificó localmente.
