/* Nattlig styremøte: leser synkede fabrikkdata (data/factory-data.json,
 * skrevet av appens Synk) og produserer en protokoll under data/board/.
 * Én nøktern LLM-runde – full styrepipeline kjøres interaktivt i appen.
 * Uten synkede data: ærlig protokoll om at grunnlaget mangler.
 */
"use strict";
const { dataPath, syncData, writeJSON, llm, today } = require("./lib/common");
const policy = require("./lib/policy");

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

  /* Grunnlovsjekk FØR skjønn: harde terskler håndheves i kode, ikke i prompten */
  const { c, mode: cMode } = policy.load();
  const check = policy.evaluatePortfolio(policy.betsFromFactoryData(sync), c);
  out.policy = { constitution: cMode, violations: check.violations, notes: check.notes };
  const policyText = check.violations.length
    ? "GRUNNLOVSBRUDD (håndhevet maskinelt – skal adresseres i protokollen):\n" + check.violations.map((v) => `- ${v.text}`).join("\n")
    : "Ingen grunnlovsbrudd i porteføljen." + (cMode !== "real" ? " (OBS: kjører på eksempel-grunnlov – ekte terskler er ikke lastet.)" : "");

  const { text, mock } = await llm({
    agent: "board-meeting",
    system: `Du er AEIS-styret i nattmodus. Grunnlov: ha rett, ikke vær hyggelig; gjett aldri; merk usikkerhet. Nordstjerne: ${c && c.northStar ? c.northStar.text : "første 1 000 kr/mnd gjentakende"}. Vurder porteføljen nøkternt. For hvert selskap: kort VURDERING, én konkret ANBEFALING, og VARSEL hvis noe krever eieren. Flaggede grunnlovsbrudd SKAL få en anbefaling. Norsk, kompakt.`,
    user: `PORTEFØLJE (FAKTISK, fra eierens synkede data):\n${summary || "(tom)"}\n\n${policyText}\n\nSkriv nattens styreprotokoll.`,
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
