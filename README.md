# S.A.G.A.

**Strategisk Autonom Generativ Assistent** – et personlig AI-operativsystem.
Én app: selskapsfabrikk, digitalt styre og assistent som samarbeider.
Statisk (GitHub Pages), ingen backend, ingen byggesteg – og et nattskifte av
GitHub Actions-agenter som jobber når nettleseren er lukket.

**Åpne:** `https://jonathanfoss-commits.github.io/saga/`

| Flate | Sti | Hva |
|---|---|---|
| **SAGA OS** | `/` | Én dør: Kommando-forside, fabrikken, styret, assistent-dokk (Cmd+J), godkjenninger («DIN TUR»), bibliotek, system |
| Styret (fullskjerm) | `/board/` | AEIS – styremøter, radar, hovedbok |
| Assistent (telefon) | `/assistant/` | PWA med stemme, verktøy og chat |

## Struktur

```
index.html + os/     SAGA OS-skallet
core/                motorene: saga-core (bro), factory, aeis, chat
shared/              design-tokens (mørk Tiffany), logo
agents/              nattskiftet (Actions) – output går til PRIVAT datarepo (saga-data)
config/              budsjettak og kill-switch for agentene
tools/saga-cli.js    `npm run saga improve` – forbedringsloopen
tests/               testpakken (npm test)
docs/                arkitektur, beslutninger, økonomi, forbedringskø
ios/                 iOS-app (Xcode)
```

## Kjør lokalt

```bash
python3 -m http.server 8130   # fra repo-rot
npm i && npm test             # hele testpakken
```

## Prinsipper

- **Ærlighet**: alle tall merkes FAKTISK / ESTIMAT / TEST. Eksempelprosjekter
  merkes TEST. Generert juss er utkast, ikke garantert korrekt.
- **Eier-porter**: penger, publisering og juridiske handlinger krever
  eksplisitt eierklikk. Agentene committer aldri kode til main – kun data.
- **Ingen hemmeligheter i repoet**: nøkler bor i nettleserens localStorage
  (interaktivt) eller GitHub Secrets (agenter). Aldri i kode eller docs.
- **Separasjon**: dette er et personlig sideprosjekt – se `SEPARATION.md`;
  kontrakten håndheves av CI.
