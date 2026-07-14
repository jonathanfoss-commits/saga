# SAGA – arkitektur og modulsamarbeid

```
Nettleser (samme origin – localStorage er delingslaget)
┌──────────────────────────────────────────────────────────┐
│ core/saga-core.js  →  window.SAGA                   │
│   keys      kanonisk saga_api_key/-model m/ legacy-fallback │
│   activity  felles logg (saga_activity) – alle moduler    │
│   bus       on/emit i siden + storage-event på tvers av faner │
│   bridge    forespørsler mellom modulene (saga_requests)  │
├──────────────┬──────────────────┬────────────────────────┤
│ assistant    │ aeis             │ factory                │
│ (stemme-PWA) │ (Executive Board)│ (Company Factory)      │
└──────────────┴──────────────────┴────────────────────────┘
```

Ingen backend: modulene er statiske sider på samme origin. Kjernefilen lastes
av alle tre og deler tilstand gjennom `saga_*`-nøkler. Modulenes egne navnerom
(`cf_*`, `aeis_*`, `jarvis_*`) er datakontrakter som består (decisions.md D2/D7).

## Bro-kontrakten (`window.SAGA.bridge`)

| Kall | Retning | Effekt |
|---|---|---|
| `requestResearch({projectId, project, question})` | factory → assistant | Legger `{type:"research", status:"pending"}` i `saga_requests`; dukker opp som chip i assistenten |
| `pending(type?)` / `all(n)` | begge | Leser køen |
| `complete(reqId, answer)` | assistant → factory | Leverer svar; vises i prosjektets «Research fra assistenten»-panel |
| `resultsFor(projectId)` | factory | Ferdige svar for et prosjekt |
| `addIdeaToFactory(text)` | assistant → factory | Skriver til fabrikkens idé-innboks (`cf_inbox`, samme form som `CF.Inbox`) |
| `factoryStatus()` | assistant → factory | Leser portefølje (navn, fase, score, beslutning, MRR), innboks- og køstørrelse |

### Assistentens SAGA-verktøy (tool use)

- `saga_factory_status` – porteføljestatus («hvordan går det med selskapene mine?»)
- `saga_factory_add_idea` – idé rett i fabrikkens innboks («husk denne forretningsidéen»)
- `saga_answer_research` – uten argumenter: list ventende; med `request_id` + `answer`: lever

### Eksempel: research-flyten ende til ende

1. I fabrikken, på et prosjekt: **🧠 Be assistenten om research** → «Hvor mange
   eneboliger bygges årlig i Norge, og hvem selger vedlikeholdstjenester i dag?»
2. Assistenten viser chip **«📨 1 forespørsel fra fabrikken»** → ett trykk gir
   Claude instruks om å hente køen (`saga_answer_research`), researche med
   websøk, og levere (`saga_answer_research {request_id, answer}`)
3. Prosjektsiden viser svaret under «Research fra assistenten»; begge stegene
   ligger i den felles aktivitetsloggen

### Felles aktivitetslogg

`SAGA.activity.log(module, type, message, ref)` → `saga_activity` (tak 400).
Factory speiler sitt eget revisjonsspor hit (beslutninger, eierhandlinger);
AEIS speiler hovedboks-innslag (beslutninger, radar). Kryssfane-oppdatering via
`storage`-eventet på `saga_bus`.

## Utvidelsesregler

1. Nye kryssmodul-flyter defineres som nye `type`-verdier i `saga_requests`
   med kontrakt dokumentert her – aldri direkte skriving i en annen moduls
   navnerom (unntak: `addIdeaToFactory` følger `CF.Inbox`-formen og er
   dokumentert som kontrakt).
2. `window.SAGA` er eneste offentlige flate; moduler skal tåle at kjernen
   mangler (`try { window.SAGA … } catch`).
3. Kontraktsendringer krever oppdatering av dette dokumentet + smoke-testene
   i `tests/saga.e2e.js`.
