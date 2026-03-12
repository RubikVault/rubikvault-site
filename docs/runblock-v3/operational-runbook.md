# RUNBLOCK v3.0 Operational Runbook

Primary local commands:

- `npm run test:runblock`
- `npm run runblock:preflight`
- `npm run runblock:regime:daily`
- `npm run runblock:regime:weekly`
- `npm run runblock:shadow`
- `npm run runblock:leakage:ci`
- `npm run runblock:audit:replay`
- `npm run runblock:local-check`

Recommended local order:

1. Run `npm run runblock:preflight`
2. Run `npm run test:runblock`
3. Run `npm run runblock:regime:daily`
4. Run `npm run runblock:regime:weekly`
5. Run `npm run runblock:leakage:ci`
6. Run `npm run runblock:shadow`
7. Run `npm run runblock:local-check`

Operational expectations:

- If Data Integrity fails, stop. Do not release features.
- If leakage fails, stop. Global State must be `RED`.
- If Weekly Regime falls back on model failure, minimum Global State escalates.
- If decision logging fails, promote nothing and treat the run as failed.
- If a feature is suppressed or invalidated, output must be explicit and non-silent.

Local verification target:

- Open `/Users/michaelpuchowezki/Dev/rubikvault-site/public/runblock-v3-local-check.html`
- The page is backed by `public/data/runblock/v3/local-check.json`
