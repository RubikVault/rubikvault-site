# Block-Analyse: Leere Blöcke & Empfehlungen

## Status: 80% der Blöcke sind leer

### Kategorisierung

#### ✅ **BEHALTEN** (haben Daten, funktionieren)
1. **Market Cockpit** (`rv-market-cockpit`) - ✅ OK (aber erweitern: S&P 500, Nasdaq, Dow, Russell 2000, Gold, Oil)
2. **Tech Signals** (`rv-tech-signals`) - ✅ OK
3. **Alpha Radar** (`rv-alpha-radar`) - ✅ OK
4. **S&P 500 Sectors** (`rv-sp500-sectors`) - ✅ OK (Layout gefixt)
5. **RVCI Engine** (`rvci-engine`) - ✅ OK (Layout gefixt)
6. **Sector Rotation** (`rv-sector-rotation`) - ✅ OK
7. **Yield Curve** (`rv-yield-curve`) - ✅ OK

#### ⚠️ **FIXEN** (haben Potenzial, aber aktuell leer/kaputt)
1. **Market Health** (`rv-market-health`) - ⚠️ PARTIAL/NO_DATA
   - **Problem**: Daten kommen nicht an
   - **Empfehlung**: API-Endpoint prüfen, Fallback-Daten aus Mirror
   - **Action**: Fixen oder raus

2. **News Headlines** (`rv-news-headlines`) - ⚠️ PARTIAL/NO_DATA
   - **Problem**: RSS-Feeds funktionieren nicht oder sind leer
   - **Empfehlung**: Feed-URLs prüfen, Fallback
   - **Action**: Fixen oder raus

3. **Earnings Calendar** (`rv-earnings-calendar`) - ⚠️ PARTIAL/EMPTY
   - **Problem**: Keine Earnings-Daten
   - **Empfehlung**: API prüfen, Free-Tier-Limits
   - **Action**: Fixen oder raus

4. **Volume Top Movers** (`rv-top-movers`) - ⚠️ PARTIAL/NO_DATA
   - **Problem**: Keine Daten
   - **Empfehlung**: API prüfen
   - **Action**: Fixen oder raus

5. **Crypto Snapshot** (`rv-crypto-snapshot`) - ⚠️ PARTIAL/EMPTY
   - **Problem**: CoinGecko API-Limits?
   - **Empfehlung**: Caching verbessern, Fallback
   - **Action**: Fixen (wichtig für Cockpit)

#### ❌ **RAUS** (by design leer/fragil/secret-heavy)
1. **Price Snapshot** (`rv-price-snapshot`) - ❌ DEPRECATED
   - **Status**: Bereits `enabled: false`
   - **Action**: ✅ Bereits versteckt

2. **Macro & Rates** (`rv-macro-rates`) - ❌ DEPRECATED
   - **Status**: Bereits `enabled: false`
   - **Action**: ✅ Bereits versteckt

3. **Congress Trading** (`rv-congress-trading`) - ❌ EMPTY
   - **Problem**: Free Tier hat keine Daten
   - **Empfehlung**: Raus aus Public v1
   - **Action**: `enabled: false` + aus HTML entfernen

4. **Insider Cluster** (`rv-insider-cluster`) - ❌ EMPTY
   - **Problem**: Free Tier hat keine Daten
   - **Empfehlung**: Raus aus Public v1
   - **Action**: ✅ Bereits `enabled: false`

5. **Analyst Stampede** (`rv-analyst-stampede`) - ❌ EMPTY
   - **Problem**: Free Tier hat keine Daten
   - **Empfehlung**: Raus aus Public v1
   - **Action**: ✅ Bereits `enabled: false`

6. **News Intelligence** (`rv-news-intelligence`) - ❌ EMPTY/NO_DATA
   - **Problem**: Keine Daten
   - **Empfehlung**: Raus aus Public v1
   - **Action**: `enabled: false` + aus HTML entfernen

7. **Watchlist Local** (`rv-watchlist-local`) - ⚠️ FEATURE
   - **Status**: Feature für v1 geplant
   - **Empfehlung**: Behalten, aber nur wenn funktional
   - **Action**: Prüfen ob funktioniert

8. **Export CSV** (`rv-export-csv`) - ⚠️ FEATURE
   - **Status**: Feature
   - **Empfehlung**: Behalten wenn funktional
   - **Action**: Prüfen ob funktioniert

9. **Sentiment Barometer** (`rv-sentiment-barometer`) - ⚠️ UNKNOWN
   - **Status**: Unbekannt
   - **Empfehlung**: Prüfen ob Daten vorhanden
   - **Action**: Testen

10. **Market Regime** (`rv-market-regime`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

11. **ARB Risk Regime** (`rv-arb-risk-regime`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

12. **ARB Liquidity Pulse** (`rv-arb-liquidity-pulse`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

13. **ARB Breadth Lite** (`rv-arb-breadth-lite`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

14. **Why This Stock Moved** (`rv-why-moved`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

15. **Volume Anomaly** (`rv-volume-anomaly`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

16. **Breakout Energy** (`rv-breakout-energy`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

17. **Hype Divergence** (`rv-hype-divergence`) - ⚠️ UNKNOWN
    - **Status**: Unbekannt
    - **Empfehlung**: Prüfen ob Daten vorhanden
    - **Action**: Testen

18. **Central Bank Watch** (`rv-central-bank-watch`) - ⚠️ DISABLED
    - **Status**: Disabled
    - **Empfehlung**: Prüfen warum disabled
    - **Action**: Testen oder raus

## Empfehlung: Public v1 - Nur diese Blöcke behalten

### Pflicht-Blöcke (haben Daten):
1. ✅ Market Cockpit (erweitern!)
2. ✅ Tech Signals
3. ✅ Alpha Radar
4. ✅ S&P 500 Sectors
5. ✅ RVCI Engine

### Optional (wenn funktional):
6. ⚠️ Sector Rotation (wenn Daten vorhanden)
7. ⚠️ Yield Curve (wenn Daten vorhanden)
8. ⚠️ News Headlines (wenn Feed funktioniert)
9. ⚠️ Earnings Calendar (wenn API funktioniert)

### Alle anderen: RAUS aus Public v1

## Action Items

1. **Sofort**: Alle Blöcke mit `PARTIAL/NO_DATA/EMPTY` prüfen
2. **Sofort**: `rv-news-intelligence` deaktivieren
3. **Sofort**: Alle "Block XX" Namen bereinigen
4. **Sofort**: Block 53 CSS-Fix verstärken
5. **Sofort**: Navigation-Anchors fixen (#cockpit, #macro, etc.)
6. **Sofort**: Debug-Buttons nur bei ?debug=1
7. **Sofort**: Status-Strip komplett aus Public entfernen
8. **Später**: Cockpit erweitern (S&P 500, Nasdaq, Dow, Russell 2000, Gold, Oil)
9. **Später**: "Monopoles/Moats" Block erstellen
