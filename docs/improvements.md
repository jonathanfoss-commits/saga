# SAGA – forbedringslogg

Strukturert kø for `saga improve`. Format per innslag:

```
## [effekt: høy|middels|lav] [innsats: lav|middels|høy] Tittel
- Begrunnelse/kontekst
- Status: åpen | planlagt | utført (dato)
```

Modulene logger feil/friksjon automatisk til `saga_improvements` i appen
(SAGA → kjernens `improve.log`); eksporter dem hit med `SAGA.improve.exportMd()`.

---

## [effekt: høy] [innsats: middels] Konsolider LLM-klientene i aeis.js og factory.js til core/
- Samme kontrakt, to implementasjoner (decisions.md D4). AEIS har modellrouting
  og prompt-caching; factory har kostnadsmåler-kontekst – begge deler hører
  hjemme i én core-klient som begge bruker.
- Status: åpen

## [effekt: middels] [innsats: middels] Samle GitHub-token-håndtering (AEIS gist-backup + factory Sync)
- To PAT-er med ulike scopes i dag (aeis_gh_token, cf_secret_pat). Én core-
  tjeneste med scope-bevissthet, felles feilmeldinger og felles UI.
- Status: åpen

## [effekt: middels] [innsats: lav] Kryssfane-oppdatering av research-panelet uten reload
- Broen sender allerede storage-eventer (saga_bus); factory-UI kan lytte og
  re-rendre research-panelet når svar leveres i assistenten.
- Status: åpen

## [effekt: middels] [innsats: lav] Service worker for factory-modulen
- Assistant har SW; factory (godkjenninger på mobil) mangler offline-skall.
  Versjonsstemplet cache, dokumentert invalidering (jf. ARCHITECTURE v2 ADR).
- Status: åpen

## [effekt: lav] [innsats: middels] PNG-ikoner i Tiffany Blue
- Arc reactor-ikonene er fortsatt cyan/mørke (MIGRATION.md pkt. 4). SVG-logo
  finnes; PNG-settet (192/512/apple-touch) må genereres på nytt.
- Status: åpen
