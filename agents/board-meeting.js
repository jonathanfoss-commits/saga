/* Nattlig styremøte: leser synkede fabrikkdata (data/factory-data.json,
 * skrevet av appens Synk) og produserer en protokoll under data/board/.
 * Én nøktern LLM-runde – full styrepipeline kjøres interaktivt i appen.
 * Uten synkede data: ærlig protokoll om at grunnlaget mangler.
 */
"use strict";
const { dataPath, syncData, writeJSON, llm, today } = require("./lib/common");

const MOCK_PROTOCOL = `SELSKAP: BoligPuls (TEST)
VURDERING: Validering står stille – falsk dør er publisert, men ingen resultater er registrert.
ANBEFALING: Registrer eksperimentresultat eller sett kill-dato. Ikke bruk mer kapital før terskelen er dømt.
VARSEL: Ingen måletall siste 30 dager.`;

async function run() {
  const sync = syncData();
  const out = { schema: 1, date: today(), generatedAt: new Date().toISOString(), source: sync ? "factory-data.json (FAKTISK, sist synket av eier)" : "ingen", items: [] };

  if (!sync) {
    out.note = "Ingen synkede fabrikkdata i sannhetslaget. Kjør «Synk nå (push)» under System i appen, mot det PRIVATE datarepoet (saga-data) – da får styret grunnlag. Bruk ALDRI det offentlige kode-repoet som datarepo.";
    writeJSON(dataPath("board", today() + ".json"), out);
    return out;
  }

  const projects = Object.keys(sync).filter((k) => k.startsWith("cf_project_")).map((k) => sync[k]);
  const summary = projects.map((p) => `- ${p.name}${p.test ? " (TEST)" : ""}: status ${p.status}, fase ${p.phase}, score ${p.evaluation ? p.evaluation.totalScore + "/100" : "ikke evaluert"}, sist oppdatert ${(p.updatedAt || "").slice(0, 10)}`).join("\n");
  const { text, mock } = await llm({
    agent: "board-meeting",
    system: `Du er AEIS-styret i nattmodus. Grunnlov: ha rett, ikke vær hyggelig; gjett aldri; merk usikkerhet. Vurder porteføljen nøkternt. For hvert selskap: kort VURDERING, én konkret ANBEFALING, og VARSEL hvis noe krever eieren. Norsk, kompakt.`,
    user: `PORTEFØLJE (FAKTISK, fra eierens synkede data):\n${summary || "(tom)"}\n\nSkriv nattens styreprotokoll.`,
    mockText: MOCK_PROTOCOL,
  });
  out.mode = mock ? "mock" : "live";
  out.protocol = text;
  out.projects = projects.length;
  writeJSON(dataPath("board", today() + ".json"), out);
  return out;
}

module.exports = { run };
if (require.main === module) run().then((r) => console.log("styremøte ok:", r.projects ?? 0, "selskaper")).catch((e) => { console.error(e.message); process.exit(1); });
