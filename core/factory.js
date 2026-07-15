/* Company Factory – AI-drevet startup-studio. Modul i SAGA.
 * Moduler: Store, LLM, Board, Pipeline, Projects, Intake, Evaluation, Planner, Brief, Demo, SelfReview.
 * Kontrakter: se ARCHITECTURE.md. Kun LLM gjør nettverkskall.
 * Navnerom: cf_*. Leser (skriver ALDRI) jarvis_api_key, jarvis_model, aeis_roles, aeis_profile.
 */
"use strict";

/* ================= Store ================= */
const Store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  },
  set(key, value) {
    if (!key.startsWith("cf_")) throw new Error("Store skriver kun til cf_*-navnerommet: " + key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      /* Auto-synk (5.0 B3): merk lokale endringer; synk-laget skyver dem til
       * sannhetslaget når det passer. Konfig-nøklene trigges ikke. */
      if (key !== "cf_sync" && key !== "cf_publish") {
        localStorage.setItem("saga_dirty", "1");
        if (typeof window !== "undefined" && window.CF && window.CF.AutoSync) window.CF.AutoSync.poke();
      }
    } catch (e) {
      /* localStorage-kvoten (~5 MB) er en kjent plattformbegrensning – gi et handlingsrettet råd i stedet for en kryptisk feil */
      if (e && (e.name === "QuotaExceededError" || e.code === 22)) {
        throw new Error(`Lagringen er full (nettleserens localStorage-kvote). Frigjør plass: eksporter og slett avsluttede prosjekter, eller last ned og fjern genererte nettsted-/app-pakker fra gamle prosjekter. Se lagringsbruk under SYSTEM. (${key})`);
      }
      throw e;
    }
  },
  /* Omtrentlig lagringsbruk per cf_*-nøkkel, i kB – vises under SYSTEM */
  usage() {
    const rows = [];
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("cf_")) continue;
      const kb = Math.round(((localStorage.getItem(key) || "").length * 2) / 1024);
      total += kb;
      rows.push({ key, kb });
    }
    rows.sort((a, b) => b.kb - a.kb);
    return { rows, totalKb: total, limitKb: 5120 };
  },
  remove(key) {
    if (!key.startsWith("cf_")) throw new Error("Store sletter kun i cf_*-navnerommet: " + key);
    localStorage.removeItem(key);
  },
  /* Lese-kontrakter mot plattformen (aldri skriv). Kanonisk saga_* med legacy-fallback jarvis_*. */
  get apiKey() { return localStorage.getItem("saga_api_key") || localStorage.getItem("jarvis_api_key") || ""; },
  get model() { return localStorage.getItem("saga_model") || localStorage.getItem("jarvis_model") || "claude-opus-4-8"; },
  get ownerProfile() { return localStorage.getItem("aeis_profile") || ""; },
  aeisRoles() { return this.get("aeis_roles", null); },

  projectIds() { return this.get("cf_index", []); },
  loadProject(id) { return this.get("cf_project_" + id, null); },
  saveProject(p) {
    p.updatedAt = new Date().toISOString();
    this.set("cf_project_" + p.id, p);
    const idx = this.projectIds();
    if (!idx.includes(p.id)) { idx.push(p.id); this.set("cf_index", idx); }
    return p;
  },
  deleteProject(id) {
    this.remove("cf_project_" + id);
    this.set("cf_index", this.projectIds().filter((x) => x !== id));
  },
  exportProject(id) { return JSON.stringify(this.loadProject(id), null, 2); },
  exportAll() {
    const projects = {};
    for (const id of this.projectIds()) projects["cf_project_" + id] = this.loadProject(id);
    return JSON.stringify({
      cf_index: this.projectIds(), ...projects,
      cf_lessons: this.get("cf_lessons", []), cf_library: this.get("cf_library", []),
      cf_activity: this.get("cf_activity", []), cf_costs: this.get("cf_costs", []),
      /* Repo-oppsettet følger synken (ALDRI PAT-en): en ny enhet trenger bare
       * PAT + datarepo – resten av oppsettet kommer med første pull. */
      cf_config: { syncRepo: Sync.config().repo, pubRepo: Publish.config().repo, thinkRepo: Think.config().repo },
      exported: new Date().toISOString(),
    }, null, 2);
  },
  importAll(json) {
    const d = JSON.parse(json);
    if (Array.isArray(d.cf_index)) this.set("cf_index", d.cf_index);
    for (const k of Object.keys(d)) if (k.startsWith("cf_project_")) this.set(k, d[k]);
    for (const k of ["cf_lessons", "cf_library", "cf_activity", "cf_costs"]) if (Array.isArray(d[k])) this.set(k, d[k]);
    /* Tomme verdier overskriver aldri lokalt oppsett – eldre eksporter mangler cf_config helt */
    const cfg = d.cf_config;
    if (cfg && typeof cfg === "object") {
      if (typeof cfg.syncRepo === "string" && cfg.syncRepo) Sync.saveConfig({ repo: cfg.syncRepo });
      if (typeof cfg.pubRepo === "string" && cfg.pubRepo) Publish.saveConfig({ repo: cfg.pubRepo });
      if (typeof cfg.thinkRepo === "string" && cfg.thinkRepo) Think.saveConfig({ repo: cfg.thinkRepo });
    }
  },
};

/* ================= LLM (eneste nettverkspunkt) ================= */
const PHILOSOPHY = `Du er en modul i Company Factory – eierens AI-drevne startup-studio for digitale selskaper med gjentakende inntekter.
GRUNNLOV (overstyrer alt annet):
- Vær kritisk, ikke hyggelig. Forsøk å AVKREFTE idéen før du anbefaler å bygge den. Bygg aldri videre på en åpenbart dårlig idé fordi eieren nevnte den.
- Gjett aldri. Skill eksplisitt mellom fakta, eierens påstander, systemets antakelser og usikkerhet. Marker hva som krever ekstern validering.
- Uttrykk aldri større sikkerhet enn dataene tilsier. Ingen falsk presisjon i scoring – forklar hva som trekker opp og ned.
- Finn den billigste og raskeste testen av de mest kritiske antakelsene før tung utvikling anbefales.
- Unngå tomme fraser («revolusjonerende», «sømløs», «kraftig», «fremtidens») uten bevis. Copy og vurderinger skal være konkrete og basert på kundens problem.
- Tilpass omfanget til idéen: små idéer får små planer. Ikke maksimal kompleksitet for kompleksitetens skyld.
- Optimaliser for: rask læring, betalingsvilje, gjentakende inntekt, høy automatisering, lave faste kostnader, enkel drift, enkel avvikling av dårlige idéer.
Svar på norsk.`;

const LLM = {
  /* Settes av modulene før kall – gir kostnadsmåleren prosjekt/modul-kontekst */
  context: null,
  async call({ system, user, schema, tools, maxTokens = 8192, onStatus }) {
    if (!Store.apiKey) throw new Error("Ingen API-nøkkel. Lim inn under SYSTEM-fanen (deles med SAGA/AEIS).");
    let messages = [{ role: "user", content: user }];
    for (let round = 0; round < 6; round++) {
      const body = { model: Store.model, max_tokens: maxTokens, system: PHILOSOPHY + "\n\n" + system, messages };
      if (schema) body.output_config = { format: { type: "json_schema", schema } };
      if (tools) body.tools = tools;
      const res = await this._post(body);
      if (res.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: res.content }];
        if (onStatus) onStatus("arbeider videre …");
        continue;
      }
      if (res.stop_reason === "refusal") throw new Error("Forespørselen ble avvist av modellen.");
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      Costs.add(res.usage, (this.context && this.context.label) || "system", this.context && this.context.projectId);
      if (schema) {
        try { return { json: JSON.parse(text), usage: res.usage }; }
        catch (e) { throw new Error("Klarte ikke å tolke strukturert svar: " + e.message); }
      }
      return { text, usage: res.usage };
    }
    throw new Error("Avbrutt: for mange fortsettelsesrunder.");
  },
  async _post(body, attempt = 0) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": Store.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
      });
    } catch (_) {
      throw new Error("Fikk ikke kontakt med Claude API. Er du i FORHÅNDSVISNINGEN på claude.ai? Den blokkerer alle eksterne kall – AI-kjøringer krever den ekte appen (GitHub Pages eller lokalt).");
    }
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        return this._post(body, attempt + 1);
      }
      let detail = "";
      try { detail = (await res.json()).error?.message || ""; } catch (_) {}
      /* Friksjon logges strukturert til forbedringsloopen (saga improve) */
      try { if (window.SAGA) window.SAGA.improve.log("factory", `Claude API-feil ${res.status} i modul ${(LLM.context && LLM.context.label) || "ukjent"}`, detail.slice(0, 120)); } catch (_) {}
      throw new Error(`API-feil ${res.status}. ${detail}`);
    }
    return res.json();
  },
};

/* Begrenset parallellitet (kostnadskontroll) */
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/* ================= Board (gjenbruker AEIS' Executive Board) ================= */
const FACTORY_ROLES = [
  ["studio", "Studioleder", "Helhetsansvar for fabrikken: porteføljeprioritering, ressursbruk, kill-disiplin. Syntetiserer og eier beslutningen."],
  ["marked", "Markedsanalytiker", "Markedsstørrelse, vekst, konkurrenter, alternativer, hvorfor noen vil bytte, kopieringsrisiko."],
  ["kunde", "Kundeinnsiktsansvarlig", "Hvem har problemet, hvor smertefullt og hyppig er det, hvem betaler, kundereise, churn-signaler."],
  ["merkevare", "Merkevarestrateg", "Posisjonering, kategori, løfte, differensiering, navn, tone of voice, troverdig kommunikasjon uten tomme fraser."],
  ["ux", "UX- og produktdesigner", "Viktigste brukerreise, onboarding, aktivering, konverteringsflyt, mobilbruk, tilgjengelighet."],
  ["vekst", "Growth/Performance", "Kanalvalg etter målgruppe og økonomi, CAC/LTV-logikk, SEO, betalt trafikk, produktdrevet vekst, eksperimentkø."],
  ["salg", "Salgsansvarlig", "Om produktet krever salg: ICP, pipeline, outreach, kvalifisering, innvendinger, ekspansjon."],
  ["drift", "Drift og kundeservice", "Supportbelastning, kunnskapsbase, hendelseshåndtering, hvor mye manuelt arbeid modellen krever."],
  ["sikkerhet", "Sikkerhetsansvarlig", "Autentisering, tilgangsstyring, persondata, betalingssikkerhet, tredjepartsrisiko, misbruk."],
];

const Board = {
  /* Roster = AEIS' aktive roller (med fortjent autoritet) ∪ fabrikkens fagroller. Lese-kun mot AEIS. */
  roster() {
    const factory = FACTORY_ROLES.map(([id, title, mandate]) => ({ id: "cf_" + id, title, mandate, weight: 1.0, source: "factory" }));
    const aeis = (Store.aeisRoles() || [])
      .filter((r) => r.active && !r.temporary)
      .map((r) => ({
        id: r.id, title: r.title, mandate: r.mandate, source: "aeis",
        weight: !r.track || r.track.n === 0 ? 1.0 : Math.min(2.0, Math.max(0.5, 0.25 / (0.05 + r.track.brierSum / r.track.n))),
      }));
    return [...aeis, ...factory];
  },
  byId(id) { return this.roster().find((r) => r.id === id); },
};

/* ================= Pipeline (kanoniske faser + porter) ================= */
const PHASES = [
  { n: 0,  id: "inntak",      title: "Inntak av idé",          gate: "idé godkjent for analyse" },
  { n: 1,  id: "vurdering",   title: "Idévurdering",           gate: "analyse godkjent for validering" },
  { n: 2,  id: "validering",  title: "Markedsvalidering",      gate: "validering godkjent for MVP" },
  { n: 3,  id: "forretning",  title: "Forretningsmodell",      gate: "modell godkjent" },
  { n: 4,  id: "strategi",    title: "Selskap og strategi",    gate: "strategi godkjent" },
  { n: 5,  id: "produkt",     title: "Produktdefinisjon",      gate: "MVP-omfang godkjent" },
  { n: 6,  id: "merkevare",   title: "Merkevare",              gate: "identitet godkjent" },
  { n: 7,  id: "arkitektur",  title: "Teknisk arkitektur",     gate: "arkitektur godkjent" },
  { n: 8,  id: "bygg",        title: "Bygg produkt og nettside", gate: "MVP godkjent for produksjon" },
  { n: 9,  id: "betaling",    title: "Betaling og abonnement", gate: "kommersiell flyt godkjent (eier)" },
  { n: 10, id: "juridisk",    title: "Juridisk, personvern og sikkerhet", gate: "juridisk kontroll (krever fagperson)" },
  { n: 11, id: "marketing",   title: "Markedsføring",          gate: "kanalstrategi godkjent" },
  { n: 12, id: "salg",        title: "Salg",                   gate: "salgssystem godkjent" },
  { n: 13, id: "drift",       title: "Drift og kundeservice",  gate: "driftsklar" },
  { n: 14, id: "qa",          title: "Testing og kvalitetssikring", gate: "produksjon godkjent for lansering" },
  { n: 15, id: "lansering",   title: "Lansering",              gate: "offentlig lansering (eier)" },
  { n: 16, id: "vekst",       title: "Måling og vekst",        gate: "lansering godkjent for skalering" },
];

/* Handlinger som ALLTID krever eierens eksplisitte godkjenning */
const OWNER_GATE_ACTIONS = [
  "betalinger og kjøp", "publisering", "domenekjøp/-overføring", "juridisk bindende handlinger",
  "selskapsregistrering", "bank og skatt", "sletting av kritiske data", "masseutsendelse av kommunikasjon",
  "opprettelse av kostbare tjenester", "høyrisiko produksjonsendringer", "bruk av sensitive data", "offentlig lansering",
];

/* Modenhetsnivåer – «ferdig selskap» brukes aldri */
const MATURITY = ["prototype", "MVP", "beta", "produksjonsklart", "lanseringsklart digitalt produkt", "juridisk etablert selskap", "operativ virksomhet", "kommersielt validert virksomhet"];

/* ================= Projects ================= */
const Projects = {
  create(name, ideaText, opts = {}) {
    Activity.log("prosjekt", "Prosjekt opprettet: " + name);
    const id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const p = {
      id, name, idea: ideaText, test: !!opts.test,
      status: "idé", phase: 0, maturity: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      assumptions: [], decisions: [], phasePlan: null,
      intake: null, evaluation: null, brief: null, gates: {},
    };
    return Store.saveProject(p);
  },
  list() {
    return Store.projectIds().map((id) => Store.loadProject(id)).filter(Boolean)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },
  get(id) { return Store.loadProject(id); },
  save(p) { return Store.saveProject(p); },
  remove(id) { Store.deleteProject(id); },
  logDecision(p, entry) {
    p.decisions.unshift({
      id: "b" + Date.now().toString(36) + p.decisions.length,
      at: new Date().toISOString(),
      role: entry.role || "system",
      phase: entry.phase ?? p.phase,
      decision: entry.decision,
      options: entry.options || [],
      rationale: entry.rationale || "",
      assumptions: entry.assumptions || [],
      risk: entry.risk || "",
      revisit: entry.revisit || "",
      byOwner: !!entry.byOwner,
    });
    Activity.log(entry.byOwner ? "eier" : "beslutning", `[${p.name}] ${entry.decision}`, p.id);
    return Store.saveProject(p);
  },
  logAssumptions(p, list, source) {
    for (const a of list || []) {
      p.assumptions.push({ claim: a.claim, type: a.type || "antakelse", confidence: a.confidence || "middels", source: source || "system", at: new Date().toISOString() });
    }
    return Store.saveProject(p);
  },
  /* Kapitaldisiplin: budsjett settes av eier; utgifter logges; total kost = AI + manuelle utgifter */
  setBudget(p, amountNok) {
    const amount = Math.max(0, Math.round(+amountNok || 0));
    p.budgetNok = amount;
    this.logDecision(p, { role: "eier", byOwner: true, decision: `BUDSJETT SATT: ${amount} kr`, rationale: "Valideringsbudsjett besluttet av eier. Forbruk over budsjett utløser kill-varsel." });
    return Store.saveProject(p);
  },
  addExpense(p, { amount, what, category }) {
    const amt = Math.round(+amount || 0);
    if (!amt || !what) throw new Error("Utgift krever beløp og beskrivelse.");
    p.expenses = p.expenses || [];
    p.expenses.push({ at: new Date().toISOString(), amount: amt, what, category: category || "annet" });
    Activity.log("utgift", `[${p.name}] ${amt} kr – ${what}`, p.id);
    return Store.saveProject(p);
  },
  /* Total prosjektkost i NOK: manuelle utgifter (faktiske) + AI-kost (estimat) */
  totalCost(p) {
    const manual = (p.expenses || []).reduce((s, e) => s + e.amount, 0);
    const ai = Costs.totals(p.id).estimateNok;
    return { manual, ai, total: Math.round((manual + ai) * 100) / 100 };
  },

  /* Kill-disiplin: parker/avslutt/reaktiver er eksplisitte, loggede eierhandlinger.
     Allerede brukt tid er aldri et argument for å fortsette. */
  park(p, reason) {
    p.pausedFrom = p.status;
    p.status = "parkert";
    this.logDecision(p, { role: "eier", byOwner: true, decision: "PROSJEKT PARKERT", rationale: reason || "(ingen begrunnelse oppgitt)", revisit: "Revurderes ved ny informasjon" });
    return Store.saveProject(p);
  },
  kill(p, reason) {
    p.status = "avsluttet";
    this.logDecision(p, { role: "eier", byOwner: true, decision: "PROSJEKT AVSLUTTET (KILL)", rationale: reason || "(ingen begrunnelse oppgitt)" });
    return Store.saveProject(p);
  },
  reactivate(p) {
    if (p.status !== "parkert" && p.status !== "avsluttet") throw new Error("Kun parkerte eller avsluttede prosjekter kan reaktiveres.");
    p.status = p.pausedFrom || "idé";
    delete p.pausedFrom;
    this.logDecision(p, { role: "eier", byOwner: true, decision: "PROSJEKT REAKTIVERT", rationale: "Eieren har gjenopptatt prosjektet." });
    return Store.saveProject(p);
  },
  approveGate(p, gateId, byOwner = true) {
    p.gates[gateId] = { approved: true, byOwner, at: new Date().toISOString() };
    this.logDecision(p, { decision: "PORT GODKJENT: " + gateId, rationale: byOwner ? "Eksplisitt eiergodkjenning." : "Autogodkjent lavrisikoport.", byOwner });
    return Store.saveProject(p);
  },
};

/* ================= JSON-skjemaer (modulkontrakter) ================= */
const ASSUMPTION_TYPES = ["fakta", "påstand_fra_eier", "antakelse", "ukjent", "krever_ekstern_validering"];
const DECISIONS = ["stopp", "parker", "valider_mer", "endre_konsept", "prototype", "mvp", "lansering"];
const CRITERIA = [
  ["problemsmerte", 1.5], ["frekvens", 0.7], ["betalingsvilje", 1.5], ["markedsstørrelse", 1.2],
  ["differensiering", 1.2], ["gjennomførbarhet", 1.0], ["tid_til_marked", 0.8],
  ["gjentakende_inntekt", 1.3], ["automatiseringsgrad", 1.0], ["forsvarbarhet", 0.8],
];

const strArr = { type: "array", items: { type: "string" } };
const SCHEMAS = {
  intake: {
    type: "object",
    properties: {
      summary: { type: "string" },
      problem: { type: "string" },
      target_group: { type: "string" },
      solution: { type: "string" },
      willingness_to_pay: { type: "string" },
      market: { type: "string" },
      channel: { type: "string" },
      subscription_potential: { type: "string" },
      assumptions: { type: "array", items: {
        type: "object",
        properties: { claim: { type: "string" }, type: { type: "string", enum: ASSUMPTION_TYPES }, confidence: { type: "string", enum: ["høy", "middels", "lav"] } },
        required: ["claim", "type", "confidence"], additionalProperties: false } },
      unknowns: strArr,
      decision_changing_questions: strArr,
    },
    required: ["summary", "problem", "target_group", "solution", "willingness_to_pay", "market", "channel", "subscription_potential", "assumptions", "unknowns", "decision_changing_questions"],
    additionalProperties: false,
  },
  framing: {
    type: "object",
    properties: { case_summary: { type: "string" }, selected_roles: strArr, rationale: { type: "string" } },
    required: ["case_summary", "selected_roles", "rationale"], additionalProperties: false,
  },
  verdict: {
    type: "object",
    properties: {
      position: { type: "string" },
      strongest_argument_against: { type: "string" },
      top_risks: strArr,
      recommendation: { type: "string" },
      certainty: { type: "string", enum: ["høy", "middels", "lav"] },
      probability_success: { anyOf: [{ type: "number" }, { type: "null" }] },
    },
    required: ["position", "strongest_argument_against", "top_risks", "recommendation", "certainty", "probability_success"],
    additionalProperties: false,
  },
  synthesis: {
    type: "object",
    properties: {
      summary: { type: "string" },
      scorecard: { type: "array", items: {
        type: "object",
        properties: { criterion: { type: "string", enum: CRITERIA.map(([c]) => c) }, score: { type: "number" }, reasoning: { type: "string" } },
        required: ["criterion", "score", "reasoning"], additionalProperties: false } },
      score_drivers_up: strArr,
      score_drivers_down: strArr,
      weaknesses: strArr,
      improvements: strArr,
      alternative_ideas: strArr,
      scenarios: { type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, probability: { type: "number" }, outcome: { type: "string" }, value_estimate: { type: "string" } },
        required: ["name", "probability", "outcome", "value_estimate"], additionalProperties: false } },
      decision: { type: "string", enum: DECISIONS },
      decision_rationale: { type: "string" },
      certainty: { type: "string", enum: ["høy", "middels", "lav"] },
      assumptions_to_validate: { type: "array", items: {
        type: "object",
        properties: { claim: { type: "string" }, test: { type: "string" }, threshold: { type: "string" }, cost_estimate: { type: "string" }, horizon: { type: "string" } },
        required: ["claim", "test", "threshold", "cost_estimate", "horizon"], additionalProperties: false } },
    },
    required: ["summary", "scorecard", "score_drivers_up", "score_drivers_down", "weaknesses", "improvements", "alternative_ideas", "scenarios", "decision", "decision_rationale", "certainty", "assumptions_to_validate"],
    additionalProperties: false,
  },
  validation: {
    type: "object",
    properties: {
      summary: { type: "string" },
      per_experiment: { type: "array", items: {
        type: "object",
        properties: { claim: { type: "string" }, verdict: { type: "string", enum: ["bestått", "ikke_bestått", "uklart"] }, implication: { type: "string" } },
        required: ["claim", "verdict", "implication"], additionalProperties: false } },
      decision: { type: "string", enum: DECISIONS },
      decision_rationale: { type: "string" },
      certainty: { type: "string", enum: ["høy", "middels", "lav"] },
      next_steps: strArr,
    },
    required: ["summary", "per_experiment", "decision", "decision_rationale", "certainty", "next_steps"],
    additionalProperties: false,
  },
  landing: {
    type: "object",
    properties: {
      seo_title: { type: "string" },
      seo_description: { type: "string" },
      headline: { type: "string" },
      subheadline: { type: "string" },
      pain_points: strArr,
      value_props: { type: "array", items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"], additionalProperties: false } },
      offer: { type: "string" },
      price_line: { type: "string" },
      cta_text: { type: "string" },
      faq: { type: "array", items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"], additionalProperties: false } },
      honest_disclaimer: { type: "string" },
    },
    required: ["seo_title", "seo_description", "headline", "subheadline", "pain_points", "value_props", "offer", "price_line", "cta_text", "faq", "honest_disclaimer"],
    additionalProperties: false,
  },
  bizmodel: {
    type: "object",
    properties: {
      value_prop: { type: "string" },
      icp: { type: "string" },
      buyer: { type: "string" },
      user: { type: "string" },
      revenue_model: { type: "string" },
      plans: { type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, price_month: { type: "number" }, price_year: { type: "number" }, target_share: { type: "number" }, includes: strArr },
        required: ["name", "price_month", "price_year", "target_share", "includes"], additionalProperties: false } },
      free_tier: { type: "string" },
      trial: { type: "string" },
      assumptions: { type: "object",
        properties: {
          visitors_m1: { type: "number" }, visitor_growth_pct_m: { type: "number" },
          signup_rate: { type: "number" }, paid_conversion: { type: "number" },
          churn_monthly: { type: "number" }, cac: { type: "number" },
          fixed_costs_monthly: { type: "number" }, variable_cost_per_user: { type: "number" },
        },
        required: ["visitors_m1", "visitor_growth_pct_m", "signup_rate", "paid_conversion", "churn_monthly", "cac", "fixed_costs_monthly", "variable_cost_per_user"],
        additionalProperties: false },
      assumption_notes: strArr,
      risks: strArr,
    },
    required: ["value_prop", "icp", "buyer", "user", "revenue_model", "plans", "free_tier", "trial", "assumptions", "assumption_notes", "risks"],
    additionalProperties: false,
  },
  site: {
    type: "object",
    properties: {
      brand: { type: "object",
        properties: {
          name: { type: "string" }, slogan: { type: "string" }, tone: { type: "string" },
          color_primary: { type: "string" }, color_ink: { type: "string" }, color_bg: { type: "string" }, color_accent: { type: "string" },
        },
        required: ["name", "slogan", "tone", "color_primary", "color_ink", "color_bg", "color_accent"],
        additionalProperties: false },
      seo_title: { type: "string" },
      seo_description: { type: "string" },
      hero_headline: { type: "string" },
      hero_sub: { type: "string" },
      cta_text: { type: "string" },
      features: { type: "array", items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" } },
        required: ["title", "text"], additionalProperties: false } },
      how_it_works: strArr,
      pricing_faq: { type: "array", items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"], additionalProperties: false } },
      faq: { type: "array", items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"], additionalProperties: false } },
      about_story: { type: "string" },
      about_values: strArr,
      terms_outline: strArr,
      privacy_outline: strArr,
    },
    required: ["brand", "seo_title", "seo_description", "hero_headline", "hero_sub", "cta_text", "features", "how_it_works", "pricing_faq", "faq", "about_story", "about_values", "terms_outline", "privacy_outline"],
    additionalProperties: false,
  },
  strategy: {
    type: "object",
    properties: {
      working_name: { type: "string" },
      name_alternatives: strArr,
      name_criteria: strArr,
      positioning: { type: "string" },
      category: { type: "string" },
      promise: { type: "string" },
      differentiation: { type: "string" },
      mission: { type: "string" },
      vision: { type: "string" },
      values: strArr,
      strategic_priorities: strArr,
      moat_options: strArr,
      plan_90_days: strArr,
      plan_12_months: strArr,
      direction_3_years: { type: "string" },
      risks: strArr,
      not_doing: strArr,
    },
    required: ["working_name", "name_alternatives", "name_criteria", "positioning", "category", "promise", "differentiation", "mission", "vision", "values", "strategic_priorities", "moat_options", "plan_90_days", "plan_12_months", "direction_3_years", "risks", "not_doing"],
    additionalProperties: false,
  },
  legal: {
    type: "object",
    properties: {
      company_form_notes: { type: "string" },
      requirements: { type: "array", items: {
        type: "object",
        properties: { area: { type: "string" }, requirement: { type: "string" }, applies_because: { type: "string" }, must_be_verified_by_professional: { type: "boolean" } },
        required: ["area", "requirement", "applies_because", "must_be_verified_by_professional"], additionalProperties: false } },
      privacy_data: { type: "array", items: {
        type: "object",
        properties: { data: { type: "string" }, purpose: { type: "string" }, legal_basis: { type: "string" }, retention: { type: "string" } },
        required: ["data", "purpose", "legal_basis", "retention"], additionalProperties: false } },
      consumer_rights: strArr,
      marketing_rules: strArr,
      vat_tax_notes: { type: "string" },
      action_list: strArr,
    },
    required: ["company_form_notes", "requirements", "privacy_data", "consumer_rights", "marketing_rules", "vat_tax_notes", "action_list"],
    additionalProperties: false,
  },
  marketing: {
    type: "object",
    properties: {
      core_message: { type: "string" },
      channel_strategy: { type: "array", items: {
        type: "object",
        properties: { channel: { type: "string" }, why: { type: "string" }, priority: { type: "number" }, cac_hypothesis: { type: "string" } },
        required: ["channel", "why", "priority", "cac_hypothesis"], additionalProperties: false } },
      content_calendar: { type: "array", items: {
        type: "object",
        properties: { week: { type: "number" }, theme: { type: "string" }, format: { type: "string" }, channel: { type: "string" } },
        required: ["week", "theme", "format", "channel"], additionalProperties: false } },
      ad_concepts: { type: "array", items: {
        type: "object",
        properties: { channel: { type: "string" }, hook: { type: "string" }, body: { type: "string" } },
        required: ["channel", "hook", "body"], additionalProperties: false } },
      email_sequence: { type: "array", items: {
        type: "object",
        properties: { day: { type: "number" }, subject: { type: "string" }, purpose: { type: "string" } },
        required: ["day", "subject", "purpose"], additionalProperties: false } },
      launch_plan: strArr,
      experiment_queue: { type: "array", items: {
        type: "object",
        properties: { hypothesis: { type: "string" }, test: { type: "string" }, metric: { type: "string" }, threshold: { type: "string" } },
        required: ["hypothesis", "test", "metric", "threshold"], additionalProperties: false } },
      budget_notes: { type: "string" },
    },
    required: ["core_message", "channel_strategy", "content_calendar", "ad_concepts", "email_sequence", "launch_plan", "experiment_queue", "budget_notes"],
    additionalProperties: false,
  },
  techarch: {
    type: "object",
    properties: {
      summary: { type: "string" },
      choices: { type: "array", items: {
        type: "object",
        properties: {
          area: { type: "string" },
          choice: { type: "string" },
          why: { type: "string" },
          alternatives_considered: strArr,
          monthly_cost_estimate: { type: "string" },
          lock_in_risk: { type: "string", enum: ["lav", "middels", "høy"] },
          migration_path: { type: "string" },
        },
        required: ["area", "choice", "why", "alternatives_considered", "monthly_cost_estimate", "lock_in_risk", "migration_path"], additionalProperties: false } },
      not_needed_yet: strArr,
      security_notes: strArr,
      total_monthly_cost_estimate: { type: "string" },
      risks: strArr,
    },
    required: ["summary", "choices", "not_needed_yet", "security_notes", "total_monthly_cost_estimate", "risks"],
    additionalProperties: false,
  },
  app: {
    type: "object",
    properties: {
      app_name: { type: "string" },
      welcome_line: { type: "string" },
      onboarding_steps: { type: "array", items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" }, input_label: { type: "string" } },
        required: ["title", "text", "input_label"], additionalProperties: false } },
      dashboard_modules: { type: "array", items: {
        type: "object",
        properties: { title: { type: "string" }, description: { type: "string" }, empty_state: { type: "string" } },
        required: ["title", "description", "empty_state"], additionalProperties: false } },
      settings_items: strArr,
      activation_metric: { type: "string" },
      upgrade_prompt: { type: "string" },
    },
    required: ["app_name", "welcome_line", "onboarding_steps", "dashboard_modules", "settings_items", "activation_metric", "upgrade_prompt"],
    additionalProperties: false,
  },
  ops: {
    type: "object",
    properties: {
      support_channels: strArr,
      faq_seed: { type: "array", items: {
        type: "object",
        properties: { q: { type: "string" }, a: { type: "string" } },
        required: ["q", "a"], additionalProperties: false } },
      reply_templates: { type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, text: { type: "string" } },
        required: ["name", "text"], additionalProperties: false } },
      escalation_rules: strArr,
      incident_runbook: strArr,
      monthly_review_checklist: strArr,
      vendor_list: { type: "array", items: {
        type: "object",
        properties: { vendor: { type: "string" }, purpose: { type: "string" }, cost_note: { type: "string" } },
        required: ["vendor", "purpose", "cost_note"], additionalProperties: false } },
      automation_candidates: strArr,
    },
    required: ["support_channels", "faq_seed", "reply_templates", "escalation_rules", "incident_runbook", "monthly_review_checklist", "vendor_list", "automation_candidates"],
    additionalProperties: false,
  },
  retro: {
    type: "object",
    properties: {
      what_worked: strArr,
      what_failed: strArr,
      wrong_assumptions: strArr,
      process_improvements: strArr,
      reusable: strArr,
      not_reusable: strArr,
      lesson: { type: "string" },
    },
    required: ["what_worked", "what_failed", "wrong_assumptions", "process_improvements", "reusable", "not_reusable", "lesson"],
    additionalProperties: false,
  },
  plan: {
    type: "object",
    properties: {
      phases: { type: "array", items: {
        type: "object",
        properties: {
          phase: { type: "number" }, relevant: { type: "boolean" }, scope: { type: "string" },
          key_deliverables: strArr, first_actions: strArr, stop_criteria: { type: "string" },
          owner_role: { type: "string" }, risks: strArr,
        },
        required: ["phase", "relevant", "scope", "key_deliverables", "first_actions", "stop_criteria", "owner_role", "risks"], additionalProperties: false } },
      sequencing_notes: { type: "string" },
    },
    required: ["phases", "sequencing_notes"], additionalProperties: false,
  },
  brief: {
    type: "object",
    properties: {
      working_name: { type: "string" },
      product_vision: { type: "string" },
      core_problem: { type: "string" },
      core_job: { type: "string" },
      primary_user_journey: { type: "string" },
      mvp_features: { type: "array", items: {
        type: "object",
        properties: { name: { type: "string" }, why: { type: "string" }, acceptance: { type: "string" } },
        required: ["name", "why", "acceptance"], additionalProperties: false } },
      later_features: strArr,
      not_building: strArr,
      data_model_outline: strArr,
      monetization: { type: "object",
        properties: { model: { type: "string" }, price_hypothesis: { type: "string" }, trial: { type: "string" } },
        required: ["model", "price_hypothesis", "trial"], additionalProperties: false },
      launch_channels: strArr,
      success_metrics: { type: "array", items: {
        type: "object",
        properties: { metric: { type: "string" }, target: { type: "string" } },
        required: ["metric", "target"], additionalProperties: false } },
      risks: strArr,
      build_estimate: { type: "string" },
    },
    required: ["working_name", "product_vision", "core_problem", "core_job", "primary_user_journey", "mvp_features", "later_features", "not_building", "data_model_outline", "monetization", "launch_channels", "success_metrics", "risks", "build_estimate"],
    additionalProperties: false,
  },
};

/* ================= Activity (varig hendelsesspor – revisjonsspor for hele fabrikken) ================= */
const Activity = {
  log(type, message, projectId) {
    const list = Store.get("cf_activity", []);
    list.unshift({ id: "a" + Date.now().toString(36) + list.length % 100, at: new Date().toISOString(), type, message, projectId: projectId || null });
    Store.set("cf_activity", list.slice(0, 300));
    /* Speil til SAGAs felles aktivitetslogg (D7 – cf_activity forblir fabrikkens eget revisjonsspor) */
    try { if (window.SAGA) window.SAGA.activity.log("factory", type, message, projectId); } catch (_) {}
  },
  list(n = 50) { return Store.get("cf_activity", []).slice(0, n); },
};

/* ================= Costs (kostnadsmåler – usage fra hvert LLM-kall akkumuleres) ================= */
/* Rater er KONFIGURERBARE ESTIMATER (USD per million tokens + USD→NOK). Juster ved modellbytte. */
const COST_RATES = { inPerMTok: 15, outPerMTok: 75, usdToNok: 10.5 };
const Costs = {
  add(usage, label, projectId) {
    if (!usage) return;
    const list = Store.get("cf_costs", []);
    list.unshift({ at: new Date().toISOString(), label: label || "ukjent", projectId: projectId || null, in: usage.input_tokens || 0, out: usage.output_tokens || 0 });
    Store.set("cf_costs", list.slice(0, 500));
  },
  estimateNok(inTok, outTok) {
    return ((inTok / 1e6) * COST_RATES.inPerMTok + (outTok / 1e6) * COST_RATES.outPerMTok) * COST_RATES.usdToNok;
  },
  totals(projectId) {
    const rows = Store.get("cf_costs", []).filter((r) => !projectId || r.projectId === projectId);
    const inTok = rows.reduce((s, r) => s + r.in, 0), outTok = rows.reduce((s, r) => s + r.out, 0);
    return { calls: rows.length, in: inTok, out: outTok, estimateNok: Math.round(this.estimateNok(inTok, outTok) * 100) / 100 };
  },
};

/* ================= Lessons (varige lærdommer på tvers av prosjekter) ================= */
const Lessons = {
  list() { return Store.get("cf_lessons", []); },
  add(lesson, projectName) {
    const list = this.list();
    list.unshift({ lesson, project: projectName, at: new Date().toISOString() });
    Store.set("cf_lessons", list.slice(0, 20));
  },
  latest(n = 5) { return this.list().slice(0, n).map((l) => `- [${l.project}] ${l.lesson}`); },
};

function ownerContext() {
  const profile = Store.ownerProfile;
  const lessons = Lessons.latest(5);
  let ctx = profile ? `OM EIEREN (fra AEIS-profilen):\n${profile}\n\n` : "";
  if (lessons.length) ctx += `VARIGE LÆRDOMMER FRA TIDLIGERE FABRIKKPROSJEKTER (retro):\n${lessons.join("\n")}\n\n`;
  return ctx;
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ================= ZIP-writer (ukomprimert/STORE – ingen avhengigheter) ================= */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/* makeZip({ "index.html": "<html>…", … }) → Uint8Array (gyldig .zip, STORE-metode) */
function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const name of Object.keys(files)) {
    const nameB = enc.encode(name);
    const data = enc.encode(files[name]);
    const crc = crc32(data);
    /* Local file header: signatur, versjon 20, flagg 0x0800 (UTF-8 navn), metode 0, tid/dato 0 */
    const lfh = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
    chunks.push(lfh, nameB, data);
    central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nameB);
    offset += lfh.length + nameB.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length / 2), ...u16(central.length / 2), ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, eocd]) { out.set(c, pos); pos += c.length; }
  return out;
}

/* ================= Intake (Fase 0) ================= */
const Intake = {
  async run(p, onStatus) {
    LLM.context = { projectId: p.id, label: "inntak" };
    if (onStatus) onStatus("Fase 0: strukturerer idéen …");
    const { json } = await LLM.call({
      system: `Du er Company Factorys inntaksmodul (Fase 0). Trekk ut problem, målgruppe, mulig løsning, betalingsvilje, marked, kanal og abonnementspotensial fra eierens idé. Skill knallhardt mellom fakta, eierens påstander, antakelser, ukjente og forhold som krever ekstern validering. Lag rimelige antakelser der informasjon mangler (marker dem), og still KUN spørsmål som faktisk kan endre beslutningen eller løsningen. Ikke stopp prosessen fordi informasjon mangler.`,
      user: `${ownerContext()}IDÉ FRA EIEREN:\n${p.idea}`,
      schema: SCHEMAS.intake,
      maxTokens: 4096,
    });
    p.intake = json;
    p.phase = 1;
    Projects.logAssumptions(p, json.assumptions, "inntak");
    Projects.logDecision(p, { phase: 0, decision: "Idé strukturert – godkjent for analyse", rationale: json.summary, role: "inntaksmodul" });
    return Projects.save(p);
  },
};

/* ================= Evaluation (Fase 1: styret + scoring) ================= */
const Evaluation = {
  totalScore(scorecard) {
    const w = Object.fromEntries(CRITERIA);
    let sum = 0, max = 0;
    for (const row of scorecard || []) {
      const weight = w[row.criterion] ?? 1;
      sum += Math.max(0, Math.min(10, row.score)) * weight;
      max += 10 * weight;
    }
    return max ? Math.round((sum / max) * 100) : 0;
  },

  async run(p, onProgress) {
    const say = (step, detail) => onProgress && onProgress(step, detail);
    if (!p.intake) throw new Error("Kjør inntak (Fase 0) først.");
    const caseText = `SAK: ${p.name}\nPROBLEM: ${p.intake.problem}\nMÅLGRUPPE: ${p.intake.target_group}\nLØSNING: ${p.intake.solution}\nBETALINGSVILJE: ${p.intake.willingness_to_pay}\nMARKED: ${p.intake.market}\nKANAL: ${p.intake.channel}\nABONNEMENTSPOTENSIAL: ${p.intake.subscription_potential}\nUKJENTE: ${p.intake.unknowns.join("; ") || "(ingen)"}`;

    /* 1) Framing: velg kun roller som tilfører saken noe */
    LLM.context = { projectId: p.id, label: "idévurdering" };
    say("framing", "Velger relevante fagroller …");
    const roster = Board.roster();
    const framing = (await LLM.call({
      system: `Du er framing-modulen i Company Factory. Velg KUN de 3–6 rollene fra styret som faktisk tilfører DENNE saken noe – ingen deltar av høflighet. Bruk id-ene nøyaktig.`,
      user: `${ownerContext()}${caseText}\n\nTILGJENGELIG STYRE OG FAGROLLER:\n${roster.map((r) => `${r.id}: ${r.title} – ${r.mandate} (vekt ${r.weight.toFixed(2)}×)`).join("\n")}`,
      schema: SCHEMAS.framing,
      maxTokens: 2048,
    })).json;
    let participants = (framing.selected_roles || []).map((id) => Board.byId(id)).filter(Boolean).slice(0, 6);
    if (participants.length < 3) participants = [Board.byId("cf_marked"), Board.byId("cf_kunde"), Board.byId("cf_vekst")].filter(Boolean);
    say("participants", participants.map((r) => r.title));

    /* 2) Isolerte, korte rollevurderinger (ingen rollespill – konkrete verdikter) */
    const verdicts = await pool(participants, 3, async (role) => {
      say("role_start", role.id);
      const { json } = await LLM.call({
        system: `Du er ${role.title}, fagrolle i Company Factorys vurdering (Fase 1). Mandat: ${role.mandate}\nDu arbeider UAVHENGIG og ser ikke de andres vurderinger. Lever en KORT, konkret vurdering fra ditt mandat – ingen generell prosa. Din viktigste jobb er å finne grunnen til at dette IKKE bør bygges, hvis den finnes. Sett probability_success (0–1) kun hvis du reelt kan estimere den, ellers null.`,
        user: `${ownerContext()}${caseText}`,
        schema: SCHEMAS.verdict,
        maxTokens: 2048,
      });
      say("role_done", role.id);
      return { roleId: role.id, roleTitle: role.title, weight: role.weight, ...json };
    });

    /* 3) Kritisk syntese + scoring + beslutning */
    say("synthesis", "Studioleder scorer og beslutter …");
    const synthesis = (await LLM.call({
      system: `Du er studioleder og syntese- og scoringsmodulen i Company Factory. Vei rollene etter oppgitt vekt, men fakta trumfer autoritet. Score idéen 0–10 på HVERT kriterium: ${CRITERIA.map(([c]) => c).join(", ")}. Ingen falsk presisjon – forklar per kriterium. List svakheter, forbedringer og alternative idéer basert på samme innsikt. Lag beste/sannsynlig/dårligste scenario. Konkluder med ÉN beslutning (${DECISIONS.join("|")}) og de mest kritiske antakelsene med billigste test, terskel, kostnad og horisont. Vær ærlig hvis riktig svar er stopp.`,
      user: `${ownerContext()}${caseText}\n\nROLLENES UAVHENGIGE VURDERINGER:\n${JSON.stringify(verdicts.map((v) => ({ rolle: v.roleTitle, vekt: v.weight, posisjon: v.position, sterkeste_motargument: v.strongest_argument_against, risikoer: v.top_risks, anbefaling: v.recommendation, sikkerhet: v.certainty, p: v.probability_success })), null, 2)}`,
      schema: SCHEMAS.synthesis,
      maxTokens: 8192,
    })).json;

    const total = this.totalScore(synthesis.scorecard);
    p.evaluation = { framing, verdicts, synthesis, totalScore: total, at: new Date().toISOString() };
    p.status = { stopp: "avsluttet", parker: "parkert", valider_mer: "validering", endre_konsept: "idé", prototype: "bygging", mvp: "bygging", lansering: "bygging" }[synthesis.decision] || "vurdert";
    p.phase = synthesis.decision === "valider_mer" ? 2 : p.phase;
    p.maturity = null;
    Projects.logAssumptions(p, (synthesis.assumptions_to_validate || []).map((a) => ({ claim: a.claim, type: "krever_ekstern_validering", confidence: "lav" })), "idévurdering");
    Projects.logDecision(p, {
      phase: 1, role: "studioleder",
      decision: `Idévurdering: ${synthesis.decision.toUpperCase()} (score ${total}/100)`,
      options: DECISIONS, rationale: synthesis.decision_rationale,
      risk: (synthesis.score_drivers_down || []).join("; "),
      revisit: synthesis.decision === "parker" ? "Revurderes ved ny informasjon" : "",
    });
    say("done", synthesis.decision);
    return Projects.save(p);
  },
};

/* ================= Experiments (Fase 2: markedsvalidering) ================= */
const Experiments = {
  /* Eksperimentkøen avledes direkte fra de kritiske antakelsene – ingen LLM-kostnad */
  createFrom(p) {
    if (p.experiments && p.experiments.length) return p;
    const src = (p.evaluation && p.evaluation.synthesis.assumptions_to_validate) || [];
    if (!src.length) throw new Error("Ingen kritiske antakelser å validere – kjør idévurdering først.");
    p.experiments = src.map((a, i) => ({
      id: "e" + Date.now().toString(36) + i,
      claim: a.claim, test: a.test, threshold: a.threshold,
      cost_estimate: a.cost_estimate, horizon: a.horizon,
      status: "planlagt", result: "", passed: null, at: null,
    }));
    Projects.logDecision(p, { phase: 2, role: "valideringsmodul", decision: `Eksperimentkø opprettet (${p.experiments.length} tester)`, rationale: "Avledet direkte fra de kritiske antakelsene – billigste test først, terskel definert før resultatet finnes." });
    return Projects.save(p);
  },
  /* Eieren registrerer faktisk resultat mot forhåndsdefinert terskel */
  registerResult(p, expId, result, passed) {
    const e = (p.experiments || []).find((x) => x.id === expId);
    if (!e) throw new Error("Fant ikke eksperimentet.");
    e.result = result; e.passed = !!passed; e.status = "fullført"; e.at = new Date().toISOString();
    Projects.logDecision(p, { phase: 2, role: "eier", byOwner: true, decision: `Eksperiment ${e.passed ? "BESTÅTT" : "IKKE BESTÅTT"}: ${e.claim}`, rationale: `Terskel: ${e.threshold}. Resultat: ${result}` });
    return Projects.save(p);
  },
  /* Valideringsporten: syntetiser resultatene → én beslutning */
  async review(p, onStatus) {
    const done = (p.experiments || []).filter((e) => e.status === "fullført");
    if (!done.length) throw new Error("Ingen fullførte eksperimenter å evaluere.");
    LLM.context = { projectId: p.id, label: "valideringsport" };
    if (onStatus) onStatus("Evaluerer valideringsresultatene …");
    const { json } = await LLM.call({
      system: `Du er valideringsmodulen i Company Factory (Fase 2-porten). Vurder eksperimentresultatene nøkternt mot tersklene som ble satt FØR resultatene fantes. Allerede brukt tid og penger er IKKE et argument for å fortsette. Konkluder med én beslutning (${DECISIONS.join("|")}): bestått validering kan gi prototype/mvp; delvis bestått kan gi endre_konsept eller valider_mer (kun hvis en NY, billig test finnes); ikke bestått skal normalt gi stopp eller parker.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\nIDÉ: ${p.idea}\n\nBESLUTNING FRA IDÉVURDERING: ${p.evaluation.synthesis.decision} (score ${p.evaluation.totalScore}/100)\n\nEKSPERIMENTER OG RESULTATER:\n${JSON.stringify(p.experiments.map((e) => ({ antakelse: e.claim, test: e.test, terskel: e.threshold, status: e.status, resultat: e.result, bestått_iflg_eier: e.passed })), null, 2)}`,
      schema: SCHEMAS.validation,
      maxTokens: 4096,
    });
    p.validation = { ...json, at: new Date().toISOString() };
    p.status = { stopp: "avsluttet", parker: "parkert", valider_mer: "validering", endre_konsept: "idé", prototype: "bygging", mvp: "bygging", lansering: "bygging" }[json.decision] || p.status;
    if (["prototype", "mvp", "lansering"].includes(json.decision)) {
      const next = ((p.phasePlan && p.phasePlan.phases) || []).filter((f) => f.relevant && f.phase > 2).map((f) => f.phase).sort((a, b) => a - b)[0];
      p.phase = next ?? 3;
    }
    Projects.logDecision(p, { phase: 2, role: "valideringsmodul", decision: `Valideringsport: ${json.decision.toUpperCase()}`, options: DECISIONS, rationale: json.decision_rationale });
    return Projects.save(p);
  },
};

/* ================= Landing (falsk-dør-landingsside – fabrikken BYGGER den) ================= */
const Landing = {
  async run(p, opts = {}, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "landingsside" };
    if (onStatus) onStatus("Skriver copy og bygger landingssiden …");
    const { json } = await LLM.call({
      system: `Du er landingsside-modulen i Company Factory. Skriv komplett copy for en falsk-dør-landingsside som tester betalingsvilje FØR produktet bygges. Krav: copy er konkret, troverdig og basert på kundens problem – ingen tomme fraser («revolusjonerende», «sømløs», «kraftig», «fremtidens»). Prisen skal være tydelig (falsk dør uten pris måler ingenting). CTA er venteliste-påmelding. honest_disclaimer skal ærlig si at tjenesten er under utvikling og at påmelding er uforpliktende – vi lurer ikke folk til å tro de kjøper et ferdig produkt. Skriv for målgruppen, på norsk.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nFRA STYRETS VURDERING:\n${JSON.stringify({ svakheter: p.evaluation.synthesis.weaknesses, forbedringer: p.evaluation.synthesis.improvements, antakelser_som_testes: p.evaluation.synthesis.assumptions_to_validate.map((a) => a.claim) }, null, 2)}`,
      schema: SCHEMAS.landing,
      maxTokens: 4096,
    });
    p.landing = { content: json, formEndpoint: opts.formEndpoint || "", html: this.renderHTML(json, { formEndpoint: opts.formEndpoint || "" }), at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 2, role: "landingsside-modul", decision: "Falsk-dør-landingsside generert", rationale: `«${json.headline}» – pris synlig (${json.price_line}), venteliste som CTA.${opts.formEndpoint ? "" : " NB: uten skjema-endepunkt lagres påmeldinger kun i besøkerens nettleser – legg inn f.eks. et Formspree-endepunkt før reell trafikk."}` });
    return Projects.save(p);
  },
  /* Selvstendig, responsiv, deploybar HTML – ingen eksterne avhengigheter */
  renderHTML(c, opts = {}) {
    const e = escHtml;
    const form = opts.formEndpoint
      ? `<form class="wl" action="${e(opts.formEndpoint)}" method="POST"><input type="email" name="email" required placeholder="din@epost.no" aria-label="E-post"><button type="submit">${e(c.cta_text)}</button></form>`
      : `<form class="wl" id="wlForm"><input type="email" id="wlEmail" required placeholder="din@epost.no" aria-label="E-post"><button type="submit">${e(c.cta_text)}</button></form><p class="tiny" id="wlThanks" hidden>Takk! Du står på ventelisten.</p>`;
    return `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(c.seo_title)}</title>
<meta name="description" content="${e(c.seo_description)}">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: c.seo_title, description: c.seo_description, offers: { "@type": "Offer", description: c.price_line, availability: "https://schema.org/PreOrder" } })}<\/script>
<style>
  :root { --ink:#15222e; --muted:#5a6b7a; --accent:#0b6e6e; --bg:#f7f9fa; --card:#ffffff; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); line-height:1.6; }
  main { max-width:720px; margin:0 auto; padding:24px 20px 60px; }
  .hero { text-align:center; padding:48px 0 32px; }
  h1 { font-size:clamp(28px,5vw,40px); line-height:1.2; margin-bottom:14px; }
  .sub { font-size:18px; color:var(--muted); max-width:560px; margin:0 auto 24px; }
  .wl { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
  .wl input { flex:1 1 220px; max-width:320px; padding:13px 14px; font-size:16px; border:1px solid #c8d2da; border-radius:10px; }
  .wl button { padding:13px 22px; font-size:16px; border:0; border-radius:10px; background:var(--accent); color:#fff; cursor:pointer; }
  .price { text-align:center; font-size:17px; margin:14px 0 4px; font-weight:600; }
  .tiny { text-align:center; font-size:13px; color:var(--muted); margin-top:8px; }
  h2 { font-size:20px; margin:40px 0 14px; }
  ul.pains { padding-left:22px; } ul.pains li { margin-bottom:8px; }
  .props { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
  .prop { background:var(--card); border:1px solid #e3e9ee; border-radius:12px; padding:16px; }
  .prop h3 { font-size:15px; margin-bottom:6px; }
  .prop p { font-size:14px; color:var(--muted); }
  details { background:var(--card); border:1px solid #e3e9ee; border-radius:10px; padding:12px 16px; margin-bottom:8px; }
  summary { cursor:pointer; font-weight:600; font-size:15px; }
  details p { margin-top:8px; font-size:14px; color:var(--muted); }
  footer { text-align:center; font-size:12px; color:var(--muted); padding:24px 20px; border-top:1px solid #e3e9ee; }
</style>
</head>
<body>
<main>
  <section class="hero">
    <h1>${e(c.headline)}</h1>
    <p class="sub">${e(c.subheadline)}</p>
    <p class="price">${e(c.price_line)}</p>
    ${form}
    <p class="tiny">${e(c.offer)}</p>
  </section>
  <section><h2>Kjenner du deg igjen?</h2><ul class="pains">${(c.pain_points || []).map((x) => `<li>${e(x)}</li>`).join("")}</ul></section>
  <section><h2>Det du får</h2><div class="props">${(c.value_props || []).map((v) => `<div class="prop"><h3>${e(v.title)}</h3><p>${e(v.text)}</p></div>`).join("")}</div></section>
  <section><h2>Spørsmål og svar</h2>${(c.faq || []).map((f) => `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`).join("")}</section>
</main>
<footer>${e(c.honest_disclaimer)}</footer>
<script>
(function () {
  try { localStorage.setItem("cf_lp_views", (parseInt(localStorage.getItem("cf_lp_views") || "0", 10) + 1) + ""); } catch (_) {}
  var f = document.getElementById("wlForm");
  if (f) f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    try {
      var list = JSON.parse(localStorage.getItem("cf_waitlist") || "[]");
      list.push({ email: document.getElementById("wlEmail").value, at: new Date().toISOString() });
      localStorage.setItem("cf_waitlist", JSON.stringify(list));
    } catch (_) {}
    f.hidden = true;
    document.getElementById("wlThanks").hidden = false;
  });
})();
<\/script>
</body>
</html>`;
  },
};

/* ================= SiteGen (Fase 6+8: fabrikken BYGGER nettstedet) ================= */
const SiteGen = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "nettsted" };
    if (onStatus) onStatus("Bygger nettstedet: merkevare, copy og sider …");
    const plans = p.bizmodel ? p.bizmodel.model.plans : null;
    const { json } = await LLM.call({
      system: `Du er nettsted-modulen i Company Factory (Fase 6+8). Lever merkevare-tokens og komplett sideinnhold for produktets nettsted. Krav: copy er konkret, troverdig og skrevet for målgruppen – ingen tomme fraser («revolusjonerende», «sømløs», «kraftig», «fremtidens»). Farger som hex (god kontrast: ink mot bg). terms_outline og privacy_outline er UTKAST til punkter – de merkes automatisk som «må kvalitetssikres av advokat». Tone tilpasses målgruppen, ikke generisk SaaS.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nMVP-BRIEF:\n${JSON.stringify(p.brief || "(ikke laget – bruk inntaket)", null, 2)}${plans ? `\n\nPRISPLANER (bruk disse eksakt):\n${JSON.stringify(plans, null, 2)}` : ""}`,
      schema: SCHEMAS.site,
      maxTokens: 8192,
    });
    const files = this.renderSite(json, { plans, trial: p.bizmodel ? p.bizmodel.model.trial : "", freeTier: p.bizmodel ? p.bizmodel.model.free_tier : "" });
    p.site = { content: json, files, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 8, role: "nettsted-modul", decision: `Nettsted generert (${Object.keys(files).length} filer)`, rationale: `«${json.hero_headline}» – komplett statisk nettsted klart for deploy. Betalingsknapper er plassholdere til Stripe Payment Links legges inn (eier-port: betaling). Juridiske sider er utkast som krever advokat.` });
    return Projects.save(p);
  },

  /* Deterministisk rendering: delt designsystem fra brand-tokens, ingen eksterne avhengigheter */
  renderSite(c, opts = {}) {
    const e = escHtml;
    const b = c.brand;
    const css = `
  :root { --primary:${e(b.color_primary)}; --ink:${e(b.color_ink)}; --bg:${e(b.color_bg)}; --accent:${e(b.color_accent)}; --muted:#5f6f7d; --card:#ffffff; --line:#e2e8ee; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); line-height:1.65; }
  header { border-bottom:1px solid var(--line); background:var(--card); }
  .nav { max-width:960px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
  .nav .logo { font-weight:700; font-size:18px; color:var(--primary); text-decoration:none; margin-right:auto; }
  .nav a { color:var(--ink); text-decoration:none; font-size:14px; }
  .nav a:hover { color:var(--primary); }
  main { max-width:960px; margin:0 auto; padding:24px 20px 64px; }
  .hero { text-align:center; padding:56px 0 40px; }
  h1 { font-size:clamp(28px,5vw,42px); line-height:1.15; margin-bottom:14px; }
  .sub { font-size:18px; color:var(--muted); max-width:600px; margin:0 auto 26px; }
  .btn { display:inline-block; background:var(--primary); color:#fff; padding:14px 26px; border-radius:10px; text-decoration:none; font-size:16px; font-weight:600; border:0; cursor:pointer; }
  .btn.alt { background:var(--card); color:var(--primary); border:2px solid var(--primary); }
  h2 { font-size:24px; margin:44px 0 16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px; }
  .card h3 { font-size:16px; margin-bottom:8px; }
  .card p { font-size:14px; color:var(--muted); }
  ol.steps { padding-left:24px; } ol.steps li { margin-bottom:10px; }
  .plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; align-items:stretch; }
  .plan { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:22px; display:flex; flex-direction:column; }
  .plan .price { font-size:30px; font-weight:700; color:var(--primary); margin:10px 0 2px; }
  .plan .per { font-size:13px; color:var(--muted); margin-bottom:12px; }
  .plan ul { padding-left:20px; font-size:14px; color:var(--muted); flex:1; margin-bottom:14px; }
  details { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 16px; margin-bottom:8px; }
  summary { cursor:pointer; font-weight:600; font-size:15px; }
  details p { margin-top:8px; font-size:14px; color:var(--muted); }
  .notice { background:#fff7e0; border:1px solid #eedc9a; border-radius:10px; padding:14px 16px; font-size:13px; margin:18px 0; }
  footer { border-top:1px solid var(--line); text-align:center; font-size:13px; color:var(--muted); padding:26px 20px; }
  footer a { color:var(--muted); }`;
    const nav = `<header><div class="nav"><a class="logo" href="index.html">${e(b.name)}</a><a href="pris.html">Pris</a><a href="faq.html">FAQ</a><a href="om.html">Om oss</a></div></header>`;
    const footer = `<footer>© ${e(b.name)} · <a href="vilkar.html">Vilkår</a> · <a href="personvern.html">Personvern</a><br>${e(b.slogan)}</footer>`;
    const shell = (title, desc, body) => `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
<style>${css}</style>
</head>
<body>
${nav}
<main>
${body}
</main>
${footer}
</body>
</html>`;

    const legalNotice = `<div class="notice"><b>Merk:</b> Dette dokumentet er et automatisk generert utkast og er IKKE juridisk kvalitetssikret. Det må gjennomgås og godkjennes av advokat eller annen autorisert fagperson før publisering og bruk.</div>`;
    const plans = opts.plans || [{ name: "Standard", price_month: 0, price_year: 0, target_share: 1, includes: ["Se pris ved lansering"] }];

    const index = shell(c.seo_title, c.seo_description, `
<section class="hero">
  <h1>${e(c.hero_headline)}</h1>
  <p class="sub">${e(c.hero_sub)}</p>
  <a class="btn" href="pris.html">${e(c.cta_text)}</a>
</section>
<section><h2>Det du får</h2><div class="grid">${c.features.map((f) => `<div class="card"><h3>${e(f.title)}</h3><p>${e(f.text)}</p></div>`).join("")}</div></section>
<section><h2>Slik fungerer det</h2><ol class="steps">${c.how_it_works.map((s) => `<li>${e(s)}</li>`).join("")}</ol></section>
<section class="hero"><a class="btn" href="pris.html">${e(c.cta_text)}</a></section>`);

    const pris = shell(`Pris – ${b.name}`, c.seo_description, `
<h1>Pris</h1>
${opts.trial ? `<p class="sub" style="margin:8px 0 20px; text-align:left">${e(opts.trial)}${opts.freeTier ? " · " + e(opts.freeTier) : ""}</p>` : ""}
<div class="plans">${plans.map((pl) => `<div class="plan"><h3>${e(pl.name)}</h3><div class="price">${Math.round(pl.price_month)} kr</div><div class="per">per måned · ${Math.round(pl.price_year)} kr/år</div><ul>${(pl.includes || []).map((i) => `<li>${e(i)}</li>`).join("")}</ul><button class="btn" data-stripe-payment-link="ERSTATT-MED-STRIPE-PAYMENT-LINK" onclick="alert('Betaling aktiveres ved lansering.')">Velg ${e(pl.name)}</button></div>`).join("")}</div>
<div class="notice"><b>Til eieren (fjernes før lansering):</b> knappene over er plassholdere. Opprett produkter i Stripe og lim inn Payment Links i data-stripe-payment-link-attributtene, eller koble til abonnementsflyten. Betaling er en eier-port i Company Factory.</div>
<h2>Spørsmål om pris</h2>${c.pricing_faq.map((f) => `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`).join("")}`);

    const faq = shell(`FAQ – ${b.name}`, c.seo_description, `<h1>Ofte stilte spørsmål</h1>${c.faq.map((f) => `<details><summary>${e(f.q)}</summary><p>${e(f.a)}</p></details>`).join("")}`);

    const om = shell(`Om oss – ${b.name}`, c.seo_description, `<h1>Om ${e(b.name)}</h1><p style="max-width:640px">${e(c.about_story)}</p><h2>Det vi styrer etter</h2><div class="grid">${c.about_values.map((v) => `<div class="card"><p>${e(v)}</p></div>`).join("")}</div>`);

    const vilkar = shell(`Vilkår – ${b.name}`, "Avtalevilkår", `<h1>Avtalevilkår</h1>${legalNotice}<ol class="steps">${c.terms_outline.map((t) => `<li>${e(t)}</li>`).join("")}</ol>`);

    const personvern = shell(`Personvern – ${b.name}`, "Personvernerklæring", `<h1>Personvernerklæring</h1>${legalNotice}<ol class="steps">${c.privacy_outline.map((t) => `<li>${e(t)}</li>`).join("")}</ol>`);

    const readme = `# ${b.name} – generert av Company Factory

Statisk nettsted uten eksterne avhengigheter. Alle sider deler designsystemet
(merkevare-tokens i CSS-variabler øverst i hver fil).

## Deploy
- GitHub Pages: legg filene i et repo → Settings → Pages → deploy fra branch.
- Netlify/Vercel/Cloudflare Pages: dra og slipp mappen.

## Før lansering (eier-porter i Company Factory)
1. **Betaling:** opprett produkter i Stripe og lim inn Payment Links i
   \`data-stripe-payment-link\`-attributtene i pris.html. Fjern eier-notisen.
2. **Juridisk:** vilkar.html og personvern.html er UTKAST – må kvalitetssikres
   av advokat/fagperson før publisering.
3. **Domene og e-post:** kjøp/pek domene, sett opp e-post (eier-port).
4. **Analyse:** legg inn valgfritt verktøy (f.eks. Plausible/Umami) – bevisst
   ikke inkludert for å holde siden fri for tredjeparter som standard.

Generert ${new Date().toISOString().slice(0, 10)}. Copy og struktur kan redigeres fritt.
`;

    return {
      "index.html": index,
      "pris.html": pris,
      "faq.html": faq,
      "om.html": om,
      "vilkar.html": vilkar,
      "personvern.html": personvern,
      "README-deploy.md": readme,
    };
  },

  zip(p) {
    if (!p.site) throw new Error("Nettstedet er ikke generert.");
    return makeZip(p.site.files);
  },
};

/* ================= Maturity (Fase 14/15: modenhetsstige med sjekklister) ================= */
const MATURITY_LADDER = ["prototype", "MVP", "beta", "produksjonsklart", "lanseringsklart"];
const MATURITY_CHECKLISTS = {
  prototype: [
    "Kjernebrukerreisen kan demonstreres ende til ende",
    "Kun testdata – ingen ekte kunde- eller betalingsdata",
    "Kjente mangler er notert i backloggen",
  ],
  MVP: [
    "Minste betalbare verdi er bygget – ikke en halvferdig storversjon",
    "Betalingsflyt fungerer i testmodus (f.eks. Stripe test)",
    "Kansellering og refusjonsregler er definert og fungerer",
    "Grunnleggende feilhåndtering og backup er på plass",
    "Analysepunkter for registrering/aktivering/konvertering måles",
  ],
  beta: [
    "Reelle brukere er informert om at dette er beta",
    "Supportkanal og FAQ er på plass",
    "Feillogging overvåkes aktivt",
    "Personvernerklæring er publisert og kvalitetssikret av fagperson (eier-port)",
  ],
  produksjonsklart: [
    "Kritiske tester er kjørt: betaling, tilgang, kansellering, mislykket betaling",
    "Restore fra backup er faktisk testet",
    "Sikkerhetsgjennomgang: tilgangsstyring, hemmeligheter, rate limits",
    "Juridiske dokumenter er kvalitetssikret av advokat/fagperson (eier-port)",
    "Ytelse og mobilbruk er verifisert",
  ],
  lanseringsklart: [
    "Domene og e-post er satt opp (eier-port)",
    "Ekte betalingsflyt er verifisert med testkjøp (eier-port)",
    "Rollback-plan finnes og er dokumentert",
    "Måleplan og dashboard er klart",
    "Lanseringstype er valgt bevisst: soft / beta / offentlig / kommersiell",
    "Offentlig lansering er godkjent av eier (eier-port)",
  ],
};

const Maturity = {
  LADDER: MATURITY_LADDER,
  next(p) {
    if (!p.maturity) return MATURITY_LADDER[0];
    const i = MATURITY_LADDER.indexOf(p.maturity);
    return i >= 0 ? MATURITY_LADDER[i + 1] || null : MATURITY_LADDER[0];
  },
  checklist(p, level) {
    p.checklists = p.checklists || {};
    if (!p.checklists[level]) {
      p.checklists[level] = { items: (MATURITY_CHECKLISTS[level] || []).map((text) => ({ text, done: false, at: null })), declaredAt: null };
      Projects.save(p);
    }
    return p.checklists[level];
  },
  toggle(p, level, idx, done) {
    const cl = this.checklist(p, level);
    if (!cl.items[idx]) throw new Error("Ukjent sjekkpunkt.");
    cl.items[idx].done = !!done;
    cl.items[idx].at = done ? new Date().toISOString() : null;
    return Projects.save(p);
  },
  /* Et nivå kan KUN erklæres når det er neste på stigen og alle punkter er huket av av eieren */
  declare(p, level) {
    if (level !== this.next(p)) throw new Error(`«${level}» er ikke neste nivå på stigen (neste: ${this.next(p) || "ingen"}).`);
    const cl = this.checklist(p, level);
    const missing = cl.items.filter((i) => !i.done);
    if (missing.length) throw new Error(`Kan ikke erklære «${level}»: ${missing.length} sjekkpunkt gjenstår. Ingenting erklæres ferdig når kritiske tester mangler.`);
    p.maturity = level;
    cl.declaredAt = new Date().toISOString();
    Projects.logDecision(p, { role: "eier", byOwner: true, decision: `MODENHET ERKLÆRT: ${level}`, rationale: `Alle ${cl.items.length} sjekkpunkter bekreftet av eier.` });
    return Projects.save(p);
  },
  /* «Lansert» er en eksplisitt eierhandling – lanseringsklart ≠ lansert */
  markLaunched(p) {
    if (p.maturity !== "lanseringsklart") throw new Error("Prosjektet må være erklært lanseringsklart først.");
    p.status = "lansert";
    Projects.logDecision(p, { phase: 15, role: "eier", byOwner: true, decision: "PROSJEKT LANSERT", rationale: "Eieren har bekreftet offentlig lansering (eier-port)." });
    return Projects.save(p);
  },
};

/* ================= Metrics (Fase 16: faktiske tall mot prognosen) ================= */
const Metrics = {
  add(p, entry) {
    if (!/^\d{4}-\d{2}$/.test(entry.month || "")) throw new Error("Måned må være på formen ÅÅÅÅ-MM.");
    p.metrics = (p.metrics || []).filter((m) => m.month !== entry.month);
    p.metrics.push({ month: entry.month, customers: +entry.customers || 0, mrr: +entry.mrr || 0, churn_pct: entry.churn_pct === "" || entry.churn_pct == null ? null : +entry.churn_pct, visitors: +entry.visitors || 0, notes: entry.notes || "", at: new Date().toISOString() });
    p.metrics.sort((a, b) => a.month.localeCompare(b.month));
    return Projects.save(p);
  },
  latest(p) { const m = p.metrics || []; return m.length ? m[m.length - 1] : null; },
  /* Faktisk vs. sannsynlig-scenariet, posisjonsvis (første registrerte måned = modellmåned 1) */
  compare(p) {
    if (!p.bizmodel || !(p.metrics || []).length) return [];
    const rows = p.bizmodel.computed.scenarios.sannsynlig.rows;
    return p.metrics.map((m, i) => ({ ...m, forecast_mrr: rows[i] ? rows[i].mrr : null, forecast_customers: rows[i] ? rows[i].customers : null }));
  },
};

/* ================= Library (seksjon 6: gjenbrukbare kapabiliteter) ================= */
const Library = {
  list() { return Store.get("cf_library", []); },
  add(title, source, type = "komponent", notes = "") {
    const list = this.list();
    if (list.some((x) => x.title === title && x.source === source)) return list;
    list.unshift({ id: "lib" + Date.now().toString(36) + list.length, title, source, type, notes, at: new Date().toISOString() });
    Store.set("cf_library", list.slice(0, 100));
    return list;
  },
  remove(id) { Store.set("cf_library", this.list().filter((x) => x.id !== id)); },
};

/* ================= Strategy (Fase 4: selskap og strategi) ================= */
const Strategy = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "strategi" };
    if (onStatus) onStatus("Fase 4: strategi og posisjonering …");
    const { json } = await LLM.call({
      system: `Du er strategimodulen i Company Factory (Fase 4). Lever konkret selskaps- og strategigrunnlag: arbeidsnavn + alternativer med tydelige navnekriterier, posisjonering, kategori, løfte, differensiering, mission/vision/verdier uten floskler, strategiske prioriteringer, mulige forsvarsmekanismer, 90-dagers plan, 12-måneders plan, 3-årig retning, risikoer – og en eksplisitt liste over ting selskapet IKKE skal gjøre. Ikke bruk tid på selskapsregistrering, varemerker eller domenekjøp – det er eier-porter som kommer senere.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nVURDERING: ${p.evaluation.synthesis.decision} (score ${p.evaluation.totalScore}/100)\nSVAKHETER: ${p.evaluation.synthesis.weaknesses.join("; ")}\nFORBEDRINGER: ${p.evaluation.synthesis.improvements.join("; ")}${p.bizmodel ? `\n\nFORRETNINGSMODELL: ${p.bizmodel.model.revenue_model}, ICP: ${p.bizmodel.model.icp}` : ""}`,
      schema: SCHEMAS.strategy,
      maxTokens: 4096,
    });
    p.strategy = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 4, role: "strategimodul", decision: `Strategi etablert: ${json.working_name} – ${json.category}`, rationale: json.positioning });
    return Projects.save(p);
  },
};

/* ================= Legal (Fase 10: juridisk, personvern og sikkerhet) ================= */
const Legal = {
  DISCLAIMER: "Automatisk generert veiledning – IKKE juridisk rådgivning. Alle punkter merket «krever fagperson» MÅ kvalitetssikres av advokat, regnskapsfører eller annen autorisert fagperson før de legges til grunn.",
  async run(p, onStatus) {
    if (!p.intake) throw new Error("Kjør inntak først.");
    LLM.context = { projectId: p.id, label: "juridisk" };
    if (onStatus) onStatus("Fase 10: juridisk kartlegging …");
    const { json } = await LLM.call({
      system: `Du er juridisk-modulen i Company Factory (Fase 10). Kartlegg juridiske og regulatoriske krav for et norsk digitalt abonnementsprodukt: selskapsform, avtalevilkår, GDPR/personvern (hvilke data, formål, behandlingsgrunnlag, lagringstid), forbrukerrettigheter og angrerett, regler for markedsføringssamtykke, MVA/skatt og krav til regnskap. Dette er GENERELL VEILEDNING, ikke juridisk rådgivning: sett must_be_verified_by_professional=true på alt som reelt krever advokat/regnskapsfører, og vær heller for streng enn for slapp. Ta med bransjespesifikke krav hvis produktet berører regulerte områder.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}${p.bizmodel ? `\n\nFORRETNINGSMODELL: ${p.bizmodel.model.revenue_model}, planer: ${p.bizmodel.model.plans.map((x) => x.name + " " + x.price_month + " kr/mnd").join(", ")}` : ""}`,
      schema: SCHEMAS.legal,
      maxTokens: 4096,
    });
    p.legal = { ...json, disclaimer: this.DISCLAIMER, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 10, role: "juridisk-modul", decision: `Juridisk kartlegging: ${json.requirements.length} krav identifisert`, rationale: `${json.requirements.filter((r) => r.must_be_verified_by_professional).length} av dem krever autorisert fagperson (eier-port). ${this.DISCLAIMER}` });
    return Projects.save(p);
  },
};

/* ================= Report (nedlastbar prosjektrapport – deterministisk) ================= */
const Report = {
  generate(p) {
    const L = [];
    const H = (s) => L.push("\n## " + s + "\n");
    const li = (arr) => (arr || []).forEach((x) => L.push("- " + x));
    L.push(`# ${p.name} – prosjektrapport fra Company Factory`);
    L.push(`\nGenerert ${new Date().toISOString().slice(0, 10)} · Status: **${p.status}** · Fase: ${p.phase} (${(PHASES.find((f) => f.n === p.phase) || {}).title || "–"}) · Modenhet: ${p.maturity || "–"}${p.test ? " · **TESTPROSJEKT**" : ""}`);
    L.push(`\n> Idé: ${p.idea}`);
    if (p.intake) {
      H("Fase 0 – Inntak");
      L.push(`**Problem:** ${p.intake.problem}\n\n**Målgruppe:** ${p.intake.target_group}\n\n**Løsning:** ${p.intake.solution}\n\n**Betalingsvilje:** ${p.intake.willingness_to_pay}\n\n**Marked:** ${p.intake.market}\n\n**Abonnementspotensial:** ${p.intake.subscription_potential}`);
    }
    if (p.evaluation) {
      const s = p.evaluation.synthesis;
      H(`Fase 1 – Idévurdering: ${s.decision.toUpperCase()} (${p.evaluation.totalScore}/100)`);
      L.push(s.decision_rationale + "\n");
      L.push("| Kriterium | Score | Begrunnelse |\n|---|---|---|");
      for (const r of s.scorecard) L.push(`| ${r.criterion} | ${r.score}/10 | ${r.reasoning} |`);
      L.push("\n**Svakheter:**"); li(s.weaknesses);
      L.push("\n**Scenarier:**");
      for (const x of s.scenarios) L.push(`- ${x.name} (${Math.round(x.probability * 100)} %): ${x.outcome} – ${x.value_estimate}`);
    }
    if ((p.experiments || []).length) {
      H("Fase 2 – Validering");
      L.push("| Antakelse | Terskel | Status | Resultat |\n|---|---|---|---|");
      for (const e of p.experiments) L.push(`| ${e.claim} | ${e.threshold} | ${e.status === "fullført" ? (e.passed ? "BESTÅTT" : "IKKE BESTÅTT") : e.status} | ${e.result || "–"} |`);
      if (p.validation) L.push(`\n**Valideringsport:** ${p.validation.decision.toUpperCase()} – ${p.validation.decision_rationale}`);
    }
    if (p.bizmodel) {
      const sc = p.bizmodel.computed.scenarios;
      H("Fase 3 – Forretningsmodell");
      L.push(`${p.bizmodel.model.value_prop}\n\nICP: ${p.bizmodel.model.icp} · Modell: ${p.bizmodel.model.revenue_model} · Snittpris: ${p.bizmodel.computed.price_avg} kr/mnd`);
      L.push("\n| Scenario (24 mnd) | Kunder | MRR | Break-even | Kapitalbehov | LTV/CAC |\n|---|---|---|---|---|---|");
      for (const k of ["konservativ", "sannsynlig", "offensiv"]) L.push(`| ${k} | ${sc[k].customers24} | ${sc[k].mrr24} kr | ${sc[k].breakEvenMonth ? "mnd " + sc[k].breakEvenMonth : "ikke innen 24 mnd"} | ${sc[k].capitalNeed} kr | ${sc[k].ltvCac ?? "–"} |`);
    }
    if (p.techarch) {
      H("Fase 7 – Teknisk arkitektur");
      L.push(p.techarch.summary + `\n\nEstimert månedskostnad totalt: ${p.techarch.total_monthly_cost_estimate}\n`);
      L.push("| Område | Valg | Hvorfor | Alternativer vurdert | Kostnad/mnd | Binding | Migreringsvei |\n|---|---|---|---|---|---|---|");
      for (const c of p.techarch.choices) L.push(`| ${c.area} | ${c.choice} | ${c.why} | ${c.alternatives_considered.join(", ")} | ${c.monthly_cost_estimate} | ${c.lock_in_risk} | ${c.migration_path} |`);
      L.push("\n**Trengs ikke enda:**"); li(p.techarch.not_needed_yet);
    }
    if (p.strategy) {
      H("Fase 4 – Strategi");
      L.push(`**${p.strategy.working_name}** (${p.strategy.category}) – ${p.strategy.positioning}\n\nLøfte: ${p.strategy.promise}\n\n**Skal ikke gjøre:**`); li(p.strategy.not_doing);
    }
    if (p.brief) {
      H("Fase 5 – MVP-brief: " + p.brief.working_name);
      L.push(p.brief.product_vision + "\n\n**MVP-funksjoner:**");
      for (const f of p.brief.mvp_features) L.push(`- **${f.name}** – ${f.why} (akseptanse: ${f.acceptance})`);
      L.push("\n**Bygges ikke:**"); li(p.brief.not_building);
    }
    if (p.site) { H("Fase 6+8 – Nettsted"); L.push(`Generert (${Object.keys(p.site.files).length} filer): «${p.site.content.hero_headline}». Betalingsknapper er Stripe-plassholdere (eier-port).`); }
    if (p.app) { H("Fase 8+9 – App-skall"); L.push(`Generert (${Object.keys(p.app.files).length} filer): «${p.app.content.app_name}». Demo-modus til Supabase/Stripe kobles til (eier-porter). Aktiveringsmetrikk: ${p.app.content.activation_metric}`); }
    if (p.legal) {
      H("Fase 10 – Juridisk (VEILEDNING, ikke rådgivning)");
      L.push("> " + p.legal.disclaimer + "\n");
      L.push("| Område | Krav | Krever fagperson |\n|---|---|---|");
      for (const r of p.legal.requirements) L.push(`| ${r.area} | ${r.requirement} | ${r.must_be_verified_by_professional ? "**JA**" : "nei"} |`);
    }
    if (p.marketing) { H("Fase 11 – Markedsføring"); L.push(`Kjernebudskap: ${p.marketing.core_message}\n\n**Kanaler:**`); for (const c of p.marketing.channel_strategy) L.push(`- ${c.priority}. ${c.channel}: ${c.why} (CAC-hypotese: ${c.cac_hypothesis})`); }
    if (p.ops) { H("Fase 13 – Drift"); L.push(`Supportkanaler: ${p.ops.support_channels.join(", ")} · ${p.ops.reply_templates.length} svarmaler · ${p.ops.automation_candidates.length} automatiseringskandidater`); }
    if ((p.metrics || []).length) {
      H("Fase 16 – Måletall");
      L.push("| Måned | Kunder | MRR | Churn | Besøk |\n|---|---|---|---|---|");
      for (const m of p.metrics) L.push(`| ${m.month} | ${m.customers} | ${m.mrr} kr | ${m.churn_pct == null ? "–" : m.churn_pct + " %"} | ${m.visitors} |`);
    }
    if (p.assumptions.length) {
      H("Antakelseslogg");
      L.push("| Påstand | Type | Sikkerhet | Kilde |\n|---|---|---|---|");
      for (const a of p.assumptions) L.push(`| ${a.claim} | ${a.type} | ${a.confidence} | ${a.source} |`);
    }
    if (p.decisions.length) {
      H("Beslutningslogg");
      L.push("| Dato | Rolle | Beslutning |\n|---|---|---|");
      for (const d of p.decisions) L.push(`| ${d.at.slice(0, 10)} | ${d.role}${d.byOwner ? " (EIER)" : ""} | ${d.decision} |`);
    }
    if (p.retro) { H("Retro"); L.push("Lærdom: **" + p.retro.lesson + "**"); }
    return L.join("\n");
  },

  /* Porteføljerapport på tvers av alle prosjekter – grunnlaget for ukentlig gjennomgang */
  portfolio() {
    const list = Projects.list();
    const L = [`# Porteføljerapport – Company Factory`, `\nGenerert ${new Date().toISOString().slice(0, 10)} · ${list.length} prosjekt(er)`];
    const totalMrr = list.reduce((s, p) => { const m = Metrics.latest(p); return s + (m ? m.mrr : 0); }, 0);
    L.push(`Samlet MRR (siste registrerte måned per prosjekt): **${totalMrr} kr**\n`);
    L.push("| Prosjekt | Status | Fase | Modenhet | Score | MRR | Neste beslutning |\n|---|---|---|---|---|---|---|");
    for (const p of list) {
      const m = Metrics.latest(p);
      const next = p.validation ? p.validation.decision : p.evaluation ? p.evaluation.synthesis.decision : "kjør vurdering";
      L.push(`| ${p.name}${p.test ? " (TEST)" : ""} | ${p.status} | ${p.phase} | ${p.maturity || "–"} | ${p.evaluation ? p.evaluation.totalScore + "/100" : "–"} | ${m ? m.mrr + " kr" : "–"} | ${next} |`);
    }
    const lessons = Lessons.list();
    if (lessons.length) { L.push("\n## Varige lærdommer\n"); for (const l of lessons) L.push(`- [${l.project}] ${l.lesson}`); }
    const lib = Library.list();
    if (lib.length) { L.push("\n## Gjenbruksbibliotek\n"); for (const x of lib) L.push(`- ${x.title} (${x.type}, fra ${x.source})`); }
    L.push("\n## Gjennomgangsspørsmål\n- Hvilke prosjekter bør avsluttes? (Allerede brukt tid er ikke et argument for å fortsette.)\n- Hvilke antakelser er fortsatt uvaliderte i aktive prosjekter?\n- Avviker faktiske tall fra prognosen – og hva betyr det for neste beslutning?");
    return L.join("\n");
  },
};

/* ================= Marketing (Fase 11: prioritert markedsføringsmotor) ================= */
const Marketing = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "markedsføring" };
    if (onStatus) onStatus("Fase 11: bygger markedsføringsmotor …");
    const { json } = await LLM.call({
      system: `Du er markedsføringsmodulen i Company Factory (Fase 11). Velg kanaler ut fra målgruppen og økonomien – IKKE lag planer for alle sosiale medier bare fordi de finnes. Prioriter 2–4 kanaler med begrunnelse og CAC-hypotese, gi kjernebudskap uten tomme fraser, en enkel innholdskalender (4–8 uker), 2–4 annonsekonsepter, en kort e-postsekvens, lanseringsplan og en eksperimentkø med målbare terskler. Masseutsendelser og betalte kampanjer er eier-porter – planlegg, men ikke anta at de er godkjent.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}${p.bizmodel ? `\n\nFORRETNINGSMODELL:\n${JSON.stringify({ planer: p.bizmodel.model.plans, cac_antakelse: p.bizmodel.model.assumptions.cac, icp: p.bizmodel.model.icp }, null, 2)}` : ""}${p.site ? `\n\nBUDSKAP FRA NETTSTEDET:\n${JSON.stringify({ headline: p.site.content.hero_headline, features: p.site.content.features.map((f) => f.title) }, null, 2)}` : ""}`,
      schema: SCHEMAS.marketing,
      maxTokens: 8192,
    });
    p.marketing = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 11, role: "markedsføringsmodul", decision: `Kanalstrategi valgt: ${json.channel_strategy.map((c) => c.channel).join(", ")}`, rationale: json.core_message });
    return Projects.save(p);
  },
};

/* ================= TechArch (Fase 7: teknisk arkitektur) ================= */
const TechArch = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "teknisk arkitektur" };
    if (onStatus) onStatus("Fase 7: velger teknisk arkitektur …");
    const { json } = await LLM.call({
      system: `Du er arkitekturmodulen i Company Factory (Fase 7). Velg teknologi ut fra produktets FAKTISKE behov – ikke komplisert infrastruktur fordi den ser imponerende ut. Dekk områdene som er relevante for dette produktet (typisk: frontend, backend/BaaS, database, autentisering, betaling/abonnement, e-post, analyse, logging/feilhåndtering, hosting, backup). For hvert valg: hva, hvorfor, hvilke alternativer som ble vurdert, månedskostnad-estimat, leverandørbinding (lav/middels/høy) og migreringsvei. List eksplisitt hva som IKKE trengs enda (not_needed_yet) – det er like viktig som valgene. Utgangspunkt for et selvbetjent abonnementsprodukt bygget av én person: statisk hosting + BaaS (f.eks. Supabase) + Stripe – avvik fra dette KUN hvis produktbehovet krever det, og begrunn avviket.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}${p.brief ? `\n\nMVP-BRIEF (funksjoner og datamodell):\n${JSON.stringify({ funksjoner: p.brief.mvp_features.map((f) => f.name), datamodell: p.brief.data_model_outline, bygges_ikke: p.brief.not_building }, null, 2)}` : ""}${p.bizmodel ? `\n\nSKALA: sannsynlig scenario ${p.bizmodel.computed.scenarios.sannsynlig.customers24} kunder etter 24 mnd` : ""}`,
      schema: SCHEMAS.techarch,
      maxTokens: 4096,
    });
    p.techarch = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, {
      phase: 7, role: "arkitekturmodul",
      decision: `Teknisk arkitektur valgt (${json.choices.length} områder, est. ${json.total_monthly_cost_estimate})`,
      options: json.choices.flatMap((c) => c.alternatives_considered).slice(0, 8),
      rationale: json.summary,
      risk: json.risks.join("; "),
    });
    return Projects.save(p);
  },
};

/* ================= AppGen (Fase 8+9 del 2: deploybart app-skall) ================= */
const AppGen = {
  async run(p, onStatus) {
    if (!p.brief) throw new Error("App-skallet bygges fra MVP-briefen – kjør pipeline til brief først.");
    LLM.context = { projectId: p.id, label: "app-skall" };
    if (onStatus) onStatus("Bygger app-skall: onboarding, dashboard, abonnement …");
    const { json } = await LLM.call({
      system: `Du er app-modulen i Company Factory (Fase 8+9). Lever produktspesifikt innhold til app-skallet: appnavn, velkomstlinje, 2–4 onboarding-steg (hvert med input-etikett for det viktigste feltet), 2–4 dashboard-moduler avledet DIREKTE av MVP-funksjonene (med ærlige tomtilstander), innstillingspunkter, den éne aktiveringsmetrikken som betyr noe, og en oppgraderingsmelding uten tomme fraser. Ikke finn på funksjoner som ikke står i briefen.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nMVP-BRIEF:\n${JSON.stringify(p.brief, null, 2)}${p.bizmodel ? `\n\nPLANER: ${p.bizmodel.model.plans.map((x) => `${x.name} ${x.price_month} kr/mnd`).join(", ")} · Prøve: ${p.bizmodel.model.trial}` : ""}`,
      schema: SCHEMAS.app,
      maxTokens: 4096,
    });
    const files = this.renderApp(json, p);
    p.app = { content: json, files, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 8, role: "app-modul", decision: `App-skall generert (${Object.keys(files).length} filer)`, rationale: `SPA med innlogging/onboarding/dashboard/abonnement. Kjører ærlig DEMO-MODUS til eieren kobler til Supabase og Stripe (eier-porter) – se README-app.md.` });
    return Projects.save(p);
  },

  /* Deterministisk app-pakke. Ingen hemmeligheter – all konfigurasjon fylles inn av eieren. */
  renderApp(c, p) {
    const e = escHtml;
    const brand = p.site ? p.site.content.brand : { name: c.app_name, color_primary: "#0b6e6e", color_ink: "#15222e", color_bg: "#f7f9fa" };
    const plans = p.bizmodel ? p.bizmodel.model.plans : [];

    const configJs = `/* ${c.app_name} – konfigurasjon. Fyll inn og deploy. ALDRI sjekk inn hemmelige nøkler –
 * kun Supabase anon-key (offentlig) og Payment Links hører hjemme her. */
window.APP_CONFIG = {
  supabaseUrl: "",        // https://<prosjekt>.supabase.co  (tomt = DEMO-MODUS)
  supabaseAnonKey: "",    // offentlig anon-nøkkel fra Supabase → Settings → API
  supabaseJsUrl: "https://esm.sh/@supabase/supabase-js@2",
  stripePaymentLinks: {   // Stripe → Payment Links (eier-port: betaling)
${plans.map((pl) => `    "${pl.name}": "", // ${pl.price_month} kr/mnd`).join("\n") || '    "Standard": "",'}
  },
  stripeCustomerPortal: "", // Stripe → Customer Portal-lenke (kansellering/kort)
};
`;

    const sql = `-- ${c.app_name} – Supabase-skjema. Kjør i SQL-editoren.
-- Profiler (1:1 med auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  onboarding jsonb default '{}'::jsonb
);
-- Abonnementsstatus (oppdateres KUN av stripe-webhooken via service role)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'none', -- none | trialing | active | past_due | canceled
  plan text,
  current_period_end timestamptz,
  stripe_customer_id text,
  updated_at timestamptz default now()
);
-- Row Level Security: brukere ser kun egne rader; ingen klient-skriving til subscriptions
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile write" on public.profiles for update using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own subscription read" on public.subscriptions for select using (auth.uid() = user_id);
-- Ingen insert/update-policy for subscriptions: kun service role (webhooken) skriver.
`;

    const webhook = `// ${c.app_name} – Stripe-webhook (Netlify/Vercel serverless-mal).
// Oppdaterer abonnementsstatus i Supabase. Krever hemmeligheter som MILJØVARIABLER
// (eier-port): STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Deploy: Netlify functions/ eller Vercel api/ – juster eksporten deretter.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    // TODO: verifiser signaturen – IKKE hopp over dette i produksjon
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send("Ugyldig signatur: " + err.message);
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const obj = event.data.object;
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    // TODO: slå opp user_id fra stripe_customer_id (lagre koblingen ved checkout.session.completed)
    await supabase.from("subscriptions").upsert({
      stripe_customer_id: obj.customer,
      status: obj.status,
      plan: obj.items?.data?.[0]?.price?.nickname || null,
      current_period_end: new Date(obj.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_customer_id" });
  }
  res.status(200).json({ received: true });
}
`;

    const readme = `# ${c.app_name} – app-skall generert av Company Factory

SPA med innlogging, onboarding, dashboard og abonnement. Uten konfigurasjon kjører
appen i tydelig merket **DEMO-MODUS** (lokal, falsk innlogging – ingen ekte data).

## Oppsett (rekkefølgen matcher eier-portene i Company Factory)
1. **Supabase** (gratisnivå holder): nytt prosjekt → kjør \`supabase-schema.sql\` i
   SQL-editoren → aktiver e-postinnlogging → lim URL + anon-key inn i \`config.js\`.
2. **Stripe** (eier-port: betaling): opprett produkter/priser → lag Payment Links og
   Customer Portal-lenke → lim inn i \`config.js\`.
3. **Webhook** (eier-port: produksjonsendring): deploy \`functions/stripe-webhook.js\`
   (Netlify/Vercel) med miljøvariablene beskrevet i filen → pek Stripe-webhooken dit
   (events: customer.subscription.*, checkout.session.completed).
4. **Deploy appen**: statisk hosting (samme som nettstedet). Test hele flyten i
   Stripe testmodus FØR ekte kort – se modenhetssjekklisten i fabrikken.

## Sikkerhet
- Kun offentlige nøkler i \`config.js\`. Hemmeligheter kun som miljøvariabler serverside.
- RLS er på: brukere leser kun egne rader; kun webhooken (service role) skriver abonnement.
- Klienten HÅNDHEVER IKKE tilgang alene – reell tilgangskontroll ligger i RLS + webhook.

Aktiveringsmetrikk å måle fra dag 1: **${c.activation_metric}**
`;

    const appHtml = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(c.app_name)}</title>
<meta name="robots" content="noindex">
<style>
  :root { --primary:${e(brand.color_primary)}; --ink:${e(brand.color_ink)}; --bg:${e(brand.color_bg)}; --muted:#5f6f7d; --card:#fff; --line:#e2e8ee; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:var(--ink); background:var(--bg); line-height:1.6; }
  header { background:var(--card); border-bottom:1px solid var(--line); padding:12px 20px; display:flex; align-items:center; gap:14px; }
  header b { color:var(--primary); margin-right:auto; }
  header a { color:var(--muted); text-decoration:none; font-size:14px; }
  main { max-width:760px; margin:0 auto; padding:24px 20px 60px; }
  h1 { font-size:24px; margin-bottom:10px; } h2 { font-size:18px; margin:22px 0 10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:12px; }
  .muted { color:var(--muted); font-size:14px; }
  input { width:100%; padding:12px; font-size:16px; border:1px solid #c8d2da; border-radius:10px; margin:6px 0; }
  .btn { display:inline-block; background:var(--primary); color:#fff; border:0; padding:12px 22px; border-radius:10px; font-size:15px; cursor:pointer; text-decoration:none; }
  .btn.alt { background:#fff; color:var(--primary); border:2px solid var(--primary); }
  #demoBanner { background:#fff7e0; border-bottom:1px solid #eedc9a; padding:8px 20px; font-size:13px; text-align:center; }
  .err { color:#b3261e; font-size:14px; min-height:18px; }
  .pill { display:inline-block; border:1px solid var(--line); border-radius:99px; padding:2px 10px; font-size:12px; color:var(--muted); }
</style>
</head>
<body>
<div id="demoBanner" hidden>DEMO-MODUS: ingen ekte innlogging eller betaling. Koble til Supabase/Stripe i config.js – se README-app.md.</div>
<header><b>${e(c.app_name)}</b><a href="#/dashboard">Dashboard</a><a href="#/abonnement">Abonnement</a><a href="#/innstillinger">Innstillinger</a><a href="#" id="logoutLink" hidden>Logg ut</a></header>
<main id="view"></main>
<script src="config.js"><\/script>
<script>
(() => {
"use strict";
const CFG = window.APP_CONFIG || {};
const DEMO = !CFG.supabaseUrl;
const ONBOARDING = ${JSON.stringify(c.onboarding_steps)};
const MODULES = ${JSON.stringify(c.dashboard_modules)};
const SETTINGS = ${JSON.stringify(c.settings_items)};
const PAYMENT_LINKS = (CFG.stripePaymentLinks) || {};
let sb = null;

const esc = (s) => { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; };

/* Auth-adapter: Supabase når konfigurert, ellers ærlig demo (localStorage) */
const Auth = {
  async init() {
    if (DEMO) { document.getElementById("demoBanner").hidden = false; return; }
    const mod = await import(CFG.supabaseJsUrl);
    sb = mod.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  },
  async user() {
    if (DEMO) { try { return JSON.parse(localStorage.getItem("app_demo_user")); } catch (_) { return null; } }
    const { data } = await sb.auth.getUser();
    return data.user || null;
  },
  async signUp(email, password) {
    if (DEMO) { localStorage.setItem("app_demo_user", JSON.stringify({ email })); return {}; }
    return await sb.auth.signUp({ email, password });
  },
  async signIn(email, password) {
    if (DEMO) { localStorage.setItem("app_demo_user", JSON.stringify({ email })); return {}; }
    return await sb.auth.signInWithPassword({ email, password });
  },
  async signOut() {
    if (DEMO) { localStorage.removeItem("app_demo_user"); return; }
    await sb.auth.signOut();
  },
  async subscription() {
    if (DEMO) return { status: localStorage.getItem("app_demo_sub") || "none", plan: null };
    const { data } = await sb.from("subscriptions").select("status, plan, current_period_end").maybeSingle();
    return data || { status: "none", plan: null };
  },
};

const view = document.getElementById("view");
const routes = {
  "/login": async () => {
    view.innerHTML = '<h1>Logg inn</h1><div class="card"><input id="em" type="email" placeholder="E-post"><input id="pw" type="password" placeholder="Passord"><div class="err" id="err"></div><button class="btn" id="go">Logg inn</button> <a class="btn alt" href="#/signup">Ny konto</a></div>';
    document.getElementById("go").onclick = async () => {
      const r = await Auth.signIn(document.getElementById("em").value, document.getElementById("pw").value);
      if (r && r.error) { document.getElementById("err").textContent = r.error.message; return; }
      location.hash = "#/dashboard";
    };
  },
  "/signup": async () => {
    view.innerHTML = '<h1>Opprett konto</h1><p class="muted">${e(c.welcome_line)}</p><div class="card"><input id="em" type="email" placeholder="E-post"><input id="pw" type="password" placeholder="Passord (min. 8 tegn)"><div class="err" id="err"></div><button class="btn" id="go">Kom i gang</button></div>';
    document.getElementById("go").onclick = async () => {
      const r = await Auth.signUp(document.getElementById("em").value, document.getElementById("pw").value);
      if (r && r.error) { document.getElementById("err").textContent = r.error.message; return; }
      location.hash = "#/onboarding";
    };
  },
  "/onboarding": async () => {
    const u = await Auth.user();
    if (!u) { location.hash = "#/login"; return; }
    let step = 0;
    const answers = {};
    const render = () => {
      const s = ONBOARDING[step];
      view.innerHTML = '<h1>' + esc(s.title) + ' <span class="pill">' + (step + 1) + '/' + ONBOARDING.length + '</span></h1><div class="card"><p class="muted">' + esc(s.text) + '</p><input id="ob" placeholder="' + esc(s.input_label) + '"><button class="btn" id="next">' + (step + 1 < ONBOARDING.length ? "Neste" : "Fullfør") + '</button></div>';
      document.getElementById("next").onclick = () => {
        answers[s.input_label] = document.getElementById("ob").value;
        step++;
        if (step < ONBOARDING.length) render();
        else { try { localStorage.setItem("app_onboarding", JSON.stringify(answers)); } catch (_) {} location.hash = "#/dashboard"; }
      };
    };
    render();
  },
  "/dashboard": async () => {
    const u = await Auth.user();
    if (!u) { location.hash = "#/login"; return; }
    const sub = await Auth.subscription();
    const gated = !["active", "trialing"].includes(sub.status);
    view.innerHTML = '<h1>Dashboard</h1>' +
      (gated ? '<div class="card"><b>${e(c.upgrade_prompt)}</b><br><br><a class="btn" href="#/abonnement">Se planer</a></div>' : "") +
      MODULES.map((m) => '<div class="card"><h2>' + esc(m.title) + '</h2><p class="muted">' + esc(m.description) + '</p><p class="muted"><i>' + esc(m.empty_state) + '</i></p></div>').join("");
  },
  "/abonnement": async () => {
    const u = await Auth.user();
    if (!u) { location.hash = "#/login"; return; }
    const sub = await Auth.subscription();
    view.innerHTML = '<h1>Abonnement</h1><div class="card">Status: <b>' + esc(sub.status) + '</b>' + (sub.plan ? ' (' + esc(sub.plan) + ')' : "") + '</div>' +
      Object.keys(PAYMENT_LINKS).map((name) => '<div class="card"><h2>' + esc(name) + '</h2>' +
        (PAYMENT_LINKS[name] ? '<a class="btn" href="' + esc(PAYMENT_LINKS[name]) + '">Velg ' + esc(name) + '</a>' : '<button class="btn" data-demo-plan="' + esc(name) + '">Velg ' + esc(name) + (DEMO ? " (demo)" : "") + '</button><p class="muted">Payment Link mangler i config.js (eier-port: betaling).</p>') + '</div>').join("") +
      '<div class="card"><h2>Administrer</h2>' + (CFG.stripeCustomerPortal ? '<a class="btn alt" href="' + esc(CFG.stripeCustomerPortal) + '">Kundeportal (kort, kansellering)</a>' : '<p class="muted">Customer Portal-lenke mangler i config.js. Kansellering skal alltid være like enkelt som kjøp.</p>') + '</div>';
    view.querySelectorAll("[data-demo-plan]").forEach((b) => {
      b.onclick = () => { if (DEMO) { localStorage.setItem("app_demo_sub", "active"); location.reload(); } else alert("Legg inn Payment Link i config.js først."); };
    });
  },
  "/innstillinger": async () => {
    const u = await Auth.user();
    if (!u) { location.hash = "#/login"; return; }
    view.innerHTML = '<h1>Innstillinger</h1><div class="card">Konto: <b>' + esc(u.email) + '</b></div>' +
      SETTINGS.map((s) => '<div class="card muted">' + esc(s) + '</div>').join("");
  },
};

async function route() {
  const path = (location.hash || "#/dashboard").slice(1);
  const u = await Auth.user();
  document.getElementById("logoutLink").hidden = !u;
  (routes[path] || routes["/dashboard"])();
}
document.getElementById("logoutLink").onclick = async (ev) => { ev.preventDefault(); await Auth.signOut(); location.hash = "#/login"; };
window.addEventListener("hashchange", route);
Auth.init().then(route);
})();
<\/script>
</body>
</html>`;

    return {
      "app/index.html": appHtml,
      "app/config.js": configJs,
      "app/supabase-schema.sql": sql,
      "app/functions/stripe-webhook.js": webhook,
      "app/README-app.md": readme,
    };
  },

  zip(p) {
    if (!p.app) throw new Error("App-skallet er ikke generert.");
    return makeZip(p.app.files);
  },
};

/* ================= Ops (Fase 13: drift og kundeservice) ================= */
const Ops = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "drift" };
    if (onStatus) onStatus("Fase 13: driftsgrunnlag …");
    const { json } = await LLM.call({
      system: `Du er driftsmodulen i Company Factory (Fase 13). Målet er at selskapet kan drives med minst mulig manuelt arbeid uten at kundene opplever dårlig service. Lever: supportkanaler (få og realistiske for én person), FAQ-frø basert på produktet, svarmaler for de vanligste sakene (betalingsfeil, kansellering, refusjon, teknisk feil), eskaleringsregler, en kort hendelses-runbook, månedlig gjennomgangssjekkliste, leverandøroversikt med kostnadsnotat, og kandidater for automatisering. Vær konkret – ingen generiske driftsfloskler.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}${p.brief ? `\n\nMVP-FUNKSJONER: ${p.brief.mvp_features.map((f) => f.name).join(", ")}` : ""}${p.bizmodel ? `\n\nPLANER: ${p.bizmodel.model.plans.map((x) => `${x.name} ${x.price_month} kr/mnd`).join(", ")}` : ""}`,
      schema: SCHEMAS.ops,
      maxTokens: 8192,
    });
    p.ops = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, { phase: 13, role: "driftsmodul", decision: `Driftsgrunnlag etablert (${json.reply_templates.length} svarmaler, ${json.automation_candidates.length} automatiseringskandidater)`, rationale: `Supportkanaler: ${json.support_channels.join(", ")}` });
    return Projects.save(p);
  },
};

/* ================= Retro (seksjon 12: selvevaluering per prosjekt) ================= */
const Retro = {
  async run(p, onStatus) {
    LLM.context = { projectId: p.id, label: "retro" };
    if (onStatus) onStatus("Kjører retro på prosjektet …");
    const { json } = await LLM.call({
      system: `Du er retro-modulen i Company Factory. Evaluer prosjektgjennomføringen nøkternt: hva fungerte, hva feilet, hvilke antakelser var gale, hvilke prosessforbedringer bør gjøres, hva kan generaliseres til gjenbruksbiblioteket – og hva bør IKKE gjenbrukes. Formuler ÉN kort, generaliserbar lærdom («lesson») som fabrikken skal huske i alle fremtidige prosjekter. Ikke foreslå forbedringer som bare gjør systemet større uten målbar verdi.`,
      user: `${ownerContext()}PROSJEKT: ${p.name} [status: ${p.status}, fase ${p.phase}]\nIDÉ: ${p.idea}\n\nVURDERING: ${p.evaluation ? `${p.evaluation.synthesis.decision} (score ${p.evaluation.totalScore}/100) – ${p.evaluation.synthesis.decision_rationale}` : "(ikke kjørt)"}\n\nEKSPERIMENTER:\n${JSON.stringify((p.experiments || []).map((x) => ({ antakelse: x.claim, status: x.status, bestått: x.passed, resultat: x.result })), null, 2)}\n\nVALIDERINGSPORT: ${p.validation ? `${p.validation.decision} – ${p.validation.decision_rationale}` : "(ikke kjørt)"}\n\nANTAKELSER (${p.assumptions.length}):\n${p.assumptions.slice(0, 15).map((a) => `- [${a.type}] ${a.claim}`).join("\n")}\n\nBESLUTNINGER (${p.decisions.length}):\n${p.decisions.slice(0, 15).map((d) => `- ${d.decision}`).join("\n")}`,
      schema: SCHEMAS.retro,
      maxTokens: 4096,
    });
    p.retro = { ...json, at: new Date().toISOString() };
    Lessons.add(json.lesson, p.name);
    /* Gjenbrukskandidater trekkes ut til fellesbiblioteket – prosjektspesifikt holdes utenfor */
    for (const item of json.reusable || []) Library.add(item, p.name, "kandidat");
    Projects.logDecision(p, { role: "retro-modul", decision: "Retro gjennomført", rationale: `Lærdom: ${json.lesson}${json.reusable.length ? ` · ${json.reusable.length} gjenbrukskandidater lagt i biblioteket.` : ""}` });
    return Projects.save(p);
  },
};

/* ================= Finance (deterministisk økonomimodell – ingen LLM) ================= */
const Finance = {
  avgPrice(plans) {
    let sum = 0, weight = 0;
    for (const pl of plans || []) { sum += (pl.price_month || 0) * (pl.target_share || 0); weight += pl.target_share || 0; }
    return weight ? sum / weight : (plans && plans[0] ? plans[0].price_month : 0);
  },
  /* 24-måneders fremskrivning fra antakelsene. All matematikk i kode – modellen gjetter aldri tall den kan regne ut. */
  project(a, months = 24) {
    let customers = 0, visitors = a.visitors_m1, cumulative = 0, breakEvenMonth = null;
    const rows = [];
    for (let m = 1; m <= months; m++) {
      const newCustomers = visitors * a.signup_rate * a.paid_conversion;
      customers = customers * (1 - a.churn_monthly) + newCustomers;
      const mrr = customers * a.price_avg;
      const costs = a.fixed_costs_monthly + customers * a.variable_cost_per_user + newCustomers * a.cac;
      const profit = mrr - costs;
      cumulative += profit;
      if (breakEvenMonth === null && profit > 0) breakEvenMonth = m;
      rows.push({ m, visitors: Math.round(visitors), newCustomers: Math.round(newCustomers * 10) / 10, customers: Math.round(customers), mrr: Math.round(mrr), profit: Math.round(profit), cumulative: Math.round(cumulative) });
      visitors *= 1 + a.visitor_growth_pct_m;
    }
    const contribution = a.price_avg - a.variable_cost_per_user;
    const ltv = a.churn_monthly > 0 ? contribution / a.churn_monthly : null;
    const last = rows[rows.length - 1];
    return {
      rows, breakEvenMonth,
      customers24: last.customers, mrr24: last.mrr, arr24: last.mrr * 12, cumulative24: last.cumulative,
      ltv: ltv === null ? null : Math.round(ltv),
      ltvCac: ltv !== null && a.cac > 0 ? Math.round((ltv / a.cac) * 10) / 10 : null,
      capitalNeed: Math.round(Math.min(0, ...rows.map((r) => r.cumulative))) * -1,
    };
  },
  /* Monte Carlo-usikkerhetsvifte. Tre scenarier er falsk trygghet – viften viser spennet.
     Dokumenterte spenn rundt basisantakelsene (uniform): konvertering ±40 %, churn ±50 %,
     CAC ±40 %, trafikkvekst ±50 %, starttrafikk ±30 %. ESTIMAT – metoden er enkel med vilje. */
  SIM_SPREADS: { conv: 0.4, churn: 0.5, cac: 0.4, growth: 0.5, visitors: 0.3 },
  simulate(a, runs = 500, months = 24) {
    const sp = this.SIM_SPREADS;
    const jitter = (v, pct) => v * (1 + (Math.random() * 2 - 1) * pct);
    const mrrByMonth = Array.from({ length: months }, () => []);
    const capitals = [];
    for (let i = 0; i < runs; i++) {
      const run = this.project({
        ...a,
        signup_rate: jitter(a.signup_rate, sp.conv),
        paid_conversion: jitter(a.paid_conversion, sp.conv),
        churn_monthly: Math.min(0.9, Math.max(0.001, jitter(a.churn_monthly, sp.churn))),
        cac: Math.max(0, jitter(a.cac, sp.cac)),
        visitor_growth_pct_m: jitter(a.visitor_growth_pct_m, sp.growth),
        visitors_m1: Math.max(1, jitter(a.visitors_m1, sp.visitors)),
      }, months);
      run.rows.forEach((r, m) => mrrByMonth[m].push(r.mrr));
      capitals.push(run.capitalNeed);
    }
    const pct = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    return {
      runs, months, spreads: sp,
      mrr: { p10: mrrByMonth.map((m) => pct(m, 0.1)), p50: mrrByMonth.map((m) => pct(m, 0.5)), p90: mrrByMonth.map((m) => pct(m, 0.9)) },
      capital: { p10: pct(capitals, 0.1), p50: pct(capitals, 0.5), p90: pct(capitals, 0.9) },
    };
  },

  /* Konservativ / sannsynlig / offensiv – faste multiplikatorer, tydelig dokumentert */
  scenarios(a) {
    const mk = (mult) => this.project({
      ...a,
      signup_rate: a.signup_rate * mult.conv,
      paid_conversion: a.paid_conversion * mult.conv,
      churn_monthly: Math.min(0.9, a.churn_monthly * mult.churn),
      cac: a.cac * mult.cac,
    });
    return {
      konservativ: mk({ conv: 0.6, churn: 1.5, cac: 1.4 }),
      sannsynlig: mk({ conv: 1, churn: 1, cac: 1 }),
      offensiv: mk({ conv: 1.4, churn: 0.7, cac: 0.8 }),
    };
  },
};

/* ================= Benchmarks (vakthund: LLM-antakelser mot bransjespenn) ================= */
const Benchmarks = {
  SOURCE: "Bransjetommelfingre for selvbetjent SaaS (offentlige benchmark-rapporter, per 2025). Vide spenn med vilje – dette er en vakthund mot ønsketenkning, ikke fasit.",
  RANGES: {
    signup_rate: { min: 0.01, max: 0.10, label: "Besøk → registrering" },
    paid_conversion: { min: 0.02, max: 0.25, label: "Registrert → betalende" },
    churn_monthly: { min: 0.02, max: 0.10, label: "Månedlig churn (B2C)" },
    cac: { min: 50, max: 1500, label: "CAC (kr, blandet kanal)" },
    visitor_growth_pct_m: { min: 0, max: 0.3, label: "Organisk trafikkvekst/mnd" },
  },
  /* Optimistiske avvik (bedre enn spennet) er farligst – de blir varsler. Pessimistiske noteres. */
  check(assumptions) {
    const findings = [];
    for (const [key, r] of Object.entries(this.RANGES)) {
      const v = assumptions[key];
      if (typeof v !== "number") continue;
      const optimistic = (key === "churn_monthly" || key === "cac") ? v < r.min : v > r.max;
      const pessimistic = (key === "churn_monthly" || key === "cac") ? v > r.max : v < r.min;
      if (optimistic) findings.push({ key, value: v, range: r, severity: "optimistisk", note: `${r.label}: ${v} er utenfor spennet ${r.min}–${r.max} i GUNSTIG retning – krever ekstraordinær begrunnelse eller egne data.` });
      else if (pessimistic) findings.push({ key, value: v, range: r, severity: "pessimistisk", note: `${r.label}: ${v} er utenfor spennet ${r.min}–${r.max} i ugunstig retning – muligens for forsiktig.` });
    }
    return findings;
  },
};

/* ================= BizModel (Fase 3: forretningsmodell) ================= */
const BizModel = {
  async run(p, onStatus) {
    if (!p.intake || !p.evaluation) throw new Error("Kjør inntak og idévurdering først.");
    LLM.context = { projectId: p.id, label: "forretningsmodell" };
    if (onStatus) onStatus("Fase 3: bygger forretningsmodell …");
    const { json } = await LLM.call({
      system: `Du er forretningsmodell-modulen i Company Factory (Fase 3). Definer en konkret modell: verdi, ICP, kjøper/bruker, inntektsmodell, 1–3 abonnementsplaner med månedspris/årspris og forventet kundefordeling (target_share, summerer til ~1), gratisnivå/prøveperiode. Sett NØKTERNE talleantakelser (trafikk måned 1, månedlig vekst, registreringsrate, betalt konvertering, månedlig churn, CAC, faste kostnader, variabel kostnad per bruker) – all videre matematikk gjøres av kode, ikke av deg. Hver talleantakelse skal begrunnes kort i assumption_notes. Ikke pynt på tallene: modellen skal kunne avkreftes.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nFRA VURDERINGEN:\n${JSON.stringify({ beslutning: p.evaluation.synthesis.decision, score: p.evaluation.totalScore, svakheter: p.evaluation.synthesis.weaknesses }, null, 2)}${p.validation ? `\n\nVALIDERINGSRESULTATER:\n${JSON.stringify(p.validation.per_experiment, null, 2)}` : ""}`,
      schema: SCHEMAS.bizmodel,
      maxTokens: 4096,
    });
    p.bizmodel = { model: json, at: new Date().toISOString() };
    this.recompute(p);
    Projects.logAssumptions(p, json.assumption_notes.map((n) => ({ claim: n, type: "antakelse", confidence: "lav" })), "forretningsmodell");
    Projects.logDecision(p, { phase: 3, role: "forretningsmodell-modul", decision: "Forretningsmodell etablert", rationale: `${json.revenue_model}. Snittpris ${Math.round(Finance.avgPrice(json.plans))} kr/mnd. Oppdateres med faktiske data etter lansering.` });
    return Projects.save(p);
  },
  /* Rekalkuler lokalt (gratis) – f.eks. etter at eieren justerer antakelser */
  recompute(p, patch) {
    const m = p.bizmodel.model;
    if (patch) m.assumptions = { ...m.assumptions, ...patch };
    const a = { ...m.assumptions, price_avg: Finance.avgPrice(m.plans) };
    p.bizmodel.computed = { scenarios: Finance.scenarios(a), price_avg: Math.round(a.price_avg), at: new Date().toISOString() };
    return Projects.save(p);
  },
};

/* ================= Planner (tilpasset faseplan) ================= */
const Planner = {
  async run(p, onStatus) {
    if (!p.evaluation) throw new Error("Kjør idévurdering (Fase 1) først.");
    LLM.context = { projectId: p.id, label: "faseplan" };
    if (onStatus) onStatus("Lager tilpasset faseplan …");
    const { json } = await LLM.call({
      system: `Du er planmodulen i Company Factory. Tilpass standardpipelinen til DETTE prosjektet: marker hvilke faser som er relevante (små idéer får små planer – dropp faser som ikke trengs), definer omfang, leveranser, første konkrete handlinger, stoppkriterier, ansvarlig rolle og risiko per relevant fase. Valider billig før tung bygging: menneskeheten har allerede laget nok ubrukte dashboards.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\nBESLUTNING FRA IDÉVURDERING: ${p.evaluation.synthesis.decision} (score ${p.evaluation.totalScore}/100)\nBEGRUNNELSE: ${p.evaluation.synthesis.decision_rationale}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nKRITISKE ANTAKELSER Å VALIDERE:\n${JSON.stringify(p.evaluation.synthesis.assumptions_to_validate, null, 2)}\n\nSTANDARDFASER:\n${PHASES.map((f) => `${f.n}: ${f.title} (port: ${f.gate})`).join("\n")}`,
      schema: SCHEMAS.plan,
      maxTokens: 8192,
    });
    p.phasePlan = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, { decision: "Faseplan opprettet", rationale: json.sequencing_notes, role: "planmodul" });
    return Projects.save(p);
  },
};

/* ================= Brief (MVP-brief) ================= */
const Brief = {
  async run(p, onStatus) {
    if (!p.evaluation) throw new Error("Kjør idévurdering (Fase 1) først.");
    LLM.context = { projectId: p.id, label: "mvp-brief" };
    if (onStatus) onStatus("Skriver MVP-brief …");
    const { json } = await LLM.call({
      system: `Du er MVP-brief-modulen i Company Factory. Skriv en konkret, byggbar brief. MVP = den minste løsningen som skaper reell verdi og tester betalingsvilje – ikke en halvferdig versjon av et enormt produkt. Vær eksplisitt om hva som IKKE skal bygges. Bruk tydelig prioritering, ingen funksjonsinflasjon, ingen tomme fraser.`,
      user: `${ownerContext()}PROSJEKT: ${p.name}\n\nINNTAK:\n${JSON.stringify(p.intake, null, 2)}\n\nSYNTESE FRA STYRET:\n${JSON.stringify({ beslutning: p.evaluation.synthesis.decision, begrunnelse: p.evaluation.synthesis.decision_rationale, svakheter: p.evaluation.synthesis.weaknesses, forbedringer: p.evaluation.synthesis.improvements }, null, 2)}`,
      schema: SCHEMAS.brief,
      maxTokens: 8192,
    });
    p.brief = { ...json, at: new Date().toISOString() };
    Projects.logDecision(p, { decision: "MVP-brief produsert: " + json.working_name, rationale: json.product_vision, role: "brief-modul" });
    return Projects.save(p);
  },
};

/* ================= Pipeline-kjøring (Fase 0 → 1 → plan/brief) ================= */
const Pipeline = {
  PHASES, OWNER_GATE_ACTIONS, MATURITY, CRITERIA, DECISIONS,
  async runFrom(idea, name, onProgress) {
    const p = Projects.create(name, idea);
    return this.resume(p.id, onProgress);
  },
  async resume(projectId, onProgress) {
    const say = (step, detail) => onProgress && onProgress(step, detail);
    let p = Projects.get(projectId);
    if (!p) throw new Error("Fant ikke prosjektet.");
    if (!p.intake) p = await Intake.run(p, (s) => say("intake", s));
    if (!p.evaluation) p = await Evaluation.run(p, onProgress);
    /* Valideringsporten (Fase 2) overstyrer idévurderingens beslutning når den er kjørt */
    const d = (p.validation && p.validation.decision) || p.evaluation.synthesis.decision;
    const buildable = ["prototype", "mvp", "lansering"].includes(d);
    if ((buildable || d === "valider_mer") && !p.phasePlan) p = await Planner.run(p, (s) => say("plan", s));
    if (buildable && !p.brief) p = await Brief.run(p, (s) => say("brief", s));
    /* Byggekjeden (F3): besluttet bygging → forretningsmodell → nettsted */
    if (buildable && !p.bizmodel) p = await BizModel.run(p, (s) => say("bizmodel", s));
    if (buildable && !p.site) p = await SiteGen.run(p, (s) => say("site", s));
    say("finished", d);
    return p;
  },
};

/* ================= Demo (eksempelprosjekt – ISOLERT TESTDATA, ingen API-kall) ================= */
const Demo = {
  load() {
    const existing = Projects.list().find((x) => x.test && x.name === "BoligPuls (TEST)");
    if (existing) return existing;
    const p = Projects.create("BoligPuls (TEST)", "Lag en abonnementstjeneste som hjelper boligeiere med vedlikehold av bolig.", { test: true });
    p.intake = {
      summary: "Abonnement som gir boligeiere en personlig vedlikeholdsplan med sesongvarsler og hjelp til å bestille håndverkere.",
      problem: "Boligeiere vet ikke hvilket vedlikehold boligen trenger når, og småfeil blir dyre skader.",
      target_group: "Eiere av enebolig/rekkehus 30–65 år, primært førstegangs eneboligeiere.",
      solution: "Digital vedlikeholdsplan per bolig + sesongbaserte påminnelser + sjekklister + prisantydninger.",
      willingness_to_pay: "Ukjent. Hypotese: 49–99 kr/mnd. Krever validering.",
      market: "≈1,9 mill. eneboliger/småhus i Norge (SSB) – må verifiseres.",
      channel: "SEO på vedlikeholdssøk, boligkjøpsøyeblikket (bank/megler-partnere), Facebook-grupper.",
      subscription_potential: "Høyt: vedlikehold er tilbakevendende per sesong; lav marginalkostnad per kunde.",
      assumptions: [
        { claim: "Boligeiere opplever vedlikeholdsplanlegging som et reelt problem", type: "antakelse", confidence: "middels" },
        { claim: "1,9 mill. småhus i Norge", type: "krever_ekstern_validering", confidence: "middels" },
        { claim: "Betalingsvilje 49–99 kr/mnd", type: "krever_ekstern_validering", confidence: "lav" },
      ],
      unknowns: ["Churn etter første sesong", "Om forsikringsselskap allerede tilbyr dette gratis"],
      decision_changing_questions: ["Finnes distribusjonsfortrinn (f.eks. partneravtale) som senker CAC?"],
    };
    p.phase = 1;
    Projects.logAssumptions(p, p.intake.assumptions, "inntak");
    Projects.logDecision(p, { phase: 0, decision: "Idé strukturert – godkjent for analyse", rationale: p.intake.summary, role: "inntaksmodul" });
    const scorecard = [
      { criterion: "problemsmerte", score: 6, reasoning: "Reell, men lav akutt smerte – utsettes ofte." },
      { criterion: "frekvens", score: 7, reasoning: "Sesongbasert, 4+ ganger årlig." },
      { criterion: "betalingsvilje", score: 4, reasoning: "Uvalidert; gratisalternativer (sjekklister) finnes." },
      { criterion: "markedsstørrelse", score: 7, reasoning: "Stort volum i Norge, mulig Norden." },
      { criterion: "differensiering", score: 5, reasoning: "Forsikring/banker kan kopiere som gratis tillegg." },
      { criterion: "gjennomførbarhet", score: 8, reasoning: "Teknisk enkelt: plan + varsler + innhold." },
      { criterion: "tid_til_marked", score: 8, reasoning: "MVP på uker, ikke måneder." },
      { criterion: "gjentakende_inntekt", score: 7, reasoning: "Naturlig abonnement, men churn-risiko etter år 1." },
      { criterion: "automatiseringsgrad", score: 8, reasoning: "Innhold og varsler kan automatiseres nesten helt." },
      { criterion: "forsvarbarhet", score: 3, reasoning: "Lav – innhold kopierbart; ev. datamoat over tid." },
    ];
    p.evaluation = {
      framing: { case_summary: "Abonnement på boligvedlikehold", selected_roles: ["cf_marked", "cf_kunde", "cf_vekst"], rationale: "Marked, kundesmerte og distribusjon er de kritiske usikkerhetene." },
      verdicts: [
        { roleId: "cf_marked", roleTitle: "Markedsanalytiker", weight: 1, position: "Stort volum, svak forsvarbarhet.", strongest_argument_against: "Forsikringsselskap kan gi dette gratis.", top_risks: ["Kopiering"], recommendation: "Valider betalingsvilje før bygging.", certainty: "middels", probability_success: 0.35 },
        { roleId: "cf_kunde", roleTitle: "Kundeinnsiktsansvarlig", weight: 1, position: "Problemet er reelt, men lavfrekvent smerte.", strongest_argument_against: "Folk utsetter vedlikehold – betaler de for påminnelser?", top_risks: ["Churn etter sesong 1"], recommendation: "Falsk-dør-test + 10 intervjuer.", certainty: "middels", probability_success: 0.4 },
        { roleId: "cf_vekst", roleTitle: "Growth/Performance", weight: 1, position: "SEO-potensialet er sterkt og billig.", strongest_argument_against: "CAC via betalt trafikk trolig > LTV ved 79 kr/mnd.", top_risks: ["CAC/LTV"], recommendation: "Test organisk kanal først.", certainty: "middels", probability_success: 0.45 },
      ],
      synthesis: {
        summary: "Gjennomførbar idé med reelt problem, men uvalidert betalingsvilje og svak forsvarbarhet. Billig å teste – dyr å anta.",
        scorecard,
        score_drivers_up: ["Rask tid til marked", "Høy automatiseringsgrad", "Naturlig abonnementsmodell"],
        score_drivers_down: ["Uvalidert betalingsvilje", "Lav forsvarbarhet", "Churn-risiko etter første sesong"],
        weaknesses: ["Gratisalternativer finnes", "Kopierbart av forsikring/bank"],
        improvements: ["Partnerskap med forsikring som distribusjon", "Årsabonnement med boligrapport som ankerleveranse"],
        alternative_ideas: ["B2B: white-label vedlikeholdsplan for forsikringsselskap", "Nisjeversjon for hytteeiere (høyere betalingsvilje, mindre konkurranse)"],
        scenarios: [
          { name: "Beste", probability: 0.15, outcome: "5 000 betalende via SEO+partner", value_estimate: "4–5 MNOK ARR" },
          { name: "Sannsynlig", probability: 0.55, outcome: "Validering viser betalingsvilje kun hos smalt segment", value_estimate: "pivot til nisje/B2B" },
          { name: "Dårligste", probability: 0.3, outcome: "Falsk dør < 2 % konvertering", value_estimate: "stopp, tap < 5 000 kr" },
        ],
        decision: "valider_mer",
        decision_rationale: "Kritiske antakelser (betalingsvilje, churn) kan avkreftes for under 5 000 kr på 3 uker. Bygging før det er uansvarlig kapitalbruk.",
        certainty: "middels",
        assumptions_to_validate: [
          { claim: "≥3 % av besøkende legger inn kort/venteliste ved 79 kr/mnd", test: "Falsk-dør-landingsside + 300 kr/dag i annonser", threshold: "≥3 % konvertering til venteliste med pris synlig", cost_estimate: "≈4 500 kr", horizon: "3 uker" },
          { claim: "Problemet er topp-3-bekymring for nye eneboligeiere", test: "10 intervjuer med eiere < 2 år", threshold: "≥6 av 10 nevner det uoppfordret", cost_estimate: "0 kr", horizon: "2 uker" },
        ],
      },
      totalScore: 0, at: new Date().toISOString(),
    };
    p.evaluation.totalScore = Evaluation.totalScore(scorecard);
    p.status = "validering";
    p.phase = 2;
    Projects.logAssumptions(p, p.evaluation.synthesis.assumptions_to_validate.map((a) => ({ claim: a.claim, type: "krever_ekstern_validering", confidence: "lav" })), "idévurdering");
    Projects.logDecision(p, { phase: 1, role: "studioleder", decision: `Idévurdering: VALIDER_MER (score ${p.evaluation.totalScore}/100)`, options: DECISIONS, rationale: p.evaluation.synthesis.decision_rationale, risk: p.evaluation.synthesis.score_drivers_down.join("; ") });
    p.phasePlan = {
      phases: [
        { phase: 2, relevant: true, scope: "Falsk dør + intervjuer, se antakelseslogg", key_deliverables: ["Landingsside", "Intervjunotater", "Beslutningsnotat"], first_actions: ["Sett opp landingsside med pris", "Rekrutter 10 eiere"], stop_criteria: "< 2 % konvertering OG < 4/10 nevner problemet", owner_role: "Kundeinnsiktsansvarlig", risks: ["Skjevt utvalg i intervjuer"] },
        { phase: 3, relevant: true, scope: "Kun hvis validering består: enkel enhetsøkonomi", key_deliverables: ["Prismodell", "CAC/LTV-estimat"], first_actions: ["Modellér 49/79/149 kr/mnd"], stop_criteria: "LTV/CAC < 3 i alle scenarier", owner_role: "CFO/Investment", risks: ["Optimistisk churn-antakelse"] },
        { phase: 5, relevant: true, scope: "MVP-omfang etter validering", key_deliverables: ["MVP-brief v2"], first_actions: ["Revider brief med valideringsdata"], stop_criteria: "—", owner_role: "Produkt", risks: [] },
      ],
      sequencing_notes: "Alt etter fase 2 er betinget av bestått validering. Merkevare/bygging bevisst utsatt.",
      at: new Date().toISOString(),
    };
    Projects.logDecision(p, { decision: "Faseplan opprettet", rationale: p.phasePlan.sequencing_notes, role: "planmodul" });
    /* Statisk eksempel-forretningsmodell så Fase 3-flyten kan utforskes uten API-nøkkel */
    p.bizmodel = {
      model: {
        value_prop: "Vedlikeholdsplan som forebygger dyre boligskader.",
        icp: "Førstegangs eneboligeiere 30–50 år.", buyer: "Boligeieren", user: "Boligeieren",
        revenue_model: "B2C-abonnement",
        plans: [
          { name: "Basis", price_month: 79, price_year: 790, target_share: 0.7, includes: ["Vedlikeholdsplan", "Sesongvarsler"] },
          { name: "Pluss", price_month: 149, price_year: 1490, target_share: 0.3, includes: ["Alt i Basis", "Prisantydninger", "Prioritert support"] },
        ],
        free_tier: "Gratis sjekkliste for én sesong", trial: "14 dager gratis",
        assumptions: { visitors_m1: 1500, visitor_growth_pct_m: 0.08, signup_rate: 0.04, paid_conversion: 0.25, churn_monthly: 0.06, cac: 250, fixed_costs_monthly: 4000, variable_cost_per_user: 4 },
        assumption_notes: ["ALLE TALL ER UVALIDERTE TESTANTAKELSER – dette er et eksempelprosjekt", "Churn 6 %/mnd antatt over B2C-snittet pga. sesongrisiko"],
        risks: ["Churn etter første sesong kan være langt høyere"],
      },
      at: new Date().toISOString(),
    };
    BizModel.recompute(p);
    return Projects.save(p);
  },
};

/* ================= Alerts (deterministisk varselavledning – ingen LLM) ================= */
const Alerts = {
  derive() {
    const alerts = [];
    for (const p of Projects.list()) {
      const active = !["parkert", "avsluttet"].includes(p.status);
      if (!active) {
        /* Parkerte prosjekter skal ikke råtne i stillhet */
        if (p.status === "parkert") {
          const days = Math.floor((Date.now() - new Date(p.updatedAt || p.createdAt).getTime()) / 86400000);
          if (days >= 30) alerts.push({ severity: 2, type: "parkert", projectId: p.id, project: p.name, title: `Parkert i ${days} dager`, detail: "Revurder med ny informasjon – eller avslutt og høst lærdommen. Parkering er ikke en beslutning.", action: "open" });
        }
        continue;
      }
      /* Ventende port for nåværende fase */
      const phase = PHASES.find((f) => f.n === p.phase);
      if (phase && p.evaluation && !(p.gates && p.gates[phase.gate] && p.gates[phase.gate].approved)) {
        alerts.push({ severity: 1, type: "godkjenning", projectId: p.id, project: p.name, title: `Port venter: ${phase.gate}`, detail: `Fase ${p.phase} – ${phase.title}.`, action: "approve_gate", gate: phase.gate });
      }
      /* Stoppanbefaling som ikke er fulgt opp */
      const dec = (p.validation && p.validation.decision) || (p.evaluation && p.evaluation.synthesis.decision);
      if (dec === "stopp") alerts.push({ severity: 0, type: "stopp", projectId: p.id, project: p.name, title: "Anbefalt STOPP – prosjektet er fortsatt aktivt", detail: "Allerede brukt tid er ikke et argument for å fortsette.", action: "open" });
      /* Idé uten vurdering */
      if (!p.evaluation) alerts.push({ severity: 2, type: "neste_steg", projectId: p.id, project: p.name, title: "Idé uten vurdering", detail: "Kjør idévurderingen for å få beslutning og score.", action: "open" });
      /* Kapitaldisiplin: forbruk mot budsjett */
      if (p.budgetNok) {
        const cost = Projects.totalCost(p);
        if (cost.total >= p.budgetNok) {
          alerts.push({ severity: 0, type: "budsjett", projectId: p.id, project: p.name, title: `Budsjett brukt opp: ${Math.round(cost.total)} av ${p.budgetNok} kr`, detail: "Allerede brukt kapital er IKKE et argument for å fortsette. Eiervalg: sett nytt budsjett, parker eller avslutt.", action: "open" });
        } else if (cost.total >= p.budgetNok * 0.8) {
          alerts.push({ severity: 1, type: "budsjett", projectId: p.id, project: p.name, title: `Budsjett ${Math.round((cost.total / p.budgetNok) * 100)} % brukt (${Math.round(cost.total)} av ${p.budgetNok} kr)`, detail: "Planlegg beslutningen nå – ikke når kassen er tom.", action: "open" });
        }
      }
      /* Faktisk mot prognose: siste måned < 50 % av forventet MRR */
      if (p.bizmodel && (p.metrics || []).length) {
        const cmp = Metrics.compare(p);
        const last = cmp[cmp.length - 1];
        if (last && last.forecast_mrr > 0 && last.mrr < last.forecast_mrr * 0.5) {
          alerts.push({ severity: 1, type: "avvik", projectId: p.id, project: p.name, title: `MRR-avvik: ${last.mrr} kr mot prognose ${last.forecast_mrr} kr (${last.month})`, detail: "Under 50 % av sannsynlig-scenariet – vurder antakelsene på nytt.", action: "open" });
        }
      }
      /* Vakthunden: antakelser gunstigere enn bransjespennet */
      if (p.bizmodel) {
        const opt = Benchmarks.check(p.bizmodel.model.assumptions).filter((f) => f.severity === "optimistisk");
        if (opt.length) alerts.push({ severity: 2, type: "vakthund", projectId: p.id, project: p.name, title: `${opt.length} antakelse${opt.length > 1 ? "r" : ""} gunstigere enn bransjespennet`, detail: opt.map((f) => f.range.label).join("; ") + ". Se Fase 3-panelet – krever begrunnelse eller egne data.", action: "open" });
      }
      /* Fullførte eksperimenter uten portbeslutning */
      if ((p.experiments || []).length && p.experiments.every((e) => e.status === "fullført") && !p.validation) {
        alerts.push({ severity: 1, type: "neste_steg", projectId: p.id, project: p.name, title: "Valideringen er ferdig – porten er ikke evaluert", detail: "Kjør valideringsporten for å beslutte videre løp.", action: "open" });
      }
    }
    const u = Store.usage();
    if (u.totalKb / u.limitKb > 0.8) alerts.push({ severity: 1, type: "system", projectId: null, project: "System", title: `Lagring ${Math.round((u.totalKb / u.limitKb) * 100)} % full`, detail: "Eksporter og slett avsluttede prosjekter.", action: "system" });
    return alerts.sort((a, b) => a.severity - b.severity);
  },
};

/* ================= Gh (delt GitHub API-klient for Sync og Publish) =================
 * ADR: GitHub-repo som datalager valgt over Supabase (ny konto, ny leverandør) og
 * kun-eksport (ingen synk). Begrunnelse: allerede i stacken (Pages-deploy), commit-
 * historikk gir gratis revisjonsspor av hver lagring, fine-grained PAT kan begrenses
 * til ett repo. Migreringsvei: Sync/Publish er eneste forbrukere av Gh – bytt
 * implementasjon uten å røre resten. PAT lagres KUN i cf_secret_pat (utenfor eksport,
 * rapporter og synkdata). */
function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(bin);
}
function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
const Gh = {
  get pat() { return localStorage.getItem("cf_secret_pat") || ""; },
  set pat(v) { v ? localStorage.setItem("cf_secret_pat", v) : localStorage.removeItem("cf_secret_pat"); },
  async request(method, path, body) {
    if (!this.pat) throw new Error("Ingen GitHub-PAT. Legg inn under System → Synk & publisering (se DIN TUR).");
    let res;
    try {
      res = await fetch("https://api.github.com" + path, {
        method,
        headers: { authorization: "Bearer " + this.pat, accept: "application/vnd.github+json", "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (_) {
      /* fetch kastet før noe svar kom: sandkasse-CSP (forhåndsvisning), adblocker eller nettverk */
      throw new Error("Fikk ikke kontakt med GitHub. Er du i FORHÅNDSVISNINGEN på claude.ai? Den blokkerer alle eksterne kall – bruk den ekte appen (GitHub Pages eller lokalt). Ellers: sjekk nett/adblocker (api.github.com må være tilgjengelig).");
    }
    if (res.status === 404) return { status: 404, json: null };
    if (res.status === 401 || res.status === 403) throw new Error("GitHub avviste PAT-en (" + res.status + "). Sjekk at den er gyldig og har contents-tilgang til repoet.");
    const json = await res.json().catch(() => null);
    if (res.status === 409 || res.status === 422) return { status: res.status, json };
    if (!res.ok) throw new Error(`GitHub API-feil ${res.status}: ${(json && json.message) || "ukjent"}`);
    return { status: res.status, json };
  },
  async getFile(repo, path, branch) {
    const r = await this.request("GET", `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
    if (r.status === 404 || !r.json) return null;
    return { sha: r.json.sha, content: b64decodeUtf8(r.json.content || "") };
  },
  /* Privatvakt: forretningsdata skal ALDRI til et offentlig repo (D18/privacy-audit).
   * null = repoet finnes ikke / PAT mangler tilgang; ellers true/false. */
  async repoIsPrivate(repo) {
    const r = await this.request("GET", `/repos/${repo}`);
    if (r.status === 404 || !r.json || typeof r.json.private !== "boolean") return null;
    return r.json.private;
  },
  async putFile(repo, path, branch, content, message, sha) {
    const body = { message, branch, content: b64encodeUtf8(content) };
    if (sha) body.sha = sha;
    return this.request("PUT", `/repos/${repo}/contents/${path}`, body);
  },
};

/* ================= Sync (privat GitHub-repo som datalager) ================= */
const Sync = {
  DATA_PATH: "factory-data.json",
  config() { return Store.get("cf_sync", { repo: "", branch: "main", lastSyncAt: null, lastSha: null }); },
  saveConfig(patch) { const c = { ...this.config(), ...patch }; Store.set("cf_sync", c); return c; },
  status() {
    const c = this.config();
    return { configured: !!(c.repo && Gh.pat), repo: c.repo, lastSyncAt: c.lastSyncAt };
  },
  /* Privatvakt før HVER synk-operasjon: stopper både skriv og les mot offentlige
   * repoer – lesing derfra betyr at dataene allerede ligger offentlig. */
  async assertPrivate(repo) {
    const priv = await Gh.repoIsPrivate(repo);
    if (priv === null) throw new Error(`Finner ikke ${repo} (eller PAT-en mangler tilgang). Sjekk navnet under System → Synk.`);
    if (priv === false) throw new Error(`STOPP: ${repo} er OFFENTLIG. Forretningsdata skal aldri i et offentlig repo – opprett et PRIVAT datarepo (se DIN TUR) og bytt.`);
  },
  /* Push: siste-skriver-vinner, men taperen sikkerhetskopieres i repoet først */
  async push() {
    const c = this.config();
    if (!c.repo) throw new Error("Ingen datarepo konfigurert (eier-oppgave – se DIN TUR).");
    await this.assertPrivate(c.repo);
    const data = Store.exportAll();
    let r = await Gh.putFile(c.repo, this.DATA_PATH, c.branch, data, "factory: synk " + new Date().toISOString(), c.lastSha || undefined);
    if (r.status === 409 || r.status === 422) {
      /* Konflikt: en annen enhet har skrevet. Sikkerhetskopier fjernversjonen, så overskriv. */
      const remote = await Gh.getFile(c.repo, this.DATA_PATH, c.branch);
      if (remote) {
        await Gh.putFile(c.repo, `factory-data.backup-${Date.now()}.json`, c.branch, remote.content, "factory: konflikt-backup før overskriving");
        r = await Gh.putFile(c.repo, this.DATA_PATH, c.branch, data, "factory: synk (konflikt løst, siste skriver vinner) " + new Date().toISOString(), remote.sha);
        if (r.status === 409 || r.status === 422) throw new Error("Synk-konflikt kunne ikke løses automatisk. Prøv «Hent» først.");
      }
    }
    this.saveConfig({ lastSyncAt: new Date().toISOString(), lastSha: r.json && r.json.content ? r.json.content.sha : null });
    Activity.log("synk", "Data pushet til " + c.repo);
    return this.status();
  },
  async pull() {
    const c = this.config();
    if (!c.repo) throw new Error("Ingen datarepo konfigurert (eier-oppgave – se DIN TUR).");
    await this.assertPrivate(c.repo);
    const remote = await Gh.getFile(c.repo, this.DATA_PATH, c.branch);
    if (!remote) throw new Error("Fant ingen synkdata i repoet enda – kjør «Synk nå» først fra enheten som har dataene.");
    Store.importAll(remote.content);
    this.saveConfig({ lastSyncAt: new Date().toISOString(), lastSha: remote.sha });
    Activity.log("synk", "Data hentet fra " + c.repo);
    return this.status();
  },
};

/* ================= Truth (5.0): les/skriv enkeltfiler i sannhetslaget =================
 * Assistentverktøyene og flatene endrer agenda/journal/mål/modus direkte i det
 * private datarepoet – read-modify-write med sha og ett konfliktforsøk.
 * ALT går gjennom privatvakten. Kun drift-kategorier (mandatmatrisen): ingen
 * verktøy her kan sende noe eller bruke penger. */
const Truth = {
  async read(path) {
    const c = Sync.config();
    if (!c.repo || !Gh.pat) throw new Error("Sannhetslaget er ikke koblet til (PAT + datarepo under System → Synk).");
    const f = await Gh.getFile(c.repo, path, c.branch);
    return f ? { json: JSON.parse(f.content), sha: f.sha } : { json: null, sha: undefined };
  },
  async update(path, mutate, message) {
    const c = Sync.config();
    if (!c.repo || !Gh.pat) throw new Error("Sannhetslaget er ikke koblet til (PAT + datarepo under System → Synk).");
    await Sync.assertPrivate(c.repo);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { json, sha } = await this.read(path);
      const next = mutate(json);
      const r = await Gh.putFile(c.repo, path, c.branch, JSON.stringify(next, null, 2) + "\n", message, sha);
      if (r.status !== 409 && r.status !== 422) { Activity.log("sannhetslag", message + " (" + path + ")"); return next; }
      /* konflikt: les på nytt og prøv én gang til */
    }
    throw new Error("Skrivekonflikt i sannhetslaget (" + path + ") – prøv igjen.");
  },
};

/* ================= Think (tenkelaget): les-only feed fra Obsidian-vaulten =================
 * Vaulten eksponerer _dashboards/saga-export.json i sitt eget PRIVATE repo –
 * kontrakten bor i vaultens «50 Ressurser/SAGA-integrasjon.md» og feltene der
 * er avtalen: endres de, oppdateres .saga-export.py og dette panelet samtidig.
 * SAGA leser, skriver aldri. Feeden inneholder personnavn → privatvakten
 * gjelder også her, og repoet konfigureres under System (aldri hardkodet i
 * det offentlige kode-repoet). */
const Think = {
  PATH: "_dashboards/saga-export.json",
  config() { return Store.get("cf_think", { repo: "", branch: "main" }); },
  saveConfig(patch) { const c = { ...this.config(), ...patch }; Store.set("cf_think", c); return c; },
  ready() { return !!(this.config().repo && Gh.pat); },
  async fetch() {
    const c = this.config();
    if (!this.ready()) throw new Error("Vault-repo ikke konfigurert (System → Synk & publisering).");
    await Sync.assertPrivate(c.repo);
    const f = await Gh.getFile(c.repo, this.PATH, c.branch);
    return f ? JSON.parse(f.content) : null;
  },
};

/* ================= AutoSync (5.0 B3): mobil = desktop uten tenking =================
 * Regler: lokale endringer → push (debounced). Ved oppstart/fokus: rene lokale
 * data → pull; skitne → push. «Hent/Synk nå» består som manuell overstyring. */
const AutoSync = {
  timer: null,
  enabled() { return !!(Sync.config().repo && Gh.pat && Store.get("cf_autosync", true)); },
  dirty() { return localStorage.getItem("saga_dirty") === "1"; },
  markClean() { localStorage.removeItem("saga_dirty"); },
  poke() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pushSilent(), 20000);
  },
  async pushSilent() {
    if (!this.enabled() || !this.dirty()) return;
    try { await Sync.push(); this.markClean(); this.notify("Synket ↑"); }
    catch (e) { this.notify("Auto-synk feilet: " + e.message); }
  },
  async onWake() {
    if (!this.enabled()) return;
    try {
      if (this.dirty()) { await Sync.push(); this.markClean(); this.notify("Synket ↑ (lokale endringer)"); }
      else { await Sync.pull(); this.notify("Synket ↓"); }
    } catch (e) { this.notify("Auto-synk feilet: " + e.message); }
  },
  notify(msg) { if (typeof window !== "undefined" && window.OS && window.OS.syncBadge) window.OS.syncBadge(msg); },
};

/* ================= Publish (ship-path: falsk dør → live URL, bak eier-port) ================= */
const Publish = {
  config() { return Store.get("cf_publish", { repo: "", branch: "main", baseUrl: "" }); },
  saveConfig(patch) { const c = { ...this.config(), ...patch }; Store.set("cf_publish", c); return c; },
  slug(p) { return p.name.replace(/[^a-z0-9æøå]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || p.id; },
  target(p) {
    const c = this.config();
    const path = `landing/${this.slug(p)}/index.html`;
    const base = c.baseUrl || (c.repo ? `https://${c.repo.split("/")[0]}.github.io/${c.repo.split("/")[1]}` : "");
    return { repo: c.repo, branch: c.branch, path, url: base ? `${base}/landing/${this.slug(p)}/` : "" };
  },
  ready() { const c = this.config(); return !!(c.repo && Gh.pat); },
  /* Publisering er en eier-port: kalles KUN fra eierens eksplisitte klikk etter forhåndsvisning av målet */
  async landing(p) {
    if (!p.landing) throw new Error("Ingen landingsside generert.");
    const t = this.target(p);
    if (!t.repo) throw new Error("Ingen Pages-repo konfigurert (eier-oppgave – se DIN TUR).");
    const existing = await Gh.getFile(t.repo, t.path, t.branch);
    const r = await Gh.putFile(t.repo, t.path, t.branch, p.landing.html, `factory: publiser falsk dør for ${p.name}`, existing ? existing.sha : undefined);
    if (r.status === 409 || r.status === 422) throw new Error("Publisering feilet (konflikt). Prøv igjen.");
    p.landing.publishedUrl = t.url;
    p.landing.publishedAt = new Date().toISOString();
    Projects.logDecision(p, { phase: 2, role: "eier", byOwner: true, decision: "FALSK DØR PUBLISERT (eier-port)", rationale: `${t.repo}/${t.path} → ${t.url}` });
    return Projects.save(p);
  },
  liveTests() {
    return Projects.list()
      .filter((p) => p.landing && p.landing.publishedAt)
      .map((p) => ({ id: p.id, name: p.name, test: p.test, url: p.landing.publishedUrl, daysLive: Math.floor((Date.now() - new Date(p.landing.publishedAt).getTime()) / 86400000), horizon: (p.evaluation && p.evaluation.synthesis.assumptions_to_validate[0] || {}).horizon || "–", judged: !!p.validation }));
  },
};

/* ================= Funnel (inntektstrakten – fabrikkens eneste ærlige målestokk) ================= */
const Funnel = {
  compute() {
    const list = Projects.list();
    const evaluated = list.filter((p) => p.evaluation).length;
    const published = list.filter((p) => p.landing && p.landing.publishedUrl).length;
    const launched = list.filter((p) => p.status === "lansert");
    const customers = launched.reduce((s, p) => { const m = Metrics.latest(p); return s + (m ? m.customers : 0); }, 0);
    const mrr = list.reduce((s, p) => { const m = Metrics.latest(p); return s + (m ? m.mrr : 0); }, 0);
    return { evaluated, published, customers, mrr };
  },
  /* Fabrikkens egen effektivitet: hva koster hvert steg (AI-estimat) */
  efficiency() {
    const rows = Store.get("cf_costs", []);
    const sumFor = (labels) => {
      const r = rows.filter((x) => labels.includes(x.label));
      return { calls: r.length, nok: Math.round(Costs.estimateNok(r.reduce((s, x) => s + x.in, 0), r.reduce((s, x) => s + x.out, 0)) * 100) / 100 };
    };
    const evaluated = Math.max(1, Projects.list().filter((p) => p.evaluation && !p.test).length);
    const perIdea = sumFor(["inntak", "idévurdering"]);
    return {
      idea: { ...perIdea, perUnit: Math.round((perIdea.nok / evaluated) * 100) / 100 },
      validation: sumFor(["valideringsport", "landingsside"]),
      build: sumFor(["mvp-brief", "forretningsmodell", "nettsted", "app-skall", "teknisk arkitektur", "faseplan"]),
    };
  },
};

/* ================= Ranking (porteføljeprioritering – transparent formel, ingen LLM) ================= */
const Ranking = {
  /* Poeng: idéscore (0–100) + LTV/CAC-bonus + trekk for kapitalbehov, overforbruk og stillstand.
     Formelen er bevisst enkel og synlig – prioritering skal kunne etterprøves, ikke føles. */
  compute() {
    const now = Date.now();
    const rows = Projects.list()
      .filter((p) => !["avsluttet", "parkert"].includes(p.status))
      .map((p) => {
        const reasons = [];
        let pts = p.evaluation ? p.evaluation.totalScore : 0;
        reasons.push(`score ${pts}`);
        const ltvCac = p.bizmodel ? p.bizmodel.computed.scenarios.sannsynlig.ltvCac : null;
        if (ltvCac !== null) {
          const b = ltvCac >= 3 ? 15 : ltvCac >= 1 ? 0 : -15;
          pts += b; reasons.push(`LTV/CAC ${ltvCac} (${b >= 0 ? "+" : ""}${b})`);
        }
        const capital = p.bizmodel ? p.bizmodel.computed.scenarios.sannsynlig.capitalNeed : null;
        if (capital !== null && capital > 100000) { pts -= 10; reasons.push("kapitalbehov > 100k (−10)"); }
        const cost = Projects.totalCost(p);
        if (p.budgetNok && cost.total >= p.budgetNok) { pts -= 25; reasons.push("over budsjett (−25)"); }
        const daysIdle = Math.floor((now - new Date(p.updatedAt || p.createdAt).getTime()) / 86400000);
        if (daysIdle > 14) { pts -= 10; reasons.push(`${daysIdle} dager uten aktivitet (−10)`); }
        return { id: p.id, name: p.name, test: p.test, status: p.status, phase: p.phase, points: Math.round(pts), reasons, costTotal: cost.total, budget: p.budgetNok || null };
      })
      .sort((a, b) => b.points - a.points);
    return { ranked: rows.slice(0, 3), starved: rows.slice(3) };
  },
};

/* ================= Inbox (idé-innboks + AEIS-radar-kandidater) ================= */
const Inbox = {
  list() { return Store.get("cf_inbox", []); },
  add(text, source = "eier") {
    if (!text || !text.trim()) throw new Error("Tom idé.");
    const list = this.list();
    list.unshift({ id: "i" + Date.now().toString(36) + list.length % 100, text: text.trim(), source, at: new Date().toISOString() });
    Store.set("cf_inbox", list.slice(0, 50));
    Activity.log("idé", "Idé fanget i innboksen: " + text.slice(0, 60));
    return list[0];
  },
  remove(id) { Store.set("cf_inbox", this.list().filter((x) => x.id !== id)); },
  /* AEIS-radaren (LESE-kontrakt, aldri skriv): radar-funn fra hovedboken som idé-kandidater */
  radarCandidates() {
    const ledger = Store.get("aeis_ledger", []);
    const seen = new Set(this.list().map((x) => x.text));
    return (ledger || [])
      .filter((d) => d && d.radar)
      .slice(0, 3)
      .map((d) => ({ id: d.id, at: d.at, text: String(d.radar).slice(0, 500) }))
      .filter((c) => !seen.has(c.text));
  },
};

/* ================= Integrity (selvtest: dataintegritet med reparasjon) ================= */
const Integrity = {
  check() {
    const issues = [];
    const index = Store.projectIds();
    for (const id of index) {
      const p = Store.loadProject(id);
      if (!p) issues.push({ type: "manglende_prosjekt", detail: `Indeksen peker på cf_project_${id} som ikke finnes.`, fix: "reindex" });
      else if (!p.id || !p.name || !Array.isArray(p.decisions)) issues.push({ type: "korrupt_prosjekt", detail: `«${p.name || id}» mangler påkrevde felter.`, fix: null });
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("cf_project_") && !index.includes(key.replace("cf_project_", ""))) {
        issues.push({ type: "foreldreløs_nøkkel", detail: `${key} finnes, men står ikke i indeksen.`, fix: "reindex" });
      }
    }
    return { ok: issues.length === 0, issues, checked: index.length };
  },
  /* Reparasjon: bygg indeksen på nytt fra faktiske nøkler (mister aldri data) */
  repair() {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("cf_project_") && Store.get(key, null)) ids.push(key.replace("cf_project_", ""));
    }
    Store.set("cf_index", ids);
    Activity.log("system", `Selvtest reparerte indeksen (${ids.length} prosjekter).`);
    return this.check();
  },
};

/* ================= OwnerQueue («DIN TUR» – alt som venter på eieren, klikk-for-klikk) ================= */
const OwnerQueue = {
  compute() {
    const q = [];
    if (!Store.apiKey) q.push({ id: "apikey", title: "Legg inn API-nøkkel", why: "Låser opp alle AI-kjøringer (vurdering, byggekjede).", how: "platform.claude.com → API keys → Create key → lim inn under System." });
    if (!Gh.pat) q.push({ id: "pat", title: "Lag GitHub-PAT og lim inn", why: "Låser opp synk på tvers av enheter og publisering av live tester.", how: "github.com → Settings → Developer settings → Fine-grained tokens → gi KUN contents-lese/skrive til datarepoet og Pages-repoet → lim inn under System → Synk & publisering. Lagres kun i denne nettleseren, aldri i eksport." });
    if (!Sync.config().repo) q.push({ id: "syncrepo", title: "Opprett PRIVAT datarepo og angi navnet", why: "Dataene dine overlever nettleseren og synkes mellom telefon og desktop, med commit-historikk som revisjonsspor. Privat repo er sannhetslaget – forretningsdata skal aldri i det offentlige kode-repoet.", how: "github.com → New repository → «saga-data» (VELG PRIVATE) → skriv owner/saga-data under System → Synk. Appen nekter å synke mot offentlige repoer." });
    if (Sync.config().repo && Publish.config().repo && Sync.config().repo === Publish.config().repo) q.push({ id: "syncpublic", title: "KRITISK: datarepoet er det samme som det offentlige Pages-repoet", why: "Alt du synker blir offentlig lesbart. Synk er sperret til dette er rettet.", how: "Opprett et PRIVAT repo «saga-data» og skriv owner/saga-data som datarepo under System → Synk." });
    if (!Publish.config().repo) q.push({ id: "pubrepo", title: "Angi Pages-repo for live tester", why: "Falske dører publiseres til en ekte URL på minutter.", how: "Bruk et offentlig repo med GitHub Pages aktivert (f.eks. dette repoet) → skriv owner/repo under System → Publisering." });
    for (const p of Projects.list()) {
      if (p.test) continue;
      if (p.evaluation && !p.budgetNok) q.push({ id: "budget-" + p.id, title: `Sett valideringsbudsjett for «${p.name}»`, why: "Kill-terskler i penger aktiveres først når budsjettet finnes.", how: "Åpne prosjektet → 💰 Sett budsjett. Forslag: 5 000 kr.", projectId: p.id });
      if (p.landing && !p.landing.formEndpoint) q.push({ id: "form-" + p.id, title: `Skjema-endepunkt for ventelisten («${p.name}»)`, why: "Uten endepunkt samles ikke påmeldinger – testen måler ingenting.", how: "formspree.io → New form → kopier URL → regenerer landingssiden med endepunktet.", projectId: p.id });
    }
    if (!Projects.list().some((p) => !p.test)) q.push({ id: "realidea", title: "Velg fabrikkens første EKTE idé", why: "Trakten forblir null til et ekte prosjekt kjøres.", how: "Skriv idéen i Idélab (eller velg fra innboksen) og kjør fabrikken med API-nøkkelen." });
    q.push({ id: "mergemain", title: "Merge siste arbeidsbranch til main (PR)", why: "Gjør siste versjon live på GitHub Pages med fast URL.", how: "Be Claude lage PR-en, eller merge arbeidsbranchen (nå: claude/saga-3-reality) selv." });
    return q;
  },
};

/* ================= SelfReview ================= */
const SelfReview = {
  async run() {
    LLM.context = { projectId: null, label: "selvevaluering" };
    let arch = "";
    try { arch = await (await fetch("ARCHITECTURE.md")).text(); } catch (_) {}
    const stats = {
      prosjekter: Projects.list().length,
      per_status: Projects.list().reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {}),
      beslutninger: Projects.list().reduce((n, p) => n + p.decisions.length, 0),
    };
    const { text } = await LLM.call({
      system: `Du er Company Factorys selvevalueringsmodul. Evaluer fabrikken ærlig etter faktisk bruk: hva fungerte, hva var unødvendig, hvilke antakelser var feil, hva bør generaliseres til gjenbruksbiblioteket, hva bør IKKE gjenbrukes, og hvilke forbedringer gir målbar verdi (unngå selvforbedring som bare gjør systemet større). Prioriter en kort migreringsplan.`,
      user: `GJELDENDE ARKITEKTUR:\n${arch || "(utilgjengelig)"}\n\nBRUKSSTATISTIKK: ${JSON.stringify(stats)}\n\nPROSJEKTER:\n${Projects.list().map((p) => `- ${p.name} [${p.status}, fase ${p.phase}${p.test ? ", TEST" : ""}] score ${p.evaluation?.totalScore ?? "–"}`).join("\n") || "(ingen)"}`,
      maxTokens: 8192,
    });
    return text;
  },
};

/* Eksponer modulene (også for tester) */
window.CF = { Store, LLM, Truth, Think, AutoSync, Board, Pipeline, Projects, Intake, Evaluation, Experiments, Landing, BizModel, Finance, Benchmarks, SiteGen, TechArch, AppGen, Maturity, Metrics, Library, Marketing, Strategy, Legal, Ops, Report, Retro, Lessons, Activity, Costs, Alerts, Funnel, Ranking, Gh, Sync, Publish, Inbox, Integrity, OwnerQueue, Planner, Brief, Demo, SelfReview, SCHEMAS, PHASES, OWNER_GATE_ACTIONS, FACTORY_ROLES, CRITERIA, MATURITY_CHECKLISTS, COST_RATES, pool, makeZip, crc32 };
