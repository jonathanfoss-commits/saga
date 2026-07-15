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

## [effekt: middels] [innsats: middels] Konsolider chat-klientene (assistant-PWA og core/chat.js)
- To klienter mot samme API: PWA-en (stemme, SW, verktøysett) og dokkens
  slanke motor (D15). Trekk felles send/tool-use-løkke inn i core/.
- Status: åpen

## [effekt: middels] [innsats: lav] Radar-funn → Idélab-innboks med ett klikk
- Nattskiftets radar skriver til data/; i dag må eieren kopiere funn manuelt
  inn i innboksen. Knapp i morgenbriefen som kaller SAGA.bridge.addIdeaToFactory.
- Status: åpen

## [effekt: høy] [innsats: middels] Nattskiftet lager PR-utkast mot etterpaa-repoet
- Krever at etterpaa får privat GitHub-remote (D22) + token-secret. Da kan
  nattskiftet foreslå neste pipeline-fase som PR (aldri merge – eier-gate).
  Utkast til utadrettet innhold (byrå-e-post, LinkedIn-poster fra LAUNCH.md)
  legges som filer i sannhetslaget, aldri sendt.
- Status: åpen (blokkert av eier-handling: remote + token)

## [effekt: høy] [innsats: middels] Ekte push-varsler til iPhone (Declarative Web Push)
- Safari 18.4+ støtter Declarative Web Push for hjemskjerm-PWA-er. Nattskiftet
  kan sende morgenbrief/frist-varsler direkte til telefonen (web-push m/VAPID-
  nøkler som secrets; abonnement lagres i sannhetslaget). Erstatter/supplerer
  GitHub Issue-kanalen. Be om varsel-tillatelse først etter en meningsfull
  handling, aldri ved første besøk.
- Status: åpen

## [effekt: middels] [innsats: høy] iOS-widget (WidgetKit) via ios/-skallet
- Xcode er nå installert. ios/Jarvis-skallet kan moderniseres (heter fortsatt
  Jarvis) og få en hjemskjerm-widget: klokkeringen + dagens frister. Krever
  native utvikling + App Store-løype eller sideloading.
- Status: åpen
