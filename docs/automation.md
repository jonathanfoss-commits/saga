# SAGA – automatisering av forbedringsloopen

## Kommandoen

```bash
npm run saga improve      # eller: node tools/saga-cli.js improve
```

Loopen (guardrails er innebygd i CLI-en og skal ikke fjernes):
1. Leser `docs/improvements.md` (+ appens `saga_improvements` kan
   eksporteres dit via `SAGA.improve.exportMd()` i konsollen)
2. Prioriterer etter effekt (↓) og innsats (↑)
3. Bytter til branchen **`saga/auto-improve`** – aldri main direkte
4. Med `claude` CLI i miljøet: implementerer toppsaken autonomt; uten:
   committer en prioritert plan til `changelog-auto.md`
5. **Avviser automatisk** endringer som (a) rører hemmeligheter/nøkler,
   betalings-/publiseringslogikk eller CI-workflows, eller (b) gir rød
   testsuite – da rulles alt tilbake
6. Alt logges med begrunnelse i `docs/changelog-auto.md`
7. Merges aldri automatisk – mennesket tar PR-en fra `saga/auto-improve`

## Kjøring på schedule

**Lokalt (cron på egen maskin med Claude Code installert):**
```cron
0 6 * * 1  cd /path/til/repo && git pull && npm run saga improve && git push -u origin saga/auto-improve
```

**GitHub Actions (mal – bevisst IKKE aktivert):** krever `ANTHROPIC_API_KEY`
som repo-secret (eier-handling). Legg i `.github/workflows/saga-improve.yml`:
```yaml
name: saga improve
on:
  schedule: [{ cron: "0 6 * * 1" }]
  workflow_dispatch:
jobs:
  improve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i && npx playwright install chromium
      - run: npm i -g @anthropic-ai/claude-code
      - run: npm run saga improve
        env: { ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} }
      - run: git push -u origin saga/auto-improve --force-with-lease
```

**n8n:** ikke i stacken i dag. Skulle det komme til: et Schedule-node →
Execute Command-node med kommandoen over gjør samme jobb.

## Kilder til forbedringer

- Manuelle innslag i `improvements.md` (formatet står øverst i filen)
- Automatisk: factory logger API-feil per modul til `saga_improvements`
  (dedupet); flere moduler kan koble seg på via `SAGA.improve.log()`
