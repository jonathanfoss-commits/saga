# Reality-audit — SAGA 3.0 (fase 0)

Dato: 2026-07-14 (kveld). Alt under er egenverifisert i denne økten — ingenting er arvet
fra oppdragsteksten uten kontroll. Divergenser fra oppdragets skisse er ført i
`docs/decisions.md` (D18–D19).

## 1. Verifisert tilstand

| Påstand i oppdraget | Verifisert? | Funn |
|---|---|---|
| Repo offentlig, live på GitHub Pages | ✅ | Klonet anonymt uten auth → offentlig. Pages-workflow deployer hele repo-rota ved push til main |
| P0: factory-data.json + data/* med ekte forretningsdata | ✅ | `factory-data.json` (61 kB) i rot, synket 14.07 kl. 20:28 (commit `c6d5a8b`). `data/` har brief/board/radar fra nattskiftet (commit `536f526`). Innhold: prosjektidé, antakelser, beslutninger, kostnadslogg |
| Git-historikk eksponerer det samme | ✅ | `factory-data.json`: kun `c6d5a8b` (HEAD). `data/*`: `536f526` + `c6d5a8b`. Ingen eldre versjoner med mer innhold |
| Alle testsuiter grønne | ⚠️ Delvis | To miljøfeil på denne maskinen: (a) hardkodet chromium-sti `/opt/pw-browsers/chromium` i 5 e2e-filer, (b) race i factory.e2e scenario 10 som ga deterministisk rødt her (se D19). Begge fikset; deretter: **alle 7 suiter grønne** |
| Supabase MCP tilkoblet | ✅ | Fungerer. Vercel MCP også tilgjengelig |
| «Gratis tier holder» for Supabase-instans «saga» | ❌ | **Feil premiss.** Gratisgrensen er 2 aktive prosjekter og begge er i bruk: `etterpaa` (produksjon) og `pxljywchvpkihnvpeasp` (= Logg-PWA-en, FREDET). `create_project` avvist med eksplisitt grensefeil. Nytt prosjekt krever betalt plan eller pause av eksisterende — begge er eier-beslutninger |
| Domener uregistrert, AS ikke stiftet | ✅ (kilde) | `saga-pakke/SUMMARY.md`, verifisert 14.07 med Norid/Brreg-oppslag |
| Etterpå live, fase 2B–2H gjenstår | ✅ (kilde) | `~/Claude Code/etterpaa/LAUNCH.md`; Supabase-prosjekt `hbrwxsinbzjoawqhturg` ACTIVE_HEALTHY |

## 2. Hvor sensitivt er det som lå ute?

Innholdet i `factory-data.json` + `data/*`:

- **Én prosjektidé** (abonnement for lagring/deling av viktig informasjon med pårørende)
  med antakelser, styrevurderinger og score.
- **Kostnadslogg** for AI-kall (småbeløp) og tidsstempler.
- **Ingen** hemmeligheter: ingen API-nøkler, PAT-er, passord, persondata eller kundedata.
  (PAT lagres kun i `cf_secret_pat` i localStorage og er eksplisitt utenfor eksporten —
  verifisert i `core/factory.js`.)

Vurdering: **konkurranse-/strategisensitivt, ikke sikkerhetssensitivt.** Fjerning fra
HEAD stopper eksponeringen via Pages og repo-visning; historikk-rensing er anbefalt
hygiene, men ikke akutt. Ærlig konsekvensbilde: ideen har ligget offentlig i timer på
et repo uten trafikk — skaden er mest sannsynlig null, men prinsippet (forretningsdata
aldri offentlig) håndheves nå maskinelt.

## 3. Rotårsak

Synk-modulen (`core/factory.js`, `Sync`) var **designet for et privat datarepo** —
ADR-en i koden valgte GitHub-repo som datalager med fine-grained PAT. Lekkasjen
oppsto fordi det offentlige kode-repoet ble konfigurert som datarepo, og
nattskiftets egen brief anbefalte nettopp det («med dette repoet som datarepo»).
Ingenting hindret det: appen sjekket aldri om datarepoet er privat.

## 4. Valg av sannhetslag (divergens fra skissen — se D18)

**Valgt: privat GitHub-datarepo `jonathanfoss-commits/saga-data`.**

| Kriterium | Privat datarepo | Supabase «saga» |
|---|---|---|
| Kost | 0 kr | Krever betalt plan (~25 USD/mnd) eller pause av fredet/produksjonsprosjekt |
| Tilgjengelig nå | Ja (én eier-handling: opprett repo) | Nei (eier-beslutning om penger først) |
| Kodeendring | Liten — Sync/Gh finnes, kun mål + privatvakt | Stor — ny klient, auth-flyt, skjema i vanilla-JS-app |
| Auth | Fine-grained PAT begrenset til ett repo (= én bruker) | Supabase Auth + RLS (rikere, men overkill for én eier) |
| Revisjonsspor | Git-historikk gratis | Må bygges |
| Spørrbarhet/skala | Svak (JSON-filer) | Sterk |

Kravene i oppdraget oppfylles: forretningsdata aldri i offentlig repo (privatvakt i
app + CI), kun eieren autentiseres (PAT-en ER nøkkelen, repoet er privat), nattskiftet
skriver via token i GitHub Secrets (`DATA_REPO_TOKEN`). Migreringsvei til Supabase
består: `Gh`/`Sync` er eneste forbrukere av lagringslaget (ADR-ens poeng), og dagen
eieren frigjør en Supabase-slot byttes implementasjonen uten å røre resten.

## 5. Miljøbegrensninger i denne økten (påvirker leveranseform)

- **Ingen GitHub-skrivetilgang** fra denne maskinen (ingen PAT/SSH/gh). Alle commits
  er lokale på `claude/saga-3-reality`; push, repo-opprettelse, secrets og
  historikk-rensing er ferdig forberedte eier-handlinger i DIN TUR.
- Supabase/Vercel MCP fungerer og brukes til lesing/verifikasjon (Etterpå-status).
