export function fitIsotonicRegression(probabilities = [], labels = []) {
  if (!Array.isArray(probabilities) || !Array.isArray(labels) || probabilities.length !== labels.length || !probabilities.length) {
    return null;
  }

  const pairs = probabilities
    .map((p, index) => ({ p: Number(p), y: Number(labels[index]) }))
    .filter((pair) => Number.isFinite(pair.p) && Number.isFinite(pair.y))
    .sort((a, b) => a.p - b.p);

  if (!pairs.length) return null;

  const blocks = pairs.map((pair) => ({
    pMin: pair.p,
    pMax: pair.p,
    sumY: pair.y,
    count: 1,
  }));

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < blocks.length - 1; i += 1) {
      const leftAvg = blocks[i].sumY / blocks[i].count;
      const rightAvg = blocks[i + 1].sumY / blocks[i + 1].count;
      if (leftAvg > rightAvg) {
        blocks[i] = {
          pMin: blocks[i].pMin,
          pMax: blocks[i + 1].pMax,
          sumY: blocks[i].sumY + blocks[i + 1].sumY,
          count: blocks[i].count + blocks[i + 1].count,
        };
        blocks.splice(i + 1, 1);
        merged = true;
        break;
      }
    }
  }

  return {
    type: 'isotonic',
    sample_count: pairs.length,
    bins: blocks.map((block) => block.pMin),
    calibrated: blocks.map((block) => Number((block.sumY / block.count).toFixed(6))),
    points: blocks.map((block) => ({
      pMin: Number(block.pMin.toFixed(6)),
      pMax: Number(block.pMax.toFixed(6)),
      calibratedValue: Number((block.sumY / block.count).toFixed(6)),
      count: block.count,
    })),
  };
}

export function applyIsotonicCalibration(probability, model = null) {
  const raw = Number(probability);
  if (!Number.isFinite(raw)) return null;
  if (!model || !Array.isArray(model.points) || !model.points.length) return raw;

  for (const point of model.points) {
    if (raw >= point.pMin && raw <= point.pMax) {
      return point.calibratedValue;
    }
  }

  if (raw < model.points[0].pMin) return model.points[0].calibratedValue;
  if (raw > model.points[model.points.length - 1].pMax) return model.points[model.points.length - 1].calibratedValue;

  for (let i = 0; i < model.points.length - 1; i += 1) {
    const left = model.points[i];
    const right = model.points[i + 1];
    if (raw > left.pMax && raw < right.pMin) {
      const span = right.pMin - left.pMax;
      if (span <= 0) return left.calibratedValue;
      const t = (raw - left.pMax) / span;
      return left.calibratedValue + t * (right.calibratedValue - left.calibratedValue);
    }
  }

  return raw;
}
