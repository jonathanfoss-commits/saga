/* Personlig OS-tester (5.0): jobbfilteret (begge retninger + fail-closed),
 * agenda-påminnelser og purring, domenevakt m/endringsalarm (mock),
 * beslutningsjournalens etterprøving, mål-treet, ukesbrief (forsert),
 * kvartalsmøte (forsert), selvrevisjon, moduser og hendelseslogg.
 *
 * Run:  node tests/personal-os.test.js
 */
"use strict";
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log("  ✅ " + name);
  else { failures++; console.error("  ❌ " + name + (detail !== undefined ? "\n     " + JSON.stringify(detail).slice(0, 400) : "")); }
}
const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

function fresh(files = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saga-pos-"));
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(tmp, "constitution.json"), JSON.stringify({
    schema: 1, source: { sha256: "fixture" }, northStar: { text: "Første 1 000 kr/mnd.", monthlyRecurringNok: 1000 },
    thresholds: { validationWindowDays: { value: 90, ref: "f" }, maxActiveBets: { value: 2, ref: "f" }, perExperimentCapNok: { value: 15000, ref: "f" }, monthlyInvestmentNok: { min: 5000, max: 15000, ref: "f" }, oneOffCapitalNok: { value: 50000, ref: "f" } },
    mandate: { free: ["analyse", "research", "planlegging", "rapportering", "forslag"], ownerGate: ["pengebruk", "utsendelse"] },
  }));
  for (const [name, obj] of Object.entries(files)) fs.writeFileSync(path.join(dataDir, name), JSON.stringify(obj));
  return { tmp, dataDir };
}
const nightEnv = (tmp, dataDir, extra = {}) => ({ ...process.env, MOCK_LLM: "1", ANTHROPIC_API_KEY: "", VERCEL_TOKEN: "", DATA_DIR: dataDir, CONSTITUTION_FILE: path.join(tmp, "constitution.json"), MOCK_RDAP: "", FORCE_WEEKLY: "", FORCE_QUARTERLY: "", ...extra });
const night = (tmp, dataDir, extra) => execFileSync("node", [path.join(__dirname, "..", "agents", "night-shift.js")], { env: nightEnv(tmp, dataDir, extra) });
const readData = (dataDir, f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf-8"));

/* ---------- 1: jobbfilteret ---------- */
{
  const { dataDir } = fresh({ "agenda-filter-config.json": { workDomains: ["jobbfirma.no"], workWords: ["booking", "kunde"] } });
  process.env.DATA_DIR = dataDir;
  delete require.cache[require.resolve("../agents/lib/common")];
  delete require.cache[require.resolve("../agents/lib/agenda-filter")];
  const { classify } = require("../agents/lib/agenda-filter");
  const cfg = { workDomains: ["jobbfirma.no"], workWords: ["booking", "kunde"] };

  check("jobbmail avvises på domene uansett innhold",
    classify({ from: "kollega@jobbfirma.no", subject: "Pakken din er klar til henting" }, cfg).accept === false, null);
  check("jobbsignal i innhold avvises selv fra ekstern avsender",
    classify({ from: "noen@ekstern.no", subject: "Ny booking til kunde" }, cfg).accept === false, null);
  const pakke = classify({ from: "noreply@postnord.no", subject: "Pakken din kan hentes – hentefrist 20.07" }, cfg);
  check("pakkemail fanges med kategori", pakke.accept === true && pakke.category === "pakke", pakke);
  const regning = classify({ from: "faktura@strom.no", subject: "Faktura med forfall 25.07" }, cfg);
  check("regning fanges", regning.accept === true && regning.category === "regning", regning);
  check("nøytral mail uten signaler avvises (fail-closed)",
    classify({ from: "venn@gmail.com", subject: "Hei, lenge siden!" }, cfg).accept === false, null);
  check("UTEN konfig avvises alt (fail-closed)",
    classify({ from: "noreply@postnord.no", subject: "Pakken din kan hentes" }, null).accept === false, null);
}

/* ---------- 2: agenda-påminnelser + purring ---------- */
{
  const { tmp, dataDir } = fresh({ "agenda.json": { schema: 1, items: [
    { id: "1", title: "Hente pakke på Extra", due: iso(0), status: "ny", source: { from: "PostNord" } },
    { id: "2", title: "Betale strømregning", due: iso(1), status: "ny" },
    { id: "3", title: "Gammel frist", due: iso(-2), status: "varslet" },
    { id: "4", title: "Gjort ting", due: iso(0), status: "gjort" },
    { id: "5", title: "Langt frem", due: iso(30), status: "ny" },
  ] } });
  night(tmp, dataDir);
  const brief = readData(dataDir, "brief-latest.json");
  const ag = (brief.sections || []).find((s) => s.title === "Agenda");
  check("agenda: i dag + i morgen + forfalt i briefen, gjort/fjern ekskludert",
    ag && ag.lines.some((l) => l.includes("I DAG") && l.includes("pakke")) && ag.lines.some((l) => l.includes("I MORGEN")) && ag.lines.some((l) => l.includes("FORFALT")) && !ag.lines.some((l) => l.includes("Gjort ting") || l.includes("Langt frem")), ag);
  check("headline nevner fristene", brief.headline.includes("frist"), brief.headline);
  const after = readData(dataDir, "agenda.json");
  check("poster markeres varslet (men purres videre til gjort)", after.items.find((i) => i.id === "1").status === "varslet", after.items[0]);
}

/* ---------- 3: domenevakt med endringsalarm ---------- */
{
  const { tmp, dataDir } = fresh({ "watchlist.json": { schema: 1, domains: [{ name: "testnavn.no", lastStatus: "ledig", why: "sakskart S1" }] } });
  night(tmp, dataDir, { MOCK_RDAP: "tatt" });
  const brief = readData(dataDir, "brief-latest.json");
  const dv = (brief.sections || []).find((s) => s.title === "Domenevakten");
  check("domenevakt: ledig→tatt gir rød alarm i briefen", dv && dv.lines.some((l) => l.includes("TATT")), dv);
  const wl = readData(dataDir, "watchlist.json");
  check("watchlist oppdateres med ny status og tidsstempel", wl.domains[0].lastStatus === "tatt" && !!wl.domains[0].lastCheckedAt, wl.domains[0]);
}

/* ---------- 4: beslutningsjournal – etterprøving forfaller ---------- */
{
  const { tmp, dataDir } = fresh({ "decisions-journal.json": { schema: 1, entries: [
    { id: "d1", at: "2026-04-01T00:00:00Z", decision: "Lansere falsk dør for X", expectation: "50 påmeldte innen 90 dager", reviewAt: iso(-1), outcome: null },
    { id: "d2", at: "2026-07-01T00:00:00Z", decision: "Ikke forfalt", expectation: "y", reviewAt: iso(30), outcome: null },
    { id: "d3", at: "2026-05-01T00:00:00Z", decision: "Dømt sak", expectation: "z", reviewAt: "2026-06-01", outcome: { at: "2026-06-01", verdict: "traff" } },
  ] } });
  night(tmp, dataDir);
  const brief = readData(dataDir, "brief-latest.json");
  const rv = (brief.sections || []).find((s) => s.title === "Beslutninger til etterprøving");
  check("forfalt beslutning bes dømt i briefen (ikke de andre)",
    rv && rv.lines.length === 1 && rv.lines[0].includes("falsk dør"), rv);
}

/* ---------- 5: mål-treet + CFO-gap ---------- */
{
  const { tmp, dataDir } = fresh({ "goals.json": { schema: 1, northStar: "Første 1 000 kr/mnd.", quarter: { goal: "Kvartalsmålet" }, week: { focus: "Ukens fokus-test" } } });
  night(tmp, dataDir);
  const brief = readData(dataDir, "brief-latest.json");
  const mt = (brief.sections || []).find((s) => s.title === "Mål-treet");
  const cfo = (brief.sections || []).find((s) => s.title === "CFO");
  check("mål-treet i briefen med alle tre nivåer", mt && mt.lines.length === 3 && mt.lines[2].includes("Ukens fokus-test"), mt);
  check("CFO viser gap til nordstjernen", cfo && cfo.lines.some((l) => l.includes("nordstjernen") && l.includes("1000")), cfo);
}

/* ---------- 6: ukesbrief (forsert) ---------- */
{
  const { tmp, dataDir } = fresh({ "people.json": { schema: 1, people: [
    { id: "p1", name: "Mamma", birthday: "1960-" + iso(3).slice(5), lastContactAt: iso(-40), cadenceDays: 21, note: "ring oftere" },
  ] } });
  night(tmp, dataDir, { FORCE_WEEKLY: "1" });
  const files = fs.readdirSync(path.join(dataDir, "weekly"));
  const week = readData(dataDir, "weekly/" + files[0]);
  check("ukesbrief arkiveres med retro, folk og spørsmålet",
    week.question.includes("DREPE") && week.people.some((p) => p.includes("Mamma") && p.includes("🎂")) && week.people.some((p) => p.includes("📞")), week.people);
  const brief = readData(dataDir, "brief-latest.json");
  check("morgenbriefen peker på ukesbriefen", (brief.sections || []).some((s) => s.title === "Ukesgjennomgang"), brief.sections.map((s) => s.title));
}

/* ---------- 7: kvartalsmøte (forsert) + selvrevisjon ---------- */
{
  const { tmp, dataDir } = fresh({});
  night(tmp, dataDir, { FORCE_QUARTERLY: "1" });
  const qf = fs.readdirSync(path.join(dataDir, "quarterly"));
  check("kvartalssyntese arkiveres med innstillinger", qf.length === 1 && readData(dataDir, "quarterly/" + qf[0]).synthesis.includes("INNSTILLING"), qf);
  const events = fs.readFileSync(path.join(dataDir, "events-" + new Date().getFullYear() + ".jsonl"), "utf-8");
  check("hendelsesloggen har natt-start og skill-hendelser", events.includes("natt:start") && events.includes("skill:ok"), null);
}

/* ---------- 8: moduser ---------- */
{
  const { tmp, dataDir } = fresh({
    "mode.json": { schema: 1, mode: "fokus", until: iso(3) },
    "agenda.json": { schema: 1, items: [{ id: "1", title: "Frist i fokus", due: iso(0), status: "ny" }] },
  });
  night(tmp, dataDir);
  const brief = readData(dataDir, "brief-latest.json");
  check("fokusmodus: kun kritiske seksjoner, styremøtet dempet",
    brief.headline.includes("Fokusmodus") && brief.sections.some((s) => s.title === "Agenda") && !brief.sections.some((s) => s.title === "Styremøtet"), brief.sections.map((s) => s.title));

  const { tmp: t2, dataDir: d2 } = fresh({ "mode.json": { schema: 1, mode: "ferie", until: iso(-1) } });
  night(t2, d2);
  const brief2 = readData(d2, "brief-latest.json");
  check("utløpt ferie: full brief med velkommen tilbake-syntese",
    brief2.sections.some((s) => s.title === "Velkommen tilbake") && brief2.sections.some((s) => s.title === "Styremøtet"), brief2.sections.map((s) => s.title));
  check("mode.json nullstilt til normal", readData(d2, "mode.json").mode === "normal", null);
}

if (failures) { console.error("\n" + failures + " FAILURES"); process.exit(1); }
console.log("\nALL PERSONAL-OS TESTS PASSED");
