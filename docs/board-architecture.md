# AEIS – Adaptive Executive Intelligence System

**Arkitekturdokument v1.1** · Modulært, skalerbart, selvutviklende.

## Formål

AEIS er ikke en chatbot. Det er et permanent Executive Intelligence System som skal
maksimere langsiktig nettoverdi, beslutningskvalitet, kapitalavkastning, læring og
frihet — på tvers av alle selskaper, bransjer og teknologier eieren arbeider med,
nå og i fremtiden. Arkitekturen er bevisst domene-agnostisk: ingenting i kjernen
antar en bestemt bransje.

**Filosofi (bakes inn i hvert eneste LLM-kall):**
Systemet skal ha rett, ikke være hyggelig. Det skal si fra når data motsier eierens
antakelser, være villig til å være uenig, aldri bekrefte en idé fordi eieren liker
den, aldri gjette, aldri uttrykke større sikkerhet enn dataene tilsier, og heller
si «det finnes ikke nok informasjon» enn å finne på et svar.

## Moduler og grensesnitt

Alle moduler kommuniserer gjennom veldefinerte JSON-kontrakter og deler kun tilstand
via `Store`. Nye moduler kan legges til uten å endre eksisterende — de registrerer
seg mot de samme kontraktene.

```
┌──────────────────────────────────────────────────────────────┐
│  UI (aeis/index.html)  – faner: Styrerom, Hovedbok, Roller,  │
│                          Radar, System                       │
└───────────────┬──────────────────────────────────────────────┘
                │ kaller kun offentlige modul-API-er
┌───────────────┴──────────────────────────────────────────────┐
│  Engine        – beslutningspipelinen (14 steg)              │
│  Roles         – dynamisk rolleregister + vekting            │
│  Ledger        – hovedbok: beslutninger, antakelser, utfall  │
│  Scoring       – kalibrering (Brier) → autoritetsvekter      │
│  Radar         – proaktiv mulighets-/risikoskanning          │
│  SelfReview    – evaluerer egen arkitektur, foreslår endring │
│  LLM           – ett kall-grensesnitt mot Claude API         │
│  Store         – persistens (localStorage, eksport/import)   │
│  Backup        – kryptert sky-backup (privat GitHub-gist)    │
└──────────────────────────────────────────────────────────────┘
```

### LLM (infrastruktur)
`LLM.call({kind, system, user, schema?, tools?, maxTokens?}) → {json?|text, usage}`
- Ett sted for all modellkontakt.
- **Smart modellrouting** (`aeis_routing`, standard «smart»): `kind` bestemmer modell —
  devil + synthesis kjøres på toppmodellen (claude-opus-4-8), øvrige kall på
  claude-sonnet-5. «quality» = alt på toppmodellen.
- **Prompt caching:** systemprompten er to blokker — (1) grunnlov + eierprofil +
  lærdommer med `cache_control` (identisk på tvers av kall i én beslutning),
  (2) modulspesifikk instruks. Kutter inputkostnaden vesentlig.
- **Kostnadsmåler:** `LLM.resetMeter()` per beslutning; forbruk (tokens, USD)
  lagres som `decision.cost`. `Engine.estimateCost()` gir anslag før kjøring.
- `schema` gir garantert parsebar JSON via structured outputs.
- Håndterer `pause_turn` (serversideverktøy som websøk) og retry ved overlast.
- `?debug` i URL-en logger alle kall (kind, modell, tokens) til konsoll + SYSTEM-fanen.
- **Kontrakt:** ingen annen modul (utenom Backup mot GitHub) gjør nettverkskall.

### Roles (dynamisk organisasjon)
Datamodell: `{id, title, mandate, active, temporary?, track: {n, brierSum, history[{p, o, at}]}}`
- 13 standardroller (CEO, CSO, CFO, COO, CTAIO, Growth, Product, Investment,
  Human Capital, Legal & Risk, Data & Intelligence, Innovation, Devil's Advocate)
  er kun et startpunkt.
- API: `all() / active() / add() / retire() / update() / weightOf(role)`
- Ingen rolle er permanent: roller kan opprettes, avvikles, slås sammen og
  spesialiseres — av eieren i UI, av Engine (midlertidige eksperter per sak),
  eller foreslås av SelfReview (permanente endringer, krever eiers godkjenning).
- **Kontrakt:** `weightOf` er eneste kilde til autoritet. Alle starter på 1,0×.

### Engine (beslutningsmodellen)
`Engine.runDecision(problem, context, onProgress) → DecisionRecord`
Pipeline (speiler beslutningsmodellens 14 steg):
1. **Framing-kall** → `{problem, unknowns[], data_needed[], selected_roles[],
   temporary_experts[]}` — kun relevante agenter deltar (adaptiv intelligens);
   nye midlertidige eksperter kan opprettes for én sak.
2. **Uavhengige analyser** — ett isolert kall per valgt rolle (parallellisert,
   maks 3 samtidig). Ingen ser de andres svar. Kontrakt per analyse:
   `{position, assumptions[{claim, confidence}], risks[], data_gaps[],
   recommendation, certainty, probability_success|null, needs_more_info}`
3. **Devil's Advocate** ser alle analysene →
   `{objections[], untested_assumptions[], groupthink_signals[], veto, veto_reason}`
   **Veto-kontrakt:** ved `veto=true` kjøres analyserunden ÉN gang til med
   innvendingene injisert (maks 2 runder, deretter flagges saken).
4. **Pre-Mortem** — antar «om to år var dette en katastrofe» →
   `{failure_story, causes[], missed_signals[], mitigations[]}`
5. **CEO-syntese** (får rollenes autoritetsvekter) → `{summary, disagreements[],
   scenarios[{name, probability, value_estimate}], expected_value_reasoning,
   outside_view, recommendation, certainty, probability_success, action_plan[],
   assumptions_to_track[{claim, test, review_horizon}]}` — `outside_view` er
   obligatorisk base rate-vurdering (utenfra-perspektivet).
- Beslutningshierarkiet (fakta > egne data > historikk > statistikk > logikk >
  ekspertvurdering > intuisjon) og usikkerhetsgradering (høy/middels/lav +
  sannsynlighet) er del av systemprompten i alle kall.

### Ledger (hovedbok + læring)
`add(record) / list() / get(id) / registerOutcome(id, successPct, notes) / lessons(n)`
- Hver beslutning lagres med alle analyser, antakelser og CEO-ens prediksjon.
- `registerOutcome` utløser: (a) Scoring av alle agenters `probability_success`
  mot faktisk utfall, (b) et **Post-Mortem-kall** → `{what_worked[], what_failed[],
  assumptions_right[], assumptions_wrong[], best_agents[], process_improvements[]}`
  som lagres som *lærdom*.
- **Læringssløyfe-kontrakt:** de siste lærdommene injiseres automatisk i alle
  fremtidige framing- og syntese-kall. Systemet blir smartere uten nye instrukser.
- **Antakelses-oppfølging:** `openAssumptions()` returnerer alle falsifiserbare
  antakelser fra CEO-synteser som verken er avhuket (`toggleAssumption`) eller
  lukket av et registrert utfall. UI-et varsler om åpne antakelser i styrerommet.

### Scoring (fortjent autoritet)
- Brier-score per rolle per utfall: `(p_rolle − utfall)²`.
- `weightOf = clamp(0.25/(0.05 + snittBrier), 0.5, 2.0)`; roller uten historikk = 1,0×.
- Vekten vises i UI og gis til CEO-syntesen. Autoritet fortjenes — aldri permanent.

### Radar (proaktivitet)
`Radar.run() / hoursSince() / latest() / parseFindings(text)`
— bruker websøk + eierprofil + hovedbok til å identifisere
muligheter, risikoer, markedsendringer, flaskehalser og forslag (investeringer,
nye selskaper, produkter, automatisering) uten at eieren spør. Funn lagres i
hovedboken. Funn merkes [MULIGHET]/[RISIKO]/[ENDRING] og kan konverteres til
styresak med ett trykk. Tidsstempel (`aeis_radar_last`) driver «siden sist»-visning
og valgfri auto-kjøring ved åpning når det er gått >24 t (`aeis_radar_auto`).
(Kontinuerlig kjøring med lukket app krever en vertsprosess — fortsatt utvidelsespunkt.)

### SelfReview (selvforbedring)
`SelfReview.run()` — leser dette dokumentet + gjeldende roller, vekter og
hovedbok-statistikk, og produserer: svakheter i egen struktur, forslag til nye/
endrede roller, prosessforbedringer og en migreringsplan. Ingen del av systemet
er «ferdig».

### Store (persistens)
- Nøkler: `aeis_roles`, `aeis_ledger`, `aeis_profile`, `jarvis_api_key` (deles
  med SAGA-appen). Eksport/import som JSON-fil for backup og flytting.
- **Eierprofilen** (`aeis_profile`) er styringsgrunnlaget: den injiseres via
  `ownerContext()` i framing, alle rolleanalyser, Devil's Advocate, pre-mortem,
  CEO-syntesen og radaren. SAGA-appen leser samme nøkkel som bakgrunnskunnskap.
  Profilen lagres av personvernhensyn kun i localStorage — aldri i repoet.

### Backup (umistelig hukommelse)
`Backup.backup() / restore() / maybeAuto()` — hele tilstanden (roller, hovedbok,
profil) krypteres **på enheten** med AES-256-GCM (nøkkel avledet av eierens
passordfrase via PBKDF2-SHA256, 210 000 iterasjoner) og lagres i en **privat
GitHub-gist** (fint-innstilt token med kun gist-scope). GitHub ser aldri klartekst.
Auto-backup (debounced) utløses av endringer i `aeis_roles`/`aeis_ledger`/profilen
når den er aktivert. Feil passordfrase gir kontrollert feilmelding — aldri korrupt import.

## Utvidelsesregler

1. Nye moduler får eget navnerom og egen Store-nøkkel; de endrer aldri andre
   modulers data direkte.
2. Nye LLM-flyter definerer sitt JSON-skjema og går gjennom `LLM.call`.
3. Nye roller trenger kun `{title, mandate}` — resten (analyse, vekting,
   deltakervalg) følger automatisk av kontraktene over.
4. UI-faner er selvstendige; en ny fane kan legges til uten å røre de andre.
5. Endringer i kontraktene over krever versjonsbump i dette dokumentet.

## Kjente begrensninger (v1) og migreringsvei

- **Persistens er per enhet** (localStorage). Migreringsvei: Store-modulen er
  eneste persistenslag — bytt implementasjon til en synk-backend uten å røre
  andre moduler.
- **Proaktivitet krever åpen app.** Migreringsvei: flytt Radar til en planlagt
  kjøring (f.eks. GitHub Actions cron eller Managed Agents) som skriver til
  samme hovedbok-format.
- **Én enhet = én hjerne.** Eksport/import dekker flytting; synk er neste steg.
