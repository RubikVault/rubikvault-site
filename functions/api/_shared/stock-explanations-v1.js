// stock-explanations-v1.js — EXPLANATION / TEMPLATE LAYER
// Generates all user-facing text from decision + states. No free interpretation.
// Language: English (dashboard is English; disclaimer stays German).

const HEADLINES = Object.freeze({
  BUY: '{ticker} shows a constructive setup with aligned trend and momentum.',
  WAIT: '{ticker} lacks sufficient alignment for a high-conviction entry.',
  SELL: '{ticker} exhibits structural deterioration across key dimensions.',
  AVOID: '{ticker} carries elevated risk that outweighs potential reward.',
  INSUFFICIENT_DATA: '{ticker} has insufficient data for a meaningful assessment.',
});

const TREND_BULLETS = Object.freeze({
  STRONG_UP: 'Trend is firmly bullish with price above all major moving averages and positive slope.',
  UP: 'Trend is bullish with price above key moving averages.',
  RANGE: 'Price is trading sideways without a clear directional trend.',
  DOWN: 'Trend is bearish with price below key moving averages.',
  STRONG_DOWN: 'Trend is firmly bearish with sustained downward momentum.',
  UNKNOWN: 'Trend data is insufficient for classification.',
});

const MOMENTUM_BULLETS = Object.freeze({
  OVERBOUGHT: 'Momentum is overbought; risk of a short-term pullback is elevated.',
  BULLISH: 'Momentum is positive, supporting continued strength.',
  NEUTRAL: 'Momentum is neutral with no strong directional signal.',
  BEARISH: 'Momentum is negative, suggesting continued weakness.',
  OVERSOLD: 'Momentum is oversold; a technical bounce may be developing.',
  UNKNOWN: 'Momentum data is insufficient for classification.',
});

const VOLUME_BULLETS = Object.freeze({
  SURGE: 'Volume is surging well above average, confirming current price action.',
  ABOVE_AVG: 'Volume is above average, providing moderate confirmation.',
  NORMAL: 'Volume is at typical levels.',
  WEAK: 'Volume is below average, weakening confidence in the current move.',
  DRY: 'Volume has dried up significantly, signaling low participation.',
  UNKNOWN: 'Volume data is insufficient for classification.',
});

const VOLATILITY_BULLETS = Object.freeze({
  EXTREME: 'Volatility is at extreme levels; position sizing should be reduced.',
  HIGH: 'Volatility is elevated; wider stops may be required.',
  NORMAL: 'Volatility is within normal range.',
  LOW: 'Volatility is low, potentially favoring tighter risk management.',
  COMPRESSED: 'Volatility is compressed; a directional expansion may be imminent.',
  UNKNOWN: 'Volatility data is insufficient for classification.',
});

const LIQUIDITY_BULLETS = Object.freeze({
  HIGH: 'Liquidity is strong with tight spreads expected.',
  MODERATE: 'Liquidity is adequate for swing and longer-term positions.',
  LOW: 'Liquidity is low; execution risk and slippage may be significant.',
  UNKNOWN: 'Liquidity data is insufficient for classification.',
});

const RISK_NOTES = Object.freeze({
  EXTREME_VOLATILITY: 'Volatility is at extreme levels; reduce position size accordingly.',
  LOW_LIQUIDITY: 'Low liquidity may result in wider spreads and execution slippage.',
  DOWNTREND_WEAK_VOLUME: 'Downtrend on weak volume suggests continued risk of decline.',
  INSUFFICIENT_DATA: 'Insufficient data prevents a reliable assessment.',
});

export function buildExplanation(ticker, decision, states) {
  const headline = (HEADLINES[decision.verdict] || HEADLINES.WAIT)
    .replace('{ticker}', ticker || 'Ticker');

  const bullets = [
    TREND_BULLETS[states.trend] || TREND_BULLETS.UNKNOWN,
    MOMENTUM_BULLETS[states.momentum] || MOMENTUM_BULLETS.UNKNOWN,
    VOLUME_BULLETS[states.volume] || VOLUME_BULLETS.UNKNOWN,
    VOLATILITY_BULLETS[states.volatility] || VOLATILITY_BULLETS.UNKNOWN,
    LIQUIDITY_BULLETS[states.liquidity] || LIQUIDITY_BULLETS.UNKNOWN,
  ];

  const riskParts = (decision.trigger_gates || [])
    .map(g => RISK_NOTES[g])
    .filter(Boolean);
  const risk_note = riskParts.length > 0 ? riskParts.join(' ') : null;

  const sentiment = decision.strategic_bias === 'BULLISH' ? 'positive'
    : decision.strategic_bias === 'BEARISH' ? 'negative'
    : 'neutral';

  const synthesis = `${headline} ${bullets[0]}`;

  return { headline, synthesis, bullets, risk_note, sentiment };
}
