/* Hendelsesloggen (A2): én kronologisk logg i sannhetslaget er systemets
 * ryggrad – alt agentene gjør er en hendelse med kilde og tidsstempel.
 * Format: JSON Lines (data/events.jsonl), append-only, roteres årlig.
 * Flater og rapporter er VISNINGER av loggen; appens cf_activity flettes inn
 * av nattskiftet (union på id) til alt skriver hit direkte.
 */
"use strict";
const fs = require("fs");
const { dataPath } = require("./common");

function eventsFile(d = new Date()) { return dataPath("events-" + d.toISOString().slice(0, 4) + ".jsonl"); }

function logEvent(type, message, meta = {}) {
  const e = { at: new Date().toISOString(), type, message, ...meta };
  fs.mkdirSync(require("path").dirname(eventsFile()), { recursive: true });
  fs.appendFileSync(eventsFile(), JSON.stringify(e) + "\n");
  return e;
}

function readEvents({ since = null, limit = 500 } = {}) {
  const f = eventsFile();
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, "utf-8").trim().split("\n").filter(Boolean);
  let evts = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  if (since) evts = evts.filter((e) => e.at >= since);
  return evts.slice(-limit);
}

/* Flett appens aktivitetsspor (fra synk-eksporten) inn i loggen – idempotent */
function mergeAppActivity(sync) {
  if (!sync || !Array.isArray(sync.cf_activity)) return 0;
  const seen = new Set(readEvents({ limit: 100000 }).map((e) => e.id).filter(Boolean));
  let n = 0;
  for (const a of sync.cf_activity) {
    if (!a.id || seen.has(a.id)) continue;
    fs.appendFileSync(eventsFile(new Date(a.at || Date.now())), JSON.stringify({ at: a.at, type: "app:" + (a.type || "aktivitet"), message: a.message, id: a.id, projectId: a.projectId }) + "\n");
    n++;
  }
  return n;
}

module.exports = { logEvent, readEvents, mergeAppActivity, eventsFile };
