/* Kvartalsmøtet (E2): første natt i hvert kvartal (eller FORCE_QUARTERLY=1)
 * bygges generalforsamlingen i miniatyr: portefølje, grunnlov-etterlevelse,
 * beslutnings-treffsikkerhet, kost-trend og mål-treet – med innstillinger.
 * Én LLM-runde for syntesen (innenfor budsjettaket); resten er fakta fra
 * sannhetslaget. Arkiveres i data/quarterly/.
 */
"use strict";
const { dataPath, readJSON, writeJSON, llm, today } = require("./lib/common");
const policy = require("./lib/policy");

function shouldRun(now = new Date()) {
  if (process.env.FORCE_QUARTERLY === "1") return true;
  return now.getDate() === 1 && [0, 3, 6, 9].includes(now.getMonth());
}

const MOCK_SYNTHESIS = `INNSTILLING 1: Fortsett Etterpå – klokken går, signal mangler, men pipeline er konkret.
INNSTILLING 2: Ingen nye veddemål før porteføljen er under grunnlovens tak.
VARSEL: Beslutningsjournalen er tom – uten forventninger kan ikke treffsikkerhet måles.`;

async function run({ logEvent } = {}) {
  const now = new Date();
  if (!shouldRun(now)) return { skipped: "ikke kvartalsstart" };
  const q = "Q" + (Math.floor(now.getMonth() / 3) + 1) + "-" + now.getFullYear();

  const companies = readJSON(dataPath("companies.json"), { companies: [] });
  const pnl = readJSON(dataPath("pnl-status.json"), null);
  const policyStatus = readJSON(dataPath("policy-status.json"), null);
  const review = require("./decision-review").run();
  const goals = require("./goals").run();

  const facts = [
    `Selskaper: ${companies.companies.map((c) => `${c.name} (MRR ${c.revenue && c.revenue.mrrNok} kr, klokke ${c.clock && c.clock.deadline})`).join("; ") || "ingen"}`,
    `P&L siste måned: kost ${pnl ? pnl.totals.costNok : "?"} kr, inntekt ${pnl ? pnl.totals.revenueNok : "?"} kr`,
    `Grunnlovsbrudd nå: ${policyStatus ? policyStatus.violations.length : "?"}`,
    review.stats ? `Beslutninger etterprøvd: ${review.stats.judged} (${review.stats.traff} traff)` : "Beslutningsjournal: tom",
    ...goals.lines,
  ].join("\n");

  const { text, mock } = await llm({
    agent: "quarterly",
    system: "Du er styret på kvartalsmøte. Ha rett, ikke vær hyggelig. Gi 2–4 INNSTILLING-er og ev. VARSEL basert KUN på fakta under. Beslutninger er alltid eierens. Norsk, kompakt.",
    user: `KVARTALSFAKTA (${q}):\n${facts}\n\nSkriv kvartalssyntesen.`,
    mockText: MOCK_SYNTHESIS,
    maxTokens: 1500,
  });

  const doc = { schema: 1, quarter: q, generatedAt: now.toISOString(), mode: mock ? "mock" : "live", facts: facts.split("\n"), synthesis: text };
  writeJSON(dataPath("quarterly", q + ".json"), doc);
  if (logEvent) logEvent("kvartalsmote:generert", "Kvartalsmøte " + q, { quarter: q });
  return doc;
}

module.exports = { run };
if (require.main === module) run().then((r) => console.log(JSON.stringify(r, null, 2)));
