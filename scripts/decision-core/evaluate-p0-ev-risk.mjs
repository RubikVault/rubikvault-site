import { finiteNumber } from './shared.mjs';

export function evaluateP0EvRisk({ evidence, features, policy, horizon } = {}) {
  const cost = costProxy({ features, policy });
  const tail = tailRiskBucket({ evidence, features, policy });
  const ev = evProxyBucket({ evidence, features, cost, horizon });
  return {
    ev_proxy_bucket: ev.ev_proxy_bucket,
    tail_risk_bucket: tail.tail_risk_bucket,
    cost_proxy_bucket: cost.cost_proxy_bucket,
    cost_proxy_available: cost.available,
    risk_reason_codes: [
      ...cost.reason_codes,
      ...tail.reason_codes,
      ...ev.reason_codes,
    ],
    debug: { cost, tail, ev },
  };
}

export function costProxy({ features, policy } = {}) {
  const close = finiteNumber(features?.close);
  const liq = finiteNumber(features?.liquidity_score);
  const dollar = finiteNumber(features?.dollar_volume_20d);
  const vol = finiteNumber(features?.volatility_percentile);
  const minPrice = Number(policy?.cost_proxy_policy?.min_price || 1);
  const minDollar = Number(policy?.cost_proxy_policy?.min_dollar_volume_20d || 250000);
  const minLiq = Number(policy?.cost_proxy_policy?.min_liquidity_score || 35);
  const reason_codes = [];
  if (close == null || liq == null || vol == null) reason_codes.push('COST_PROXY_UNAVAILABLE');
  if (close != null && close < minPrice) reason_codes.push('PRICE_BELOW_MIN');
  if (dollar != null && dollar < minDollar) reason_codes.push('DOLLAR_VOLUME_TOO_LOW');
  if (liq != null && liq < minLiq) reason_codes.push('LIQUIDITY_SCORE_TOO_LOW');
  const available = !reason_codes.includes('COST_PROXY_UNAVAILABLE');
  let cost_proxy_bucket = 'unavailable';
  if (available) {
    if (liq < minLiq || (dollar != null && dollar < minDollar) || vol >= 85) cost_proxy_bucket = 'high';
    else if (liq < 55 || vol >= 70) cost_proxy_bucket = 'medium';
    else cost_proxy_bucket = 'low';
  }
  if (cost_proxy_bucket === 'high') reason_codes.push('COST_PROXY_HIGH');
  return { available, cost_proxy_bucket, reason_codes };
}

export function tailRiskBucket({ evidence, features, policy } = {}) {
  const effective = finiteNumber(evidence?.evidence_effective_n) || 0;
  const vol = finiteNumber(features?.volatility_percentile);
  const reason_codes = [];
  if (effective <= 0 || vol == null) {
    reason_codes.push('TAIL_RISK_UNKNOWN');
    return { tail_risk_bucket: 'UNKNOWN', reason_codes };
  }
  const highMin = Number(policy?.tail_risk_bucket_policy?.high_min_vol_percentile || 85);
  const lowMax = Number(policy?.tail_risk_bucket_policy?.low_max_vol_percentile || 45);
  if (vol >= highMin) {
    reason_codes.push('TAIL_RISK_HIGH');
    return { tail_risk_bucket: 'HIGH', reason_codes };
  }
  return { tail_risk_bucket: vol <= lowMax ? 'LOW' : 'MEDIUM', reason_codes };
}

export function evProxyBucket({ evidence, features, cost, horizon } = {}) {
  const effective = finiteNumber(evidence?.evidence_effective_n) || 0;
  const ret = horizon === 'short_term' ? finiteNumber(features?.ret_5d_pct) : finiteNumber(features?.ret_20d_pct);
  const reason_codes = [];
  if (evidence?.evidence_method === 'unavailable' || effective <= 0 || ret == null) {
    reason_codes.push('EV_PROXY_UNAVAILABLE');
    return { ev_proxy_bucket: 'unavailable', reason_codes };
  }
  if (cost?.cost_proxy_bucket === 'high') {
    reason_codes.push('EV_PROXY_NOT_POSITIVE');
    return { ev_proxy_bucket: 'neutral', reason_codes };
  }
  if (ret > 0.005) return { ev_proxy_bucket: 'positive', reason_codes };
  if (ret < -0.005) {
    reason_codes.push('EV_PROXY_NOT_POSITIVE');
    return { ev_proxy_bucket: 'negative', reason_codes };
  }
  reason_codes.push('EV_PROXY_NOT_POSITIVE');
  return { ev_proxy_bucket: 'neutral', reason_codes };
}
