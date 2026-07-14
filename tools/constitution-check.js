/* Divergensvakt: flagger når eierprofilen (markdown) har endret seg siden
 * grunnloven (constitution.json) ble generert – da må grunnloven regenereres
 * og endringen behandles som DIN TUR-punkt.
 *
 * Run:  node tools/constitution-check.js <sti-til-EIERPROFIL.md> [sti-til-constitution.json]
 * Exit: 0 = i synk, 1 = divergens/feil (egnet for lokale hooks).
 */
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const policy = require("../agents/lib/policy");

const profilePath = process.argv[2];
const constitutionPath = process.argv[3] || policy.constitutionPath();
if (!profilePath) { console.error("Bruk: node tools/constitution-check.js <EIERPROFIL.md> [constitution.json]"); process.exit(1); }

let profile, constitution;
try { profile = fs.readFileSync(profilePath, "utf-8"); } catch { console.error("❌ Finner ikke eierprofilen: " + profilePath); process.exit(1); }
try { constitution = JSON.parse(fs.readFileSync(constitutionPath, "utf-8")); } catch { console.error("❌ Finner ikke grunnloven: " + constitutionPath + " (den ekte ligger i det private datarepoet)"); process.exit(1); }

const actual = crypto.createHash("sha256").update(profile).digest("hex");
const recorded = constitution.source && constitution.source.sha256;
if (!recorded) { console.error("❌ Grunnloven mangler source.sha256 – er dette eksempelfila? Ekte håndheving krever generert grunnlov."); process.exit(1); }
if (actual !== recorded) {
  console.error("🔴 DIN TUR: Eierprofilen er endret ETTER at grunnloven ble generert.");
  console.error("   Profil nå:     " + actual);
  console.error("   Grunnlov fra:  " + recorded + " (" + (constitution.source.updatedAt || "ukjent dato") + ")");
  console.error("   → Regenerér constitution.json fra profilen og push til datarepoet.");
  process.exit(1);
}
console.log("✅ Grunnloven er i synk med eierprofilen (" + recorded.slice(0, 12) + "…).");
