/* Jobbfilteret (C1 – FREDET-håndhevingen i kode): eierens e-post er
 * jobbadressen, og arbeidsgiverens innhold skal ALDRI inn i dette systemet.
 * Filteret klassifiserer en e-post-kandidat {from, subject, snippet} og
 * slipper KUN gjennom private livshendelser med tydelige signaler.
 *
 * Prinsipp: fail-closed, i tre lag:
 *   1. Uten filterkonfig fra sannhetslaget avvises ALT (konfigen – bl.a.
 *      arbeidsgiverens domener – er privat og hører ikke hjemme i dette repoet).
 *   2. Jobbsignal (domene eller innholdsord fra konfigen) → avvis uansett.
 *   3. Uten positivt livsadmin-signal → avvis.
 * Dagskiftet (Claude-rutinen med Gmail-tilgang) SKAL kjøre hver kandidat
 * gjennom dette filteret før noe skrives til agenda.json – og aldri sitere
 * mer enn tittel/frist/avsender.
 *
 * Konfig (PRIVAT, data/agenda-filter-config.json):
 *   { workDomains: ["…"], workWords: ["booking", …] }
 */
"use strict";
const { dataPath, readJSON } = require("./common");

/* Livsadmin-kategorier med positive signaler (generiske, ikke jobbspesifikke) */
const CATEGORIES = [
  { id: "pakke", re: /\b(pakke(?:n)? (?:er klar|kan hentes)|hentekode|hentefrist|posten|bring|postnord|helthjem|instabox|pakkeboks|utlevering)\b/i },
  { id: "regning", re: /\b(faktura|regning|forfall|forfallsdato|betalingsfrist|purring|inkassovarsel|avtalegiro)\b/i },
  { id: "avtale", re: /\b(time(?:avtale)?|innkalling|bekreft (?:timen|avtalen)|tannlege|legetime|frisør|verksted|EU-kontroll)\b/i },
  { id: "billett", re: /\b(billett|reservasjon|bookingbekreftelse|innsjekking|boardingkort|avgang)\b/i },
  { id: "abonnement", re: /\b(abonnement(?:et)? (?:fornyes|utløper)|prisendring|oppsigelsesfrist|prøveperioden? (?:utløper|slutter))\b/i },
  { id: "frist", re: /\b(svarfrist|påmeldingsfrist|siste frist|utløper i (?:dag|morgen))\b/i },
];

function loadConfig() { return readJSON(dataPath("agenda-filter-config.json"), null); }

function classify(candidate, config = loadConfig()) {
  const { from = "", subject = "", snippet = "" } = candidate || {};
  if (!config || !Array.isArray(config.workDomains) || !config.workDomains.length) {
    return { accept: false, reason: "filterkonfig mangler i sannhetslaget (fail-closed – ingenting slipper gjennom)" };
  }
  const text = subject + " " + snippet;
  const domain = (from.split("@")[1] || "").toLowerCase().trim().replace(/[>\s]+$/, "");

  for (const wd of config.workDomains) {
    const w = String(wd).toLowerCase();
    if (domain === w || domain.endsWith("." + w)) return { accept: false, reason: "jobbdomene (fredet)" };
  }
  if (Array.isArray(config.workWords) && config.workWords.length) {
    const workRe = new RegExp("\\b(" + config.workWords.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "i");
    if (workRe.test(text)) return { accept: false, reason: "jobbsignal i innholdet (fredet)" };
  }
  for (const cat of CATEGORIES) {
    if (cat.re.test(text)) return { accept: true, category: cat.id, reason: "livsadmin-signal: " + cat.id };
  }
  return { accept: false, reason: "ingen positive livsadmin-signaler (fail-closed)" };
}

module.exports = { classify, loadConfig, CATEGORIES };
