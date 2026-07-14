/* Skills-kontrakten (A4): hvert agent-steg er en liten, selvstendig «skill»
 * med felles kontrakt – nye integrasjoner er en ny skill-fil, ikke ny
 * arkitektur. Mandatkategorien håndheves HER (fail-closed via grunnloven),
 * ikke i den enkelte skill.
 *
 * Kontrakt: { name, mandate, costProfile: "none"|"api"|"llm", run(ctx) }
 * ctx = { policy, constitution, logEvent } – skills skriver kun under DATA.
 */
"use strict";
const policy = require("./policy");
const { logEvent } = require("./events");

async function runPipeline(skills) {
  const { c, mode } = policy.load();
  const results = {};
  for (const s of skills) {
    if (policy.requiresOwner(s.mandate, c)) {
      /* Fail-closed: en skill med eier-gate-kategori kjøres ALDRI av seg selv */
      logEvent("skill:blokkert", `«${s.name}» krever eieren (mandat: ${s.mandate}) – hoppet over`, { skill: s.name });
      results[s.name] = { skipped: "ownerGate" };
      continue;
    }
    try {
      results[s.name] = await s.run({ constitution: c, constitutionMode: mode, logEvent });
      logEvent("skill:ok", `«${s.name}» fullført`, { skill: s.name });
    } catch (e) {
      if (["KILL", "BUDGET", "UNCONFIGURED"].includes(e.code)) throw e; /* vaktene stopper alt */
      results[s.name] = { error: e.message };
      logEvent("skill:feil", `«${s.name}» feilet: ${e.message}`, { skill: s.name });
    }
  }
  return results;
}

module.exports = { runPipeline };
