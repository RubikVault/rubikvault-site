# 🎯 RubikVault – Mission Control v3.0

> **0€ Operation | Unsinkable | Mobile-Ready | 100% Open Source**

**RubikVault** ist eine moderne Financial Data Platform, die auf der **Mission Control v3.0 Architektur** basiert. Das System aggregiert, validiert und publiziert Finanzmarktdaten mit **Zero-Cost**, **Zero-Downtime** und **Zero-Compromise** Philosophie.

[![Deployment](https://img.shields.io/badge/Deployed-Cloudflare_Pages-orange)](https://rubikvault-site.pages.dev)
[![Compliance](https://img.shields.io/badge/Compliance-100%25-green)](./COMPLIANCE_AUDIT.md)
[![PWA](https://img.shields.io/badge/PWA-Ready-blue)](https://rubikvault-site.pages.dev)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

---

## 🔧 Operational Status

- **Ops Runbook (central):** [`docs/ops/runbook.md`](docs/ops/runbook.md)
- **NAS Runbook:** [`docs/ops/nas-runbook.md`](docs/ops/nas-runbook.md)
- **NAS Benchmark Plan:** [`docs/ops/nas-benchmark-plan.md`](docs/ops/nas-benchmark-plan.md)
- **NAS Migration Journal:** [`docs/ops/nas-migration-journal.md`](docs/ops/nas-migration-journal.md)
- **NAS Capacity Matrix:** `tmp/nas-benchmarks/nas-capacity-decision-matrix.md`
- **NAS Overnight Summary:** `tmp/nas-benchmarks/nas-overnight-summary-latest.md`
- **NAS Morning Report:** `tmp/nas-benchmarks/nas-morning-report-latest.md`
- **NAS Pipeline Census:** `tmp/nas-benchmarks/pipeline-census-latest.md`
- **NAS Main-Device Feasibility:** `tmp/nas-benchmarks/nas-main-device-feasibility-latest.md`
- **NAS Proof Matrix:** `tmp/nas-benchmarks/pipeline-proof-matrix-latest.md`
- **Live Dashboard:** `http://127.0.0.1:8788/dashboard_v7`
- **SSOT:** `public/data/reports/system-status-latest.json` (producer: `node scripts/ops/build-system-status-report.mjs`)
- **Universe UI Audit:** `public/data/reports/stock-analyzer-universe-audit-latest.json` (producer: `node scripts/ops/build-stock-analyzer-universe-audit.mjs ...`)

Current NAS benchmark verdict:
- `stage1`, `stage2`, `stage3`, `stage4:scientific_summary`: benchmarked NAS offload candidates
- `stage4:etf_diagnostic`: benchmarked `mac_only`
- `stage4:daily_audit_report`, `stage4:cutover_readiness_report`: benchmark-seeded, still `insufficient_data`

> Note: `RUNBOOK.md` at the repo root is a CI/CD workflow audit guide. For pipeline recovery, use `docs/ops/runbook.md`.
> Green-keeping order lives only in `docs/ops/runbook.md`: do not invent an alternative step order outside that file.

---

## 🌟 **Features**

### **Core Architecture**
- ✅ **0€ Operation**: Cloudflare Free Tier + GitHub Actions only
- ✅ **Unsinkable**: Always serves `last_good` data, never blank pages
- ✅ **Atomic Publishing**: tmp → validate → promote workflow
- ✅ **Manifest-First**: Control plane separates state from data
- ✅ **Multi-Frequency**: Mixed freshness policies (EOD, 4x/day, market-days-only)

### **Observability**
- ✅ **Mission Control**: `/internal/health` dashboard with Proof Chain
- ✅ **Debug Mode**: `?debug=1` on any `/api/*` endpoint
- ✅ **Audit Log**: Rolling 50 events (PUBLISH, BLOCK, STATE_CHANGE)
- ✅ **Failure Hints**: 18 classified failure modes with remediation
- ✅ **Root Cause < 2 Minutes**: Drill-down from dashboard to fix

### **Quality & Safety**
- ✅ **CI Gates**: Asset budget, schema validation, integrity checks
- ✅ **Validation-before-Publish**: Record-level + plausibility rules
- ✅ **Timestamps Validation**: Future-proof integrity checks
- ✅ **Build ID Tracing**: Time-based, Git-traceable identifiers
- ✅ **Rolling Window Cleanup**: Auto-delete old daily snapshots

### **Mobile & PWA**
- ✅ **Progressive Web App**: Installable on iOS & Android
- ✅ **Offline Capable**: Service Worker with cache strategies
- ✅ **Deep Links**: Share stocks via `/analyze/AAPL`
- ✅ **App Store Ready**: PWA manifest + icons configured
- ✅ **Native Wrapper Ready**: Capacitor-compatible (optional)

---

## 🏗️ **Architecture Overview**

```
┌─────────────────────────────────────────────────────────┐
│                   DATA FLOW v3.0                        │
└─────────────────────────────────────────────────────────┘

1. SCRAPE (GitHub Actions - Parallel Matrix)
   ├─ v3-scrape-template.yml triggers (22:30 UTC)
   ├─ Generates matrix from registry (enabled modules)
   ├─ Runs providers (market-health-v3.mjs, etc.)
   ├─ Validates data (schema, plausibility, UI contract)
   ├─ Uploads artifacts (snapshot.json, module-state.json)
   └─ Auto-triggers Finalizer

2. FINALIZE (Atomic Publishing)
   ├─ Downloads ALL artifacts
   ├─ Validates integrity (digest, counts, ranges)
   ├─ Builds manifest.json (control plane)
   ├─ Checks KV budget (dedupe, <1000/day)
   ├─ Writes to .tmp (atomic staging)
   ├─ Validates .tmp files
   ├─ Atomic promote (.tmp → public)
   ├─ Generates provider-state.json
   ├─ Logs audit event
   └─ Commits to Git (retry logic)

3. DEPLOY (Cloudflare Pages)
   ├─ Git push triggers deployment (~2 min)
   ├─ Cloudflare Pages builds
   ├─ Functions deployed (/api/*, /internal/*)
   ├─ Service Worker registered
   └─ Site live

4. SERVE (Zero-Downtime)
   ├─ Visitor → /api/market-health
   ├─ Function checks KV (preferred)
   ├─ Falls back to ASSET (snapshot)
   ├─ Transforms v3.0 → Legacy (if needed)
   ├─ Returns JSON (with meta, validation)
   └─ Frontend renders

5. DEBUG (Root Cause <2 min)
   ├─ Visit /internal/health (Mission Control)
   ├─ See Proof Chain (F S P U F D)
   ├─ Click Debug → ?debug=1 mode
   ├─ Click Probe → Delivery test
   ├─ Failure Hint → Suggested action
   └─ Fix identified!
```

---

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 20+
- Git
- Cloudflare Account (Free Tier)
- GitHub Account

### **Local Development**

```bash
# Clone repository
git clone https://github.com/RubikVault/rubikvault-site.git
cd rubikvault-site

# Install dependencies
npm install

# Run local dev server
npm run dev

# Open browser
open http://localhost:8788
```

### **Testing Workflows**

```bash
# Core contract and publish checks
npm run test:contracts
npm run test:finalizer

# Pipeline-focused suites
npm run test:v7
npm run test:runblock

# Test cleanup (dry run)
DRY_RUN=true ./scripts/cleanup-daily-snapshots.sh 7
```

### **OPS Testing**
- Preferred base: `OPS_BASE`
- Tier-1 (artifacts + UI smoke):
  - `OPS_BASE="https://<preview>.pages.dev" npm run test:ops`
- Tier-3 (Playwright E2E):
  - `OPS_BASE="https://<preview>.pages.dev" npm run test:ops-ui`
  - If browsers are missing: `npx playwright install`

### **High-Signal Local Checks**

```bash
npm run test:contracts
npm run test:ops
npm run test:v7
npm run test:runblock
```

---

## 📊 **Mission Control Dashboard**

Access: `https://rubikvault-site.pages.dev/internal/health`

### **Features**
- **System Status**: Overall health, last publish time, critical OK
- **Module Table**: Sortable, filterable by tier/status/domain
- **Proof Chain**: 6 checks per module (F S P U F D)
- **Failure Hints**: Click for remediation steps
- **Debug Links**: Direct access to ?debug=1, snapshots, probes
- **Audit Log**: View recent PUBLISH/BLOCK/STATE_CHANGE events

### **Proof Chain Explained**

```
F S P U F D  ← 6 Checks

✅ F = FILE: latest.json exists and parseable
✅ S = SCHEMA: Envelope schema_version=3.0 valid
✅ P = PLAUS: Values within plausible ranges
✅ U = UI: Required UI contract paths present
✅ F = FRESH: Data age within policy (market_days_only)
✅ D = DELIVERY: On-demand probe test (manual)
```

---

## 📁 **Project Structure**

```
rubikvault-site/
├── .github/workflows/        # GitHub Actions (Scrape, Finalize, CI, Cleanup)
├── functions/                # Cloudflare Pages Functions (API endpoints)
│   ├── api/                  # Module endpoints (/api/market-health)
│   └── _shared/              # Middleware (static-only-v3.js)
├── public/                   # Static assets (deployed)
│   ├── data/                 # Data directory
│   │   ├── manifest.json     # Control plane (Lock-Point)
│   │   ├── provider-state.json  # UI view
│   │   ├── registry/         # Module configuration
│   │   ├── snapshots/        # Module snapshots
│   │   │   └── <module>/
│   │   │       ├── latest.json  # Current snapshot
│   │   │       └── daily/    # Rolling window (7 days)
│   │   └── state/            # Module states + audit log
│   │       ├── modules/      # Per-module state files
│   │       └── audit/        # Audit log (latest.json)
│   ├── internal/health/      # Mission Control UI
│   └── index.html            # Main website
├── scripts/                  # Build & utility scripts
│   ├── providers/            # Data providers (fetch + validate)
│   ├── aggregator/           # Finalizer (atomic publish)
│   ├── lib/                  # Shared libraries
│   │   ├── digest.js         # Canonical JSON SHA256
│   │   ├── envelope.js       # v3.0 Envelope builder
│   │   ├── build-id.js       # Build ID generator
│   │   ├── audit-log.js      # Audit event logging
│   │   ├── kv-dedupe.js      # KV write deduplication
│   │   └── atomic-publish.js # Atomic tmp → promote
│   └── cleanup-daily-snapshots.sh  # Rolling window cleanup
└── package.json              # Dependencies & scripts
```

---

## 🔧 **Configuration**

### **Module Registry**

`public/data/registry/modules.json`

```json
{
  "market-health": {
    "tier": "critical",
    "domain": "stocks",
    "enabled": true,
    "source": "stooq+coingecko+alternative.me",
    "freshness": {
      "expected_interval_minutes": 1440,
      "grace_minutes": 180,
      "policy": "market_days_only"
    },
    "counts": {
      "expected": 1,
      "min": 1,
      "max": 1
    },
    "plausibility_rules": [
      { "path": "$.data[0].items[*].close", "min": 0.01, "max": 100000 }
    ],
    "ui_contract": {
      "policy": "always",
      "required_paths": [
        "$.data[0].items[0].symbol",
        "$.data[0].items[0].close",
        "$.data[0].fng.value",
        "$.metadata.fetched_at"
      ]
    },
    "cache": {
      "kv_enabled": false,
      "preferred_source": "ASSET"
    },
    "mobile": {
      "optimized": true,
      "ui_variant": "compact",
      "lazy_load_priority": 1
    }
  }
}
```

### **Adding New Modules**

1. **Create Provider**: `scripts/providers/<module>-v3.mjs`
2. **Add to Registry**: update the module registry used by your deployment flow
3. **Run Validation**: `npm run test:contracts`
4. **Commit**: Scrape Template auto-includes enabled modules!

---

## 🧪 **Testing**

### **Core Test Suites**
```bash
npm run test:contracts
npm run test:v7
npm run test:runblock
```

### **Integration Tests**
```bash
# Test finalizer
npm run test:finalizer

# Test ops/dashboard flows
npm run test:ops
```

### **Browser Testing**
```bash
# Start local dev
npm run dev

# Test pages
open http://localhost:8788
open http://localhost:8788/internal/health
open http://localhost:8788/api/market-health?debug=1
```

---

## 📱 **Mobile PWA**

### **Install on iOS**
1. Open Safari → `rubikvault-site.pages.dev`
2. Tap **Share** → **Add to Home Screen**
3. Launch from home screen!

### **Install on Android**
1. Open Chrome → `rubikvault-site.pages.dev`
2. Tap **Menu** → **Install App**
3. Launch from home screen!

### **Native App (Optional)**

For native iOS/Android builds:

```bash
# Install Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android

# Initialize
npx cap init RubikVault com.rubikvault.app

# Add platforms
npx cap add ios
npx cap add android

# Build web assets
npm run build

# Sync to native
npx cap sync

# Open in Xcode/Android Studio
npx cap open ios
npx cap open android
```

---

## 🔐 **Security**

- **No Secrets in Code**: All API keys in GitHub Secrets
- **Read-Only Functions**: API endpoints never write KV
- **CI Policy Checks**: Forbidden patterns blocked
- **Cloudflare Zero Trust**: Mission Control access control (optional)
- **Budget Protection**: CI Gates prevent resource exhaustion

---

## 📈 **Monitoring**

### **Mission Control**
- **URL**: `/internal/health`
- **Refresh**: Manual (`🔄 Refresh` button)
- **Filters**: Tier, Status, Domain, Search

### **GitHub Actions**
- **Workflows**: Check Actions tab
- **Artifacts**: Download from workflow runs
- **Summaries**: Per-job summaries with stats

### **Cloudflare Analytics**
- **Requests**: Cloudflare Dashboard → Analytics
- **Bandwidth**: Pages → Analytics
- **Errors**: Functions → Logs

---

## 🤝 **Contributing**

This is a private project. For feature requests or bug reports, please contact the maintainer.

---

## 📄 **License**

Proprietary. All rights reserved.

---

## 🙏 **Credits**

Built with:
- [Cloudflare Pages](https://pages.cloudflare.com/)
- [GitHub Actions](https://github.com/features/actions)
- [Node.js](https://nodejs.org/)
- Modern Web Standards (PWA, Service Workers, Web App Manifest)

---

## 📞 **Support**

- **Mission Control**: `/internal/health` for system diagnostics
- **Debug Mode**: Add `?debug=1` to any `/api/*` endpoint
- **Documentation**: See `docs/` directory
- **Architecture**: See `COMPLIANCE_AUDIT.md`

---

**Last Updated**: 2026-01-19  
**Version**: Mission Control v3.0  
**Compliance**: 100/100 ✅
