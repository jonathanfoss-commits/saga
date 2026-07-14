/*
 * AEIS end-to-end tests (Playwright + mocked Claude API).
 * Exercises the full board pipeline with no API key:
 * framing → independent analyses → devil's advocate (incl. veto) →
 * pre-mortem → CEO synthesis → ledger → outcome → scoring/weights → lessons.
 *
 * Run:  node tests/aeis.e2e.js [baseURL]   (default http://localhost:8130/)
 */
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:8130/") + "board/";
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (cond ? "" : "  → " + JSON.stringify(detail)));
  if (!cond) failures++;
}

/* system kan være streng eller blokk-array (prompt caching) */
const sysOf = (b) => (typeof b.system === "string" ? b.system : (b.system || []).map((x) => x.text).join("\n"));

const respond = (payload) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 100, cache_creation_input_tokens: 40, cache_read_input_tokens: 60 },
  }),
});

const FRAMING = {
  problem: "Bør eieren starte selskap X i marked Y?",
  unknowns: ["Reell markedsstørrelse"],
  data_needed: ["Konkurrentpriser"],
  selected_roles: ["cfo", "cso"],
  temporary_experts: [],
  rationale: "Finans og strategi er kjernen her.",
};
const ANALYSIS = (rec, p) => ({
  position: "Posisjon basert på mandatet.",
  assumptions: [{ claim: "Markedet vokser 10 % årlig", confidence: "middels" }],
  risks: ["Kapitalbinding"],
  data_gaps: [],
  recommendation: rec,
  certainty: "middels",
  probability_success: p,
  needs_more_info: false,
});
const DEVIL_OK = {
  objections: ["CAC-antakelsen er svakt underbygget"],
  untested_assumptions: ["Markedsvekst"],
  groupthink_signals: [],
  risk_underestimated: false,
  veto: false,
  veto_reason: "",
};
const DEVIL_VETO = { ...DEVIL_OK, risk_underestimated: true, veto: true, veto_reason: "Risiko vesentlig undervurdert; antakelser ikke testet." };
const PREMORTEM = {
  failure_story: "To år senere var kapitalen brent uten produkt–marked-tilpasning.",
  causes: ["For tidlig skalering"],
  missed_signals: ["Lav retensjon i pilot"],
  mitigations: ["Milepælsbasert kapitalutløsning"],
};
const SYNTHESIS = {
  summary: "Styret heller mot betinget ja.",
  disagreements: ["CFO mer forsiktig enn CSO"],
  scenarios: [
    { name: "Base", probability: 0.5, outcome: "Moderat suksess", value_estimate: "2× kapital" },
    { name: "Bull", probability: 0.2, outcome: "Sterk vekst", value_estimate: "8× kapital" },
    { name: "Bear", probability: 0.3, outcome: "Nedleggelse", value_estimate: "-70 %" },
  ],
  expected_value_reasoning: "Positiv forventet verdi gitt milepælsstyring.",
  outside_view: "Base rate: ca. 20 % av slike lanseringer når lønnsomhet innen 2 år.",
  recommendation: "Betinget JA: start med begrenset pilot.",
  certainty: "middels",
  probability_success: 0.62,
  action_plan: ["Definer pilot", "Sett kill-kriterier"],
  assumptions_to_track: [{ claim: "CAC < 500 kr", test: "Kjør 4 ukers betalt kampanje", review_horizon: "6 uker" }],
};
const POSTMORTEM = {
  what_worked: ["Milepælsstyringen"],
  what_failed: ["Kanalvalget"],
  assumptions_right: ["Markedsvekst"],
  assumptions_wrong: ["CAC-nivået"],
  process_improvements: ["Krev kanaltest før beslutning"],
  best_agents: undefined, // ikke del av skjema — fjernes under
  lesson: "Krev alltid kanaltest før markedsantakelser godtas.",
};
delete POSTMORTEM.best_agents;

function mockRouter(overrides = {}) {
  const counts = { framing: 0, analysis: 0, devil: 0, premortem: 0, synthesis: 0, postmortem: 0 };
  const bodies = [];
  const handler = (route) => {
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    const sys = sysOf(body);
    if (sys.includes("framing-modul")) { counts.framing++; return route.fulfill(respond(overrides.framing || FRAMING)); }
    if (sys.includes("Devil's Advocate i AEIS")) {
      counts.devil++;
      const payload = overrides.devilSequence ? overrides.devilSequence[Math.min(counts.devil - 1, overrides.devilSequence.length - 1)] : DEVIL_OK;
      return route.fulfill(respond(payload));
    }
    if (sys.includes("pre-mortem-modul")) { counts.premortem++; return route.fulfill(respond(PREMORTEM)); }
    if (sys.includes("CEO i AEIS")) { counts.synthesis++; return route.fulfill(respond(SYNTHESIS)); }
    if (sys.includes("post-mortem-modul")) { counts.postmortem++; return route.fulfill(respond(POSTMORTEM)); }
    if (sys.includes("Executive Board")) {
      counts.analysis++;
      const isCfo = sys.includes("Chief Financial Officer");
      return route.fulfill(respond(ANALYSIS(isCfo ? "Forsiktig ja med kapitaltak" : "Ja, posisjonen er ledig", isCfo ? 0.6 : 0.7)));
    }
    return route.fulfill(respond({ note: "ukjent kall" }));
  };
  return { handler, counts, bodies };
}

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("jarvis_api_key", "sk-ant-test");
    localStorage.setItem("aeis_profile", "Eier: Testeier. Mål: passiv inntekt. Grense: XPROFILMARKØRX.");
  });
  await page.reload({ waitUntil: "networkidle" });
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SAGA_CHROMIUM || undefined });

  /* ---------- Scenario 1: full pipeline uten veto ---------- */
  console.log("AEIS 1: full beslutningspipeline");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts, bodies } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.fill("#decTitle", "Starte selskap X?");
    await page.fill("#decContext", "Har 2 MNOK tilgjengelig.");
    await page.click("#runBtn");
    await page.waitForSelector("#verdict .panel", { timeout: 20000 });
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });

    check("framing kjørt én gang", counts.framing === 1, counts);
    check("2 uavhengige analyser (kun valgte roller)", counts.analysis === 2, counts);
    check("devil + premortem + synthesis kjørt", counts.devil === 1 && counts.premortem === 1 && counts.synthesis === 1, counts);
    const cards = await page.evaluate(() => document.querySelectorAll("#board .card").length);
    check("2 rollekort rendret", cards === 2, cards);
    const verdict = await page.evaluate(() => document.getElementById("verdict").textContent);
    check("CEO-anbefaling vises", verdict.includes("Betinget JA"), verdict.slice(0, 120));
    check("scenarier med sannsynlighet vises", verdict.includes("Bull") && verdict.includes("20%"), null);
    check("pre-mortem vises", verdict.includes("katastrofe") || verdict.includes("kapitalen brent"), null);
    const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem("aeis_ledger")));
    check("beslutningen lagret i hovedboken", ledger.length === 1 && ledger[0].synthesis.recommendation.includes("Betinget"), ledger.length);
    // Eierprofilen skal injiseres i framing, analyser, devil, pre-mortem og syntese
    const hasProfile = (marker) => bodies.some((b) =>
      sysOf(b).includes(marker) && sysOf(b).includes("XPROFILMARKØRX"));
    check("eierprofil injisert i framing", hasProfile("framing-modul"), null);
    check("eierprofil injisert i analysene", hasProfile("Executive Board"), null);
    check("eierprofil injisert hos Devil's Advocate", hasProfile("Devil's Advocate i AEIS"), null);
    check("eierprofil injisert i pre-mortem", hasProfile("pre-mortem-modul"), null);
    check("eierprofil injisert i CEO-syntesen", hasProfile("CEO i AEIS"), null);
    // Smart routing: bredde på Sonnet, dybde på Opus
    const modelOf = (marker) => (bodies.find((b) => sysOf(b).includes(marker)) || {}).model;
    check("framing rutes til Sonnet", modelOf("framing-modul") === "claude-sonnet-5", modelOf("framing-modul"));
    check("analysene rutes til Sonnet", modelOf("Executive Board") === "claude-sonnet-5", modelOf("Executive Board"));
    check("devil rutes til Opus", modelOf("Devil's Advocate i AEIS") === "claude-opus-4-8", modelOf("Devil's Advocate i AEIS"));
    check("syntesen rutes til Opus", modelOf("CEO i AEIS") === "claude-opus-4-8", modelOf("CEO i AEIS"));
    check("grunnlov+profil markert for prompt caching", bodies.every((b) => Array.isArray(b.system) && b.system[0].cache_control?.type === "ephemeral"), null);
    check("utenfra-perspektiv (base rate) vises", verdict.includes("Base rate"), null);
    const cost = ledger[0].cost;
    check("faktisk kostnad lagret på beslutningen", cost && cost.calls >= 6 && cost.usd > 0, cost);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 2: Devil's Advocate-veto utløser runde 2 ---------- */
  console.log("AEIS 2: veto → ny analyserunde");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts, bodies } = mockRouter({ devilSequence: [DEVIL_VETO, DEVIL_OK] });
    await page.route("**/v1/messages", handler);
    await page.fill("#decTitle", "Oppkjøp av konkurrent?");
    await page.click("#runBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });

    check("devil kjørt to ganger (veto + re-vurdering)", counts.devil === 2, counts);
    check("analysene kjørt i to runder (2 roller × 2)", counts.analysis === 4, counts);
    const round2HasObjections = bodies.some((b) =>
      sysOf(b).includes("Executive Board") && (b.messages?.[0]?.content || "").includes("NEDLAGT VETO"));
    check("runde 2 fikk innvendingene injisert", round2HasObjections, null);
    const veto = await page.evaluate(() => document.getElementById("verdict").textContent.includes("NEDLA VETO"));
    check("veto vises i domsslutningen", veto, null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 3: utfall → kalibrering, vekter og lærdom ---------- */
  console.log("AEIS 3: utfall → scoring + post-mortem + læringssløyfe");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, bodies } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.fill("#decTitle", "Pilotlansering?");
    await page.click("#runBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });

    // Gå til hovedboken og registrer utfall 80 %
    await page.click('nav button[data-tab="ledger"]');
    await page.click(".ledger-item");
    await page.fill("#outcomePct", "80");
    await page.fill("#outcomeNotes", "Piloten traff.");
    await page.click("#outcomeBtn");
    await page.waitForFunction(() => document.getElementById("ledgerDetail").textContent.includes("POST-MORTEM"), null, { timeout: 20000 });

    const state = await page.evaluate(() => {
      const roles = JSON.parse(localStorage.getItem("aeis_roles"));
      const cfo = roles.find((r) => r.id === "cfo");
      const cso = roles.find((r) => r.id === "cso");
      return {
        cfo: { n: cfo.track.n, w: window.AEIS.Scoring.weightOf(cfo) },
        cso: { n: cso.track.n, w: window.AEIS.Scoring.weightOf(cso) },
        lessons: window.AEIS.Ledger.lessons(5),
      };
    });
    // cfo: p=0.6, utfall=0.8 → brier 0.04 → vekt 0.25/0.09 = 2.78 → klippes til 2.0
    // cso: p=0.7, utfall=0.8 → brier 0.01 → vekt 0.25/0.06 = 4.17 → klippes til 2.0
    check("agentene ble scoret (n=1)", state.cfo.n === 1 && state.cso.n === 1, state);
    check("vekter oppdatert etter kalibrering", state.cfo.w === 2.0 && state.cso.w === 2.0, state);
    check("lærdom lagret fra post-mortem", state.lessons.length === 1 && state.lessons[0].includes("kanaltest"), state.lessons);

    // Læringssløyfen: neste sak skal få lærdommene injisert i framing-kallet
    await page.click('nav button[data-tab="boardroom"]');
    await page.fill("#decTitle", "Neste sak");
    await page.click("#runBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });
    const framingWithLessons = bodies.some((b) =>
      sysOf(b).includes("framing-modul") && sysOf(b).includes("VARIGE LÆRDOMMER") && sysOf(b).includes("kanaltest"));
    check("lærdom injiseres i fremtidige framing-kall", framingWithLessons, null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 3b: ingen horisontal smalning på mobil ---------- */
  console.log("AEIS 3b: ingen horisontal overflow på iPhone-bredde");
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("jarvis_api_key", "sk-ant-test"); });
    await page.reload({ waitUntil: "networkidle" });
    const { handler } = mockRouter();
    await page.route("**/v1/messages", handler);

    // Roller-fanen med ekstra lang rolle (verstefall for tabellbredde)
    await page.evaluate(() => window.AEIS.Roles.add(
      "Superkalifragilistisk Ekspialidosisk Direktør",
      "EtSværtLangtSammenhengendeOrdUtenMellomromSomTidligereTvangTabellenBredereEnnSkjermenOgSmalnetAltInnhold og i tillegg et veldig langt mandat med mange detaljer om alt mulig rart."));
    await page.click('nav button[data-tab="roles"]');
    await page.waitForTimeout(300);
    const rolesOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("roller-fanen fyller ikke bredere enn skjermen", rolesOverflow <= 0, rolesOverflow);

    // Full rapport i styrerommet på mobilbredde
    await page.click('nav button[data-tab="boardroom"]');
    await page.fill("#decTitle", "Mobiltest");
    await page.click("#runBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });
    const verdictOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("rapporten fyller ikke bredere enn skjermen", verdictOverflow <= 0, verdictOverflow);
    check("safe-area-polstring definert på body", await page.evaluate(() =>
      /safe-area-inset-top/.test([...document.styleSheets].flatMap(s => [...s.cssRules]).map(r => r.cssText).join(""))), null);
    /* SAGA-migrering: bakgrunnen er nå lys Tiffany-hvit (design-tokens) – sjekker konsistens, ikke mørkhet */
    check("html-bakgrunn matcher SAGA-mørketokenet (ingen lys stripe)", await page.evaluate(() =>
      getComputedStyle(document.documentElement).backgroundColor === "rgb(5, 15, 14)"), null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 4: dynamisk organisasjon ---------- */
  console.log("AEIS 4: roller kan opprettes og avvikles");
  {
    const { page, errors } = await freshPage(browser);
    await page.click('nav button[data-tab="roles"]');
    const before = await page.evaluate(() => window.AEIS.Roles.active().length);
    await page.fill("#newRoleTitle", "Real Estate Director");
    await page.fill("#newRoleMandate", "Eiendom: yield, belåning, regulering.");
    await page.click("#addRoleBtn");
    const after = await page.evaluate(() => window.AEIS.Roles.active().length);
    await page.evaluate(() => window.AEIS.Roles.retire("growth"));
    const growthActive = await page.evaluate(() => window.AEIS.Roles.byId("growth").active);
    check("ny rolle opprettet", after === before + 1, { before, after });
    check("rolle avviklet (ingen rolle er permanent)", growthActive === false, growthActive);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 5: antakelses-sjekkliste + banner ---------- */
  console.log("AEIS 5: falsifiserbare antakelser følges opp");
  {
    const { page, errors } = await freshPage(browser);
    const { handler } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.fill("#decTitle", "Antakelsestest");
    await page.click("#runBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 20000 });

    const open1 = await page.evaluate(() => window.AEIS.Ledger.openAssumptions().length);
    check("åpen antakelse registrert etter beslutning", open1 === 1, open1);
    const bannerShows = await page.evaluate(() => document.getElementById("banner").textContent.includes("antakelse"));
    check("banner varsler om åpen antakelse", bannerShows, null);

    await page.click('nav button[data-tab="ledger"]');
    await page.click(".ledger-item");
    await page.click("[data-assum='0']");
    await page.waitForTimeout(200);
    const open2 = await page.evaluate(() => window.AEIS.Ledger.openAssumptions().length);
    check("avhuking lukker antakelsen", open2 === 0, open2);
    const persisted = await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("aeis_ledger"))[0];
      return d.assumptionChecks && !!d.assumptionChecks[0];
    });
    check("avhuking persisteres i hovedboken", persisted, null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 6: radar-funn → styresak ---------- */
  console.log("AEIS 6: radar-funn kan konverteres til styresak");
  {
    const { page, errors } = await freshPage(browser);
    const RADAR_TEXT = "1. [MULIGHET] Dødsbo-markedet konsoliderer – nisje ledig\nBegrunnelse: to aktører la ned.\nNeste steg: valider med 5 samtaler.\n\n2. [RISIKO] Ny EU-forordning om AI-agenter\nKan kreve samtykkeflyt.\n";
    await page.route("**/v1/messages", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ content: [{ type: "text", text: RADAR_TEXT }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 50 } }),
    }));
    await page.click('nav button[data-tab="radar"]');
    await page.click("#radarBtn");
    await page.waitForFunction(() => document.querySelectorAll("[data-finding]").length > 0, null, { timeout: 15000 });
    const nFindings = await page.evaluate(() => document.querySelectorAll("[data-finding]").length);
    check("radar-funn parset til konverterbare kort", nFindings === 2, nFindings);
    await page.click("[data-finding='0']");
    const title = await page.evaluate(() => document.getElementById("decTitle").value);
    const ctx = await page.evaluate(() => document.getElementById("decContext").value);
    const onBoardroom = await page.evaluate(() => document.getElementById("tab-boardroom").classList.contains("on"));
    check("funnet fyller ut styresaken", title.includes("Dødsbo-markedet") && ctx.includes("valider med 5 samtaler"), { title });
    check("hopper til styrerommet", onBoardroom, null);
    const lastStamp = await page.evaluate(() => localStorage.getItem("aeis_radar_last"));
    check("radar-tidsstempel lagret", !!lastStamp, lastStamp);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 7: kryptert sky-backup (mocket GitHub) ---------- */
  console.log("AEIS 7: backup krypteres, lastes opp og kan gjenopprettes");
  {
    const { page, errors } = await freshPage(browser);
    let uploaded = null;
    await page.route("**/api.github.com/gists", (route) => {
      uploaded = JSON.parse(route.request().postData());
      route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "gist123" }) });
    });
    await page.route("**/api.github.com/gists/gist123", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json",
          body: JSON.stringify({ id: "gist123", files: { "aeis-backup.enc.json": { content: uploaded.files["aeis-backup.enc.json"].content, truncated: false } } }) });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "gist123" }) });
    });

    await page.evaluate(async () => {
      const B = window.AEIS.Backup;
      B.token = "ghp_test";
      B.pass = "korrekt hest batteri stift";
      await B.backup();
    });
    check("gist opprettet som privat", uploaded && uploaded.public === false, uploaded && uploaded.public);
    const cipher = uploaded && uploaded.files["aeis-backup.enc.json"].content;
    check("opplastingen er chiffer (ikke klartekst)", !!cipher && !cipher.includes("XPROFILMARKØRX") && cipher.includes('"data"'), null);

    const roundtrip = await page.evaluate(async () => {
      localStorage.setItem("aeis_profile", "SLETTET");
      localStorage.removeItem("aeis_ledger");
      await window.AEIS.Backup.restore();
      return { profile: window.AEIS.Store.profile, gist: window.AEIS.Backup.gistId };
    });
    check("gjenoppretting dekrypterer profilen", roundtrip.profile.includes("XPROFILMARKØRX"), roundtrip.profile.slice(0, 60));
    check("gist-id husket for senere backuper", roundtrip.gist === "gist123", roundtrip.gist);

    const wrongPass = await page.evaluate(async () => {
      window.AEIS.Backup.pass = "feil frase";
      try { await window.AEIS.Backup.restore(); return "ingen feil"; }
      catch (e) { return e.message; }
    });
    check("feil passordfrase avvises", wrongPass.includes("passordfrase"), wrongPass);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL AEIS TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
