# Privacy-audit — hvor bor hver datatype, og hvorfor

Dato: 2026-07-14. Utløst av P0-funnet i SAGA 3.0: `factory-data.json` (61 kB
forretningsdata) + `data/*` (nattskiftets briefs/board/radar) lå i dette
OFFENTLIGE repoet og var lesbare via både repo-visning, GitHub Pages og
git-historikken. Rotårsak og sannhetslagvalg: `docs/reality-audit.md` + D18.

## 1. Hva var eksponert (fil for fil)

| Fil | Innhold | Følsomhet | Eksponert via | Status |
|---|---|---|---|---|
| `factory-data.json` (rot) | Hele fabrikk-eksporten: 1 prosjektidé (abonnement for lagring/deling av viktig info med pårørende), antakelser m/konfidens, styrebeslutninger, kostnadslogg, aktivitetsspor | Strategisk/konkurranse. INGEN hemmeligheter (PAT/API-nøkler er utenfor eksporten, verifisert i `core/factory.js`) | Repo + Pages + historikk (`c6d5a8b`) | Fjernet fra HEAD i denne branchen; historikk gjenstår (pkt. 4) |
| `data/brief-latest.json`, `data/briefs/2026-07-14.json` | Morgenbrief (mock-modus): generiske radar-funn, handlingsforslag, kosttall | Lav (mock, ingen ekte portefølje) | Repo + Pages + historikk (`536f526`, `c6d5a8b`) | Samme |
| `data/board/2026-07-14.json` | Styreprotokoll: «ingen data»-notat | Lav | Samme | Samme |
| `data/radar/2026-07-14.json` | Radar-funn (mock) | Lav | Samme | Samme |

Verifisert IKKE eksponert: PAT (`cf_secret_pat`, kun localStorage, utenfor
eksport), Anthropic-nøkkel (`jarvis_api_key`, samme), AEIS-sky-backup (chiffrert
gist). Morgenbrief-Issues i dette repoet inneholdt kun mock-innhold; fremtidige
briefs går til det private repoet (workflow-endring i denne branchen).

## 2. Hvor hver datatype bor NÅ (målbilde etter L0)

| Datatype | Bor | Hvorfor der |
|---|---|---|
| Kode, tester, docs, config (budsjett-TAK, ikke -forbruk) | Offentlig repo `saga` | Ingen forretningsdata; Pages-hosting er gratis distribusjonskanal for appen |
| Fabrikk-eksport (`factory-data.json`): prosjekter, antakelser, beslutninger, kostnadslogg | **Privat repo `saga-data` (rot)** — sannhetslaget | Kun eieren (PAT) og nattskiftet (`DATA_REPO_TOKEN`) har tilgang; commit-historikk = revisjonsspor |
| Nattskiftets output: `data/brief-latest.json`, `data/briefs/`, `data/board/`, `data/radar/`, `data/agent-costs.json` | **Privat repo `saga-data` under `data/`** | Skrevet av Actions via secret; lest av appen via PAT |
| Morgenbrief-varsel (Issue) | **Privat repo `saga-data`** (Issues) | Innholdet ER forretningsdata; GitHub-appen gir mobil-push også fra private repoer |
| Selskapsstatus/P&L (fase 3/5) | **Privat repo `saga-data`** | Samme som over |
| localStorage (`jarvis_*`, `aeis_*`, `cf_*`, `saga_*`) | Eierens nettleser | **Degradert til cache/utkast**: sannheten er datarepoet; «Synk nå» er skrivepunktet. Nøkkelkontraktene er uendret (D2) |
| PAT + Anthropic-nøkkel | localStorage (kun) / GitHub Secrets (Actions) | Aldri i eksport, synk eller repo. Secrets forlater ikke GitHub |
| Publiserte falske dører (`landing/<slug>/`) | Offentlig repo | Skal være offentlige – det er testen. Publisering er eier-port |

## 3. Håndhevelse (maskinelt, ikke disiplin)

1. **Privatvakt i appen** (`core/factory.js`): `Sync.push()` og `Sync.pull()`
   nekter hardt mot repoer der `GET /repos/{repo}` ikke svarer `private: true`.
2. **Eier-kø-alarm**: `OwnerQueue` flagger KRITISK hvis datarepo = Pages-repo.
3. **Personvernvakt i CI** (`tests/privacy.test.js` + `.github/workflows/tests.yml`):
   feiler på hver push hvis `factory-data*.json`, `data/**`, `agent-costs.json`
   eller `brief-latest.json` er sporet av git eller finnes i arbeidstreet.
4. **`.gitignore`**: `data/` og `factory-data*.json` ignoreres, så lokale
   agent-kjøringer ikke kan committes ved uhell.
5. **Workflow-kontrakt**: nattskiftet har `contents: read` i det offentlige
   repoet — det KAN ikke lenger committe data hit.

## 4. Historikk-rensing — forberedt eier-handling (DIN TUR)

**Ærlig risikovurdering:** Det som lå ute er én prosjektidé med antakelser og
småbeløps-kostnadslogg — pinlig å lekke, ufarlig å ha lekket: ingen
hemmeligheter, ingen persondata, repo uten kjent trafikk, eksponert i timer.
Fjerning fra HEAD (denne branchen) stopper Pages- og repo-visning. Historikken
(`c6d5a8b`, `536f526`) er fortsatt hentbar for den som kloner. **Anbefaling:
gjennomfør rensingen ved leilighet (10 min), ikke som hasteaksjon.** Merk at
GitHub kan beholde løsrevne objekter i cache en stund etter force-push; for
100 % garanti be GitHub Support kjøre gc, eller aksepter restrisikoen (lav).

Klar til å kjøre (etter at branchen er merget til main):

```bash
# 1. Installer verktøyet (én gang)
brew install git-filter-repo

# 2. Fersk speilklon (filter-repo krever ren klon)
cd ~/tmp && git clone --mirror https://github.com/jonathanfoss-commits/saga.git saga-mirror
cd saga-mirror

# 3. Fjern forretningsdata fra HELE historikken
git filter-repo --invert-paths --path factory-data.json --path data/

# 4. Force-push omskrevet historikk (krever midlertidig å skru av branch protection)
git push --force --mirror https://github.com/jonathanfoss-commits/saga.git

# 5. Alle lokale kloner må re-klones etterpå (gamle kloner reintroduserer historikken ved push)
```

Konsekvenser å være klar over: alle commit-SHA-er endres, åpne PR-er mot gamle
SHA-er brekker, og lokale kloner (denne maskinen inkludert) må klones på nytt.
