# RubikVault Logic Documentation

This document describes the implemented logic for the Elliott Waves Scanner and Scientific Stock Analyzer for external audit purposes.

---

## Table of Contents

1. [Elliott Waves DFMSIF v1.0](#elliott-waves-dfmsif-v10)
2. [Scientific Stock Analyzer v9.1](#scientific-stock-analyzer-v91)
3. [Buy Signal Aggregation](#buy-signal-aggregation)
4. [Data Sources](#data-sources)

---

## Elliott Waves DFMSIF v1.0

**DFMSIF** = Deterministic Fractal Market Structure Inference

### Overview

The Elliott Wave Scanner analyzes NASDAQ-100 stocks to identify potential wave positions in the Elliott Wave cycle. This is **rule-based historical structure detection**, not prediction.

### Data Sources

| Symbol | Data Source | Description |
|--------|-------------|-------------|
| AAPL, MSFT | Real marketphase data | Pre-computed from `/data/marketphase/{symbol}.json` |
| All others | Heuristic estimation | Derived from EOD (End of Day) bar data |

### Wave Position Classification

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ELLIOTT WAVE CYCLE                               │
│                                                                     │
│    Wave 1    Wave 2    Wave 3    Wave 4    Wave 5    ABC Correction│
│      ↑         ↓         ↑         ↓         ↑           ↓         │
│   Impulse  Retracement Impulse  Retracement Impulse    Correction  │
│    START                                      END                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Classification Logic

#### From Real Marketphase Data (`extractSetupFromMarketphase`)

```javascript
// Wave position determination from elliott pattern data
let wavePosition = 'unknown';
const possibleWave = developing.possibleWave || '';

if (possibleWave.includes('4') || possibleWave.includes('ABC')) {
    // Wave 4 or ABC correction → pre-wave-5 or in-correction
    wavePosition = completed.valid ? 'pre-wave-5' : 'in-correction';
} else if (completed.valid && fib.conformanceScore > 50) {
    // Valid completed pattern with good Fib conformance → wave-1-start
    wavePosition = 'wave-1-start';
} else {
    // Default: assumed to be in pre-wave-3 setup
    wavePosition = 'pre-wave-3';
}

// Rule override: If Rule 2 not met, classified as pre-wave-3
if (!completed.rules?.r2) {
    wavePosition = 'pre-wave-3';
}
```

#### From EOD Heuristics (`estimateWaveFromEOD`)

```javascript
// Position in day's high-low range
const positionInRange = range > 0 ? (close - low) / range : 0.5;

// Classification based on position in range
if (positionInRange > 0.8) {
    // Near top of day's range
    wavePosition = direction === 'bullish' ? 'in-correction' : 'pre-wave-3';
    confidence = 35;
} else if (positionInRange < 0.2) {
    // Near bottom of day's range
    wavePosition = direction === 'bearish' ? 'in-correction' : 'pre-wave-3';
    confidence = 35;
} else if (positionInRange > 0.5) {
    // Upper half of range
    wavePosition = 'pre-wave-5';
    confidence = 25;
} else {
    // Lower half of range
    wavePosition = 'wave-1-start';
    confidence = 20;
}
```

### Fibonacci Conformance Score

```
Key Fibonacci Retracement Levels:
- 0%      (start of move)
- 23.6%   (shallow retracement)
- 38.2%   (moderate retracement)
- 50%     (half retracement)
- 61.8%   (golden ratio retracement)
- 78.6%   (deep retracement)
- 100%    (full retracement)

Conformance Score = (1 - minDistance × 2) × 100
where minDistance = closest distance to any Fib level

Score 100% = Price exactly at Fib level
Score 0%   = Price at 50% between Fib levels
```

### Bullish Support for Buy Signals

A ticker receives "bullish support" from Elliott Waves when:

```javascript
function computeElliottSupport(payload) {
    const direction = elliott?.completedPattern?.direction 
                   || features?.SMATrend 
                   || null;
    const confidence = Number(
        elliott?.developingPattern?.confidence 
        ?? elliott?.completedPattern?.confidence0_100
    );
    
    if (!direction) return null;
    if (!Number.isFinite(confidence)) {
        return direction === 'bullish';
    }
    
    // Bullish support if direction is bullish AND confidence >= 55%
    return direction === 'bullish' && confidence >= 55;
}
```

---

## Scientific Stock Analyzer v9.1

### Overview

The Scientific Analyzer uses a **Setup/Trigger** methodology to identify potential buy candidates:
- **Setup**: Identifies stocks in accumulation phase (building base)
- **Trigger**: Confirms breakout from accumulation

### Setup Criteria (Accumulation Phase Indicators)

| Criterion | Condition | Weight | Description |
|-----------|-----------|--------|-------------|
| RSI Neutral | 40 ≤ RSI ≤ 65 | 20% | Not oversold or overbought |
| Above SMA200 | Price > SMA200 | 25% | Long-term uptrend confirmed |
| Golden Cross | SMA50 > SMA200 | 25% | Bullish moving average structure |
| Volatility Stable | ATR% < 2.8% | 15% | Low volatility consolidation |
| Consolidation | 0.7 < VolumeRatio < 1.1 | 15% | Volume contraction |

**Setup Fulfilled**: Weighted score ≥ 60%

```javascript
function evaluateSetup(indicators) {
    const conditions = {
        rsi_neutral: {
            met: ind.rsi >= 40 && ind.rsi <= 65,
            weight: 0.2
        },
        above_sma200: {
            met: ind.close > ind.sma200,
            weight: 0.25
        },
        golden_cross: {
            met: ind.sma50 > ind.sma200,
            weight: 0.25
        },
        volatility_stable: {
            met: ind.atrPct < 2.8,
            weight: 0.15
        },
        consolidation: {
            met: ind.volumeRatio < 1.1 && ind.volumeRatio > 0.7,
            weight: 0.15
        }
    };
    
    const metWeight = sum of weights where condition.met === true;
    const totalWeight = sum of all weights;
    const score = (metWeight / totalWeight) * 100;
    
    return { fulfilled: score >= 60, score };
}
```

### Trigger Criteria (Breakout Confirmation)

| Criterion | Condition | Weight | Description |
|-----------|-----------|--------|-------------|
| RSI Breakout | 55 < RSI < 75 | 25% | Momentum gaining strength |
| Price Above SMA20 | Price > SMA20 | 25% | Short-term breakout |
| Volume Spike | VolumeRatio > 1.2 | 25% | Volume confirmation |
| MACD Positive | MACD Histogram > 0.2 | 25% | Positive momentum |

**Trigger Fulfilled**: Weighted score ≥ 60% (only evaluated if Setup is fulfilled)

```javascript
function evaluateTrigger(indicators, setup) {
    // Trigger only relevant if Setup is fulfilled
    if (!setup.fulfilled) {
        return { fulfilled: false, pending: true };
    }
    
    const conditions = {
        rsi_breakout: {
            met: ind.rsi > 55 && ind.rsi < 75,
            weight: 0.25
        },
        price_above_sma20: {
            met: ind.close > ind.sma20,
            weight: 0.25
        },
        volume_spike: {
            met: ind.volumeRatio > 1.2,
            weight: 0.25
        },
        macd_positive: {
            met: ind.macdHist > 0.2,
            weight: 0.25
        }
    };
    
    const metWeight = sum of weights where condition.met === true;
    const score = (metWeight / totalWeight) * 100;
    
    return { fulfilled: score >= 60, score };
}
```

### Timeframe Classification

```javascript
function determineTimeframe(setup, trigger, indicators) {
    if (!setup.fulfilled) return null;  // No setup = no timeframe
    
    if (trigger.fulfilled && ind.volumeRatio > 1.3) {
        return 'short';   // 1-5 days - Immediate breakout, high volume
    }
    
    if (trigger.fulfilled) {
        return 'medium';  // 5-20 days - Confirmed breakout
    }
    
    if (setup.score >= 80) {
        return 'long';    // 20-60 days - Strong setup, awaiting trigger
    }
    
    return 'watch';       // On watchlist, setup not strong enough
}
```

### Signal Strength Classification

| Strength | Condition |
|----------|-----------|
| STRONG | Setup fulfilled AND Trigger fulfilled |
| MODERATE | Setup fulfilled, Trigger pending |
| WEAK | Setup not fulfilled |

### Probability Model

The probability is computed using a logistic regression model:

```javascript
// Compute logit from features and trained weights
let logit = bias;
for (const [feature, weight] of Object.entries(weights)) {
    logit += weight * features[feature];
}

// Boost for setup/trigger
if (setup.fulfilled) logit += 0.3;
if (trigger.fulfilled) logit += 0.4;

// Sigmoid to get probability
const rawProbability = 1 / (1 + Math.exp(-logit));

// Platt scaling calibration
const calibratedProbability = applyPlattScaling(rawProbability, calibration);
```

---

## Buy Signal Aggregation

### Best Buy Signals Criteria

A stock is counted as a "Best Buy Signal" for a timeframe when:

1. **Setup fulfilled** = true
2. **Trigger fulfilled** = true  
3. **Elliott bullish support** ≠ false (null or true)
4. **Timeframe matches** (short/medium/long)

```javascript
function countBestSignals(timeframe) {
    const triggeredSetups = scientificAnalysisData._rankings.triggered_setups;
    
    return triggeredSetups.filter(setup => {
        // Must match timeframe
        if (setup.timeframe !== timeframe) return false;
        
        // Check Elliott support (no veto)
        const elliottSupport = elliottSupportByTicker.get(setup.ticker);
        if (elliottSupport === false) return false;
        
        return true;
    }).length;
}
```

---

## Data Sources

### File Locations

| Data | Path | Description |
|------|------|-------------|
| Stock Analysis | `/data/snapshots/stock-analysis.json` | All 100 NASDAQ-100 analyses |
| Elliott Waves Index | `/data/marketphase/index.json` | Index of available marketphase files |
| Marketphase Data | `/data/marketphase/{SYMBOL}.json` | Per-symbol Elliott analysis |
| Universe | `/data/universe/nasdaq100.json` | List of all 100 symbols |
| EOD Data | `/data/eod/batches/eod.latest.000.json` | End-of-day price data |

### Model Weights

Located at: `/data/models/weights-v9.json`

Contains:
- Feature weights for logistic regression
- Bias term
- Platt scaling calibration parameters
- Feature means for normalization
- Model metrics (AUC, ECE)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v9.1 | 2026-01-30 | Added Setup/Trigger detection, improved timeframe classification |
| v1.0 | Initial | DFMSIF Elliott Wave heuristics |

---

## Disclaimer

> **Research Simulation**: This analysis is for educational and research purposes only. 
> The models are trained on historical data and do not constitute financial advice.
> Setup/Trigger signals are technical indicators only — not trading recommendations.
