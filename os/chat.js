/* SAGA OS – assistenten som flate OG dokk (Cmd+J). Én samtale, ett DOM-tre:
 * chat-boksen flyttes mellom Assistent-flaten og dokken (state følger med).
 * Motor: core/chat.js (window.SAGACHAT). Fullskjerm-PWA: assistant/.
 */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const { esc } = window.OS;
const C = window.SAGACHAT;

/* ---------- chat-boksen (bygges én gang) ---------- */
const box = document.createElement("div");
box.id = "chatBox";
box.innerHTML = `
  <div id="chatLog" aria-live="polite"></div>
  <div class="note" id="chatStatus"></div>
  <form id="chatForm">
    <input id="chatInput" placeholder="Spør – eller be om handling («legg idé i innboksen», «hva mener styret?»)" autocomplete="off">
    <button class="primary" type="submit" id="chatSend">↑</button>
  </form>`;

function renderLog() {
  const log = box.querySelector("#chatLog");
  const hist = C.History.list();
  log.innerHTML = hist.length
    ? hist.map((m) => `<div class="msg ${m.role === "user" ? "user" : "bot"}">${esc(m.text)}</div>`).join("")
    : `<div class="msg bot">Hei! Jeg er stabssjefen din – jeg ser fabrikken, styret og livsadmin herfra. Prøv: «status på porteføljen», «legg i agendaen: hente pakke fredag», «husk at …», «journalfør beslutningen: …», «sett feriemodus til …», «lag utkast til …» – eller still et research-spørsmål (websøk).</div>`;
  log.scrollTop = log.scrollHeight;
}

let busy = false;
box.querySelector("#chatForm").onsubmit = async (e) => {
  e.preventDefault();
  if (busy) return;
  const input = box.querySelector("#chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  busy = true;
  box.querySelector("#chatSend").disabled = true;
  const status = box.querySelector("#chatStatus");
  renderLog();
  status.textContent = "tenker …";
  try {
    await C.send(text, (t, d) => {
      if (t === "tool") status.textContent = "bruker verktøy: " + d + " …";
      if (t === "status") status.textContent = d;
      if (t === "done") status.textContent = "";
    });
  } catch (err) { status.textContent = "Feil: " + err.message; }
  busy = false;
  box.querySelector("#chatSend").disabled = false;
  renderLog();
};

/* ---------- dokken ---------- */
const dock = document.createElement("aside");
dock.id = "dock";
dock.setAttribute("aria-label", "SAGA-assistent");
dock.innerHTML = `
  <div id="dockHead">
    <b>✦ ASSISTENT</b>
    <span class="note" id="dockCtx" style="flex:1"></span>
    <button class="small" id="dockClear" title="Tøm samtalen">🗑</button>
    <button class="small" id="dockClose" title="Lukk (Cmd+J)">✕</button>
  </div>
  <div id="dockBody"></div>`;
document.body.appendChild(dock);

function dockOpen() {
  /* Mobil: dokken er et tastatur-konsept (Cmd+J/Esc). På touch finnes ingen
   * Esc, og et fullskjerms-overlegg med ✕ under statuslinjen kan ikke lukkes –
   * CHAT-fanen ER assistenten der. */
  if (window.matchMedia("(max-width: 760px)").matches) { window.OS.goTab("chat"); return; }
  /* Står eieren allerede i Assistent-flaten, gir dokken ingen mening */
  if (document.querySelector("#tab-chat.on")) return;
  $("dockBody").appendChild(box);
  const ctx = C.contextText();
  $("dockCtx").textContent = ctx ? ctx.replace("KONTEKST: ", "") : "";
  dock.classList.add("on");
  renderLog();
  box.querySelector("#chatInput").focus();
}
function dockClose() { dock.classList.remove("on"); }
function dockToggle() { dock.classList.contains("on") ? dockClose() : dockOpen(); }
$("dockClose").onclick = dockClose;
$("dockClear").onclick = () => { if (confirm("Tømme samtalen?")) { C.History.clear(); renderLog(); } };
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); dockToggle(); }
  if (e.key === "Escape" && dock.classList.contains("on")) dockClose();
});
const topBtn = document.createElement("button");
topBtn.id = "dockBtn";
topBtn.innerHTML = `✦ Assistent <kbd>Cmd J</kbd>`;
$("cmdkBtn").before(topBtn);
topBtn.onclick = dockToggle;

/* ---------- Assistent-flaten ---------- */
function renderView() {
  dockClose();
  const v = $("chatView");
  if (!v.dataset.ready) {
    v.dataset.ready = "1";
    v.innerHTML = `
      <h2>ASSISTENTEN – SER HELE SYSTEMET</h2>
      <div class="note">Verktøy: porteføljestatus, agenda, beslutningsjournal, minne, modus, lesekø, relasjoner, utkast, websøk.
        Samme samtale som i dokken (Cmd+J). Stemme og mobil-app: <a href="assistant/">åpne telefon-PWA-en →</a></div>
      <div id="chatViewSlot"></div>`;
  }
  $("chatViewSlot").appendChild(box);
  box.classList.add("tall");
  renderLog();
}
window.OS.registerView("chat", () => { box.classList.add("tall"); renderView(); });

/* Flyttes boksen til dokken skal den være kompakt */
const obs = new MutationObserver(() => { if (box.parentElement && box.parentElement.id === "dockBody") box.classList.remove("tall"); });
obs.observe(dock, { childList: true, subtree: true });
})();
