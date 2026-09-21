# Contributing

Read [AGENTS.md](AGENTS.md), the [handoff](docs/context-handoff.md) and the selected
task before editing. Use separate branches/worktrees for simultaneous agents and
agree on file ownership. Installation and validation commands are in the README.

Contract changes update the JSON Schema, generated types, Python producer,
API/UI consumers and behavioral tests together. Do not edit generated datasets to
hide extractor bugs. CI must work without live scraping or downloaded source assets.

Record actual commands/results in the handoff and acceptance evidence in tasks.
Before proposing integration, run lint, types, tests, build and E2E. Review UI changes
visually and keep third-party screenshots local. Inspect the diff for downloaded
data, secrets and private paths.

Use atomic Conventional Commits and English commit/PR text without co-author or
generated-by trailers. Keep each commit focused on one responsibility. Open PRs
against `main`; do not merge, push or publish without the user's authorization.
