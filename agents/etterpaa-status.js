/* Statusinnleser for porteføljeselskaper: oppdaterer data/companies.json i
 * sannhetslaget med FAKTISKE tall der kilden er tilgjengelig, og sier ærlig
 * fra der den ikke er. Prinsipp: et tall uten kilde degraderes til ESTIMAT –
 * det oppgraderes aldri stille.
 *
 * Kilder pr. natt (alle valgfrie – mangler de, står feltene med forrige verdi
 * og et ferskhetsstempel):
 * - Vercel REST API (VERCEL_TOKEN + VERCEL_TEAM): siste produksjonsdeploy.
 * - MOCK_VERCEL_STATE=READY|ERROR gir deterministisk svar uten nettverk (tester).
 *
 *   node agents/etterpaa-status.js
 */
"use strict";
const { dataPath, readJSON, writeJSON } = require("./lib/common");

async function latestDeploy(projectName) {
  if (process.env.MOCK_VERCEL_STATE) {
    return { state: process.env.MOCK_VERCEL_STATE, at: new Date().toISOString().slice(0, 10), source: "mock (test)" };
  }
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;
  const team = process.env.VERCEL_TEAM ? `&teamId=${encodeURIComponent(process.env.VERCEL_TEAM)}` : "";
  const res = await fetch(`https://api.vercel.com/v6/deployments?app=${encodeURIComponent(projectName)}&target=production&limit=1${team}`, {
    headers: { authorization: "Bearer " + token },
  });
  if (!res.ok) return null;
  const j = await res.json();
  const d = (j.deployments || [])[0];
  if (!d) return null;
  return { state: d.state, at: new Date(d.created).toISOString().slice(0, 10), source: "Vercel API (nattskiftet)" };
}

async function run() {
  const doc = readJSON(dataPath("companies.json"), null);
  if (!doc || !Array.isArray(doc.companies)) return { companies: 0, note: "ingen companies.json i sannhetslaget" };

  const now = new Date().toISOString();
  for (const c of doc.companies) {
    c.status = c.status || {};
    c.status.checkedAt = now;
    const deploy = await latestDeploy(c.id).catch(() => null);
    if (deploy) {
      c.status.lastDeploy = { state: deploy.state, at: deploy.at, label: "FAKTISK", source: deploy.source + ", " + now.slice(0, 10) };
    } else if (c.status.lastDeploy && c.status.lastDeploy.label === "FAKTISK") {
      /* Kilden var utilgjengelig i natt: verdien består, men ferskheten er ærlig */
      c.status.lastDeploy.label = "ESTIMAT";
      c.status.lastDeploy.source = (c.status.lastDeploy.source || "") + " – IKKE verifisert i natt (VERCEL_TOKEN mangler)";
    }
  }
  doc.updatedAt = now;
  writeJSON(dataPath("companies.json"), doc);
  return { companies: doc.companies.length };
}

module.exports = { run };
if (require.main === module) run().then((r) => console.log("selskapsstatus ok:", r.companies, "selskaper")).catch((e) => { console.error(e.message); process.exit(1); });
