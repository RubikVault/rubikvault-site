# Architecture

## Overview
- Cloudflare Pages serves static assets from `public/`.
- Pages Functions handle `/api/*` endpoints, using KV-first reads.
- Mirror Fallback JSON files live under `public/mirror/` and can serve when KV or upstream is unavailable.
- GitHub Actions generate or refresh mirror artifacts in the repo.
- Preview vs Prod drift is expected: preview often READONLY and may lack bindings.

## Data Flow (Mermaid)
```mermaid
flowchart LR
  A[GitHub Actions] --> B[public/mirror/*.json]
  B --> D[Pages Functions /api/*]
  C[KV (RV_KV)] --> D
  D --> E[UI Blocks (features/*)]
  F[public/* static assets] --> E
  D --> G[Health + Debug Endpoints]
```

## Code Map
- `public/`: static build output and mirror JSON.
- `functions/`: Pages Functions (`/api/*`) and shared helpers.
- `features/`: UI blocks and feature registry.
- `scripts/`: local/CI utilities and smoke/validation scripts.
- `.github/workflows/`: automation for mirrors and audits.
