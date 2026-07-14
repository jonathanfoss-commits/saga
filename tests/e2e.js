/*
 * SAGA end-to-end tests (Playwright + mocked Claude API SSE stream).
 * Runs the full agentic loop without a real API key.
 *
 * Run:  npm i playwright && node tests/e2e.js [baseURL]
 * (expects the app served at baseURL, default http://localhost:8130/)
 */
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:8130/") + "assistant/";
let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  console.log((ok ? "  ✅ " : "  ❌ ") + name + (ok ? "" : "  → " + JSON.stringify(detail)));
  if (!ok) failures++;
}

function sse(events) {
  return events.map((e) => "data: " + JSON.stringify(e) + "\n").join("\n") + "\n";
}
const msgStart = (inTok) => ({ type: "message_start", message: { usage: { input_tokens: inTok } } });
const textBlock = (index, text) => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index },
];
const toolBlock = (index, id, name, inputJSON) => [
  { type: "content_block_start", index, content_block: { type: "tool_use", id, name, input: {} } },
  { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: inputJSON } },
  { type: "content_block_stop", index },
];
const msgEnd = (stopReason, outTok) => [
  { type: "message_delta", delta: { stop_reason: stopReason }, usage: { output_tokens: outTok } },
  { type: "message_stop" },
];

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("CERT")) errors.push("console: " + m.text());
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("jarvis_api_key", "sk-ant-test");
    localStorage.setItem("jarvis_speak", "0"); // no TTS in tests
    localStorage.setItem("aeis_profile", "Eier: Testeier. XPROFILMARKØRX."); // deles med AEIS
    sessionStorage.setItem("jarvis_booted", "1"); // skip boot animation if present
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.SAGA_CHROMIUM || undefined });

  /* ---------------- Scenario 1: plain streamed text ---------------- */
  console.log("Scenario 1: plain text response");
  {
    const { page, errors } = await freshPage(browser);
    const bodies = [];
    await page.route("**/v1/messages", (route) => {
      bodies.push(JSON.parse(route.request().postData()));
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sse([msgStart(120), ...textBlock(0, "God kveld, sir. Alt vel."), ...msgEnd("end_turn", 12)]),
      });
    });
    await page.fill("#textInput", "hei");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("God kveld")),
      null, { timeout: 10000 }
    );
    await page.waitForTimeout(300);
    const lastJarvis = await page.evaluate(
      () => [...document.querySelectorAll(".msg.jarvis")].pop()?.textContent || ""
    );
    const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis_history")));
    check("assistant text rendered", lastJarvis.includes("God kveld, sir"), lastJarvis);
    check("history has user+assistant", hist.length === 2 && hist[0].role === "user" && hist[1].role === "assistant", hist);
    const sysText = (b) => (typeof b.system === "string" ? b.system : (b.system || []).map((x) => x.text).join("\n"));
    check("eierprofil injisert i systemprompten", bodies.length > 0 && bodies.every((b) => sysText(b).includes("XPROFILMARKØRX")), null);
    check("systemprompt markert for prompt caching", bodies.every((b) => Array.isArray(b.system) && b.system[0].cache_control?.type === "ephemeral"), null);
    check("no JS errors", errors.length === 0, errors);
    await page.close();
  }

  /* ------------- Scenario 2: tool_use round-trip (get_datetime) ------------- */
  console.log("Scenario 2: tool_use round-trip");
  {
    const { page, errors } = await freshPage(browser);
    const requests = [];
    let call = 0;
    await page.route("**/v1/messages", (route) => {
      requests.push(JSON.parse(route.request().postData()));
      call++;
      if (call === 1) {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([
            msgStart(100),
            ...textBlock(0, "Et øyeblikk, sir."),
            ...toolBlock(1, "toolu_1", "get_datetime", "{}"),
            ...msgEnd("tool_use", 40),
          ]),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([msgStart(180), ...textBlock(0, "Klokken er slagen, sir."), ...msgEnd("end_turn", 15)]),
        });
      }
    });
    await page.fill("#textInput", "hva er klokka?");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("Klokken er slagen")),
      null, { timeout: 10000 }
    );
    const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis_history")));
    check("two API calls made", call === 2, call);
    const secondMsgs = requests[1].messages;
    const toolResultTurn = secondMsgs[secondMsgs.length - 1];
    const tr = Array.isArray(toolResultTurn.content) && toolResultTurn.content[0];
    check("tool_result sent with matching id", tr && tr.type === "tool_result" && tr.tool_use_id === "toolu_1", toolResultTurn);
    check("tool_result content is datetime JSON", tr && tr.content.includes("timezone"), tr && tr.content);
    check("history = user, asst(tool), user(result), asst(text)",
      hist.length === 4 && hist[1].content.some((b) => b.type === "tool_use") &&
      Array.isArray(hist[2].content) && hist[2].content[0].type === "tool_result",
      hist.map((h) => h.role));
    const toolChip = await page.evaluate(() => [...document.querySelectorAll(".msg.tool")].length);
    check("tool chip shown", toolChip >= 1, toolChip);
    check("no JS errors", errors.length === 0, errors);
    await page.close();
  }

  /* ------------- Scenario 3: pause_turn continues the loop ------------- */
  console.log("Scenario 3: pause_turn (server tool) resumes");
  {
    const { page, errors } = await freshPage(browser);
    let call = 0;
    await page.route("**/v1/messages", (route) => {
      call++;
      if (call === 1) {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([
            msgStart(100),
            { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } },
            { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"nyheter"}' } },
            { type: "content_block_stop", index: 0 },
            ...msgEnd("pause_turn", 30),
          ]),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: sse([msgStart(300), ...textBlock(0, "Her er nyhetene, sir."), ...msgEnd("end_turn", 20)]),
        });
      }
    });
    await page.fill("#textInput", "søk etter nyheter");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("Her er nyhetene")),
      null, { timeout: 10000 }
    );
    const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis_history")));
    check("resumed after pause_turn (2 calls)", call === 2, call);
    check("server_tool_use echoed in history",
      hist.some((h) => h.role === "assistant" && Array.isArray(h.content) &&
        h.content.some((b) => b.type === "server_tool_use" && b.input && b.input.query === "nyheter")),
      hist);
    check("no JS errors", errors.length === 0, errors);
    await page.close();
  }

  /* ------------- Scenario 4: API error rolls back cleanly ------------- */
  console.log("Scenario 4: error handling + rollback");
  {
    const { page, errors } = await freshPage(browser);
    await page.route("**/v1/messages", (route) =>
      route.fulfill({ status: 400, contentType: "application/json",
        body: JSON.stringify({ error: { message: "bad request test" } }) })
    );
    await page.fill("#textInput", "feiltest");
    await page.click("#sendBtn");
    await page.waitForSelector(".msg.error", { timeout: 10000 });
    const errText = await page.evaluate(() => document.querySelector(".msg.error").textContent);
    const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis_history") || "[]"));
    check("error surfaced to user", errText.includes("400") || errText.includes("bad request"), errText);
    check("history rolled back (no dangling user turn)", !hist.some((h) => h.content === "feiltest"), hist);
    const unexpected = errors.filter((e) => !e.includes("status of 400")); // the 400 itself is the test
    check("no JS errors", unexpected.length === 0, unexpected);
    await page.close();
  }

  /* ------------- Scenario 5: trimHistory keeps pairs intact ------------- */
  console.log("Scenario 5: history trimming safety");
  {
    const { page } = await freshPage(browser);
    const result = await page.evaluate(() => {
      history = [];
      for (let i = 0; i < 30; i++) {
        history.push({ role: "user", content: "spørsmål " + i });
        history.push({ role: "assistant", content: [{ type: "tool_use", id: "t" + i, name: "x", input: {} }] });
        history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "t" + i, content: "ok" }] });
        history.push({ role: "assistant", content: [{ type: "text", text: "svar " + i }] });
      }
      saveHistory();
      const h = history;
      return {
        len: h.length,
        firstIsUserString: h[0].role === "user" && typeof h[0].content === "string",
        noOrphanResult: h.every((turn, idx) => {
          if (turn.role !== "user" || typeof turn.content === "string") return true;
          const prev = h[idx - 1];
          return prev && prev.role === "assistant" && prev.content.some((b) => b.type === "tool_use");
        }),
      };
    });
    check("trimmed to <= 40", result.len <= 40, result.len);
    check("first turn is plain user text", result.firstIsUserString, result);
    check("no orphaned tool_result", result.noOrphanResult, result);
    await page.close();
  }

  /* ------------- Scenario 6: auto-retry on 529 overload ------------- */
  console.log("Scenario 6: auto-retry on overload");
  {
    const { page, errors } = await freshPage(browser);
    let call = 0;
    await page.route("**/v1/messages", (route) => {
      call++;
      if (call === 1) {
        route.fulfill({ status: 529, contentType: "application/json",
          body: JSON.stringify({ error: { message: "overloaded" } }) });
      } else {
        route.fulfill({ status: 200, contentType: "text/event-stream",
          body: sse([msgStart(90), ...textBlock(0, "Tilbake på nett, sir."), ...msgEnd("end_turn", 9)]) });
      }
    });
    await page.fill("#textInput", "retrytest");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("Tilbake på nett")),
      null, { timeout: 15000 }
    );
    const errBubbles = await page.evaluate(() => document.querySelectorAll(".msg.error").length);
    check("retried once and succeeded", call === 2, call);
    check("no error bubble shown", errBubbles === 0, errBubbles);
    const unexpected = errors.filter((e) => !e.includes("status of 529"));
    check("no JS errors", unexpected.length === 0, unexpected);
    await page.close();
  }

  /* ------------- Scenario 7: usage/cost tracking ------------- */
  console.log("Scenario 7: usage tracking");
  {
    const { page } = await freshPage(browser);
    await page.route("**/v1/messages", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream",
        body: sse([msgStart(1000), ...textBlock(0, "Notert, sir."), ...msgEnd("end_turn", 200)]) })
    );
    await page.fill("#textInput", "kosttest");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("Notert")),
      null, { timeout: 10000 }
    );
    await page.waitForTimeout(300);
    const usage = await page.evaluate(() => JSON.parse(localStorage.getItem("jarvis_usage")));
    check("tokens accumulated", usage && usage.tin === 1000 && usage.tout === 200, usage);
    check("cost computed (opus: 1000*5+200*25 per MTok)", usage && Math.abs(usage.cost - 0.01) < 1e-9, usage && usage.cost);
    await page.close();
  }

  /* ------------- Scenario 8: quick-action chips ------------- */
  console.log("Scenario 8: quick-action chips");
  {
    const { page } = await freshPage(browser);
    const bodies = [];
    await page.route("**/v1/messages", (route) => {
      bodies.push(JSON.parse(route.request().postData()));
      route.fulfill({ status: 200, contentType: "text/event-stream",
        body: sse([msgStart(50), ...textBlock(0, "Briefing klar, sir."), ...msgEnd("end_turn", 8)]) });
    });
    const chipCount = await page.evaluate(() => document.querySelectorAll("#chips .chip").length);
    await page.click("#chips .chip"); // first chip = daily briefing
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis")].some((e) => e.textContent.includes("Briefing klar")),
      null, { timeout: 10000 }
    );
    check("4 chips rendered", chipCount === 4, chipCount);
    check("chip sent the briefing prompt", bodies[0].messages.some(
      (m) => typeof m.content === "string" && m.content.includes("dagens briefing")), bodies[0] && bodies[0].messages);
    await page.close();
  }

  /* ------------- Scenario 9: links become clickable ------------- */
  console.log("Scenario 9: linkified URLs");
  {
    const { page } = await freshPage(browser);
    await page.route("**/v1/messages", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream",
        body: sse([msgStart(50), ...textBlock(0, "Se https://www.vg.no for detaljer, sir."), ...msgEnd("end_turn", 10)]) })
    );
    await page.fill("#textInput", "lenketest");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => [...document.querySelectorAll(".msg.jarvis a")].length > 0,
      null, { timeout: 10000 }
    );
    const href = await page.evaluate(() => document.querySelector(".msg.jarvis a").href);
    check("anchor rendered with correct href", href === "https://www.vg.no/", href);
    await page.close();
  }

  /* ------------- Scenario 10: boot sequence plays and clears ------------- */
  console.log("Scenario 10: boot sequence");
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const bootVisible = await page.waitForSelector("#boot", { timeout: 3000 }).then(() => true).catch(() => false);
    await page.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 10000 });
    check("boot overlay shown then removed", bootVisible, bootVisible);
    // second load in same session: no boot
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const bootAgain = await page.evaluate(() => !!document.getElementById("boot"));
    check("boot skipped on second load", !bootAgain, bootAgain);
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
