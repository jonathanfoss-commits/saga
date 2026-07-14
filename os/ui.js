/* Company Factory – Control Center UI.
 * Rent visningslag: all forretningslogikk bor i factory.js (window.CF).
 * Struktur: hjelpere → ruting/nav → Command Center → Godkjenninger →
 * Idélab (+ sammenligning) → Selskaper (portefølje + arbeidsområde) →
 * Bibliotek → System → kommandopalett.
 */
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const { Store, Projects, Pipeline, Board, Demo, SelfReview, Alerts, Activity, Costs, Metrics, Lessons, Library, PHASES, OWNER_GATE_ACTIONS } = window.CF;

/* ---------- hjelpere ---------- */
function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function certBadge(c) {
  const cls = c === "høy" ? "h" : c === "middels" ? "m" : "l";
  return `<span class="badge ${cls}">${esc(c)} sikkerhet</span>`;
}
function phaseTitle(n) { const f = PHASES.find((x) => x.n === n); return f ? f.title : "–"; }
function nok(n) { return n == null ? "–" : Math.round(n).toLocaleString("nb-NO") + " kr"; }
function when(iso) { return (iso || "").slice(5, 16).replace("T", " "); }

/* ---------- ruting og navigasjon ---------- */
const CRUMBS = { command: "Command Center", idea: "Idélab", portfolio: "Selskaper", approvals: "Godkjenninger", library: "Bibliotek", system: "System" };

function updateNavBadges() {
  const alerts = Alerts.derive();
  const gates = alerts.filter((a) => a.type === "godkjenning").length;
  const nA = $("navAlertCount"), nG = $("navGateCount");
  nA.hidden = alerts.length === 0; nA.textContent = alerts.length;
  nG.hidden = gates === 0; nG.textContent = gates;
}

function activateTab(name, crumbExtra) {
  document.querySelectorAll("#mainnav button").forEach((x) => x.classList.toggle("on", x.dataset.tab === name));
  document.querySelectorAll(".tab").forEach((x) => x.classList.remove("on"));
  const sec = $("tab-" + name);
  if (sec) sec.classList.add("on");
  $("crumb").innerHTML = `<b>${esc(CRUMBS[name] || name)}</b>` + (crumbExtra ? ` <span class="muted">/ ${esc(crumbExtra)}</span>` : "");
  if (name === "command") renderCommand();
  if (name === "portfolio") renderPortfolio();
  if (name === "idea") renderIdeaLab();
  if (name === "approvals") renderApprovals();
  if (name === "library" || name === "system") { renderLessons(); renderLibrary(); }
  if (name === "system") { renderStorage(); renderCosts(); renderEfficiency(); renderOwnerQueueFull(); renderSyncStatus(); }
  updateNavBadges();
}
document.querySelectorAll("#mainnav button").forEach((b) => {
  b.onclick = () => { activateTab(b.dataset.tab); history.replaceState(null, "", "#/" + b.dataset.tab); };
});
function goTab(name) { activateTab(name); history.replaceState(null, "", "#/" + name); }

/* Dype lenker: #/<tab> og #/companies/<id> */
function route() {
  const h = location.hash || "#/command";
  const m = h.match(/^#\/companies\/(.+)$/);
  if (m) { activateTab("portfolio"); showProject(m[1]); return; }
  const tab = h.replace(/^#\//, "");
  activateTab(CRUMBS[tab] ? tab : "command");
}
window.addEventListener("hashchange", route);

/* ---------- COMMAND CENTER ---------- */
function alertHtml(a) {
  return `<div class="alert sev${a.severity}">
    <div><div class="p">${esc(a.project)}</div><div class="t">${esc(a.title)}</div><div class="d">${esc(a.detail)}</div></div>
    <div class="actions">${a.action === "approve_gate" ? `<button class="small" data-al-approve="${a.projectId}" data-al-gate="${esc(a.gate)}">✅ Godkjenn (eier)</button>` : ""}${a.projectId ? `<button class="small" data-al-open="${a.projectId}">Åpne →</button>` : a.action === "system" ? `<button class="small" data-al-system>Åpne System →</button>` : ""}</div>
  </div>`;
}
function wireAlertButtons(rerender) {
  document.querySelectorAll("[data-al-open]").forEach((b) => { b.onclick = () => { goTab("portfolio"); showProject(b.dataset.alOpen); }; });
  document.querySelectorAll("[data-al-system]").forEach((b) => { b.onclick = () => goTab("system"); });
  document.querySelectorAll("[data-al-approve]").forEach((b) => {
    b.onclick = () => {
      Projects.approveGate(Projects.get(b.dataset.alApprove), b.dataset.alGate, true);
      rerender();
      updateNavBadges();
    };
  });
}

function renderOwnerQueue() {
  const q = window.CF.OwnerQueue.compute();
  $("ccOwnerQueue").innerHTML = q.length
    ? `<div class="panel" style="border-color:rgba(255,209,102,.35)"><h3>DIN TUR – ${q.length} PUNKT${q.length > 1 ? "ER" : ""} VENTER PÅ DEG</h3>` +
      q.slice(0, 4).map((x, i) => `<div class="note"><b>${i + 1}. ${esc(x.title)}</b> – ${esc(x.why)}</div>`).join("") +
      (q.length > 4 ? `<div class="note muted">… og ${q.length - 4} til.</div>` : "") +
      `<button class="small" id="oqOpen" style="margin-top:8px">Åpne hele køen med instruksjoner →</button></div>`
    : "";
  const btn = $("oqOpen");
  if (btn) btn.onclick = () => goTab("system");
}

function renderLive() {
  const live = window.CF.Publish.liveTests();
  $("ccLive").innerHTML = live.length
    ? `<h2 style="margin-top:20px">LIVE TESTER</h2>` + live.map((t) => `<div class="alert sev2"><div><div class="p">${esc(t.name)}${t.test ? ' <span class="badge test">TEST</span>' : ""}</div><div class="t"><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.url)}</a></div><div class="d">${t.daysLive} dag${t.daysLive === 1 ? "" : "er"} live · horisont: ${esc(t.horizon)} · ${t.judged ? "dømt" : "IKKE dømt enda"}</div></div><div class="actions"><button class="small" data-al-open="${t.id}">${t.judged ? "Åpne →" : "Registrer resultat →"}</button></div></div>`).join("")
    : "";
  document.querySelectorAll("#ccLive [data-al-open]").forEach((b) => { b.onclick = () => { goTab("portfolio"); showProject(b.dataset.alOpen); }; });
}

function renderCommand() {
  renderOwnerQueue();
  renderLive();
  /* Trakten: nuller vises ærlig – det er hele poenget */
  const f = window.CF.Funnel.compute();
  $("ccFunnel").innerHTML = [
    ["IDÉER VURDERT", f.evaluated, "kritisk vurdert av styret"],
    ["TESTER PUBLISERT", f.published, "falske dører live"],
    ["BETALENDE KUNDER", f.customers, "fra lanserte selskaper"],
    ["MRR", f.mrr ? nok(f.mrr) : "0 kr", "faktiske tall"],
  ].map(([k, v, d], i) => `<div class="tile"><div class="k">${i + 1}. ${k}</div><div class="v${v && v !== "0 kr" ? " accent" : ""}">${v}</div><div class="d">${d}</div></div>`).join("");

  const alerts = Alerts.derive();
  $("ccAlerts").innerHTML = alerts.length
    ? alerts.map(alertHtml).join("")
    : `<div class="panel muted">Ingenting venter på deg – fabrikken er à jour. Registrer en idé i Idélab, eller åpne et selskap.</div>`;
  wireAlertButtons(renderCommand);

  const list = Projects.list();
  const byStatus = list.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
  const totalMrr = list.reduce((s, p) => { const m = Metrics.latest(p); return s + (m ? m.mrr : 0); }, 0);
  const scored = list.filter((p) => p.evaluation && !["parkert", "avsluttet"].includes(p.status));
  const avgScore = scored.length ? Math.round(scored.reduce((s, p) => s + p.evaluation.totalScore, 0) / scored.length) : null;
  const gates = alerts.filter((a) => a.type === "godkjenning").length;
  const cost = Costs.totals();
  $("ccTiles").innerHTML = `
    <div class="tile"><div class="k">PROSJEKTER</div><div class="v accent">${list.length}</div><div class="d">${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(" · ") || "ingen enda"}</div></div>
    <div class="tile"><div class="k">SAMLET MRR</div><div class="v">${totalMrr ? nok(totalMrr) : "–"}</div><div class="d">${totalMrr ? "faktiske tall, siste måned per prosjekt" : "ingen måletall registrert"}</div></div>
    <div class="tile"><div class="k">SNITTSCORE</div><div class="v">${avgScore ?? "–"}</div><div class="d">${scored.length ? scored.length + " aktive vurderte prosjekter" : "ingen vurderte prosjekter"}</div></div>
    <div class="tile"><div class="k">VENTENDE PORTER</div><div class="v${gates ? " accent" : ""}">${gates}</div><div class="d">${gates ? "krever eiergodkjenning" : "alle porter à jour"}</div></div>
    <div class="tile"><div class="k">AI-KOSTNAD <span class="badge est">estimat</span></div><div class="v">${cost.calls ? nok(cost.estimateNok) : "–"}</div><div class="d">${cost.calls ? cost.calls + " kall · " + Math.round((cost.in + cost.out) / 1000) + "k tokens" : "ingen kall målt enda"}</div></div>`;

  /* MRR-utvikling: summert per måned på tvers av prosjekter – kun faktiske tall */
  const byMonth = {};
  for (const p of list) for (const m of p.metrics || []) byMonth[m.month] = (byMonth[m.month] || 0) + m.mrr;
  const months = Object.keys(byMonth).sort().slice(-8);
  if (months.length) {
    const max = Math.max(...months.map((m) => byMonth[m]), 1);
    const W = 320, H = 90, bw = Math.min(34, Math.floor(W / months.length) - 6);
    const bars = months.map((m, i) => {
      const h = Math.max(2, Math.round((byMonth[m] / max) * (H - 26)));
      const x = 4 + i * (bw + 6);
      return `<rect x="${x}" y="${H - 16 - h}" width="${bw}" height="${h}" rx="2" fill="#0AA79F" opacity=".9"><title>${m}: ${byMonth[m]} kr</title></rect><text x="${x + bw / 2}" y="${H - 4}" font-size="7" fill="#5E8380" text-anchor="middle">${m.slice(5)}</text>`;
    }).join("");
    $("ccMrr").innerHTML = `<div class="lbl">SUM MRR PER MÅNED (${months.length} MND)</div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="MRR per måned">${bars}</svg>`;
  } else {
    $("ccMrr").innerHTML = `<div class="muted">Ingen måletall enda. Registrer faktiske månedstall under Fase 16 i et selskap – grafen bygges kun av ekte data.</div>`;
  }

  const feed = Activity.list(8);
  $("ccActivity").innerHTML = feed.length
    ? feed.map((a) => `<div class="item"><span class="when">${esc(when(a.at))}</span><span class="badge${a.type === "eier" ? " test" : ""}">${esc(a.type)}</span><span class="what">${esc(a.message)}</span></div>`).join("")
    : `<div class="muted">Ingen aktivitet enda.</div>`;
}

/* ---------- GODKJENNINGER ---------- */
function renderApprovals() {
  const gates = Alerts.derive().filter((a) => a.type === "godkjenning");
  $("approvalsList").innerHTML = gates.length
    ? gates.map((a) => {
        const p = Projects.get(a.projectId);
        const s = p && p.evaluation && p.evaluation.synthesis;
        return `<div class="alert sev1">
          <div>
            <div class="p">${esc(a.project)}${p && p.test ? ' <span class="badge test">TEST</span>' : ""}</div>
            <div class="t">${esc(a.title)}</div>
            <div class="d">Hva: porten låser opp neste fase (${esc(a.detail)})\nHvorfor: ${s ? esc(s.decision.toUpperCase()) + " – " + esc(s.decision_rationale) : "prosjektet mangler vurdering"}\nRisiko: ${s ? esc((s.score_drivers_down || []).slice(0, 2).join("; ") || "ikke identifisert") : "–"}\nReverserbarhet: godkjenningen logges med tidspunkt; prosjektet kan når som helst parkeres eller avsluttes.</div>
          </div>
          <div class="actions">
            <button class="small" data-al-approve="${a.projectId}" data-al-gate="${esc(a.gate)}">✅ Godkjenn (eier)</button>
            <button class="small" data-al-defer="${a.projectId}" data-al-gate="${esc(a.gate)}">⏳ Utsett</button>
            <button class="small" data-al-open="${a.projectId}">Åpne →</button>
          </div>
        </div>`;
      }).join("")
    : `<div class="panel muted">Ingen ventende godkjenninger. Porter dukker opp her når et prosjekt når en beslutningsport.</div>`;
  wireAlertButtons(renderApprovals);
  document.querySelectorAll("[data-al-defer]").forEach((b) => {
    b.onclick = () => {
      Projects.logDecision(Projects.get(b.dataset.alDefer), { decision: "PORT UTSATT: " + b.dataset.alGate, rationale: "Eieren utsatte beslutningen fra godkjenningssenteret.", byOwner: true, role: "eier" });
      renderApprovals();
    };
  });
  $("gateList").textContent = OWNER_GATE_ACTIONS.map((a) => "• " + a).join("\n");
}

/* ---------- BIBLIOTEK ---------- */
function renderLessons() {
  const list = Lessons.list();
  $("lessonsList").innerHTML = list.length
    ? `<div class="panel">${list.map((l) => `• [${esc(l.project)}] ${esc(l.lesson)}`).join("\n")}</div>`
    : `<div class="panel muted">Ingen lærdommer enda – kjør 🔁 Retro på et prosjekt.</div>`;
}
function renderLibrary() {
  const list = Library.list();
  $("libraryList").innerHTML = list.length
    ? `<div class="panel"><table><tr><th>KAPABILITET</th><th>TYPE</th><th>FRA PROSJEKT</th><th></th></tr>${list.map((x) => `<tr><td>${esc(x.title)}</td><td class="muted">${esc(x.type)}</td><td class="muted">${esc(x.source)}</td><td><button class="small" data-lib="${x.id}">Fjern</button></td></tr>`).join("")}</table></div>`
    : `<div class="panel muted">Tomt – kjør 🔁 Retro på et prosjekt for å høste gjenbrukskandidater.</div>`;
  document.querySelectorAll("[data-lib]").forEach((b) => { b.onclick = () => { Library.remove(b.dataset.lib); renderLibrary(); }; });
}

/* ---------- SYSTEM ---------- */
function renderStorage() {
  const u = Store.usage();
  const pct = Math.min(100, Math.round((u.totalKb / u.limitKb) * 100));
  $("storageUsage").innerHTML = `<div class="panel${pct > 80 ? " danger" : ""}">Totalt: <b>${u.totalKb} kB</b> av ~${u.limitKb} kB (${pct} %)` +
    (u.rows.length ? `<table><tr><th>NØKKEL</th><th>STØRRELSE</th></tr>${u.rows.slice(0, 10).map((r) => `<tr><td class="muted">${esc(r.key)}</td><td>${r.kb} kB</td></tr>`).join("")}</table>` : "") + `</div>`;
}
function renderEfficiency() {
  const e = window.CF.Funnel.efficiency();
  $("efficiencyView").innerHTML = `<div class="panel"><table><tr><th>STEG</th><th>KALL</th><th>TOTAL</th><th>PER ENHET</th></tr>` +
    `<tr><td>Idé vurdert (inntak + styret)</td><td>${e.idea.calls}</td><td>${nok(e.idea.nok)}</td><td>${nok(e.idea.perUnit)}/idé</td></tr>` +
    `<tr><td>Validering (port + landingsside)</td><td>${e.validation.calls}</td><td>${nok(e.validation.nok)}</td><td class="muted">–</td></tr>` +
    `<tr><td>Byggekjede (brief→app)</td><td>${e.build.calls}</td><td>${nok(e.build.nok)}</td><td class="muted">–</td></tr>` +
    `</table><div class="note">Kun AI-kost (estimat). Testprosjekter holdes utenfor per-enhet-tallet.</div></div>`;
}

function renderOwnerQueueFull() {
  const q = window.CF.OwnerQueue.compute();
  $("ownerQueueFull").innerHTML = q.length
    ? `<div class="panel">${q.map((x, i) => `<div style="margin-bottom:14px"><b>${i + 1}. ${esc(x.title)}</b><div class="note"><b>Hvorfor:</b> ${esc(x.why)}\n<b>Slik:</b> ${esc(x.how)}</div></div>`).join("")}</div>`
    : `<div class="panel" style="border-color:rgba(123,216,143,.4)">Køen er tom – fabrikken er selvgående. 🟢</div>`;
}

function renderSyncStatus(msg) {
  const s = window.CF.Sync.status();
  const pub = window.CF.Publish.config();
  $("ghPat").value = window.CF.Gh.pat;
  $("syncRepo").value = window.CF.Sync.config().repo;
  $("pubRepo").value = pub.repo;
  $("syncStatus").textContent = msg || (s.configured
    ? `Koblet til ${s.repo}. Sist synket: ${s.lastSyncAt ? when(s.lastSyncAt) : "aldri"}.`
    : "Ikke konfigurert – se DIN TUR over for klikk-for-klikk-oppsett.");
}
$("ghSaveBtn").onclick = () => {
  const pat = $("ghPat").value.trim();
  window.CF.Gh.pat = pat;
  window.CF.Sync.saveConfig({ repo: $("syncRepo").value.trim() });
  window.CF.Publish.saveConfig({ repo: $("pubRepo").value.trim() });
  /* Fang kopieringsfeil ved lagring i stedet for ved første synk (401) */
  const patLooksOk = !pat || /^(github_pat_|ghp_)/.test(pat);
  renderSyncStatus(patLooksOk
    ? "Lagret ✓"
    : "Lagret – men PAT-en ser uvanlig ut: GitHub-tokens starter med «github_pat_» (fine-grained) eller «ghp_». Kopier på nytt med kopi-ikonet hos GitHub.");
  renderOwnerQueueFull();
  updateNavBadges();
};
$("syncPushBtn").onclick = async () => {
  $("syncPushBtn").disabled = true;
  try { await window.CF.Sync.push(); renderSyncStatus(); }
  catch (e) { renderSyncStatus("Feil: " + e.message); }
  $("syncPushBtn").disabled = false;
};
$("syncPullBtn").onclick = async () => {
  if (!confirm("Hente data fra repoet? Lokale data overskrives (eksporter først hvis du er usikker).")) return;
  $("syncPullBtn").disabled = true;
  try { await window.CF.Sync.pull(); renderSyncStatus(); renderPortfolio(); }
  catch (e) { renderSyncStatus("Feil: " + e.message); }
  $("syncPullBtn").disabled = false;
};
$("integrityBtn").onclick = () => {
  const r = window.CF.Integrity.check();
  $("integrityOut").innerHTML = r.ok
    ? `<div class="panel">🟢 ${r.checked} prosjekter sjekket – ingen avvik.</div>`
    : `<div class="panel danger">${r.issues.map((i) => `• [${esc(i.type)}] ${esc(i.detail)}`).join("\n")}\n<button class="small" id="integrityFix" style="margin-top:8px">🔧 Reparer indeksen</button></div>`;
  const fix = $("integrityFix");
  if (fix) fix.onclick = () => {
    const after = window.CF.Integrity.repair();
    $("integrityOut").innerHTML = `<div class="panel">Reparert. ${after.ok ? "🟢 Ingen gjenværende avvik." : after.issues.length + " avvik gjenstår (krever manuell vurdering)."}</div>`;
    renderPortfolio();
  };
};

function renderCosts() {
  const t = Costs.totals();
  if (!t.calls) { $("costsView").innerHTML = `<div class="panel muted">Ingen LLM-kall målt enda.</div>`; return; }
  const perProject = {};
  for (const r of Store.get("cf_costs", [])) {
    const key = r.projectId || "system";
    perProject[key] = perProject[key] || { in: 0, out: 0, calls: 0 };
    perProject[key].in += r.in; perProject[key].out += r.out; perProject[key].calls++;
  }
  $("costsView").innerHTML = `<div class="panel">Totalt: <b>${nok(t.estimateNok)}</b> <span class="badge est">estimat</span> · ${t.calls} kall · ${Math.round(t.in / 1000)}k inn / ${Math.round(t.out / 1000)}k ut` +
    `<table><tr><th>PROSJEKT</th><th>KALL</th><th>TOKENS INN/UT</th><th>ESTIMAT</th></tr>${Object.entries(perProject).map(([pid, v]) => {
      const proj = pid === "system" ? "(system)" : (Projects.get(pid) || {}).name || pid;
      return `<tr><td>${esc(proj)}</td><td>${v.calls}</td><td class="muted">${Math.round(v.in / 1000)}k / ${Math.round(v.out / 1000)}k</td><td>${nok(Costs.estimateNok(v.in, v.out))}</td></tr>`;
    }).join("")}</table></div>`;
}

/* ---------- SELSKAPER: portefølje ---------- */
function renderRanking() {
  const { ranked, starved } = window.CF.Ranking.compute();
  if (!ranked.length) { $("ranking").innerHTML = `<div class="panel muted">Ingen aktive prosjekter å prioritere.</div>`; return; }
  $("ranking").innerHTML = `<div class="panel"><table><tr><th>#</th><th>PROSJEKT</th><th>POENG</th><th>FORMEL</th><th>KOST / BUDSJETT</th></tr>` +
    ranked.map((r, i) => `<tr class="proj-item" data-id="${r.id}"><td>${i + 1}</td><td>${esc(r.name)}${r.test ? ' <span class="badge test">TEST</span>' : ""}</td><td><b>${r.points}</b></td><td class="muted">${r.reasons.map(esc).join(" · ")}</td><td class="muted">${nok(r.costTotal)}${r.budget ? " / " + nok(r.budget) : " / –"}</td></tr>`).join("") + `</table>` +
    (starved.length ? `<div class="note" style="margin-top:8px"><b>Får IKKE ressurser nå:</b> ${starved.map((r) => esc(r.name) + " (" + r.points + "p)").join(" · ")}</div>` : "") + `</div>`;
  document.querySelectorAll("#ranking .proj-item").forEach((tr) => { tr.onclick = () => showProject(tr.dataset.id); });
}

function renderPortfolio() {
  renderRanking();
  const list = Projects.list();
  if (!list.length) {
    $("portfolio").innerHTML = `<div class="panel muted">Ingen prosjekter enda. Registrer en idé i Idélab, eller last eksempelprosjektet under System.</div>`;
    $("detail").innerHTML = "";
    return;
  }
  const byStatus = list.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
  const totalMrr = list.reduce((sum, p) => { const m = Metrics.latest(p); return sum + (m ? m.mrr : 0); }, 0);
  $("portfolio").innerHTML = `<div class="note" style="margin-bottom:8px">${list.length} prosjekt${list.length === 1 ? "" : "er"} · ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(" · ")}${totalMrr ? ` · <b style="color:var(--cyan)">samlet MRR: ${nok(totalMrr)}</b>` : ""}</div>` +
    `<table><tr><th>PROSJEKT</th><th>STATUS</th><th>FASE</th><th>SCORE</th><th>NESTE BESLUTNING</th><th>OPPDATERT</th></tr>` +
    list.map((p) => {
      const next = p.evaluation ? (p.evaluation.synthesis.decision === "valider_mer" ? "gjennomfør validering" : p.evaluation.synthesis.decision) : "kjør idévurdering";
      return `<tr class="proj-item" data-id="${p.id}"><td>${esc(p.name)}${p.test ? ' <span class="badge test">TEST</span>' : ""}</td><td>${esc(p.status)}</td><td>${p.phase}: ${esc(phaseTitle(p.phase))}</td><td>${p.evaluation ? p.evaluation.totalScore + "/100" : "–"}</td><td class="muted">${esc(next)}</td><td class="muted">${esc((p.updatedAt || "").slice(0, 10))}</td></tr>`;
    }).join("") + "</table>";
  document.querySelectorAll(".proj-item").forEach((tr) => { tr.onclick = () => showProject(tr.dataset.id); });
}

/* Fasestripe: 17 faser – nåværende, godkjente porter og planlagt relevans (kun sanne data) */
function phaseStrip(p) {
  const relevant = new Set(((p.phasePlan && p.phasePlan.phases) || []).filter((f) => f.relevant).map((f) => f.phase));
  const segs = PHASES.map((f) => {
    const done = p.gates && p.gates[f.gate] && p.gates[f.gate].approved;
    const cls = ["seg", f.n === p.phase ? "cur" : "", done ? "done" : "", relevant.has(f.n) ? "rel" : ""].filter(Boolean).join(" ");
    return `<span class="${cls}" title="${f.n}: ${esc(f.title)} · port: ${esc(f.gate)}${done ? " ✓ godkjent" : ""}${f.n === p.phase ? " · NÅVÆRENDE" : ""}"></span>`;
  }).join("");
  return `<div class="phasestrip">${segs}</div><div class="striplegend"><span><i style="background:var(--cyan)"></i>nåværende</span><span><i style="background:var(--green);opacity:.75"></i>port godkjent</span><span><i style="background:#17435f"></i>i planen</span></div>`;
}

/* ---------- SELSKAPER: arbeidsområde ---------- */
function showProject(id) {
  const p = Projects.get(id);
  if (!p) return;
  history.replaceState(null, "", "#/companies/" + id);
  $("crumb").innerHTML = `<b>Selskaper</b> <span class="muted">/ ${esc(p.name)}</span>`;
  const s = p.evaluation && p.evaluation.synthesis;
  const cost = Projects.totalCost(p);
  const overBudget = p.budgetNok && cost.total >= p.budgetNok;
  let html = `<div class="panel"><h3>${esc(p.name)}${p.test ? ' <span class="badge test">TEST – ISOLERT EKSEMPELPROSJEKT</span>' : ""}</h3>` +
    phaseStrip(p) +
    `<div class="row"><div>Status: <b>${esc(p.status)}</b></div><div>Fase: <b>${p.phase} – ${esc(phaseTitle(p.phase))}</b></div><div>Modenhet: <b>${esc(p.maturity || "–")}</b></div>` +
    `<div>Kost: <b${overBudget ? ' style="color:var(--red)"' : ""}>${nok(cost.total)}</b><span class="badge est">estimat + faktisk</span>${p.budgetNok ? ` / budsjett ${nok(p.budgetNok)}` : ""}</div>` +
    (p.evaluation ? `<div>Score: <span class="score">${p.evaluation.totalScore}</span>/100</div>` : "") + `</div>` +
    (overBudget ? `<div class="note" style="color:var(--red)"><b>BUDSJETT BRUKT OPP.</b> Allerede brukt kapital er ikke et argument for å fortsette. Velg: sett nytt budsjett, parker eller avslutt.</div>` : "") +
    `<div class="note">Idé: ${esc(p.idea)}</div>` +
    `<div class="row" style="margin-top:10px">` +
    `<button class="small" id="pResume">▶ Kjør videre</button>` +
    `<button class="small" id="pBudget">💰 ${p.budgetNok ? "Endre budsjett" : "Sett budsjett"} (eier)</button>` +
    `<button class="small" id="pExpense">+ Utgift</button>` +
    `<button class="small" id="pGate">✅ Godkjenn port (eier): ${esc((PHASES.find((f) => f.n === p.phase) || {}).gate || "")}</button>` +
    `<button class="small" id="pResearch">🧠 Be assistenten om research</button>` +
    `<button class="small" id="pReport">📄 Rapport</button>` +
    `<button class="small" id="pRetro">🔁 Retro</button>` +
    `<button class="small" id="pExport">Eksporter prosjekt</button>` +
    (p.status === "parkert" || p.status === "avsluttet"
      ? `<button class="small" id="pReactivate">▶ Reaktiver (eier)</button>`
      : `<button class="small" id="pPark">⏸ Parker (eier)</button><button class="small" id="pKill">🛑 Avslutt (eier)</button>`) +
    `<button class="small" id="pDelete">Slett data</button></div></div>`;

  if (p.intake) {
    html += `<div class="panel"><h3>FASE 0 – INNTAK</h3>Problem: ${esc(p.intake.problem)}\nMålgruppe: ${esc(p.intake.target_group)}\nLøsning: ${esc(p.intake.solution)}\nBetalingsvilje: ${esc(p.intake.willingness_to_pay)}\nMarked: ${esc(p.intake.market)}\nKanal: ${esc(p.intake.channel)}\nAbonnementspotensial: ${esc(p.intake.subscription_potential)}` +
      (p.intake.decision_changing_questions.length ? `\n\nSpørsmål som kan endre beslutningen:\n- ${p.intake.decision_changing_questions.map(esc).join("\n- ")}` : "") + `</div>`;
  }
  if (s) {
    html += `<div class="panel"><h3>FASE 1 – STYRETS BESLUTNING ${certBadge(s.certainty)}</h3><b style="color:var(--cyan)">${esc(s.decision.toUpperCase())}</b> – ${esc(s.decision_rationale)}\n\n${esc(s.summary)}\n\nTrekker opp: ${s.score_drivers_up.map(esc).join("; ")}\nTrekker ned: ${s.score_drivers_down.map(esc).join("; ")}</div>`;
    html += `<div class="panel"><h3>SCOREKORT (${p.evaluation.totalScore}/100)</h3><table><tr><th>KRITERIUM</th><th>SCORE</th><th>BEGRUNNELSE</th></tr>${s.scorecard.map((r) => `<tr><td>${esc(r.criterion)}</td><td>${r.score}/10</td><td class="muted">${esc(r.reasoning)}</td></tr>`).join("")}</table></div>`;
    if (s.weaknesses.length || s.improvements.length || s.alternative_ideas.length) {
      html += `<div class="panel danger"><h3>SVAKHETER, FORBEDRINGER OG ALTERNATIVER</h3>Svakheter:\n- ${s.weaknesses.map(esc).join("\n- ") || "(ingen)"}\n\nForbedringer:\n- ${s.improvements.map(esc).join("\n- ") || "(ingen)"}\n\nAlternative idéer fra samme innsikt:\n- ${s.alternative_ideas.map(esc).join("\n- ") || "(ingen)"}</div>`;
    }
    html += `<div class="panel"><h3>SCENARIER</h3><table><tr><th>SCENARIO</th><th>SANNSYNLIGHET</th><th>UTFALL</th><th>VERDI</th></tr>${s.scenarios.map((x) => `<tr><td>${esc(x.name)}</td><td>${Math.round(x.probability * 100)}%</td><td>${esc(x.outcome)}</td><td>${esc(x.value_estimate)}</td></tr>`).join("")}</table></div>`;
    if (s.assumptions_to_validate.length) {
      html += `<div class="panel"><h3>KRITISKE ANTAKELSER → BILLIGSTE TEST</h3><table><tr><th>ANTAKELSE</th><th>TEST</th><th>TERSKEL</th><th>KOSTNAD</th><th>HORISONT</th></tr>${s.assumptions_to_validate.map((a) => `<tr><td>${esc(a.claim)}</td><td>${esc(a.test)}</td><td>${esc(a.threshold)}</td><td>${esc(a.cost_estimate)}</td><td>${esc(a.horizon)}</td></tr>`).join("")}</table></div>`;
    }
    html += `<div class="panel"><h3>ROLLENES VURDERINGER</h3><table><tr><th>ROLLE</th><th>POSISJON</th><th>STERKESTE MOTARGUMENT</th><th>ANBEFALING</th><th>P</th></tr>${p.evaluation.verdicts.map((v) => `<tr><td>${esc(v.roleTitle)}</td><td class="muted">${esc(v.position)}</td><td class="muted">${esc(v.strongest_argument_against)}</td><td>${esc(v.recommendation)}</td><td>${typeof v.probability_success === "number" ? Math.round(v.probability_success * 100) + "%" : "–"}</td></tr>`).join("")}</table></div>`;
  }
  /* FASE 2 – markedsvalidering */
  const dec = s && s.decision;
  if (p.experiments || (s && ["valider_mer", "prototype", "mvp", "lansering"].includes(dec))) {
    let v = `<div class="panel"><h3>FASE 2 – MARKEDSVALIDERING</h3>`;
    if (!p.experiments) {
      v += `<div class="note">Terskler defineres FØR resultatene finnes. Opprett eksperimentkøen direkte fra de kritiske antakelsene (ingen API-kostnad).</div><button class="small" id="expCreate" style="margin-top:8px">🧪 Opprett eksperimenter fra antakelsene</button>`;
    } else {
      v += `<table><tr><th>ANTAKELSE</th><th>TEST / TERSKEL</th><th>KOSTNAD / HORISONT</th><th>STATUS</th><th>RESULTAT</th></tr>` +
        p.experiments.map((x) => `<tr><td>${esc(x.claim)}</td><td class="muted">${esc(x.test)}<br><b>Terskel:</b> ${esc(x.threshold)}</td><td class="muted">${esc(x.cost_estimate)} / ${esc(x.horizon)}</td><td>${x.status === "fullført" ? (x.passed ? '<span class="badge h">BESTÅTT</span>' : '<span class="badge l">IKKE BESTÅTT</span>') : esc(x.status)}</td><td>${x.status === "fullført" ? esc(x.result) : `<input type="text" class="exp-result" data-exp="${x.id}" placeholder="Faktisk resultat …"><div class="row" style="margin-top:6px"><button class="small exp-pass" data-exp="${x.id}">✓ Bestått</button><button class="small exp-fail" data-exp="${x.id}">✗ Ikke bestått</button></div>`}</td></tr>`).join("") + `</table>`;
      if (p.experiments.some((x) => x.status === "fullført") && !p.validation) {
        v += `<button class="small" id="valReview" style="margin-top:10px">⚖ Evaluer valideringen (port)</button>`;
      }
    }
    v += `<div class="row" style="margin-top:10px">` +
      (p.landing ? `<button class="small" id="lpPreview">👁 Forhåndsvis landingsside</button><button class="small" id="lpDownload">⬇ Last ned landingsside (HTML)</button>` : `<button class="small" id="lpGen">🌐 Generer falsk-dør-landingsside</button>`) + `</div>`;
    if (p.landing) {
      v += `<div class="note">«${esc(p.landing.content.headline)}» – ${esc(p.landing.content.price_line)}. Selvstendig HTML uten eksterne avhengigheter.${p.landing.formEndpoint ? "" : " NB: legg inn et skjema-endepunkt (f.eks. Formspree) før reell trafikk – uten det lagres påmeldinger kun i besøkerens nettleser."}</div>`;
      if (p.landing.publishedUrl) {
        v += `<div class="note">🟢 LIVE: <a href="${esc(p.landing.publishedUrl)}" target="_blank" rel="noopener">${esc(p.landing.publishedUrl)}</a> (publisert ${esc((p.landing.publishedAt || "").slice(0, 10))}) <button class="small" id="lpPublish" style="margin-left:8px">↻ Publiser på nytt (eier-port)</button></div>`;
      } else if (window.CF.Publish.ready()) {
        v += `<button class="small" id="lpPublish" style="margin-top:8px">🚀 Publiser falsk dør (eier-port)</button>`;
      } else {
        v += `<div class="note">Publisering til live URL krever GitHub-oppsett – se DIN TUR under System.</div>`;
      }
    }
    v += `</div>`;
    if (p.validation) {
      v += `<div class="panel"><h3>VALIDERINGSPORT ${certBadge(p.validation.certainty)}</h3><b style="color:var(--cyan)">${esc(p.validation.decision.toUpperCase())}</b> – ${esc(p.validation.decision_rationale)}\n\n${esc(p.validation.summary)}` +
        `<table><tr><th>ANTAKELSE</th><th>DOM</th><th>KONSEKVENS</th></tr>${p.validation.per_experiment.map((x) => `<tr><td>${esc(x.claim)}</td><td>${x.verdict === "bestått" ? '<span class="badge h">bestått</span>' : x.verdict === "ikke_bestått" ? '<span class="badge l">ikke bestått</span>' : '<span class="badge m">uklart</span>'}</td><td class="muted">${esc(x.implication)}</td></tr>`).join("")}</table>` +
        `\nNeste steg:\n- ${p.validation.next_steps.map(esc).join("\n- ")}</div>`;
    }
    html += v;
  }
  /* FASE 3 – forretningsmodell */
  const buildableNow = s && (["prototype", "mvp", "lansering"].includes(dec) || (p.validation && ["prototype", "mvp", "lansering"].includes(p.validation.decision)));
  if (p.bizmodel || buildableNow) {
    let v = `<div class="panel"><h3>FASE 3 – FORRETNINGSMODELL</h3>`;
    if (!p.bizmodel) {
      v += `<div class="note">LLM setter nøkterne antakelser med begrunnelse – all matematikk (MRR, break-even, LTV/CAC, kapitalbehov) beregnes deterministisk i kode og kan rekalkuleres gratis.</div><button class="small" id="bmGen" style="margin-top:8px">💰 Lag forretningsmodell</button>`;
    } else {
      const m = p.bizmodel.model, sc = p.bizmodel.computed.scenarios;
      v += `${esc(m.value_prop)}\nICP: ${esc(m.icp)} · Kjøper: ${esc(m.buyer)} · Inntektsmodell: ${esc(m.revenue_model)}\nGratisnivå: ${esc(m.free_tier)} · Prøve: ${esc(m.trial)}` +
        `<table><tr><th>PLAN</th><th>PRIS/MND</th><th>PRIS/ÅR</th><th>ANDEL</th><th>INKLUDERER</th></tr>${m.plans.map((pl) => `<tr><td>${esc(pl.name)}</td><td>${nok(pl.price_month)}</td><td>${nok(pl.price_year)}</td><td>${Math.round(pl.target_share * 100)}%</td><td class="muted">${pl.includes.map(esc).join("; ")}</td></tr>`).join("")}</table>` +
        `<table><tr><th>SCENARIO (24 MND) <span class="badge est">estimat</span></th><th>KUNDER</th><th>MRR</th><th>BREAK-EVEN</th><th>KAPITALBEHOV</th><th>LTV</th><th>LTV/CAC</th></tr>` +
        ["konservativ", "sannsynlig", "offensiv"].map((k) => `<tr><td>${k}</td><td>${sc[k].customers24}</td><td>${nok(sc[k].mrr24)}</td><td>${sc[k].breakEvenMonth ? "mnd " + sc[k].breakEvenMonth : '<span class="badge l">ikke innen 24 mnd</span>'}</td><td>${nok(sc[k].capitalNeed)}</td><td>${nok(sc[k].ltv)}</td><td>${sc[k].ltvCac ?? "–"}${sc[k].ltvCac !== null ? (sc[k].ltvCac >= 3 ? ' <span class="badge h">ok</span>' : ' <span class="badge l">svak</span>') : ""}</td></tr>`).join("") + `</table>` +
        `<div class="note">Antakelser (begrunnet):\n${m.assumption_notes.map((n) => "• " + esc(n)).join("\n")}</div>` +
        `<div class="row" style="margin-top:10px">` +
        [["visitors_m1", "Besøk mnd 1"], ["visitor_growth_pct_m", "Vekst/mnd (0–1)"], ["signup_rate", "Reg.rate (0–1)"], ["paid_conversion", "Betalt konv. (0–1)"], ["churn_monthly", "Churn/mnd (0–1)"], ["cac", "CAC (kr)"]].map(([k, lbl]) => `<div><div class="note">${lbl}</div><input type="text" class="bm-in" data-k="${k}" value="${m.assumptions[k]}"></div>`).join("") +
        `</div><button class="small" id="bmUpdate" style="margin-top:8px">↻ Rekalkuler lokalt (gratis)</button>`;

      /* Usikkerhetsvifte: Monte Carlo over antakelsene – ESTIMAT, metoden er enkel med vilje */
      const sim = window.CF.Finance.simulate({ ...m.assumptions, price_avg: p.bizmodel.computed.price_avg }, 300);
      const W = 340, H = 110, maxY = Math.max(...sim.mrr.p90, 1);
      const X = (i) => 6 + (i / (sim.months - 1)) * (W - 12);
      const Y = (val) => H - 18 - (val / maxY) * (H - 30);
      const line = (arr) => arr.map((val, i) => `${X(i)},${Y(val)}`).join(" ");
      const band = sim.mrr.p90.map((val, i) => `${X(i)},${Y(val)}`).join(" ") + " " + [...sim.mrr.p10].reverse().map((val, i) => `${X(sim.months - 1 - i)},${Y(val)}`).join(" ");
      v += `<h3 style="margin-top:14px">USIKKERHETSVIFTE – MRR 24 MND <span class="badge est">estimat · ${sim.runs} simuleringer</span></h3>` +
        `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="MRR-usikkerhetsvifte"><polygon points="${band}" fill="#0AA79F" opacity=".16"/><polyline points="${line(sim.mrr.p50)}" fill="none" stroke="#0AA79F" stroke-width="1.6"/><polyline points="${line(sim.mrr.p10)}" fill="none" stroke="#5E8380" stroke-width=".8" stroke-dasharray="3 3"/><polyline points="${line(sim.mrr.p90)}" fill="none" stroke="#5E8380" stroke-width=".8" stroke-dasharray="3 3"/><text x="${W - 4}" y="${Y(sim.mrr.p50[sim.months - 1]) - 4}" font-size="8" fill="#8FB3B0" text-anchor="end">P50 ${Math.round(sim.mrr.p50[sim.months - 1] / 1000)}k</text></svg>` +
        `<div class="note">MRR måned 24: P10 ${nok(sim.mrr.p10[23])} · P50 ${nok(sim.mrr.p50[23])} · P90 ${nok(sim.mrr.p90[23])}. Kapitalbehov: P10 ${nok(sim.capital.p10)} · P50 ${nok(sim.capital.p50)} · P90 ${nok(sim.capital.p90)}. Spenn per parameter: ±${Object.values(window.CF.Finance.SIM_SPREADS).map((x) => Math.round(x * 100) + "%").join("/±")}.</div>`;

      /* Vakthunden: antakelser mot bransjespenn */
      const findings = window.CF.Benchmarks.check(m.assumptions);
      v += `<h3 style="margin-top:14px">VAKTHUNDEN – ANTAKELSER MOT BRANSJESPENN</h3>`;
      v += findings.length
        ? findings.map((fd) => `<div class="note">${fd.severity === "optimistisk" ? '<span class="badge l">OPTIMISTISK</span>' : '<span class="badge m">forsiktig</span>'} ${esc(fd.note)}</div>`).join("")
        : `<div class="note"><span class="badge h">innenfor</span> Alle antakelser ligger innenfor bransjespennene.</div>`;
      v += `<div class="note muted" style="font-size:10px">${esc(window.CF.Benchmarks.SOURCE)}</div>`;
    }
    html += v + `</div>`;
  }
  /* FASE 4 – selskap og strategi */
  if (p.strategy || buildableNow) {
    let v = `<div class="panel"><h3>FASE 4 – SELSKAP OG STRATEGI</h3>`;
    if (!p.strategy) {
      v += `<div class="note">Navn, posisjonering, prioriteringer, 90-dagers og 12-måneders plan – og en eksplisitt ikke-gjøre-liste. Selskapsregistrering, varemerker og domener er eier-porter som kommer senere.</div><button class="small" id="stGen" style="margin-top:8px">🧭 Utarbeid strategi</button>`;
    } else {
      const st = p.strategy;
      v += `<b style="color:var(--cyan)">${esc(st.working_name)}</b> (${esc(st.category)})\n${esc(st.positioning)}\n\nLøfte: ${esc(st.promise)}\nDifferensiering: ${esc(st.differentiation)}\nNavnealternativer: ${st.name_alternatives.map(esc).join(", ")}\n\nMission: ${esc(st.mission)}\nVision: ${esc(st.vision)}\nVerdier: ${st.values.map(esc).join(" · ")}\n\n90 dager:\n- ${st.plan_90_days.map(esc).join("\n- ")}\n\n12 måneder:\n- ${st.plan_12_months.map(esc).join("\n- ")}\n\n3-årig retning: ${esc(st.direction_3_years)}\n\n<b>Skal IKKE gjøre:</b>\n- ${st.not_doing.map(esc).join("\n- ")}`;
    }
    html += v + `</div>`;
  }
  /* FASE 7 – teknisk arkitektur */
  if (p.techarch || buildableNow) {
    let v = `<div class="panel"><h3>FASE 7 – TEKNISK ARKITEKTUR</h3>`;
    if (!p.techarch) {
      v += `<div class="note">Velger teknologi ut fra produktets faktiske behov – med vurderte alternativer, kostnadsestimat, leverandørbinding og migreringsvei per valg. Lister også hva som IKKE trengs enda.</div><button class="small" id="taGen" style="margin-top:8px">🏗 Velg teknisk arkitektur</button>`;
    } else {
      const t = p.techarch;
      v += `${esc(t.summary)}\nEstimert totalkostnad: <b>${esc(t.total_monthly_cost_estimate)}</b>` +
        `<table><tr><th>OMRÅDE</th><th>VALG</th><th>HVORFOR</th><th>ALTERNATIVER</th><th>KOST/MND</th><th>BINDING</th></tr>${t.choices.map((c) => `<tr><td>${esc(c.area)}</td><td><b>${esc(c.choice)}</b></td><td class="muted">${esc(c.why)}</td><td class="muted">${c.alternatives_considered.map(esc).join(", ")}</td><td>${esc(c.monthly_cost_estimate)}</td><td>${c.lock_in_risk === "høy" ? '<span class="badge l">høy</span>' : c.lock_in_risk === "middels" ? '<span class="badge m">middels</span>' : '<span class="badge h">lav</span>'}</td></tr>`).join("")}</table>` +
        `\nTrengs IKKE enda:\n- ${t.not_needed_yet.map(esc).join("\n- ")}\n\nSikkerhet:\n- ${t.security_notes.map(esc).join("\n- ")}`;
    }
    html += v + `</div>`;
  }
  /* FASE 6+8 – nettstedet */
  if (p.site || buildableNow) {
    let v = `<div class="panel"><h3>FASE 6+8 – NETTSTED</h3>`;
    if (!p.site) {
      v += `<div class="note">Genererer komplett statisk nettsted: forside, pris (fra forretningsmodellens planer), FAQ, om oss, vilkår/personvern (merket som utkast) og deploy-README. Selvstendig HTML uten eksterne avhengigheter.</div><button class="small" id="siteGen" style="margin-top:8px">🌐 Generer nettsted</button>`;
    } else {
      v += `«${esc(p.site.content.hero_headline)}» – ${esc(p.site.content.brand.slogan)}\nFiler: ${Object.keys(p.site.files).map(esc).join(", ")}` +
        `<div class="row" style="margin-top:10px"><button class="small" id="sitePreview">👁 Forhåndsvis forsiden</button><button class="small" id="siteZip">⬇ Last ned nettstedet (ZIP)</button></div>` +
        `<div class="note">Betalingsknappene er plassholdere til Stripe Payment Links legges inn (eier-port). Juridiske sider er utkast som krever advokat. Se README-deploy.md i pakken.</div>`;
    }
    html += v + `</div>`;
  }
  /* FASE 8+9 – app-skall */
  if (p.app || p.brief) {
    let v = `<div class="panel"><h3>FASE 8+9 – APP-SKALL</h3>`;
    if (!p.app) {
      v += `<div class="note">Genererer deploybar app-pakke fra MVP-briefen: SPA med innlogging/onboarding/dashboard/abonnement (ærlig demo-modus uten konfigurasjon), Supabase-skjema med RLS, Stripe-webhook-mal og oppsett-README. Supabase/Stripe-oppkobling er eier-porter.</div><button class="small" id="appGen" style="margin-top:8px">📱 Generer app-skall</button>`;
    } else {
      v += `«${esc(p.app.content.app_name)}» – ${esc(p.app.content.welcome_line)}\nFiler: ${Object.keys(p.app.files).map(esc).join(", ")}\nAktiveringsmetrikk: <b>${esc(p.app.content.activation_metric)}</b>` +
        `<div class="row" style="margin-top:10px"><button class="small" id="appPreview">👁 Forhåndsvis (demo-modus)</button><button class="small" id="appZip">⬇ Last ned app-pakken (ZIP)</button></div>` +
        `<div class="note">Uten config kjører appen i tydelig merket demo-modus. Reell auth/betaling krever Supabase + Stripe (eier-porter) – se README-app.md i pakken.</div>`;
    }
    html += v + `</div>`;
  }
  /* FASE 10 – juridisk */
  if (p.legal || buildableNow) {
    let v = `<div class="panel danger"><h3>FASE 10 – JURIDISK, PERSONVERN OG SIKKERHET</h3>`;
    if (!p.legal) {
      v += `<div class="note">Kartlegger krav: selskapsform, vilkår, GDPR, forbrukerrettigheter, markedsføringsregler, MVA/regnskap. All output er generell veiledning – punkter som krever fagperson merkes tydelig.</div><button class="small" id="lgGen" style="margin-top:8px">⚖️ Kartlegg juridiske krav</button>`;
    } else {
      v += `<b>${esc(p.legal.disclaimer)}</b>\n\nSelskapsform: ${esc(p.legal.company_form_notes)}\nMVA/skatt: ${esc(p.legal.vat_tax_notes)}` +
        `<table><tr><th>OMRÅDE</th><th>KRAV</th><th>GJELDER FORDI</th><th>FAGPERSON</th></tr>${p.legal.requirements.map((r) => `<tr><td>${esc(r.area)}</td><td>${esc(r.requirement)}</td><td class="muted">${esc(r.applies_because)}</td><td>${r.must_be_verified_by_professional ? '<span class="badge l">KREVES</span>' : '<span class="badge">nei</span>'}</td></tr>`).join("")}</table>` +
        `<h3 style="margin-top:14px">PERSONDATA</h3><table><tr><th>DATA</th><th>FORMÅL</th><th>GRUNNLAG</th><th>LAGRINGSTID</th></tr>${p.legal.privacy_data.map((d) => `<tr><td>${esc(d.data)}</td><td class="muted">${esc(d.purpose)}</td><td class="muted">${esc(d.legal_basis)}</td><td class="muted">${esc(d.retention)}</td></tr>`).join("")}</table>` +
        `\nHandlingsliste:\n- ${p.legal.action_list.map(esc).join("\n- ")}`;
    }
    html += v + `</div>`;
  }
  /* FASE 11 – markedsføring */
  if (p.marketing || buildableNow) {
    let v = `<div class="panel"><h3>FASE 11 – MARKEDSFØRING</h3>`;
    if (!p.marketing) {
      v += `<div class="note">Prioritert kanalstrategi ut fra målgruppe og økonomi – ikke alle kanaler fordi de finnes. Masseutsendelser og betalte kampanjer forblir eier-porter.</div><button class="small" id="mkGen" style="margin-top:8px">📣 Bygg markedsføringsmotor</button>`;
    } else {
      const mk = p.marketing;
      v += `Kjernebudskap: <b>${esc(mk.core_message)}</b>\n${esc(mk.budget_notes)}` +
        `<table><tr><th>#</th><th>KANAL</th><th>HVORFOR</th><th>CAC-HYPOTESE</th></tr>${mk.channel_strategy.sort((a, b) => a.priority - b.priority).map((c) => `<tr><td>${c.priority}</td><td>${esc(c.channel)}</td><td class="muted">${esc(c.why)}</td><td class="muted">${esc(c.cac_hypothesis)}</td></tr>`).join("")}</table>` +
        `<h3 style="margin-top:14px">EKSPERIMENTKØ</h3><table><tr><th>HYPOTESE</th><th>TEST</th><th>MÅL/TERSKEL</th></tr>${mk.experiment_queue.map((x) => `<tr><td>${esc(x.hypothesis)}</td><td class="muted">${esc(x.test)}</td><td class="muted">${esc(x.metric)} – ${esc(x.threshold)}</td></tr>`).join("")}</table>` +
        `<h3 style="margin-top:14px">INNHOLDSKALENDER</h3><table><tr><th>UKE</th><th>TEMA</th><th>FORMAT</th><th>KANAL</th></tr>${mk.content_calendar.map((c) => `<tr><td>${c.week}</td><td>${esc(c.theme)}</td><td class="muted">${esc(c.format)}</td><td class="muted">${esc(c.channel)}</td></tr>`).join("")}</table>` +
        `\nLanseringsplan:\n- ${mk.launch_plan.map(esc).join("\n- ")}\n\nE-postsekvens: ${mk.email_sequence.map((m) => `dag ${m.day}: ${esc(m.subject)}`).join(" · ")}`;
    }
    html += v + `</div>`;
  }
  /* FASE 13 – drift */
  if (p.ops || buildableNow) {
    let v = `<div class="panel"><h3>FASE 13 – DRIFT OG KUNDESERVICE</h3>`;
    if (!p.ops) {
      v += `<div class="note">Grunnlag for drift med minst mulig manuelt arbeid: supportkanaler, FAQ-frø, svarmaler, eskalering, hendelses-runbook, månedlig gjennomgang, leverandøroversikt og automatiseringskandidater.</div><button class="small" id="opsGen" style="margin-top:8px">🛠 Bygg driftsgrunnlag</button>`;
    } else {
      const o = p.ops;
      v += `Supportkanaler: ${o.support_channels.map(esc).join(" · ")}\n\nEskalering:\n- ${o.escalation_rules.map(esc).join("\n- ")}\n\nHendelses-runbook:\n- ${o.incident_runbook.map(esc).join("\n- ")}` +
        `<h3 style="margin-top:14px">SVARMALER</h3><table><tr><th>SAK</th><th>MAL</th></tr>${o.reply_templates.map((t) => `<tr><td>${esc(t.name)}</td><td class="muted">${esc(t.text)}</td></tr>`).join("")}</table>` +
        `<h3 style="margin-top:14px">LEVERANDØRER</h3><table><tr><th>LEVERANDØR</th><th>FORMÅL</th><th>KOSTNAD</th></tr>${o.vendor_list.map((x) => `<tr><td>${esc(x.vendor)}</td><td class="muted">${esc(x.purpose)}</td><td class="muted">${esc(x.cost_note)}</td></tr>`).join("")}</table>` +
        `\nMånedlig gjennomgang:\n- ${o.monthly_review_checklist.map(esc).join("\n- ")}\n\nBør automatiseres:\n- ${o.automation_candidates.map(esc).join("\n- ")}`;
    }
    html += v + `</div>`;
  }
  /* FASE 14/15 – modenhet */
  if (p.brief || p.site || p.maturity) {
    const next = window.CF.Maturity.next(p);
    let v = `<div class="panel"><h3>FASE 14/15 – MODENHET OG KVALITETSPORTER</h3>Stige: ${window.CF.Maturity.LADDER.map((l) => (p.maturity === l ? `<b style="color:var(--cyan)">${esc(l)}</b>` : (l === next ? `<u>${esc(l)}</u>` : esc(l)))).join(" → ")}`;
    if (next) {
      const cl = window.CF.Maturity.checklist(Projects.get(p.id), next);
      v += `<h3 style="margin-top:14px">SJEKKLISTE FOR «${esc(next).toUpperCase()}»</h3>` +
        cl.items.map((it, i) => `<label style="display:block; margin:6px 0; cursor:pointer"><input type="checkbox" class="mat-check" data-idx="${i}" ${it.done ? "checked" : ""}> ${esc(it.text)}</label>`).join("") +
        `<button class="small" id="matDeclare" ${cl.items.every((i) => i.done) ? "" : "disabled"} style="margin-top:8px">✅ Erklær «${esc(next)}» (eier)</button>` +
        `<div class="note">Ingenting erklæres ferdig når kritiske punkter mangler. Erklæringen logges som eierbeslutning.</div>`;
    } else {
      v += `<div class="note" style="margin-top:8px">Høyeste modenhetsnivå er nådd. Lanseringsklart digitalt produkt ≠ juridisk etablert, operativ eller kommersielt validert virksomhet – de stegene har egne eier-porter.</div>`;
    }
    if (p.maturity === "lanseringsklart" && p.status !== "lansert") {
      v += `<button class="small" id="launchBtn" style="margin-top:8px">🚀 Marker som lansert (eier)</button>`;
    }
    html += v + `</div>`;
  }
  /* FASE 16 – måletall */
  if (p.bizmodel) {
    const cmp = Metrics.compare(p);
    let v = `<div class="panel"><h3>FASE 16 – MÅLETALL (FAKTISK MOT PROGNOSE)</h3>`;
    if (cmp.length) {
      v += `<table><tr><th>MÅNED</th><th>KUNDER</th><th>PROGNOSE <span class="badge est">estimat</span></th><th>MRR</th><th>PROGNOSE <span class="badge est">estimat</span></th><th>CHURN</th><th>BESØK</th></tr>${cmp.map((m) => `<tr><td>${esc(m.month)}</td><td>${m.customers}</td><td class="muted">${m.forecast_customers ?? "–"}</td><td>${nok(m.mrr)}</td><td class="muted">${nok(m.forecast_mrr)}</td><td>${m.churn_pct == null ? "–" : m.churn_pct + "%"}</td><td>${m.visitors}</td></tr>`).join("")}</table>`;
    } else {
      v += `<div class="note">Ingen måletall registrert enda. Prognosen (sannsynlig scenario) sammenlignes automatisk fra første registrerte måned.</div>`;
    }
    v += `<div class="row" style="margin-top:10px">` +
      [["mtMonth", "ÅÅÅÅ-MM"], ["mtCustomers", "Betalende kunder"], ["mtMrr", "MRR (kr)"], ["mtChurn", "Churn % (valgfri)"], ["mtVisitors", "Besøk"]].map(([id2, ph]) => `<input type="text" id="${id2}" placeholder="${ph}">`).join("") +
      `</div><button class="small" id="mtAdd" style="margin-top:8px">📈 Registrer måned</button></div>`;
    html += v;
  }
  /* RETRO */
  if (p.retro) {
    html += `<div class="panel"><h3>RETRO</h3>Fungerte:\n- ${p.retro.what_worked.map(esc).join("\n- ") || "(ingen)"}\n\nFeilet:\n- ${p.retro.what_failed.map(esc).join("\n- ") || "(ingen)"}\n\nGale antakelser:\n- ${p.retro.wrong_assumptions.map(esc).join("\n- ") || "(ingen)"}\n\nKan gjenbrukes:\n- ${p.retro.reusable.map(esc).join("\n- ") || "(ingen)"}\n\nLærdom: <b style="color:var(--cyan)">${esc(p.retro.lesson)}</b></div>`;
  }
  if (p.phasePlan) {
    html += `<div class="panel"><h3>FASEPLAN</h3><div class="note">${esc(p.phasePlan.sequencing_notes)}</div><table><tr><th>FASE</th><th>OMFANG</th><th>FØRSTE HANDLINGER</th><th>STOPPKRITERIER</th><th>EIER</th></tr>${p.phasePlan.phases.filter((f) => f.relevant).map((f) => `<tr><td>${f.phase}: ${esc(phaseTitle(f.phase))}</td><td class="muted">${esc(f.scope)}</td><td>${f.first_actions.map(esc).join("<br>")}</td><td class="muted">${esc(f.stop_criteria)}</td><td>${esc(f.owner_role)}</td></tr>`).join("")}</table></div>`;
  }
  if (p.brief) {
    const b = p.brief;
    html += `<div class="panel"><h3>MVP-BRIEF: ${esc(b.working_name)}</h3>${esc(b.product_vision)}\n\nKjerneproblem: ${esc(b.core_problem)}\nKjernejobb: ${esc(b.core_job)}\nViktigste brukerreise: ${esc(b.primary_user_journey)}\n\nMonetisering: ${esc(b.monetization.model)} – ${esc(b.monetization.price_hypothesis)} (prøve: ${esc(b.monetization.trial)})\nEstimat: ${esc(b.build_estimate)}` +
      `<table><tr><th>MVP-FUNKSJON</th><th>HVORFOR</th><th>AKSEPTANSE</th></tr>${b.mvp_features.map((f) => `<tr><td>${esc(f.name)}</td><td class="muted">${esc(f.why)}</td><td class="muted">${esc(f.acceptance)}</td></tr>`).join("")}</table>` +
      `\nBygges IKKE:\n- ${b.not_building.map(esc).join("\n- ")}\n\nSuksessmål: ${b.success_metrics.map((m) => `${esc(m.metric)} → ${esc(m.target)}`).join("; ")}</div>`;
  }
  if (p.assumptions.length) {
    html += `<div class="panel"><h3>ANTAKELSESLOGG</h3><table><tr><th>PÅSTAND</th><th>TYPE</th><th>SIKKERHET</th><th>KILDE</th></tr>${p.assumptions.map((a) => `<tr><td>${esc(a.claim)}</td><td>${esc(a.type)}</td><td>${esc(a.confidence)}</td><td class="muted">${esc(a.source)}</td></tr>`).join("")}</table></div>`;
  }
  if (p.decisions.length) {
    html += `<div class="panel"><h3>BESLUTNINGSLOGG</h3><table><tr><th>DATO</th><th>ROLLE</th><th>BESLUTNING</th><th>BEGRUNNELSE</th></tr>${p.decisions.map((d) => `<tr><td class="muted">${esc(d.at.slice(0, 10))}</td><td>${esc(d.role)}${d.byOwner ? ' <span class="badge test">EIER</span>' : ""}</td><td>${esc(d.decision)}</td><td class="muted">${esc(d.rationale)}</td></tr>`).join("")}</table></div>`;
  }
  /* SAGA-broen: research bestilt fra og levert av assistenten */
  {
    const reqs = window.SAGA ? window.SAGA.bridge.all(50).filter((r) => r.projectId === p.id) : [];
    if (reqs.length) {
      html += `<div class="panel"><h3>RESEARCH FRA ASSISTENTEN (SAGA-broen)</h3>` +
        reqs.map((r) => `<div class="note"><b>${r.status === "done" ? "✅" : "⏳"} ${esc(r.question)}</b>${r.status === "done" ? `\n${esc(r.answer)}` : `\n<span class="muted">Venter – åpne assistenten, der ligger forespørselen som chip.</span>`}</div>`).join("\n") + `</div>`;
    }
  }

  /* Tidslinje: hele prosjekthistorien fra loggene som finnes – deterministisk */
  {
    const events = [];
    for (const d of p.decisions) events.push({ at: d.at, tag: d.byOwner ? "EIER" : d.role, text: d.decision });
    for (const e2 of p.expenses || []) events.push({ at: e2.at, tag: "utgift", text: `${e2.amount} kr – ${e2.what}` });
    for (const m of p.metrics || []) events.push({ at: m.at, tag: "måletall", text: `${m.month}: ${m.customers} kunder, ${m.mrr} kr MRR` });
    if (p.landing && p.landing.publishedAt) events.push({ at: p.landing.publishedAt, tag: "LIVE", text: "Falsk dør publisert: " + (p.landing.publishedUrl || "") });
    events.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    if (events.length) {
      html += `<div class="panel"><h3>TIDSLINJE</h3><div class="feed">${events.map((ev) => `<div class="item"><span class="when">${esc(when(ev.at))}</span><span class="badge${ev.tag === "EIER" || ev.tag === "LIVE" ? " test" : ""}">${esc(ev.tag)}</span><span class="what">${esc(ev.text)}</span></div>`).join("")}</div></div>`;
    }
  }
  $("detail").innerHTML = html;
  wireProjectActions(p);
}

/* ---------- handlinger i arbeidsområdet ---------- */
function llmAction(btnId, fn) {
  const btn = $(btnId);
  if (!btn) return;
  btn.onclick = async () => {
    if (!Store.apiKey) { alert("Legg inn API-nøkkel under System først."); return; }
    btn.disabled = true;
    try { await fn(); } catch (e) { alert("Feil: " + e.message); btn.disabled = false; }
  };
}
function wireProjectActions(p) {
  const refresh = () => { showProject(p.id); renderPortfolio(); updateNavBadges(); };

  const expCreate = $("expCreate");
  if (expCreate) expCreate.onclick = () => { window.CF.Experiments.createFrom(Projects.get(p.id)); showProject(p.id); };
  document.querySelectorAll(".exp-pass, .exp-fail").forEach((b) => {
    b.onclick = () => {
      const input = document.querySelector(`.exp-result[data-exp="${b.dataset.exp}"]`);
      const result = (input && input.value.trim()) || "";
      if (!result) { alert("Skriv inn det faktiske resultatet først."); return; }
      window.CF.Experiments.registerResult(Projects.get(p.id), b.dataset.exp, result, b.classList.contains("exp-pass"));
      showProject(p.id);
    };
  });
  llmAction("valReview", async () => { await window.CF.Experiments.review(Projects.get(p.id)); refresh(); });
  const lpGen = $("lpGen");
  if (lpGen) lpGen.onclick = async () => {
    if (!Store.apiKey) { alert("Legg inn API-nøkkel under System først."); return; }
    lpGen.disabled = true;
    const endpoint = prompt("Skjema-endepunkt for ventelisten (f.eks. Formspree-URL). La stå tomt for lokal testvariant:", "") || "";
    try { await window.CF.Landing.run(Projects.get(p.id), { formEndpoint: endpoint.trim() }); showProject(p.id); }
    catch (e) { alert("Feil: " + e.message); lpGen.disabled = false; }
  };
  const lpPublish = $("lpPublish");
  if (lpPublish) lpPublish.onclick = async () => {
    const t = window.CF.Publish.target(Projects.get(p.id));
    if (!confirm(`EIER-PORT: PUBLISERING\n\nDette committer landingssiden til:\n  ${t.repo} → ${t.path}\n\nLive URL blir:\n  ${t.url}\n\nInnholdet er nøyaktig HTML-en du kan forhåndsvise med 👁-knappen. Publisere?`)) return;
    lpPublish.disabled = true;
    try { await window.CF.Publish.landing(Projects.get(p.id)); refresh(); }
    catch (e) { alert("Feil: " + e.message); lpPublish.disabled = false; }
  };
  const lpPreview = $("lpPreview");
  if (lpPreview) lpPreview.onclick = () => window.open(URL.createObjectURL(new Blob([Projects.get(p.id).landing.html], { type: "text/html" })));
  const lpDownload = $("lpDownload");
  if (lpDownload) lpDownload.onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([Projects.get(p.id).landing.html], { type: "text/html" }));
    a.download = p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-landingsside.html";
    a.click();
  };

  llmAction("bmGen", async () => { await window.CF.BizModel.run(Projects.get(p.id)); showProject(p.id); });
  const bmUpdate = $("bmUpdate");
  if (bmUpdate) bmUpdate.onclick = () => {
    const patch = {};
    document.querySelectorAll(".bm-in").forEach((i) => {
      const v = parseFloat(String(i.value).replace(",", "."));
      if (!isNaN(v)) patch[i.dataset.k] = v;
    });
    window.CF.BizModel.recompute(Projects.get(p.id), patch);
    showProject(p.id);
  };

  llmAction("siteGen", async () => { await window.CF.SiteGen.run(Projects.get(p.id)); showProject(p.id); });
  const sitePreview = $("sitePreview");
  if (sitePreview) sitePreview.onclick = () => window.open(URL.createObjectURL(new Blob([Projects.get(p.id).site.files["index.html"]], { type: "text/html" })));
  const siteZip = $("siteZip");
  if (siteZip) siteZip.onclick = () => {
    const bytes = window.CF.SiteGen.zip(Projects.get(p.id));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    a.download = p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-nettsted.zip";
    a.click();
  };

  llmAction("mkGen", async () => { await window.CF.Marketing.run(Projects.get(p.id)); showProject(p.id); });
  llmAction("stGen", async () => { await window.CF.Strategy.run(Projects.get(p.id)); showProject(p.id); });
  llmAction("lgGen", async () => { await window.CF.Legal.run(Projects.get(p.id)); showProject(p.id); });
  llmAction("taGen", async () => { await window.CF.TechArch.run(Projects.get(p.id)); showProject(p.id); });
  llmAction("opsGen", async () => { await window.CF.Ops.run(Projects.get(p.id)); showProject(p.id); });
  llmAction("appGen", async () => { await window.CF.AppGen.run(Projects.get(p.id)); showProject(p.id); });
  const appPreview = $("appPreview");
  if (appPreview) appPreview.onclick = () => window.open(URL.createObjectURL(new Blob([Projects.get(p.id).app.files["app/index.html"]], { type: "text/html" })));
  const appZip = $("appZip");
  if (appZip) appZip.onclick = () => {
    const bytes = window.CF.AppGen.zip(Projects.get(p.id));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
    a.download = p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-app.zip";
    a.click();
  };

  document.querySelectorAll(".mat-check").forEach((cb) => {
    cb.onchange = () => {
      const proj = Projects.get(p.id);
      window.CF.Maturity.toggle(proj, window.CF.Maturity.next(proj), parseInt(cb.dataset.idx, 10), cb.checked);
      showProject(p.id);
    };
  });
  const matDeclare = $("matDeclare");
  if (matDeclare) matDeclare.onclick = () => {
    const proj = Projects.get(p.id);
    try { window.CF.Maturity.declare(proj, window.CF.Maturity.next(proj)); refresh(); }
    catch (e) { alert(e.message); }
  };
  const launchBtn = $("launchBtn");
  if (launchBtn) launchBtn.onclick = () => {
    try { window.CF.Maturity.markLaunched(Projects.get(p.id)); refresh(); }
    catch (e) { alert(e.message); }
  };

  const mtAdd = $("mtAdd");
  if (mtAdd) mtAdd.onclick = () => {
    try {
      Metrics.add(Projects.get(p.id), {
        month: $("mtMonth").value.trim(), customers: $("mtCustomers").value.trim(), mrr: $("mtMrr").value.trim(),
        churn_pct: $("mtChurn").value.trim(), visitors: $("mtVisitors").value.trim(),
      });
      showProject(p.id);
      renderPortfolio();
    } catch (e) { alert(e.message); }
  };

  /* SAGA-broen */
  $("pResearch").onclick = () => {
    if (!window.SAGA) { alert("SAGA-kjernen er ikke lastet."); return; }
    const q = prompt(`Hva skal assistenten researche for «${p.name}»? (leveres med websøk i assistenten)`, "");
    if (!q || !q.trim()) return;
    window.SAGA.bridge.requestResearch({ projectId: p.id, project: p.name, question: q.trim() });
    showProject(p.id);
  };

  /* Kapitaldisiplin */
  $("pBudget").onclick = () => {
    const v = prompt(`Valideringsbudsjett i kr for «${p.name}» (eierbeslutning – forbruk over budsjett utløser kill-varsel):`, p.budgetNok || "5000");
    if (v === null) return;
    const n = parseInt(String(v).replace(/\D/g, ""), 10);
    if (!n) { alert("Ugyldig beløp."); return; }
    Projects.setBudget(Projects.get(p.id), n);
    refresh();
  };
  $("pExpense").onclick = () => {
    const what = prompt("Hva er utgiften? (f.eks. «Meta Ads falsk dør»)", "");
    if (!what) return;
    const amount = parseInt(String(prompt("Beløp i kr:", "") || "").replace(/\D/g, ""), 10);
    if (!amount) { alert("Ugyldig beløp."); return; }
    try { Projects.addExpense(Projects.get(p.id), { amount, what, category: "manuell" }); refresh(); }
    catch (e) { alert(e.message); }
  };

  $("pReport").onclick = () => {
    const md = window.CF.Report.generate(Projects.get(p.id));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + "-rapport.md";
    a.click();
  };
  llmAction("pRetro", async () => { await window.CF.Retro.run(Projects.get(p.id)); showProject(p.id); renderLessons(); renderLibrary(); });
  llmAction("pResume", async () => { await Pipeline.resume(p.id, () => {}); refresh(); });
  $("pGate").onclick = () => {
    const gate = (PHASES.find((f) => f.n === p.phase) || {}).gate;
    if (!gate) return;
    Projects.approveGate(Projects.get(p.id), gate, true);
    refresh();
  };
  $("pExport").onclick = () => {
    const blob = new Blob([Store.exportProject(p.id)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
    a.click();
  };
  const pPark = $("pPark");
  if (pPark) pPark.onclick = () => {
    const reason = prompt("Hvorfor parkeres prosjektet? (logges)", "") ?? null;
    if (reason === null) return;
    Projects.park(Projects.get(p.id), reason);
    refresh();
  };
  const pKill = $("pKill");
  if (pKill) pKill.onclick = () => {
    const reason = prompt("Hvorfor avsluttes prosjektet? Allerede brukt tid er ikke et argument for å fortsette – men heller ikke for å avslutte. (logges)", "") ?? null;
    if (reason === null) return;
    Projects.kill(Projects.get(p.id), reason);
    refresh();
  };
  const pReactivate = $("pReactivate");
  if (pReactivate) pReactivate.onclick = () => {
    try { Projects.reactivate(Projects.get(p.id)); refresh(); }
    catch (e) { alert(e.message); }
  };
  $("pDelete").onclick = () => {
    if (!confirm(`Slette «${p.name}» permanent? Dette fjerner all prosjektdata – eksporter først hvis prosjektet har verdi.`)) return;
    Projects.remove(p.id);
    $("detail").innerHTML = "";
    history.replaceState(null, "", "#/portfolio");
    renderPortfolio();
    updateNavBadges();
  };
}

/* ---------- IDÉLAB ---------- */
let running = false;
$("runIdeaBtn").onclick = async () => {
  const idea = $("ideaText").value.trim();
  const name = $("ideaName").value.trim() || idea.slice(0, 40);
  if (!idea || running) return;
  if (!Store.apiKey) { alert("Legg inn API-nøkkel under System først."); return; }
  running = true;
  $("runIdeaBtn").disabled = true;
  $("board").innerHTML = "";
  $("ideaResult").innerHTML = "";
  const cards = {};
  const pipe = (html) => { $("pipeline").innerHTML = html; };
  try {
    const p = await Pipeline.runFrom(idea, name, (step, detail) => {
      if (step === "intake") pipe("<b>FASE 0</b> " + esc(detail));
      if (step === "framing") pipe("<b>FASE 1</b> " + esc(detail));
      if (step === "participants") {
        pipe("<b>FASE 1</b> Uavhengige fagvurderinger pågår …");
        for (const t of detail) {
          const el = document.createElement("div");
          el.className = "card working";
          el.innerHTML = `<h3>${esc(t)}</h3><div class="st">VURDERER …</div><div class="rec"></div>`;
          $("board").appendChild(el);
          cards[t] = el;
        }
      }
      if (step === "role_done") {
        const role = Board.byId(detail);
        const el = role && cards[role.title];
        if (el) { el.classList.remove("working"); el.querySelector(".st").textContent = "FERDIG"; }
      }
      if (step === "synthesis") pipe("<b>FASE 1</b> " + esc(detail));
      if (step === "plan") pipe("<b>PLAN</b> " + esc(detail));
      if (step === "brief") pipe("<b>BRIEF</b> " + esc(detail));
      if (step === "bizmodel") pipe("<b>FASE 3</b> " + esc(detail));
      if (step === "site") pipe("<b>FASE 6+8</b> " + esc(detail));
    });
    for (const v of p.evaluation.verdicts) {
      const el = cards[v.roleTitle];
      if (el) {
        el.querySelector(".st").innerHTML = `VURDERING ${certBadge(v.certainty)}${typeof v.probability_success === "number" ? ` <span class="badge">p=${Math.round(v.probability_success * 100)}%</span>` : ""}`;
        el.querySelector(".rec").textContent = v.recommendation;
      }
    }
    pipe(`<b>FERDIG</b> Beslutning: ${esc(p.evaluation.synthesis.decision.toUpperCase())} (score ${p.evaluation.totalScore}/100)`);
    $("ideaResult").innerHTML = `<div class="panel"><h3>RESULTAT</h3>${esc(p.evaluation.synthesis.decision_rationale)}\n\n<b>Prosjektet er lagret i porteføljen med full logg.</b></div>`;
    goTab("portfolio");
    showProject(p.id);
  } catch (e) {
    pipe(`<span style="color:var(--red)">FEIL: ${esc(e.message)}</span>`);
  }
  running = false;
  $("runIdeaBtn").disabled = false;
};

/* Idé-innboks + AEIS-radar-kandidater */
function renderInbox() {
  const list = window.CF.Inbox.list();
  const radar = window.CF.Inbox.radarCandidates();
  let html = "";
  if (radar.length) {
    html += radar.map((c) => `<div class="alert sev2"><div><div class="p">AEIS-RADAR · ${esc((c.at || "").slice(0, 10))}</div><div class="d">${esc(c.text.slice(0, 220))}${c.text.length > 220 ? "…" : ""}</div></div><div class="actions"><button class="small" data-radar-take="${esc(c.id)}">＋ Til innboksen</button></div></div>`).join("");
  }
  html += list.length
    ? `<div class="panel">${list.map((x) => `<div class="feed"><div class="item"><span class="when">${esc(when(x.at))}</span><span class="badge${x.source === "aeis-radar" ? "" : " test"}">${esc(x.source)}</span><span class="what">${esc(x.text)}</span><span style="margin-left:auto; display:flex; gap:6px"><button class="small" data-inbox-run="${x.id}">🏭 Kjør vurdering</button><button class="small" data-inbox-del="${x.id}">Fjern</button></span></div></div>`).join("")}</div>`
    : `<div class="panel muted">Innboksen er tom. Fang idéer her – de koster ingenting før du kjører vurderingen.</div>`;
  $("inboxList").innerHTML = html;
  document.querySelectorAll("[data-radar-take]").forEach((b) => {
    b.onclick = () => {
      const c = window.CF.Inbox.radarCandidates().find((x) => x.id === b.dataset.radarTake);
      if (c) window.CF.Inbox.add(c.text, "aeis-radar");
      renderInbox();
    };
  });
  document.querySelectorAll("[data-inbox-run]").forEach((b) => {
    b.onclick = () => {
      const item = window.CF.Inbox.list().find((x) => x.id === b.dataset.inboxRun);
      if (!item) return;
      $("ideaText").value = item.text;
      $("ideaName").value = "";
      window.CF.Inbox.remove(item.id);
      renderInbox();
      $("ideaText").scrollIntoView({ behavior: "smooth", block: "center" });
      $("ideaText").focus();
    };
  });
  document.querySelectorAll("[data-inbox-del]").forEach((b) => { b.onclick = () => { window.CF.Inbox.remove(b.dataset.inboxDel); renderInbox(); }; });
}
$("inboxAddBtn").onclick = () => {
  try { window.CF.Inbox.add($("inboxText").value); $("inboxText").value = ""; renderInbox(); }
  catch (e) { alert(e.message); }
};
$("inboxText").addEventListener("keydown", (e) => { if (e.key === "Enter") $("inboxAddBtn").click(); });

/* Sammenligning av evaluerte idéer */
function renderIdeaLab() {
  renderInbox();
  const evaluated = Projects.list().filter((p) => p.evaluation);
  const opts = evaluated.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.evaluation.totalScore}/100)</option>`).join("");
  $("cmpA").innerHTML = opts || `<option value="">– ingen evaluerte idéer –</option>`;
  $("cmpB").innerHTML = opts || `<option value="">– ingen evaluerte idéer –</option>`;
  if (evaluated.length > 1) $("cmpB").selectedIndex = 1;
}
$("cmpBtn").onclick = () => {
  const a = Projects.get($("cmpA").value), b = Projects.get($("cmpB").value);
  if (!a || !b || !a.evaluation || !b.evaluation) { $("cmpOut").innerHTML = `<div class="panel muted">Velg to evaluerte idéer.</div>`; return; }
  const crit = a.evaluation.synthesis.scorecard.map((r) => r.criterion);
  const rowB = Object.fromEntries(b.evaluation.synthesis.scorecard.map((r) => [r.criterion, r.score]));
  $("cmpOut").innerHTML = `<div class="panel"><h3>${esc(a.name)} (${a.evaluation.totalScore}) MOT ${esc(b.name)} (${b.evaluation.totalScore})</h3>` +
    `<table><tr><th>KRITERIUM</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th><th>DIFF</th></tr>` +
    crit.map((c) => {
      const sa = a.evaluation.synthesis.scorecard.find((r) => r.criterion === c).score, sb = rowB[c] ?? 0;
      const d = sa - sb;
      return `<tr><td>${esc(c)}</td><td>${sa}</td><td>${sb}</td><td style="color:${d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--muted)"}">${d > 0 ? "+" + d : d}</td></tr>`;
    }).join("") + `</table>` +
    `\nBeslutninger: ${esc(a.name)} → <b>${esc(a.evaluation.synthesis.decision)}</b> · ${esc(b.name)} → <b>${esc(b.evaluation.synthesis.decision)}</b></div>`;
};

/* ---------- SYSTEM ---------- */
$("apiKey").value = Store.apiKey;
$("saveKeyBtn").onclick = () => {
  /* Delt identitetskontrakt: kanonisk saga_api_key + legacy jarvis_api_key (bakoverkompatibilitet) */
  localStorage.setItem("saga_api_key", $("apiKey").value.trim());
  localStorage.setItem("jarvis_api_key", $("apiKey").value.trim());
  $("saveKeyBtn").textContent = "Lagret ✓";
  setTimeout(() => $("saveKeyBtn").textContent = "Lagre nøkkel", 1500);
};
$("demoBtn").onclick = () => {
  const p = Demo.load();
  goTab("portfolio");
  showProject(p.id);
};
$("reviewBtn").onclick = async () => {
  if (!Store.apiKey) { alert("Legg inn API-nøkkel først."); return; }
  $("reviewBtn").disabled = true;
  $("reviewOut").innerHTML = `<div class="panel muted">Fabrikken gransker seg selv …</div>`;
  try {
    const text = await SelfReview.run();
    $("reviewOut").innerHTML = `<div class="panel"><h3>SELVEVALUERING</h3>${esc(text)}</div>`;
  } catch (e) {
    $("reviewOut").innerHTML = `<div class="panel danger">Feil: ${esc(e.message)}</div>`;
  }
  $("reviewBtn").disabled = false;
};
$("portfolioReportBtn").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([window.CF.Report.portfolio()], { type: "text/markdown" }));
  a.download = "portefoljerapport.md";
  a.click();
};
$("exportBtn").onclick = () => {
  const blob = new Blob([Store.exportAll()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "company-factory-backup.json";
  a.click();
};
$("importBtn").onclick = () => $("importFile").click();
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  Store.importAll(await file.text());
  renderPortfolio();
  alert("Importert.");
};

/* ---------- kommandopalett (Ctrl/Cmd+K) ---------- */
let cmdkItems = [], cmdkActive = 0;
function buildCommands() {
  const cmds = [];
  for (const [tab, label] of Object.entries(CRUMBS)) cmds.push({ title: "Gå til: " + label, hint: "navigasjon", run: () => goTab(tab) });
  cmds.push({ title: "Ny idé", hint: "Idélab", run: () => { goTab("idea"); $("ideaText").focus(); } });
  const gates = Alerts.derive().filter((a) => a.type === "godkjenning").length;
  if (gates) cmds.push({ title: `Hva venter på meg? (${gates} porter)`, hint: "godkjenninger", run: () => goTab("approvals") });
  for (const p of Projects.list()) cmds.push({ title: "Åpne: " + p.name, hint: p.status + " · fase " + p.phase, run: () => { goTab("portfolio"); showProject(p.id); } });
  cmds.push({ title: "Last eksempelprosjekt (TEST)", hint: "system", run: () => $("demoBtn").click() });
  cmds.push({ title: "Porteføljerapport (Markdown)", hint: "last ned", run: () => $("portfolioReportBtn").click() });
  cmds.push({ title: "Eksporter alt (JSON)", hint: "backup", run: () => $("exportBtn").click() });
  return cmds;
}
function cmdkRender(filter) {
  const q = (filter || "").toLowerCase();
  cmdkItems = buildCommands().filter((c) => !q || c.title.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q));
  cmdkActive = Math.min(cmdkActive, Math.max(0, cmdkItems.length - 1));
  $("cmdkList").innerHTML = cmdkItems.length
    ? cmdkItems.map((c, i) => `<div class="cmd${i === cmdkActive ? " active" : ""}" data-i="${i}">${esc(c.title)}<span class="hint">${esc(c.hint)}</span></div>`).join("")
    : `<div class="empty">Ingen treff.</div>`;
  document.querySelectorAll("#cmdkList .cmd").forEach((el) => {
    el.onclick = () => { cmdkExec(parseInt(el.dataset.i, 10)); };
    el.onmousemove = () => { cmdkActive = parseInt(el.dataset.i, 10); cmdkRender($("cmdkInput").value); };
  });
}
function cmdkOpen() { $("cmdk").classList.add("on"); $("cmdkInput").value = ""; cmdkActive = 0; cmdkRender(""); $("cmdkInput").focus(); }
function cmdkClose() { $("cmdk").classList.remove("on"); }
function cmdkExec(i) { const c = cmdkItems[i]; cmdkClose(); if (c) c.run(); }
$("cmdkBtn").onclick = cmdkOpen;
$("cmdk").onclick = (e) => { if (e.target === $("cmdk")) cmdkClose(); };
$("cmdkInput").oninput = () => { cmdkActive = 0; cmdkRender($("cmdkInput").value); };
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("cmdk").classList.contains("on") ? cmdkClose() : cmdkOpen(); return; }
  if (!$("cmdk").classList.contains("on")) return;
  if (e.key === "Escape") { cmdkClose(); }
  if (e.key === "ArrowDown") { e.preventDefault(); cmdkActive = Math.min(cmdkActive + 1, cmdkItems.length - 1); cmdkRender($("cmdkInput").value); }
  if (e.key === "ArrowUp") { e.preventDefault(); cmdkActive = Math.max(cmdkActive - 1, 0); cmdkRender($("cmdkInput").value); }
  if (e.key === "Enter") { e.preventDefault(); cmdkExec(cmdkActive); }
});

/* ---------- oppstart ---------- */
route();
})();
