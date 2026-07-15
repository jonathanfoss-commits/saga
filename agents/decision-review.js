/* Beslutningsjournalen (C3): hver eierbeslutning journalføres med forventning
 * og etterprøvingsdato. Denne skillen finner poster som har forfalt til
 * etterprøving og ber eieren felle dom i briefen. Retro-statistikken
 * (treffsikkerhet over tid) beregnes for ukesbriefen. Ingen LLM, 0 kr.
 *
 * Skjema (data/decisions-journal.json):
 *   entries: [{ id, at, decision, expectation, reviewAt,
 *               outcome: null | { at, verdict: "traff"|"bom"|"delvis", note } }]
 */
"use strict";
const { dataPath, readJSON, today } = require("./lib/common");

function run() {
  const doc = readJSON(dataPath("decisions-journal.json"), null);
  if (!doc || !Array.isArray(doc.entries)) return { lines: [], due: 0, stats: null };
  const t = today();
  const due = doc.entries.filter((e) => !e.outcome && e.reviewAt && e.reviewAt <= t);
  const lines = due.slice(0, 4).map((e) =>
    `⚖️ Til etterprøving: «${e.decision}» (besluttet ${e.at.slice(0, 10)}). Du forventet: ${e.expectation}. Traff du? Døm i appen.`);

  const judged = doc.entries.filter((e) => e.outcome);
  const stats = judged.length ? {
    judged: judged.length,
    traff: judged.filter((e) => e.outcome.verdict === "traff").length,
    bom: judged.filter((e) => e.outcome.verdict === "bom").length,
    delvis: judged.filter((e) => e.outcome.verdict === "delvis").length,
  } : null;
  return { lines, due: due.length, stats };
}

module.exports = { run };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
