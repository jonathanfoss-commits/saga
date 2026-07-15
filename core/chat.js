/* SAGA – chat-motor for assistent-dokken og Assistent-flaten i OS-skallet.
 * Slank klient over Claude API med tool-use mot fabrikken, styret og broen.
 * (Fullskjerm-PWA-en i assistant/ har egen, rikere klient med stemme/PWA –
 * bevisst duplikat inntil konsolidering, se docs/improvements.md.)
 * Ingen DOM her – os/chat.js eier visningen. Eksponerer window.SAGACHAT.
 */
(() => {
"use strict";

const KEY = () => localStorage.getItem("saga_api_key") || localStorage.getItem("jarvis_api_key") || "";
const MODEL = () => localStorage.getItem("saga_model") || localStorage.getItem("jarvis_model") || "claude-sonnet-5";

const History = {
  list() { try { return JSON.parse(localStorage.getItem("saga_chat")) || []; } catch { return []; } },
  save(l) { localStorage.setItem("saga_chat", JSON.stringify(l.slice(-60))); },
  add(role, text) { const l = this.list(); l.push({ role, text, at: new Date().toISOString() }); this.save(l); },
  clear() { localStorage.removeItem("saga_chat"); },
};

const PERSONA = `Du er SAGA – eierens personlige assistent og stabssjef i SAGA OS (selskapsfabrikk, digitalt styre, livsadmin).
Regler: Vær presis og ærlig. Gjett aldri – si «vet ikke» eller bruk verktøy/websøk. Merk tall som FAKTISK
(fra verktøydata) eller ESTIMAT. Ikke lov handlinger du ikke kan utføre. Verktøyene endrer eierens data –
bruk dem målrettet, aldri i løkke uten grunn. Svar på norsk, kort og konkret.
Mandat (grunnloven, fail-closed): du HANDLER fritt på drift – agenda, journal, minne, mål, modus, lesekø,
relasjoner, utkast. Du sender ALDRI noe, bruker aldri penger, inngår aldri avtaler: utadrettet = utkast i
drafts/, og eieren sender selv. Journalfør eierbeslutninger MED forventning og etterprøvingsdato når
eieren beslutter noe vesentlig – foreslå det aktivt. Sier eieren «husk …», bruk minneverktøyet.
LEDERGRUPPEN: Ber eieren om ledergruppens syn («ledergruppe: …», «hva sier ledergruppen», «tenk som
CEO/CFO/CTO/CMO»), svar som eierens virtuelle ledergruppe. Gjelder saken porteføljen: hent FAKTISKE tall
med verktøyene først. Én linje per rolle, maks to setninger: CFO (kontantstrøm, kost, enhetsøkonomi,
nedside) · CTO (byggbarhet, teknisk gjeld, enkleste løsning som holder) · CMO (kunde, distribusjon,
betalingsvilje, budskap) · COO (drift, tid, flaskehalser). Uenighet skal FREM – marker med ⚡. CEO
konkluderer til slutt: anbefaling + hva som må være SANT for at den holder. Ledergruppen er sparring,
ikke vedtak – for store/irreversible beslutninger, foreslå å sende saken til STYRET (djevelens advokat,
pre-mortem) og å journalføre beslutningen med forventning og etterprøvingsdato.`;

const TOOLS = [
  { name: "saga_factory_status", description: "Porteføljestatus fra fabrikken: prosjekter, faser, innboks, ventende research. FAKTISKE data.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "saga_factory_add_idea", description: "Legg en idé i fabrikkens innboks (fanges, startes ikke).", input_schema: { type: "object", properties: { idea: { type: "string" } }, required: ["idea"], additionalProperties: false } },
  { name: "saga_board_status", description: "Styrets hovedbok: siste beslutninger med anbefaling/sikkerhet, og åpne antakelser som skal følges opp.", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "saga_answer_research", description: "Lever svar på en ventende research-forespørsel fra fabrikken (bruk id fra saga_factory_status/pending-listen).", input_schema: { type: "object", properties: { request_id: { type: "string" }, answer: { type: "string" } }, required: ["request_id", "answer"], additionalProperties: false } },
  /* 5.0: verktøy mot sannhetslaget (privat datarepo). Alle er DRIFT under
   * mandatmatrisen – ingenting her kan sende noe eller bruke penger. */
  { name: "saga_agenda", description: "Livsadmin-agendaen i sannhetslaget. action=list viser åpne poster; add legger til (title + valgfri due YYYY-MM-DD); done/dismiss lukker (id kreves).", input_schema: { type: "object", properties: { action: { type: "string", enum: ["list", "add", "done", "dismiss"] }, title: { type: "string" }, due: { type: "string" }, id: { type: "string" } }, required: ["action"], additionalProperties: false } },
  { name: "saga_journal", description: "Beslutningsjournalen: action=add journalfører en eierbeslutning MED forventning og etterprøvingsdato (decision, expectation, reviewAt YYYY-MM-DD); judge feller dom på en forfalt post (id, verdict: traff/bom/delvis, note).", input_schema: { type: "object", properties: { action: { type: "string", enum: ["add", "judge", "list"] }, decision: { type: "string" }, expectation: { type: "string" }, reviewAt: { type: "string" }, id: { type: "string" }, verdict: { type: "string", enum: ["traff", "bom", "delvis"] }, note: { type: "string" } }, required: ["action"], additionalProperties: false } },
  { name: "saga_mode", description: "Sett modus: normal, fokus eller ferie (until YYYY-MM-DD kreves for fokus/ferie). Styrer hvor mye morgenbriefen bråker.", input_schema: { type: "object", properties: { mode: { type: "string", enum: ["normal", "fokus", "ferie"] }, until: { type: "string" } }, required: ["mode"], additionalProperties: false } },
  { name: "saga_remember", description: "Minnelaget: lagre en varig lærdom/preferanse om eieren (topic + text). Brukes når eieren sier «husk at …» eller tar en prinsippbeslutning.", input_schema: { type: "object", properties: { topic: { type: "string" }, text: { type: "string" } }, required: ["topic", "text"], additionalProperties: false } },
  { name: "saga_reading_add", description: "Legg en lenke i leseinnboksen (radaren destillerer ukentlig).", input_schema: { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url"], additionalProperties: false } },
  { name: "saga_week_focus", description: "Sett ukens fokus i mål-treet (svaret på ukesbriefens drep/doble-spørsmål).", input_schema: { type: "object", properties: { focus: { type: "string" } }, required: ["focus"], additionalProperties: false } },
  { name: "saga_people_add", description: "Privat relasjons-CRM (ALDRI kunder/kolleger): legg til person med valgfri bursdag (YYYY-MM-DD), kontakt-kadens i dager og notat.", input_schema: { type: "object", properties: { name: { type: "string" }, relation: { type: "string" }, birthday: { type: "string" }, cadenceDays: { type: "number" }, note: { type: "string" } }, required: ["name"], additionalProperties: false } },
  { name: "saga_draft", description: "Lagre et UTKAST til utadrettet innhold (e-post/post/tilbud) i sannhetslagets drafts/. Utkast sendes ALDRI av systemet – sending er eierens handling.", input_schema: { type: "object", properties: { kind: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, required: ["kind", "title", "body"], additionalProperties: false } },
];

const newId = () => Math.random().toString(36).slice(2, 10);

async function execTool(name, input) {
  const B = window.SAGA && window.SAGA.bridge;
  const T = window.CF && window.CF.Truth;
  const today = () => new Date().toISOString().slice(0, 10);
  try {
    /* --- sannhetslag-verktøyene (async, private datarepoet) --- */
    if (name === "saga_agenda") {
      if (input.action === "list") {
        const { json } = await T.read("data/agenda.json");
        const open = ((json && json.items) || []).filter((i) => !["gjort", "avvist"].includes(i.status));
        return JSON.stringify(open.map((i) => ({ id: i.id, title: i.title, due: i.due, status: i.status })));
      }
      if (input.action === "add") {
        const id = newId();
        await T.update("data/agenda.json", (j) => { const d = j || { schema: 1, items: [] }; d.items.push({ id, title: String(input.title || ""), due: input.due || null, status: "ny", source: { from: "assistenten", addedAt: new Date().toISOString() } }); d.updatedAt = new Date().toISOString(); return d; }, "agenda: + " + input.title);
        return "Lagt i agendaen (id " + id + ")." + (input.due ? " Purres fra " + input.due + "." : "");
      }
      await T.update("data/agenda.json", (j) => { const it = (j.items || []).find((x) => x.id === input.id); if (!it) throw new Error("fant ikke id " + input.id); it.status = input.action === "done" ? "gjort" : "avvist"; it.closedAt = new Date().toISOString(); j.updatedAt = it.closedAt; return j; }, "agenda: " + input.action + " " + input.id);
      return "Posten er " + (input.action === "done" ? "gjort" : "avvist") + ".";
    }
    if (name === "saga_journal") {
      if (input.action === "list") {
        const { json } = await T.read("data/decisions-journal.json");
        return JSON.stringify(((json && json.entries) || []).slice(0, 10).map((e) => ({ id: e.id, decision: e.decision, reviewAt: e.reviewAt, dømt: !!e.outcome })));
      }
      if (input.action === "add") {
        if (!input.expectation || !input.reviewAt) return "Avvist: en journalpost UTEN forventning og etterprøvingsdato kan ikke etterprøves. Be eieren om begge.";
        const id = newId();
        await T.update("data/decisions-journal.json", (j) => { const d = j || { schema: 1, entries: [] }; d.entries.unshift({ id, at: new Date().toISOString(), decision: String(input.decision || ""), expectation: String(input.expectation), reviewAt: input.reviewAt, outcome: null }); return d; }, "journal: + " + (input.decision || "").slice(0, 40));
        return "Journalført (id " + id + "). Etterprøves " + input.reviewAt + " – nattskiftet minner deg.";
      }
      await T.update("data/decisions-journal.json", (j) => { const e = (j.entries || []).find((x) => x.id === input.id); if (!e) throw new Error("fant ikke id " + input.id); e.outcome = { at: new Date().toISOString(), verdict: input.verdict, note: input.note || "" }; return j; }, "journal: dom " + input.verdict + " på " + input.id);
      return "Dommen er felt: " + input.verdict + ". Treffsikkerheten oppdateres i ukesbriefen.";
    }
    if (name === "saga_mode") {
      if (input.mode !== "normal" && !input.until) return "Avvist: fokus/ferie krever until-dato (ellers glemmes du i stillhet).";
      await T.update("data/mode.json", (j) => ({ ...(j || { schema: 1 }), mode: input.mode, until: input.mode === "normal" ? null : input.until }), "modus: " + input.mode);
      return "Modus satt: " + input.mode + (input.until ? " til " + input.until : "") + ". Gjelder fra neste brief.";
    }
    if (name === "saga_remember") {
      await T.update("memory/index.json", (j) => { const d = j || { schema: 1, entries: [] }; d.entries.unshift({ at: new Date().toISOString(), topic: String(input.topic || ""), text: String(input.text || "") }); return d; }, "minne: " + input.topic);
      return "Husket under «" + input.topic + "».";
    }
    if (name === "saga_reading_add") {
      await T.update("data/reading.json", (j) => { const d = j || { schema: 1, items: [] }; d.items.unshift({ id: newId(), url: String(input.url || ""), title: input.title || "", addedAt: new Date().toISOString(), status: "ulest" }); return d; }, "lesekø: + " + (input.title || input.url));
      return "Lagt i leseinnboksen.";
    }
    if (name === "saga_week_focus") {
      await T.update("data/goals.json", (j) => ({ ...(j || { schema: 1 }), week: { focus: String(input.focus || ""), setAt: today() } }), "mål: ukens fokus");
      return "Ukens fokus er satt – vises i mål-treet i morgenbriefen.";
    }
    if (name === "saga_people_add") {
      await T.update("data/people.json", (j) => { const d = j || { schema: 1, people: [] }; d.people.push({ id: newId(), name: String(input.name || ""), relation: input.relation || "", birthday: input.birthday || null, lastContactAt: today(), cadenceDays: input.cadenceDays || null, note: input.note || "" }); return d; }, "relasjoner: + " + input.name);
      return "Lagt til i det private relasjons-CRM-et.";
    }
    if (name === "saga_draft") {
      /* Markdown, ikke JSON – skrives direkte via Gh, bak samme privatvakt */
      const file = "drafts/" + today() + "-" + (input.title || "utkast").toLowerCase().replace(/[^a-z0-9æøå]+/gi, "-").slice(0, 40) + ".md";
      const c = window.CF.Sync.config();
      if (!c.repo || !window.CF.Gh.pat) throw new Error("Sannhetslaget er ikke koblet til.");
      await window.CF.Sync.assertPrivate(c.repo);
      const existing = await window.CF.Gh.getFile(c.repo, file, c.branch);
      await window.CF.Gh.putFile(c.repo, file, c.branch, "# " + input.title + "\n\n(" + input.kind + " – UTKAST, aldri sendt av systemet)\n\n" + input.body + "\n", "utkast: " + input.title, existing ? existing.sha : undefined);
      return "Utkastet ligger i sannhetslaget (" + file + "). Sending er din handling – aldri min.";
    }

    if (name === "saga_factory_status") {
      const s = B.factoryStatus();
      const pend = B.pending("research").map((r) => ({ id: r.id, prosjekt: r.project, spørsmål: r.question }));
      return JSON.stringify({ ...s, ventende_research: pend });
    }
    if (name === "saga_factory_add_idea") { B.addIdeaToFactory(String(input.idea || "")); return "Idéen ligger i innboksen (FAKTISK)."; }
    if (name === "saga_board_status") {
      const A = window.AEIS;
      if (!A) return "Styret er ikke lastet.";
      const dec = A.Ledger.list().filter((d) => d.synthesis).slice(0, 5).map((d) => ({ tittel: d.title, anbefaling: d.synthesis.recommendation, sikkerhet: d.synthesis.certainty, dato: d.at.slice(0, 10) }));
      return JSON.stringify({ beslutninger: dec, åpne_antakelser: A.Ledger.openAssumptions().slice(0, 8) });
    }
    if (name === "saga_answer_research") { B.complete(String(input.request_id), String(input.answer || "")); return "Svaret er levert til prosjektpanelet (FAKTISK)."; }
    return "Ukjent verktøy: " + name;
  } catch (e) { return "Verktøyfeil: " + e.message; }
}

/* Kontekst fra der eieren står i skallet – injiseres i systemprompten */
function contextText() {
  const h = location.hash || "";
  const m = h.match(/^#\/companies\/(.+)$/);
  if (m && window.CF) {
    const p = window.CF.Projects.get(m[1]);
    if (p) return `KONTEKST: Eieren står i selskapet «${p.name}»${p.test ? " (TEST)" : ""} – status ${p.status}, fase ${p.phase}. Idé: ${p.idea}`;
  }
  if (h.startsWith("#/board")) return "KONTEKST: Eieren står i Styret-flaten.";
  if (h.startsWith("#/approvals")) return "KONTEKST: Eieren ser på ventende godkjenninger.";
  return "";
}

async function post(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify(body),
  }).catch(() => { throw new Error("Nettverksfeil. Er du i en forhåndsvisning som blokkerer eksterne kall? Åpne appen på GitHub Pages-adressen."); });
  if (!res.ok) {
    let detail = ""; try { detail = (await res.json()).error?.message || ""; } catch {}
    throw new Error("API-feil " + res.status + ". " + detail);
  }
  return res.json();
}

async function send(text, onEvent) {
  if (!KEY()) throw new Error("Ingen API-nøkkel – legg den inn under System.");
  const say = (t, d) => onEvent && onEvent(t, d);
  History.add("user", text);
  const ctx = contextText();
  const system = PERSONA + (ctx ? "\n\n" + ctx : "");
  let messages = History.list().slice(-12).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

  for (let round = 0; round < 8; round++) {
    const res = await post({
      model: MODEL(), max_tokens: 4096, system, messages,
      tools: [...TOOLS, { type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    });
    try { if (window.CF) window.CF.Costs.add(res.usage, "assistent-dokk", null); } catch {}
    if (res.stop_reason === "tool_use") {
      messages = [...messages, { role: "assistant", content: res.content }];
      const results = [];
      for (const b of res.content.filter((x) => x.type === "tool_use")) {
        say("tool", b.name);
        let out;
        try { out = await execTool(b.name, b.input || {}); }
        catch (e) { out = "Verktøyfeil: " + e.message; }
        results.push({ type: "tool_result", tool_use_id: b.id, content: out });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (res.stop_reason === "pause_turn") { messages = [...messages, { role: "assistant", content: res.content }]; say("status", "arbeider videre …"); continue; }
    const out = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim() || "(tomt svar)";
    History.add("assistant", out);
    say("done", out);
    try { if (window.SAGA) window.SAGA.activity.log("assistant", "dokk", text.slice(0, 60)); } catch {}
    return out;
  }
  throw new Error("Avbrutt: for mange verktøyrunder.");
}

window.SAGACHAT = { send, History, contextText };
})();
