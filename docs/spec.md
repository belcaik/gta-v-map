# Especificación P0

Primera versión local: fuente GTA V → Selenium → dataset/PNG → SQLite/Express → React/Leaflet.
La evidencia real tiene prioridad sobre inferencias de RDR2. Repositorio autónomo para Codex/Claude.

## Recorrido y aceptación
1. Auditar base/remotes/cambios y fuente: documentar tiles, CRS, categorías, carga completa y medios.
2. Validar un único contrato v1 en Python/TS; fixtures sintéticas para fallos, ausencia y varias fotos.
3. Extraer muestra real antes de ampliar; fases reanudables, recursos autónomos, reporte de omisiones.
4. Importar atómicamente, upsert estable, FK, progreso durable; parcial no elimina; completo desactiva.
5. Mostrar mapa GTA V, icono recuperado consistente en marcador/filtro/detalle y fallback explícito.
6. Detalle con Markdown sanitizado, galería ordenada, ampliación y cierre por teclado/táctil.
7. Mantener mostrar/ocultar categorías, ocultar encontrados, marcar/desmarcar y contadores activos.
8. Verificar parser, descargas, importación, API, E2E offline, desktop/móvil, zoom/pan y tres lugares.

## Límites observados
P0 implementa Los Santos (map 27). Cayo Perico (315) aparece en catálogo de la fuente,
pero su payload y coordenadas requieren inspección propia antes de habilitarlo.
Se conservan grupos Online observados, sin inferir pertenencia exclusiva a historia.
Atlas/Satellite/Road/UV son opciones de extracción de una capa por dataset; UI muestra esa capa.
Los niveles no descargados no se presentan como disponibles.
Fuente con diez símbolos indefinidos y dos coordenadas fuera de extensión: reportar, no inventar.
Los enlaces HTTP/hosts externos no comprobados conservan procedencia pero no se descargan.

## Verificación
Pruebas de contrato compartidas, respuestas de descarga controladas, corrupción/reanudación,
reimportación y reinicio SQLite; UI con peticiones externas bloqueadas.
Fixtures no acreditan acceso real. Evidencia y comandos finales en context-handoff.md;
capturas/reportes reales permanecen locales ignorados por Git.

## Fuera de alcance
Cuentas, cloud, multijugador, Steam/logros, rutas, multijuego, plugins, migración de stack,
deploy público, datos privados y publicaciones remotas. Sin hooks/MCPs/skills instalados.
