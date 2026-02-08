# 00_CONTEXT

## Run Timestamp (UTC)
- 2026-02-08T21:21:41Z

## Repo Reality (evidence)
- `pwd` => `/Users/michaelpuchowezki/Dev/rubikvault-site`
- `git rev-parse --show-toplevel` => `/Users/michaelpuchowezki/Dev/rubikvault-site`
- `git remote -v` =>
  - `origin https://github.com/RubikVault/rubikvault-site.git (fetch)`
  - `origin https://github.com/RubikVault/rubikvault-site.git (push)`
- `git branch --show-current` => `main`
- `git rev-parse HEAD` => `980c1d5e482ea1b538f1c6cfb591f91df2b84b58`
- `git status --porcelain=v1` =>
  - ` M .gitignore`
  - `?? Report/RCA_2026-02-08/`
- `git log -10 --oneline` (top):
  - `980c1d5e fix(ops): restore data tracking and artifacts`
  - `0c00d132 Merge pull request #106 from RubikVault/fix/main-green-wp16-e2e`
  - `40858b67 fix(ci): remove invalid secrets context from workflow if expressions`

## Symptom Statement (input)
- User-reported issue to harden against: `public/data` missing, endpoint `404`, and Forecast showing `0 stocks` without resilient fallback.

## Referenced Deploy
- Main deploy reference from input: `main @ 980c1d5`
- URL from input: `https://dece36c6.rubikvault-site.pages.dev`
