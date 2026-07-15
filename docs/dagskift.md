# Dagskiftet — livsadmin fra e-post/kalender inn i sannhetslaget

Nattskiftet er rene GitHub Actions og kan ikke nå eierens innboks. Dagskiftet
er en **planlagt Claude-rutine på eierens maskin/sky** som har eierens
Gmail-/Kalender-tilkoblinger, og som skriver destillatet til det private
datarepoet. Aktivering er en eier-handling (DIN TUR) — dette dokumentet er
hele oppskriften.

## Kontrakt (ufravikelig)

1. **Arbeidsgiveren er fredet.** Hver e-postkandidat SKAL gjennom jobbfilteret
   (`agents/lib/agenda-filter.js` + privat konfig `saga-data/data/agenda-filter-config.json`)
   FØR noe skrives. Uten konfig slipper ingenting gjennom (fail-closed).
   Kandidater kjøres slik: `node -e 'const f=require("./agents/lib/agenda-filter");
   console.log(JSON.stringify(f.classify({from,subject,snippet})))'` med
   `DATA_DIR=<saga-data-klone>/data`.
2. **Minst mulig sitat**: en agenda-post lagrer tittel, frist, avsendernavn og
   kategori — aldri e-postens innhold utover det.
3. **Aldri utsendelser**: dagskiftet leser og destillerer. Svar/utkast er
   assistentens jobb (drafts/), sending er eierens.

## Rutine-prompt (lim inn i en planlagt Claude-oppgave, f.eks. 07:30 og 16:00)

> Du er SAGAs dagskift. Oppgave: (1) `git pull` i ~/Claude Code/saga-data-staging.
> (2) Søk i Gmail etter uleste e-poster siste 24 t med livsadmin-signaler
> (pakke/hentefrist, faktura/forfall, timeavtale/innkalling, billett,
> abonnementsvarsel, svarfrist). (3) Kjør HVER kandidat gjennom jobbfilteret i
> ~/Claude Code/saga/agents/lib/agenda-filter.js med DATA_DIR satt til
> saga-data-klonens data/ — kun aksepterte kandidater går videre; ved tvil:
> forkast. (4) Legg aksepterte inn i data/agenda.json (id, title, due, source
> {from, kind}, status "ny") — hopp over duplikater (samme title+due).
> (5) Sjekk kalenderen for morgendagens avtaler og skriv dem til
> data/agenda.json med kategori "avtale" hvis de ikke finnes. (6) Commit og push
> med melding «dagskift: N nye poster». (7) Du sender ALDRI e-post, svarer aldri,
> sletter aldri. Jobbrelatert innhold omtales ikke engang i commit-meldinger.

## Aktivering (eier, ~5 min)

1. Verifiser at Gmail/Kalender-tilkoblingene er aktive i Claude.
2. Opprett den planlagte oppgaven med prompten over (to kjøringer/dag holder).
3. Første kjøring: se over hva som havnet i agendaen — juster
   `agenda-filter-config.json` (workWords) hvis noe jobbaktig slapp gjennom.

## Hvorfor ikke Actions med Gmail-API?

OAuth-nøkler til hele innboksen i CI er en større angrepsflate enn verdien
forsvarer, og filteret ville stått uten menneskelig nærhet. Dagskiftet kjører
der eieren allerede har autorisert tilgangene, og skriver kun destillat.
