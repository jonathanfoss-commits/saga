# SAGA 2.0 – diagnose og flytteplan (fase 0)

Dato: 2026-07-14. Skrevet før flyttingen; beslutningene her styrte den.

## Utgangspunkt

SAGA v1 lå som undertre (`saga/`) i et repo som ellers tilhører en annen
kontekst, med tre separate sider (assistant, aeis, factory) forbundet med en
core-bro (`window.SAGA`) og felles designtokens. Fire grønne testsuiter
(factory 122 sjekker, aeis, assistant, saga-integrasjon).

## Diagnose (etterprøvd)

1. **Tre sider er ikke ett produkt.** Riktig, men nyansert: fabrikkens
   Control Center er allerede et fullverdig skall (sidefelt, seks områder,
   kommandopalett, hash-ruting, mobilnav). Styret og assistenten er sidene
   som står utenfor.
2. **Systemet er dødt når fanen er lukket.** Riktig: alt kjører i nettleseren.
   Actions i eget repo er eneste serverløse vei til ekte autonomi (fase 5).
3. **Sideprosjekt i feil hus.** Riktig: repoet, historikken og enkelte
   referanser koblet SAGA til en kontekst det skal være atskilt fra.
   Løses med eget repo + separasjonsvakt i CI (SEPARATION.md).
4. **Motorene er verifisert kapital.** `factory.js` (2 418 linjer) og
   `aeis.js` (660 linjer, ren motor med `window.AEIS`) er UI-frie og testet.
   Assistenten har IKKE separat motor (alt inline i index.html) – det er
   et reelt refaktoreringsbehov (fase 4: `core/chat.js`).

## Arkitekturbeslutning: rewire, ikke rebuild

**Skallet = fabrikkens Control Center forfremmet til SAGA OS på rot.**
Begrunnelse: det er den nyeste, mest polerte UI-koden, bygget på tokens, med
palett/ruting/mobilnav allerede løst og 122 sjekker i ryggen. Å skrive et
nytt skall ved siden av ville dupliserte alt dette; å montere tre fulle sider
i hverandre (iframes/Shadow DOM) ville brutt enten kravet om null iframes
eller modulenes `document`-baserte kode.

Konsekvenser:
- Fabrikkflatene ER skall-flater fra dag én (null migreringsrisiko).
- Styret får en ny flate i skallet bygget rett på `window.AEIS`-motoren
  (fase 3); den gamle styresiden beholdes som fullskjermflate på `/board/`.
- Assistenten får dokk + flate i skallet via ny `core/chat.js` (fase 4);
  PWA-en beholdes som telefon-flate på `/assistant/`.
- `os.e2e.js` tester skall-spesifikk atferd; de fire arvede suitene kjører
  videre mot rot, `/board/` og `/assistant/`.

## Målstruktur (nytt repo `saga`)

```
index.html            SAGA OS (én dør)
os/ui.js, os/ui.css   skall-UI
core/                 saga-core.js, factory.js, aeis.js, chat.js (fase 4)
board/                styresiden (fullskjerm)
assistant/            PWA (telefon)
shared/               design-tokens.css, logo.svg
agents/ + data/       nattskiftet: skript + versjonert JSON-output (fase 5)
config/               budget.json, kill-switch (fase 5)
tools/saga-cli.js     forbedringsloopen (guardrails uendret)
tests/                fire arvede suiter + separation + os + agents
docs/                 dette dokumentet, decisions, architecture, economics
ios/                  iOS-app (ny bundle-ID, se SEPARATION.md)
```

## Flytteplan (fase 1)

Ren import (begrunnelse i SEPARATION.md), sti-justeringer, navnerens med
CI-vakt, publiseringssti endret `tests/<slug>/` → `landing/<slug>/` (kolliderte
med testkatalogen; dokumentert i decisions.md), Pages-workflow med
`enablement`-forsøk. Repo-opprettelse krever eier (GitHub-appen mangler
admin-rettighet) – arbeidet bygges komplett lokalt og transporteres via
branch i opphavsrepoet til repoet finnes.

## Risikoer

- **Pages-aktivering** kan kreve ett manuelt klikk (Settings → Pages) hvis
  `configure-pages` ikke får lov til å aktivere selv.
- **PAT/synk** peker på gammelt repo til eieren oppdaterer (DIN TUR-kø).
- **Assistent-refaktorering** (fase 4) er den eneste fasen som rører
  eksisterende virkemåte; PWA-suiten må holdes grønn som sikkerhetsnett.
