/* Domenevakten (D1): overvåker navnene i sannhetslagets watchlist.json mot
 * gratis RDAP-registre (Norid for .no, Verisign for .com). Flagger ENDRING:
 * et ledig domene som blir tatt, eller et overvåket domene som blir ledig.
 * Ingen LLM; kun gratis oppslag. MOCK_RDAP=ledig|tatt gir deterministisk svar.
 */
"use strict";
const { dataPath, readJSON, writeJSON } = require("./lib/common");

async function rdapStatus(domain) {
  if (process.env.MOCK_RDAP) return process.env.MOCK_RDAP; /* tester */
  const tld = domain.split(".").pop();
  const url = tld === "no"
    ? `https://rdap.norid.no/domain/${domain}`
    : `https://rdap.verisign.com/${tld}/v1/domain/${domain}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/rdap+json" } });
    if (res.status === 404) return "ledig";
    if (res.ok) return "tatt";
    return "ukjent";
  } catch { return "ukjent"; }
}

async function run({ logEvent } = {}) {
  const doc = readJSON(dataPath("watchlist.json"), null);
  if (!doc || !Array.isArray(doc.domains) || !doc.domains.length) return { lines: [], checked: 0 };
  const lines = [];
  const now = new Date().toISOString();
  for (const d of doc.domains) {
    const status = await rdapStatus(d.name);
    if (status === "ukjent") { lines.push(`⚪ ${d.name}: oppslag feilet i natt (status ukjent)`); continue; }
    if (d.lastStatus && d.lastStatus !== status) {
      const alarm = status === "tatt"
        ? `🔴 ${d.name} er TATT (var ledig ${d.lastCheckedAt ? d.lastCheckedAt.slice(0, 10) : "tidligere"}) – ${d.why || "sjekk sakskartet"}`
        : `🟢 ${d.name} er blitt LEDIG – ${d.why || "vurder å sikre det"}`;
      lines.push(alarm);
      if (logEvent) logEvent("domenevakt:endring", alarm, { domain: d.name, from: d.lastStatus, to: status });
    }
    d.lastStatus = status;
    d.lastCheckedAt = now;
  }
  doc.updatedAt = now;
  writeJSON(dataPath("watchlist.json"), doc);
  return { lines: lines.slice(0, 5), checked: doc.domains.length };
}

module.exports = { run };
if (require.main === module) run().then((r) => console.log(JSON.stringify(r, null, 2)));
