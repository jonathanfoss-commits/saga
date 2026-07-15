/* Nattskiftets orkestrator (5.0): vakt → skills-pipeline → morgenbrief.
 * Hvert steg er en skill under mandatmatrisen (agents/lib/skills.js); alt som
 * skjer logges i hendelsesloggen (agents/lib/events.js). Stoppes av
 * kill-switch/budsjettak/manglende nøkkel – da skrives en ÆRLIG brief om
 * hvorfor natten var stille (aldri en stille feil).
 *
 * Moduser (data/mode.json): normal | fokus (kun frister + brudd + CFO-linje) |
 * ferie (kun det som ikke kan vente; første brief etter utløp syntetiserer).
 *
 *   node agents/night-shift.js            (live – krever ANTHROPIC_API_KEY)
 *   MOCK_LLM=1 node agents/night-shift.js (deterministisk demo/test)
 */
"use strict";
const { dataPath, syncData, writeJSON, readJSON, guard, budget, monthSpentNok, today, MOCK } = require("./lib/common");
const policy = require("./lib/policy");
const { logEvent, mergeAppActivity } = require("./lib/events");
const { runPipeline } = require("./lib/skills");

function stoppedBrief(reason, code) {
  return {
    schema: 1, date: today(), generatedAt: new Date().toISOString(),
    mode: code === "UNCONFIGURED" ? "unconfigured" : "stopped",
    headline: code === "UNCONFIGURED" ? "Nattskiftet er ikke konfigurert" : "Nattskiftet står (villet stopp)",
    sections: [{ title: "Årsak", lines: [reason] }],
    actions: [code === "UNCONFIGURED"
      ? { title: "Legg inn ANTHROPIC_API_KEY som repo-secret (Settings → Secrets → Actions)", why: "Agentene kan ikke tenke uten nøkkel. Nøkkelen forlater aldri GitHubs secret-lager." }
      : { title: "Vurder taket i config/budget.json eller fjern config/KILL_SWITCH", why: reason }],
    costs: { estimateNok: 0, monthNok: Math.round(monthSpentNok()), capNok: budget().monthlyCapNok },
  };
}

/* Modus: utløpt modus nullstilles (og briefen ønsker velkommen tilbake) */
function currentMode() {
  const m = readJSON(dataPath("mode.json"), { mode: "normal", until: null });
  if (m.mode !== "normal" && m.until && m.until < today()) {
    const expired = m.mode;
    writeJSON(dataPath("mode.json"), { ...m, mode: "normal", until: null, expiredFrom: expired, expiredAt: today() });
    return { mode: "normal", justEnded: expired };
  }
  return { mode: m.mode || "normal", justEnded: null };
}

async function run() {
  let brief;
  try {
    guard();
    logEvent("natt:start", "Nattskiftet startet", { mock: MOCK });
    mergeAppActivity(syncData()); /* appens aktivitetsspor → hendelsesloggen */
    const { mode: dayMode, justEnded } = currentMode();

    /* Pipeline: rekkefølgen er avhengighetene. Alle er drift (free-mandat). */
    const r = await runPipeline([
      { name: "selskapsstatus", mandate: "research", run: () => require("./etterpaa-status").run() },
      { name: "cfo", mandate: "rapportering", run: () => require("./cfo").run() },
      { name: "styremøte", mandate: "analyse", run: () => require("./board-meeting").run() },
      { name: "radar", mandate: "research", run: () => require("./radar").run() },
      { name: "agenda", mandate: "rapportering", run: (ctx) => require("./agenda").run(ctx) },
      { name: "domenevakt", mandate: "research", run: (ctx) => require("./domain-watch").run(ctx) },
      { name: "beslutningsjournal", mandate: "rapportering", run: () => require("./decision-review").run() },
      { name: "mål-treet", mandate: "rapportering", run: () => require("./goals").run() },
      { name: "ukesbrief", mandate: "rapportering", run: (ctx) => require("./weekly").run(ctx) },
      { name: "kvartalsmøte", mandate: "analyse", run: (ctx) => require("./quarterly").run(ctx) },
      { name: "selvrevisjon", mandate: "forslag", run: () => require("./self-review").run() },
    ]);

    /* Grunnlovsjekk: alltid, alltid ærlig om hvilken grunnlov som gjaldt */
    const { c, mode: cMode } = policy.load();
    const bets = policy.betsFromFactoryData(syncData()).concat(policy.betsFromCompanies(readJSON(dataPath("companies.json"), null)));
    const check = policy.evaluatePortfolio(bets, c);
    writeJSON(dataPath("policy-status.json"), { schema: 1, date: today(), generatedAt: new Date().toISOString(), constitution: cMode, violations: check.violations, notes: check.notes });
    const policyLines = check.violations.length
      ? check.violations.map((v) => (v.severity === 0 ? "🔴 " : "🟡 ") + v.text)
      : ["Ingen brudd på tersklene."];
    if (cMode !== "real") policyLines.push("OBS: kjører på eksempel-grunnlov – legg constitution.json i datarepoet for ekte håndheving.");

    /* Defensivt: en skill kan ha feilet eller vært mandat-blokkert ({error}/
     * {skipped}) – da brukes tom form, og hendelsesloggen har årsaken. */
    const shaped = (x, probe, empty) => (x && !x.error && !x.skipped && x[probe] !== undefined ? x : empty);
    const board = shaped(r["styremøte"], "projects", {});
    const radar = shaped(r["radar"], "findings", {});
    /* LLM-protokoller kommer ofte med markdown (#, **, ---); briefen er ren
     * tekst i app, Issue og lydbrief – strippes ved kilden. */
    const plain = (t) => (t || "").split("\n")
      .map((l) => l.replace(/^#{1,4}\s*/, "").replace(/\*\*/g, "").replace(/^[-–—\s·]+$/, "").trim())
      .filter(Boolean);
    const pnlStatus = shaped(r["cfo"], "totals", null);
    const agenda = shaped(r["agenda"], "lines", { lines: [], open: 0 });
    const domains = shaped(r["domenevakt"], "lines", { lines: [] });
    const review = shaped(r["beslutningsjournal"], "lines", { lines: [] });
    const goals = shaped(r["mål-treet"], "lines", { lines: [] });
    const weekly = shaped(r["ukesbrief"], "week", {});
    const quarterly = shaped(r["kvartalsmøte"], "quarter", {});
    const selfrev = shaped(r["selvrevisjon"], "proposed", {});
    const blocked = Object.entries(r).filter(([, v]) => v && v.skipped === "ownerGate").map(([k]) => k);

    const cfoLines = pnlStatus ? [
      `Måned ${pnlStatus.month}: kost ${pnlStatus.totals.costNok} kr · inntekt ${pnlStatus.totals.revenueNok} kr${pnlStatus.totals.revenueNok === 0 ? " (FAKTISK – ingen betalingsløsning i drift)" : ""} · netto ${pnlStatus.totals.netNok} kr`,
      pnlStatus.frame.maxNok !== null ? `Ramme: ${pnlStatus.frame.usedPct} % av ${pnlStatus.frame.maxNok} kr/mnd (grunnloven)` : "Ramme ukjent – privat grunnlov mangler i sannhetslaget.",
      pnlStatus.runwayMonths !== null ? `Runway: ~${pnlStatus.runwayMonths} mnd på engangskapitalen ved dagens netto (ESTIMAT)` : "Runway: ikke beregnbar (positiv drift eller ukjent kapital).",
      ...(pnlStatus.goalGap ? [pnlStatus.goalGap] : []),
    ] : ["CFO-steget feilet – se hendelsesloggen."];

    /* Seksjoner etter modus: fokus/ferie demper alt uten frist */
    const critical = [
      ...(agenda.lines.length ? [{ title: "Agenda", lines: agenda.lines }] : []),
      ...(check.violations.length ? [{ title: "Grunnlovsjekk", lines: policyLines.slice(0, 6) }] : []),
      ...(domains.lines && domains.lines.length ? [{ title: "Domenevakten", lines: domains.lines }] : []),
    ];
    const full = [
      ...(justEnded ? [{ title: "Velkommen tilbake", lines: [`${justEnded === "ferie" ? "Ferien" : "Fokusperioden"} er over – dette er full brief igjen. Hendelsesloggen har alt fra perioden.`] }] : []),
      ...(agenda.lines.length ? [{ title: "Agenda", lines: agenda.lines }] : [{ title: "Agenda", lines: [`Ingen frister i dag/i morgen (${agenda.open || 0} åpne poster).`] }]),
      { title: "Styremøtet", lines: plain(board.protocol || board.note).slice(0, 8) },
      { title: "Radar", lines: plain(radar.findings).slice(0, 6) },
      { title: "Grunnlovsjekk", lines: policyLines.slice(0, 6) },
      { title: "CFO", lines: cfoLines },
      { title: "Mål-treet", lines: goals.lines || [] },
      ...(review.lines && review.lines.length ? [{ title: "Beslutninger til etterprøving", lines: review.lines }] : []),
      ...(domains.lines && domains.lines.length ? [{ title: "Domenevakten", lines: domains.lines }] : []),
      ...(weekly.week ? [{ title: "Ukesgjennomgang", lines: [`Ukesbrief ${weekly.week} er klar i data/weekly/ – ${weekly.question || ""}`] }] : []),
      ...(quarterly.quarter ? [{ title: "Kvartalsmøte", lines: [`Kvartalssyntese ${quarterly.quarter} er klar i data/quarterly/.`] }] : []),
      ...(selfrev.proposed ? [{ title: "Selvrevisjon", lines: [`Forslag: ${selfrev.proposed} (lagt i forbedringskøen)`] }] : []),
      ...(blocked.length ? [{ title: "Mandat-blokkert", lines: [`Grunnloven blokkerte: ${blocked.join(", ")} – kategoriene deres mangler i free-listen. Sjekk constitution.json.`] }] : []),
    ];

    const spentBefore = monthSpentNok();
    brief = {
      schema: 1, date: today(), generatedAt: new Date().toISOString(),
      mode: MOCK ? "mock" : "live",
      dayMode,
      headline: dayMode !== "normal"
        ? `${dayMode === "fokus" ? "Fokusmodus" : "Feriemodus"}: kun det som ikke kan vente${critical.length ? "" : " – og i natt kunne alt vente"}`
        : [
            (board.projects || board.companies) ? `Styret vurderte ${(board.projects || 0) + (board.companies || 0)} veddemål (${board.companies || 0} selskap)` : null,
            agenda.lines.length ? `${agenda.lines.length} frist${agenda.lines.length > 1 ? "er" : ""} i agendaen` : null,
          ].filter(Boolean).join(" · ") || "Natten var stille – styret mangler synkede data",
      sections: dayMode !== "normal" ? critical : full,
      actions: board.projects || board.companies
        ? [{ title: "Les protokollen og radar-funnene – godkjenn/avvis i appen", why: "Agentene beslutter aldri på dine vegne." }]
        : [{ title: "Kjør «Synk nå (push)» under System – mot det PRIVATE datarepoet", why: "Uten synkede data har nattskiftet ingenting å vurdere." }],
      costs: { estimateNok: Math.round((monthSpentNok() - spentBefore) * 10) / 10, monthNok: Math.round(monthSpentNok() * 10) / 10, capNok: budget().monthlyCapNok },
    };
    logEvent("natt:ferdig", brief.headline, { sections: brief.sections.length, dayMode });
  } catch (e) {
    if (!["KILL", "BUDGET", "UNCONFIGURED"].includes(e.code)) throw e;
    brief = stoppedBrief(e.message, e.code);
  }
  writeJSON(dataPath("brief-latest.json"), brief);
  writeJSON(dataPath("briefs", today() + ".json"), brief);
  console.log("morgenbrief:", brief.mode, "–", brief.headline);
  return brief;
}

module.exports = { run };
if (require.main === module) run().catch((e) => { console.error("nattskift-feil:", e.message); process.exit(1); });
