> **Arkiv (v1):** skrevet før flyttingen til eget repo; stiene refererer den gamle strukturen. Se `os-audit.md` for gjeldende bilde.

# SAGA-migrering – kartlegging (Fase 1)

Utført 2026-07-14 på branch `claude/company-factory-build-bp8pnz` (etter merge av main).

## 1. JARVIS-referanser (alle case-varianter)

| Område | Filer | Forekomster | Håndtering |
|---|---|---|---|
| Assistent-appen | `index.html`, `sw.js`, `manifest.webmanifest` | 75 | Renames + flytt til `saga/modules/assistant/` |
| iOS-appen | `ios/Jarvis/**` (pbxproj, 6 Swift-filer) | ~115 | KUN manuell Xcode-rename er trygt → MIGRATION.md. Brukersynlige strenger byttes ikke i kode her for å unngå halvferdig tilstand |
| Dokumentasjon | `README.md`, `factory/ARCHITECTURE.md`, `aeis/ARCHITECTURE.md`, `ios/README.md` | ~58 | Renames |
| Tester | `tests/e2e.js`, `tests/factory.e2e.js`, `tests/aeis.e2e.js` | 26 | Path- og strengfikser |
| Factory/AEIS-kode | `factory/*.js|html`, `aeis/*` | 17 | Renames (lenker, omtale, nøkkel-fallback) |
| CI | `.github/workflows/pages.yml` | 2 | Kommentar/navn |

## 2. localStorage-nøkler (per-origin – overlever path-flytting)

- `jarvis_*` (13 nøkler): api_key, model, history, usage, memory, hooks, mcp m.fl.
- `aeis_*` (11): roles, ledger, profile, routing, radar_*, gist-backup (gh_token!)
- `cf_*` (15+): prosjekter, kostnader, synk, secret_pat m.fl.

**Kritisk for migreringen:** eieren har nettopp konfigurert `cf_secret_pat`,
`cf_sync`, `cf_publish` og API-nøkkel på live-siden. Origin endres ikke av
flyttingen → alle data overlever. Nøkkelstrategi: kanonisk `saga_api_key`/
`saga_model` med les-fallback til `jarvis_*` og dobbel-skriv for bakover-
kompatibilitet. Ingen nøkler slettes.

## 3. Company Factory – struktur og avhengigheter

- `factory/factory.js` (~2 400 linjer motor, `window.CF`), `ui.js`, `ui.css`,
  `index.html`, `manifest.webmanifest`, `ARCHITECTURE.md`
- Avhengigheter: Claude API (via delt nøkkel), GitHub contents-API (Sync/
  Publish, egen PAT), AEIS lese-kontrakter (`aeis_roles`, `aeis_profile`,
  `aeis_ledger` for radar-kandidater), delte ikoner `/icons/`
- Tester: `tests/factory.e2e.js` (122 sjekker, mockede API-er)

## 4. Overlapp og duplisering (kandidater for `core/`/`shared/`)

| Duplisering | Hvor | Tiltak |
|---|---|---|
| LLM-klient (samme kontrakt, to implementasjoner) | `aeis.js` `LLM`, `factory.js` `LLM` | Dokumentert siden v1; konsolideres i `core/` når risikoen forsvarer det – IKKE i denne migreringen (AEIS fikk nettopp modellrouting på main; å røre begge samtidig er unødig risiko). Beslutning i decisions.md |
| GitHub-token/backup i to varianter | AEIS gist-backup (`aeis_gh_token`) og Factory Sync (`cf_secret_pat`) | Ulike scopes (gist vs. contents). Kortsiktig: dokumentert; langsiktig: felles `core/`-tjeneste. improvements.md |
| API-nøkkel-lesing | 3 apper leser `jarvis_api_key` direkte | Kanonisk `saga_api_key` + fallback (Fase 2) |
| Designfarger | Hardkodet cyan-palett i 3 apper | `shared/design-tokens.css` (Fase 3) |
| Aktivitetslogg | `cf_activity` (factory); AEIS/assistant har ingen | Felles `saga_activity` i `core/` (Fase 4) |
| E2E-mønster (mocket API, Playwright) | 3 testfiler med lik infrastruktur | Beholdes – duplisering i testinfra er billig og isolerende |

## 5. Eksterne kontaktflater (bakoverkompatibilitet)

- **GitHub Pages-URL-er**: `/` (assistent-PWA, installert på enheter!), `/aeis/`,
  `/factory/` → redirect-stubs med hash-bevaring legges på gamle paths
- **Service worker på rot**: cacher gammelt skall → byttes til selvdestruerende
  SW (unregister + cache-tømming)
- **Publiserte falske dører**: `/tests/<slug>/` – uendret path, ingen tiltak
- **n8n / Vercel / databaser / cron**: finnes ikke i denne stacken (statisk
  GitHub Pages). Nevnes i MIGRATION.md som «ikke aktuelt»
- **iOS-appen**: peker ikke på web-paths (egen native kode) – uberørt

Fase 2 starter umiddelbart.
