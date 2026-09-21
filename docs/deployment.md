# Despliegue en homeserver

Una imagen contiene la API Express y el frontend compilado. El navegador usa el
mismo origen para HTML, API, fotos y tiles: cualquier dispositivo de la LAN abre
`http://HOST_LAN:PUERTO`, sin configurar la dirección de la API en cada cliente.
SQLite guarda un progreso compartido entre dispositivos; los filtros siguen siendo
locales a cada navegador. El servicio no tiene usuarios ni autenticación: úsalo en
una LAN de confianza y limita el puerto a esa red en el firewall del servidor.

La imagen contiene código, nunca la extracción ni el progreso. El scraper sigue
ejecutándose localmente. El directorio persistente del servidor contiene SQLite y
los medios importados; recrear el contenedor no los borra.

## 1. Parametrizar

Desde la raíz del repositorio:

```bash
cp .env.docker.example .env.docker
```

Edita `.env.docker` (ignorado por Git):

| Parámetro | Decisión |
| --- | --- |
| `MAP_IMAGE` | Imagen GHCR y versión; usa `sha-<SHA completo>` para fijar un despliegue reproducible. `latest` sigue la última publicación de main. |
| `COMPOSE_PROJECT_NAME` | Identidad de la instalación; conserva el nombre al actualizar. Usa otro para RDR2. |
| `BIND_HOST` | `0.0.0.0` publica en las interfaces del servidor; una IP LAN específica restringe la interfaz. `127.0.0.1` permite acceso solo desde el servidor. |
| `HTTP_PORT` | Puerto libre del homeserver que utilizarán los navegadores. |
| `SERVER_DATA_DIR` | Directorio persistente del homeserver; una ruta relativa se resuelve desde el directorio de despliegue. |

El puerto interno del contenedor es 3002. Cambiar `HTTP_PORT` modifica el puerto
publicado sin recompilar la imagen. `HOST`, `PORT`, `DATA_ROOT`, `DB_PATH` y
`STATIC_ROOT` son parámetros de la aplicación; Compose fija sus valores internos.
El proceso corre como UID/GID 1000, por lo que el directorio de datos debe permitir
escritura a ese usuario. `.env` configura desarrollo; `.env.docker` configura Compose.

Para desarrollo sin Docker, consulta `.env.example`: `HOST`/`PORT` controlan la API,
`WEB_HOST`/`WEB_PORT` el servidor Vite y `API_TARGET` su proxy. En producción las
peticiones relativas eliminan la necesidad de un host de API en el frontend.

**Comprobación:** `docker compose --env-file .env.docker config` debe mostrar el
puerto, imagen y montaje elegidos. Con Podman, incluye el override:
`podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml config`.
Mantén direcciones privadas solo en archivos locales.

## 2. Construir y publicar en GitHub

La publicación de este proyecto está verificada: [PR #2](https://github.com/belcaik/gta-v-map/pull/2),
[workflow](https://github.com/belcaik/gta-v-map/actions/runs/35664868975) y
[paquete público GHCR](https://github.com/belcaik/gta-v-map/pkgs/container/gta-v-map).
El homeserver ya usa un digest de GHCR; la referencia exacta y las pruebas están
registradas en [handoff](context-handoff.md). Los pasos siguientes sirven para
actualizaciones y para replicar el proceso.

Para construir localmente sin subir nada:

```bash
docker build -t gta-v-map:local .
```

Para probar esa imagen, usa una configuración separada con `MAP_IMAGE=gta-v-map:local`,
un `COMPOSE_PROJECT_NAME` de prueba, un `HTTP_PORT` libre y un `SERVER_DATA_DIR`
nuevo. Prepara permisos de escritura para UID 1000 en ese directorio y ejecuta
`docker compose --env-file ARCHIVO_DE_PRUEBA up -d --wait`. La API puede estar sana
sin dataset: importa una muestra antes de evaluar el mapa. Este ensayo no debe
apuntar al directorio que contiene tu progreso personal.

El workflow Docker construye desde los lockfiles con `npm ci`. Un PR comprueba la
construcción sin publicar; main publica en `ghcr.io/belcaik/gta-v-map`. La imagen
sirve tanto frontend como API: no hacen falta contenedores Nginx, Python o SQLite.

1. Sube la rama y abre un PR siguiendo el flujo de contribución del repositorio.
2. Comprueba el workflow de aplicación y el workflow Docker; integra el PR cuando
   corresponda. El push a main activa la publicación.
3. En Actions, abre la ejecución Docker y confirma la publicación de `latest` y
   `sha-<SHA completo>`. También puedes ejecutar el workflow manualmente desde main.
   Por defecto genera `linux/amd64`; si el homeserver usa ARM64 (`uname -m` muestra
   `aarch64`), elige `linux/amd64,linux/arm64` en la ejecución manual. Esa opción
   publica un manifiesto para ambas arquitecturas y tarda más por la emulación.
   En ARM64 fija esa etiqueta SHA: los pushes automáticos siguientes vuelven a
   construir AMD64; repite la publicación manual multi-arquitectura al actualizar.
4. En tu perfil de GitHub → Packages → paquete `gta-v-map` → Package settings,
   cambia la visibilidad a **Public** para permitir pulls anónimos. La primera
   publicación de GHCR puede crear un paquete privado aunque el repositorio sea público.
5. Copia la etiqueta SHA publicada a `MAP_IMAGE` en `.env.docker`.

El workflow usa `GITHUB_TOKEN` con permiso `packages: write`; no requiere un PAT
guardado como secreto ni acceso SSH al homeserver. Si una política de organización
impide publicar, habilita el acceso del repositorio al paquete en su configuración.

**Comprobación:** `docker pull ghcr.io/belcaik/gta-v-map:sha-<SHA completo>` termina
correctamente; para verificar acceso anónimo utiliza un `DOCKER_CONFIG` temporal vacío.

### Mantener el costo en cero

El repositorio debe seguir siendo **público**. Los workflows tienen una condición
para omitir sus jobs si pasa a privado; usan runners estándar Linux, sin runners
grandes ni artifacts o cachés de Actions. No ejecutan scraping ni suben recursos
del mapa. El workflow Docker desactiva también el artifact automático de Buildx.

GitHub documenta [runners estándar gratuitos en repositorios públicos](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
También documenta [almacenamiento y transferencia de GHCR actualmente gratuitos](https://docs.github.com/en/billing/concepts/product-billing/github-packages).
La política y condiciones deben revisarse si se cambia la visibilidad del repositorio
o el tipo de runner. No es una garantía de precios futuros.

## 3. Preparar SSH y el servidor

El cliente necesita Bash, OpenSSH y rsync. El servidor puede usar Docker Engine y
Compose v2, o el Podman rootless ya instalado en `baphomet` (Podman 4.9.3 y
`podman-compose` 1.0.6). En ambos casos necesita rsync y acceso saliente a GHCR.
El usuario SSH debe poder ejecutar el motor sin un prompt interactivo de sudo.

Docker sigue siendo la opción predeterminada:

```bash
ssh baphomet 'docker version && docker compose version && command -v rsync'
```

Para la instalación rootless de Podman:

```bash
ssh baphomet 'podman --version && podman-compose --version && command -v rsync'
ssh baphomet 'loginctl show-user "$USER" -p Linger'
```

La salida `Linger=yes` permite que el servicio de usuario arranque después de un
reinicio aunque todavía no haya una sesión abierta. Si muestra `Linger=no`, un
administrador debe ejecutar `loginctl enable-linger USUARIO_SSH` una vez.
El script instala y habilita automáticamente un servicio systemd de usuario para
Podman. Su unidad se llama `map-DEPLOY_DIR-con-barras-reemplazadas-por-guiones.service`;
con el valor predeterminado de `DEPLOY_DIR`, es
`map-apps-gta-v-map.service`.
El mapeo `keep-id` sigue la documentación oficial de
[Podman 4.9.3](https://docs.podman.io/en/v4.9.3/markdown/podman-run.1.html).

El alias `baphomet` se resuelve en `~/.ssh/config` del cliente; no tiene por qué
resolverse en tu teléfono. Si aparece `Host key verification failed`, compara la
huella con la del servidor mediante un canal confiable y ejecuta `ssh baphomet`
interactivamente para registrar la clave verificada. El script conserva la
comprobación de claves SSH.

**Comprobación:** el comando anterior termina sin pedir contraseña y sin errores.
Reserva una dirección estable en DHCP o configura DNS local para el homeserver.

## 4. Importar y desplegar

Genera una extracción siguiendo el README, o reutiliza `data/full/dataset.json`
con sus subdirectorios de medios. El manifiesto solo no basta: conserva las rutas
relativas de los archivos descargados. Para una prueba sintética, genera un dataset
aislado con `.venv/bin/python -m scraper.demo --output /tmp/gta-deploy-demo`.

```bash
./scripts/deploy.sh --help
./scripts/deploy.sh --dry-run --dataset data/full
./scripts/deploy.sh --dataset data/full
```

El valor predeterminado es `CONTAINER_ENGINE=docker`. Para el Podman rootless de
`baphomet`, conserva el mismo `.env.docker` y usa los dos archivos Compose, incluido
el override `compose.podman.yaml`, que aplica `userns_mode: keep-id:uid=1000,gid=1000`
y `user: 1000:1000` para conservar la propiedad del usuario anfitrión:

```bash
CONTAINER_ENGINE=podman ./scripts/deploy.sh --dataset data/full
```

El override también se puede operar manualmente con `podman-compose`:

```bash
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml up -d
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml ps
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml logs --tail=100 map
```

Podman no ofrece `up --wait`; el script espera de forma explícita y acotada el
healthcheck de `/api/health` antes de considerar correcto el despliegue.
El healthcheck de Compose usa una cadena shell: `podman-compose` 1.0.6 altera las
comillas de la forma `CMD` con argumentos JavaScript. Mantén esta forma al portarlo.

Cuando el servidor no puede extraer `MAP_IMAGE` del registro, `--image-archive`
carga por SSH un archivo creado con `docker save`. `MAP_IMAGE` debe coincidir con
la etiqueta guardada:

```bash
docker build -t localhost/gta-v-map:local .
docker save -o /tmp/gta-v-map.tar localhost/gta-v-map:local
# En .env.docker: MAP_IMAGE=localhost/gta-v-map:local
CONTAINER_ENGINE=podman ./scripts/deploy.sh \
  --image-archive /tmp/gta-v-map.tar --dataset data/full
```

La carga usa el motor seleccionado en el servidor; el formato producido por
`docker save` también lo acepta Podman. El archivo es solo una entrada de
transferencia y no sustituye el valor de `MAP_IMAGE`.
Mientras uses una etiqueta local, conserva `--image-archive` en las siguientes
ejecuciones; omitirlo intenta descargar del registro. Cuando publiques en GHCR,
cambia `MAP_IMAGE` a esa etiqueta y podrás omitir el archivo.

El script usa `baphomet` por defecto, copia Compose y su configuración local,
descarga la imagen, prepara permisos e importa los datos antes de levantar el
servicio. Reimportar conserva el progreso ya almacenado en el servidor. Las
actualizaciones siguientes solo necesitan:

```bash
./scripts/deploy.sh
# Con Podman y una imagen ya publicada en GHCR:
CONTAINER_ENGINE=podman ./scripts/deploy.sh
```

Para otra instalación, cambia los parámetros de conexión:

```bash
SSH_HOST=otro-alias DEPLOY_DIR=apps/otro-mapa ENV_FILE=.env.docker.otro ./scripts/deploy.sh
```

El dataset transferido permanece como entrada de importación y los medios se
copian al almacenamiento persistente: reserva espacio para ambas copias. El script
no transfiere una SQLite abierta. La primera importación crea progreso nuevo en el
servidor; para trasladar tu progreso local existente, usa el procedimiento de respaldo
y restauración de abajo **antes de la primera puesta en marcha**.

**Comprobación:** abre `http://HOST_LAN:PUERTO/api/health` y luego la raíz desde
dos dispositivos. Deben cargar mapa, iconos y fotografías. Marca un punto, recarga
en el otro dispositivo y comprueba que conserva la marca. Un healthcheck correcto
solo acredita proceso/DB: verifica también `/api/dataset` y medios tras la importación.

## 5. Operación, respaldo y rollback

En `baphomet` también puedes reiniciar el servicio con
`systemctl --user restart map-apps-gta-v-map.service`. Queda habilitado para arrancar
con la sesión de usuario persistente (`Linger=yes`). Si el disco del homeserver está
cifrado, primero debe desbloquearse: el servicio no automatiza ese paso.

En el servidor, desde el directorio de despliegue:

Docker:

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 map
docker compose --env-file .env.docker stop map
```

Podman:

```bash
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml ps
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml logs --tail=100 map
podman-compose --env-file .env.docker -f compose.yaml -f compose.podman.yaml stop map
```

Con el servicio detenido, respalda **todo** `SERVER_DATA_DIR`, incluidos SQLite,
WAL/SHM si existen, imágenes, iconos y tiles. Guarda además `.env.docker` para saber
qué versión y rutas usabas. Usa `tar` o tu sistema de respaldos habitual sobre la
ruta efectiva que muestra `docker compose --env-file .env.docker config`.
Después reinicia con Docker usando `docker compose --env-file .env.docker up -d --wait`,
o con Podman usando `podman-compose --env-file .env.docker -f compose.yaml -f
compose.podman.yaml up -d`; el script aplica la espera acotada del healthcheck de
Podman.

Para trasladar el progreso local, detén primero la API local; copia su `DATA_ROOT`
completo y su DB a un directorio nuevo en el servidor. Si `DB_PATH` local estaba
fuera de `DATA_ROOT`, incluye ese archivo y sus WAL/SHM, con el nombre `gta-v.db`
en el directorio de destino. Configura `SERVER_DATA_DIR` hacia ese directorio antes
de ejecutar el script. La DB y los medios deben pertenecer a la misma extracción.
Conserva un respaldo antes de restaurar sobre una instalación existente.

Para rollback de código, coloca la etiqueta SHA anterior en `MAP_IMAGE` y ejecuta
el script sin `--dataset`. Un rollback no deshace cambios de datos; si una versión
futura cambia el esquema de SQLite, recupera también su respaldo compatible.
No cambies `SERVER_DATA_DIR` accidentalmente: parecería que se perdió el progreso
cuando en realidad estarías abriendo otra DB.

## Réplica en RDR2

Para encargar la implementación a otro agente, usa el
[prompt autocontenido para rdr2-map](prompts/rdr2-homeserver.prompt.md).

1. Inspecciona en RDR2 los scripts de build, salida compilada, arranque y contrato de
   importación. Ajusta las rutas `COPY`, `WORKDIR` y `CMD` del Dockerfile a ese proyecto.
   **Cierre:** una construcción limpia desde sus lockfiles termina correctamente.
2. Conserva la separación código/datos y el mismo origen para UI/API/medios. Adapta
   su servidor para escuchar `HOST` y servir el frontend compilado. Mantén las rutas
   de API y medios fuera del fallback HTML. **Cierre:** UI, API y un medio responden
   desde el contenedor, incluidos 404 correctos para recursos inexistentes.
3. Cambia el nombre de imagen GHCR, `COMPOSE_PROJECT_NAME`, puerto, `DEPLOY_DIR` y
   `SERVER_DATA_DIR`. Usa almacenamiento propio para RDR2; sus IDs, esquema,
   proyección y dataset siguen siendo los del juego. **Cierre:** ambos mapas pueden
   funcionar simultáneamente sin compartir DB, puertos o proyecto Compose.
4. Adapta el comando de importación del script a la API de RDR2. **Cierre:** importa
   una muestra dos veces y recrea el contenedor; progreso y medios siguen presentes.
5. Copia el workflow con su condición de repositorio público y publica el paquete
   RDR2 como público. **Cierre:** pull anónimo de la etiqueta SHA y despliegue por
   SSH correctos, sin recursos descargados ni credenciales en imagen o Git.
6. Verifica desde teléfono y escritorio y realiza una restauración de respaldo en
   un directorio aislado. **Cierre:** ambos clientes ven el mismo progreso y la
   restauración sirve la misma muestra. Registra comandos y resultados en su handoff.
