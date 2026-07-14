# Separasjon – proveniens og kontrakt

SAGA er et **personlig sideprosjekt**. Dette dokumentet er det eneste stedet i
repoet der opphavet omtales, og det håndheves av `tests/separation.test.js`
(kjøres i testpakken og i CI).

## Proveniens

Koden ble opprinnelig utviklet i repoet `jonathanfoss-commits/Eik-sales-repo`
(under stien `saga/`) og flyttet hit som ren import 2026-07-14. Git-historikken
fra før flyttingen ligger igjen der; dette repoet starter med flyttingen som
første commit. Årsak til ren import fremfor subtree-split: SAGA-filene lå
spredt på fire rot-stier (`saga/`, `tests/`, `icons/`, `ios/`), og en splittet
historikk ville uansett vært ufullstendig.

## Separasjonskontrakten

1. **Ingen arbeidsgiver-materiale i SAGA**: ingen kundedata, ICP-er, playbooks,
   salgsprompts, merkevare eller navnereferanser. Gjelder kode, docs, tester,
   agent-output og publiserte artefakter.
2. **Håndhevet av CI**: `tests/separation.test.js` feiler bygget hvis
   navnestrengen dukker opp utenfor denne filen. Vakten er bevisst streng;
   unntak krever en dokumentert beslutning i `docs/decisions.md`.
3. **Enveis flytting**: innhold fra opphavsrepoet importeres aldri hit igjen.
   Opphavsrepoets salgsinnhold (inkl. dets PR #1) er utenfor scope for alltid.
4. **Egen identitet**: iOS-appens bundle-ID og Keychain-tjeneste er
   `com.jonathanfoss.saga` (endret fra opphavets ID – krever reinstallasjon og
   ny nøkkelinnlegging på iOS).

## Hva overlever flyttingen automatisk

- **All nettleserdata** (prosjekter, nøkler, historikk): localStorage er
  bundet til origin `jonathanfoss-commits.github.io`, som er uendret.
  Bare stien er ny (`/saga/` i stedet for gammelt repo-navn).
- Designsystem, motorer, tester: flyttet uendret (kun stier justert).

## Hva som IKKE overlever (eier-handlinger)

- **PAT**: fine-grained PAT-er er per-repo – gi PAT-en tilgang til `saga`-repoet
  (eller lag ny) og oppdater i appen under System.
- **Synk/publiserings-repo i appen**: pekte på gammelt repo – oppdater til
  `jonathanfoss-commits/saga` under System.
- **iOS**: bygg appen på nytt fra `ios/` (ny bundle-ID), legg inn nøkkel på nytt.
