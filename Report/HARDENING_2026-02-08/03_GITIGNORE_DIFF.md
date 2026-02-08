# 03_GITIGNORE_DIFF

## Pre-change evidence (from initial run)
Command: `git --no-pager diff -- .gitignore`

Observed pre-change snippet:
```diff
-# mirrors/
-# public/data/
+mirrors/
+public/data/
```

Also observed pre-change forecast artifact ignores were uncommented (e.g. `public/data/forecast/latest.json`, `public/data/forecast/system/`, `public/data/forecast/system/status.json`).

## Applied hardening
- Removed blanket ignore patterns for `mirrors/` and `public/data/`.
- Removed ignore pattern for `public/data/forecast/system/` so `status.json` + `last_good.json` can be tracked.
- Kept granular ignore patterns for known generated subpaths (`public/data/forecast/v6/`, `mirrors/forecast/ledgers/`, etc.)

## Post-change evidence
Commands:
- `rg -n "^(public/data/|mirrors/)$" .gitignore || true`
  - Output: *(no matches)*
- `git --no-pager diff -- .gitignore`

Current diff:
```diff
diff --git a/.gitignore b/.gitignore
index 847027dc..32d20db1 100644
--- a/.gitignore
+++ b/.gitignore
@@ -136,11 +136,11 @@ mirrors/forecast/models/**
 mirrors/forecast/ledgers/
 mirrors/forecast/last_good/
 dev/Report10/**
-# public/data/marketphase/*.json
-# public/data/eod/bars/*.json
-# public/data/forecast/reports/**
+public/data/marketphase/*.json
+public/data/eod/bars/*.json
+public/data/forecast/reports/**
 # public/data/forecast/latest.json
-# public/data/forecast/scorecards/tickers.json.gz
+public/data/forecast/scorecards/tickers.json.gz
 # public/data/forecast/system/
 # public/data/forecast/system/status.json
 # public/data/forecast/system/last_good.json
@@ -151,7 +151,7 @@ proof.html
 public/data/forecast/v6/
 mirrors/forecast/ledgers/
 mirrors/forecast/last_good/
-public/data/forecast/system/
+# public/data/forecast/system/
 public/proof.html
```
