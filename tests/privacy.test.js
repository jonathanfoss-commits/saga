/*
 * Personvernvakten: dette repoet er OFFENTLIG. Forretningsdata hører hjemme i
 * det private datarepoet (sannhetslaget, se docs/privacy-audit.md) og skal
 * ALDRI committes her. Denne testen feiler hvis kjente forretningsdata-filer
 * finnes i arbeidstreet ELLER er sporet av git – samme mønster som
 * separasjonsvakten (tests/separation.test.js), og kjøres i CI på hver push.
 *
 * Run:  node tests/privacy.test.js
 */
"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* Mønstre for forretningsdata (glob mot git-sporede stier) */
const FORBIDDEN = [
  "factory-data*.json",       // appens synk-eksport (+ konflikt-backuper)
  "data/**",                  // nattskiftets output: briefs, board, radar, kostnader
  "data/*",
  "**/agent-costs.json",
  "**/brief-latest.json",
];

let failures = [];

/* 1: git-sporede filer (det som faktisk publiseres) */
let tracked = [];
try {
  tracked = execSync("git ls-files -- " + FORBIDDEN.map((p) => `':(glob)${p}'`).join(" "), { cwd: ROOT, encoding: "utf-8" })
    .trim().split("\n").filter(Boolean);
} catch { /* utenfor git: dekkes av filsystemsjekken under */ }
if (tracked.length) failures.push("git sporer forretningsdata:\n" + tracked.map((f) => "     " + f).join("\n"));

/* 2: arbeidstreet (fanger nye filer før de committes) */
const fsHits = [];
if (fs.existsSync(path.join(ROOT, "data"))) fsHits.push("data/ (skal ikke finnes – sannhetslaget er det private datarepoet)");
for (const f of fs.readdirSync(ROOT)) if (/^factory-data.*\.json$/.test(f)) fsHits.push(f);
if (fsHits.length) failures.push("arbeidstreet inneholder forretningsdata:\n" + fsHits.map((f) => "     " + f).join("\n"));

if (failures.length) {
  console.error("  ❌ personvernvakt:\n     " + failures.join("\n     "));
  console.error("\n1 FAILURES");
  process.exit(1);
}
console.log("  ✅ personvernvakt: ingen forretningsdata i det offentlige repoet\n\nALL PRIVACY TESTS PASSED");
