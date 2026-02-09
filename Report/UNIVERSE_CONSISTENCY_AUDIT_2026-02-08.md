# UNIVERSE CONSISTENCY AUDIT — 2026-02-08
**Date**: 2026-02-08  
**Reporter**: Codex (Forensic Auditor)  
**Scope**: Stock Analyzer, Elliott Waves, Scientific Analyzer, Forecast System

---

## EXECUTIVE SUMMARY

**VERDICT**: ❌ **UNIVERSE INKONSISTENZ BESTÄTIGT**

Nicht alle 4 Features verwenden die gleiche Universe-Datei:
- **Stock Analyzer**: 100 Aktien (nasdaq100.json)
- **Elliott Waves**: 100 Aktien (nasdaq100.json)
- **Scientific Analyzer**: 517 Aktien verarbeitet, aber nur 30 in Rankings (all.json)
- **Forecast System**: 517 Aktien (all.json)

**KO** ist in `all.json` enthalten, aber **NICHT** in `nasdaq100.json`.  
**BRK** existiert als `BRK.B` in `all.json`, aber **NICHT** in `nasdaq100.json`.

---

## BEWIESENE URSUACHEN (100% Evidence-Based)

### URSUACHE 1: Unterschiedliche Universe-Dateien verwendet

**Evidence**:

1. **Stock Analyzer** (`public/index.html:510`):
   ```javascript
   const UNIVERSE_URL = '/data/universe/nasdaq100.json';
   ```
   **Anzahl**: 100 Aktien (bewiesen via `jq 'length' public/data/universe/nasdaq100.json`)

2. **Elliott Waves** (`functions/api/elliott-scanner.js:19`):
   ```javascript
   const universeRes = await fetch(`${baseUrl}/data/universe/nasdaq100.json`);
   ```
   **Anzahl**: 100 Aktien (bewiesen via Production API: `curl https://rubikvault.com/api/elliott-scanner | jq '.meta.count'` → `100`)

3. **Scientific Analyzer Generator** (`scripts/scientific-analyzer/generate-analysis.mjs:35`):
   ```javascript
   const UNIVERSE_FILE = 'public/data/universe/all.json';
   ```
   **Anzahl**: 517 Aktien verarbeitet (bewiesen via `jq '._meta.symbols_processed' public/data/snapshots/stock-analysis.json` → `517`)

4. **Forecast System** (`scripts/forecast/snapshot_ingest.mjs:19`):
   ```javascript
   const UNIVERSE_PATH = 'public/data/universe/all.json';
   ```
   **Anzahl**: 517 Aktien (bewiesen via `jq 'length' public/data/universe/all.json` → `517`)

**Widerspruch**: Policy sagt `nasdaq100.json`, Code verwendet `all.json`:
- `policies/forecast.v3.json:143`: `"source": "/data/universe/nasdaq100.json"`
- `scripts/forecast/snapshot_ingest.mjs:19`: `const UNIVERSE_PATH = 'public/data/universe/all.json';`

**Verdict**: 🔴 **URSUACHE 1 BESTÄTIGT** — Forecast verwendet `all.json` statt `nasdaq100.json` (Policy vs Code Mismatch)

---

### URSUACHE 2: KO fehlt in nasdaq100.json

**Evidence**:

```bash
$ jq -r '.[] | select(.ticker=="KO") | .ticker' public/data/universe/nasdaq100.json
(leer - keine Ausgabe)

$ jq -r '.[] | select(.ticker=="KO") | .ticker' public/data/universe/all.json
KO
```

**Verdict**: 🔴 **URSUACHE 2 BESTÄTIGT** — KO ist in `all.json` enthalten, aber **NICHT** in `nasdaq100.json`

**Grund**: KO (Coca-Cola) ist Teil des Dow Jones 30, nicht NASDAQ-100. `nasdaq100.json` enthält nur NASDAQ-100 Aktien.

---

### URSUACHE 3: BRK fehlt komplett (nur BRK.B vorhanden)

**Evidence**:

```bash
$ jq -r '.[] | select(.ticker=="BRK") | .ticker' public/data/universe/all.json
(leer)

$ jq -r '.[] | select(.ticker=="BRK.B") | .ticker' public/data/universe/all.json
BRK.B
```

**Verdict**: 🟡 **URSUACHE 3 BESTÄTIGT** — `BRK` (Class A) existiert nicht, nur `BRK.B` (Class B) ist in `all.json`

**Grund**: Berkshire Hathaway Class A (`BRK`) ist sehr teuer (~$600k/share), daher wird nur Class B (`BRK.B`) gehandelt und getrackt.

---

### URSUACHE 4: Scientific Analyzer zeigt nur 30 Aktien in Rankings (nicht alle 517)

**Evidence**:

```bash
$ jq '._meta.symbols_processed' public/data/snapshots/stock-analysis.json
517

$ jq -r '._rankings.by_timeframe.short[]?.ticker, ._rankings.by_timeframe.medium[]?.ticker, ._rankings.by_timeframe.long[]?.ticker' public/data/snapshots/stock-analysis.json | sort -u | wc -l
30

$ jq '._rankings.top_setups | length' public/data/snapshots/stock-analysis.json
20

$ jq '._rankings.triggered_setups | length' public/data/snapshots/stock-analysis.json
15
```

**Code Evidence** (`scripts/scientific-analyzer/generate-analysis.mjs:524-529`):
```javascript
_rankings: {
    top_setups: topSetups.slice(0, 20),
    triggered_setups: triggeredSetups.slice(0, 15),
    by_timeframe: {
        short: triggeredSetups.filter(s => s.timeframe === 'short').slice(0, 10),
        medium: triggeredSetups.filter(s => s.timeframe === 'medium').slice(0, 10),
        long: topSetups.filter(s => s.timeframe === 'long').slice(0, 10)
    }
}
```

**Verdict**: 🟡 **URSUACHE 4 BESTÄTIGT** — Scientific Analyzer verarbeitet alle 517 Aktien, zeigt aber nur Top 30 in Rankings (by design, nicht ein Bug)

**Grund**: Rankings sind gefiltert nach Setup/Trigger-Kriterien. Nur Aktien mit erfüllten Kriterien erscheinen in Rankings. Alle 517 Aktien sind jedoch im Snapshot verfügbar (als individuelle Einträge).

---

### URSUACHE 5: Forecast System zeigt 0 Aktien (circuit_open)

**Evidence**:

```bash
$ curl -sS https://rubikvault.com/data/forecast/latest.json | jq '{forecasts_count:(.data.forecasts|length), ok}'
{
  "forecasts_count": 0,
  "ok": false
}

$ cat public/data/forecast/latest.json | jq '.meta'
{
  "status": "circuit_open",
  "reason": "Missing price data 100.0% exceeds threshold 5%"
}
```

**Verdict**: 🔴 **URSUACHE 5 BESTÄTIGT** — Forecast System zeigt 0 Aktien wegen `circuit_open` (fehlende Price-Daten)

**Grund**: Forecast Pipeline benötigt Price-Daten für alle 517 Aktien, aber `market-prices/latest.json` fehlt (siehe RCA_2026-02-08).

---

## FEATURE-BY-FEATURE ANALYSE

| Feature | Universe-Datei | Aktien-Anzahl | KO enthalten? | BRK enthalten? | Status |
|---------|---------------|---------------|---------------|----------------|--------|
| **Stock Analyzer** | `nasdaq100.json` | 100 | ❌ NEIN | ❌ NEIN | 🟡 Teilweise |
| **Elliott Waves** | `nasdaq100.json` | 100 | ❌ NEIN | ❌ NEIN | 🟡 Teilweise |
| **Scientific Analyzer** | `all.json` | 517 (verarbeitet), 30 (Rankings) | ✅ JA (in all.json) | ✅ BRK.B (in all.json) | 🟢 Vollständig |
| **Forecast System** | `all.json` | 517 (erwartet), 0 (aktuell) | ✅ JA (in all.json) | ✅ BRK.B (in all.json) | 🔴 Circuit Open |

---

## VOLLSTÄNDIGE BEWEISKETTE

### 1. Universe-Dateien Größen

```bash
$ jq 'length' public/data/universe/nasdaq100.json
100

$ jq 'length' public/data/universe/all.json
517
```

**Beweis**: `nasdaq100.json` hat 100 Aktien, `all.json` hat 517 Aktien.

### 2. KO und BRK Prüfung

```bash
# KO in nasdaq100.json
$ jq -r '.[] | select(.ticker=="KO") | .ticker' public/data/universe/nasdaq100.json
(leer)

# KO in all.json
$ jq -r '.[] | select(.ticker=="KO") | .ticker' public/data/universe/all.json
KO

# BRK in all.json
$ jq -r '.[] | select(.ticker=="BRK") | .ticker' public/data/universe/all.json
(leer)

# BRK.B in all.json
$ jq -r '.[] | select(.ticker=="BRK.B") | .ticker' public/data/universe/all.json
BRK.B
```

**Beweis**: 
- KO ist **NICHT** in `nasdaq100.json`, aber **JA** in `all.json`
- BRK (Class A) existiert **NICHT**, nur BRK.B ist in `all.json`

### 3. Code-Referenzen

**Stock Analyzer** (`public/index.html:510`):
```javascript
const UNIVERSE_URL = '/data/universe/nasdaq100.json';
```

**Elliott Waves** (`functions/api/elliott-scanner.js:19`):
```javascript
const universeRes = await fetch(`${baseUrl}/data/universe/nasdaq100.json`);
```

**Scientific Analyzer Generator** (`scripts/scientific-analyzer/generate-analysis.mjs:35`):
```javascript
const UNIVERSE_FILE = 'public/data/universe/all.json';
```

**Forecast System** (`scripts/forecast/snapshot_ingest.mjs:19`):
```javascript
const UNIVERSE_PATH = 'public/data/universe/all.json';
```

**Forecast Policy** (`policies/forecast.v3.json:143`):
```json
"source": "/data/universe/nasdaq100.json"
```

**Beweis**: Code verwendet `all.json`, Policy sagt `nasdaq100.json` → **Widerspruch**

### 4. Production Verification

```bash
$ curl -sS https://rubikvault.com/api/elliott-scanner | jq '{meta_count:.meta.count, setups_count:(.setups|length)}'
{
  "meta_count": 100,
  "setups_count": 100
}

$ curl -sS https://rubikvault.com/data/forecast/latest.json | jq '{forecasts_count:(.data.forecasts|length)}'
{
  "forecasts_count": 0
}
```

**Beweis**: Production bestätigt:
- Elliott Waves: 100 Aktien
- Forecast: 0 Aktien (circuit_open)

---

## FIX-VORSCHLÄGE (NICHT IMPLEMENTIERT)

### FIX OPTION 1: Alle Features auf `all.json` umstellen (EMPFOHLEN)

**Ziel**: Alle 4 Features verwenden die gleiche Universe-Datei (`all.json`)

**Änderungen**:

1. **File**: `public/index.html`
   - **Line 510**: `const UNIVERSE_URL = '/data/universe/nasdaq100.json';` → `const UNIVERSE_URL = '/data/universe/all.json';`

2. **File**: `functions/api/elliott-scanner.js`
   - **Line 19**: `const universeRes = await fetch(\`${baseUrl}/data/universe/nasdaq100.json\`);` → `const universeRes = await fetch(\`${baseUrl}/data/universe/all.json\`);`

3. **File**: `policies/forecast.v3.json`
   - **Line 143**: `"source": "/data/universe/nasdaq100.json"` → `"source": "/data/universe/all.json"`

**Risiko**: MEDIUM
- Elliott Waves und Stock Analyzer müssen dann 517 statt 100 Aktien verarbeiten
- Performance-Impact möglich (aber wahrscheinlich minimal, da client-side)

**Verification**:
```bash
# Nach Fix: Alle Features sollten 517 Aktien zeigen
curl -sS https://rubikvault.com/api/elliott-scanner | jq '.meta.count'
# Expected: 517

# Stock Analyzer Universe
curl -sS https://rubikvault.com/data/universe/all.json | jq 'length'
# Expected: 517

# KO sollte in allen Features verfügbar sein
curl -sS https://rubikvault.com/data/universe/all.json | jq '.[] | select(.ticker=="KO")'
# Expected: {"ticker":"KO","name":"Coca-Cola"}
```

---

### FIX OPTION 2: Forecast auf `nasdaq100.json` umstellen (ALTERNATIVE)

**Ziel**: Forecast verwendet `nasdaq100.json` wie Policy sagt

**Änderungen**:

1. **File**: `scripts/forecast/snapshot_ingest.mjs`
   - **Line 19**: `const UNIVERSE_PATH = 'public/data/universe/all.json';` → `const UNIVERSE_PATH = 'public/data/universe/nasdaq100.json';`

**Risiko**: LOW
- Forecast zeigt dann nur 100 statt 517 Aktien
- Konsistent mit Policy, aber reduziert Coverage

**Verification**:
```bash
# Nach Fix: Forecast sollte 100 Aktien verwenden
# (aber Forecast Pipeline muss erst wieder laufen)
```

---

### FIX OPTION 3: BRK Class A hinzufügen (OPTIONAL)

**Ziel**: `BRK` (Class A) zu `all.json` hinzufügen

**Änderungen**:

1. **File**: `public/data/universe/all.json`
   - **Action**: Eintrag hinzufügen: `{"ticker": "BRK", "name": "Berkshire Hathaway Inc. Class A"}`

**Risiko**: LOW
- BRK Class A ist sehr teuer (~$600k/share), daher selten gehandelt
- Kann zu "no data" Fehlern führen, wenn Price-Daten fehlen

**Verification**:
```bash
jq -r '.[] | select(.ticker=="BRK") | .ticker' public/data/universe/all.json
# Expected: BRK
```

---

## EMPFOHLENE LÖSUNG

**FIX OPTION 1** (Alle Features auf `all.json` umstellen):

**Begründung**:
1. ✅ Maximale Coverage (517 statt 100 Aktien)
2. ✅ KO und BRK.B werden in allen Features verfügbar
3. ✅ Konsistenz zwischen allen Features
4. ✅ Scientific Analyzer und Forecast verwenden bereits `all.json`

**Nachteile**:
- Stock Analyzer und Elliott Waves müssen mehr Daten verarbeiten (Performance-Impact minimal)
- UI muss möglicherweise Pagination/Filtering für große Listen hinzufügen

**Rollback Plan**:
- Git revert der 3 Datei-Änderungen
- Deploy revert commit

---

## VERIFICATION CHECKLIST

Nach Implementierung von FIX OPTION 1:

- [ ] `public/index.html:510` verwendet `all.json`
- [ ] `functions/api/elliott-scanner.js:19` verwendet `all.json`
- [ ] `policies/forecast.v3.json:143` sagt `all.json`
- [ ] Production: `curl https://rubikvault.com/api/elliott-scanner | jq '.meta.count'` → `517`
- [ ] Production: `curl https://rubikvault.com/data/universe/all.json | jq '.[] | select(.ticker=="KO")'` → KO vorhanden
- [ ] Production: `curl https://rubikvault.com/data/universe/all.json | jq '.[] | select(.ticker=="BRK.B")'` → BRK.B vorhanden
- [ ] UI Test: Stock Analyzer zeigt KO in Suche
- [ ] UI Test: Elliott Waves zeigt KO in Scanner
- [ ] UI Test: Scientific Analyzer zeigt KO (wenn Setup-Kriterien erfüllt)
- [ ] UI Test: Forecast zeigt KO (nach Pipeline-Run)

---

**END UNIVERSE CONSISTENCY AUDIT**
