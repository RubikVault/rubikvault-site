# UI Golden Path (Audit)

## Path: /analyze/<T>

**Step 1 — UI triggers API call**
- File: `public/index.html` lines 1448–1468
- Action: `fetchJson('/api/stock?ticker=<T>')`

**Step 2 — API builds canonical payload**
- File: `functions/api/stock.js` lines 841–867
- Action: sets `data.latest_bar` and other fields

**Step 3 — UI renders bar fields**
- File: `public/index.html` lines 931–936
- Action: uses `data.latest_bar.close/volume/date`

### Mermaid (UI → API → Render)
```mermaid
graph TD
  A[/analyze/<T> (public/index.html)/] --> B[/api/stock?ticker=<T>/]
  B --> C[functions/api/stock.js sets data.latest_bar]
  C --> D[UI renders close/volume/date]
```

Evidence:
- `public/index.html:1448-1468`
- `functions/api/stock.js:841-867`
- `public/index.html:931-936`
