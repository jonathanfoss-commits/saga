/*
 * Separasjonsvakten: SAGA er et personlig sideprosjekt og skal være permanent
 * atskilt fra opphavskonteksten. Denne testen feiler hvis strengen «eik»
 * (uansett store/små bokstaver) finnes noe sted i repoet utenom SEPARATION.md
 * – som er det ENESTE stedet proveniensen får omtales.
 *
 * Vakten er bevisst streng (ren delstreng-match). Skal et legitimt ord som
 * inneholder «eik» inn i kodebasen, må det være en villet beslutning:
 * dokumentér unntaket i decisions.md og legg filen til ALLOW under.
 *
 * Run:  node tests/separation.test.js
 */
const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ALLOW = ["SEPARATION.md", "tests/separation.test.js"];

let out = "";
try {
  /* -I hopper over binærfiler (ikoner o.l.). Exit 1 = ingen treff = rent. */
  out = execSync(
    `grep -rIli "eik" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=data`,
    { cwd: ROOT, encoding: "utf-8" }
  );
} catch (e) {
  if (e.status === 1) { console.log("  ✅ separasjonsvakt: ingen treff\n\nALL SEPARATION TESTS PASSED"); process.exit(0); }
  throw e;
}

const hits = out.trim().split("\n").map((f) => f.replace(/^\.\//, "")).filter((f) => !ALLOW.includes(f));
if (hits.length === 0) {
  console.log("  ✅ separasjonsvakt: kun tillatte filer\n\nALL SEPARATION TESTS PASSED");
  process.exit(0);
}
console.error("  ❌ separasjonsvakt: forbudte referanser i:\n" + hits.map((h) => "     " + h).join("\n"));
console.error("\n1 FAILURES");
process.exit(1);
