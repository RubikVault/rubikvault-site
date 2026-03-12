# RUNBLOCK v3.0 Architecture

RUNBLOCK v3.0 is enforced as a strict five-layer pipeline:

1. Data Integrity
2. Regime Detection
3. Audit & Feedback
4. Validation & Governance
5. Feature Output

Core implementation paths:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/layers/01-data-integrity.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/layers/02-regime-detection.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/layers/03-audit-feedback.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/layers/04-validation-governance.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/layers/05-feature-output.mjs`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/runblock/runblock-pipeline.mjs`

Key guarantees:

- No downstream execution after hard data failure
- No feature output without immutable snapshot freeze
- Leakage failure forces `RED`
- Weekly regime classification is wired into orchestration
- Append-only decision logging is enforced at persistence time
- Elliott V1 is passive-only unless V2 hard gates are satisfied
- Global State is computed centrally and applied before output release

Storage model:

- Snapshots: append-only files under `public/data/v3/snapshots`
- Decision logs: append-only files under `public/data/v3/audit/decisions`
- Audit incidents: append-only files under `public/data/v3/audit/incidents`

Config model:

- Canonical local config aliases live in `config/runblock/*.yaml`
- Existing versioned policy mirrors remain in `policies/runblock/*.json`
- The pipeline loader prefers the YAML aliases and falls back to the JSON policy copies
