# GTA V Map

Lee este archivo y [handoff](docs/context-handoff.md) antes de editar. Elige un ticket
de [tasks](docs/tasks.md), registra estado y evidencia al terminar.

## Prioridad
P0: evidencia de GTA V, contrato, extracción/medios, persistencia, mapa, detalle y pruebas.
La fuente permite Selenium normal; HTTP directo dio 403. Fixtures no acreditan integración real.
Consulta [descubrimiento](docs/source-discovery.md) antes de cambiar el adaptador o coordenadas.

## Comandos
Node 22.22.3, Python 3.12.11. Instalación y comandos en README y package.json.
`npm run lint`, `npm run types`, `npm test`, `npm run build`, `npm run test:e2e`.
Activa .venv antes de comandos Python. Pruebas sin red externa.

## Invariantes
- Un contrato por frontera: schemas/dataset.schema.json y docs/data-contract.md.
  Cambios incluyen productor Python, consumidor TS, tipos generados y pruebas.
- Conserva IDs de fuente y progreso separado por juego/mapa/waypoint.
  Reimportar nunca reinicia progreso; parcial nunca retira puntos.
- No mezcles juegos ni reutilices coordenadas RDR2. Transformación solo en shared/coordinates.ts.
- Iconos y fotos son distintos. No edites datasets generados para ocultar fallos.
- Valida entrada remota, referencias, archivos y rutas. No publiques secretos, IPs LAN,
  capturas de red, DB ni recursos descargados.
- Mantén cambios pequeños por responsabilidad, sin reformateos globales ni dependencias ajenas.
- Nunca desactives checks para CI verde. Separa fallos preexistentes y registra comandos ejecutados.
- No afirmes pruebas no realizadas. Actualiza handoff al terminar cada etapa.
- Codex/Claude simultáneos: ramas/worktrees separados y propiedad explícita de tareas/archivos.
  No editen el mismo archivo de trabajo; revaliden al integrar.
- No push, merge ni publicación sin autorización. La memoria externa es opcional.

## Referencias
[Especificación](docs/spec.md), [arquitectura](docs/architecture.md),
[decisiones](docs/decisions.md), [avisos](THIRD_PARTY_NOTICES.md).
