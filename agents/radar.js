/* Nattlig radar: proaktive funn (muligheter/risikoer/endringer) gitt
 * porteføljen. Skriver data/radar/<dato>.json. Funnene vises i morgenbriefen;
 * eieren tar dem selv videre til Idélab (ingen auto-intake om natten).
 */
"use strict";
const { dataPath, syncData, writeJSON, llm, today } = require("./lib/common");

const MOCK_RADAR = `[MULIGHET] Kommunale energitilskudd endres til høsten – relevant for boligvedlikeholds-abonnementet (middels sikkerhet).
[RISIKO] To nye aktører i samme nisje siste kvartal – differensiering må spisses (lav sikkerhet).
[ENDRING] Formspree har endret gratiskvoten – sjekk skjema-endepunktene på publiserte tester (høy sikkerhet).`;

async function run() {
  const sync = syncData();
  const names = sync ? Object.keys(sync).filter((k) => k.startsWith("cf_project_")).map((k) => sync[k].name + ": " + (sync[k].idea || "")).join("\n") : "(ingen synkede prosjekter)";
  const { text, mock } = await llm({
    agent: "radar",
    system: `Du er SAGAs radar i nattmodus. Finn 2–4 konkrete funn for eierens portefølje. Merk hvert funn [MULIGHET]/[RISIKO]/[ENDRING] + sikkerhetsgrad. Du har IKKE websøk i natt – baser deg på generell kunnskap og si tydelig hva som må verifiseres. Norsk, kompakt.`,
    user: `PORTEFØLJE:\n${names}\n\nNattens radar-funn:`,
    mockText: MOCK_RADAR,
  });
  const out = { schema: 1, date: today(), generatedAt: new Date().toISOString(), mode: mock ? "mock" : "live", findings: text };
  writeJSON(dataPath("radar", today() + ".json"), out);
  return out;
}

module.exports = { run };
if (require.main === module) run().then(() => console.log("radar ok")).catch((e) => { console.error(e.message); process.exit(1); });
