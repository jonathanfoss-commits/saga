/* Policy-motor-tester: mandatmatrise (fail-closed), terskler mot fixtures,
 * example-modus-ærlighet og at nattskiftet arkiverer policy-status og flagger
 * brudd i morgenbriefen. Node uten nettverk (MOCK_LLM).
 *
 * Run:  node tests/policy.test.js
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log("  ✅ " + name);
  else { failures++; console.error("  ❌ " + name + (detail !== undefined ? "\n     " + JSON.stringify(detail) : "")); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saga-policy-"));
const dataDir = path.join(tmp, "data");
fs.mkdirSync(dataDir, { recursive: true });

/* Fixture-grunnlov med ekte-lignende terskler (og sha256 så mode=real) */
const constitution = {
  schema: 1,
  source: { file: "fixture", updatedAt: "2026-07-14", sha256: "deadbeef" },
  northStar: { ref: "fixture", text: "Første 1 000 kr/mnd gjentakende.", monthlyRecurringNok: 1000 },
  thresholds: {
    validationWindowDays: { value: 90, ref: "fixture" },
    maxActiveBets: { value: 2, ref: "fixture" },
    perExperimentCapNok: { value: 15000, ref: "fixture" },
  },
  mandate: { free: ["analyse", "research", "planlegging", "rapportering", "forslag"], ownerGate: ["pengebruk"] },
};
/* Ikke på standardstien (søsken til data/) – test 3 krever at den IKKE finnes der */
fs.mkdirSync(path.join(tmp, "fixture"));
const cFile = path.join(tmp, "fixture", "constitution.json");
fs.writeFileSync(cFile, JSON.stringify(constitution));

process.env.DATA_DIR = dataDir;
process.env.CONSTITUTION_FILE = cFile;
const policy = require("../agents/lib/policy");

/* 1: mandatmatrisen er fail-closed */
{
  const { c } = policy.load();
  check("mandat: fri kategori er fri", policy.requiresOwner("analyse", c) === false, null);
  check("mandat: eier-gate er eier-gate", policy.requiresOwner("pengebruk", c) === true, null);
  check("mandat: UKJENT kategori krever eieren (fail-closed)", policy.requiresOwner("noe_helt_nytt", c) === true, null);
  check("mandat: uten grunnlov krever alt eieren", policy.requiresOwner("analyse", null) === true, null);
}

/* 2: terskler mot fixtures */
{
  const { c } = policy.load();
  const now = new Date("2026-07-14");
  const old = "2026-03-01"; // 135 dager før
  const fresh = "2026-07-01";

  const r1 = policy.evaluatePortfolio([
    { name: "A", active: true, startedAt: fresh, spentNok: 0, signal: false },
    { name: "B", active: true, startedAt: fresh, spentNok: 0, signal: false },
    { name: "C", active: true, startedAt: fresh, spentNok: 0, signal: false },
  ], c, now);
  check("terskel: >2 aktive satsinger flagges", r1.violations.some((v) => v.code === "max_bets"), r1);

  const r2 = policy.evaluatePortfolio([{ name: "Gammel", active: true, startedAt: old, spentNok: 0, signal: false }], c, now);
  check("terskel: 90-dagersvindu utløpt uten signal flagges", r2.violations.some((v) => v.code === "window_expired"), r2);

  const r3 = policy.evaluatePortfolio([{ name: "Validert", active: true, startedAt: old, spentNok: 20000, signal: true }], c, now);
  check("terskel: ekte signal fritar både vindu og kostnadstak", r3.violations.length === 0, r3);

  const r4 = policy.evaluatePortfolio([{ name: "Dyr", active: true, startedAt: fresh, spentNok: 15001, signal: false }], c, now);
  check("terskel: forbruk over eksperimenttaket flagges", r4.violations.some((v) => v.code === "over_cap"), r4);

  const r5 = policy.evaluatePortfolio([{ name: "Snart", active: true, startedAt: "2026-04-20", spentNok: 0, signal: false }], c, now);
  check("terskel: <14 dager igjen gir varsel (sev 1)", r5.violations.some((v) => v.code === "window_warning" && v.severity === 1), r5);
}

/* 3: example-modus er ærlig */
{
  delete process.env.CONSTITUTION_FILE;
  delete require.cache[require.resolve("../agents/lib/policy")];
  delete require.cache[require.resolve("../agents/lib/common")];
  const p2 = require("../agents/lib/policy");
  const { c, mode } = p2.load();
  check("uten privat grunnlov: example-modus, aldri stille", mode === "example", mode);
  const r = p2.evaluatePortfolio([{ name: "X", active: true, startedAt: "2026-07-01", spentNok: 99999, signal: false }], c, new Date("2026-07-14"));
  check("example-modus: ukjent kostnadstak gir notat, ikke stillhet", r.notes.some((n) => n.includes("ukjent")), r);
  process.env.CONSTITUTION_FILE = cFile;
}

/* 4: betsFromFactoryData normaliserer eksporten */
{
  const sync = {
    cf_index: ["a", "b", "t"],
    cf_project_a: { name: "Alpha", test: false, status: "validering", createdAt: "2026-07-01", expenses: [{ amount: 500 }, { amount: 250 }], metrics: [] },
    cf_project_b: { name: "Beta", test: false, status: "parkert", createdAt: "2026-01-01" },
    cf_project_t: { name: "Test", test: true, status: "validering", createdAt: "2026-07-01" },
  };
  const bets = policy.betsFromFactoryData(sync);
  check("normalisering: testprosjekter ekskluderes, parkerte er inaktive, utgifter summeres",
    bets.length === 2 && bets.find((b) => b.name === "Alpha").spentNok === 750 && bets.find((b) => b.name === "Beta").active === false, bets);
}

/* 5: nattskiftet arkiverer policy-status og flagger i briefen */
{
  const sync = { cf_index: ["a", "b", "c"],
    cf_project_a: { name: "En", test: false, status: "validering", createdAt: "2026-07-01" },
    cf_project_b: { name: "To", test: false, status: "validering", createdAt: "2026-07-01" },
    cf_project_c: { name: "Tre", test: false, status: "validering", createdAt: "2026-07-01" } };
  fs.writeFileSync(path.join(dataDir, "factory-data.json"), JSON.stringify(sync));
  execFileSync("node", [path.join(__dirname, "..", "agents", "night-shift.js")], {
    env: { ...process.env, MOCK_LLM: "1", ANTHROPIC_API_KEY: "", DATA_DIR: dataDir, CONSTITUTION_FILE: cFile },
  });
  const status = JSON.parse(fs.readFileSync(path.join(dataDir, "policy-status.json"), "utf-8"));
  const brief = JSON.parse(fs.readFileSync(path.join(dataDir, "brief-latest.json"), "utf-8"));
  const section = (brief.sections || []).find((s) => s.title === "Grunnlovsjekk");
  check("nattskiftet skriver policy-status.json med brudd", status.constitution === "real" && status.violations.some((v) => v.code === "max_bets"), status);
  check("morgenbriefen har Grunnlovsjekk-seksjon som flagger bruddet", !!section && section.lines.some((l) => l.includes("maks 2")), section);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures) { console.error("\n" + failures + " FAILURES"); process.exit(1); }
console.log("\nALL POLICY TESTS PASSED");
