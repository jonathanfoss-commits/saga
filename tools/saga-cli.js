#!/usr/bin/env node
/* SAGA CLI – `saga improve`
 *
 * Autonom forbedringsloop med GUARDRAILS (skal IKKE fjernes – se nederst):
 *  1. Leser docs/improvements.md, prioriterer (effekt ↓, innsats ↑)
 *  2. Arbeider KUN på branchen saga/auto-improve
 *  3. Implementering: delegeres til `claude` CLI hvis tilgjengelig; ellers
 *     skrives en prioritert, klar-til-kjøring plan til docs/changelog-auto.md
 *  4. Kjører hele testsuiten – ved rød suite forkastes endringene (reset)
 *  5. Hver autonom endring logges med begrunnelse i docs/changelog-auto.md
 *  6. Merges ALDRI automatisk til main – mennesket (eller PR-flyt) gjør det
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const DOCS = path.join(ROOT, "saga", "docs");
const BRANCH = "saga/auto-improve";

/* GUARDRAILS – autonome endringer rører ALDRI disse (mønstre mot git-diff) */
const FORBIDDEN = [
  /secret|token|api[_-]?key|\.env/i,          // hemmeligheter/nøkler
  /stripe-webhook|payment|betaling/i,          // betalingslogikk
  /Publish\.landing|publiser/i,                // utsendings-/publiseringslogikk
  /\.github\/workflows/,                       // CI/eksterne webhooks
];

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const log = (m) => console.log("saga improve │ " + m);

function parseImprovements() {
  const md = fs.readFileSync(path.join(DOCS, "improvements.md"), "utf-8");
  const rank = { høy: 3, middels: 2, lav: 1, ukjent: 1 };
  const items = [];
  const re = /^## \[effekt: (høy|middels|lav)\] \[innsats: (lav|middels|høy|ukjent)\] (.+)$/gm;
  let m;
  while ((m = re.exec(md))) {
    const tail = md.slice(m.index).split(/\n## /)[0];
    if (/Status: utført/.test(tail)) continue;
    items.push({ effekt: m[1], innsats: m[2], title: m[3].trim(), score: rank[m[1]] * 10 - rank[m[2]] });
  }
  return items.sort((a, b) => b.score - a.score);
}

function appendChangelog(lines) {
  const file = path.join(DOCS, "changelog-auto.md");
  const head = fs.existsSync(file) ? "" : "# SAGA – autonom endringslogg\n\nHver kjøring av `saga improve` logger hva som ble gjort og hvorfor.\n";
  fs.appendFileSync(file, head + `\n## ${new Date().toISOString()}\n` + lines.map((l) => "- " + l).join("\n") + "\n");
}

function runTests() {
  log("kjører testsuitene …");
  const r = spawnSync("bash", ["-c", "(curl -s -o /dev/null http://localhost:8130/ || (python3 -m http.server 8130 >/dev/null 2>&1 & sleep 1)); node tests/factory.e2e.js && node tests/aeis.e2e.js && node tests/e2e.js && node tests/saga.e2e.js"], { cwd: ROOT, encoding: "utf-8" });
  return r.status === 0;
}

function guardrailViolation() {
  const diff = sh("git diff --name-only") + "\n" + sh("git diff");
  return FORBIDDEN.find((re) => re.test(diff)) || null;
}

function improve() {
  const items = parseImprovements();
  if (!items.length) { log("ingen åpne forbedringer – loggen er tom. 🟢"); return; }
  log(`prioritert kø (${items.length}):`);
  items.forEach((x, i) => log(`  ${i + 1}. [${x.effekt}/${x.innsats}] ${x.title}`));
  const top = items[0];

  const current = sh("git rev-parse --abbrev-ref HEAD");
  sh(`git checkout -B ${BRANCH}`);
  log(`arbeider på ${BRANCH} (fra ${current})`);

  const hasClaude = spawnSync("bash", ["-c", "command -v claude"], { encoding: "utf-8" }).status === 0;
  if (!hasClaude) {
    appendChangelog([
      `Plan generert (implementering krever \`claude\` CLI – ikke funnet i miljøet):`,
      ...items.map((x, i) => `${i + 1}. [${x.effekt}/${x.innsats}] ${x.title}`),
      `Kjør på nytt i et miljø med Claude Code for autonom implementering av #1.`,
    ]);
    sh(`git add docs/changelog-auto.md && git commit -m "chore(saga): improve-plan (uten implementering – claude CLI mangler)"`);
    log("plan committet til changelog-auto.md. Bytt tilbake: git checkout " + current);
    return;
  }

  log(`implementerer #1 via Claude Code: ${top.title}`);
  const prompt = `Implementer denne forbedringen i SAGA-repoet, minimal og testet: "${top.title}". ` +
    `Se docs/improvements.md for kontekst. GUARDRAILS: rør aldri hemmeligheter/nøkler, ` +
    `betalings- eller publiseringslogikk, eller .github/workflows. Kjør testsuitene. ` +
    `Marker innslaget som "Status: utført (dato)" i improvements.md.`;
  const r = spawnSync("claude", ["-p", prompt, "--permission-mode", "acceptEdits"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) { log("Claude Code feilet – ruller tilbake."); sh("git checkout -- . && git clean -fd saga"); return; }

  const violation = guardrailViolation();
  if (violation) {
    log(`GUARDRAIL BRUTT (${violation}) – forkaster endringene.`);
    sh("git checkout -- . && git clean -fd saga");
    appendChangelog([`AVVIST: «${top.title}» rørte forbudt område (${violation}). Endringer forkastet.`]);
    return;
  }
  if (!runTests()) {
    log("rød testsuite – forkaster endringene.");
    sh("git checkout -- . && git clean -fd saga");
    appendChangelog([`AVVIST: «${top.title}» ga rød testsuite. Endringer forkastet.`]);
    return;
  }
  appendChangelog([`UTFØRT: «${top.title}» – implementert autonomt, alle suiter grønne. Begrunnelse: høyest prioritet (${top.effekt}/${top.innsats}).`]);
  sh(`git add -A && git commit -m "feat(saga): auto-improve – ${top.title.replace(/"/g, "'")}"`);
  log(`ferdig. Endringen ligger på ${BRANCH} – merges kun av menneske/PR når suitene er grønne.`);
}

const cmd = process.argv[2];
if (cmd === "improve") improve();
else { console.log("Bruk: saga improve   (se docs/automation.md)"); process.exit(cmd ? 1 : 0); }
