/* Grunnlovens policy-motor: håndhever eierprofilens terskler og mandatmatrise
 * maskinelt. Kjøres av nattskiftet (styremøtet) og av tester med fixtures.
 *
 * KONTRAKT:
 * - Den EKTE grunnloven er privat (saga-data/constitution.json). Uten den kjører
 *   motoren på config/constitution.example.json og merker ALT som example-modus
 *   – aldri en stille antakelse om at policy er håndhevet når den ikke er det.
 * - Ukjente mandat-kategorier er eier-gate (fail-closed).
 * - Terskler med null flagges som «terskel ukjent», de hoppes ikke stille over.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { ROOT, DATA, readJSON } = require("./common");

/* Grunnloven ligger som søsken til data/ i det private repoet:
 * _data/constitution.json når DATA_DIR=_data/data. Override: CONSTITUTION_FILE. */
function constitutionPath() {
  return process.env.CONSTITUTION_FILE || path.join(DATA, "..", "constitution.json");
}

function load() {
  const p = constitutionPath();
  if (fs.existsSync(p)) {
    const c = readJSON(p, null);
    if (c && c.schema === 1) return { c, mode: c.source && c.source.sha256 ? "real" : "example", file: p };
  }
  const ex = readJSON(path.join(ROOT, "config", "constitution.example.json"), null);
  if (ex) return { c: ex, mode: "example", file: "config/constitution.example.json" };
  return { c: null, mode: "missing", file: null };
}

/* Mandatmatrisen: krever handlingen eieren? Ukjent kategori → ja. */
function requiresOwner(category, c) {
  if (!c || !c.mandate) return true;
  if ((c.mandate.ownerGate || []).includes(category)) return true;
  if ((c.mandate.free || []).includes(category)) return false;
  return true;
}

/* Normaliser fabrikkens synk-eksport til veddemål motoren forstår. */
function betsFromFactoryData(sync) {
  if (!sync) return [];
  return Object.keys(sync)
    .filter((k) => k.startsWith("cf_project_"))
    .map((k) => sync[k])
    .filter((p) => p && !p.test)
    .map((p) => {
      const metrics = Array.isArray(p.metrics) && p.metrics.length ? p.metrics[p.metrics.length - 1] : null;
      return {
        name: p.name,
        active: !["parkert", "avsluttet", "drept"].includes(p.status),
        startedAt: p.createdAt,
        spentNok: (p.expenses || []).reduce((s, e) => s + (e.amount || 0), 0),
        signal: !!(metrics && ((metrics.customers || 0) > 0 || (metrics.mrr || 0) > 0)),
      };
    });
}

/* Porteføljeselskaper (data/companies.json) er også veddemål under grunnloven:
 * klokken deres ER 90-dagersvinduet. spentNok kobles til P&L når den finnes. */
function betsFromCompanies(doc) {
  if (!doc || !Array.isArray(doc.companies)) return [];
  return doc.companies.map((c) => ({
    name: c.name,
    active: !c.killedAt,
    startedAt: (c.clock && c.clock.startedAt) || c.registeredAt,
    spentNok: (c.pnl && c.pnl.totalCostNok) || 0,
    signal: !!(c.revenue && ((c.revenue.mrrNok || 0) > 0 || (c.revenue.customers || 0) > 0)),
  }));
}

const val = (t) => (t && typeof t.value === "number" ? t.value : null);

/* Porteføljesjekk mot tersklene. Returnerer brudd (harde) og notater (ærlige hull). */
function evaluatePortfolio(bets, c, now = new Date()) {
  const violations = [], notes = [];
  if (!c || !c.thresholds) return { violations, notes: ["Grunnlov mangler – ingen håndheving mulig."] };
  const t = c.thresholds;

  const active = bets.filter((b) => b.active);
  const maxBets = val(t.maxActiveBets);
  if (maxBets !== null && active.length > maxBets) {
    violations.push({ code: "max_bets", severity: 0, text: `${active.length} aktive satsinger – grunnloven tillater maks ${maxBets} (${t.maxActiveBets.ref}). Styret må anbefale hva som parkeres/drepes.` });
  }

  const windowDays = val(t.validationWindowDays);
  for (const b of active) {
    if (windowDays !== null && b.startedAt) {
      const days = Math.floor((now - new Date(b.startedAt)) / 86400000);
      const left = windowDays - days;
      if (!b.signal && left <= 0) {
        violations.push({ code: "window_expired", severity: 0, bet: b.name, text: `«${b.name}»: ${days} dager uten ekte signal – 90-dagersvinduet er UTE (${t.validationWindowDays.ref}). Innstill avvikling eller pivot.` });
      } else if (!b.signal && left <= 14) {
        violations.push({ code: "window_warning", severity: 1, bet: b.name, text: `«${b.name}»: ${left} dager igjen av valideringsvinduet uten ekte signal.` });
      }
    }
    const cap = val(t.perExperimentCapNok);
    if (cap === null) {
      if (!notes.includes("Kostnadstak pr. eksperiment er ukjent (example-modus?) – kan ikke håndheves.")) notes.push("Kostnadstak pr. eksperiment er ukjent (example-modus?) – kan ikke håndheves.");
    } else if (!b.signal && (b.spentNok || 0) > cap) {
      violations.push({ code: "over_cap", severity: 0, bet: b.name, text: `«${b.name}»: ${Math.round(b.spentNok)} kr brukt uten validering – over eksperimenttaket ${cap} kr (${t.perExperimentCapNok.ref}).` });
    }
  }
  return { violations, notes };
}

module.exports = { load, requiresOwner, betsFromFactoryData, betsFromCompanies, evaluatePortfolio, constitutionPath };
