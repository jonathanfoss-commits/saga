# SAGA

Personal AI operating system ("Strategisk Autonom Generativ Assistent"): a static
web app (company factory + digital board + assistant) plus a "night shift" of
GitHub Actions agents. No backend, no build step. Repo is PUBLIC; all business
data lives in the PRIVATE repo `jonathanfoss-commits/saga-data`.

## Commands

- Dev server: `python3 -m http.server 8130` (from repo root; e2e tests expect port 8130)
- Full tests: `npm test` — unit/guard suites + Playwright e2e; e2e REQUIRES the
  dev server already running on :8130, otherwise fails with ERR_CONNECTION_REFUSED
- CI tests (fast, no server needed): `npm run test:ci` (~1s)
- Improvement loop: `npm run saga improve` (works on branch `saga/auto-improve` only)
- No lint or build steps; deploy is automatic via GitHub Pages on push to main

## Architecture

- `index.html` + `os/` — SAGA OS shell (command front page, dock, approvals, UI)
- `core/` — engines: `saga-core.js` (bridge), `factory.js`, `aeis.js` (board), `chat.js`
- `board/`, `assistant/` — fullscreen board UI; phone PWA assistant
- `agents/` — night-shift agents (CFO, radar, weekly, goals, …); `agents/lib/common.js`
  enforces budget cap and kill switch
- `config/budget.json` — hard monthly AI cost cap (200 NOK); creating a file
  `config/KILL_SWITCH` stops all agents
- `tools/saga-cli.js` — the `saga improve` CLI; `tools/constitution-check.js`
- `tests/` — `*.test.js` are node unit/guard suites; `*.e2e.js` are Playwright
- `docs/` — architecture, decisions, economics, improvement queue
- `ios/` — Xcode iOS app (bundle ID `com.jonathanfoss.saga`)

## Services & deployment

- Hosting: GitHub Pages at jonathanfoss-commits.github.io/saga (`pages.yml`
  deploys the repo root on every push to main — no build)
- CI: `tests.yml` runs `npm run test:ci` on every push/PR (Node 22)
- `night-shift.yml`: cron 04:00 + 10:00 UTC. Checks out the private
  `saga-data` repo via secret `DATA_REPO_TOKEN`, runs `agents/night-shift.js`
  (uses `ANTHROPIC_API_KEY`), commits results and posts a "Morgenbrief" Issue
  to the PRIVATE repo only. Without the token it opens a generic Issue here.
- No database: browser state in localStorage; agent state in saga-data.

## Gotchas & conventions

- Privacy contract (docs/privacy-audit.md): NEVER put business data, briefs,
  or agent output in this public repo — `tests/privacy.test.js` enforces it.
- Separation contract (SEPARATION.md): no employer names/material anywhere;
  `tests/separation.test.js` fails CI on violations.
- Owner gates: money, publishing, and legal actions require explicit owner
  action; agents never commit code to main, only data (to saga-data).
- Prose (docs, commit msgs, UI) is in Norwegian; keep that style.
- Numbers must be labelled FAKTISK / ESTIMAT / TEST; sample projects are TEST.
