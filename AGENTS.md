# RubikVault — Agent Instructions

> **Read [`PROJECT.md`](PROJECT.md) first.** It contains all project goals, architecture principles, and hard constraints.
> Then read [`docs/ops/lessons-learned.md`](docs/ops/lessons-learned.md) to avoid known mistakes.

## Quick Rules
- No new paid infrastructure services. Cloudflare and GitHub stay Free Tier; EODHD is the existing provider.
- Keep GitHub Actions, artifacts, packages, and storage lean; do not require paid runners or paid GitHub features.
- Minimal diffs. No re-architecture.
- Evidence-based fixes only.
- Cloudflare deployments must be verified: build success, smoke checks, and failing deploys fixed.
- GitHub workflows must not stay red on `main`; fix them or remove only when proven obsolete.
- Never commit private personal data, secrets, or private account details to `main`.
- User-facing website/dashboard/content on `main` is English-only.
- Keep static deployment artifacts compact for the ~90k-asset Stock Analyzer and future mobile apps.
- Pipeline runs on NAS via `rv-nas-night-supervisor.sh`, not the old `pipeline-master`.
- Do not depend on Codex heartbeats for production automation; durable scheduling belongs on NAS.
- Universe: STOCK + ETF + INDEX for US, EU, Asia.
- Every asset must be `All Systems Operational` or have a documented provider-side reason why not.
