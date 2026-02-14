# 00_SCOPE

## Untracked Policy
- Only `docs/STATUS_QUO/*` is allowed as untracked.
- No other untracked files are allowed.

## Step 1 Outputs (Before Cleanup) — verbatim

### CMD
`git status -sb`

### OUTPUT
```text
## main...origin/main
M  public/index.html
?? docs/STATUS_QUO/
?? functions/api/stock.js.bak
?? public/data/v3/system/_api_rebuild_summary.json
?? public/data/v3/system/_freshness_audit.json
?? public/data/v3/system/_root_cause.json
?? public/data/v3/system/_truth_snapshot.json
?? scripts/audit/freshness-check.mjs
```

### CMD
`git ls-files --others --exclude-standard`

### OUTPUT
```text
docs/STATUS_QUO/00_SCOPE.md
docs/STATUS_QUO/01_UI_PROOF.md
docs/STATUS_QUO/02_DECISION.md
functions/api/stock.js.bak
public/data/v3/system/_api_rebuild_summary.json
public/data/v3/system/_freshness_audit.json
public/data/v3/system/_root_cause.json
public/data/v3/system/_truth_snapshot.json
scripts/audit/freshness-check.mjs
```

## Step 3 Outputs (After Cleanup) — verbatim

### CMD
`git status -sb`

### OUTPUT
```text
## main...origin/main
M  public/index.html
?? docs/STATUS_QUO/
```

### CMD
`git ls-files --others --exclude-standard`

### OUTPUT
```text
docs/STATUS_QUO/00_SCOPE.md
docs/STATUS_QUO/01_UI_PROOF.md
docs/STATUS_QUO/02_DECISION.md
```

## Scope Decision
- `Scope = UI_ONLY`
- Reason: only tracked modified/staged file is `public/index.html`; only allowed untracked files are under `docs/STATUS_QUO/*`.
