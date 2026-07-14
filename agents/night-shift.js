/* Nattskiftets orkestrator: vakt → styremøte → radar → morgenbrief.
 * Stoppes av kill-switch/budsjettak/manglende nøkkel – da skrives en ÆRLIG
 * brief om hvorfor natten var stille (aldri en stille feil). Exit 0 uansett
 * årsak som er «villet» (vakt), slik at workflowen committer briefen.
 *
 *   node agents/night-shift.js            (live – krever ANTHROPIC_API_KEY)
 *   MOCK_LLM=1 node agents/night-shift.js (deterministisk demo/test)
 */
"use strict";
const { dataPath, writeJSON, readJSON, guard, budget, monthSpentNok, today, MOCK } = require("./lib/common");

function stoppedBrief(reason, code) {
  return {
    schema: 1, date: today(), generatedAt: new Date().toISOString(),
    mode: code === "UNCONFIGURED" ? "unconfigured" : "stopped",
    headline: code === "UNCONFIGURED" ? "Nattskiftet er ikke konfigurert" : "Nattskiftet står (villet stopp)",
    sections: [{ title: "Årsak", lines: [reason] }],
    actions: [code === "UNCONFIGURED"
      ? { title: "Legg inn ANTHROPIC_API_KEY som repo-secret (Settings → Secrets → Actions)", why: "Agentene kan ikke tenke uten nøkkel. Nøkkelen forlater aldri GitHubs secret-lager." }
      : { title: "Vurder taket i config/budget.json eller fjern config/KILL_SWITCH", why: reason }],
    costs: { estimateNok: 0, monthNok: Math.round(monthSpentNok()), capNok: budget().monthlyCapNok },
  };
}

async function run() {
  let brief;
  try {
    guard();
    const board = await require("./board-meeting").run();
    const radar = await require("./radar").run();
    const spentBefore = monthSpentNok();
    brief = {
      schema: 1, date: today(), generatedAt: new Date().toISOString(),
      mode: MOCK ? "mock" : "live",
      headline: board.projects ? `Styret vurderte ${board.projects} selskap${board.projects === 1 ? "" : "er"}, radaren fant nytt` : "Natten var stille – styret mangler synkede data",
      sections: [
        { title: "Styremøtet", lines: (board.protocol || board.note || "").split("\n").filter(Boolean).slice(0, 8) },
        { title: "Radar", lines: (radar.findings || "").split("\n").filter(Boolean).slice(0, 6) },
      ],
      actions: board.projects
        ? [{ title: "Les protokollen og radar-funnene – godkjenn/avvis i appen", why: "Agentene beslutter aldri på dine vegne." }]
        : [{ title: "Kjør «Synk nå (push)» under System", why: "Uten synkede data har nattskiftet ingenting å vurdere." }],
      costs: { estimateNok: Math.round((monthSpentNok() - spentBefore) * 10) / 10, monthNok: Math.round(monthSpentNok() * 10) / 10, capNok: budget().monthlyCapNok },
    };
  } catch (e) {
    if (!["KILL", "BUDGET", "UNCONFIGURED"].includes(e.code)) throw e;
    brief = stoppedBrief(e.message, e.code);
  }
  writeJSON(dataPath("brief-latest.json"), brief);
  writeJSON(dataPath("briefs", today() + ".json"), brief);
  console.log("morgenbrief:", brief.mode, "–", brief.headline);
  return brief;
}

module.exports = { run };
if (require.main === module) run().catch((e) => { console.error("nattskift-feil:", e.message); process.exit(1); });
