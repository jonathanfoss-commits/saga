/* Selvrevisjonen (E1): systemet foreslår én konkret forbedring pr. natt,
 * utledet DETERMINISTISK av hendelsesloggen (feilende skills, blokkerte steg,
 * gjentatte «ukjent status»-oppslag, agenda-poster som purres > 5 ganger).
 * Forslaget legges i data/improvement-queue.json – kode-endringer går fortsatt
 * KUN via PR som eieren merger. Ingen LLM, 0 kr.
 */
"use strict";
const { dataPath, readJSON, writeJSON, today } = require("./lib/common");
const { readEvents } = require("./lib/events");

function run() {
  const events = readEvents({ since: new Date(Date.now() - 7 * 86400000).toISOString(), limit: 5000 });
  const queue = readJSON(dataPath("improvement-queue.json"), { schema: 1, items: [] });
  const have = new Set(queue.items.map((i) => i.key));
  const candidates = [];

  const errCounts = {};
  for (const e of events) if (e.type === "skill:feil") errCounts[e.skill] = (errCounts[e.skill] || 0) + 1;
  for (const [skill, n] of Object.entries(errCounts)) if (n >= 2) candidates.push({ key: "feil-" + skill, title: `Skillen «${skill}» har feilet ${n} ganger siste uke`, why: "Gjentatt feil er et mønster, ikke uflaks.", how: "Se skill:feil-hendelsene i loggen; reproduser lokalt med MOCK-flaggene." });

  const unknown = events.filter((e) => e.type === "domenevakt:endring" && /ukjent/.test(e.message)).length;
  if (unknown >= 3) candidates.push({ key: "rdap-ustabil", title: "Domenevakten får ofte «ukjent» fra RDAP", why: "Vakten er bare verdt noe hvis oppslagene er pålitelige.", how: "Legg til retry/backoff eller alternativ kilde." });

  const agenda = readJSON(dataPath("agenda.json"), { items: [] });
  const stale = (agenda.items || []).filter((i) => i.status === "varslet" && i.due && i.due < today());
  if (stale.length >= 3) candidates.push({ key: "agenda-purregjeld", title: `${stale.length} forfalte agenda-poster purres uten å bli gjort`, why: "Purring uten handling er støy – kanskje postene er feil, kanskje kanalen er.", how: "Spør eieren i ukesbriefen om postene skal avvises eller varsles annerledes." });

  const fresh = candidates.find((c) => !have.has(c.key));
  if (fresh) {
    queue.items.unshift({ ...fresh, addedAt: new Date().toISOString(), status: "åpen" });
    queue.items = queue.items.slice(0, 50);
    writeJSON(dataPath("improvement-queue.json"), queue);
  }
  return { proposed: fresh ? fresh.title : null, queueSize: queue.items.length };
}

module.exports = { run };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
