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

## SAGA 3.0-utvidelsen (oppdatert FØR aktivering, 14.07.2026)

Nattskiftet fikk tre nye steg – alle uten nye AI-kall, så kostnadsmodellen over står:

| Steg | AI-kall | Nettverk | Kost |
|---|---|---|---|
| Selskapsstatus (`agents/etterpaa-status.js`) | 0 | 1 Vercel API-kall pr. selskap (kun med VERCEL_TOKEN) | 0 kr (Vercel API er gratis) |
| CFO (`agents/cfo.js`) | 0 | ingen | 0 kr |
| Grunnlovsjekk (`agents/lib/policy.js`) | 0 | ingen | 0 kr |

Budsjettvakten og kill-switchen i `config/budget.json` gjelder HELE nattskiftet:
alle steg kjører etter `guard()` – kill-switch/månedstak stopper også de nye
stegene og statusinnleseren.

## P&L-laget (sannhetslaget, privat)

- `data/pnl.json`: kostnadslinjer pr. selskap m/kilde (FAKTISK/ESTIMAT),
  vedlikeholdt av styret/eier. `recurring` videreføres automatisk.
- `data/pnl-status.json`: skrives hver natt – månedens kost/inntekt/netto,
  forbruk mot grunnlovens 5–15k-ramme og runway mot engangskapitalen.
- Morgenbriefen viser CFO-linjene daglig; inntekt 0 vises som FAKTISK 0 til
  en betalingsløsning er i drift.
- Kumulativ kost pr. selskap skrives til `companies.json` og håndheves mot
  grunnlovens eksperimenttak (over_cap-brudd i briefen).

## 5.0-utvidelsen (oppdatert FØR aktivering, 15.07.2026)

| Nytt steg | AI-kall | Kost |
|---|---|---|
| Agenda, domenevakt (RDAP), beslutningsjournal, mål-tre, ukesbrief, selvrevisjon, moduser | 0 | 0 kr |
| Kvartalsmøte (4×/år) | 1 | ~0,2 kr/kvartal |
| Diktering + lydbrief | 0 (lokalt i nettleseren) | 0 kr |
| Assistentens sannhetslag-verktøy | del av eksisterende dokk-samtaler (nettleser-nøkkelen, måles i appen) | – |
| Dagskiftet | kjører på eierens Claude-abonnement (planlagt rutine), ikke API-nøkkelen | 0 kr ekstra |
