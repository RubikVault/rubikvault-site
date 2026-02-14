# 01_UI_PROOF

## R1 — Performance Notes header appears exactly once
### CMD
`rg -n "📊 Performance Notes \(RubikVault v2\.0\)" public/index.html`

### OUTPUT
```text
1634:          <h3 style="font-size: 1.05rem; color: #f8fafc; margin: 0 0 0.55rem;">📊 Performance Notes (RubikVault v2.0)</h3>
```

### CMD
`rg -n "📊 Performance Notes \(RubikVault v2\.0\)" public/index.html | wc -l`

### OUTPUT
```text
       1
```

### RESULT
- PASS

---

## R2 — Legacy label removed (0 hits)
### CMD
`rg -n "Ø Return 10y:" public/index.html`

### OUTPUT
```text

```

### CMD
`rg -n "Ø Return 10y:" public/index.html | wc -l`

### OUTPUT
```text
       0
```

### RESULT
- PASS

---

## R3 — Standardized return label exists
### CMD
`rg -n "10y Total Return CAGR \(RubikVault\): —" public/index.html`

### OUTPUT
```text
1670:                10y Total Return CAGR (RubikVault): —
```

### RESULT
- PASS

---

## R4 — Cloud header updated
### CMD
`rg -n "Hyperscaler Oligopoly|Hyperscaler Triopol" public/index.html`

### OUTPUT
```text
1245:          category: "☁️ Cloud Infrastructure (Hyperscaler Oligopoly)",
```

### RESULT
- PASS (`Oligopoly` present, `Triopol` absent)

---

## R5 — Creative header updated
### CMD
`rg -n "🎨 Creative & Document Workflow Moat|🔐 Workflow & Identity Pipes" public/index.html`

### OUTPUT
```text
1466:          category: "🎨 Creative & Document Workflow Moat",
```

### RESULT
- PASS (new present, old absent)

---

## R6 — LVMH neutral/neutral + updated text
### CMD
`rg -n -F '{ ticker: "MC.PA"' public/index.html`

### OUTPUT
```text
1445:            { ticker: "MC.PA", name: "LVMH", ai: "neutral", robots: "neutral", text: "AI improves CRM, demand forecasting and personalization; it cannot replicate scarcity, heritage, or status, so the core moat remains intact." },
```

### CMD
`rg -n 'MC\.PA.*ai: "neutral", robots: "neutral"' public/index.html`

### OUTPUT
```text
1445:            { ticker: "MC.PA", name: "LVMH", ai: "neutral", robots: "neutral", text: "AI improves CRM, demand forecasting and personalization; it cannot replicate scarcity, heritage, or status, so the core moat remains intact." },
```

### CMD
`rg -n "cannot replicate scarcity, heritage, or status" public/index.html`

### OUTPUT
```text
1445:            { ticker: "MC.PA", name: "LVMH", ai: "neutral", robots: "neutral", text: "AI improves CRM, demand forecasting and personalization; it cannot replicate scarcity, heritage, or status, so the core moat remains intact." },
```

### RESULT
- PASS

---

## R7 — AI Einschätzung coverage FLOOR-CHECK (semantic)
### R7A (authoritative pass/fail)
#### CMD
```bash
python3 - <<'PY'
import re, pathlib
p=pathlib.Path('public/index.html')
text=p.read_text(encoding='utf-8', errors='ignore')
start=text.index('const marketAnalysisData = [')
end=text.index('      ];', start)
block=text[start:end]
items=re.findall(r'\{ ticker: "([^"]+)", name: "([^"]+)"', block)
ms=text.index('const aiAssessmentByKey = {')
me=text.index('      };', ms)
kb=text[ms:me]
keys=set(re.findall(r'"([^"]+\|[^"]+)":', kb))
missing=[(t,n) for t,n in items if f"{t}|{n}" not in keys]
print('tickers_in_marketAnalysisData=',len(items))
print('keys_in_aiAssessmentByKey=',len(keys))
print('unique_tickers=',len(set([t for t,_ in items])))
print('missing_key_entries=',len(missing))
if missing: print('missing_examples=',missing[:5])
PY
```

#### OUTPUT
```text
tickers_in_marketAnalysisData= 79
keys_in_aiAssessmentByKey= 79
unique_tickers= 77
missing_key_entries= 0
```

#### RESULT
- PASS (`missing_key_entries == 0` and `keys >= items`)

### R7B (informational only)
#### CMD
`rg -n "AI Einschätzung:" public/index.html | wc -l`

#### OUTPUT
```text
       1
```

#### NOTE
- Informational label check only.

---

## R8 — Tracked scope remains UI-only
### CMD
`git status -sb`

### OUTPUT
```text
## main...origin/main
M  public/index.html
?? docs/STATUS_QUO/
```

### RESULT
- PASS

---

## R9 — /analyze link sanity exists
### CMD
`rg -n 'href="/analyze/' public/index.html`

### OUTPUT
```text
1666:                <a href="/analyze/${encodeURIComponent(item.ticker)}" data-open-ticker="${escapeHtml(item.ticker)}" style="font-weight: 800; color: #60a5fa; text-decoration: none; font-size: 1.15rem;">${escapeHtml(item.ticker)}</a>
3180:            return `<a href="/analyze/${encodeURIComponent(peer)}" style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0.55rem; border-radius:8px; border:1px solid rgba(100,116,139,0.22); color:#cbd5e1; text-decoration:none;">
```

### RESULT
- PASS
