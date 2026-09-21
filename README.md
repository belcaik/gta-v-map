# GTA V Map

A local GTA V map built with React, Leaflet, Express, SQLite and Python/Selenium.
Filter categories, track found waypoints and view category icons and photo galleries
without external requests after downloading and importing the relevant assets.

Adapted from [belcaik/rdr2-map](https://github.com/belcaik/rdr2-map) at
`a6f8e47046c3bba11b0492c5858f4e50f915a33b`. See the
[reuse decisions](docs/decisions.md) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Verified coverage and limitations

The source was inspected on September 21, 2026 using ordinary Chrome/Selenium.

| Item | Real Los Santos extraction |
| --- | --- |
| Waypoints | 2,293 importable out of 2,295 discovered |
| Categories | 74 |
| Category icons | 64 downloaded; 10 missing source symbols use an explicit fallback |
| Photos | 551 downloaded; one unapproved HTTP destination remains failed |
| Tiles | 166 Atlas tiles at zoom levels 3–5 |

Two waypoints have out-of-bounds coordinates and remain in the omission report.
Cayo Perico has not been inspected. Alternative layers and zoom levels 6–7 are
configurable but were not downloaded in this run. `--sample 0` means all available
waypoints, not complete geographic, layer or media coverage.

The 12-waypoint sample and expanded extraction were tested locally, including a
two-photo gallery, offline assets and progress preservation across reimports.
See [validation evidence and handoff](docs/context-handoff.md).
Direct HTTP access returned 403; ordinary Selenium worked without access-control bypass.
Downloaded data, screenshots, assets, databases and personal progress are not committed.

## Requirements and installation

- Node **22.22.3**, npm **10** (`.nvmrc`).
- Python **3.12.11** (`.python-version`).
- Chrome/Chromium for extraction; Selenium Manager resolves the driver.
- Playwright Chromium or an installed Chrome for UI tests only.

From the repository root:

```sh
npm run install:all
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scraper/requirements.lock
```

If a global libvips installation conflicts with Sharp, use
`SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm run install:all`.
No global packages, hooks, MCPs or Docker are required.

## Extract, import and run

```sh
source .venv/bin/activate
python -m scraper.run --output data/sample --sample 12 --layer Atlas --zoom 3 4 5
npm run import -- data/sample/dataset.json
npm run dev:api
```

In a second terminal, run `npm run dev:web` and open **http://127.0.0.1:5175**.
The API listens on **127.0.0.1:3002**. Vite proxies relative API and media requests.
These ports are separate from the original RDR2 app.

`npm run build` builds both components. `npm start --prefix backend` starts the
compiled API. For Docker images, free GitHub Actions publishing and LAN deployment
through the `baphomet` SSH alias, follow the [homeserver guide](docs/deployment.md)
(Spanish, including parameters, backups, rollback and replication in RDR2).

### Offline synthetic demo

```sh
source .venv/bin/activate
npm run demo
npm run dev:api
# In another terminal:
npm run dev:web
```

The demo uses labeled synthetic geometry and images, not real GTA V assets.
It selects the demo dataset without deleting existing progress history.
Reimport a real dataset to switch back. E2E tests use their own isolated database.

## Extraction and resuming

```sh
# All Los Santos waypoints, with a selected layer and zoom range:
python -m scraper.run --output data/full --sample 0 --layer Atlas --zoom 3 4 5
# Resume the original selection, reusing valid files:
python -m scraper.run --output data/full --resume
# Offline manifest/file validation; refresh report.json:
python -m scraper.run --output data/full --phase validate
# Normalize an existing legitimate capture without downloading:
python -m scraper.run --capture data/full/capture.json --output data/subset --categories 492,462 --sample 8 --phase normalize
# Download the normalized selection:
python -m scraper.run --output data/subset --resume
```

For more detail, start a new extraction with `--zoom 3 4 5 6 7`.
Resuming preserves the original selection rather than applying new filters.

Implemented flags (`python -m scraper.run --help`):

| Flag | Behavior |
| --- | --- |
| `--source-url` | HTTPS GTA V page; default https://gta-5-map.com/ |
| `--output` | Directory for capture, manifest, media, tiles and report |
| `--capture` | Legitimately obtained capture.json in the observed format, not arbitrary HAR |
| `--sample` | Default 12; 0 selects all; positive values set a deterministic limit |
| `--categories` | Comma-separated category IDs |
| `--layer` | Atlas, Satellite, Road or UV; one layer per dataset |
| `--zoom` | Source levels 3–7; default 3 4 5 |
| `--timeout` | Navigation/script timeout in seconds; default 40 |
| `--retries` | 0–4, default 2; honors Retry-After up to 120 seconds, records longer delays for resume |
| `--concurrency` | Currently only 1; serial WebDriver with bounded load |
| `--resume` | Reuse the manifest and valid files; retry failed/pending assets |
| `--phase` | normalize, download (default) or validate; atomic export at completion |

Every download writes a checkpoint. Interrupted files never become `downloaded`.
Reports retain omissions, failures and provenance. Photos, icons and tiles use
separate directories. Photos are converted to PNG for validation, at a disk-space
cost compared with JPEG/WebP. Unverified external hosts are not downloaded merely
because they appear in a description.

If the source blocks access, do not bypass it. Use a legitimate `capture.json`
from the same capturer, or have the adapter maintainer inspect an authorized export.
Do not manually edit generated datasets to hide parser problems.
`python -m scraper.discover` records initial evidence locally;
`python -m scraper.verify_source` inspects source details/styles and captures screenshots.

## Configuration and persistence

Copy `.env.example` to `.env` only when changing defaults. The backend loads the
root `.env`; Vite reads `API_TARGET`. Existing environment variables take precedence.

| Variable | Default / purpose |
| --- | --- |
| `DATA_ROOT` | data, relative to the project root; imported asset storage |
| `DB_PATH` | DATA_ROOT/gta-v.db; optional independent database path |
| `HOST` / `PORT` | 127.0.0.1 / 3002; API bind address and port |
| `WEB_HOST` / `WEB_PORT` | 127.0.0.1 / 5175; Vite development bind address and port |
| `STATIC_ROOT` | Optional compiled frontend directory; set by the Docker image |
| `API_TARGET` | http://127.0.0.1:3002; Vite proxy target |
| `PYTHON` | Python executable for Node tests; default .venv/bin/python |
| `CHROME_PATH` | Alternative Chrome executable for Playwright, not the scraper |
| `LOCAL_URL` | Real UI verification URL; default http://127.0.0.1:5175 |

Imports validate and copy assets, then upsert records in a SQLite transaction.
Reimports preserve found/unfound progress. Partial datasets do not retire absent
waypoints; truly complete datasets deactivate retired points without deleting history.
Filters live in browser storage; progress lives in SQLite, keyed by game/map/waypoint.
Progress is local map completion, not the game's official achievement percentage.

Back up the database with the app stopped, including any remaining WAL files, and
back up `DATA_ROOT`. GitHub publication does not upload or reset personal progress.
To explicitly reset a map's progress, use the destructive standalone command
`npm run reset-progress --prefix backend -- 27`.

## Tests and quality

```sh
source .venv/bin/activate
npm run lint
npm run types
npm test
npm run build
npx --prefix frontend playwright install chromium
npm run test:e2e
```

On Linux, use `npx --prefix frontend playwright install --with-deps chromium` if
browser system dependencies are missing. To use installed Chrome:
`CHROME_PATH=/usr/bin/google-chrome-stable npm run test:e2e`.

CI uses synthetic fixtures and blocks external UI requests; it never scrapes live data.
Coverage includes shared contracts, duplicate media, 404/429 responses, interrupted
downloads, corrupt files, HTML posing as images, repeated imports, rollback,
database reopening, safe asset paths, galleries and mobile layout.

With the app running and a real dataset imported:

```sh
cd frontend
CHROME_PATH=/usr/bin/google-chrome-stable node tests/real-check.mjs
# After running scraper.verify_source:
CHROME_PATH=/usr/bin/google-chrome-stable node tests/projection-check.mjs
```

From the root, verify real reimports with
`npm run verify:import --prefix backend -- ../data/full/dataset.json`.
Real-data checks restore the control waypoint's previous progress. Screenshots and
reports remain local under `reports/` and are not distributed with the repository.

## Contributing and repository workflow

Use focused [Conventional Commits](https://www.conventionalcommits.org/), such as
`feat(scraper): validate downloaded media` or `fix(api): preserve waypoint progress`.
Keep commit messages, PR titles and PR descriptions in English. Do not add
co-author or generated-by trailers. Open feature PRs against `main`; publishing a
branch does not authorize merging it or deploying a public site.

Before pushing, run the checks above and inspect the staged files for secrets,
private paths, downloaded assets and databases. Keep code changes separate from
local progress updates; the latter are deliberately ignored by Git.

Read [CONTRIBUTING](CONTRIBUTING.md), [agent rules](AGENTS.md),
[data contract](docs/data-contract.md), [source evidence](docs/source-discovery.md),
[architecture](docs/architecture.md), [tasks](docs/tasks.md) and
[handoff](docs/context-handoff.md) before changing the pipeline.
The code license is in [LICENSE](LICENSE); it does not grant redistribution rights
to source tiles, icons or photographs.
