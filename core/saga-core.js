/* SAGA core – felles lag for modulene (assistant, aeis, factory).
 * Alt deles via samme origin (localStorage) – ingen backend.
 * Navnerom: saga_*. Kontrakter dokumentert i docs/architecture.md.
 */
(() => {
"use strict";
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const id = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);

/* ---------- identitet: kanonisk saga_* med legacy-fallback ---------- */
const keys = {
  get apiKey() { return localStorage.getItem("saga_api_key") || localStorage.getItem("jarvis_api_key") || ""; },
  set apiKey(v) { localStorage.setItem("saga_api_key", v); localStorage.setItem("jarvis_api_key", v); },
  get model() { return localStorage.getItem("saga_model") || localStorage.getItem("jarvis_model") || "claude-opus-4-8"; },
};

/* ---------- felles aktivitetslogg (alle moduler skriver hit) ---------- */
const activity = {
  log(module, type, message, ref) {
    const list = read("saga_activity", []);
    list.unshift({ id: id("sa"), at: new Date().toISOString(), module, type, message, ref: ref || null });
    write("saga_activity", list.slice(0, 400));
    bus.emit("activity", list[0]);
  },
  list(n = 50, module) {
    return read("saga_activity", []).filter((a) => !module || a.module === module).slice(0, n);
  },
};

/* ---------- event-bus: samme side + på tvers av åpne faner (storage-event) ---------- */
const listeners = {};
const bus = {
  on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); },
  emit(event, payload) {
    (listeners[event] || []).forEach((fn) => { try { fn(payload); } catch (_) {} });
    try { localStorage.setItem("saga_bus", JSON.stringify({ event, payload, at: Date.now() })); } catch (_) {}
  },
};
window.addEventListener("storage", (e) => {
  if (e.key !== "saga_bus" || !e.newValue) return;
  try { const { event, payload } = JSON.parse(e.newValue); (listeners[event] || []).forEach((fn) => fn(payload)); } catch (_) {}
});

/* ---------- bro: modulene kaller hverandre gjennom forespørsler ---------- */
const bridge = {
  /* Factory → assistant: be om research/analyse */
  requestResearch({ projectId, project, question }) {
    if (!question || !question.trim()) throw new Error("Tomt spørsmål.");
    const list = read("saga_requests", []);
    const req = { id: id("rq"), type: "research", status: "pending", projectId: projectId || null, project: project || "", question: question.trim(), at: new Date().toISOString(), answer: null, answeredAt: null };
    list.unshift(req);
    write("saga_requests", list.slice(0, 100));
    activity.log("factory", "forespørsel", `Research bestilt fra assistenten: ${question.slice(0, 80)}`, projectId);
    bus.emit("request", req);
    return req;
  },
  pending(type) { return read("saga_requests", []).filter((r) => r.status === "pending" && (!type || r.type === type)); },
  all(n = 50) { return read("saga_requests", []).slice(0, n); },
  /* Assistant → factory: lever svar */
  complete(reqId, answer) {
    const list = read("saga_requests", []);
    const req = list.find((r) => r.id === reqId);
    if (!req) throw new Error("Fant ikke forespørselen.");
    req.status = "done"; req.answer = answer; req.answeredAt = new Date().toISOString();
    write("saga_requests", list);
    activity.log("assistant", "svar", `Research levert: ${req.question.slice(0, 60)}`, req.projectId);
    bus.emit("request_done", req);
    return req;
  },
  resultsFor(projectId) { return read("saga_requests", []).filter((r) => r.projectId === projectId && r.status === "done"); },

  /* Assistant → factory: legg idé i innboksen (samme form som CF.Inbox) */
  addIdeaToFactory(text) {
    if (!text || !text.trim()) throw new Error("Tom idé.");
    const list = read("cf_inbox", []);
    list.unshift({ id: id("i"), text: text.trim(), source: "assistant", at: new Date().toISOString() });
    write("cf_inbox", list.slice(0, 50));
    activity.log("assistant", "idé", "Idé sendt til fabrikkens innboks: " + text.slice(0, 60));
    return list[0];
  },

  /* Assistant → factory: les porteføljestatus (lese-kontrakt mot cf_*) */
  factoryStatus() {
    const ids = read("cf_index", []);
    const projects = ids.map((pid) => read("cf_project_" + pid, null)).filter(Boolean);
    return {
      projects: projects.map((p) => ({ name: p.name, status: p.status, phase: p.phase, score: p.evaluation ? p.evaluation.totalScore : null, decision: p.validation ? p.validation.decision : p.evaluation ? p.evaluation.synthesis.decision : null, test: !!p.test, mrr: (p.metrics && p.metrics.length) ? p.metrics[p.metrics.length - 1].mrr : 0 })),
      inbox: read("cf_inbox", []).length,
      pendingResearch: bridge.pending("research").length,
    };
  },
};

/* ---------- forbedringsloop: modulene logger feil/friksjon strukturert ---------- */
const improve = {
  log(module, note, context) {
    const list = read("saga_improvements", []);
    /* dedup på module+note så gjentatte feil ikke fyller loggen */
    if (list.some((x) => x.module === module && x.note === note)) return;
    list.unshift({ id: id("im"), at: new Date().toISOString(), module, note, context: context || null, status: "åpen" });
    write("saga_improvements", list.slice(0, 100));
  },
  list() { return read("saga_improvements", []); },
  /* Eksport i improvements.md-format for `saga improve` */
  exportMd() {
    return this.list().map((x) => `## [effekt: middels] [innsats: ukjent] ${x.note}\n- Kilde: ${x.module} i appen, ${x.at}\n- Kontekst: ${x.context || "–"}\n- Status: ${x.status}\n`).join("\n");
  },
};

window.SAGA = { keys, activity, bus, bridge, improve, VERSION: "1.0" };
})();
