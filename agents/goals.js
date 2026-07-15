/* Mål-treet (C2): én synlig kjede fra nordstjernen til dagens anbefaling.
 * Leser data/goals.json; nordstjernen hentes fra grunnloven hvis ikke satt.
 * Ingen LLM, 0 kr.
 */
"use strict";
const { dataPath, readJSON } = require("./lib/common");
const policy = require("./lib/policy");

function run() {
  const g = readJSON(dataPath("goals.json"), null) || {};
  const { c } = policy.load();
  const northStar = g.northStar || (c && c.northStar && c.northStar.text) || "ikke satt";
  const lines = [
    `Nordstjerne: ${northStar}`,
    g.quarter && g.quarter.goal ? `Kvartal: ${g.quarter.goal}` : "Kvartalsmål: ikke satt – sett det i appen (System → Mål).",
    g.week && g.week.focus ? `Ukens fokus: ${g.week.focus}` : "Ukens fokus: ikke satt – ukesbriefen spør deg søndag.",
  ];
  return { lines, hasWeekFocus: !!(g.week && g.week.focus) };
}

module.exports = { run };
if (require.main === module) console.log(JSON.stringify(run(), null, 2));
