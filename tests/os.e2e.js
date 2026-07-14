/*
 * SAGA OS-tester: skallet (flater, palett, dyp-lenker), Styret-flaten på
 * AEIS-motoren, fabrikk→styre-broen (mocket Claude API), morgenbrief-panelet
 * og assistent-dokken med kontekst.
 *
 * Run:  node tests/os.e2e.js [baseURL]   (default http://localhost:8130/)
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:8130/";
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (cond ? "" : "  → " + JSON.stringify(detail)));
  if (!cond) failures++;
}

const sysOf = (b) => (typeof b.system === "string" ? b.system : (b.system || []).map((x) => x.text).join("\n"));
const respond = (payload, extra = {}) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 100 },
    ...extra,
  }),
});

/* AEIS-styremøte: minimale gyldige svar per modul (rutes på system-markører) */
const AEIS_MOCKS = {
  framing: { problem: "Bør BoligPuls gå videre til MVP?", unknowns: ["Betalingsvilje"], data_needed: ["CAC"], selected_roles: ["cfo", "cso"], temporary_experts: [], rationale: "Finans + strategi." },
  analysis: { position: "Vurdert fra mandatet.", assumptions: [{ claim: "Markedet finnes", confidence: "middels" }], risks: ["Kapital"], data_gaps: ["CAC"], recommendation: "Fortsett kontrollert", certainty: "middels", probability_success: 0.6, needs_more_info: false },
  devil: { objections: ["Tynn validering"], untested_assumptions: ["Betalingsvilje"], groupthink_signals: [], risk_underestimated: false, veto: false, veto_reason: "" },
  premortem: { failure_story: "To år senere: churn drepte marginen.", causes: ["Feil ICP"], missed_signals: ["Lav aktivering"], mitigations: ["Terskler før skalering"] },
  synthesis: { summary: "Styret heller mot kontrollert MVP.", disagreements: ["CFO vil ha lavere kapitaltak"], scenarios: [{ name: "Basis", probability: 0.6, outcome: "Moderat vekst", value_estimate: "middels" }, { name: "Nedside", probability: 0.4, outcome: "Stopp etter test", value_estimate: "lav" }], expected_value_reasoning: "Positiv EV med tak.", outside_view: "De fleste slike abonnementer når ikke 100 kunder første året.", recommendation: "GJENNOMFØR MVP MED KAPITALTAK 25 000 KR", certainty: "middels", probability_success: 0.6, action_plan: ["Sett kapitaltak", "Definer kill-terskel"], assumptions_to_track: [{ claim: "10 betalende innen 60 dager", test: "Falsk dør + venteliste", review_horizon: "60 dager" }] },
};
function aeisHandler(route) {
  const body = JSON.parse(route.request().postData());
  const sys = sysOf(body);
  if (sys.includes("framing-modul")) return route.fulfill(respond(AEIS_MOCKS.framing));
  if (sys.includes("Devil's Advocate i AEIS")) return route.fulfill(respond(AEIS_MOCKS.devil));
  if (sys.includes("pre-mortem-modul")) return route.fulfill(respond(AEIS_MOCKS.premortem));
  if (sys.includes("CEO i AEIS")) return route.fulfill(respond(AEIS_MOCKS.synthesis));
  if (sys.includes("Executive Board")) return route.fulfill(respond(AEIS_MOCKS.analysis));
  return null; /* ikke et AEIS-kall */
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SAGA_CHROMIUM || undefined });

  /* ---------- OS 1: skallet – flater, palett, dyp-lenker ---------- */
  console.log("OS 1: én dør – alle flater, palett og dyp-lenker");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });

    const engines = await page.evaluate(() => ({ cf: !!window.CF, aeis: !!window.AEIS, saga: !!window.SAGA, os: !!(window.OS && window.OS.views.board) }));
    check("begge motorer + kjerne + flate-registry lastet i samme dokument", engines.cf && engines.aeis && engines.saga && engines.os, engines);

    const tabs = await page.evaluate(() => [...document.querySelectorAll("#mainnav button")].map((b) => b.dataset.tab));
    check("nav har alle 8 flater", ["command", "idea", "portfolio", "board", "chat", "approvals", "library", "system"].every((t) => tabs.includes(t)), tabs);

    await page.waitForFunction(() => /Nattskiftet har ikke levert|TEST|Natten var stille/.test(document.getElementById("ccBrief").textContent), null, { timeout: 5000 });
    const briefTxt = await page.evaluate(() => document.getElementById("ccBrief").textContent);
    check("morgenbrief-panelet er ærlig: demo-brief merkes TEST (eller tom-tilstand uten data)",
      briefTxt.includes("Nattskiftet har ikke levert") || briefTxt.includes("TEST"), briefTxt.slice(0, 120));

    /* Dyp lenke til styret */
    await page.goto(BASE + "#/board", { waitUntil: "networkidle" });
    check("dyp lenke #/board åpner Styret-flaten med sak-skjema",
      await page.evaluate(() => document.querySelector("#tab-board.on") && !!document.getElementById("bdTitle")), null);

    /* Palett: naviger til Assistent */
    await page.keyboard.press("Control+k");
    await page.fill("#cmdkInput", "assistent");
    await page.keyboard.press("Enter");
    check("palett navigerer til Assistent-flaten", await page.evaluate(() => !!document.querySelector("#tab-chat.on")), null);
    check("ingen JS-feil i skallet", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- OS 2: fabrikk → styre → tidslinje (mocket) ---------- */
  console.log("OS 2: selskap sendes til styret – beslutning tilbake i prosjektets tidslinje");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on("dialog", (d) => d.accept());
    await page.route("**/v1/messages", (route) => { if (!aeisHandler(route)) route.fulfill(respond({ note: "uventet" })); });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("saga_api_key", "sk-test"); });
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => window.CF.Demo.load());
    const pid = await page.evaluate(() => window.CF.Projects.list()[0].id);
    await page.goto(BASE + "#/companies/" + pid, { waitUntil: "networkidle" });

    await page.click("#pBoard");
    await page.waitForFunction(() => {
      const p = window.CF.Projects.list()[0];
      return (p.decisions || []).some((d) => d.decision.startsWith("STYRET:"));
    }, null, { timeout: 15000 });
    const flow = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      const d = window.AEIS.Ledger.list().find((x) => x.projectId === p.id);
      return {
        timeline: p.decisions.find((x) => x.decision.startsWith("STYRET:")).decision,
        ledgerLinked: !!d, ledgerProject: d && d.projectName,
        activity: window.SAGA.activity.list(10).some((a) => a.module === "aeis"),
      };
    });
    check("styrets anbefaling ligger i prosjektets tidslinje", flow.timeline.includes("KAPITALTAK"), flow);
    check("hovedboken kobler saken til selskapet", flow.ledgerLinked && flow.ledgerProject.includes("BoligPuls"), flow);
    check("felles aktivitetslogg fikk styre-innslag", flow.activity, flow);

    /* Styret-flaten viser saken med selskapskobling */
    await page.goto(BASE + "#/board", { waitUntil: "networkidle" });
    const boardShows = await page.evaluate(() => document.getElementById("boardView").textContent);
    check("Styret-flaten viser saken i hovedboken med selskaps-badge", boardShows.includes("BoligPuls"), null);
    await page.close();
  }

  /* ---------- OS 3: assistent-dokken – kontekst, tool-use, delt samtale ---------- */
  console.log("OS 3: Cmd+J-dokk med prosjektkontekst – verktøykall – samme samtale i flaten");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    let chatCalls = 0;
    const chatBodies = [];
    await page.route("**/v1/messages", (route) => {
      const body = JSON.parse(route.request().postData());
      const sys = sysOf(body);
      if (sys.includes("Du er SAGA")) {
        chatCalls++;
        chatBodies.push(body);
        if (chatCalls === 1) {
          return route.fulfill(respond("", { content: [{ type: "tool_use", id: "tu1", name: "saga_factory_status", input: {} }], stop_reason: "tool_use" }));
        }
        return route.fulfill(respond("Porteføljen (FAKTISK): 1 selskap – BoligPuls (TEST) i fase 5."));
      }
      if (!aeisHandler(route)) route.fulfill(respond({ note: "uventet" }));
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("saga_api_key", "sk-test"); });
    await page.reload({ waitUntil: "networkidle" });
    await page.evaluate(() => window.CF.Demo.load());
    const pid = await page.evaluate(() => window.CF.Projects.list()[0].id);
    await page.goto(BASE + "#/companies/" + pid, { waitUntil: "networkidle" });

    await page.keyboard.press("Control+j");
    const dockState = await page.evaluate(() => ({
      on: document.getElementById("dock").classList.contains("on"),
      ctx: document.getElementById("dockCtx").textContent,
      boxInDock: document.getElementById("chatBox").parentElement.id === "dockBody",
    }));
    check("Cmd+J åpner dokken med chat-boksen og prosjektkontekst", dockState.on && dockState.boxInDock && dockState.ctx.includes("BoligPuls"), dockState);

    await page.fill("#chatInput", "Hva er status på porteføljen?");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll("#chatLog .msg.bot").length >= 1 && document.getElementById("chatLog").textContent.includes("FAKTISK"), null, { timeout: 10000 });
    const sysHadCtx = sysOf(chatBodies[0]).includes("BoligPuls");
    check("systemprompten fikk prosjektkonteksten injisert", sysHadCtx, sysOf(chatBodies[0]).slice(-200));
    check("verktøyrunden gikk: tool_use → tool_result → svar", chatCalls === 2 && JSON.stringify(chatBodies[1].messages).includes("tool_result"), { chatCalls });

    /* Samme samtale i Assistent-flaten */
    await page.keyboard.press("Escape");
    await page.click('nav button[data-tab="chat"]');
    const shared = await page.evaluate(() => ({
      inView: document.getElementById("chatBox").closest("#tab-chat") !== null,
      text: document.getElementById("chatLog").textContent,
      persisted: (JSON.parse(localStorage.getItem("saga_chat")) || []).length,
    }));
    check("flaten viser samme samtale (boksen flyttet, historikk lagret)", shared.inView && shared.text.includes("FAKTISK") && shared.persisted >= 2, shared);
    check("kostnaden ble målt på assistent-dokken", await page.evaluate(() => (JSON.parse(localStorage.getItem("cf_costs")) || []).some((c) => c.label === "assistent-dokk")), null);
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL OS TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
