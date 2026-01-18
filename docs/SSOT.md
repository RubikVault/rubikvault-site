# SSOT Rules (RubikVault v3)

These are the permanent source-of-truth rules for data paths and contracts.

Rules
- Public output: `public/data/**`
- Snapshots: `public/data/snapshots/<id>.json`
- Mirrors (raw inputs): `mirrors/<id>.json`
- Never write/commit `public/mirrors/**`
- UI fetch paths: `/data/snapshots/<id>.json`
- CI bots may commit snapshots; humans do not
- Local testing: generate snapshots but do NOT commit them

Examples
- Snapshot: `public/data/snapshots/sp500-sectors.json`
- Mirror: `mirrors/sector-rotation.json`
- UI fetch: `/data/snapshots/rvci-engine.json`

Local Workflows
1) Generate snapshots locally for testing.
2) Before committing code changes, reset generated data:
```
scripts/dev/reset-generated.sh
```
3) Optional guard to block snapshot commits:
```
scripts/dev/no-snapshot-commit.sh
```

Notes
- `public/mirrors/**` is forbidden and will fail CI.
- Block contracts are stable:
  `{ schemaVersion, blockId, generatedAt, dataAt, meta, data }`.
