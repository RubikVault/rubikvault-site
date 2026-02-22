#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const SSOT_ROWS_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.rows.json');
const SCI_SNAPSHOT_PATH = path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json');
const FEATURE_GAP_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_gap_reasons_report.json');
const OUT_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/scientific_gap_reasons_report.json');
const OUT_SUMMARY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/scientific_gap_reasons_summary.json');

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function norm(v) {
  return String(v || '').trim().toUpperCase();
}

async function main() {
  const [ssot, sci, featureGap] = await Promise.all([
    readJson(SSOT_ROWS_PATH),
    readJson(SCI_SNAPSHOT_PATH),
    readJson(FEATURE_GAP_REPORT_PATH)
  ]);

  const ssotRows = Array.isArray(ssot?.items) ? ssot.items : [];
  const ssotBySymbol = new Map();
  for (const row of ssotRows) {
    const symbol = norm(row?.symbol);
    if (!symbol) continue;
    ssotBySymbol.set(symbol, row);
  }

  const marketphaseMissing = new Set(
    (featureGap?.marketphase_elliott?.missing || []).map((r) => norm(r?.symbol)).filter(Boolean)
  );

  const reasonCounts = new Map();
  const overlapCounts = {
    total_data_unavailable: 0,
    scientific_du_lt200_or_no_pack: 0,
    scientific_du_ge200: 0,
    scientific_du_in_marketphase_gap: 0,
    scientific_du_not_in_marketphase_gap: 0,
    scientific_du_invalid_legacy_payload_but_ge200: 0
  };

  const samples = {
    insufficient_history: [],
    invalid_marketphase_payload: [],
    unexpected: []
  };

  let scientificReady = 0;
  for (const [rawTicker, entry] of Object.entries(sci || {})) {
    if (String(rawTicker).startsWith('_')) continue;
    const ticker = norm(entry?.ticker || rawTicker);
    const status = String(entry?.status || '').toUpperCase();
    if (status !== 'DATA_UNAVAILABLE') {
      scientificReady += 1;
      continue;
    }

    overlapCounts.total_data_unavailable += 1;
    const reason = String(entry?.reason || 'UNKNOWN');
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);

    const row = ssotBySymbol.get(ticker);
    const barsCount = Number(row?.bars_count || 0);
    const inMpGap = marketphaseMissing.has(ticker);
    if (barsCount >= 200) overlapCounts.scientific_du_ge200 += 1;
    else overlapCounts.scientific_du_lt200_or_no_pack += 1;
    if (inMpGap) overlapCounts.scientific_du_in_marketphase_gap += 1;
    else overlapCounts.scientific_du_not_in_marketphase_gap += 1;

    const rec = {
      symbol: ticker,
      canonical_id: String(row?.canonical_id || ''),
      bars_count: barsCount,
      reason,
      in_marketphase_elliott_gap: inMpGap
    };

    if (/Insufficient real marketphase data/i.test(reason)) {
      if (samples.insufficient_history.length < 25) samples.insufficient_history.push(rec);
    } else if (/Invalid marketphase feature payload/i.test(reason)) {
      if (barsCount >= 200) overlapCounts.scientific_du_invalid_legacy_payload_but_ge200 += 1;
      if (samples.invalid_marketphase_payload.length < 25) samples.invalid_marketphase_payload.push(rec);
    } else if (samples.unexpected.length < 25) {
      samples.unexpected.push(rec);
    }
  }

  const sortedReasons = [...reasonCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const report = {
    schema: 'rv_v7_scientific_gap_reasons_report_v1',
    generated_at: nowIso(),
    inputs: {
      scientific_snapshot: path.relative(REPO_ROOT, SCI_SNAPSHOT_PATH),
      ssot_rows: path.relative(REPO_ROOT, SSOT_ROWS_PATH),
      feature_gap_reasons_report: path.relative(REPO_ROOT, FEATURE_GAP_REPORT_PATH)
    },
    summary: {
      ssot_stocks_max: ssotRows.length,
      scientific_ready_count: scientificReady,
      scientific_data_unavailable_count: overlapCounts.total_data_unavailable,
      top_reasons: sortedReasons
    },
    overlap: overlapCounts,
    interpretation: {
      scientific_du_explained_by_same_lt200_history_gap_pct:
        overlapCounts.total_data_unavailable > 0
          ? Number(((overlapCounts.scientific_du_in_marketphase_gap / overlapCounts.total_data_unavailable) * 100).toFixed(2))
          : 0,
      note:
        overlapCounts.scientific_du_invalid_legacy_payload_but_ge200 > 0
          ? 'A subset has enough history but fails due to invalid legacy marketphase payload shape; v7-deep fallback should eliminate these.'
          : 'All DATA_UNAVAILABLE cases are currently explained by the same marketphase/history gap.'
    },
    samples
  };

  const summary = {
    schema: 'rv_v7_scientific_gap_reasons_summary_v1',
    generated_at: report.generated_at,
    ssot_stocks_max: report.summary.ssot_stocks_max,
    scientific_ready_count: report.summary.scientific_ready_count,
    scientific_data_unavailable_count: report.summary.scientific_data_unavailable_count,
    top_reasons: report.summary.top_reasons.slice(0, 5),
    overlap: overlapCounts,
    interpretation: report.interpretation
  };

  await writeJsonAtomic(OUT_REPORT_PATH, report);
  await writeJsonAtomic(OUT_SUMMARY_PATH, summary);

  console.log(JSON.stringify({
    ok: true,
    out_report: path.relative(REPO_ROOT, OUT_REPORT_PATH),
    out_summary: path.relative(REPO_ROOT, OUT_SUMMARY_PATH),
    scientific_ready_count: scientificReady,
    scientific_data_unavailable_count: overlapCounts.total_data_unavailable,
    top_reason: sortedReasons[0] || null
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, reason: error?.message || String(error) }));
  process.exit(1);
});

