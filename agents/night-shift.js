/* Nattskiftets orkestrator: vakt → styremøte → radar → morgenbrief.
 * Stoppes av kill-switch/budsjettak/manglende nøkkel – da skrives en ÆRLIG
 * brief om hvorfor natten var stille (aldri en stille feil). Exit 0 uansett
 * årsak som er «villet» (vakt), slik at workflowen committer briefen.
 *
 *   node agents/night-shift.js            (live – krever ANTHROPIC_API_KEY)
 *   MOCK_LLM=1 node agents/night-shift.js (deterministisk demo/test)
 */
"use strict";
const { dataPath, syncData, writeJSON, readJSON, guard, budget, monthSpentNok, today, MOCK } = require("./lib/common");
const policy = require("./lib/policy");

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
    /* Selskapsstatus FØR styremøtet: styret skal se ferske, kildemerkede tall */
    await require("./etterpaa-status").run();
    /* CFO før styremøtet: oppdaterer kumulativ kost pr. selskap (eksperimenttaket) */
    const pnlStatus = require("./cfo").run();
    const board = await require("./board-meeting").run();
    const radar = await require("./radar").run();

    /* Grunnlovsjekk: alltid i briefen, alltid ærlig om hvilken grunnlov som gjaldt.
     * Status arkiveres maskinlesbart (policy-status.json) så skallet kan vise den. */
    const { c, mode: cMode } = policy.load();
    const bets = policy.betsFromFactoryData(syncData()).concat(policy.betsFromCompanies(readJSON(dataPath("companies.json"), null)));
    const check = policy.evaluatePortfolio(bets, c);
    const policyStatus = { schema: 1, date: today(), generatedAt: new Date().toISOString(), constitution: cMode, violations: check.violations, notes: check.notes };
    writeJSON(dataPath("policy-status.json"), policyStatus);
    const policyLines = check.violations.length
      ? check.violations.map((v) => (v.severity === 0 ? "🔴 " : "🟡 ") + v.text)
      : ["Ingen brudd på tersklene."];
    if (cMode !== "real") policyLines.push("OBS: kjører på eksempel-grunnlov – legg constitution.json i datarepoet for ekte håndheving.");

    const spentBefore = monthSpentNok();
    brief = {
      schema: 1, date: today(), generatedAt: new Date().toISOString(),
      mode: MOCK ? "mock" : "live",
      headline: (board.projects || board.companies)
        ? `Styret vurderte ${(board.projects || 0) + (board.companies || 0)} veddemål (${board.companies || 0} selskap), radaren fant nytt`
        : "Natten var stille – styret mangler synkede data",
      sections: [
        { title: "Styremøtet", lines: (board.protocol || board.note || "").split("\n").filter(Boolean).slice(0, 8) },
        { title: "Radar", lines: (radar.findings || "").split("\n").filter(Boolean).slice(0, 6) },
        { title: "Grunnlovsjekk", lines: policyLines.slice(0, 6) },
        { title: "CFO", lines: [
          `Måned ${pnlStatus.month}: kost ${pnlStatus.totals.costNok} kr · inntekt ${pnlStatus.totals.revenueNok} kr${pnlStatus.totals.revenueNok === 0 ? " (FAKTISK – ingen betalingsløsning i drift)" : ""} · netto ${pnlStatus.totals.netNok} kr`,
          pnlStatus.frame.maxNok !== null
            ? `Ramme: ${pnlStatus.frame.usedPct} % av ${pnlStatus.frame.maxNok} kr/mnd (grunnloven)`
            : "Ramme ukjent – privat grunnlov mangler i sannhetslaget.",
          pnlStatus.runwayMonths !== null
            ? `Runway: ~${pnlStatus.runwayMonths} mnd på engangskapitalen ved dagens netto (ESTIMAT)`
            : "Runway: ikke beregnbar (positiv drift eller ukjent kapital).",
        ] },
      ],
      actions: board.projects
        ? [{ title: "Les protokollen og radar-funnene – godkjenn/avvis i appen", why: "Agentene beslutter aldri på dine vegne." }]
        : [{ title: "Kjør «Synk nå (push)» under System – mot det PRIVATE datarepoet", why: "Uten synkede data har nattskiftet ingenting å vurdere. Datarepoet skal være privat (saga-data), aldri kode-repoet." }],
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
