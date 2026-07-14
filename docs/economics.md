# Nattskiftets økonomi (ESTIMAT – satt FØR aktivering)

Alle tall er estimater merket som det. Faktisk forbruk bokføres i
`data/agent-costs.json` (FAKTISK per kall) og vises i morgenbriefen mot taket.

## Kostnadsmodell per natt

| Agent | Kall | Tokens (est.) | Modell | Kost (est.) |
|---|---|---|---|---|
| Styremøte (nattmodus) | 1 | ~1 500 inn / 800 ut | claude-sonnet-5 | ~0,18 kr |
| Radar (uten websøk) | 1 | ~800 inn / 500 ut | claude-sonnet-5 | ~0,11 kr |
| Morgenbrief | 0 (ren aggregering) | – | – | 0 kr |
| **Sum per natt** | 2 | | | **~0,3 kr** |

Antakelser: prisene i `config/budget.json` (USD 3/15 per MTok, kurs 11),
liten portefølje (≤5 selskaper). Vokser porteføljen, vokser input omtrent
lineært – tidobling gir fortsatt < 3 kr/natt.

## Månedstak: 200 kr – begrunnelse

- Forventet forbruk: ~10 kr/mnd (30 netter × 0,3 kr) → taket er ~20×
  forventet, så normale kjøringer aldri stopper, men en feil (løkke,
  promptvekst, prisendring) aldri koster mer enn 200 kr.
- Taket er **hardt**: `agents/lib/common.js` nekter å starte over taket.
  Kill-switch: opprett `config/KILL_SWITCH` – alt står umiddelbart.
- GitHub Actions: offentlig repo = gratis minutter; ~1–2 min/natt.

## Hva som IKKE telles her

Interaktiv bruk i nettleseren (fabrikk-kjøringer, styremøter du starter selv,
dokken) går på nettleser-nøkkelen og måles separat i appen (AI-KOSTNADER
under System). Nattskiftet bruker kun repo-secreten.

## Revurdering

Morgenbriefen viser månedsforbruk mot tak hver dag. Endre taket bevisst i
`config/budget.json` (eierbeslutning, commit = revisjonsspor).
