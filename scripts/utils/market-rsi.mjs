export function rsiSeries(values, period = 14) {
  if (!values || values.length < period + 1) return [];
  const output = Array(values.length).fill(null);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  output[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    output[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return output;
}

export function stochRsi(values, period = 14) {
  const rsiVals = rsiSeries(values, period).filter((v) => Number.isFinite(v));
  if (rsiVals.length < period) return null;
  const slice = rsiVals.slice(-period);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  if (max === min) return 50;
  const current = rsiVals[rsiVals.length - 1];
  return ((current - min) / (max - min)) * 100;
}
