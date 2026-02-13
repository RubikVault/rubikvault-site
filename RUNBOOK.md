# FORENSIC CI/CD WORKFLOW AUDIT & CLEANUP RUNBOOK
**Version:** 2.0  
**Purpose:** Identify broken, stale, and legacy workflows; prioritize repairs; safely remove dead code  
**Target:** Projects with "many red runs, unsure which workflows are current"  
**Evidence Standard:** NEVER assert without file:line + execution proof  

---

## 📋 Executive Summary

**This runbook uses a 3-layer evidence model:**
1. **Inventory Layer** (Repo): What workflows claim to do (YAML analysis)
2. **Reality Layer** (GitHub Runs): What actually happens (execution history)
3. **Dependency Layer** (Cross-refs): What depends on what (impact analysis)

**Output:** Workflows classified into 6 categories with evidence-backed action plans.

---

## 🎯 Prerequisites

### Required Tools:
```bash
# GitHub CLI (for execution evidence)
gh --version  # Requires gh >= 2.0

# ripgrep (for repo scanning)
rg --version

# jq (for JSON processing)
jq --version

# actionlint (optional, for syntax checks)
actionlint --version
```

### Required Access:
- **Repo:** Read access to `.github/workflows/` and `scripts/`
- **GitHub:** Ability to run `gh run list`, `gh workflow list`
- **Time:** ~30-60 minutes for initial audit (depends on workflow count)

---

## 🔍 LAYER A: INVENTORY (Repo Scan)

**Goal:** Extract workflow metadata from YAML files.

### Step A1: List All Workflows
```bash
# Create working directory
mkdir -p audit-evidence/inventory

# List all workflow files
ls -1 .github/workflows/*.yml > audit-evidence/inventory/workflow-files.txt

# Count
wc -l audit-evidence/inventory/workflow-files.txt
```

### Step A2: Extract Workflow Metadata
```bash
# For each workflow, extract:
# - Triggers (on:)
# - Scripts called (node/bash commands)
# - Permissions
# - Secrets used
# - Concurrency settings
# - Paths written (publish targets)

for workflow in .github/workflows/*.yml; do
  NAME=$(basename "$workflow")
  echo "=== $NAME ===" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Triggers
  echo "TRIGGERS:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "^on:" -A 10 "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Script calls
  echo "SCRIPTS:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "run: node|run: bash|run: npm" "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Permissions
  echo "PERMISSIONS:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "permissions:" -A 5 "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Secrets
  echo "SECRETS:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "secrets\." "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Concurrency
  echo "CONCURRENCY:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "concurrency:" -A 3 "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  # Publish paths (artifacts)
  echo "PUBLISHES:" >> audit-evidence/inventory/workflow-metadata.txt
  rg "public/|mirrors/|data/|upload-artifact" "$workflow" >> audit-evidence/inventory/workflow-metadata.txt
  
  echo "" >> audit-evidence/inventory/workflow-metadata.txt
done
```

### Step A3: Extract Script References
```bash
# Find all scripts referenced in workflows
rg "node scripts/|bash scripts/" .github/workflows/*.yml \
  | cut -d: -f2 \
  | sed 's/.*node //; s/.*bash //; s/ .*//' \
  | sort -u > audit-evidence/inventory/referenced-scripts.txt

# Check which referenced scripts actually exist
while read script; do
  if [ -f "$script" ]; then
    echo "✅ $script" >> audit-evidence/inventory/script-existence.txt
  else
    echo "❌ MISSING: $script" >> audit-evidence/inventory/script-existence.txt
  fi
done < audit-evidence/inventory/referenced-scripts.txt
```

### Step A4: Extract Action Versions (Supply Chain)
```bash
# List all GitHub Actions used
rg "uses:" .github/workflows/*.yml \
  | grep -v "^#" \
  | cut -d: -f2- \
  | sed 's/uses: //' \
  | sort -u > audit-evidence/inventory/actions-used.txt

# Check pinning status (SHA vs tag)
echo "=== ACTION PINNING STATUS ===" > audit-evidence/inventory/action-pinning.txt
while read action; do
  if echo "$action" | grep -qE "@[a-f0-9]{40}"; then
    echo "✅ SHA-PINNED: $action" >> audit-evidence/inventory/action-pinning.txt
  elif echo "$action" | grep -qE "@v[0-9]"; then
    echo "⚠️  TAG-ONLY: $action" >> audit-evidence/inventory/action-pinning.txt
  else
    echo "❌ UNPINNED: $action" >> audit-evidence/inventory/action-pinning.txt
  fi
done < audit-evidence/inventory/actions-used.txt
```

---

## 🏃 LAYER B: REALITY (Execution Evidence)

**Goal:** Determine what actually runs and succeeds/fails.

### Step B1: Collect Run History (All Workflows)
```bash
mkdir -p audit-evidence/reality

# Get list of all workflows
gh workflow list --json name,id,state > audit-evidence/reality/workflows.json

# For each workflow, get last 30 runs
jq -r '.[] | .id' audit-evidence/reality/workflows.json | while read wf_id; do
  WF_NAME=$(jq -r ".[] | select(.id==$wf_id) | .name" audit-evidence/reality/workflows.json)
  
  gh run list --workflow "$wf_id" --limit 30 \
    --json databaseId,status,conclusion,createdAt,headBranch \
    > "audit-evidence/reality/${WF_NAME//[^a-zA-Z0-9]/_}_runs.json"
done
```

### Step B2: Calculate Success Rates
```bash
echo "WORKFLOW,TOTAL_RUNS,SUCCESS,FAILURE,SUCCESS_RATE,LAST_RUN,LAST_SUCCESS" \
  > audit-evidence/reality/success-rates.csv

for runs_file in audit-evidence/reality/*_runs.json; do
  WF_NAME=$(basename "$runs_file" _runs.json)
  
  TOTAL=$(jq 'length' "$runs_file")
  SUCCESS=$(jq '[.[] | select(.conclusion=="success")] | length' "$runs_file")
  FAILURE=$(jq '[.[] | select(.conclusion=="failure")] | length' "$runs_file")
  
  if [ "$TOTAL" -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=0; $SUCCESS*100/$TOTAL" | bc)
  else
    SUCCESS_RATE=0
  fi
  
  LAST_RUN=$(jq -r '.[0].createdAt // "NEVER"' "$runs_file")
  LAST_SUCCESS=$(jq -r '[.[] | select(.conclusion=="success")][0].createdAt // "NEVER"' "$runs_file")
  
  echo "$WF_NAME,$TOTAL,$SUCCESS,$FAILURE,$SUCCESS_RATE%,$LAST_RUN,$LAST_SUCCESS" \
    >> audit-evidence/reality/success-rates.csv
done
```

### Step B3: Extract Failure Signatures (Broken Workflows)
```bash
# For workflows with <80% success, get top error messages
mkdir -p audit-evidence/reality/failure-logs

awk -F, '$5 ~ /^[0-7][0-9]%/ {print $1}' audit-evidence/reality/success-rates.csv \
  | tail -n +2 | while read wf_name; do
  
  # Get ID of most recent failed run
  RUNS_FILE="audit-evidence/reality/${wf_name}_runs.json"
  FAILED_RUN_ID=$(jq -r '[.[] | select(.conclusion=="failure")][0].databaseId' "$RUNS_FILE")
  
  if [ "$FAILED_RUN_ID" != "null" ] && [ -n "$FAILED_RUN_ID" ]; then
    # Get failure log (last 50 lines with errors)
    gh run view "$FAILED_RUN_ID" --log 2>&1 \
      | grep -i "error\|fail\|cannot\|missing" \
      | tail -50 \
      > "audit-evidence/reality/failure-logs/${wf_name}.log"
  fi
done
```

### Step B4: Identify Stale Workflows
```bash
# Workflows not run in last 30 days
echo "=== STALE WORKFLOWS (no runs in 30+ days) ===" \
  > audit-evidence/reality/stale-workflows.txt

awk -F, '$6 == "NEVER" || $7 == "NEVER" {print $1}' \
  audit-evidence/reality/success-rates.csv \
  >> audit-evidence/reality/stale-workflows.txt
```

---

## 🔗 LAYER C: DEPENDENCY (Cross-Reference Analysis)

**Goal:** Understand what depends on what (safe-to-delete criteria).

### Step C1: Build Reference Graph
```bash
mkdir -p audit-evidence/dependencies

# For each workflow, identify:
# 1. What artifacts it PUBLISHES
# 2. What secrets it REQUIRES
# 3. What workflows CALL it (workflow_call)
# 4. What scripts it CALLS

echo "WORKFLOW,PUBLISHES,REQUIRES_SECRETS,CALLED_BY,CALLS_SCRIPTS" \
  > audit-evidence/dependencies/reference-graph.csv

for workflow in .github/workflows/*.yml; do
  NAME=$(basename "$workflow" .yml)
  
  # What it publishes (grep for paths)
  PUBLISHES=$(rg "public/|mirrors/|data/" "$workflow" 2>/dev/null \
    | grep -v "^#" | cut -d: -f2 | tr '\n' ';' || echo "NONE")
  
  # What secrets it uses
  SECRETS=$(rg "secrets\." "$workflow" 2>/dev/null \
    | grep -v "^#" | sed 's/.*secrets\.\([A-Z_]*\).*/\1/' | sort -u | tr '\n' ';' || echo "NONE")
  
  # What calls it (workflow_call)
  CALLED_BY=$(rg "uses:.*${NAME}" .github/workflows/*.yml 2>/dev/null \
    | cut -d: -f1 | xargs basename -a 2>/dev/null | tr '\n' ';' || echo "NONE")
  
  # What scripts it calls
  SCRIPTS=$(rg "node scripts/|bash scripts/" "$workflow" 2>/dev/null \
    | sed 's/.*node //; s/.*bash //; s/ .*//' | tr '\n' ';' || echo "NONE")
  
  echo "$NAME,\"$PUBLISHES\",\"$SECRETS\",\"$CALLED_BY\",\"$SCRIPTS\"" \
    >> audit-evidence/dependencies/reference-graph.csv
done
```

### Step C2: Detect Race Conditions (Concurrency Conflicts)
```bash
# Find workflows that publish to same paths but lack concurrency controls
echo "=== POTENTIAL RACE CONDITIONS ===" > audit-evidence/dependencies/race-conditions.txt

# Group workflows by publish paths
rg "public/data/|mirrors/" .github/workflows/*.yml \
  | grep -v "^#" \
  | sed 's/:.*public/\tpublic/; s/:.*mirrors/\tmirrors/' \
  | sort -k2 \
  > audit-evidence/dependencies/publish-paths.txt

# Find duplicates (same path, different workflows)
awk '{print $2}' audit-evidence/dependencies/publish-paths.txt \
  | sort | uniq -d | while read path; do
  
  echo "PATH: $path" >> audit-evidence/dependencies/race-conditions.txt
  grep "$path" audit-evidence/dependencies/publish-paths.txt \
    | cut -f1 | sort -u \
    >> audit-evidence/dependencies/race-conditions.txt
  
  # Check if those workflows have concurrency controls
  grep "$path" audit-evidence/dependencies/publish-paths.txt \
    | cut -f1 | cut -d: -f1 | sort -u | while read wf; do
    
    if ! rg -q "concurrency:" "$wf"; then
      echo "  ⚠️  NO CONCURRENCY: $(basename $wf)" \
        >> audit-evidence/dependencies/race-conditions.txt
    fi
  done
  
  echo "" >> audit-evidence/dependencies/race-conditions.txt
done
```

### Step C3: Identify Orphans (No Dependencies)
```bash
# Workflows that:
# - Are NOT called by others (CALLED_BY = NONE)
# - Publish NOTHING or deprecated paths
# - Use NO secrets (likely test/one-off)
# - Are STALE (no recent runs)

awk -F, '$4 == "NONE" && ($2 == "NONE" || $2 ~ /v3|old|deprecated/) {print $1}' \
  audit-evidence/dependencies/reference-graph.csv \
  > audit-evidence/dependencies/orphan-candidates.txt
```

---

## 📊 CLASSIFICATION ENGINE

**Goal:** Assign each workflow to exactly one category.

### Classification Rules:

| Category | Criteria | Action |
|----------|----------|--------|
| **ACTIVE_HEALTHY** | Success rate >95%, ran in last 7 days | ✅ Keep, monitor |
| **ACTIVE_BROKEN** | Runs regularly, success rate <80% | 🔧 **Repair (P0)** |
| **STALE** | No runs in 30+ days, has dependencies | ⚠️ Investigate, maybe deprecate |
| **MANUAL_TOOL** | Only `workflow_dispatch`, <5 runs ever | 📦 Archive (keep accessible) |
| **LEGACY** | References v3/old patterns, no runs, no deps | 🗑️ **Delete candidate** |
| **DANGEROUS** | Writes to prod paths, no concurrency, over-privileged | 🚨 **Repair (P0)** or disable |

### Step: Auto-Classify
```bash
mkdir -p audit-evidence/classification

# Create classification file
echo "WORKFLOW,CATEGORY,PRIORITY,REASON" > audit-evidence/classification/workflow-categories.csv

for workflow in .github/workflows/*.yml; do
  NAME=$(basename "$workflow" .yml)
  
  # Get success rate
  SUCCESS_RATE=$(grep "^$NAME," audit-evidence/reality/success-rates.csv \
    | cut -d, -f5 | sed 's/%//')
  
  # Get last run timestamp
  LAST_RUN=$(grep "^$NAME," audit-evidence/reality/success-rates.csv | cut -d, -f6)
  
  # Check dependencies
  IS_ORPHAN=$(grep -q "^$NAME$" audit-evidence/dependencies/orphan-candidates.txt && echo "YES" || echo "NO")
  
  # Check triggers
  IS_MANUAL=$(rg -q "workflow_dispatch:" "$workflow" && rg -qv "schedule:|push:|pull_request:" "$workflow" && echo "YES" || echo "NO")
  
  # Check for legacy patterns
  IS_LEGACY=$(rg -q "v3|WP[0-9]|old|deprecated" "$workflow" && echo "YES" || echo "NO")
  
  # Check for dangerous patterns
  IS_DANGEROUS=$(rg -q "public/|mirrors/" "$workflow" && ! rg -q "concurrency:" "$workflow" && echo "YES" || echo "NO")
  
  # Classify
  if [ "$SUCCESS_RATE" -gt 95 ] && [ "$LAST_RUN" != "NEVER" ]; then
    CATEGORY="ACTIVE_HEALTHY"
    PRIORITY="P3"
    REASON="High success rate, recent runs"
    
  elif [ "$SUCCESS_RATE" -lt 80 ] && [ "$LAST_RUN" != "NEVER" ]; then
    if [ "$IS_DANGEROUS" == "YES" ]; then
      CATEGORY="DANGEROUS"
      PRIORITY="P0"
      REASON="Broken + writes prod paths without concurrency"
    else
      CATEGORY="ACTIVE_BROKEN"
      PRIORITY="P0"
      REASON="Runs regularly but fails >20% of time"
    fi
    
  elif [ "$LAST_RUN" == "NEVER" ] || [ -z "$LAST_RUN" ]; then
    if [ "$IS_LEGACY" == "YES" ] && [ "$IS_ORPHAN" == "YES" ]; then
      CATEGORY="LEGACY"
      PRIORITY="P2"
      REASON="Old pattern, no deps, no runs"
    elif [ "$IS_MANUAL" == "YES" ]; then
      CATEGORY="MANUAL_TOOL"
      PRIORITY="P3"
      REASON="Manual-only, infrequent use"
    else
      CATEGORY="STALE"
      PRIORITY="P2"
      REASON="No runs in 30+ days"
    fi
    
  else
    CATEGORY="STALE"
    PRIORITY="P2"
    REASON="Low activity or unclear status"
  fi
  
  echo "$NAME,$CATEGORY,$PRIORITY,\"$REASON\"" \
    >> audit-evidence/classification/workflow-categories.csv
done
```

---

## 🔧 REPAIR STRATEGY (P0 First)

### P0 Repair Checklist (ACTIVE_BROKEN + DANGEROUS)

For each P0 workflow, diagnose these common issues **in order**:

| Check | Command | Fix |
|-------|---------|-----|
| **1. Script Path** | `rg "node scripts/" WORKFLOW.yml` | Verify script exists at exact path |
| **2. Node Version** | `rg "node-version:" WORKFLOW.yml` | Match `package.json` engines requirement |
| **3. Permissions** | `rg "permissions:" WORKFLOW.yml` | Use least-privilege (read-only default) |
| **4. Secrets** | `rg "secrets\." WORKFLOW.yml` | Check all secrets exist in repo settings |
| **5. Concurrency** | `rg "concurrency:" WORKFLOW.yml` | Add if workflow writes to shared paths |
| **6. Working Directory** | `rg "working-directory:" WORKFLOW.yml` | Verify paths are correct (monorepo) |
| **7. Output Contract** | Check if script generates `meta.status` | Add validation step in workflow |

### Step: Generate Repair Plan
```bash
mkdir -p audit-evidence/repairs

# For each P0 workflow, create diagnosis file
awk -F, '$3 == "P0" {print $1}' audit-evidence/classification/workflow-categories.csv \
  | tail -n +2 | while read wf_name; do
  
  WF_FILE=".github/workflows/${wf_name}.yml"
  
  echo "=== DIAGNOSIS: $wf_name ===" > "audit-evidence/repairs/${wf_name}.md"
  
  # 1. Script paths
  echo "## Script Paths" >> "audit-evidence/repairs/${wf_name}.md"
  rg "node scripts/|bash scripts/" "$WF_FILE" \
    >> "audit-evidence/repairs/${wf_name}.md" 2>&1 || echo "No scripts found"
  
  # Check existence
  rg "node scripts/|bash scripts/" "$WF_FILE" \
    | sed 's/.*node //; s/.*bash //; s/ .*//' | while read script; do
    if [ -f "$script" ]; then
      echo "✅ EXISTS: $script" >> "audit-evidence/repairs/${wf_name}.md"
    else
      echo "❌ MISSING: $script" >> "audit-evidence/repairs/${wf_name}.md"
    fi
  done
  
  # 2. Node version
  echo "" >> "audit-evidence/repairs/${wf_name}.md"
  echo "## Node Version" >> "audit-evidence/repairs/${wf_name}.md"
  rg "node-version:" "$WF_FILE" >> "audit-evidence/repairs/${wf_name}.md" 2>&1 || echo "Not set"
  
  # 3. Permissions
  echo "" >> "audit-evidence/repairs/${wf_name}.md"
  echo "## Permissions" >> "audit-evidence/repairs/${wf_name}.md"
  rg "permissions:" -A 5 "$WF_FILE" >> "audit-evidence/repairs/${wf_name}.md" 2>&1 || echo "Default (read-only)"
  
  # 4. Secrets
  echo "" >> "audit-evidence/repairs/${wf_name}.md"
  echo "## Secrets Used" >> "audit-evidence/repairs/${wf_name}.md"
  rg "secrets\." "$WF_FILE" >> "audit-evidence/repairs/${wf_name}.md" 2>&1 || echo "None"
  
  # 5. Concurrency
  echo "" >> "audit-evidence/repairs/${wf_name}.md"
  echo "## Concurrency" >> "audit-evidence/repairs/${wf_name}.md"
  rg "concurrency:" -A 3 "$WF_FILE" >> "audit-evidence/repairs/${wf_name}.md" 2>&1 || echo "❌ NOT SET"
  
  # 6. Failure signature
  echo "" >> "audit-evidence/repairs/${wf_name}.md"
  echo "## Recent Failure" >> "audit-evidence/repairs/${wf_name}.md"
  if [ -f "audit-evidence/reality/failure-logs/${wf_name}.log" ]; then
    head -20 "audit-evidence/reality/failure-logs/${wf_name}.log" \
      >> "audit-evidence/repairs/${wf_name}.md"
  else
    echo "No recent failures logged" >> "audit-evidence/repairs/${wf_name}.md"
  fi
  
done
```

---

## 🗑️ SAFE DELETION PROTOCOL

**CRITICAL:** Never delete directly. Always deprecate first.

### Phase 1: Deprecation (Workflows marked LEGACY)

```bash
# For each LEGACY workflow, add deprecation notice
awk -F, '$2 == "LEGACY" {print $1}' audit-evidence/classification/workflow-categories.csv \
  | tail -n +2 | while read wf_name; do
  
  WF_FILE=".github/workflows/${wf_name}.yml"
  
  # Create deprecation branch
  git checkout -b "deprecate/${wf_name}"
  
  # Add deprecation header to workflow
  cat > "/tmp/deprecation-header.yml" << 'EOF'
# ⚠️  DEPRECATED: [DATE]
# Reason: [REASON FROM CLASSIFICATION]
# Replacement: [IF APPLICABLE]
# Scheduled deletion: [DATE + 14 days]
# Emergency contact: [TEAM/PERSON]

EOF
  
  # Prepend to workflow
  cat "/tmp/deprecation-header.yml" "$WF_FILE" > "/tmp/${wf_name}.yml"
  mv "/tmp/${wf_name}.yml" "$WF_FILE"
  
  # Disable triggers (keep manual for emergency)
  # This requires manual edit - flag for review
  echo "⚠️  MANUAL EDIT REQUIRED: $WF_FILE" >> audit-evidence/deprecation-checklist.txt
  echo "   - Change 'on:' to only 'workflow_dispatch' with force flag" \
    >> audit-evidence/deprecation-checklist.txt
  
  git add "$WF_FILE"
  git commit -m "chore: deprecate $wf_name (legacy workflow)"
done
```

### Phase 2: Monitor Period (14 days)

```bash
# After deprecation PR is merged, monitor for:
# - Any manual runs
# - Any errors referencing deprecated workflows
# - Any developer questions

# Automated check (run daily):
awk -F, '$2 == "LEGACY" {print $1}' audit-evidence/classification/workflow-categories.csv \
  | tail -n +2 | while read wf_name; do
  
  # Check runs since deprecation
  RUNS_SINCE=$(gh run list --workflow="${wf_name}.yml" \
    --created ">=$(date -d '14 days ago' +%Y-%m-%d)" \
    --json conclusion | jq 'length')
  
  if [ "$RUNS_SINCE" -gt 0 ]; then
    echo "⚠️  $wf_name was used $RUNS_SINCE times - DO NOT DELETE YET" \
      >> audit-evidence/deprecation-monitoring.txt
  else
    echo "✅ $wf_name - safe to delete ($RUNS_SINCE runs)" \
      >> audit-evidence/deprecation-monitoring.txt
  fi
done
```

### Phase 3: Permanent Deletion (after monitoring)

```bash
# Only delete workflows with 0 runs in monitoring period
awk -F, '$2 == "LEGACY" {print $1}' audit-evidence/classification/workflow-categories.csv \
  | tail -n +2 | while read wf_name; do
  
  # Final safety check
  if grep -q "✅ $wf_name - safe to delete" audit-evidence/deprecation-monitoring.txt; then
    
    git checkout -b "cleanup/${wf_name}"
    git rm ".github/workflows/${wf_name}.yml"
    git commit -m "chore: remove deprecated workflow $wf_name (no usage in 14d)"
    
    echo "Deleted: $wf_name" >> audit-evidence/deletion-log.txt
  fi
done
```

---

## ✅ VERIFICATION PROTOCOL

### After Each Fix:

```bash
# Template for per-workflow verification
WORKFLOW_NAME="forecast-daily"  # CHANGE THIS

echo "=== VERIFICATION: $WORKFLOW_NAME ===" > "audit-evidence/verification/${WORKFLOW_NAME}.log"

# 1. Pre-fix baseline
echo "## Pre-Fix State" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
gh run list --workflow="${WORKFLOW_NAME}.yml" --limit 3 --json conclusion \
  >> "audit-evidence/verification/${WORKFLOW_NAME}.log"

# 2. Trigger test run
echo "## Triggering Test Run" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
gh workflow run "${WORKFLOW_NAME}.yml"

# 3. Wait for completion (max 10 min)
sleep 60  # Give it time to start
gh run watch --exit-status

# 4. Post-fix validation
echo "## Post-Fix State" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
gh run list --workflow="${WORKFLOW_NAME}.yml" --limit 1 --json conclusion,status \
  >> "audit-evidence/verification/${WORKFLOW_NAME}.log"

# 5. Artifact validation (if workflow publishes)
if rg -q "public/data/" ".github/workflows/${WORKFLOW_NAME}.yml"; then
  echo "## Artifact Check" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
  
  # Find what it should publish
  ARTIFACT_PATH=$(rg "public/data/" ".github/workflows/${WORKFLOW_NAME}.yml" \
    | head -1 | sed 's/.*public/public/; s/ .*//')
  
  if [ -f "$ARTIFACT_PATH" ]; then
    # Check timestamp (should be fresh)
    MODIFIED=$(stat -f "%Sm" "$ARTIFACT_PATH")
    echo "✅ Artifact exists: $ARTIFACT_PATH (modified: $MODIFIED)" \
      >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
    
    # Validate JSON structure (if JSON)
    if [[ "$ARTIFACT_PATH" == *.json ]]; then
      if jq -e '.meta.status' "$ARTIFACT_PATH" > /dev/null 2>&1; then
        echo "✅ JSON valid with meta.status" \
          >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
      else
        echo "❌ JSON missing meta.status" \
          >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
      fi
    fi
  else
    echo "❌ Artifact NOT FOUND: $ARTIFACT_PATH" \
      >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
  fi
fi

# 6. Success criteria
echo "## Final Verdict" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
CONCLUSION=$(gh run list --workflow="${WORKFLOW_NAME}.yml" --limit 1 --json conclusion \
  | jq -r '.[0].conclusion')

if [ "$CONCLUSION" == "success" ]; then
  echo "✅ VERIFICATION PASSED" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
else
  echo "❌ VERIFICATION FAILED" >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
  echo "Action: Review logs and rollback if needed" \
    >> "audit-evidence/verification/${WORKFLOW_NAME}.log"
fi
```

---

## 📈 FINAL REPORT GENERATION

```bash
mkdir -p audit-report

cat > audit-report/SUMMARY.md << 'EOF'
# CI/CD Workflow Audit Report
**Date:** $(date +%Y-%m-%d)
**Auditor:** [YOUR NAME]

## Executive Summary

**Total Workflows:** $(ls -1 .github/workflows/*.yml | wc -l)

### Classification Breakdown:
```bash
echo "| Category | Count | Action Required |" >> audit-report/SUMMARY.md
echo "|----------|-------|-----------------|" >> audit-report/SUMMARY.md

for category in ACTIVE_HEALTHY ACTIVE_BROKEN STALE MANUAL_TOOL LEGACY DANGEROUS; do
  COUNT=$(awk -F, "\$2 == \"$category\" {print \$1}" audit-evidence/classification/workflow-categories.csv | wc -l)
  
  case $category in
    ACTIVE_HEALTHY) ACTION="Monitor" ;;
    ACTIVE_BROKEN) ACTION="🔧 REPAIR (P0)" ;;
    STALE) ACTION="⚠️ Investigate" ;;
    MANUAL_TOOL) ACTION="📦 Archive" ;;
    LEGACY) ACTION="🗑️ Delete (after deprecation)" ;;
    DANGEROUS) ACTION="🚨 REPAIR or DISABLE (P0)" ;;
  esac
  
  echo "| $category | $COUNT | $ACTION |" >> audit-report/SUMMARY.md
done

echo '```' >> audit-report/SUMMARY.md

cat >> audit-report/SUMMARY.md << 'EOF'

## P0 Repairs Required:
EOF

awk -F, '$3 == "P0" {print "- **" $1 "** (" $2 "): " $4}' \
  audit-evidence/classification/workflow-categories.csv \
  >> audit-report/SUMMARY.md

cat >> audit-report/SUMMARY.md << 'EOF'

## Deletion Candidates (LEGACY):
EOF

awk -F, '$2 == "LEGACY" {print "- " $1 " - " $4}' \
  audit-evidence/classification/workflow-categories.csv \
  >> audit-report/SUMMARY.md

cat >> audit-report/SUMMARY.md << 'EOF'

## Evidence Location:
- Full data: `audit-evidence/`
- Repair plans: `audit-evidence/repairs/`
- Classification: `audit-evidence/classification/workflow-categories.csv`

## Next Steps:
1. Review P0 repair plans in `audit-evidence/repairs/`
2. Fix P0 workflows using 7-point checklist
3. Deprecate LEGACY workflows (add notice, disable triggers)
4. Monitor for 14 days
5. Delete workflows with 0 usage

---
**Audit Standard:** Evidence-based, file:line referenced, execution-verified
EOF
```

---

## 🚀 USAGE: Run Complete Audit

```bash
#!/bin/bash
# save as: run-audit.sh

set -e  # Exit on error

echo "🔍 Starting CI/CD Workflow Audit..."

# Layer A: Inventory
echo "📋 Layer A: Scanning repository..."
bash -c "$(sed -n '/^## 🔍 LAYER A/,/^## 🏃 LAYER B/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Layer B: Reality
echo "🏃 Layer B: Collecting execution evidence..."
bash -c "$(sed -n '/^## 🏃 LAYER B/,/^## 🔗 LAYER C/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Layer C: Dependencies
echo "🔗 Layer C: Analyzing dependencies..."
bash -c "$(sed -n '/^## 🔗 LAYER C/,/^## 📊 CLASSIFICATION/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Classification
echo "📊 Classifying workflows..."
bash -c "$(sed -n '/^## 📊 CLASSIFICATION/,/^## 🔧 REPAIR/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Generate report
echo "📈 Generating final report..."
bash -c "$(sed -n '/^## 📈 FINAL REPORT/,/^## 🚀 USAGE/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

echo "✅ Audit complete!"
echo "📄 Report: audit-report/SUMMARY.md"
echo "📁 Evidence: audit-evidence/"
```

---

## 📚 APPENDIX: LLM Analysis Prompt

**After running audit, feed this to Antigravity/Gemini:**

```
I've completed a forensic CI/CD audit of my GitHub Actions workflows.

Please analyze the evidence and provide:
1. Root cause clusters for ACTIVE_BROKEN workflows (group by common failure patterns)
2. Prioritized repair roadmap (P0 → P1 → P2)
3. Risk assessment for LEGACY deletion candidates
4. Dependency impact analysis

Evidence files:
- audit-evidence/reality/success-rates.csv
- audit-evidence/reality/failure-logs/*.log
- audit-evidence/dependencies/reference-graph.csv
- audit-evidence/dependencies/race-conditions.txt
- audit-evidence/classification/workflow-categories.csv
- audit-evidence/repairs/*.md

Focus on:
- Quick wins (high-impact, low-effort)
- Cascading fixes (one fix helps multiple workflows)
- Hidden dependencies (workflows that look orphan but aren't)
```

---

**END OF RUNBOOK**

---
