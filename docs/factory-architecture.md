# Company Factory – Arkitektur v3.0

## v3: Fra fabrikk til første krone (nattskift-leveransen)

Suksessdefinisjonen flyttet seg fra «flere motorer» til «trakten i Command
Center»: idéer vurdert → tester publisert → betalende kunder → MRR.

**ADR-1: Datalager for synk.** Vurdert: (a) privat GitHub-repo via contents-API,
(b) Supabase, (c) kun eksport/import. Valgt (a): allerede i stacken (Pages),
commit-historikk gir gratis revisjonsspor av hver lagring, fine-grained PAT kan
begrenses til ett repo, ingen ny leverandør. Migreringsvei: `Gh` er eneste
API-klient – `Sync`/`Publish` er eneste forbrukere. Konflikt: siste skriver
vinner, men taperen sikkerhetskopieres i repoet først (`factory-data.backup-*`).
PAT lagres KUN i `cf_secret_pat` – utenfor eksport, synkdata og rapporter.

**ADR-2: Publisering av tester.** Falsk dør → commit til Pages-repo
(`tests/<slug>/index.html`) → live URL på minutter. Hver publisering er en
eier-port: knappen viser repo, filsti og URL før bekreftelse, og beslutningen
logges byOwner. Live tester overvåkes i Command Center (dager live, dømt/ikke
dømt).

**Kapitaldisiplin (CFO):** budsjett per prosjekt (`Projects.setBudget`,
eier-logget), utgiftslogg (`addExpense` – faktiske kroner ved siden av
AI-estimatet), kill-varsler ved 80 % og 100 % av budsjett (sev0 med eksplisitt
«brukt kapital er ikke argument for å fortsette»), transparent
porteføljeprioritering (`Ranking` – synlig formel, topp 3 + «får ikke ressurser
nå»-hale) og fabrikkens egen effektivitet (kost per idé/validering/byggekjede).

**Usikkerhetsvifte:** `Finance.simulate` (Monte Carlo, dokumenterte spenn
±30–50 % per parameter) gir P10/P50/P90-bånd for MRR og kapitalbehov – tegnes
som SVG-vifte i Fase 3, alltid merket ESTIMAT. Tre scenarier er falsk trygghet.

**Vakthunden:** `Benchmarks` – kildemerkede bransjespenn; antakelser utenfor
spennet i GUNSTIG retning gir varsel (LLM-en får aldri siste ord om egne tall).

**Innboks og radar:** `Inbox` fanger rå idéer (cf_inbox); AEIS-radarens funn
(lese-kontrakt mot `aeis_ledger` – aldri skriv) vises som kandidater.

**Drift:** parkerte prosjekter > 30 dager varsles; `Integrity` selvtest med
tapsfri indeks-reparasjon; prosjekt-tidslinje bygges deterministisk av loggene.

**Eier-køen (`OwnerQueue`):** alt som venter på eieren – PAT, datarepo,
Pages-repo, budsjett, skjema-endepunkt, første ekte idé, PR til main – som
nummerert, klikk-for-klikk-liste i Command Center og System. Tom kø =
selvgående fabrikk.

---

## Control Center (v2.0)

UI-laget er skilt fra motoren og bygget som operativt kontrollsenter:

- **Lagdeling:** `factory.js` (ren motor, `window.CF` er API-et) · `ui.css`
  (design-tokens + komponenter) · `ui.js` (visninger/logikk) · `index.html`
  (tynt skall) · `manifest.webmanifest` (PWA; service worker bevisst utsatt –
  cache-invalidering under rask utvikling er ikke verdt risikoen enda).
- **Seks områder:** Command Center («KREVER DEG NÅ» fra `CF.Alerts`,
  porteføljepuls, MRR-graf av faktiske måletall, aktivitetsspor), Idélab
  (pipeline-kjøring + idé-sammenligning), Selskaper (portefølje + arbeids-
  område med fasestripe over alle 17 faser), Godkjenninger (alle porter med
  hva/hvorfor/risiko/reverserbarhet, utmerket på mobil via bunn-navigasjon),
  Bibliotek (lærdommer + gjenbruk), System (nøkkel, kostnader, lagring, backup).
- **Kommandopalett** (Ctrl/Cmd+K): navigasjon, åpne selskap, ny idé,
  godkjenninger, rapporter – tastaturdrevet.
- **Dype lenker:** hash-ruting (`#/command`, `#/companies/<id>`) – hver
  visning er adresserbar og overlever reload.
- **Motorutvidelser for ekte «levende status»:** `CF.Activity` (varig
  hendelsesspor, `cf_activity`), `CF.Costs` (usage per LLM-kall akkumulert
  per prosjekt/modul; ratene i `COST_RATES` er konfigurerbare estimater),
  `CF.Alerts` (deterministisk varselavledning). `Store.exportAll` dekker nå
  også lærdommer, bibliotek, aktivitet og kostnader.
- **Regresjonskontrakt:** alle element-ID-er og `data-tab`-navn fra v1 er
  beholdt – hele den eksisterende testsuiten består uendret; nytt scenario 9
  dekker Control Center-funksjonene (101 sjekker totalt).
- **Ærlighet i UI:** FAKTISK vs. ESTIMAT (stiplet merke) vs. TEST (gult merke)
  skilles konsekvent; tomme tilstander veileder i stedet for å late som.

---

AI-drevet startup-studio: fra idé → kritisk vurdering → validering → forretningsmodell →
MVP-brief → (neste fase: bygging, betaling, lansering, vekst). Del av SAGA
sammen med SAGA (personlig AI-OS) og AEIS (Executive Board).

---

## A. Systemrevisjon (gjennomført 2026-07-14)

### Hva som faktisk finnes

| Komponent | Hva det er | Tilstand |
|---|---|---|
| `index.html` (SAGA) | Klientside-PWA: stemmeassistent, Claude-streaming, verktøy (websøk, vær, timere, webhooks, MCP), minne og historikk i `localStorage` | God. Fungerer, testet (`tests/e2e.js`, 10 scenarier, mocket API) |
| `aeis/` (AEIS) | Executive Board: 13 dynamiske roller, 14-stegs beslutningspipeline med Devil's Advocate-veto, pre-mortem, Brier-kalibrert autoritet, læringssløyfe | God. Modulær (Store/Roles/Scoring/LLM/Engine/Ledger/Radar/SelfReview), kontrakter i `ARCHITECTURE.md`, testet (`tests/aeis.e2e.js`) |
| `ios/` | Native SwiftUI-versjon av SAGA | Parallell klient, deler ikke kode med web |
| `.github/workflows/pages.yml` | Deploy til GitHub Pages | Fungerer; hele plattformen er statisk hosting |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA-skall | OK |

### Nøkkelfakta som styrer arkitekturvalget

1. **Det finnes ingen backend.** Ingen server, database, API-lag eller orkestreringsprosess.
   Alt kjører i nettleseren; persistens er `localStorage`; Claude API kalles direkte
   («dangerous direct browser access») med brukerens egen nøkkel.
2. **Plattformkonvensjonene er reelle og gjenbrukbare:** delt API-nøkkel
   (`jarvis_api_key`) og modellvalg (`jarvis_model`), én LLM-modul per app som eneste
   nettverkspunkt, JSON-skjema-kontrakter (structured outputs), navneromsdelte
   Store-nøkler, e2e-tester med mocket API, samme designspråk, samme deploy.
3. **AEIS-styret er en genuint gjenbrukbar kapabilitet:** dynamisk rolleregister med
   mandater og fortjent autoritet (`aeis_roles` i Store) — akkurat det Company Factory
   trenger for beslutningsprosessen.

### Svakheter og teknisk gjeld (relevant for Factory)

- **Persistens er per enhet** (localStorage, ~5 MB-grense). Dokumentert i AEIS som kjent
  begrensning med migreringsvei (Store er eneste persistenslag → kan byttes til synk-backend).
  Factory arver både begrensningen og migreringsveien.
- **Ingen duplisering funnet** som må ryddes; SAGA og AEIS deler nøkkel/modell-konvensjon
  men har adskilte navnerom. Ingenting arkiveres eller slettes i denne leveransen.
- **AEIS' LLM-modul er ikke pakket som delt bibliotek** — den lever i `aeis.js`.
  Beslutning: Factory implementerer samme kontrakt i eget navnerom i stedet for å
  importere på tvers (se «Avviste alternativer» under). Når en tredje forbruker oppstår,
  trekkes LLM/Store ut til `platform/`.
- **Ingen kostnadsgrenser per kall-kjede** i AEIS. Factory innfører maks-runder og
  begrenset parallellitet (arvet mønster) + eksplisitte porter før dyre steg.

## B. Arkitekturbeslutning

**Beslutning: Alternativ C med B-trekk (hybrid).** Company Factory bygges som en
selvstendig, modulær applikasjon (`factory/`) på toppen av plattformen, der SAGA/AEIS
forblir det personlige laget. Delingen skjer gjennom definerte kontrakter, ikke delt kode:

- **Identitet/tilgang:** deler `jarvis_api_key` + `jarvis_model` (lese-kontrakt).
- **Executive Board:** leser AEIS' rolleregister (`aeis_roles`) inklusive fortjent
  autoritet når det finnes, og supplerer med fabrikkspesifikke fagroller. Skriver aldri
  til AEIS' navnerom.
- **Egne data:** alt under `cf_*`-navnerom; hvert selskapsprosjekt isolert i egen nøkkel
  `cf_project_<id>` med egen eksport (→ enkelt å spinne ut, selge eller avvikle et prosjekt).

### Vurdering av alternativene

| | Vurdering |
|---|---|
| **A. Inn i SAGA** | Avvist. Gjør PWA-en monolittisk (54 kB index.html allerede), blander personlig assistent med selskapsproduksjon, umulig å feilisolere eller spinne ut. |
| **B. Eget repo/system med API-er** | Avvist *for v1*. Det finnes ingen API-er å kommunisere over — å bygge en backend nå er infrastruktur før behov. Riktig som migreringsvei: når et prosjekt får reell kodebase/kunder, får det eget repo; når synk-backend kommer, blir Store-kontrakten til et API. |
| **C. Modul på toppen av Jarvis-plattformen** | **Valgt.** Matcher den faktiske plattformen (statiske søsterapper med kontrakts-deling), gjenbruker styret og nøkkelhåndteringen, gir feilisolering (Factory kan ikke ødelegge SAGA/AEIS-data), og holder veien åpen mot B. |
| **D. Annen hybrid** | Dekket av C+B-trekkene over. |

Eierens hypotese (Jarvis som overordnet OS, Factory som separat modulær plattform) er
**bekreftet** av analysen — med én presisering: «kommunikasjon gjennom API-er» er i dag
kontrakts-deling via Store-navnerom, fordi det ikke finnes noen serverside. Grensesnittene
er definert slik at de kan løftes til ekte API-er uten å endre modulene.

Begrunnelse mot 5–10-årskriteriene: modularitet og feilisolering (egne navnerom, egen app),
flere fremtidige fabrikker (mønsteret `<app>/`+kontrakter er repeterbart), flere samtidige
prosjekter (prosjekt-isolert lagring), ulike teknologistacker per selskap (prosjektkode skal
bo i egne repoer, fabrikken holder kun metadata/beslutninger), salg/utspinning/avvikling
(per-prosjekt eksport + statuser), unngår at Jarvis blir monolitt (ingenting legges i SAGA).

## C. Målarkitektur

```
┌─────────────────────────────────────────────────────────────────┐
│ SAGA (personlig AI-OS)          AEIS (Executive Board)        │
│  identitet: jarvis_api_key ──────► roller/autoritet: aeis_roles │
└──────────────┬───────────────────────────┬─────────────────────┘
        leser (aldri skriver)       leser (aldri skriver)
┌──────────────┴───────────────────────────┴─────────────────────┐
│ COMPANY FACTORY (factory/)                                      │
│  UI (index.html) – faner: Portefølje, Prosjekt, System          │
│  ────────────────────────────────────────────────────────────  │
│  Board     – roster = AEIS-roller + fabrikkens fagroller        │
│  Intake    – Fase 0: idé → strukturert sak + antakelseslogg     │
│  Evaluation– Fase 1: rollevurderinger → kritisk syntese + score │
│  Planner   – tilpasset faseplan (0–16) med porter/stoppkriterier│
│  Brief     – MVP-brief (kun hvis beslutningen tilsier bygging)  │
│  Projects  – prosjektregister, status, beslutnings-/antakelseslogg │
│  Gates     – beslutningsporter; høyrisikohandlinger krever eier │
│  LLM       – eneste nettverkspunkt (samme kontrakt som AEIS)    │
│  Store     – cf_index + cf_project_<id> (isolert per prosjekt)  │
└─────────────────────────────────────────────────────────────────┘
```

**Dataflyt (v1):** idé → `Intake.run` (1 LLM-kall, strukturert ekstraksjon + antakelser)
→ `Evaluation.run` (framing-kall velger 3–6 relevante roller → isolerte rollevurderinger,
maks 3 parallelt → syntese med scoring 0–100, scenarier, svakheter, alternativer, beslutning)
→ ved beslutning `prototype`/`mvp`/`lansering`: `Planner.run` (faseplan) + `Brief.run`
(MVP-brief). Alle steg logger beslutninger og antakelser på prosjektet.

**Faser:** standardpipeline 0–16 (inntak, idévurdering, markedsvalidering, forretningsmodell,
selskap/strategi, produktdefinisjon, merkevare, teknisk arkitektur, bygg produkt/nettside,
betaling/abonnement, juridisk/personvern, markedsføring, salg, drift/kundeservice,
testing/QA, lansering, måling/vekst). Planner markerer relevans og omfang per fase for det
konkrete prosjektet — små idéer får små planer.

**Beslutningsporter:** hver fase har en port med beslutning
`stopp | parker | valider_mer | endre_konsept | prototype | mvp | lansering | godkjent`.
Handlinger på **eier-listen** (betalinger, kjøp, publisering, domener, juridisk bindende
handlinger, selskapsregistrering, bank/skatt, sletting av kritiske data, masseutsendelser,
kostbare tjenester, høyrisiko produksjonsendringer, sensitive data, offentlig lansering)
kan aldri auto-godkjennes — de krever eksplisitt eierklikk og logges.

**Sikkerhet og isolasjon:** ingen hemmeligheter i kode eller repo (nøkkel kun i
localStorage); Factory skriver aldri til SAGA/AEIS-navnerom; prosjekter er isolert per
Store-nøkkel med egen eksport; LLM-modulen er eneste nettverkspunkt med maks-runder,
begrenset parallellitet og retry-tak; eier-porter for alt med penger/juss/publisering.

**Deploy/overvåking:** GitHub Pages (arvet). Testing: `tests/factory.e2e.js` med mocket
API. Kostnadskontroll: bevisst få og små kall per pipeline-kjøring (~6–9 kall).

## D. Implementeringsplan

| Fase | Innhold | Status |
|---|---|---|
| **F1 (denne leveransen)** | Motor + UI + tester: idéinntak, kritisk vurdering m/styret, scoring, faseplan, MVP-brief, beslutnings-/antakelseslogg, porter, portefølje, eksempelprosjekt | ✅ Bygget og testet |
| **F2 Validering** | Eksperimentkø avledet fra kritiske antakelser (terskel definert før resultat), resultatregistrering med eier-logg, falsk-dør-landingsside-generator (selvstendig deploybar HTML med ærlig venteliste-framing), valideringsport som konkluderer og slipper prosjektet videre/stopper det | ✅ Bygget og testet |
| **F3 Bygging (del 1)** | Fase 3: forretningsmodell med deterministisk økonomimodell (LLM setter begrunnede antakelser, koden beregner 24-mnd MRR/break-even/LTV/CAC/kapitalbehov i tre scenarier, gratis lokal rekalkulering). Fase 6+8: nettsted-generator – komplett statisk nettsted (forside, pris fra planene, FAQ, om, vilkår/personvern som merkede utkast, deploy-README) pakket med egen ZIP-writer. Læringssløyfe: retro per prosjekt → varige lærdommer (`cf_lessons`) injiseres i alle fremtidige LLM-kall. Byggekjeden kjøres automatisk ved byggebeslutning: brief → modell → nettsted | ✅ Bygget og testet |
| **F3 Styring (del 2)** | Fase 14/15: modenhetsstige (prototype → MVP → beta → produksjonsklart → lanseringsklart) med sjekklister per nivå – ingenting erklæres uten at eieren huker av alle punkter; «lansert» er egen eierhandling. Fase 16: måletall per måned mot prognosen (sannsynlig scenario), samlet MRR i porteføljen. Fase 11: prioritert markedsføringsmotor (kanaler etter målgruppe/økonomi, eksperimentkø med terskler). Seksjon 6: gjenbruksbibliotek (`cf_library`) som retro fyller automatisk med kandidater | ✅ Bygget og testet |
| **F3 Bygging (del 3)** | Fase 8–9 dypere: `CF.AppGen` genererer deploybar app-pakke fra MVP-briefen – SPA med innlogging/onboarding/dashboard/abonnementsside (ærlig demo-modus uten konfigurasjon), `config.js` (kun offentlige nøkler), Supabase-skjema med RLS (kun webhook/service-role skriver abonnementsstatus), Stripe-webhook-mal med signaturverifisering og oppsett-README som mapper hvert steg til eier-portene. Reell auth/betaling aktiveres av eieren (Supabase- og Stripe-kontoer) | ✅ Bygget og testet |
| **F4 Plattform** | Trekk LLM/Store ut i `platform/`-bibliotek når tredje forbruker finnes; synk-backend bak Store-kontrakten; gjenbruksbibliotek (maler, moduler) med generalisering etter hvert prosjekt | Etter F3 |
| **F5 Drift/vekst** | Fase 11–16-motorer: målinger inn i porteføljen, ukesrapport, radar-integrasjon mot AEIS | Etter F4 |

Risiko: localStorage-tak ved mange prosjekter (mitigeres av per-prosjekt eksport og
F4-synk); LLM-kostnad ved hyppige kjøringer (mitigeres av porter og få kall);
skjema-drift mellom AEIS-roller og Factory (mitigeres av lese-kun-kontrakt + fallback-roster).

## Kontrakter (modul-API)

- `CF.Store` — `get/set(key)`, `projectIds()`, `loadProject(id)`, `saveProject(p)`,
  `deleteProject(id)`, `exportProject(id)`, `exportAll()`, `importAll(json)`.
  Kun `cf_*`-nøkler. Leser (aldri skriver) `jarvis_api_key`, `jarvis_model`, `aeis_roles`.
- `CF.LLM.call({system,user,schema,maxTokens,onStatus}) → {json|text, usage}` — identisk
  kontrakt som AEIS' LLM. Eneste modul med nettverkstilgang.
- `CF.Board.roster()` — AEIS-roller (aktive, med vekt) ∪ fabrikkens fagroller.
- `CF.Projects` — `create(idea)`, `list()`, `get(id)`, `update(id,patch)`,
  `logDecision(id, entry)`, `logAssumptions(id, list)`, `setPhaseStatus(id, phase, status)`,
  `approveGate(id, gate, byOwner)`.
- `CF.Pipeline.PHASES` — kanonisk fasedefinisjon 0–16 (formål, leveranser, port, stoppkriterier, eierrolle).
- `CF.Intake.run(project)` / `CF.Evaluation.run(project)` / `CF.Planner.run(project)` /
  `CF.Brief.run(project)` — hvert steg muterer prosjektet og returnerer det.
- `CF.Experiments` — `createFrom(p)` (eksperimentkø fra `assumptions_to_validate`, ingen
  LLM-kostnad), `registerResult(p, expId, result, passed)` (eier-logget),
  `review(p)` (valideringsporten: LLM-syntese av resultater → én beslutning som
  overstyrer idévurderingens beslutning i `Pipeline.resume`).
- `CF.BizModel` — `run(p)` (LLM: modell + begrunnede talleantakelser),
  `recompute(p, patch)` (deterministisk og gratis: `Finance.scenarios`).
- `CF.Finance` — `avgPrice(plans)`, `project(assumptions, months)`,
  `scenarios(assumptions)` (konservativ ×0,6 konv/×1,5 churn/×1,4 CAC; offensiv ×1,4/×0,7/×0,8 —
  faste, dokumenterte multiplikatorer). All matematikk i kode; modellen gjetter aldri tall
  som kan beregnes.
- `CF.SiteGen` — `run(p)` (LLM: merkevare-tokens + sideinnhold; bruker forretningsmodellens
  planer eksakt), `renderSite(content, opts)` (deterministisk: 6 HTML-sider + deploy-README,
  delt designsystem fra brand-tokens, ingen eksterne avhengigheter, betalingsknapper som
  Stripe-plassholdere bak eier-porten, juridiske sider merket «krever advokat»),
  `zip(p)` (via `makeZip` – egen STORE-ZIP-writer uten avhengigheter).
- `CF.Retro` / `CF.Lessons` — retro per prosjekt → én generaliserbar lærdom lagres i
  `cf_lessons` (maks 20) og injiseres automatisk i alle fremtidige LLM-kall via
  `ownerContext()` (samme læringssløyfe-mønster som AEIS). Retro høster også
  gjenbrukskandidater til `CF.Library` (`cf_library`).
- `CF.Maturity` — `next(p)`, `checklist(p, level)`, `toggle(p, level, idx, done)`,
  `declare(p, level)` (kaster feil ved nivåhopp eller åpne sjekkpunkter; logges som
  eierbeslutning), `markLaunched(p)` (kun fra «lanseringsklart»). Sjekklistene per nivå
  er definert i kode (`MATURITY_CHECKLISTS`) – ingen LLM-kostnad.
- `CF.Metrics` — `add(p, {month, customers, mrr, churn_pct, visitors})`,
  `compare(p)` (faktisk mot sannsynlig-scenariet, posisjonsvis fra første måned),
  `latest(p)` (aggregeres til samlet MRR i porteføljen).
- `CF.Marketing` — `run(p)` (Fase 11: 2–4 prioriterte kanaler med CAC-hypoteser,
  innholdskalender, annonsekonsepter, e-postsekvens, lanseringsplan, eksperimentkø
  med terskler; masseutsendelser/kampanjer forblir eier-porter).
- `CF.Strategy` — `run(p)` (Fase 4: navn/alternativer/kriterier, posisjonering,
  løfte, prioriteringer, 90-dagers/12-måneders plan, 3-årig retning og eksplisitt
  ikke-gjøre-liste; registrering/varemerker/domener holdes utenfor som eier-porter).
- `CF.Legal` — `run(p)` (Fase 10: krav per område med `must_be_verified_by_professional`,
  persondata-oversikt med behandlingsgrunnlag og lagringstid, forbrukerrettigheter,
  markedsføringsregler, MVA/skatt, handlingsliste). All output bærer disclaimer:
  generell veiledning, ikke juridisk rådgivning.
- `CF.Report` — `generate(p)` (deterministisk Markdown-rapport over alle faser,
  antakelses- og beslutningslogg – nedlastbar fra prosjektheaderen, ingen LLM-kostnad).
  `portfolio()` (porteføljerapport på tvers av prosjekter med samlet MRR, lærdommer,
  bibliotek og faste gjennomgangsspørsmål – grunnlaget for ukentlig gjennomgang).
- `CF.TechArch` — `run(p)` (Fase 7: teknologivalg fra produktets faktiske behov –
  per område: valg, hvorfor, vurderte alternativer, kostnadsestimat, leverandørbinding
  og migreringsvei, pluss eksplisitt «trengs ikke enda»-liste; beslutningen logges med
  alternativer og risiko).
- `CF.Store.usage()` — lagringsbruk per `cf_*`-nøkkel (vises under SYSTEM);
  `Store.set` gir handlingsrettet feilmelding ved full localStorage-kvote i stedet
  for kryptisk QuotaExceededError.
- `CF.Landing` — `run(p, {formEndpoint})` (copy via LLM + `renderHTML`),
  `renderHTML(content, opts)` (selvstendig, responsiv, deploybar HTML: ingen eksterne
  avhengigheter, pris synlig, ærlig disclaimer, schema.org PreOrder; uten
  `formEndpoint` lagres påmeldinger kun i besøkerens nettleser — reell trafikk krever
  et skjema-endepunkt, og dette logges som advarsel på prosjektet).
- `CF.OWNER_GATE_ACTIONS` — listen over handlinger som alltid krever eier.

Utvidelsesregler (arvet fra AEIS): nye moduler = eget navnerom + egen Store-nøkkel;
alle LLM-flyter definerer JSON-skjema og går via `CF.LLM`; kontraktsendringer krever
versjonsbump her.

## Status mot definisjonen av ferdig (v1.4)

Alle punktene i oppdragets «definisjon av ferdig» for første reelle versjon er oppfylt:
arkitektur besluttet og dokumentert; systemet kjører (statisk app, ingen bygg-steg);
idéer registreres og blir prosjekter med strukturert, isolert lagring; pipelinen har
tydelige faser med porter; Executive Board brukes (AEIS-roller + fabrikkroller, kun
relevante per sak); idéer analyseres kritisk og scores; anbefalinger, beslutninger og
antakelser lagres og vises; status/portefølje finnes; modulene er testet (67 sjekker,
mocket API); sikkerhetsgrenser er definert (cf_*-navnerom, eier-porter, lese-kun mot
AEIS/SAGA); eksempelprosjekt er kjørt gjennom og merket TEST; begrensninger er
dokumentert under; neste utviklingsfase er prioritert i planen over.

Bevisst utelatt (ikke glemt): salgsmotor (Fase 12) bygges først når et prosjekt faktisk
krever B2B-salg – hovedfokuset er B2C/selvbetjente abonnementer, og dokumentasjon som
ikke brukes er avfall.

`CF.Ops` (Fase 13) er levert: supportkanaler, FAQ-frø, svarmaler, eskaleringsregler,
hendelses-runbook, månedlig gjennomgang, leverandøroversikt og automatiseringskandidater –
grunnlaget for drift med minst mulig manuelt arbeid.

## Kjente begrensninger (v1)

- Persistens per enhet (localStorage) — migreringsvei: Store-kontrakten → synk-backend (F4).
- Fase 2 (validering), 3 (forretningsmodell) og 6+8 (nettsted) har utførende motorer.
  Det genererte nettstedet er et **lanseringsklart utstillingsvindu med
  betalingsplassholdere** – ikke en applikasjon med innlogging, dashboard og reell
  abonnementsflyt (det krever backend/Stripe-oppsett bak eier-porten, F3 del 2).
- Økonomimodellens scenariomultiplikatorer er faste og dokumenterte – de er et
  rammeverk for følsomhet, ikke en prognose. Modellen skal oppdateres med faktiske
  tall etter validering/lansering (lokal rekalkulering er gratis).
- Landingssiden samler ikke e-poster uten et eksternt skjema-endepunkt (statisk side
  uten backend) — fabrikken sier dette eksplisitt i beslutningsloggen og UI.
- «Lanseringsklart digitalt produkt» ≠ juridisk etablert/operativ/kommersielt validert
  virksomhet — statusmodellen skiller disse, og juridiske dokumenter merkes alltid
  «krever kvalitetssikring av autorisert fagperson».
- Ingen kontinuerlig bakgrunnskjøring (samme begrensning som AEIS' Radar).
