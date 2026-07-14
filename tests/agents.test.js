/*
 * Nattskift-tester (Node, uten nettverk): mock-kjøring gir gyldig brief-JSON,
 * budsjettvakten stopper live-kjøring over tak, kill-switch stopper alt,
 * og uten nøkkel skrives ærlig «unconfigured»-brief.
 *
 * Run:  node tests/agents.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (cond ? "" : "  → " + JSON.stringify(detail)));
  if (!cond) failures++;
}
function runShift(env, dataDir) {
  return execFileSync("node", ["agents/night-shift.js"], {
    cwd: ROOT, encoding: "utf-8",
    env: { ...process.env, ANTHROPIC_API_KEY: "", MOCK_LLM: "", ...env, DATA_DIR: dataDir },
  });
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "saga-agents-"));

/* 1: mock-kjøring → gyldig brief med alle felt UI-et leser */
{
  const d = tmp();
  runShift({ MOCK_LLM: "1" }, d);
  const brief = JSON.parse(fs.readFileSync(path.join(d, "brief-latest.json"), "utf-8"));
  const ok = brief.schema === 1 && brief.mode === "mock" && brief.headline && Array.isArray(brief.sections)
    && brief.sections.length >= 2 && brief.costs && typeof brief.costs.capNok === "number" && Array.isArray(brief.actions);
  check("mock-kjøring gir gyldig, ærlig merket brief (mode=mock)", ok, brief);
  check("styreprotokoll og radar arkiveres datert", fs.existsSync(path.join(d, "board")) && fs.existsSync(path.join(d, "radar")), fs.readdirSync(d));
}

/* 2: uten nøkkel → unconfigured-brief, ingen kall */
{
  const d = tmp();
  runShift({}, d);
  const brief = JSON.parse(fs.readFileSync(path.join(d, "brief-latest.json"), "utf-8"));
  check("uten ANTHROPIC_API_KEY: mode=unconfigured med instruks", brief.mode === "unconfigured" && JSON.stringify(brief.actions).includes("ANTHROPIC_API_KEY"), brief.mode);
}

/* 3: budsjettak nådd → villet stopp, ingen kall */
{
  const d = tmp();
  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "budget.json"), "utf-8")).monthlyCapNok;
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "agent-costs.json"), JSON.stringify({ schema: 1, entries: [{ at: new Date().toISOString(), agent: "test", model: "claude-sonnet-5", in: 0, out: 0, nok: cap + 1 }] }));
  runShift({ ANTHROPIC_API_KEY: "sk-skal-ikke-brukes" }, d);
  const brief = JSON.parse(fs.readFileSync(path.join(d, "brief-latest.json"), "utf-8"));
  check("over månedstak: mode=stopped med årsak (harde tak, ikke råd)", brief.mode === "stopped" && brief.sections[0].lines[0].includes("Månedstaket"), brief);
}

/* 4: kill-switch stopper alt – også mock */
{
  const d = tmp();
  const ks = path.join(ROOT, "config", "KILL_SWITCH");
  fs.writeFileSync(ks, "test");
  try {
    runShift({ MOCK_LLM: "1" }, d);
    const brief = JSON.parse(fs.readFileSync(path.join(d, "brief-latest.json"), "utf-8"));
    check("KILL_SWITCH: alle agenter står, briefen sier hvorfor", brief.mode === "stopped" && brief.sections[0].lines[0].includes("KILL_SWITCH"), brief);
  } finally { fs.unlinkSync(ks); }
}

console.log(failures === 0 ? "\nALL AGENT TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
