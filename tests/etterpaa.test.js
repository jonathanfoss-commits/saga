/* Selskapsregister-tester: statusinnleseren (mot mock-Vercel), ærlig
 * FAKTISK→ESTIMAT-degradering når kilden er borte, styrets selskapslinjer med
 * 90-dagersklokke, og at selskapets klokke håndheves av grunnloven i briefen.
 *
 * Run:  node tests/etterpaa.test.js
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

function freshDir(companies) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saga-etterpaa-"));
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "companies.json"), JSON.stringify({ schema: 1, companies }));
  return { tmp, dataDir };
}
const baseEnv = { ...process.env, MOCK_LLM: "1", ANTHROPIC_API_KEY: "", VERCEL_TOKEN: "", MOCK_VERCEL_STATE: "", CONSTITUTION_FILE: "" };
const agent = (script, dataDir, env) => execFileSync("node", [path.join(__dirname, "..", "agents", script)], { env: { ...baseEnv, DATA_DIR: dataDir, ...env } });

const futureDeadline = new Date(Date.now() + 80 * 86400000).toISOString().slice(0, 10);
const company = (over) => ({
  id: "etterpaa", name: "Etterpå", domain: "dødsbo-tjeneste",
  clock: { startedAt: "2026-07-14", windowDays: 90, deadline: futureDeadline, signalDefinition: "Betalende kunde eller dokumentert betalingsvilje. Ellers avvikling." },
  revenue: { mrrNok: 0, customers: 0, label: "FAKTISK", source: "test" },
  status: { lastDeploy: { state: "READY", at: "2026-07-14", label: "FAKTISK", source: "test" } },
  cases: [{ id: "navnebytte", title: "STYRESAK: navnebytte", status: "til_behandling", recommendation: "Avgjør før domenekjøp." }],
  ...over,
});

/* 1: statusinnleseren mot mock-Vercel oppdaterer med FAKTISK */
{
  const { dataDir } = freshDir([company()]);
  agent("etterpaa-status.js", dataDir, { MOCK_VERCEL_STATE: "ERROR" });
  const doc = JSON.parse(fs.readFileSync(path.join(dataDir, "companies.json"), "utf-8"));
  const d = doc.companies[0].status.lastDeploy;
  check("statusinnleser (mock): siste deploy oppdateres med FAKTISK kilde", d.state === "ERROR" && d.label === "FAKTISK", d);
}

/* 2: uten kilde degraderes FAKTISK til ESTIMAT – aldri stille ferskhet */
{
  const { dataDir } = freshDir([company()]);
  agent("etterpaa-status.js", dataDir, {});
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, "companies.json"), "utf-8")).companies[0].status.lastDeploy;
  check("uten VERCEL_TOKEN: FAKTISK degraderes til ESTIMAT med ærlig kildenotat", d.label === "ESTIMAT" && d.source.includes("IKKE verifisert"), d);
}

/* 3: styremøtet ser selskapet, klokken og den åpne styresaken */
{
  const { dataDir } = freshDir([company()]);
  agent("board-meeting.js", dataDir, {});
  const board = JSON.parse(fs.readFileSync(path.join(dataDir, "board", new Date().toISOString().slice(0, 10) + ".json"), "utf-8"));
  check("styremøtet uten fabrikkdata, med selskap: companies=1 og kilde oppgitt", board.companies === 1 && board.source.includes("companies.json"), board);
}

/* 4: utløpt selskapklokke uten signal → grunnlovsbrudd i morgenbriefen */
{
  const { dataDir, tmp } = freshDir([company({ clock: { startedAt: "2026-01-01", windowDays: 90, deadline: "2026-04-01", signalDefinition: "Betalende kunde." } })]);
  fs.writeFileSync(path.join(tmp, "constitution.json"), JSON.stringify({
    schema: 1, source: { sha256: "fixture" },
    northStar: { text: "Første 1 000 kr/mnd." },
    thresholds: { validationWindowDays: { value: 90, ref: "fixture" }, maxActiveBets: { value: 2, ref: "fixture" }, perExperimentCapNok: { value: 15000, ref: "fixture" } },
    mandate: { free: [], ownerGate: [] },
  }));
  agent("night-shift.js", dataDir, {});
  const status = JSON.parse(fs.readFileSync(path.join(dataDir, "policy-status.json"), "utf-8"));
  const brief = JSON.parse(fs.readFileSync(path.join(dataDir, "brief-latest.json"), "utf-8"));
  const section = (brief.sections || []).find((s) => s.title === "Grunnlovsjekk");
  check("selskapets 90-dagersklokke håndheves: window_expired i policy-status", status.violations.some((v) => v.code === "window_expired" && v.bet === "Etterpå"), status.violations);
  check("bruddet står i morgenbriefen med selskapets navn", !!section && section.lines.some((l) => l.includes("Etterpå")), section);
  check("headline teller selskapet som veddemål", brief.headline.includes("1 selskap"), brief.headline);
}

if (failures) { console.error("\n" + failures + " FAILURES"); process.exit(1); }
console.log("\nALL ETTERPAA TESTS PASSED");
