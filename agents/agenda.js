/* Agenda-skillen (C1, natt-delen): leser sannhetslagets agenda.json (skrevet
 * av dagskiftet/eieren/assistenten) og produserer påminnelser: forfalt, i dag,
 * i morgen. Purrer til posten er gjort/avvist – aldri stille glemsel.
 * Ingen LLM, ingen nettverk, 0 kr.
 */
"use strict";
const { dataPath, readJSON, writeJSON, today } = require("./lib/common");

/* Datosammenligning på UTC-datostrenger (samme basis som today() i common.js):
 * nattskiftet kjører 04:00 UTC = 06 norsk tid, der UTC- og Oslo-dato er like.
 * Unngår lokal-vs-UTC-avvik rundt midnatt. */
function bucket(due, todayStr) {
  if (!due) return null;
  const tomorrow = new Date(new Date(todayStr).getTime() + 86400000).toISOString().slice(0, 10);
  if (due < todayStr) return "forfalt";
  if (due === todayStr) return "i dag";
  if (due === tomorrow) return "i morgen";
  return null;
}

function run({ logEvent } = {}) {
  const doc = readJSON(dataPath("agenda.json"), null);
  if (!doc || !Array.isArray(doc.items)) return { lines: [], open: 0 };
  const now = new Date();
  const todayStr = today();
  const lines = [];
  let open = 0, changed = false;

  for (const it of doc.items) {
    if (["gjort", "avvist"].includes(it.status)) continue;
    open++;
    const b = bucket(it.due, todayStr);
    if (!b) continue;
    const badge = b === "forfalt" ? "🔴 FORFALT" : b === "i dag" ? "🟠 I DAG" : "🟡 I MORGEN";
    lines.push(`${badge}: ${it.title}${it.due ? ` (frist ${it.due})` : ""}${it.source && it.source.from ? ` – fra ${it.source.from}` : ""}`);
    if (it.status !== "varslet") { it.status = "varslet"; it.notifiedAt = now.toISOString(); changed = true; }
  }
  if (changed) { doc.updatedAt = now.toISOString(); writeJSON(dataPath("agenda.json"), doc); }
  if (logEvent && lines.length) logEvent("agenda:varslet", `${lines.length} frist-påminnelser i briefen`, { count: lines.length });
  return { lines: lines.slice(0, 8), open, date: today() };
}

module.exports = { run };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
