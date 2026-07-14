/*
 * Company Factory end-to-end tests (Playwright + mocked Claude API).
 * Dekker førsteversjonens definisjon av ferdig, uten API-nøkkel:
 * idé → prosjekt → inntak/antakelser → styrevurdering → scoring →
 * beslutning → faseplan → MVP-brief → portefølje/status → porter →
 * svak idé (stopp) → eksempelprosjekt (isolert TEST) → navneromsisolasjon.
 *
 * Run:  node tests/factory.e2e.js [baseURL]   (default http://localhost:8130/)
 */
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:8130/") + "";
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (cond ? "" : "  → " + JSON.stringify(detail)));
  if (!cond) failures++;
}

const respond = (payload) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 100 },
  }),
});

const INTAKE = {
  summary: "Abonnement som gir boligeiere en vedlikeholdsplan med sesongvarsler.",
  problem: "Boligeiere vet ikke hvilket vedlikehold som trengs når.",
  target_group: "Eiere av enebolig/rekkehus.",
  solution: "Digital plan + varsler + sjekklister.",
  willingness_to_pay: "Hypotese 49–99 kr/mnd – uvalidert.",
  market: "Stort norsk volum – må verifiseres.",
  channel: "SEO + partnere.",
  subscription_potential: "Høyt, sesongbasert gjentakelse.",
  assumptions: [
    { claim: "Betalingsvilje 49–99 kr/mnd", type: "krever_ekstern_validering", confidence: "lav" },
    { claim: "Problemet oppleves som reelt", type: "antakelse", confidence: "middels" },
  ],
  unknowns: ["Churn etter første sesong"],
  decision_changing_questions: ["Finnes distribusjonsfortrinn som senker CAC?"],
};

const FRAMING = {
  case_summary: "Abonnement på boligvedlikehold.",
  selected_roles: ["cf_marked", "cf_kunde", "cf_vekst"],
  rationale: "Marked, kundesmerte og distribusjon er de kritiske usikkerhetene.",
};

const VERDICT = (rec, p) => ({
  position: "Kort posisjon fra mandatet.",
  strongest_argument_against: "Forsikringsselskap kan tilby dette gratis.",
  top_risks: ["Kopiering", "Churn"],
  recommendation: rec,
  certainty: "middels",
  probability_success: p,
});

const scorecard = (n) => [
  "problemsmerte", "frekvens", "betalingsvilje", "markedsstørrelse", "differensiering",
  "gjennomførbarhet", "tid_til_marked", "gjentakende_inntekt", "automatiseringsgrad", "forsvarbarhet",
].map((criterion) => ({ criterion, score: n, reasoning: "Begrunnelse for " + criterion }));

const SYNTHESIS_MVP = {
  summary: "Sterk sak: reelt problem, god økonomi, rask vei til marked.",
  scorecard: scorecard(8),
  score_drivers_up: ["Rask tid til marked"],
  score_drivers_down: ["Forsvarbarhet"],
  weaknesses: ["Kopierbart innhold"],
  improvements: ["Partnerdistribusjon"],
  alternative_ideas: ["B2B white-label"],
  scenarios: [
    { name: "Beste", probability: 0.2, outcome: "Sterk vekst", value_estimate: "5 MNOK ARR" },
    { name: "Sannsynlig", probability: 0.5, outcome: "Moderat", value_estimate: "1 MNOK ARR" },
    { name: "Dårligste", probability: 0.3, outcome: "Nedleggelse", value_estimate: "-100 000 kr" },
  ],
  decision: "mvp",
  decision_rationale: "Betalingsvilje sannsynliggjort; bygg minste betalbare versjon.",
  certainty: "middels",
  assumptions_to_validate: [
    { claim: "CAC < 300 kr organisk", test: "SEO-pilot", threshold: "3 artikler > 500 besøk/mnd", cost_estimate: "0 kr", horizon: "6 uker" },
  ],
};

const SYNTHESIS_STOP = {
  ...SYNTHESIS_MVP,
  scorecard: scorecard(2),
  summary: "Svak sak: ingen dokumentert smerte, gratisalternativer dominerer.",
  score_drivers_up: [],
  score_drivers_down: ["Ingen betalingsvilje", "Ingen differensiering"],
  weaknesses: ["Problemet er ikke smertefullt nok", "Gratisalternativer finnes overalt"],
  improvements: ["Smalere nisje med akutt smerte"],
  alternative_ideas: ["Hytteeier-nisje med høyere betalingsvilje"],
  decision: "stopp",
  decision_rationale: "Åpenbart svak idé: bygging ville vært sløsing – stopp nå.",
};

const PLAN = {
  phases: [
    { phase: 2, relevant: true, scope: "Falsk dør + intervjuer", key_deliverables: ["Landingsside"], first_actions: ["Sett opp falsk dør"], stop_criteria: "< 2 % konvertering", owner_role: "Kundeinnsikt", risks: ["Skjevt utvalg"] },
    { phase: 6, relevant: false, scope: "Utsatt til etter validering", key_deliverables: [], first_actions: [], stop_criteria: "", owner_role: "Merkevare", risks: [] },
    { phase: 8, relevant: true, scope: "Minste betalbare versjon", key_deliverables: ["Nettside med betaling"], first_actions: ["Sett opp mal"], stop_criteria: "Kritiske tester mangler", owner_role: "CTO", risks: ["Scope-vekst"] },
  ],
  sequencing_notes: "Validering før bygging; merkevare bevisst utsatt.",
};

const BRIEF = {
  working_name: "BoligPuls",
  product_vision: "Vedlikehold uten hodebry for vanlige boligeiere.",
  core_problem: "Ukjent vedlikeholdsbehov gir dyre skader.",
  core_job: "Fortell meg hva jeg må gjøre med boligen, når.",
  primary_user_journey: "Registrer bolig → få plan → motta sesongvarsel → utfør/kryss av.",
  mvp_features: [
    { name: "Boligprofil", why: "Grunnlag for planen", acceptance: "Bruker kan registrere boligtype/byggeår" },
    { name: "Sesongvarsler", why: "Kjerneverdien", acceptance: "E-post sendes ved sesongstart" },
    { name: "Stripe-abonnement", why: "Tester betalingsvilje", acceptance: "Betaling → tilgang; kansellering fungerer" },
  ],
  later_features: ["Håndverkerbestilling"],
  not_building: ["Egen app", "Markedsplass", "AI-chat"],
  data_model_outline: ["bruker", "bolig", "oppgave", "abonnement"],
  monetization: { model: "abonnement", price_hypothesis: "79 kr/mnd eller 790 kr/år", trial: "14 dager" },
  launch_channels: ["SEO", "boligkjøpsøyeblikket"],
  success_metrics: [{ metric: "betalende kunder uke 4", target: "≥ 20" }],
  risks: ["Churn etter sesong 1"],
  build_estimate: "2–3 uker for én utvikler",
};

const LANDING = {
  seo_title: "BoligPuls – vedlikeholdsplan for boligen din",
  seo_description: "Sesongbaserte varsler og sjekklister for boligvedlikehold.",
  headline: "Slutt å gjette hva boligen trenger",
  subheadline: "Få en vedlikeholdsplan tilpasset din bolig, med varsler når det faktisk er tid.",
  pain_points: ["Du oppdager taklekkasjen etter at skaden har skjedd", "Sjekklister på nett passer ikke din bolig"],
  value_props: [
    { title: "Plan for din bolig", text: "Basert på boligtype og byggeår." },
    { title: "Sesongvarsler", text: "Beskjed når oppgaven faktisk må gjøres." },
  ],
  offer: "Uforpliktende venteliste – først i køen ved lansering.",
  price_line: "79 kr/mnd ved lansering",
  cta_text: "Sett meg på ventelisten",
  faq: [{ q: "Når lanserer dere?", a: "Vi bygger nå og varsler ventelisten først." }],
  honest_disclaimer: "BoligPuls er under utvikling. Påmelding til ventelisten er gratis og uforpliktende.",
};

const VALIDATION = {
  summary: "Begge kritiske antakelser holdt mot forhåndsdefinerte terskler.",
  per_experiment: [
    { claim: "≥3 % av besøkende legger inn kort/venteliste ved 79 kr/mnd", verdict: "bestått", implication: "Betalingsvilje sannsynliggjort ved prispunktet." },
    { claim: "Problemet er topp-3-bekymring for nye eneboligeiere", verdict: "bestått", implication: "Målgruppen bekrefter smerten uoppfordret." },
  ],
  decision: "mvp",
  decision_rationale: "Terskler satt før testen ble nådd; bygg minste betalbare versjon.",
  certainty: "middels",
  next_steps: ["Revider MVP-brief med valideringsdata", "Behold landingssiden som konverteringsside"],
};

const BIZMODEL = {
  value_prop: "Vedlikeholdsplan som forebygger dyre boligskader.",
  icp: "Førstegangs eneboligeiere 30–50 år.",
  buyer: "Boligeieren", user: "Boligeieren",
  revenue_model: "B2C-abonnement",
  plans: [
    { name: "Basis", price_month: 79, price_year: 790, target_share: 0.7, includes: ["Vedlikeholdsplan", "Sesongvarsler"] },
    { name: "Pluss", price_month: 149, price_year: 1490, target_share: 0.3, includes: ["Alt i Basis", "Prioritert support"] },
  ],
  free_tier: "Gratis sjekkliste for én sesong",
  trial: "14 dager gratis",
  assumptions: { visitors_m1: 2000, visitor_growth_pct_m: 0.1, signup_rate: 0.05, paid_conversion: 0.3, churn_monthly: 0.05, cac: 300, fixed_costs_monthly: 5000, variable_cost_per_user: 5 },
  assumption_notes: ["Signup 5 % basert på falsk-dør-resultatet", "Churn 5 %/mnd er bransjesnitt for B2C – uvalidert"],
  risks: ["Churn etter første sesong kan være langt høyere"],
};

const SITE = {
  brand: { name: "BoligPuls", slogan: "Boligen din, i rute", tone: "jordnær og konkret", color_primary: "#0b6e6e", color_ink: "#15222e", color_bg: "#f7f9fa", color_accent: "#d97706" },
  seo_title: "BoligPuls – vedlikeholdsplan for boligen",
  seo_description: "Sesongvarsler og sjekklister tilpasset din bolig.",
  hero_headline: "Slutt å gjette hva boligen trenger",
  hero_sub: "Få en plan tilpasset din bolig, med varsler når det faktisk er tid.",
  cta_text: "Se pris og kom i gang",
  features: [
    { title: "Plan for din bolig", text: "Basert på boligtype og byggeår." },
    { title: "Sesongvarsler", text: "Beskjed når oppgaven må gjøres." },
    { title: "Sjekklister", text: "Steg for steg, uten fagsjargong." },
  ],
  how_it_works: ["Registrer boligen", "Få planen", "Motta varsler og kryss av"],
  pricing_faq: [{ q: "Kan jeg si opp når som helst?", a: "Ja, abonnementet løper måned for måned." }],
  faq: [{ q: "Passer det for leilighet?", a: "Foreløpig er planene laget for småhus." }],
  about_story: "BoligPuls ble startet fordi småfeil ble dyre skader.",
  about_values: ["Konkret framfor generelt", "Forebygging framfor reparasjon"],
  terms_outline: ["Avtalens parter", "Abonnement og betaling", "Oppsigelse", "Ansvarsbegrensning"],
  privacy_outline: ["Hvilke data vi lagrer", "Behandlingsgrunnlag", "Lagringstid", "Dine rettigheter"],
};

const MARKETING = {
  core_message: "Boligen din, i rute – uten at du må huske alt selv.",
  channel_strategy: [
    { channel: "SEO", why: "Målgruppen googler vedlikeholdsoppgaver sesongvis", priority: 1, cac_hypothesis: "< 100 kr organisk" },
    { channel: "Meta Ads", why: "Presis målretting mot nye boligeiere", priority: 2, cac_hypothesis: "250–400 kr" },
  ],
  content_calendar: [
    { week: 1, theme: "Høstsjekk av taket", format: "artikkel", channel: "SEO" },
    { week: 2, theme: "5 feil nye boligeiere gjør", format: "video", channel: "Meta Ads" },
  ],
  ad_concepts: [{ channel: "Meta Ads", hook: "Kjøpte du bolig i år?", body: "Få vedlikeholdsplanen som forebygger dyre skader." }],
  email_sequence: [{ day: 0, subject: "Velkommen – her er planen din", purpose: "aktivering" }, { day: 3, subject: "Første sesongoppgave", purpose: "vane" }],
  launch_plan: ["Uke 1: publiser 3 SEO-artikler", "Uke 2: aktiver venteliste-e-post"],
  experiment_queue: [{ hypothesis: "SEO gir CAC < 100 kr", test: "3 artikler + 6 ukers måling", metric: "CAC organisk", threshold: "< 100 kr" }],
  budget_notes: "Start med 5 000 kr/mnd; skaler kun kanaler med LTV/CAC > 3.",
};

const STRATEGY = {
  working_name: "BoligPuls",
  name_alternatives: ["Husvakt", "Vedlikeholdsplanen"],
  name_criteria: ["Kort", "Norsk", "Ledig .no-domene (må sjekkes – eier-port)"],
  positioning: "Den enkleste måten å holde boligen i stand på.",
  category: "Vedlikeholdsabonnement for boligeiere",
  promise: "Du får beskjed før småfeil blir dyre skader.",
  differentiation: "Boligspesifikk plan, ikke generiske sjekklister.",
  mission: "Gjøre boligvedlikehold håndterbart for vanlige folk.",
  vision: "Standardverktøyet for norske boligeiere.",
  values: ["Konkret", "Ærlig", "Forebyggende"],
  strategic_priorities: ["Validert betalingsvilje før vekst", "SEO som hovedkanal"],
  moat_options: ["Boligdata over tid", "Partneravtaler med forsikring"],
  plan_90_days: ["Lansere MVP til ventelisten", "20 betalende kunder"],
  plan_12_months: ["1 000 betalende", "Partneravtale med ett forsikringsselskap"],
  direction_3_years: "Norden, med API mot forsikring og megler.",
  risks: ["Forsikringsselskap lanserer gratisversjon"],
  not_doing: ["Ingen håndverkermarkedsplass i år 1", "Ingen native app før 5 000 kunder", "Ingen B2B-salg før B2C er validert"],
};

const LEGAL = {
  company_form_notes: "AS anbefales vurdert ved betalende kunder – må avklares med regnskapsfører.",
  requirements: [
    { area: "Angrerett", requirement: "14 dagers angrerett med skjema før kjøp", applies_because: "Forbrukersalg av digital tjeneste", must_be_verified_by_professional: true },
    { area: "GDPR", requirement: "Behandlingsprotokoll og personvernerklæring", applies_because: "Lagrer persondata om boligeiere", must_be_verified_by_professional: true },
    { area: "Abonnementsvilkår", requirement: "Tydelig fornyelse og enkel oppsigelse", applies_because: "Løpende abonnement", must_be_verified_by_professional: false },
  ],
  privacy_data: [{ data: "E-post, boligtype, byggeår", purpose: "Levere vedlikeholdsplan", legal_basis: "Avtale (GDPR art. 6.1.b)", retention: "Slettes 12 mnd etter oppsigelse" }],
  consumer_rights: ["Angrerett", "Reklamasjon"],
  marketing_rules: ["Samtykke før nyhetsbrev (markedsføringsloven § 15)"],
  vat_tax_notes: "MVA-pliktig ved omsetning over 50 000 kr – regnskapsfører må bekrefte.",
  action_list: ["Utkast til vilkår → advokat", "Behandlingsprotokoll → personvernrådgiver"],
};

const TECHARCH = {
  summary: "Statisk frontend + Supabase + Stripe dekker behovet; ingen egen backend før webhook-logikken vokser.",
  choices: [
    { area: "Frontend/hosting", choice: "Statisk SPA på Netlify", why: "Ingen serverdrift, gratisnivå holder", alternatives_considered: ["Vercel", "GitHub Pages"], monthly_cost_estimate: "0 kr", lock_in_risk: "lav", migration_path: "Statiske filer flyttes fritt" },
    { area: "Database/auth", choice: "Supabase", why: "Auth + Postgres + RLS uten egen backend", alternatives_considered: ["Firebase", "egen Node-backend"], monthly_cost_estimate: "0–250 kr", lock_in_risk: "middels", migration_path: "Standard Postgres – pg_dump ut" },
    { area: "Betaling", choice: "Stripe Payment Links + Customer Portal", why: "Ingen kortdata hos oss, rask oppstart", alternatives_considered: ["Vipps", "Paddle"], monthly_cost_estimate: "2,9 % + 2 kr/transaksjon", lock_in_risk: "middels", migration_path: "Abonnementsdata kan eksporteres" },
  ],
  not_needed_yet: ["Kubernetes/containere", "Egen backend-server", "Datavarehus", "CDN utover hostingens innebygde"],
  security_notes: ["RLS på alle tabeller", "Hemmeligheter kun i miljøvariabler", "Rate limit på webhook-endepunktet"],
  total_monthly_cost_estimate: "0–300 kr/mnd før transaksjonsgebyrer",
  risks: ["Supabase gratisnivå pauser inaktive prosjekter"],
};

const APP = {
  app_name: "BoligPuls",
  welcome_line: "Registrer boligen din og få planen på under to minutter.",
  onboarding_steps: [
    { title: "Om boligen", text: "Vi tilpasser planen etter boligtype.", input_label: "Boligtype (f.eks. enebolig 1985)" },
    { title: "Hvor er boligen?", text: "Klima styrer sesongoppgavene.", input_label: "Postnummer" },
  ],
  dashboard_modules: [
    { title: "Vedlikeholdsplanen", description: "Oppgaver for din bolig, sortert etter sesong.", empty_state: "Fullfør onboarding for å få planen." },
    { title: "Neste varsel", description: "Det viktigste å gjøre nå.", empty_state: "Ingen varsler enda – planen genereres." },
  ],
  settings_items: ["Varslingskanal (e-post)", "Boligprofil", "Slett konto og data"],
  activation_metric: "Bruker har fullført boligprofil og fått sin første plan innen 24 timer",
  upgrade_prompt: "Planen din er klar – abonner for å få sesongvarsler og sjekklister.",
};

const OPS = {
  support_channels: ["E-post (hjelp@boligpuls.no)", "Kontaktskjema"],
  faq_seed: [{ q: "Hvordan sier jeg opp?", a: "Under Innstillinger → Abonnement, gjelder ut perioden." }],
  reply_templates: [
    { name: "Betalingsfeil", text: "Hei! Betalingen feilet – oppdater kortet her: [lenke]." },
    { name: "Refusjon", text: "Hei! Refusjonen er registrert og tar 5–10 virkedager." },
  ],
  escalation_rules: ["Betalingssaker ubesvart > 24 t → eier varsles"],
  incident_runbook: ["Sjekk statusside hos leverandør", "Informer berørte kunder innen 2 t"],
  monthly_review_checklist: ["Churn-gjennomgang", "Supportvolum per kategori", "Kostnadskontroll leverandører"],
  vendor_list: [{ vendor: "Stripe", purpose: "Betaling/abonnement", cost_note: "2,9 % + 2 kr per transaksjon" }],
  automation_candidates: ["Purring ved betalingsfeil", "Onboarding-e-poster"],
};

const RETRO = {
  what_worked: ["Falsk-dør-testen ga tydelig signal"],
  what_failed: ["Intervjurekruttering tok for lang tid"],
  wrong_assumptions: ["Antok at churn-bekymringen var størst – det var betalingsvilje"],
  process_improvements: ["Start intervjurekruttering i fase 0"],
  reusable: ["Landingsside-malen", "Eksperimentterskel-formatet"],
  not_reusable: ["Boligspesifikk copy"],
  lesson: "Valider betalingsvilje med falsk dør før MVP besluttes.",
};

function mockRouter(overrides = {}) {
  const counts = { intake: 0, framing: 0, verdict: 0, synthesis: 0, plan: 0, brief: 0, landing: 0, validation: 0, bizmodel: 0, site: 0, retro: 0, review: 0, total: 0 };
  const bodies = [];
  const handler = (route) => {
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    counts.total++;
    const sys = body.system || "";
    if (sys.includes("inntaksmodul")) { counts.intake++; return route.fulfill(respond(overrides.intake || INTAKE)); }
    if (sys.includes("framing-modulen i Company Factory")) { counts.framing++; return route.fulfill(respond(overrides.framing || FRAMING)); }
    if (sys.includes("fagrolle i Company Factory")) {
      counts.verdict++;
      const isMarked = sys.includes("Markedsanalytiker");
      return route.fulfill(respond(VERDICT(isMarked ? "Valider betalingsvilje først" : "Test organisk kanal", isMarked ? 0.35 : 0.45)));
    }
    if (sys.includes("scoringsmodulen i Company Factory")) { counts.synthesis++; return route.fulfill(respond(overrides.synthesis || SYNTHESIS_MVP)); }
    if (sys.includes("planmodulen i Company Factory")) { counts.plan++; return route.fulfill(respond(overrides.plan || PLAN)); }
    if (sys.includes("MVP-brief-modulen")) { counts.brief++; return route.fulfill(respond(overrides.brief || BRIEF)); }
    if (sys.includes("landingsside-modulen")) { counts.landing++; return route.fulfill(respond(overrides.landing || LANDING)); }
    if (sys.includes("valideringsmodulen i Company Factory")) { counts.validation++; return route.fulfill(respond(overrides.validation || VALIDATION)); }
    if (sys.includes("forretningsmodell-modulen")) { counts.bizmodel++; return route.fulfill(respond(overrides.bizmodel || BIZMODEL)); }
    if (sys.includes("nettsted-modulen")) { counts.site++; return route.fulfill(respond(overrides.site || SITE)); }
    if (sys.includes("retro-modulen")) { counts.retro++; return route.fulfill(respond(overrides.retro || RETRO)); }
    if (sys.includes("markedsføringsmodulen")) { counts.marketing = (counts.marketing || 0) + 1; return route.fulfill(respond(overrides.marketing || MARKETING)); }
    if (sys.includes("strategimodulen")) { counts.strategy = (counts.strategy || 0) + 1; return route.fulfill(respond(overrides.strategy || STRATEGY)); }
    if (sys.includes("juridisk-modulen")) { counts.legal = (counts.legal || 0) + 1; return route.fulfill(respond(overrides.legal || LEGAL)); }
    if (sys.includes("driftsmodulen")) { counts.ops = (counts.ops || 0) + 1; return route.fulfill(respond(overrides.ops || OPS)); }
    if (sys.includes("app-modulen")) { counts.app = (counts.app || 0) + 1; return route.fulfill(respond(overrides.app || APP)); }
    if (sys.includes("arkitekturmodulen")) { counts.techarch = (counts.techarch || 0) + 1; return route.fulfill(respond(overrides.techarch || TECHARCH)); }
    if (sys.includes("selvevalueringsmodul")) {
      counts.review++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: "Selvevaluering: fabrikken fungerer; forbedre X." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) });
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
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("jarvis_api_key", "sk-ant-test"); });
  await page.reload({ waitUntil: "networkidle" });
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  /* ---------- Scenario 1: full pipeline, sterk idé → MVP ---------- */
  console.log("FACTORY 1: idé → inntak → styret → score → beslutning → plan → brief");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.click('nav button[data-tab="idea"]');
    await page.fill("#ideaName", "BoligPuls");
    await page.fill("#ideaText", "Lag en abonnementstjeneste som hjelper boligeiere med vedlikehold av bolig.");
    await page.click("#runIdeaBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 30000 });

    check("kallkjede: 1 inntak, 1 framing, 3 fagroller, 1 syntese, 1 plan, 1 brief",
      counts.intake === 1 && counts.framing === 1 && counts.verdict === 3 && counts.synthesis === 1 && counts.plan === 1 && counts.brief === 1, counts);
    const cards = await page.evaluate(() => document.querySelectorAll("#board .card").length);
    check("3 rollekort rendret under vurderingen", cards === 3, cards);

    const p = await page.evaluate(() => {
      const id = JSON.parse(localStorage.getItem("cf_index"))[0];
      return JSON.parse(localStorage.getItem("cf_project_" + id));
    });
    check("prosjekt opprettet og lagret strukturert", !!p && p.name === "BoligPuls", p && p.name);
    check("inntak lagret (problem/målgruppe/betalingsvilje)", p.intake && p.intake.problem.includes("vedlikehold") && p.intake.target_group.length > 0, null);
    check("antakelser logget fra inntak + vurdering + modell (2+1+2)", p.assumptions.length === 5 && p.assumptions.some((a) => a.type === "krever_ekstern_validering"), p.assumptions.length);
    check("score beregnet i kode: alle 8/10 → 80/100", p.evaluation.totalScore === 80, p.evaluation.totalScore);
    check("beslutning MVP med begrunnelse", p.evaluation.synthesis.decision === "mvp" && p.evaluation.synthesis.decision_rationale.length > 10, null);
    check("status oppdatert til bygging", p.status === "bygging", p.status);
    check("faseplan lagret med relevans-filter", p.phasePlan.phases.filter((f) => f.relevant).length === 2, null);
    check("MVP-brief lagret med ikke-bygges-liste", p.brief.working_name === "BoligPuls" && p.brief.not_building.length === 3, null);
    check("byggekjeden kjørte: forretningsmodell + nettsted generert automatisk", counts.bizmodel === 1 && counts.site === 1, counts);
    check("snittpris vektet korrekt (79×0,7 + 149×0,3 = 100)", p.bizmodel.computed.price_avg === 100, p.bizmodel.computed.price_avg);
    check("nettstedet har alle 7 filer", Object.keys(p.site.files).length === 7 && p.site.files["pris.html"].includes("79 kr"), Object.keys(p.site.files));
    check("beslutningslogg: inntak + vurdering + plan + brief + modell + nettsted", p.decisions.length === 6, p.decisions.map((d) => d.decision));

    const detail = await page.evaluate(() => document.getElementById("detail").textContent);
    check("prosjektstatus vises (score, beslutning, brief, modell, nettsted, logger)",
      detail.includes("80") && detail.includes("MVP-BRIEF") && detail.includes("FORRETNINGSMODELL") && detail.includes("NETTSTED") && detail.includes("BESLUTNINGSLOGG") && detail.includes("ANTAKELSESLOGG") && detail.includes("FASEPLAN"), null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 2: svak idé → STOPP, ingen plan/brief ---------- */
  console.log("FACTORY 2: svak idé → kritisk vurdering → STOPP med alternativer");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts } = mockRouter({ synthesis: SYNTHESIS_STOP });
    await page.route("**/v1/messages", handler);
    await page.click('nav button[data-tab="idea"]');
    await page.fill("#ideaName", "Generisk sjekkliste-app");
    await page.fill("#ideaText", "En app med sjekklister for alt mulig.");
    await page.click("#runIdeaBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 30000 });

    check("plan og brief kjøres IKKE ved stopp", counts.plan === 0 && counts.brief === 0, counts);
    const p = await page.evaluate(() => {
      const id = JSON.parse(localStorage.getItem("cf_index"))[0];
      return JSON.parse(localStorage.getItem("cf_project_" + id));
    });
    check("beslutning STOPP, status avsluttet", p.evaluation.synthesis.decision === "stopp" && p.status === "avsluttet", p.status);
    check("lav score (alle 2/10 → 20/100)", p.evaluation.totalScore === 20, p.evaluation.totalScore);
    const detail = await page.evaluate(() => document.getElementById("detail").textContent);
    check("svakheter, forbedringer og alternative idéer vises", detail.includes("SVAKHETER") && detail.includes("Hytteeier-nisje"), null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 3: eksempelprosjekt – isolert, merket TEST, null API-kall ---------- */
  console.log("FACTORY 3: eksempelprosjekt (TEST) uten API-kall");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });

    check("null API-kall for eksempelprosjektet", counts.total === 0, counts.total);
    const detail = await page.evaluate(() => document.getElementById("detail").textContent);
    check("tydelig merket som isolert testprosjekt", detail.includes("TEST – ISOLERT EKSEMPELPROSJEKT"), null);
    const p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("test-flagg satt og beslutning VALIDER_MER", p.test === true && p.evaluation.synthesis.decision === "valider_mer", null);
    const scoreOk = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      return p.evaluation.totalScore === window.CF.Evaluation.totalScore(p.evaluation.synthesis.scorecard);
    });
    check("demo-score konsistent med scoringsmodellen", scoreOk, null);
    check("idempotent: ny lasting dupliserer ikke", await page.evaluate(() => { window.CF.Demo.load(); return window.CF.Projects.list().length === 1; }), null);

    /* Kill-disiplin: parker → reaktiver → avslutt, alt logget som eierbeslutninger */
    page.on("dialog", (d) => d.accept("Testbegrunnelse"));
    await page.click("#pPark");
    let kp = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("parkering logget med begrunnelse", kp.status === "parkert" && kp.decisions[0].decision === "PROSJEKT PARKERT" && kp.decisions[0].rationale === "Testbegrunnelse" && kp.decisions[0].byOwner, kp.decisions[0]);
    await page.click("#pReactivate");
    kp = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("reaktivering gjenoppretter forrige status", kp.status === "validering" && kp.decisions[0].decision === "PROSJEKT REAKTIVERT", kp.status);
    await page.click("#pKill");
    kp = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("kill setter avsluttet uten å slette data", kp.status === "avsluttet" && kp.decisions[0].decision.includes("KILL") && kp.evaluation !== null, kp.status);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 4: porter, navneromsisolasjon og AEIS-gjenbruk ---------- */
  console.log("FACTORY 4: eier-porter, cf_*-isolasjon, gjenbruk av AEIS-styret");
  {
    const { page, errors } = await freshPage(browser);
    /* Seed AEIS-roller for å verifisere lese-gjenbruk med fortjent autoritet */
    await page.evaluate(() => {
      localStorage.setItem("aeis_roles", JSON.stringify([
        { id: "cfo", title: "Chief Financial Officer", mandate: "Kapital", active: true, temporary: false, track: { n: 1, brierSum: 0.04 } },
        { id: "gammel", title: "Avviklet rolle", mandate: "-", active: false, temporary: false, track: { n: 0, brierSum: 0 } },
      ]));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });

    const roster = await page.evaluate(() => window.CF.Board.roster());
    check("AEIS-roller gjenbrukes med kalibrert vekt (CFO 2.0×)",
      roster.some((r) => r.id === "cfo" && r.weight === 2.0), roster.filter((r) => r.source === "aeis"));
    check("avviklede AEIS-roller ekskluderes", !roster.some((r) => r.id === "gammel"), null);
    check("fabrikkens fagroller finnes i rosteret", roster.filter((r) => r.source === "factory").length === 9, null);

    /* Eier-port */
    await page.click("#pGate");
    const p = await page.evaluate(() => window.CF.Projects.list()[0]);
    const gateKeys = Object.keys(p.gates);
    check("port godkjent og logget med EIER-flagg", gateKeys.length === 1 && p.gates[gateKeys[0]].byOwner === true && p.decisions[0].decision.includes("PORT GODKJENT") && p.decisions[0].byOwner === true, p.decisions[0]);

    /* Navneromsisolasjon */
    const iso = await page.evaluate(() => {
      let threw = false;
      try { window.CF.Store.set("aeis_ledger", []); } catch (_) { threw = true; }
      /* saga_* er SAGA-kjernens dokumenterte navnerom (felles aktivitetslogg/bus) – tillatt ved siden av cf_* */
      const foreign = Object.keys(localStorage).filter((k) => !k.startsWith("cf_") && !k.startsWith("saga_") && k !== "jarvis_api_key" && k !== "aeis_roles");
      return { threw, foreign, aeisUntouched: JSON.parse(localStorage.getItem("aeis_roles")).length === 2 };
    });
    check("Store nekter å skrive utenfor cf_*", iso.threw, null);
    check("ingen fremmede nøkler skrevet; AEIS-data urørt", iso.foreign.length === 0 && iso.aeisUntouched, iso.foreign);

    /* Per-prosjekt eksport (utspinning/avvikling) */
    const exp = await page.evaluate(() => JSON.parse(window.CF.Store.exportProject(window.CF.Projects.list()[0].id)));
    check("prosjekt kan eksporteres isolert", exp.name === "BoligPuls (TEST)" && Array.isArray(exp.decisions), null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 5: Fase 2 – eksperimenter, landingsside, valideringsport → MVP ---------- */
  console.log("FACTORY 5: validering → eksperimenter → landingsside → port → brief");
  {
    const { page, errors } = await freshPage(browser);
    const { handler, counts } = mockRouter();
    await page.route("**/v1/messages", handler);
    page.on("dialog", (d) => d.accept(""));
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });

    /* Eksperimentkø fra antakelsene (ingen API-kostnad) */
    await page.click("#expCreate");
    let p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("eksperimenter avledet fra kritiske antakelser (2 stk med terskel)",
      p.experiments.length === 2 && p.experiments.every((e) => e.threshold.length > 0 && e.status === "planlagt"), p.experiments.length);
    check("eksperimentkøen kostet ingen API-kall", counts.total === 0, counts.total);

    /* Registrer resultater mot terskler */
    await page.fill(".exp-result >> nth=0", "4,2 % konvertering til venteliste");
    await page.click(".exp-pass >> nth=0");
    await page.fill(".exp-result", "7 av 10 nevnte problemet uoppfordret");
    await page.click(".exp-pass");
    p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("resultater registrert og logget med EIER-flagg",
      p.experiments.every((e) => e.status === "fullført" && e.passed) && p.decisions[0].byOwner === true && p.decisions[0].decision.includes("BESTÅTT"), p.decisions[0]);

    /* Falsk-dør-landingsside – fabrikken bygger den */
    await page.click("#lpGen");
    await page.waitForFunction(() => !!(window.CF.Projects.list()[0] || {}).landing, null, { timeout: 10000 });
    p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("landingsside generert med copy og pris synlig",
      counts.landing === 1 && p.landing.html.includes("Slutt å gjette") && p.landing.html.includes("79 kr/mnd"), counts);
    check("selvstendig HTML: ingen eksterne script/stiler/bilder",
      !/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(p.landing.html) && p.landing.html.includes("<!DOCTYPE html>"), null);
    check("ærlig venteliste-framing (disclaimer + PreOrder)",
      p.landing.html.includes("uforpliktende") && p.landing.html.includes("PreOrder"), null);

    /* Valideringsporten slipper prosjektet videre */
    await page.click("#valReview");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("VALIDERINGSPORT"), null, { timeout: 10000 });
    p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("valideringsport: MVP → status bygging, neste relevante fase (3)",
      p.validation.decision === "mvp" && p.status === "bygging" && p.phase === 3, { status: p.status, phase: p.phase });
    check("portbeslutningen er logget", p.decisions[0].decision.includes("Valideringsport: MVP"), p.decisions[0]);

    /* «Kjør videre» produserer MVP-brief basert på validert beslutning */
    await page.click("#pResume");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("MVP-BRIEF"), null, { timeout: 10000 });
    p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("MVP-brief generert etter bestått validering", counts.brief === 1 && p.brief.working_name === "BoligPuls", counts);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 6: F3 – økonomimatte, ZIP-integritet, retro + læringssløyfe ---------- */
  console.log("FACTORY 6: økonomimodell (håndverifisert), ZIP (python-verifisert), retro → lærdom injiseres");
  {
    const fs = require("fs");
    const { execSync } = require("child_process");
    const { page, errors } = await freshPage(browser);
    const { handler, counts, bodies } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });

    /* Håndverifisert regneeksempel: m1 profit 0, m2 profit 800, break-even mnd 2, LTV 500, LTV/CAC 10 */
    const fin = await page.evaluate(() => window.CF.Finance.project({ visitors_m1: 100, visitor_growth_pct_m: 0, signup_rate: 0.1, paid_conversion: 1, churn_monthly: 0.2, cac: 50, fixed_costs_monthly: 500, variable_cost_per_user: 0, price_avg: 100 }, 2));
    check("økonomimodellen regner riktig (håndverifisert case)",
      fin.rows[0].profit === 0 && fin.rows[1].customers === 18 && fin.rows[1].mrr === 1800 && fin.breakEvenMonth === 2 && fin.ltv === 500 && fin.ltvCac === 10 && fin.capitalNeed === 0, fin);

    /* Forretningsmodell + lokal rekalkulering uten LLM */
    await page.evaluate(async () => { await window.CF.BizModel.run(window.CF.Projects.list()[0]); });
    const apiAfterBm = counts.bizmodel;
    let ltv = await page.evaluate(() => window.CF.Projects.list()[0].bizmodel.computed.scenarios.sannsynlig.ltv);
    check("LTV ved churn 5 %: (100-5)/0,05 = 1900", ltv === 1900, ltv);
    await page.evaluate(() => window.CF.BizModel.recompute(window.CF.Projects.list()[0], { churn_monthly: 0.1 }));
    ltv = await page.evaluate(() => window.CF.Projects.list()[0].bizmodel.computed.scenarios.sannsynlig.ltv);
    check("rekalkulering lokalt (churn 10 % → LTV 950) uten nye API-kall", ltv === 950 && counts.bizmodel === apiAfterBm, { ltv, calls: counts.bizmodel });

    /* Nettsted → ZIP → verifiser med python zipfile */
    await page.evaluate(async () => { await window.CF.SiteGen.run(window.CF.Projects.list()[0]); });
    const zipB64 = await page.evaluate(() => {
      const bytes = window.CF.SiteGen.zip(window.CF.Projects.list()[0]);
      let s = "";
      for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return btoa(s);
    });
    const zipPath = require("path").join(require("os").tmpdir(), "saga-factory-site.zip");
    fs.writeFileSync(zipPath, Buffer.from(zipB64, "base64"));
    let zipOk = false, zipDetail = "";
    try {
      zipDetail = execSync(`python3 -c "
import zipfile
z = zipfile.ZipFile('${zipPath}')
assert z.testzip() is None, 'korrupt'
names = sorted(z.namelist())
assert len(names) == 7, names
idx = z.read('index.html').decode('utf-8')
assert 'Slutt å gjette' in idx and '#0b6e6e' in idx, 'mangler innhold'
assert 'advokat' in z.read('vilkar.html').decode('utf-8')
assert '79 kr' in z.read('pris.html').decode('utf-8')
print('OK', len(names))
"`, { encoding: "utf-8" }).trim();
      zipOk = zipDetail.startsWith("OK");
    } catch (e) { zipDetail = e.message; }
    check("ZIP er gyldig (python zipfile: CRC, 7 filer, innhold, juridisk disclaimer)", zipOk, zipDetail);

    /* Retro → varig lærdom → injiseres i neste prosjekt */
    await page.evaluate(async () => { await window.CF.Retro.run(window.CF.Projects.list()[0]); });
    const lessons = await page.evaluate(() => JSON.parse(localStorage.getItem("cf_lessons")));
    check("retro lagret lærdom i cf_lessons", lessons.length === 1 && lessons[0].lesson.includes("falsk dør"), lessons);

    await page.click('nav button[data-tab="idea"]');
    await page.fill("#ideaName", "Neste idé");
    await page.fill("#ideaText", "Abonnement på digital hyttevedlikeholdsplan.");
    await page.click("#runIdeaBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 30000 });
    const lessonInjected = bodies.some((b) =>
      (b.system || "").includes("inntaksmodul") && (b.messages?.[0]?.content || "").includes("VARIGE LÆRDOMMER") && (b.messages?.[0]?.content || "").includes("falsk dør"));
    check("lærdommen injiseres i neste prosjekts inntak (læringssløyfe)", lessonInjected, null);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 7: modenhetsstige, markedsføring, måletall, gjenbruksbibliotek ---------- */
  console.log("FACTORY 7: modenhetsporter → marketing → måletall mot prognose → bibliotek");
  {
    const { page, errors } = await freshPage(browser);
    const { handler } = mockRouter();
    await page.route("**/v1/messages", handler);
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });
    await page.evaluate(async () => {
      await window.CF.BizModel.run(window.CF.Projects.list()[0]);
      await window.CF.SiteGen.run(window.CF.Projects.list()[0]);
    });
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");

    /* Modenhet: porter håndheves */
    const err1 = await page.evaluate(() => { try { window.CF.Maturity.declare(window.CF.Projects.list()[0], "prototype"); return null; } catch (e) { return e.message; } });
    check("erklæring uten fullført sjekkliste avvises", err1 && err1.includes("sjekkpunkt gjenstår"), err1);
    const err2 = await page.evaluate(() => { try { window.CF.Maturity.declare(window.CF.Projects.list()[0], "beta"); return null; } catch (e) { return e.message; } });
    check("nivåhopp på stigen avvises", err2 && err2.includes("ikke neste nivå"), err2);
    const err3 = await page.evaluate(() => { try { window.CF.Maturity.markLaunched(window.CF.Projects.list()[0]); return null; } catch (e) { return e.message; } });
    check("kan ikke markeres lansert før lanseringsklart", err3 && err3.includes("lanseringsklart"), err3);

    for (let i = 0; i < 3; i++) await page.click(`.mat-check >> nth=${i}`);
    await page.click("#matDeclare");
    let p = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("alle punkter huket → prototype erklært som eierbeslutning",
      p.maturity === "prototype" && p.decisions[0].decision.includes("MODENHET ERKLÆRT") && p.decisions[0].byOwner === true, p.maturity);

    /* Markedsføring (Fase 11) */
    await page.evaluate(async () => { await window.CF.Marketing.run(window.CF.Projects.list()[0]); });
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");
    const detail = await page.evaluate(() => document.getElementById("detail").textContent);
    check("markedsføringsmotor: prioriterte kanaler + eksperimentkø vises",
      detail.includes("MARKEDSFØRING") && detail.includes("SEO") && detail.includes("EKSPERIMENTKØ"), null);

    /* Måletall mot prognose (Fase 16) */
    await page.fill("#mtMonth", "2026-08");
    await page.fill("#mtCustomers", "25");
    await page.fill("#mtMrr", "2100");
    await page.fill("#mtVisitors", "1800");
    await page.click("#mtAdd");
    p = await page.evaluate(() => window.CF.Projects.list()[0]);
    const cmp = await page.evaluate(() => window.CF.Metrics.compare(window.CF.Projects.list()[0]));
    check("måletall registrert med prognose-sammenligning (modellmåned 1)",
      p.metrics.length === 1 && cmp[0].forecast_mrr !== null && cmp[0].forecast_customers !== null, cmp);
    const portfolio = await page.evaluate(() => document.getElementById("portfolio").textContent);
    check("porteføljen viser samlet MRR", portfolio.includes("samlet MRR") && portfolio.includes("2"), portfolio.slice(0, 120));

    /* Gjenbruksbibliotek fra retro */
    await page.evaluate(async () => { await window.CF.Retro.run(window.CF.Projects.list()[0]); });
    const lib = await page.evaluate(() => window.CF.Library.list());
    check("retro høster gjenbrukskandidater til biblioteket", lib.length === 2 && lib.every((x) => x.type === "kandidat" && x.source === "BoligPuls (TEST)"), lib);
    await page.click('nav button[data-tab="system"]');
    const libShown = await page.evaluate(() => document.getElementById("libraryList").textContent.includes("Landingsside-malen"));
    check("biblioteket vises under SYSTEM", libShown, null);

    /* Strategi (Fase 4), juridisk (Fase 10) og drift (Fase 13) */
    await page.evaluate(async () => {
      await window.CF.Strategy.run(window.CF.Projects.list()[0]);
      await window.CF.Legal.run(window.CF.Projects.list()[0]);
      await window.CF.Ops.run(window.CF.Projects.list()[0]);
    });
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");
    const detail2 = await page.evaluate(() => document.getElementById("detail").textContent);
    check("strategi vises med ikke-gjøre-liste", detail2.includes("SELSKAP OG STRATEGI") && detail2.includes("Skal IKKE gjøre") && detail2.includes("håndverkermarkedsplass"), null);
    check("juridisk kartlegging med fagperson-merking og disclaimer",
      detail2.includes("JURIDISK") && detail2.includes("IKKE juridisk rådgivning") && detail2.includes("KREVES"), null);
    check("driftsgrunnlag med svarmaler og automatiseringskandidater",
      detail2.includes("DRIFT OG KUNDESERVICE") && detail2.includes("Betalingsfeil") && detail2.includes("Bør automatiseres"), null);

    /* Teknisk arkitektur (Fase 7) */
    await page.evaluate(async () => { await window.CF.TechArch.run(window.CF.Projects.list()[0]); });
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");
    const taDetail = await page.evaluate(() => document.getElementById("detail").textContent);
    check("teknisk arkitektur vises med alternativer, binding og «trengs ikke enda»",
      taDetail.includes("TEKNISK ARKITEKTUR") && taDetail.includes("Supabase") && taDetail.includes("Firebase") && taDetail.includes("Trengs IKKE enda") && taDetail.includes("Kubernetes"), null);
    const taP = await page.evaluate(() => window.CF.Projects.list()[0]);
    check("arkitekturvalget er logget med alternativer og risiko",
      taP.decisions[0].decision.includes("Teknisk arkitektur valgt") && taP.decisions[0].options.length > 0 && taP.decisions[0].risk.includes("Supabase"), taP.decisions[0]);

    /* Lagringsrobusthet */
    const usage = await page.evaluate(() => window.CF.Store.usage());
    check("lagringsbruk måles per cf_-nøkkel", usage.totalKb > 0 && usage.rows.every((r) => r.key.startsWith("cf_")) && usage.limitKb === 5120, usage.totalKb);
    await page.click('nav button[data-tab="system"]');
    const storageShown = await page.evaluate(() => document.getElementById("storageUsage").textContent.includes("kB"));
    check("lagringsbruk vises under SYSTEM", storageShown, null);

    /* App-skall (Fase 8+9) – krever brief */
    const appErr = await page.evaluate(() => window.CF.AppGen.run(window.CF.Projects.list()[0]).then(() => null, (e) => e.message));
    check("app-skall krever MVP-brief", appErr && appErr.includes("brief"), appErr);
    await page.evaluate(async () => {
      await window.CF.Brief.run(window.CF.Projects.list()[0]);
      await window.CF.AppGen.run(window.CF.Projects.list()[0]);
    });
    const app = await page.evaluate(() => window.CF.Projects.list()[0].app);
    check("app-pakken har alle 5 filer", Object.keys(app.files).length === 5 && app.files["app/index.html"] && app.files["app/supabase-schema.sql"], Object.keys(app.files));
    check("appen har ærlig demo-modus og ingen hardkodede eksterne script",
      app.files["app/index.html"].includes("DEMO-MODUS") && !/<script src="http/i.test(app.files["app/index.html"]), null);
    check("SQL har RLS og webhook-mal krever signaturverifisering",
      app.files["app/supabase-schema.sql"].includes("enable row level security") && app.files["app/functions/stripe-webhook.js"].includes("STRIPE_WEBHOOK_SECRET"), null);
    check("config har Payment Link-plassholdere for planene fra forretningsmodellen",
      app.files["app/config.js"].includes('"Basis"') && app.files["app/config.js"].includes('"Pluss"') && !app.files["app/config.js"].includes("sk_"), null);

    /* Prosjektrapport (deterministisk Markdown) */
    const report = await page.evaluate(() => window.CF.Report.generate(window.CF.Projects.list()[0]));
    const pfReport = await page.evaluate(() => window.CF.Report.portfolio());
    check("porteføljerapporten samler status, MRR, lærdommer og bibliotek",
      pfReport.includes("Porteføljerapport") && pfReport.includes("2100 kr") && pfReport.includes("Varige lærdommer") && pfReport.includes("Gjenbruksbibliotek") && pfReport.includes("bør avsluttes"), pfReport.slice(0, 200));
    check("rapporten samler alle faser med logger og disclaimer",
      report.includes("# BoligPuls (TEST) – prosjektrapport") && report.includes("TESTPROSJEKT") &&
      report.includes("Fase 1 – Idévurdering") && report.includes("Fase 3 – Forretningsmodell") &&
      report.includes("Fase 4 – Strategi") && report.includes("IKKE juridisk rådgivning") &&
      report.includes("Beslutningslogg") && report.includes("Antakelseslogg") && report.includes("Fase 16 – Måletall"), report.slice(0, 200));
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  /* ---------- Scenario 8: det genererte app-skallet KJØRER – full brukerflyt i demo-modus ---------- */
  console.log("FACTORY 8: generert app kjører → signup → onboarding → gating → abonnement → utlogging");
  {
    const fs = require("fs");
    const path = require("path");
    const { spawn } = require("child_process");
    const scratch = require("path").join(require("os").tmpdir(), "saga-apptest");
    fs.mkdirSync(path.join(scratch, "app"), { recursive: true });

    /* Render app-pakken deterministisk (uten prosjektstate) og skriv til disk */
    const { page: factoryPage } = await freshPage(browser);
    const files = await factoryPage.evaluate((c) => window.CF.AppGen.renderApp(c, {}), APP);
    await factoryPage.close();
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(scratch, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const appServer = spawn("python3", ["-m", "http.server", "8131"], { cwd: scratch, stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 800));

    const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    try {
      await page.goto("http://localhost:8131/app/index.html", { waitUntil: "networkidle" });
      await page.evaluate(() => localStorage.clear());
      await page.goto("http://localhost:8131/app/index.html#/signup", { waitUntil: "networkidle" });

      const banner = await page.evaluate(() => !document.getElementById("demoBanner").hidden);
      check("demo-banner vises uten konfigurasjon", banner, null);

      /* Registrering → onboarding */
      await page.fill("#em", "test@example.com");
      await page.fill("#pw", "hemmelig123");
      await page.click("#go");
      await page.waitForFunction(() => location.hash === "#/onboarding" && document.getElementById("ob"), null, { timeout: 5000 });
      check("registrering fører til onboarding", true, null);
      for (let i = 0; i < 2; i++) {
        await page.fill("#ob", "Testsvar " + i);
        await page.click("#next");
        await page.waitForTimeout(150);
      }
      await page.waitForFunction(() => location.hash === "#/dashboard", null, { timeout: 5000 });

      /* Dashboard er sperret uten abonnement */
      const gated = await page.evaluate(() => document.getElementById("view").textContent);
      check("dashboard viser oppgraderingsmelding og moduler med tomtilstander",
        gated.includes("abonner") && gated.includes("Vedlikeholdsplanen") && gated.includes("Fullfør onboarding"), gated.slice(0, 120));

      /* Demo-abonnement åpner dashbordet */
      await page.click('a[href="#/abonnement"]');
      await page.waitForFunction(() => document.getElementById("view").textContent.includes("Status"), null, { timeout: 5000 });
      const subView = await page.evaluate(() => document.getElementById("view").textContent);
      check("abonnementssiden viser status og eier-port-melding for Payment Link",
        subView.includes("none") && subView.includes("eier-port"), subView.slice(0, 150));
      await page.click("[data-demo-plan]");
      await page.waitForFunction(() => document.getElementById("view").textContent.includes("active"), null, { timeout: 5000 });
      await page.click('a[href="#/dashboard"]');
      await page.waitForFunction(() => !document.getElementById("view").textContent.includes("Se planer"), null, { timeout: 5000 });
      check("aktivt demo-abonnement fjerner sperren", true, null);

      /* Utlogging */
      await page.click("#logoutLink");
      await page.waitForFunction(() => location.hash === "#/login", null, { timeout: 5000 });
      check("utlogging fører tilbake til innlogging", true, null);
      check("ingen JS-feil i den genererte appen", errors.length === 0, errors);
    } finally {
      appServer.kill();
      await page.close();
    }
  }

  /* ---------- Scenario 9: Control Center – command, godkjenninger, palett, kostnader, dype lenker, mobil ---------- */
  console.log("FACTORY 9: Control Center → varsler → palett → godkjenning → kostnader → dyp lenke → mobil");
  {
    const { page, errors } = await freshPage(browser);
    const { handler } = mockRouter();
    await page.route("**/v1/messages", handler);

    /* Ærlig tom tilstand i Command Center */
    const empty = await page.evaluate(() => document.getElementById("ccAlerts").textContent + document.getElementById("ccMrr").textContent);
    check("command center har veiledende tomme tilstander (ingen falske tall)",
      empty.includes("Ingenting venter") && empty.includes("Ingen måletall"), empty.slice(0, 80));

    /* Kommandopalett med tastatur: Ctrl+K → søk → Enter laster demo */
    await page.keyboard.press("Control+KeyK");
    await page.waitForSelector("#cmdk.on", { timeout: 3000 });
    await page.fill("#cmdkInput", "eksempel");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });
    check("kommandopaletten er tastaturdrevet og utfører handlinger", true, null);

    /* Dyp lenke: prosjektet har adresserbar URL som overlever reload */
    const hash = await page.evaluate(() => location.hash);
    check("prosjektvisningen setter dyp lenke (#/companies/<id>)", /^#\/companies\/p/.test(hash), hash);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });
    check("dyp lenke ruter rett til selskapet etter reload", true, null);
    const strip = await page.evaluate(() => ({ cur: document.querySelectorAll(".phasestrip .seg.cur").length, total: document.querySelectorAll(".phasestrip .seg").length }));
    check("fasestripen viser 17 faser med markert nåværende fase", strip.total === 17 && strip.cur === 1, strip);

    /* Command Center med ekte varsler fra demoprosjektet */
    await page.click('nav button[data-tab="command"]');
    const cc = await page.evaluate(() => document.getElementById("ccAlerts").textContent + "|" + document.getElementById("ccTiles").textContent);
    check("varsler viser ventende port og pulsen viser porteføljen",
      cc.includes("Port venter") && cc.includes("PROSJEKTER") && cc.includes("VENTENDE PORTER"), cc.slice(0, 120));
    const badge = await page.evaluate(() => ({ hidden: document.getElementById("navGateCount").hidden, n: document.getElementById("navGateCount").textContent }));
    check("navigasjonen viser port-teller", badge.hidden === false && badge.n === "1", badge);

    /* Godkjenningssenteret: kontekst + godkjenning logget som eier */
    await page.click('nav button[data-tab="approvals"]');
    const appr = await page.evaluate(() => document.getElementById("approvalsList").textContent);
    check("godkjenning viser hva/hvorfor/risiko/reverserbarhet",
      appr.includes("Hva:") && appr.includes("Hvorfor:") && appr.includes("Risiko:") && appr.includes("Reverserbarhet:"), appr.slice(0, 100));
    await page.click("#approvalsList [data-al-approve]");
    const afterApprove = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      const gates = Object.values(p.gates || {});
      return { gates: gates.length, byOwner: gates[0] && gates[0].byOwner, empty: document.getElementById("approvalsList").textContent.includes("Ingen ventende"), badgeHidden: document.getElementById("navGateCount").hidden };
    });
    check("port godkjent fra senteret: logget som eier, liste tømt, teller borte",
      afterApprove.gates === 1 && afterApprove.byOwner === true && afterApprove.empty && afterApprove.badgeHidden, afterApprove);

    /* Kostnadsmåler + aktivitetsspor etter reell (mocket) pipeline-kjøring */
    await page.click('nav button[data-tab="idea"]');
    await page.fill("#ideaName", "SmåbedriftCRM");
    await page.fill("#ideaText", "Abonnement for små bedrifter som trenger bedre kundeoppfølging.");
    await page.click("#runIdeaBtn");
    await page.waitForFunction(() => document.getElementById("pipeline").textContent.includes("FERDIG"), null, { timeout: 30000 });
    const meter = await page.evaluate(() => {
      const t = window.CF.Costs.totals();
      const act = window.CF.Activity.list(50);
      const exp = JSON.parse(window.CF.Store.exportAll());
      return { calls: t.calls, nok: t.estimateNok, perProject: window.CF.Costs.totals(window.CF.Projects.list()[0].id).calls, actHasCreate: act.some((a) => a.message.includes("Prosjekt opprettet")), exportHasAll: Array.isArray(exp.cf_activity) && Array.isArray(exp.cf_costs) && Array.isArray(exp.cf_lessons) && Array.isArray(exp.cf_library) };
    });
    check("kostnadsmåleren akkumulerer usage per prosjekt", meter.calls >= 8 && meter.nok > 0 && meter.perProject >= 8, meter);
    check("aktivitetssporet logger hendelser og eksporten dekker alt", meter.actHasCreate && meter.exportHasAll, meter);
    await page.click('nav button[data-tab="command"]');
    const cc2 = await page.evaluate(() => document.getElementById("ccTiles").textContent + "|" + document.getElementById("ccActivity").textContent);
    check("command center viser kostnad (merket estimat) og levende aktivitet",
      cc2.includes("AI-KOSTNAD") && cc2.includes("estimat") && cc2.includes("kr") && cc2.includes("Prosjekt opprettet"), cc2.slice(0, 150));

    /* Sammenlign idéer */
    await page.click('nav button[data-tab="idea"]');
    await page.evaluate(() => {
      const list = window.CF.Projects.list();
      document.getElementById("cmpA").value = list[0].id;
      document.getElementById("cmpB").value = list[1].id;
    });
    await page.click("#cmpBtn");
    const cmp = await page.evaluate(() => document.getElementById("cmpOut").textContent);
    check("idé-sammenligning viser scorekort side ved side med diff",
      cmp.includes("MOT") && cmp.includes("DIFF") && cmp.includes("problemsmerte"), cmp.slice(0, 100));
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();

    /* Mobil (390px): bunn-nav og godkjenninger fungerer */
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const mobErrors = [];
    mob.on("pageerror", (e) => mobErrors.push(e.message));
    await mob.route("**/v1/messages", handler);
    await mob.goto(BASE, { waitUntil: "networkidle" });
    await mob.evaluate(() => { localStorage.clear(); localStorage.setItem("jarvis_api_key", "sk-ant-test"); });
    await mob.reload({ waitUntil: "networkidle" });
    await mob.click('nav button[data-tab="system"]');
    await mob.click("#demoBtn");
    await mob.click('nav button[data-tab="approvals"]');
    await mob.waitForSelector("#approvalsList [data-al-approve]", { timeout: 5000 });
    const navFixed = await mob.evaluate(() => getComputedStyle(document.getElementById("sidebar")).position);
    await mob.click("#approvalsList [data-al-approve]");
    const mobOk = await mob.evaluate(() => Object.values(window.CF.Projects.list()[0].gates).length === 1 && document.getElementById("approvalsList").textContent.includes("Ingen ventende"));
    check("mobil: bunn-navigasjon (fixed) og godkjenning ende-til-ende", navFixed === "fixed" && mobOk, { navFixed, mobOk });
    check("ingen JS-feil på mobil", mobErrors.length === 0, mobErrors);
    await mob.close();
  }

  /* ---------- Scenario 10: v3 – kapitaldisiplin, vifte, vakthund, synk, publisering, innboks, selvtest ---------- */
  console.log("FACTORY 10: trakt → budsjett-kill → vifte → vakthund → synk (m/konflikt) → publisering → innboks → selvtest");
  {
    const { page, errors } = await freshPage(browser);
    const { handler } = mockRouter();
    await page.route("**/v1/messages", handler);
    page.on("dialog", (d) => d.accept("Testbegrunnelse"));

    /* Mocket GitHub API med tilstand: filer, sha-er, konflikt og ugyldig PAT */
    const gh = { files: {}, shaN: 1, puts: [] };
    await page.route("https://api.github.com/**", (route) => {
      const req = route.request();
      const auth = req.headers()["authorization"] || "";
      if (auth.includes("bad-pat")) return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Bad credentials" }) });
      const url = new URL(req.url());
      const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
      if (!m) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      const key = m[1] + "/" + decodeURIComponent(m[2]);
      if (req.method() === "GET") {
        const f = gh.files[key];
        if (!f) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Not Found" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sha: f.sha, content: Buffer.from(f.content, "utf-8").toString("base64") }) });
      }
      if (req.method() === "PUT") {
        const body = JSON.parse(req.postData());
        const existing = gh.files[key];
        if (existing && body.sha !== existing.sha) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "sha mismatch" }) });
        if (!existing && body.sha) return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ message: "sha provided for new file" }) });
        const sha = "sha" + gh.shaN++;
        gh.files[key] = { sha, content: Buffer.from(body.content, "base64").toString("utf-8") };
        gh.puts.push(key);
        return route.fulfill({ status: existing ? 200 : 201, contentType: "application/json", body: JSON.stringify({ content: { sha } }) });
      }
      return route.fulfill({ status: 404, body: "{}" });
    });

    /* Eier-køen før oppsett */
    const q0 = await page.evaluate(() => window.CF.OwnerQueue.compute().map((x) => x.id));
    check("eier-køen lister PAT, datarepo, Pages-repo og ekte idé før oppsett",
      ["pat", "syncrepo", "pubrepo", "realidea", "mergemain"].every((id) => q0.includes(id)), q0);
    const oqShown = await page.evaluate(() => document.getElementById("ccOwnerQueue").textContent.includes("DIN TUR"));
    check("DIN TUR-kortet vises i Command Center", oqShown, null);

    /* Demo + trakt */
    await page.click('nav button[data-tab="system"]');
    await page.click("#demoBtn");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("BoligPuls"), null, { timeout: 5000 });
    await page.click('nav button[data-tab="command"]');
    const funnel1 = await page.evaluate(() => document.getElementById("ccFunnel").textContent);
    check("trakten viser 1 idé vurdert og ærlige nuller videre", funnel1.includes("IDÉER VURDERT") && funnel1.includes("TESTER PUBLISERT") && funnel1.includes("BETALENDE KUNDER"), funnel1.slice(0, 100));

    /* Kapitaldisiplin: budsjett + utgifter → kill-varsler */
    const budgetAlerts = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      window.CF.Projects.setBudget(p, 1000);
      window.CF.Projects.addExpense(window.CF.Projects.get(p.id), { amount: 850, what: "Meta Ads falsk dør" });
      const warn = window.CF.Alerts.derive().find((a) => a.type === "budsjett");
      window.CF.Projects.addExpense(window.CF.Projects.get(p.id), { amount: 300, what: "Domene" });
      const kill = window.CF.Alerts.derive().find((a) => a.type === "budsjett");
      return { warnSev: warn && warn.severity, killSev: kill && kill.severity, killText: kill && kill.title };
    });
    check("budsjett: 80 %-varsel (sev1) → brukt opp (sev0) med kapital-disiplin-tekst",
      budgetAlerts.warnSev === 1 && budgetAlerts.killSev === 0 && budgetAlerts.killText.includes("brukt opp"), budgetAlerts);

    /* Prioritering */
    await page.click('nav button[data-tab="portfolio"]');
    const ranking = await page.evaluate(() => document.getElementById("ranking").textContent);
    check("prioriteringen viser transparent formel med budsjett-trekk",
      ranking.includes("score") && ranking.includes("over budsjett"), ranking.slice(0, 120));

    /* Monte Carlo-vifte */
    const sim = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      const s = window.CF.Finance.simulate({ ...p.bizmodel.model.assumptions, price_avg: p.bizmodel.computed.price_avg }, 200);
      return { ord: s.mrr.p10[23] <= s.mrr.p50[23] && s.mrr.p50[23] <= s.mrr.p90[23], cap: s.capital.p10 <= s.capital.p50 && s.capital.p50 <= s.capital.p90, runs: s.runs };
    });
    check("Monte Carlo: persentilorden holder for MRR og kapitalbehov", sim.ord && sim.cap && sim.runs === 200, sim);
    await page.click(".proj-item");
    const fan = await page.evaluate(() => document.getElementById("detail").textContent);
    check("viften og vakthunden vises i Fase 3-panelet", fan.includes("USIKKERHETSVIFTE") && fan.includes("VAKTHUNDEN"), null);

    /* Vakthunden flagger ønsketenkning */
    const wd = await page.evaluate(() => {
      const f = window.CF.Benchmarks.check({ churn_monthly: 0.005, signup_rate: 0.5, cac: 10, paid_conversion: 0.1, visitor_growth_pct_m: 0.05 });
      return f.filter((x) => x.severity === "optimistisk").map((x) => x.key);
    });
    check("vakthunden flagger churn/CAC/registrering utenfor spennet i gunstig retning",
      wd.includes("churn_monthly") && wd.includes("cac") && wd.includes("signup_rate"), wd);

    /* Synk: oppsett → push → pull → konflikt → ugyldig PAT */
    await page.click('nav button[data-tab="system"]');
    await page.fill("#ghPat", "good-pat");
    await page.fill("#syncRepo", "demo/saga-data");
    await page.fill("#pubRepo", "demo/saga");
    await page.click("#ghSaveBtn");
    await page.click("#syncPushBtn");
    await page.waitForFunction(() => document.getElementById("syncStatus").textContent.includes("Sist synket"), null, { timeout: 5000 });
    const pushed = gh.files["demo/saga-data/factory-data.json"];
    check("synk push skriver hele eksporten til datarepoet", !!pushed && pushed.content.includes("BoligPuls"), Object.keys(gh.files));
    /* Konflikt: en «annen enhet» endrer fila */
    gh.files["demo/saga-data/factory-data.json"].sha = "ekstern-endring";
    await page.click("#syncPushBtn");
    for (let i = 0; i < 25 && !gh.puts.some((k) => k.includes("factory-data.backup-")); i++) await new Promise((r) => setTimeout(r, 200));
    check("synk-konflikt: taperen sikkerhetskopieres i repoet før overskriving",
      gh.puts.some((k) => k.includes("factory-data.backup-")), gh.puts);
    /* Pull henter og anvender */
    const pullOk = await page.evaluate(async () => {
      const before = window.CF.Lessons.list().length;
      const remote = JSON.parse(window.CF.Store.exportAll());
      remote.cf_lessons = [{ lesson: "Synk-testlærdom", project: "SynkTest", at: new Date().toISOString() }];
      return { before, remote: JSON.stringify(remote) };
    });
    gh.files["demo/saga-data/factory-data.json"] = { sha: "pull-sha", content: pullOk.remote };
    await page.click("#syncPullBtn");
    await page.waitForFunction(() => window.CF.Lessons.list().some((l) => l.lesson === "Synk-testlærdom"), null, { timeout: 5000 });
    check("synk pull anvender fjerndata lokalt", true, null);
    /* Ugyldig PAT gir forståelig feil */
    await page.fill("#ghPat", "bad-pat");
    await page.click("#ghSaveBtn");
    await page.click("#syncPushBtn");
    await page.waitForFunction(() => document.getElementById("syncStatus").textContent.includes("PAT"), null, { timeout: 5000 });
    check("ugyldig PAT gir handlingsrettet feilmelding", true, null);
    await page.fill("#ghPat", "good-pat");
    await page.click("#ghSaveBtn");

    /* Publisering (eier-port) → live URL → trakt og live-panel */
    await page.evaluate(async () => { await window.CF.Landing.run(window.CF.Projects.list()[0], { formEndpoint: "https://formspree.io/f/test" }); });
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");
    await page.click("#lpPublish");
    await page.waitForFunction(() => document.getElementById("detail").textContent.includes("LIVE:"), null, { timeout: 5000 });
    const pub = await page.evaluate(() => {
      const p = window.CF.Projects.list()[0];
      return { url: p.landing.publishedUrl, logged: p.decisions[0].decision.includes("PUBLISERT") && p.decisions[0].byOwner, file: null };
    });
    check("falsk dør publisert bak eier-port med logget beslutning",
      pub.url === "https://demo.github.io/saga/landing/boligpuls-test/" && pub.logged &&
      !!gh.files["demo/saga/landing/boligpuls-test/index.html"], pub);
    await page.click('nav button[data-tab="command"]');
    const cc3 = await page.evaluate(() => ({ funnel: document.getElementById("ccFunnel").textContent, live: document.getElementById("ccLive").textContent }));
    check("trakten teller publisert test og live-panelet overvåker den",
      cc3.funnel.includes("TESTER PUBLISERT") && cc3.live.includes("LIVE TESTER") && cc3.live.includes("IKKE dømt"), cc3.live.slice(0, 100));

    /* Innboks + AEIS-radar-kandidater */
    await page.evaluate(() => {
      localStorage.setItem("aeis_ledger", JSON.stringify([{ id: "r1", at: new Date().toISOString(), title: "Radar", radar: "[MULIGHET] Abonnement på strømsparing for boligeiere – økende søkevolum." }]));
    });
    await page.click('nav button[data-tab="idea"]');
    await page.click("[data-radar-take]");
    const inboxHas = await page.evaluate(() => window.CF.Inbox.list().some((x) => x.source === "aeis-radar"));
    check("radar-funn kan tas inn i innboksen (lese-kontrakt mot AEIS)", inboxHas, null);
    await page.click("[data-inbox-run]");
    const prefilled = await page.evaluate(() => document.getElementById("ideaText").value.includes("strømsparing") && window.CF.Inbox.list().length === 0);
    check("innboks-idé forhåndsutfyller pipelinen og fjernes fra køen", prefilled, null);

    /* Tidslinje */
    await page.click('nav button[data-tab="portfolio"]');
    await page.click(".proj-item");
    const timeline = await page.evaluate(() => document.getElementById("detail").textContent);
    check("tidslinjen samler beslutninger, utgifter og publisering",
      timeline.includes("TIDSLINJE") && timeline.includes("Meta Ads") && timeline.includes("PUBLISERT"), null);

    /* Parkert-påminnelse */
    const parked = await page.evaluate(() => {
      const p2 = window.CF.Projects.create("Gammel idé", "En idé som ble parkert.");
      window.CF.Projects.park(window.CF.Projects.get(p2.id), "test");
      const raw = window.CF.Store.loadProject(p2.id);
      raw.updatedAt = new Date(Date.now() - 40 * 86400000).toISOString();
      window.CF.Store.set("cf_project_" + p2.id, raw);
      return window.CF.Alerts.derive().find((a) => a.type === "parkert");
    });
    check("parkerte prosjekter over 30 dager gir påminnelse", parked && parked.title.includes("dager"), parked && parked.title);

    /* Selvtest med reparasjon */
    const integ = await page.evaluate(() => {
      localStorage.setItem("cf_project_orphan1", JSON.stringify({ id: "orphan1", name: "Foreldreløs", decisions: [], assumptions: [] }));
      const before = window.CF.Integrity.check();
      const after = window.CF.Integrity.repair();
      return { foundOrphan: before.issues.some((i) => i.type === "foreldreløs_nøkkel"), okAfter: after.ok, indexed: window.CF.Store.projectIds().includes("orphan1") };
    });
    check("selvtesten finner foreldreløse nøkler og reparasjonen bevarer data",
      integ.foundOrphan && integ.okAfter && integ.indexed, integ);
    check("ingen JS-feil", errors.length === 0, errors);
    await page.close();
  }

  await browser.close();
  console.log(failures === 0 ? "\nALL FACTORY TESTS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
