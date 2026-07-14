/* Ukesgjennomgangen (C6): søndag kveld (eller FORCE_WEEKLY=1) bygges en
 * ukesbrief fra hendelsesloggen, P&L, beslutningsjournalen og relasjons-CRM-en:
 * uken som gikk, uken som kommer, retro-treffsikkerhet, relasjonspåminnelser –
 * og ETT spørsmål: hva vil du drepe/doble? Arkiveres i data/weekly/.
 * Deterministisk (ingen LLM) – syntesen er tall og fakta, ikke prosa.
 */
"use strict";
const { dataPath, readJSON, writeJSON, today } = require("./lib/common");
const { readEvents } = require("./lib/events");

const DAY = 86400000;
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + "-U" + String(Math.ceil(((t - y) / DAY + 1) / 7)).padStart(2, "0");
};

function shouldRun(now = new Date()) { return process.env.FORCE_WEEKLY === "1" || now.getDay() === 0; }

function peopleReminders(now = new Date()) {
  const doc = readJSON(dataPath("people.json"), null);
  if (!doc || !Array.isArray(doc.people)) return [];
  const out = [];
  for (const p of doc.people) {
    if (p.birthday) {
      const [m, d] = p.birthday.slice(5).split("-").map(Number);
      const next = new Date(now.getFullYear(), m - 1, d);
      if (next < now) next.setFullYear(next.getFullYear() + 1);
      const days = Math.round((next - now) / DAY);
      if (days <= 7) out.push(`🎂 ${p.name} har bursdag ${p.birthday.slice(5)} (${days === 0 ? "I DAG" : "om " + days + " dager"})`);
    }
    if (p.cadenceDays && p.lastContactAt) {
      const since = Math.floor((now - new Date(p.lastContactAt)) / DAY);
      if (since >= p.cadenceDays) out.push(`📞 ${p.name}: ${since} dager siden sist – ${p.note || "på tide å ta kontakt"}`);
    }
  }
  return out.slice(0, 5);
}

function run({ logEvent } = {}) {
  const now = new Date();
  if (!shouldRun(now)) return { skipped: "ikke søndag" };
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const events = readEvents({ since: weekAgo, limit: 2000 });
  const pnl = readJSON(dataPath("pnl-status.json"), null);
  const review = require("./decision-review").run();
  const goals = require("./goals").run();
  const agenda = readJSON(dataPath("agenda.json"), { items: [] });
  const openAgenda = (agenda.items || []).filter((i) => !["gjort", "avvist"].includes(i.status));

  const week = {
    schema: 1, week: isoWeek(now), generatedAt: now.toISOString(),
    lastWeek: {
      events: events.length,
      decisions: events.filter((e) => e.type.includes("beslutning") || e.type === "app:eier").length,
      skillErrors: events.filter((e) => e.type === "skill:feil").map((e) => e.message).slice(0, 5),
      costNok: pnl ? pnl.totals.costNok : null,
      revenueNok: pnl ? pnl.totals.revenueNok : null,
    },
    retro: review.stats
      ? `Beslutnings-treffsikkerhet: ${review.stats.traff}/${review.stats.judged} traff, ${review.stats.bom} bom, ${review.stats.delvis} delvis.`
      : "Ingen etterprøvde beslutninger enda – journalfør forventninger, så måles du.",
    people: peopleReminders(now),
    nextWeek: { openAgenda: openAgenda.length, dueSoon: openAgenda.filter((i) => i.due && new Date(i.due) - now < 7 * DAY).map((i) => `${i.due}: ${i.title}`).slice(0, 6) },
    goals: goals.lines,
    question: "Hva vil du DREPE og hva vil du DOBLE denne uken? Svar i appen – det blir ukens fokus.",
  };
  writeJSON(dataPath("weekly", week.week + ".json"), week);
  if (logEvent) logEvent("ukesbrief:generert", "Ukesgjennomgang " + week.week, { week: week.week });
  return week;
}

module.exports = { run, isoWeek };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
