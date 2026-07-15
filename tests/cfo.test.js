/* CFO-tester: månedens P&L fra sannhetslaget (recurring-videreføring, ærlig
 * 0-inntekt, ramme fra grunnloven, runway), kumulativ selskapskost som grunnlag
 * for grunnlovens eksperimenttak, og CFO-seksjonen i morgenbriefen.
 *
 * Run:  node tests/cfo.test.js
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log("  ✅ " + name);
  else { failures++; console.error("  ❌ " + name + (detail !== undefined ? "\n     " + JSON.stringify(detail).slice(0, 400) : "")); }
}

const month = new Date().toISOString().slice(0, 7);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saga-cfo-"));
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(path.join(tmp, "constitution.json"), JSON.stringify({
  schema: 1, source: { sha256: "fixture" }, northStar: { text: "1 000 kr/mnd." },
  thresholds: {
    validationWindowDays: { value: 90, ref: "f" }, maxActiveBets: { value: 2, ref: "f" },
    perExperimentCapNok: { value: 1000, ref: "f" },
    monthlyInvestmentNok: { min: 5000, max: 15000, ref: "f" },
    oneOffCapitalNok: { value: 50000, ref: "f" },
  },
  mandate: { free: ["analyse", "research", "planlegging", "rapportering", "forslag"], ownerGate: [] },
}));
fs.writeFileSync(path.join(dataDir, "pnl.json"), JSON.stringify({
  schema: 1,
  capitalNok: { value: 50000 },
  entries: [
    { month: "2026-01", company: "delt", item: "Vercel Pro", nok: 220, label: "ESTIMAT", source: "f", recurring: true },
    { month: month, company: "etterpaa", item: "Domene", nok: 150, label: "FAKTISK", source: "f", recurring: false },
    { month: "2026-01", company: "etterpaa", item: "Gammel engangskost", nok: 1300, label: "FAKTISK", source: "f", recurring: false },
  ],
}));
const deadline = new Date(Date.now() + 80 * 86400000).toISOString().slice(0, 10);
fs.writeFileSync(path.join(dataDir, "companies.json"), JSON.stringify({ schema: 1, companies: [{
  id: "etterpaa", name: "Etterpå", domain: "test",
  clock: { startedAt: "2026-07-01", windowDays: 90, deadline, signalDefinition: "Betalende kunde." },
  revenue: { mrrNok: 0, customers: 0, label: "FAKTISK", source: "f" },
}] }));

const env = { ...process.env, MOCK_LLM: "1", ANTHROPIC_API_KEY: "", VERCEL_TOKEN: "", MOCK_VERCEL_STATE: "READY", DATA_DIR: dataDir, CONSTITUTION_FILE: path.join(tmp, "constitution.json") };
execFileSync("node", [path.join(__dirname, "..", "agents", "night-shift.js")], { env });

const status = JSON.parse(fs.readFileSync(path.join(dataDir, "pnl-status.json"), "utf-8"));
const companies = JSON.parse(fs.readFileSync(path.join(dataDir, "companies.json"), "utf-8"));
const brief = JSON.parse(fs.readFileSync(path.join(dataDir, "brief-latest.json"), "utf-8"));
const policyStatus = JSON.parse(fs.readFileSync(path.join(dataDir, "policy-status.json"), "utf-8"));

/* 1: månedens P&L */
check("recurring videreføres, engangskost fra gammel måned gjør det ikke",
  status.perCompany.delt.costNok === 220 && status.perCompany.etterpaa.costNok === 150, status.perCompany);
check("inntekt 0 vises FAKTISK-ærlig i totalene", status.totals.revenueNok === 0 && status.totals.note.includes("FAKTISK"), status.totals);
check("ramme fra grunnloven: prosent av 15 000", status.frame.maxNok === 15000 && status.frame.usedPct >= 2, status.frame);
check("runway beregnes mot engangskapitalen", typeof status.runwayMonths === "number" && status.runwayMonths > 0 && status.runwayMonths < 200, status.runwayMonths);

/* 2: kumulativ selskapskost → eksperimenttaket håndhever */
check("companies.json får kumulativ kost (150+1300)", companies.companies[0].pnl.totalCostNok === 1450, companies.companies[0].pnl);
check("grunnloven: kumulativ kost over taket (1000) uten signal → over_cap",
  policyStatus.violations.some((v) => v.code === "over_cap" && v.bet === "Etterpå"), policyStatus.violations);

/* 3: morgenbriefen har CFO-seksjon */
const cfoSection = (brief.sections || []).find((s) => s.title === "CFO");
check("CFO-seksjon i briefen med måned, ramme og runway",
  !!cfoSection && cfoSection.lines.some((l) => l.includes("inntekt 0 kr")) && cfoSection.lines.some((l) => l.includes("15000") || l.includes("15 000")), cfoSection);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error("\n" + failures + " FAILURES"); process.exit(1); }
console.log("\nALL CFO TESTS PASSED");
