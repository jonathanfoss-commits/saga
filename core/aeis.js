/* AEIS – Adaptive Executive Intelligence System
 * Moduler: Store, Roles, Scoring, LLM, Engine, Ledger, Radar, SelfReview, UI.
 * Kontrakter: se ARCHITECTURE.md. Ingen modul utenom LLM gjør nettverkskall.
 */
"use strict";

/* ================= Store ================= */
const Store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    if (key === "aeis_roles" || key === "aeis_ledger") { try { Backup.maybeAuto(); } catch (_) {} }
  },
  /* Kanonisk saga_api_key med fallback til legacy jarvis_api_key; dobbel-skriv for bakoverkompatibilitet */
  get apiKey() { return localStorage.getItem("saga_api_key") || localStorage.getItem("jarvis_api_key") || ""; },
  set apiKey(v) { localStorage.setItem("saga_api_key", v); localStorage.setItem("jarvis_api_key", v); },
  get profile() { return localStorage.getItem("aeis_profile") || ""; },
  set profile(v) {
    localStorage.setItem("aeis_profile", v);
    try { Backup.maybeAuto(); } catch (_) {}
  },
  exportAll() {
    return JSON.stringify({
      aeis_roles: this.get("aeis_roles", null),
      aeis_ledger: this.get("aeis_ledger", []),
      aeis_profile: this.profile,
      exported: new Date().toISOString(),
    }, null, 2);
  },
  importAll(json) {
    const d = JSON.parse(json);
    if (d.aeis_roles) this.set("aeis_roles", d.aeis_roles);
    if (d.aeis_ledger) this.set("aeis_ledger", d.aeis_ledger);
    if (typeof d.aeis_profile === "string") this.profile = d.aeis_profile;
  },
};

/* ================= Roles ================= */
const DEFAULT_ROLES = [
  ["ceo", "CEO", "Helhetsansvar. Syntetiserer alle analyser, veier motstridende syn etter fortjent autoritet, konkluderer og eier handlingsplanen."],
  ["cso", "Chief Strategy Officer", "Langsiktig strategi, posisjonering, varige konkurransefortrinn, timing, første prinsipper-analyse av markedsstruktur."],
  ["cfo", "Chief Financial Officer", "Kapitalallokering, kontantstrøm, enhetsøkonomi, finansieringsstruktur, avkastningskrav, nedsiderisiko i tall."],
  ["coo", "Chief Operations Officer", "Gjennomførbarhet, drift, prosesser, flaskehalser, ressursbehov, operasjonell skalerbarhet."],
  ["ctaio", "Chief Technology & AI Officer", "Teknologivalg, AI-muligheter, automatisering, teknisk gjeld, byggbarhet, teknologisk medvind/motvind."],
  ["growth", "Growth Director", "Distribusjon, kundeanskaffelse, kanaler, prising, vekstmotorer, CAC/LTV-logikk."],
  ["product", "Product Director", "Produkt–marked-tilpasning, brukerbehov, differensiering, produktrisiko, minste testbare versjon."],
  ["invest", "Investment Director", "Investeringsperspektiv: forventet avkastning, porteføljetenkning, alternativkostnad, exit-muligheter, asymmetri."],
  ["people", "Human Capital Director", "Team, kompetansebehov, nøkkelpersonrisiko, insentiver, organisasjonsdesign, eierens tid og energi."],
  ["legal", "Legal & Risk Director", "Juridisk risiko, regulatorisk eksponering, kontrakter, compliance, omdømmerisiko, verstefallsansvar."],
  ["data", "Data & Intelligence Director", "Datagrunnlag, statistisk holdbarhet, hva som er målbart, hvilke data som mangler, kvantifisering av usikkerhet."],
  ["innovation", "Innovation Director", "Nye muligheter, teknologiskift, forretningsmodellinnovasjon, det ingen andre i rommet ser."],
  ["devil", "Devil's Advocate", "Angrip konklusjonene. Finn svake data, utestede antakelser, gruppetenkning og undervurdert risiko. Vetorett."],
];

const Roles = {
  all() {
    let roles = Store.get("aeis_roles", null);
    if (!roles) {
      roles = DEFAULT_ROLES.map(([id, title, mandate]) => ({
        id, title, mandate, active: true, temporary: false, track: { n: 0, brierSum: 0 },
      }));
      Store.set("aeis_roles", roles);
    }
    return roles;
  },
  save(roles) { Store.set("aeis_roles", roles); },
  active() { return this.all().filter((r) => r.active); },
  analysts() { return this.active().filter((r) => r.id !== "devil" && r.id !== "ceo"); },
  byId(id) { return this.all().find((r) => r.id === id); },
  add(title, mandate, temporary = false) {
    const roles = this.all();
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "rolle";
    let unique = id, n = 2;
    while (roles.some((r) => r.id === unique)) unique = id + "_" + n++;
    const role = { id: unique, title, mandate, active: true, temporary, track: { n: 0, brierSum: 0 } };
    roles.push(role);
    this.save(roles);
    return role;
  },
  retire(id) {
    const roles = this.all().map((r) => (r.id === id ? { ...r, active: false } : r));
    this.save(roles);
  },
  update(id, patch) {
    const roles = this.all().map((r) => (r.id === id ? { ...r, ...patch } : r));
    this.save(roles);
  },
};

/* ================= Scoring ================= */
const Scoring = {
  weightOf(role) {
    if (!role || !role.track || role.track.n === 0) return 1.0;
    const avg = role.track.brierSum / role.track.n;
    return Math.min(2.0, Math.max(0.5, 0.25 / (0.05 + avg)));
  },
  recordOutcome(roleId, predictedP, outcome01) {
    const role = Roles.byId(roleId);
    if (!role || typeof predictedP !== "number") return;
    const brier = Math.pow(predictedP - outcome01, 2);
    const history = [...(role.track.history || []), { p: predictedP, o: outcome01, at: new Date().toISOString() }].slice(-20);
    Roles.update(roleId, { track: { n: role.track.n + 1, brierSum: role.track.brierSum + brier, history } });
  },
};

/* ================= LLM ================= */
const AEIS_MODEL = () => localStorage.getItem("jarvis_model") || "claude-opus-4-8";
const MODEL_FAST = "claude-sonnet-5";
/* Smart routing: bredde (framing/analyser/post-mortem/radar) på Sonnet,
 * dybde (Devil's Advocate + CEO-syntese) på toppmodellen. "quality" = alt på toppmodellen. */
const ROUTING = () => localStorage.getItem("aeis_routing") || "smart";
function modelFor(kind) {
  if (ROUTING() === "quality") return AEIS_MODEL();
  return (kind === "devil" || kind === "synthesis") ? AEIS_MODEL() : MODEL_FAST;
}
/* USD per MTok [input, output]; cache-skriving 1.25×input, cache-lesing 0.1×input */
const PRICES = { "claude-opus-4-8": [5, 25], "claude-sonnet-5": [3, 15] };
function usageCost(usage, model) {
  const [pin, pout] = PRICES[model] || PRICES["claude-opus-4-8"];
  return ((usage.input_tokens || 0) * pin
    + (usage.cache_creation_input_tokens || 0) * pin * 1.25
    + (usage.cache_read_input_tokens || 0) * pin * 0.1
    + (usage.output_tokens || 0) * pout) / 1e6;
}

const PHILOSOPHY = `Du er en modul i AEIS – eierens Adaptive Executive Intelligence System.
GRUNNLOV (overstyrer alt annet):
- Du skal ha rett, ikke være hyggelig. Si tydelig fra når data motsier eierens antakelser. Vær villig til å være uenig. Bekreft aldri en idé fordi eieren liker den.
- Gjett aldri. Fyll aldri hull. Vær aldri enig uten begrunnelse. Si heller «Det finnes ikke nok informasjon» enn å finne på et svar.
- Uttrykk aldri større sikkerhet enn dataene tilsier. All vurdering graderes: høy/middels/lav sikkerhet, med sannsynlighetsestimat der det er meningsfullt.
- Resonner fra første prinsipper: bryt problemet ned til fundamentale fakta før konklusjon. Ikke kopier etablerte sannheter ukritisk.
- Beslutningshierarki: 1) verifiserbare fakta, 2) eierens egne data, 3) historiske resultater, 4) statistiske modeller, 5) logisk resonnement, 6) ekspertvurdering, 7) intuisjon.
- Optimaliser for: langsiktig nettoverdi, bærekraftig verdiskaping, kapitalavkastning, læring, beslutningskvalitet, konkurransefortrinn, frihet, skalerbarhet.
- Optimaliser ALDRI for: aktivitet, antall prosjekter, kortsiktig omsetning, ego eller kompleksitet.
Svar på norsk.`;

const LLM = {
  /* Kostnadsmåler: nullstilles av Engine per beslutning, akkumuleres på hvert kall */
  meter: null,
  resetMeter() { this.meter = { usd: 0, in: 0, out: 0, cacheRead: 0, calls: 0 }; return this.meter; },
  debugLog: [],
  async call({ kind = "generic", system, user, schema, tools, maxTokens = 8192, onStatus }) {
    if (!Store.apiKey) throw new Error("Ingen API-nøkkel. Lim inn under SYSTEM-fanen.");
    const model = modelFor(kind);
    let messages = [{ role: "user", content: user }];
    for (let round = 0; round < 6; round++) {
      const body = {
        model,
        max_tokens: maxTokens,
        // Delt, cachebart prefiks (grunnlov + eierprofil + lærdommer) + modulspesifikk instruks
        system: [
          { type: "text", text: PHILOSOPHY + "\n\n" + ownerContext(), cache_control: { type: "ephemeral" } },
          { type: "text", text: system },
        ],
        messages,
      };
      if (schema) body.output_config = { format: { type: "json_schema", schema } };
      if (tools) body.tools = tools;
      const res = await this._post(body);
      const u = res.usage || {};
      if (this.meter) {
        this.meter.usd += usageCost(u, model);
        this.meter.in += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        this.meter.cacheRead += u.cache_read_input_tokens || 0;
        this.meter.out += u.output_tokens || 0;
        this.meter.calls++;
      }
      if (location.search.includes("debug")) {
        this.debugLog.unshift({ at: new Date().toISOString(), kind, model, stop: res.stop_reason, usage: u });
        this.debugLog.length = Math.min(this.debugLog.length, 30);
        console.log("[AEIS debug]", kind, model, res);
      }
      if (res.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: res.content }];
        if (onStatus) onStatus("arbeider videre …");
        continue;
      }
      if (res.stop_reason === "refusal") throw new Error("Forespørselen ble avvist av modellen.");
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      if (schema) {
        try { return { json: JSON.parse(text), usage: res.usage }; }
        catch (e) { throw new Error("Klarte ikke å tolke strukturert svar: " + e.message); }
      }
      return { text, usage: res.usage };
    }
    throw new Error("Avbrutt: for mange fortsettelsesrunder.");
  },
  async _post(body, attempt = 0) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Store.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        return this._post(body, attempt + 1);
      }
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (_) {}
      throw new Error(`API-feil ${res.status}. ${detail}`);
    }
    return res.json();
  },
};

/* Begrenset parallellitet for styrekallene */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/* ================= JSON-skjemaer (modulkontrakter) ================= */
const SCHEMAS = {
  framing: {
    type: "object",
    properties: {
      problem: { type: "string" },
      unknowns: { type: "array", items: { type: "string" } },
      data_needed: { type: "array", items: { type: "string" } },
      selected_roles: { type: "array", items: { type: "string" } },
      temporary_experts: { type: "array", items: {
        type: "object",
        properties: { title: { type: "string" }, mandate: { type: "string" } },
        required: ["title", "mandate"], additionalProperties: false } },
      rationale: { type: "string" },
    },
    required: ["problem", "unknowns", "data_needed", "selected_roles", "temporary_experts", "rationale"],
    additionalProperties: false,
  },
  analysis: {
    type: "object",
    properties: {
      position: { type: "string" },
      assumptions: { type: "array", items: {
        type: "object",
        properties: { claim: { type: "string" }, confidence: { type: "string", enum: ["høy", "middels", "lav"] } },
        required: ["claim", "confidence"], additionalProperties: false } },
      risks: { type: "array", items: { type: "string" } },
      data_gaps: { type: "array", items: { type: "string" } },
      recommendation: { type: "string" },
      certainty: { type: "string", enum: ["høy", "middels", "lav"] },
      probability_success: { anyOf: [{ type: "number" }, { type: "null" }] },
      needs_more_info: { type: "boolean" },
    },
    required: ["position", "assumptions", "risks", "data_gaps", "recommendation", "certainty", "probability_success", "needs_more_info"],
    additionalProperties: false,
  },
  devil: {
    type: "object",
    properties: {
      objections: { type: "array", items: { type: "string" } },
      untested_assumptions: { type: "array", items: { type: "string" } },
      groupthink_signals: { type: "array", items: { type: "string" } },
      risk_underestimated: { type: "boolean" },
      veto: { type: "boolean" },
      veto_reason: { type: "string" },
    },
    required: ["objections", "untested_assumptions", "groupthink_signals", "risk_underestimated", "veto", "veto_reason"],
    additionalProperties: false,
  },
  premortem: {
    type: "object",
    properties: {
      failure_story: { type: "string" },
      causes: { type: "array", items: { type: "string" } },
      missed_signals: { type: "array", items: { type: "string" } },
      mitigations: { type: "array", items: { type: "string" } },
    },
    required: ["failure_story", "causes", "missed_signals", "mitigations"],
    additionalProperties: false,
  },
  synthesis: {
    type: "object",
    properties: {
      summary: { type: "string" },
      disagreements: { type: "array", items: { type: "string" } },
      scenarios: { type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, probability: { type: "number" }, outcome: { type: "string" }, value_estimate: { type: "string" } },
        required: ["name", "probability", "outcome", "value_estimate"], additionalProperties: false } },
      expected_value_reasoning: { type: "string" },
      outside_view: { type: "string" },
      recommendation: { type: "string" },
      certainty: { type: "string", enum: ["høy", "middels", "lav"] },
      probability_success: { anyOf: [{ type: "number" }, { type: "null" }] },
      action_plan: { type: "array", items: { type: "string" } },
      assumptions_to_track: { type: "array", items: {
        type: "object",
        properties: { claim: { type: "string" }, test: { type: "string" }, review_horizon: { type: "string" } },
        required: ["claim", "test", "review_horizon"], additionalProperties: false } },
    },
    required: ["summary", "disagreements", "scenarios", "expected_value_reasoning", "outside_view", "recommendation", "certainty", "probability_success", "action_plan", "assumptions_to_track"],
    additionalProperties: false,
  },
  postmortem: {
    type: "object",
    properties: {
      what_worked: { type: "array", items: { type: "string" } },
      what_failed: { type: "array", items: { type: "string" } },
      assumptions_right: { type: "array", items: { type: "string" } },
      assumptions_wrong: { type: "array", items: { type: "string" } },
      process_improvements: { type: "array", items: { type: "string" } },
      lesson: { type: "string" },
    },
    required: ["what_worked", "what_failed", "assumptions_right", "assumptions_wrong", "process_improvements", "lesson"],
    additionalProperties: false,
  },
};

/* ================= Ledger ================= */
const Ledger = {
  list() { return Store.get("aeis_ledger", []); },
  save(list) { Store.set("aeis_ledger", list); },
  get(id) { return this.list().find((d) => d.id === id); },
  add(record) {
    const list = this.list();
    list.unshift(record);
    this.save(list.slice(0, 200));
    /* Speil til SAGAs felles aktivitetslogg */
    try { if (window.SAGA) window.SAGA.activity.log("aeis", record.radar ? "radar" : "beslutning", record.title || "(uten tittel)", record.id); } catch (_) {}
  },
  update(id, patch) {
    this.save(this.list().map((d) => (d.id === id ? { ...d, ...patch } : d)));
  },
  lessons(n = 5) {
    return this.list()
      .filter((d) => d.postmortem && d.postmortem.lesson)
      .slice(0, n)
      .map((d) => `- [${d.title}] ${d.postmortem.lesson}`);
  },
  /* Falsifiserbare antakelser fra CEO-syntesen som ikke er fulgt opp enda */
  openAssumptions() {
    const out = [];
    for (const d of this.list()) {
      if (!d.synthesis || d.outcome) continue;
      const checks = d.assumptionChecks || {};
      (d.synthesis.assumptions_to_track || []).forEach((a, i) => {
        if (!checks[i]) out.push({ decisionId: d.id, decisionTitle: d.title, index: i, ...a, decidedAt: d.at });
      });
    }
    return out;
  },
  toggleAssumption(id, index) {
    const d = this.get(id);
    if (!d) return;
    const checks = { ...(d.assumptionChecks || {}) };
    if (checks[index]) delete checks[index];
    else checks[index] = { at: new Date().toISOString() };
    this.update(id, { assumptionChecks: checks });
  },
  async registerOutcome(id, successPct, notes, onStatus) {
    const decision = this.get(id);
    if (!decision) throw new Error("Fant ikke beslutningen.");
    const outcome01 = Math.max(0, Math.min(1, successPct / 100));
    // 1) Kalibreringsscoring av hver deltakende agent
    for (const a of decision.analyses || []) {
      if (typeof a.probability_success === "number") {
        Scoring.recordOutcome(a.roleId, a.probability_success, outcome01);
      }
    }
    // 2) Post-Mortem-kall → varig lærdom
    if (onStatus) onStatus("Kjører post-mortem …");
    const { json } = await LLM.call({
      kind: "postmortem",
      system: "Du er AEIS' post-mortem-modul. Analyser nøkternt og lær maksimalt av utfallet.",
      user: `BESLUTNING: ${decision.title}\n\nCEO-ANBEFALINGEN VAR:\n${JSON.stringify(decision.synthesis, null, 2)}\n\nAGENTENES ANALYSER:\n${JSON.stringify((decision.analyses || []).map(a => ({ rolle: a.roleTitle, anbefaling: a.recommendation, p: a.probability_success })), null, 2)}\n\nFAKTISK UTFALL: ${successPct}% suksess.\nEIERENS NOTATER: ${notes || "(ingen)"}\n\nGjennomfør post-mortem: hva fungerte, hva feilet, hvilke antakelser var riktige/gale, hvilke prosessforbedringer bør gjøres, og formuler ÉN kort, generaliserbar lærdom («lesson») som systemet skal huske i fremtidige beslutninger.`,
      schema: SCHEMAS.postmortem,
      maxTokens: 4096,
    });
    this.update(id, { outcome: { successPct, notes, at: new Date().toISOString() }, postmortem: json });
    return json;
  },
};

/* ================= Engine ================= */
function ownerContext() {
  const profile = Store.profile;
  const lessons = Ledger.lessons(5);
  let ctx = "";
  if (profile) ctx += `OM EIEREN (mål, portefølje, kontekst):\n${profile}\n\n`;
  if (lessons.length) ctx += `VARIGE LÆRDOMMER FRA TIDLIGERE BESLUTNINGER (post-mortems):\n${lessons.join("\n")}\n\n`;
  return ctx;
}

const Engine = {
  /* Grovt kostnadsanslag FØR en beslutning kjøres (USD) */
  estimateCost() {
    const prefixTok = Math.round((PHILOSOPHY.length + Store.profile.length + 800) / 3.5);
    const analysts = Math.min(Math.max(Roles.analysts().length, 2), 5);
    const calls = [
      ["framing", prefixTok + 1500, 900],
      ...Array.from({ length: analysts }, () => ["analysis", prefixTok + 1200, 1100]),
      ["devil", prefixTok + 2500, 900],
      ["premortem", prefixTok + 1500, 900],
      ["synthesis", prefixTok + 4000, 2200],
    ];
    let usd = 0;
    for (const [kind, tin, tout] of calls) {
      const [pin, pout] = PRICES[modelFor(kind)] || PRICES["claude-opus-4-8"];
      usd += (tin * pin + tout * pout) / 1e6;
    }
    return { usd, calls: calls.length, routing: ROUTING() };
  },
  async runDecision(title, context, onProgress) {
    const say = (step, detail) => onProgress && onProgress(step, detail);
    LLM.resetMeter();
    const decision = {
      id: "d" + Date.now(),
      title,
      context,
      at: new Date().toISOString(),
      rounds: 1,
    };

    /* Steg 1–4: definer problemet, ukjente, data, deltakere */
    say("framing", "Definerer problemet og velger relevante eksperter …");
    const roster = Roles.analysts().map((r) => `${r.id}: ${r.title} – ${r.mandate} (autoritetsvekt ${Scoring.weightOf(r).toFixed(2)}×)`).join("\n");
    const framing = (await LLM.call({
      kind: "framing",
      system: `Du er AEIS' framing-modul. Adaptiv intelligens: ingen agent skal delta bare fordi den eksisterer – velg KUN roller som faktisk tilfører denne saken noe, og utelat resten. Foreslå midlertidige eksperter (title+mandate) bare hvis saken krever kompetanse styret mangler.`,
      user: `SAK: ${title}\n\nKONTEKST FRA EIEREN:\n${context || "(ingen)"}\n\nTILGJENGELIG STYRE:\n${roster}\n\nDefiner problemet presist, list hva som er ukjent, hvilke data som trengs, velg deltakere (bruk id-ene), og foreslå eventuelle midlertidige eksperter.`,
      schema: SCHEMAS.framing,
      maxTokens: 4096,
    })).json;
    decision.framing = framing;

    /* Midlertidige eksperter opprettes for saken */
    const tempRoles = (framing.temporary_experts || []).slice(0, 3).map((e) => Roles.add(e.title, e.mandate, true));
    const participantIds = [...new Set([...(framing.selected_roles || []), ...tempRoles.map((r) => r.id)])];
    let participants = participantIds.map((id) => Roles.byId(id)).filter(Boolean);
    if (!participants.length) participants = Roles.analysts().slice(0, 4);
    say("participants", participants.map((p) => p.title));

    /* Steg 5–6: uavhengige analyser (parallelt, isolert) */
    const analyze = async (role, extra) => {
      say("role_start", role.id);
      const { json } = await LLM.call({
        kind: "analysis",
        system: `Du er ${role.title} i AEIS' Executive Board. Ditt mandat: ${role.mandate}\nDu arbeider UAVHENGIG – du ser ikke de andres analyser. Analyser saken utelukkende fra ditt mandat. Sett probability_success (0–1) KUN hvis du reelt kan estimere den, ellers null og needs_more_info=true.`,
        user: `SAK (presisert av framing-modulen): ${framing.problem}\n\nKJENTE UKJENTE: ${framing.unknowns.join("; ") || "(ingen)"}\n\nEIERENS KONTEKST:\n${context || "(ingen)"}${extra || ""}`,
        schema: SCHEMAS.analysis,
        maxTokens: 4096,
      });
      say("role_done", role.id);
      return { roleId: role.id, roleTitle: role.title, weight: Scoring.weightOf(role), ...json };
    };
    decision.analyses = await pool(participants, 3, (r) => analyze(r));

    /* Steg 7–8 + Devil's Advocate med vetorett */
    say("devil", "Devil's Advocate gransker analysene …");
    const devilCall = async () => (await LLM.call({
      kind: "devil",
      system: `Du er Devil's Advocate i AEIS. Din eneste jobb: angrip. Finn undervurdert risiko, utestede antakelser, svake data og gruppetenkning. Du har VETORETT: sett veto=true KUN hvis risiko er vesentlig undervurdert, antakelser ikke er testet, data er for svake, eller gruppetenkning preger analysene – da kreves ny analyserunde.`,
      user: `SAK: ${framing.problem}\n\nSTYRETS ANALYSER:\n${JSON.stringify(decision.analyses.map(a => ({ rolle: a.roleTitle, posisjon: a.position, antakelser: a.assumptions, anbefaling: a.recommendation, sikkerhet: a.certainty, p: a.probability_success })), null, 2)}`,
      schema: SCHEMAS.devil,
      maxTokens: 4096,
    })).json;
    decision.devil = await devilCall();

    if (decision.devil.veto) {
      say("veto", decision.devil.veto_reason);
      decision.rounds = 2;
      const objections = `\n\nDEVIL'S ADVOCATE HAR NEDLAGT VETO MOT FORRIGE RUNDE. Innvendinger du MÅ adressere eksplisitt:\n- ${decision.devil.objections.join("\n- ")}\nUtestede antakelser: ${decision.devil.untested_assumptions.join("; ")}`;
      decision.analyses = await pool(participants, 3, (r) => analyze(r, objections));
      decision.devilRound2 = await devilCall();
    }

    /* Steg 9: Pre-Mortem */
    say("premortem", "Pre-mortem: antar katastrofe om to år …");
    decision.premortem = (await LLM.call({
      kind: "premortem",
      system: "Du er AEIS' pre-mortem-modul.",
      user: `SAK: ${framing.problem}\n\nSTYRETS FORELØPIGE RETNING:\n${decision.analyses.map(a => `${a.roleTitle}: ${a.recommendation}`).join("\n")}\n\nANTA: «Om to år viste dette seg å være en katastrofal beslutning.» Fortell historien om hvorfor, hva som sannsynligvis gikk galt, hvilke faresignaler som ble oversett, og hvordan risikoen kan reduseres nå.`,
      schema: SCHEMAS.premortem,
      maxTokens: 4096,
    })).json;

    /* Steg 10–14: scenarier, sannsynligheter, EV, CEO-syntese, handlingsplan */
    say("synthesis", "CEO syntetiserer …");
    decision.synthesis = (await LLM.call({
      kind: "synthesis",
      system: `Du er CEO i AEIS. Syntetiser styrets arbeid til en beslutning. Vekt agentene etter fortjent autoritet (oppgitt per analyse) – men fakta trumfer autoritet. Fremhev reelle uenigheter, bygg alternative scenarier med sannsynligheter som summerer til ~1, resonner om forventet verdi, gi en anbefaling med gradert sikkerhet, en konkret handlingsplan, og definer falsifiserbare antakelser som skal følges opp (med test og tidshorisont). I outside_view: angi utenfra-perspektivet (base rate) – hvor ofte lykkes tiltak av denne typen generelt, og hva gjør at denne saken avviker fra grunnraten (om noe)? Vær ærlig hvis riktig svar er «ikke gjør dette» eller «for lite informasjon».`,
      user: `SAK: ${framing.problem}\nUKJENTE: ${framing.unknowns.join("; ")}\n\nANALYSER (med autoritetsvekt):\n${JSON.stringify(decision.analyses.map(a => ({ rolle: a.roleTitle, vekt: a.weight, posisjon: a.position, anbefaling: a.recommendation, sikkerhet: a.certainty, p: a.probability_success, antakelser: a.assumptions, risikoer: a.risks, datamangler: a.data_gaps })), null, 2)}\n\nDEVIL'S ADVOCATE:\n${JSON.stringify(decision.devilRound2 || decision.devil, null, 2)}\n\nPRE-MORTEM:\n${JSON.stringify(decision.premortem, null, 2)}`,
      schema: SCHEMAS.synthesis,
      maxTokens: 8192,
    })).json;

    /* Midlertidige eksperter avvikles etter saken (dynamisk organisasjon) */
    for (const t of tempRoles) Roles.retire(t.id);

    if (LLM.meter) decision.cost = { ...LLM.meter, usd: Math.round(LLM.meter.usd * 10000) / 10000 };
    Ledger.add(decision);
    say("done", decision.id);
    return decision;
  },
};

/* ================= Radar (proaktivitet) ================= */
const Radar = {
  get lastRun() { return localStorage.getItem("aeis_radar_last") || ""; },
  hoursSince() {
    const t = Date.parse(this.lastRun);
    return isNaN(t) ? Infinity : (Date.now() - t) / 36e5;
  },
  latest() { return Ledger.list().find((d) => d.radar); },
  /* Del radar-teksten i funn på [MULIGHET]/[RISIKO]/[ENDRING]-markørene */
  parseFindings(text) {
    const out = [];
    let current = null;
    for (const line of (text || "").split("\n")) {
      const m = line.match(/\[(MULIGHET|RISIKO|ENDRING)\]/);
      if (m) {
        if (current) out.push(current);
        current = { tag: m[1], title: line.replace(/\[(MULIGHET|RISIKO|ENDRING)\]/, "").replace(/^[\s\d.:•*-]+/, "").trim().slice(0, 120), body: line };
      } else if (current) {
        if (line.trim() === "" && current.body.length > 40) { out.push(current); current = null; }
        else current.body += "\n" + line;
      }
    }
    if (current) out.push(current);
    return out.slice(0, 10);
  },
  async run(onStatus) {
    localStorage.setItem("aeis_radar_last", new Date().toISOString());
    const recent = Ledger.list().slice(0, 5).map((d) => `- ${d.title}: ${d.synthesis?.recommendation || "(pågår)"}`).join("\n");
    const { text } = await LLM.call({
      kind: "radar",
      system: `Du er AEIS' radar-modul – systemets proaktive øyne. Du venter ikke på oppgaver: du oppdager muligheter, varsler risiko, foreslår investeringer, nye selskaper, produkter, automatisering og nye inntektskilder, og identifiserer markedsendringer – FØR eieren spør. Bruk websøk aktivt for ferske signaler. Vær konkret og prioriter etter forventet verdi. Marker hvert funn med [MULIGHET], [RISIKO] eller [ENDRING], og angi sikkerhetsgrad.`,
      user: `SISTE BESLUTNINGER I HOVEDBOKEN:\n${recent || "(tom)"}\n\nKjør en radar-skanning nå: 3–6 konkrete, prioriterte funn med kort begrunnelse og anbefalt neste steg for hvert.`,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      maxTokens: 8192,
      onStatus,
    });
    Ledger.add({ id: "r" + Date.now(), title: "Radar-skanning", at: new Date().toISOString(), radar: text });
    return text;
  },
};

/* ================= SelfReview (selvforbedring) ================= */
const SelfReview = {
  async run() {
    let arch = "";
    try { arch = await (await fetch("ARCHITECTURE.md")).text(); } catch (_) {}
    const roles = Roles.all().map((r) => `${r.title} [${r.active ? "aktiv" : "avviklet"}${r.temporary ? ", midlertidig" : ""}] vekt ${Scoring.weightOf(r).toFixed(2)}× (${r.track.n} utfall)`).join("\n");
    const stats = { beslutninger: Ledger.list().filter((d) => d.synthesis).length, medUtfall: Ledger.list().filter((d) => d.outcome).length, lærdommer: Ledger.lessons(99).length };
    const { text } = await LLM.call({
      kind: "selfreview",
      system: `Du er AEIS' selvforbedringsmodul. Ingen del av systemet er «ferdig». Evaluer strukturen, reglene, beslutningsprosessene og svakhetene ærlig – kritiser gjerne arkitekturen hardt der den fortjener det. Vurder om dagens roller bør endres, slås sammen, spesialiseres eller suppleres basert på faktisk bruk. Foreslå en konkret, prioritert migreringsplan for de viktigste forbedringene.`,
      user: `GJELDENDE ARKITEKTUR:\n${arch || "(utilgjengelig)"}\n\nGJELDENDE ROLLER OG FORTJENT AUTORITET:\n${roles}\n\nBRUKSSTATISTIKK: ${JSON.stringify(stats)}\n\nGjennomfør en selvevaluering: svakheter, forbedringer, rolleendringer, og migreringsplan.`,
      maxTokens: 8192,
    });
    return text;
  },
};

/* ================= Backup (umistelig hukommelse) =================
 * localStorage er skjørt: én Safari-opprydding sletter hovedbok, vekter og læring.
 * Løsning uten egen server: alt krypteres PÅ ENHETEN (AES-GCM, nøkkel avledet av
 * passordfrasen med PBKDF2) og lagres i en PRIVAT GitHub-gist. GitHub ser kun chiffer.
 */
const Backup = {
  get token() { return localStorage.getItem("aeis_gh_token") || ""; },
  set token(v) { localStorage.setItem("aeis_gh_token", v); },
  get pass() { return localStorage.getItem("aeis_backup_pass") || ""; },
  set pass(v) { localStorage.setItem("aeis_backup_pass", v); },
  get gistId() { return localStorage.getItem("aeis_gist_id") || ""; },
  set gistId(v) { localStorage.setItem("aeis_gist_id", v); },
  get auto() { return localStorage.getItem("aeis_backup_auto") === "1"; },
  set auto(v) { localStorage.setItem("aeis_backup_auto", v ? "1" : "0"); },
  get last() { return localStorage.getItem("aeis_backup_last") || ""; },
  configured() { return !!(this.token && this.pass); },

  _b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  },
  _unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); },
  async _key(pass, salt) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, base,
      { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },
  async encrypt(pass, text) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._key(pass, salt);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
    return JSON.stringify({ v: 1, kdf: "PBKDF2-SHA256-210000", salt: this._b64(salt), iv: this._b64(iv), data: this._b64(data) });
  },
  async decrypt(pass, blob) {
    const { salt, iv, data } = JSON.parse(blob);
    const key = await this._key(pass, this._unb64(salt));
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: this._unb64(iv) }, key, this._unb64(data));
      return new TextDecoder().decode(plain);
    } catch (_) { throw new Error("Feil passordfrase (eller korrupt backup)."); }
  },

  _headers() { return { Authorization: "Bearer " + this.token, Accept: "application/vnd.github+json", "Content-Type": "application/json" }; },
  async backup() {
    if (!this.configured()) throw new Error("Sky-backup krever GitHub-token og passordfrase (SYSTEM-fanen).");
    const enc = await this.encrypt(this.pass, Store.exportAll());
    const files = { "aeis-backup.enc.json": { content: enc } };
    let res = null;
    if (this.gistId) {
      res = await fetch("https://api.github.com/gists/" + this.gistId, { method: "PATCH", headers: this._headers(), body: JSON.stringify({ files }) });
      if (res.status === 404) { this.gistId = ""; res = null; }
    }
    if (!res) {
      res = await fetch("https://api.github.com/gists", {
        method: "POST", headers: this._headers(),
        body: JSON.stringify({ description: "AEIS kryptert backup (kan kun leses med passordfrasen)", public: false, files }),
      });
    }
    if (!res.ok) throw new Error("GitHub-feil " + res.status + (res.status === 401 || res.status === 403 ? " – sjekk at tokenet har gist-tilgang." : "."));
    const j = await res.json();
    if (j.id) this.gistId = j.id;
    localStorage.setItem("aeis_backup_last", new Date().toISOString());
    return this.gistId;
  },
  async restore() {
    if (!this.token || !this.gistId) throw new Error("Ingen sky-backup å hente (mangler token/gist).");
    const res = await fetch("https://api.github.com/gists/" + this.gistId, { headers: this._headers() });
    if (!res.ok) throw new Error("GitHub-feil " + res.status + ".");
    const j = await res.json();
    const file = j.files && j.files["aeis-backup.enc.json"];
    if (!file) throw new Error("Fant ikke backup-filen i gisten.");
    let content = file.content;
    if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
    Store.importAll(await this.decrypt(this.pass, content));
  },

  _timer: null,
  /* Debounced auto-backup – kalles når roller/hovedbok endres */
  maybeAuto() {
    if (!this.auto || !this.configured()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.backup().catch((e) => console.warn("Auto-backup feilet:", e.message)), 8000);
  },
};

/* Eksponer modulene (også for tester) */
window.AEIS = { Store, Roles, Scoring, LLM, Engine, Ledger, Radar, SelfReview, Backup, SCHEMAS, pool };
