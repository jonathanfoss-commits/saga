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

  /* ---------- OS 4: Tenkelaget – vault-feeden i cockpiten (mocket GitHub) ---------- */
  console.log("OS 4: Tenkelaget – tom-tilstand uten kobling, full render fra mocket vault-feed");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    /* Uten kobling: ærlig tom-tilstand med oppsett-instruksjon og Obsidian-lenke */
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => /Tenkelaget er ikke koblet til/.test(document.getElementById("ccThink").textContent), null, { timeout: 5000 });
    check("tom-tilstand forklarer oppsettet (vault-repo under System)",
      await page.evaluate(() => document.getElementById("ccThink").textContent.includes("vault-repoet under System")), null);

    /* Med kobling: privatvakt + feed mockes – panelet viser varsler, milepæl og rytme */
    const FEED = {
      generert: new Date().toISOString().slice(0, 10),
      beslutninger: {
        aktive: [{ tittel: "B1", revurderes: "2099-01-01", revurdering_passert: false }, { tittel: "2026-06-20 Testbeslutning", revurderes: "2026-07-10", revurdering_passert: true }],
        revurdering_passert: [{ tittel: "2026-06-20 Testbeslutning", revurderes: "2026-07-10", revurdering_passert: true }],
      },
      etterpaa: { neste_milepael: { beskrivelse: "Fase 2B verifisert", frist: "2099-08-15" }, aapne_oppgaver: 9 },
      relasjoner: { forsomte_over_30d: [{ navn: "Testperson Testesen", selskap: "Testfirma", dager_siden: 48 }] },
      moter: { aapne_aksjonspunkter: 5 },
      ukesreview_siste: "2026-W28",
      inbox_venter: 3,
    };
    await page.route("**/api.github.com/repos/o/vault", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ private: true }) }));
    await page.route("**/api.github.com/repos/o/vault/contents/**", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ sha: "abc", content: Buffer.from(JSON.stringify(FEED), "utf8").toString("base64") }),
    }));
    await page.evaluate(() => {
      localStorage.setItem("cf_secret_pat", "github_pat_test");
      localStorage.setItem("cf_think", JSON.stringify({ repo: "o/vault", branch: "main" }));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => /revurderingsdato/.test(document.getElementById("ccThink").textContent), null, { timeout: 5000 });
    const think = await page.evaluate(() => document.getElementById("ccThink").innerHTML);
    check("rødt varsel når revurdering er passert", think.includes("sev0") && think.includes("1 beslutning har passert revurderingsdato"), think.slice(0, 200));
    check("Etterpå-milepælen vises med frist og åpne oppgaver", think.includes("Fase 2B verifisert") && think.includes("9 åpne oppgaver"), null);
    check("forsømte relasjoner vises med navn og dager", think.includes("Testperson Testesen (Testfirma) – 48 dager siden"), null);
    check("rytme-tiles: aksjonspunkter, inbox, ukesreview, aktive beslutninger", think.includes(">5<") && think.includes(">3<") && think.includes("2026-W28") && think.includes(">2<"), null);
    check("ferskhet og Obsidian-lenke vises", think.includes("Generert " + FEED.generert) && think.includes("obsidian://open?vault=Obsidian%20Vault"), null);
    check("ingen JS-feil i Tenkelaget", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- OS 5: oppsett-lenken og repo-oppsett som følger synken ---------- */
  console.log("OS 5: #oppsett-lenke fyller repo-feltene (med bekreftelse) – cf_config følger eksport/import");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.accept(); });

    const cfg = { syncRepo: "o/data", pubRepo: "o/pages", thinkRepo: "o/vault" };
    const link = "#oppsett=" + Buffer.from(JSON.stringify(cfg), "utf8").toString("base64");
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + link, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });

    const state = await page.evaluate(() => ({
      sync: window.CF.Sync.config().repo, pub: window.CF.Publish.config().repo, think: window.CF.Think.config().repo,
      onSystem: !!document.querySelector("#tab-system.on"),
      pat: localStorage.getItem("cf_secret_pat"),
      fieldVals: [document.getElementById("syncRepo").value, document.getElementById("pubRepo").value, document.getElementById("thinkRepo").value],
    }));
    check("bekreftelsesdialogen viser alle tre repoene før noe lagres",
      dialogs.length === 1 && ["o/data", "o/pages", "o/vault"].every((r) => dialogs[0].includes(r)), dialogs);
    check("lenken lagrer repo-oppsettet og lander på System", state.sync === "o/data" && state.pub === "o/pages" && state.think === "o/vault" && state.onSystem, state);
    check("PAT-en settes ALDRI av en lenke", state.pat === null, state.pat);
    check("feltene på System viser det lagrede oppsettet", state.fieldVals.join(",") === "o/data,o/pages,o/vault", state.fieldVals);

    /* Avvist dialog = ingenting lagres */
    await page.evaluate(() => { localStorage.clear(); });
    const page2 = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page2.on("dialog", (d) => d.dismiss());
    await page2.goto(BASE + link, { waitUntil: "networkidle" });
    check("avvist bekreftelse lagrer ingenting",
      await page2.evaluate(() => !JSON.parse(localStorage.getItem("cf_sync") || "{}").repo && !JSON.parse(localStorage.getItem("cf_think") || "{}").repo), null);
    await page2.close();

    /* cf_config følger eksport/import (synk-formatet) – tomme verdier overskriver aldri */
    const rt = await page.evaluate(() => {
      localStorage.setItem("cf_secret_pat", "github_pat_TESTLEAK");
      window.CF.Sync.saveConfig({ repo: "o/data" }); window.CF.Publish.saveConfig({ repo: "o/pages" }); window.CF.Think.saveConfig({ repo: "o/vault" });
      const dump = window.CF.Store.exportAll();
      window.CF.Sync.saveConfig({ repo: "" }); window.CF.Publish.saveConfig({ repo: "" }); window.CF.Think.saveConfig({ repo: "" });
      window.CF.Store.importAll(dump);
      const restored = [window.CF.Sync.config().repo, window.CF.Publish.config().repo, window.CF.Think.config().repo];
      window.CF.Store.importAll(JSON.stringify({ cf_config: { syncRepo: "", pubRepo: "", thinkRepo: "" } }));
      const afterEmpty = [window.CF.Sync.config().repo, window.CF.Publish.config().repo, window.CF.Think.config().repo];
      const patLeak = window.CF.Store.exportAll().includes("github_pat");
      return { restored, afterEmpty, patLeak };
    });
    check("repo-oppsettet overlever eksport → import (ny enhet får det via pull)", rt.restored.join(",") === "o/data,o/pages,o/vault", rt);
    check("tomme cf_config-verdier overskriver aldri lokalt oppsett", rt.afterEmpty.join(",") === "o/data,o/pages,o/vault", rt);
    check("PAT-en finnes aldri i eksporten", !rt.patLeak, null);
    check("ingen JS-feil i oppsett-flyten", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- OS 6: mobil-ergonomi – assistenten og brede tabeller ---------- */
  console.log("OS 6: mobil ruter assistenten til CHAT-fanen, siden ruller aldri sidelengs, desktop-dokk kan lukkes");
  {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.clear(); window.CF.Demo.load(); });
    await page.reload({ waitUntil: "networkidle" });

    /* Assistent-knappen: aldri dokk-overlegg på touch (ingen Esc, ✕ under statuslinjen) */
    await page.click("#dockBtn");
    const mob = await page.evaluate(() => ({
      dockOn: document.getElementById("dock").classList.contains("on"),
      onChat: !!document.querySelector("#tab-chat.on"),
    }));
    check("mobil: assistent-knappen åpner CHAT-fanen, ikke dokken", !mob.dockOn && mob.onChat, mob);

    /* Brede tabeller: panelet ruller, siden gjør det aldri */
    for (const tab of ["command", "portfolio", "system"]) {
      await page.evaluate((t) => window.OS.goTab(t), tab);
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`mobil: ingen horisontal overflow på ${tab}`, over <= 2, over + "px");
    }
    check("mobil: ingen JS-feil", errors.length === 0, errors);
    await page.close();

    /* Desktop: dokken åpner og ✕ lukker den (regresjon: «klarte ikke lukke vinduet») */
    const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desk.goto(BASE, { waitUntil: "networkidle" });
    await desk.click("#dockBtn");
    const opened = await desk.evaluate(() => document.getElementById("dock").classList.contains("on"));
    await desk.click("#dockClose");
    const closed = await desk.evaluate(() => !document.getElementById("dock").classList.contains("on"));
    check("desktop: dokken åpner med knappen og lukkes med ✕", opened && closed, { opened, closed });
    await desk.close();
  }

  /* ---------- OS 7: stemme i assistenten + ledergruppe-modus i personaen ---------- */
  console.log("OS 7: 🎙 i chat-skjemaet (grasiøs degradering) – ledergruppen i systemprompten");
  {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const bodies = [];
    await page.route("**/v1/messages", (route) => {
      bodies.push(JSON.parse(route.request().postData()));
      route.fulfill(respond("CFO: tallene først. CEO: fortsett."));
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("saga_api_key", "sk-test"); });
    await page.reload({ waitUntil: "networkidle" });
    await page.click('nav button[data-tab="chat"]');

    const mic = await page.evaluate(() => {
      const b = document.getElementById("chatMic");
      const sr = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      return { exists: !!b, type: b && b.type, disabledMatchesSupport: b ? b.disabled === !sr : false };
    });
    check("🎙-knappen finnes i chat-skjemaet (type=button, aldri submit)", mic.exists && mic.type === "button", mic);
    check("uten talegjenkjenning i nettleseren er knappen ærlig deaktivert", mic.disabledMatchesSupport, mic);

    await page.fill("#chatInput", "ledergruppe: bør vi prioritere navnebytte?");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("chatLog").textContent.includes("CFO: tallene først"), null, { timeout: 10000 });
    const sys = sysOf(bodies[0]);
    check("systemprompten inneholder ledergruppe-modusen (CFO/CTO/CMO/COO + CEO-syntese)",
      sys.includes("LEDERGRUPPEN") && ["CFO", "CTO", "CMO", "COO", "CEO"].every((r) => sys.includes(r)), sys.slice(0, 120));
    check("ledergruppen er sparring – styret og journalføring nevnes som eskalering",
      sys.includes("STYRET") && sys.includes("journalføre"), null);
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL OS TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
