/*
 * SAGA smoke-tester: alle flater laster med design-tokens + kjerne, og
 * bro-flyten factory ↔ assistant ende til ende (samme origin).
 *
 * Run:  node tests/saga.e2e.js [baseURL]   (default http://localhost:8130/)
 */
const { chromium } = require("playwright");

const ROOT = process.argv[2] || "http://localhost:8130/";
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (cond ? "" : "  → " + JSON.stringify(detail)));
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 850 } });

  /* ---------- 1: alle flater laster med tokens + kjerne ---------- */
  console.log("SAGA 1: flatene laster med Tiffany-tokens og SAGA-kjernen");
  {
    const page = await ctx.newPage();
    for (const [path, label] of [["", "os-skallet"], ["board/", "styret"], ["assistant/", "assistenten"]]) {
      await page.goto(ROOT + path, { waitUntil: "networkidle" });
      const t = await page.evaluate(() => ({
        primary: getComputedStyle(document.documentElement).getPropertyValue("--saga-primary").trim(),
        core: !!(window.SAGA && window.SAGA.bridge),
      }));
      check(`${label} (/${path}): --saga-primary=#0ABAB5 og SAGA-kjernen lastet`, t.primary === "#0ABAB5" && t.core, t);
    }
    /* Rot-skallet er SAGA, ikke en modulside */
    await page.goto(ROOT, { waitUntil: "networkidle" });
    const shell = await page.evaluate(() => ({ title: document.title, app: !!document.getElementById("app") }));
    check("rot-skallet heter SAGA og har app-rammen", shell.title.includes("SAGA") && shell.app, shell);
    await page.close();
  }

  /* ---------- 2: broen factory ↔ assistant ende til ende ---------- */
  console.log("SAGA 2: research-forespørsel → assistent-chip → svar → prosjektpanel + felles logg");
  {
    const factory = await ctx.newPage();
    factory.on("dialog", (d) => d.accept("Hvor stort er markedet for boligvedlikehold i Norge?"));
    await factory.goto(ROOT, { waitUntil: "networkidle" });
    await factory.evaluate(() => { localStorage.clear(); localStorage.setItem("saga_api_key", "sk-test"); });
    await factory.reload({ waitUntil: "networkidle" });
    await factory.evaluate(() => { window.CF.Demo.load(); });
    await factory.goto(ROOT + "#/companies/" + (await factory.evaluate(() => window.CF.Projects.list()[0].id)), { waitUntil: "networkidle" });
    await factory.click("#pResearch");
    const req = await factory.evaluate(() => window.SAGA.bridge.pending("research"));
    check("forespørselen ligger i køen med prosjektreferanse", req.length === 1 && req[0].question.includes("boligvedlikehold") && !!req[0].projectId, req);
    const panel = await factory.evaluate(() => document.getElementById("detail").textContent);
    check("prosjektet viser ventende research", panel.includes("RESEARCH FRA ASSISTENTEN") && panel.includes("Venter"), null);

    /* Assistenten (samme origin, delt localStorage) ser forespørselen som chip */
    const assistant = await ctx.newPage();
    await assistant.goto(ROOT + "assistant/", { waitUntil: "networkidle" });
    const boot = await assistant.$("#boot:not(.off)");
    if (boot) await boot.click();
    await assistant.waitForSelector("#sagaResearchChip", { timeout: 8000 });
    const chipText = await assistant.evaluate(() => document.getElementById("sagaResearchChip").textContent);
    check("assistenten viser forespørsels-chip", chipText.includes("1 forespørsel"), chipText);

    /* Lever svar via broen (slik saga_answer_research-verktøyet gjør) */
    await assistant.evaluate(() => {
      const r = window.SAGA.bridge.pending("research")[0];
      window.SAGA.bridge.complete(r.id, "Estimat: 1,9 mill. småhus; vedlikeholdsmarkedet ~80 mrd kr/år (SSB/Prognosesenteret – verifiser).");
    });
    await factory.reload({ waitUntil: "networkidle" });
    const panel2 = await factory.evaluate(() => document.getElementById("detail").textContent);
    check("svaret vises i prosjektets research-panel", panel2.includes("✅") && panel2.includes("1,9 mill"), null);

    const act = await factory.evaluate(() => window.SAGA.activity.list(20).map((a) => a.module));
    check("felles aktivitetslogg har innslag fra begge moduler", act.includes("factory") && act.includes("assistant"), act.slice(0, 6));

    /* Assistant → factory: idé og status via broen */
    const ideaAndStatus = await assistant.evaluate(() => {
      window.SAGA.bridge.addIdeaToFactory("Abonnement på hyttevedlikehold.");
      return window.SAGA.bridge.factoryStatus();
    });
    check("assistenten kan legge idé i innboksen og lese porteføljestatus",
      ideaAndStatus.inbox === 1 && ideaAndStatus.projects.length === 1 && ideaAndStatus.projects[0].name.includes("BoligPuls"), ideaAndStatus);

    await factory.close();
    await assistant.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL SAGA TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
