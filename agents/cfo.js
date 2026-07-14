/* CFO-steget i nattskiftet: ekte P&L pr. selskap fra sannhetslaget.
 *
 * Leser:  data/pnl.json          (kostnadslinjer m/kilde, vedlikeholdt av styret/eier)
 *         data/agent-costs.json  (nattskiftets AI-forbruk, bokført pr. kall)
 *         data/companies.json    (inntekt m/kilde – 0 vises ærlig som 0)
 *         grunnloven             (månedsramme 5–15k → forbruk mot ramme)
 * Skriver: data/pnl-status.json  (månedens tall, pr. selskap, ramme og runway)
 *          companies.json: c.pnl.totalCostNok (kumulativ – grunnlovens
 *          eksperimenttak håndhever mot dette)
 *
 * Prinsipp: aggregerer kun merkede tall; blandingen FAKTISK+ESTIMAT gir ESTIMAT.
 */
"use strict";
const { dataPath, readJSON, writeJSON, monthSpentNok } = require("./lib/common");
const policy = require("./lib/policy");

function run() {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const pnl = readJSON(dataPath("pnl.json"), { entries: [], capitalNok: null });
  const companiesDoc = readJSON(dataPath("companies.json"), null);

  /* Månedens kostnadslinjer: eksplisitte for måneden + recurring fra tidligere */
  const monthEntries = (pnl.entries || []).filter((e) => e.month === month || (e.recurring && e.month <= month));
  const seen = new Set();
  const effective = monthEntries.filter((e) => { const k = e.company + "|" + e.item; if (seen.has(k)) return false; seen.add(k); return true; });

  const aiNok = Math.round(monthSpentNok(now) * 100) / 100; // FAKTISK bokført pr. kall (estimert prising)
  const perCompany = {};
  for (const e of effective) {
    perCompany[e.company] = perCompany[e.company] || { costNok: 0, revenueNok: 0, lines: [] };
    perCompany[e.company].costNok += e.nok || 0;
    perCompany[e.company].lines.push({ item: e.item, nok: e.nok, label: e.label, source: e.source });
  }
  perCompany["saga-os"] = perCompany["saga-os"] || { costNok: 0, revenueNok: 0, lines: [] };
  perCompany["saga-os"].costNok += aiNok;
  perCompany["saga-os"].lines.push({ item: "AI-forbruk nattskiftet (denne måneden)", nok: aiNok, label: "ESTIMAT", source: "data/agent-costs.json, bokført pr. kall mot prislisten i config/budget.json" });

  /* Inntekt: fra selskapsregisteret, med kildemerke. 0 er et ekte tall. */
  let revenueNok = 0;
  for (const c of (companiesDoc && companiesDoc.companies) || []) {
    const mrr = (c.revenue && c.revenue.mrrNok) || 0;
    revenueNok += mrr;
    perCompany[c.id] = perCompany[c.id] || { costNok: 0, revenueNok: 0, lines: [] };
    perCompany[c.id].revenueNok = mrr;
  }

  const totalCostNok = Math.round(Object.values(perCompany).reduce((s, v) => s + v.costNok, 0) * 100) / 100;

  /* Ramme og runway fra grunnloven – ukjente terskler rapporteres som ukjente */
  const { c: constitution, mode } = policy.load();
  const frame = (constitution && constitution.thresholds && constitution.thresholds.monthlyInvestmentNok) || {};
  const frameMax = typeof frame.max === "number" ? frame.max : null;
  const capital = (pnl.capitalNok && pnl.capitalNok.value) || (constitution && constitution.thresholds && constitution.thresholds.oneOffCapitalNok && constitution.thresholds.oneOffCapitalNok.value) || null;
  const net = totalCostNok - revenueNok;
  const runwayMonths = capital !== null && net > 0 ? Math.floor(capital / net) : null;

  const status = {
    schema: 1, month, generatedAt: now.toISOString(), constitution: mode,
    totals: { costNok: totalCostNok, revenueNok, netNok: Math.round(net * 100) / 100, label: "ESTIMAT", note: "Inntekt 0 er FAKTISK (ingen betalingsløsning i drift); kostnader blander FAKTISK og ESTIMAT – se linjene." },
    frame: { maxNok: frameMax, usedPct: frameMax ? Math.round((totalCostNok / frameMax) * 100) : null },
    runwayMonths,
    perCompany,
  };
  writeJSON(dataPath("pnl-status.json"), status);

  /* Kumulativ kost pr. selskap → companies.json (grunnlovens eksperimenttak) */
  if (companiesDoc) {
    for (const c of companiesDoc.companies) {
      const cum = (pnl.entries || []).filter((e) => e.company === c.id).reduce((s, e) => s + (e.nok || 0), 0);
      c.pnl = { ...(c.pnl || {}), totalCostNok: cum, updatedAt: now.toISOString() };
    }
    writeJSON(dataPath("companies.json"), companiesDoc);
  }
  return status;
}

module.exports = { run };
if (require.main === module) { const s = run(); console.log("cfo ok:", s.month, "kost", s.totals.costNok, "kr, inntekt", s.totals.revenueNok, "kr"); }
