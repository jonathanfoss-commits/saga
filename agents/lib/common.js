/* Nattskiftets fellesbibliotek: budsjettvakt, kill-switch, LLM-klient (Node),
 * kostnadsbokføring og filhjelpere. Kjøres i GitHub Actions eller lokalt.
 *
 * SIKKERHETSKONTRAKT (skal ikke svekkes):
 * - API-nøkkel leses KUN fra miljøet (ANTHROPIC_API_KEY) – aldri fra filer.
 * - Agentene skriver KUN under DATA-katalogen (versjonert JSON). Aldri kode, aldri config.
 * - DATA ligger i det PRIVATE datarepoet (DATA_DIR i CI) – aldri i det offentlige
 *   kode-repoet. Forretningsdata i offentlig repo er en privacy-brudd (se
 *   docs/privacy-audit.md); tests/privacy.test.js håndhever dette.
 * - Kill-switch (config/KILL_SWITCH finnes) og månedstak stopper alt.
 * - MOCK_LLM=1 gir deterministiske svar uten nettverk (tester/demo).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
/* Sannhetslaget: appens synk-fil ligger i ROTA av det private datarepoet
 * (Sync.DATA_PATH i core/factory.js), mens agentene skriver under data/.
 * I CI: DATA_DIR=<saga-data>/data og SYNC_FILE=<saga-data>/factory-data.json.
 * Lokalt/tester: fallback til DATA/factory-data.json som før. */
const SYNC_FILE = process.env.SYNC_FILE || path.join(DATA, "factory-data.json");

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return fallback; }
}
function writeJSON(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
const dataPath = (...seg) => path.join(DATA, ...seg);

function budget() { return readJSON(path.join(ROOT, "config", "budget.json"), { monthlyCapNok: 0, perRunCapTokens: 0, model: "claude-sonnet-5", usdToNok: 11, pricesUsdPerMTok: {} }); }

/* ---------- kostnadsbokføring (data/agent-costs.json) ---------- */
function costs() { return readJSON(dataPath("agent-costs.json"), { schema: 1, entries: [] }); }
function monthSpentNok(now = new Date()) {
  const pfx = now.toISOString().slice(0, 7);
  return costs().entries.filter((e) => e.at.startsWith(pfx)).reduce((s, e) => s + e.nok, 0);
}
function recordCost(agent, model, usage) {
  const b = budget();
  const [pin, pout] = b.pricesUsdPerMTok[model] || [3, 15];
  const usd = ((usage.input_tokens || 0) * pin + (usage.output_tokens || 0) * pout) / 1e6;
  const nok = Math.round(usd * b.usdToNok * 100) / 100;
  const c = costs();
  c.entries.unshift({ at: new Date().toISOString(), agent, model, in: usage.input_tokens || 0, out: usage.output_tokens || 0, nok });
  c.entries = c.entries.slice(0, 1000);
  writeJSON(dataPath("agent-costs.json"), c);
  return nok;
}

/* ---------- vakt ---------- */
const MOCK = process.env.MOCK_LLM === "1";
function guard() {
  if (fs.existsSync(path.join(ROOT, "config", "KILL_SWITCH"))) {
    const e = new Error("KILL_SWITCH er aktiv – alle agenter står til filen fjernes.");
    e.code = "KILL"; throw e;
  }
  const b = budget(), spent = monthSpentNok();
  if (!MOCK && spent >= b.monthlyCapNok) {
    const e = new Error(`Månedstaket er nådd (${spent.toFixed(0)} av ${b.monthlyCapNok} kr) – ingen AI-kall før neste måned eller høyere tak.`);
    e.code = "BUDGET"; throw e;
  }
  if (!MOCK && !process.env.ANTHROPIC_API_KEY) {
    const e = new Error("ANTHROPIC_API_KEY mangler i miljøet – nattskiftet er ikke konfigurert.");
    e.code = "UNCONFIGURED"; throw e;
  }
}

/* ---------- LLM ---------- */
let runTokens = 0;
async function llm({ agent, system, user, maxTokens = 2500, mockText }) {
  if (MOCK) return { text: mockText ?? "(mock-svar)", usage: { input_tokens: 500, output_tokens: 300 }, mock: true };
  const b = budget();
  if (runTokens >= b.perRunCapTokens) throw new Error(`Kjøringens tokentak (${b.perRunCapTokens}) er nådd.`);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: b.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error("API-feil " + res.status + ": " + (await res.text()).slice(0, 300));
  const j = await res.json();
  const usage = j.usage || {};
  runTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
  recordCost(agent, b.model, usage);
  const text = (j.content || []).filter((x) => x.type === "text").map((x) => x.text).join("");
  return { text, usage, mock: false };
}

const today = () => new Date().toISOString().slice(0, 10);

function syncData() { return readJSON(SYNC_FILE, null); }

module.exports = { ROOT, DATA, SYNC_FILE, dataPath, syncData, readJSON, writeJSON, budget, costs, monthSpentNok, recordCost, guard, llm, today, MOCK };
