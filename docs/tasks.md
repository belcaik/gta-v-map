# Tickets P0

Cada fila exige pruebas, no solo documentación. Estado inicial: 2026-09-21.

| Ticket | Dependencia | Aceptación | Estado/evidencia |
|---|---|---|---|
| T01 Base y descubrimiento | ninguna | Auditar origen, fuente, tiles/coordenadas y medios | Hecho: source-discovery.md; Selenium normal 200, base a6f8e47, 5 popups y estilos |
| T02 Contexto y contrato | T01 | Contrato compartido, reglas y fixtures validadas | Hecho: schemas, casos contractuales compartidos Python/TS, AGENTS/CLAUDE |
| T03 Extracción GTA V | T02 | Muestra real, cobertura y fases reanudables | Hecho con cobertura parcial explícita: muestra 12 y ampliada 2293/2295; dos omisiones de coordenadas |
| T04 Assets locales | T03 | Descarga segura, estados, hash y asociaciones | Hecho: sprite recortado, 551 fotos, 166 tiles; diez iconos indefinidos y un HTTP externo failed |
| T05 Persistencia/API | T02–04 | Upsert atómico y progreso conservado | Hecho: fixtures y verify:import ampliado, progreso conservado y DB reabierta |
| T06 Mapa/iconos | T05 | Símbolos consistentes; 3 puntos GTA V alineados | Hecho: 4 controles × 3 zoom; error <0,01px; capturas montaña/aeropuerto/muelle |
| T07 Detalles | T05–06 | Galería, texto seguro, vacío/error, teclado/móvil | Hecho: E2E offline y muestra real; galería real de 2 fotos |
| T08 Entrega | T01–07 | Checks, E2E/visual, README/handoff reproducibles | Hecho con límites documentados: instalación limpia, lint/tipos/tests/build, 4 E2E y revisión real ampliada pasan |

## T09 Repository publication

Priority: delivery. Depends on T08. Owner: Codex.
Acceptance: focused Conventional Commits without co-author trailers, English README
and PR text, public `belcaik/gta-v-map`, an open feature PR against `main`, verified
checks and no downloaded assets or personal progress in Git.
Status: published. [Public repository](https://github.com/belcaik/gta-v-map) and
[open PR #1](https://github.com/belcaik/gta-v-map/pull/1). Local lint, types, build,
one backend integration test, six Python tests and four E2E scenarios passed again
on 2026-09-21; generated types match and both npm audits report zero vulnerabilities.
Remote CI was running when this record was written; current results are on the PR.
Publication is user-authorized; merging and public application deployment are not
part of this task. Personal progress and third-party assets remain local.

## Límites que no se ocultan
- Símbolos ausentes en la fuente: fallback explícito; ampliar solo con un recurso visual comprobado.
- Imagen HTTP i.imgur.com del punto 14019: no descargada. Requiere inspeccionar y autorizar
  técnicamente ese destino HTTPS o una exportación legítima; no sustituir URL por intuición.
- IDs 13344/14162 fuera de extensión: corrección de fuente o evidencia verificable antes de incluirlos.
- Cayo Perico y extracción visual de capas alternativas: no acreditados por la muestra Los Santos.
- Zoom6/7 configurables, no descargados en esta ejecución. No hay promesa de cobertura mundial completa.
