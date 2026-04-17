import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PYTHON_BIN = process.env.PYTHON_BIN
  || (fs.existsSync(path.join(REPO_ROOT, 'quantlab/.venv/bin/python'))
    ? path.join(REPO_ROOT, 'quantlab/.venv/bin/python')
    : 'python3');
const DUCKDB_JSON_RUNNER = path.join(REPO_ROOT, 'scripts/quantlab/duckdb_json_runner.py');

const TIER_ORDER = ['super_stark', 'stark', 'mittel', 'schwach', 'sehr_schwach'];
const TIER_LABELS = {
  super_stark: 'super stark',
  stark: 'stark',
  mittel: 'mittel',
  schwach: 'schwach',
  sehr_schwach: 'sehr schwach',
};
const TIER_SCORE = {
  super_stark: 5,
  stark: 4,
  mittel: 3,
  schwach: 2,
  sehr_schwach: 1,
};
const STATUS_RANK = {
  L1_FULL: 3,
  L2_PARTIAL: 2,
  L3_MINIMAL: 1,
};
const CONTINENT_ORDER = ['america', 'europe', 'asia'];
const CONTINENT_LABELS = {
  america: 'Amerika',
  europe: 'Europa',
  asia: 'Asien',
};
const CONTINENT_EXCHANGES = {
  america: new Set([
    'US', 'NYSE', 'NASDAQ', 'NYQ', 'NMS', 'AMEX', 'ARCA', 'BATS', 'OTC', 'PINK',
    'TSX', 'TSXV', 'TO', 'V', 'CN', 'NEO', 'CA', 'MX', 'BMV', 'BA', 'SA', 'B3', 'SN', 'LIM',
  ]),
  europe: new Set([
    'LSE', 'LON', 'LN', 'XLON', 'PA', 'BR', 'AS', 'AMS', 'DE', 'F', 'XETRA', 'FWB',
    'SW', 'VX', 'MI', 'MC', 'MA', 'ST', 'HE', 'CO', 'OL', 'IC', 'IR', 'LS', 'VI',
    'WA', 'PR', 'AT', 'BE', 'RIG', 'RG', 'TAL',
  ]),
  asia: new Set([
    'KO', 'KQ', 'KS', 'HK', 'T', 'TYO', 'TSE', 'TW', 'TWO', 'SHG', 'SHA', 'SHE',
    'SZ', 'BJ', 'BK', 'SET', 'TA', 'TLV', 'SI', 'SG', 'KL', 'KLS', 'JK', 'JKT',
    'IDX', 'NSE', 'NS', 'BSE', 'BO', 'HO', 'HM', 'HNX', 'VN', 'SS',
  ]),
};

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function fmtPctSigned(value, digits = 1) {
  const num = Number(value || 0) * 100;
  const out = round(num, digits).toFixed(digits);
  return `${num > 0 ? '+' : ''}${out}%`;
}

function fmtNum(value, digits = 2) {
  return round(value, digits).toFixed(digits);
}

function readGzipJson(filePath) {
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(filePath));
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return null;
  }
}

function sqlString(value) {
  return `'${String(value || '').replaceAll("'", "''")}'`;
}

function duckdbJson(sql) {
  let res = spawnSync(process.env.DUCKDB_BIN || 'duckdb', ['-json', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (res.error?.code === 'ENOENT' && fs.existsSync(DUCKDB_JSON_RUNNER)) {
    res = spawnSync(PYTHON_BIN, [DUCKDB_JSON_RUNNER, '-json', '-c', sql], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
  }
  if (res.status !== 0) {
    throw new Error(`duckdb failed: ${res.stderr || res.stdout || res.error?.message || 'unknown error'}`);
  }
  return JSON.parse(res.stdout || '[]');
}

function toDate(value) {
  if (!value) return null;
  const out = new Date(value);
  return Number.isNaN(out.getTime()) ? null : out;
}

function endOfDate(dateId) {
  return new Date(`${dateId}T23:59:59.999Z`);
}

function getFamilyTemplates() {
  return [
    {
      family: 'QUALITY',
      title: 'Quality Trend',
      purpose: 'Robuste liquide Trendaktien mit moeglichst ruhigem Risikoprofil.',
      bestFor: 'stabile Long-Ideen, defensive Trend-Selektion, Qualitaet plus Liquiditaet',
      todayUse: 'Wenn du sofort robuste Leader suchst, ist QUALITY der einfachste Startpunkt.',
      inputWhere: 'Direkt im Suchfeld dieses Daily Reports oder alternativ ueber /stock.html mit dem Ticker.',
      askTemplate: 'Zeige mir die stabilsten Quality-Trend-Aktien mit hoher Liquiditaet und moeglichst ruhigem Risiko.',
      candidateIds: ['quality_trend_liq_lowvol', 'quality_liq_lowvol', 'quality_liq_lowvol_macd'],
    },
    {
      family: 'BREAKOUT',
      title: 'Breakout / Beschleunigung',
      purpose: 'Ausbrueche mit Trend-, MACD- und Volatilitaetsfilter.',
      bestFor: 'Breakout-Screens, Momentum-Acceleration, MACD-Fortsetzungen',
      todayUse: 'Wenn du echte Trend-Beschleunigung willst, ist BREAKOUT aktuell sehr belastbar.',
      inputWhere: 'Im Suchfeld dieses Reports oder als Prompt fuer einen Breakout-Screen.',
      askTemplate: 'Finde Aktien mit Trend, MACD-Aufwaertsdruck und moeglichst sauberem Breakout-Profil.',
      candidateIds: ['breakout_trend', 'breakout_trend_volfilter', 'breakout_trend_macd_liq', 'breakout_trend_macd_liq_v2', 'breakout_trend_macd_liq_v3'],
    },
    {
      family: 'TSMOM',
      title: 'Time-Series Momentum',
      purpose: 'Trendfolger auf Zeitreihenbasis mit Ret/MACD/Trend-Gewichten.',
      bestFor: 'Fortsetzungsbewegungen, klassische Trendfolger, Momentum-Folgesignale',
      todayUse: 'Gut fuer systematische Trendfolge, aber aktuell nicht der staerkste Tageschampion.',
      inputWhere: 'Im Suchfeld dieses Reports fuer einzelne Aktien oder als universelle Trend-Anfrage.',
      askTemplate: 'Zeige mir trendfolgende Aktien mit sauberer 20-Tage-Staerke und Momentum-Bestaetigung.',
      candidateIds: ['tsmom_20', 'tsmom_20_macd', 'tsmom_20_riskadj', 'tsmom_trend_quality', 'tsmom_trend_quality_v2', 'tsmom_trend_macd_lowvol', 'tsmom_ret_macd_liq', 'tsmom_trend_quality_v3', 'tsmom_trend_defensive'],
    },
    {
      family: 'CSMOM',
      title: 'Cross-Sectional Momentum',
      purpose: 'Relative-Staerke-Experten fuer Gewinnerrotation, Momentum und Liquiditaet.',
      bestFor: 'Relative-Strength-Rankings, Rotationsideen, Momentum-Leader',
      todayUse: 'Das ist aktuell der frischeste Spitzenblock im Quant Lab und jetzt produktiv belegt.',
      inputWhere: 'Im Suchfeld dieses Reports und im Top-10-Board fuer taegliche Chancen.',
      askTemplate: 'Finde die relativen Gewinner mit hohem Momentum, guter Liquiditaet und weiterem Trendpotenzial.',
      candidateIds: ['csmom_20_liq', 'csmom_20_trend_liq', 'csmom_20_macd_liq', 'csmom_trend_liq_v2', 'csmom_trend_macd_liq', 'csmom_ret5_ret20_liq', 'csmom_20_trend_liq_soft', 'csmom_ret5_trend_liq_soft', 'csmom_ret5_macd_liq_soft', 'csmom_trend_macd_liq_v2', 'csmom_trend_macd_liq_v3'],
    },
    {
      family: 'MEANREV',
      title: 'RSI / Mean Reversion',
      purpose: 'Oversold-Rebounds ueber RSI, Bollinger und Trendfilter.',
      bestFor: 'RSI-Screens, Gegenbewegungen, Rebound nach Ueberverkauf',
      todayUse: 'Fuer Oversold-Suchen nuetzlich, aber aktuell klar schwacher als Trend- und Breakout-Experten.',
      inputWhere: 'Direkt im Suchfeld dieses Reports oder als spezielle RSI-Rebound-Anfrage.',
      askTemplate: 'Finde ueberverkaufte Aktien mit RSI-Rebound-Chance und fruehen Bodenbildungssignalen.',
      candidateIds: ['mr_rsi', 'mr_rsi_boll', 'mr_rsi_trendfilter', 'mr_boll_vol'],
    },
    {
      family: 'VOL',
      title: 'Volatility Contraction',
      purpose: 'Squeeze- und Volatilitaetskompression vor Bewegungen.',
      bestFor: 'Volatility-Squeeze-Setups',
      todayUse: 'Aktuell eher Beobachtungsblock als produktiver Tagesexperte.',
      inputWhere: 'Im Daily Report nur als Zusatzsicht, nicht als primaere Long-Engine.',
      askTemplate: 'Zeige mir Volatility-Squeeze-Setups mit moeglichem Ausbruchspotenzial.',
      candidateIds: ['vol_contraction'],
    },
  ];
}

const CANDIDATE_DEFINITIONS = {
  quality_trend_liq_lowvol: {
    title: 'Quality Trend',
    shortPurpose: 'ruhige Qualitaets-Trendaktien',
    score: (row) => 0.35 * row.trend_gate + 0.35 * row.z_liq + -0.30 * row.z_vol_20,
    reason: (row) => `Trendgeruest ${fmtNum(row.trend_gate, 2)}, Liquiditaet ${fmtNum(row.z_liq, 2)}, Volatilitaet ${fmtNum(-row.z_vol_20, 2)}.`,
  },
  quality_liq_lowvol: {
    title: 'Quality Low Vol',
    shortPurpose: 'liquide defensivere Aktien',
    score: (row) => 0.60 * row.z_liq + -0.40 * row.z_vol_20,
    reason: (row) => `Liquiditaet ${fmtNum(row.z_liq, 2)} und niedrigere Volatilitaet ${fmtNum(-row.z_vol_20, 2)}.`,
  },
  breakout_trend_volfilter: {
    title: 'Breakout Vol Filter',
    shortPurpose: 'Trend-Breakouts mit Vol-Filter',
    score: (row) => 0.50 * row.trend_gate + 0.35 * row.z_macd_hist + -0.15 * row.z_vol_20,
    reason: (row) => `Trendaufbau ${fmtNum(row.trend_gate, 2)}, MACD-Schub ${fmtNum(row.z_macd_hist, 2)}, Vol-Filter ${fmtNum(-row.z_vol_20, 2)}.`,
  },
  breakout_trend_macd_liq: {
    title: 'Breakout MACD',
    shortPurpose: 'Breakouts mit MACD und Liquiditaet',
    score: (row) => 0.45 * row.trend_gate + 0.35 * row.z_macd_hist + 0.20 * row.z_liq,
    reason: (row) => `Trend ${fmtNum(row.trend_gate, 2)}, MACD ${fmtNum(row.z_macd_hist, 2)}, Liquiditaet ${fmtNum(row.z_liq, 2)}.`,
  },
  breakout_trend_macd_liq_v3: {
    title: 'Breakout MACD v3',
    shortPurpose: 'staerkster Breakout-Block',
    score: (row) => 0.55 * row.trend_gate + 0.25 * row.z_macd_hist + 0.20 * row.z_liq,
    reason: (row) => `Sehr sauberes Trendgeruest ${fmtNum(row.trend_gate, 2)} plus MACD/Marktfaehigkeit.`,
  },
  tsmom_20_macd: {
    title: 'TSMOM 20 MACD',
    shortPurpose: '20-Tage-Trendfolger',
    score: (row) => 0.60 * row.z_ret_20d + 0.40 * row.z_macd_hist,
    reason: (row) => `20-Tage-Staerke ${fmtPctSigned(row.ret_20d)} und MACD-Druck ${fmtNum(row.z_macd_hist, 2)}.`,
  },
  tsmom_ret_macd_liq: {
    title: 'TSMOM Ret MACD Liq',
    shortPurpose: 'Trendfolge mit Liquiditaetsbias',
    score: (row) => 0.45 * row.z_ret_20d + 0.30 * row.z_macd_hist + 0.25 * row.z_liq,
    reason: (row) => `Trend ${fmtPctSigned(row.ret_20d)}, MACD ${fmtNum(row.z_macd_hist, 2)}, Liquiditaet ${fmtNum(row.z_liq, 2)}.`,
  },
  tsmom_trend_quality_v3: {
    title: 'TSMOM Trend Quality v3',
    shortPurpose: 'Trendfolger mit Qualitaetsbias',
    score: (row) => 0.45 * row.trend_gate + 0.30 * row.z_ret_20d + 0.15 * row.z_liq + 0.10 * row.z_macd_hist,
    reason: (row) => `Trendaufbau ${fmtNum(row.trend_gate, 2)} und Trendstaerke ${fmtPctSigned(row.ret_20d)}.`,
  },
  csmom_trend_macd_liq: {
    title: 'CSMOM Trend MACD',
    shortPurpose: 'relative Staerke plus Trend',
    score: (row) => 0.35 * row.trend_gate + 0.30 * row.z_ret_20d + 0.20 * row.z_macd_hist + 0.15 * row.z_liq,
    reason: (row) => `Relative Staerke ${fmtPctSigned(row.ret_20d)} plus MACD/Trend-Kombi.`,
  },
  csmom_20_trend_liq_soft: {
    title: 'CSMOM Trend Soft',
    shortPurpose: 'aktueller Live-Experte fuer Leader',
    score: (row) => 0.63 * row.z_ret_20d + 0.11 * row.trend_gate + 0.26 * row.z_liq,
    reason: (row) => `Relative Staerke ${fmtPctSigned(row.ret_20d)} und hohe Marktfaehigkeit ${fmtNum(row.z_liq, 2)}.`,
  },
  csmom_ret5_trend_liq_soft: {
    title: 'CSMOM Ret5 Trend Soft',
    shortPurpose: 'kurzfristige Rotationsleader',
    score: (row) => 0.49 * row.z_ret_20d + 0.15 * row.z_ret_5d + 0.10 * row.trend_gate + 0.26 * row.z_liq,
    reason: (row) => `20T ${fmtPctSigned(row.ret_20d)}, 5T ${fmtPctSigned(row.ret_5d)}, Liquiditaet ${fmtNum(row.z_liq, 2)}.`,
  },
  csmom_ret5_macd_liq_soft: {
    title: 'CSMOM Ret5 MACD Soft',
    shortPurpose: 'Leader mit frischem Impuls',
    score: (row) => 0.47 * row.z_ret_20d + 0.15 * row.z_ret_5d + 0.10 * row.z_macd_hist + 0.28 * row.z_liq,
    reason: (row) => `Momentum-Kombi aus 20T/5T plus MACD-Impuls.`,
  },
  mr_rsi_trendfilter: {
    title: 'RSI Trendfilter',
    shortPurpose: 'Oversold-Rebounds',
    score: (row) => -0.70 * row.z_rsi_14 + -0.30 * row.trend_gate,
    reason: (row) => `RSI ${fmtNum(row.rsi_14, 1)} und Gegenspannung gegen den Trendzustand ${fmtNum(row.trend_gate, 2)}.`,
  },
  mr_rsi_boll: {
    title: 'RSI Bollinger',
    shortPurpose: 'tiefe Ueberverkauftheit',
    score: (row) => -0.60 * row.z_rsi_14 + -0.40 * row.z_boll_z_20,
    reason: (row) => `RSI ${fmtNum(row.rsi_14, 1)} und Bollinger-Z ${fmtNum(row.boll_z_20, 2)}.`,
  },
};

function baseCandidateStats(familyTemplates) {
  const map = new Map();
  for (const family of familyTemplates) {
    for (const candidateId of family.candidateIds) {
      map.set(candidateId, {
        candidateId,
        family: family.family,
        strictPassCount: 0,
        strictAsofs: new Set(),
        strictDates: new Set(),
        liveCount: 0,
        shadowCount: 0,
        retiredCount: 0,
        promoteCount: 0,
        focusCount: 0,
        nearPassCount: 0,
        minFailedGateTotal: null,
        psrStrictSamples: [],
        dsrStrictSamples: [],
        icSamples: [],
        registrySeenDates: new Set(),
      });
    }
  }
  return map;
}

function enhanceCandidateStats(statsMap) {
  for (const stat of statsMap.values()) {
    stat.avgPsrStrict = stat.psrStrictSamples.length
      ? round(stat.psrStrictSamples.reduce((sum, value) => sum + value, 0) / stat.psrStrictSamples.length, 4)
      : 0;
    stat.avgDsrStrict = stat.dsrStrictSamples.length
      ? round(stat.dsrStrictSamples.reduce((sum, value) => sum + value, 0) / stat.dsrStrictSamples.length, 4)
      : 0;
    stat.avgIc = stat.icSamples.length
      ? round(stat.icSamples.reduce((sum, value) => sum + value, 0) / stat.icSamples.length, 4)
      : 0;
    stat.strengthScore = round(
      stat.liveCount * 120 +
      stat.shadowCount * 70 +
      stat.strictPassCount * 55 +
      stat.promoteCount * 18 +
      stat.nearPassCount * 8 +
      stat.focusCount * 4 +
      stat.avgPsrStrict * 18 +
      stat.avgDsrStrict * 18,
      3
    );
    stat.tier = classifyTier(stat);
    stat.tierLabel = TIER_LABELS[stat.tier];
  }
  return statsMap;
}

function classifyTier(stat) {
  if (stat.liveCount > 0 || (stat.strictPassCount >= 2 && (stat.shadowCount > 0 || stat.avgPsrStrict >= 0.58))) {
    return 'super_stark';
  }
  if (stat.shadowCount > 0 || stat.strictPassCount >= 1 || stat.promoteCount >= 1) {
    return 'stark';
  }
  if (stat.nearPassCount >= 2 || stat.focusCount >= 1) {
    return 'mittel';
  }
  if (stat.nearPassCount >= 1) {
    return 'schwach';
  }
  return 'sehr_schwach';
}

function collectStrictRows(stagebReports) {
  const paths = [...new Set(stagebReports.map((item) => item.survivorsPath).filter((value) => value && fs.existsSync(value)))];
  if (!paths.length) return [];
  const sql = `
    select
      candidate_id,
      family,
      psr_strict,
      dsr_strict,
      ic_5d_oos_mean,
      run_id
    from read_parquet([${paths.map(sqlString).join(', ')}])
  `;
  return duckdbJson(sql);
}

function buildStatsFromArtifacts({ familyTemplates, stagebReports, registryReports, focus }) {
  const statsMap = baseCandidateStats(familyTemplates);
  for (const row of collectStrictRows(stagebReports)) {
    const stat = statsMap.get(row.candidate_id);
    if (!stat) continue;
    stat.strictPassCount += 1;
    stat.strictDates.add(String(row.run_id || ''));
    stat.psrStrictSamples.push(Number(row.psr_strict || 0));
    stat.dsrStrictSamples.push(Number(row.dsr_strict || 0));
    stat.icSamples.push(Number(row.ic_5d_oos_mean || 0));
  }
  for (const report of stagebReports) {
    const top = report.topSurvivor;
    if (top?.candidate_id && statsMap.has(top.candidate_id)) {
      statsMap.get(top.candidate_id).strictAsofs.add(String(report.asofDate || ''));
    }
  }
  for (const report of registryReports) {
    const generatedDate = String(report.generatedAt || '').slice(0, 10);
    const promoted = report.decision === 'PROMOTE';
    for (const [slot, record] of Object.entries(report.championSlots || {})) {
      const candidateId = String(record?.candidate_id || '');
      if (!candidateId || !statsMap.has(candidateId)) continue;
      const stat = statsMap.get(candidateId);
      if (slot.startsWith('live')) stat.liveCount += 1;
      else if (slot.startsWith('shadow')) stat.shadowCount += 1;
      else if (slot === 'retired') stat.retiredCount += 1;
      if (promoted) stat.promoteCount += 1;
      if (generatedDate) stat.registrySeenDates.add(generatedDate);
    }
  }
  for (const row of focus?.candidate_recurring_summary || []) {
    const stat = statsMap.get(String(row.candidate_id || ''));
    if (!stat) continue;
    for (const asof of row.asofs || []) {
      stat.focusCount += 1;
      if (!asof.stage_b_q1_strict_pass) {
        stat.nearPassCount += 1;
        const failedGateTotal = Number(asof.failed_gate_total || 0);
        stat.minFailedGateTotal = stat.minFailedGateTotal == null
          ? failedGateTotal
          : Math.min(stat.minFailedGateTotal, failedGateTotal);
      }
    }
  }
  return enhanceCandidateStats(statsMap);
}

function buildDailyTierTrend({ familyTemplates, stagebReports, registryReports }) {
  const dayIds = [...new Set([
    ...stagebReports.map((item) => String(item.generatedAt || '').slice(0, 10)),
    ...registryReports.map((item) => String(item.generatedAt || '').slice(0, 10)),
  ].filter(Boolean))].sort();
  if (!dayIds.length) return [];
  const out = [];
  for (const dayId of dayIds) {
    const stagebSubset = stagebReports.filter((item) => {
      const value = toDate(item.generatedAt);
      return value && value <= endOfDate(dayId);
    });
    const registrySubset = registryReports.filter((item) => {
      const value = toDate(item.generatedAt);
      return value && value <= endOfDate(dayId);
    });
    const statsMap = buildStatsFromArtifacts({
      familyTemplates,
      stagebReports: stagebSubset,
      registryReports: registrySubset,
      focus: null,
    });
    const counts = Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0]));
    for (const stat of statsMap.values()) counts[stat.tier] += 1;
    out.push({
      date: dayId,
      super_stark: counts.super_stark,
      stark: counts.stark,
      mittel: counts.mittel,
      schwach: counts.schwach,
      sehr_schwach: counts.sehr_schwach,
      strong_or_better: counts.super_stark + counts.stark,
    });
  }
  return out;
}

function deltaFrom(points, days) {
  if (!points.length) return 0;
  const last = points[points.length - 1];
  const anchor = points[Math.max(0, points.length - 1 - days)];
  return Number(last?.strong_or_better || 0) - Number(anchor?.strong_or_better || 0);
}

function buildAgentReadiness({ familyTemplates, statsMap, latestRegistry, focus, overnightManifest, fullchunkManifest, universeSymbolsTotal, scoredTodayAssetsTotal, trendPoints }) {
  const slotRows = Object.entries(latestRegistry?.championSlots || {})
    .map(([slot, rec]) => rec?.candidate_id ? {
      slot,
      candidateId: String(rec.candidate_id || ''),
      family: String(rec.family || ''),
      state: String(rec.state || slot),
      registryScore: rec.q1_registry_score == null ? null : round(rec.q1_registry_score, 6),
    } : null)
    .filter(Boolean);
  const tierCounts = Object.fromEntries(TIER_ORDER.map((tier) => [tier, 0]));
  for (const stat of statsMap.values()) tierCounts[stat.tier] += 1;
  const familyRows = familyTemplates.map((family) => {
    const candidateStats = family.candidateIds
      .map((candidateId) => statsMap.get(candidateId))
      .filter(Boolean)
      .sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || (b.strengthScore - a.strengthScore));
    const best = candidateStats[0] || null;
    const strongestCandidates = candidateStats.slice(0, 3).map((item) => item.candidateId);
    const tier = best?.tier || 'sehr_schwach';
    const proof = [];
    if (best) {
      if (best.liveCount > 0 || best.shadowCount > 0) {
        proof.push(`Registry-Beleg: ${best.liveCount}x live, ${best.shadowCount}x shadow.`);
      }
      if (best.strictPassCount > 0) {
        proof.push(`Stage-B-Beleg: ${best.strictPassCount} strict-positive Treffer.`);
      } else if (best.nearPassCount > 0) {
        proof.push(`Trainingsbeleg: ${best.nearPassCount} Near-Pass-As-ofs, bester Restfehler ${best.minFailedGateTotal ?? '—'} Gates.`);
      }
    }
    const focusCount = Number(focus?.summary?.focus_families?.[family.family] || 0);
    if (focusCount > 0) {
      proof.push(`Aktueller Fokus: ${focusCount} Kandidaten im Stage-B-Fokus.`);
    }
    return {
      family: family.family,
      title: family.title,
      purpose: family.purpose,
      bestFor: family.bestFor,
      todayUse: family.todayUse,
      inputWhere: family.inputWhere,
      askTemplate: family.askTemplate,
      tier,
      tierLabel: TIER_LABELS[tier],
      strongestCandidates,
      strongestExperts: candidateStats.slice(0, 5).map((item) => ({
        candidateId: item.candidateId,
        tier: item.tier,
        tierLabel: item.tierLabel,
        strictPassCount: item.strictPassCount,
        liveCount: item.liveCount,
        shadowCount: item.shadowCount,
      })),
      evidence: proof,
      definedExpertsTotal: family.candidateIds.length,
      headline: tier === 'super_stark'
        ? 'nachweislich sehr stark'
        : tier === 'stark'
          ? 'nachweislich stark'
          : tier === 'mittel'
            ? 'solide im Training'
            : tier === 'schwach'
              ? 'noch schwach'
              : 'kaum belastbarer Nachweis',
    };
  }).sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || a.family.localeCompare(b.family));

  const strongestExperts = [...statsMap.values()]
    .sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || (b.strengthScore - a.strengthScore))
    .slice(0, 10)
    .map((item) => ({
      candidateId: item.candidateId,
      family: item.family,
      tier: item.tier,
      tierLabel: item.tierLabel,
      strictPassCount: item.strictPassCount,
      liveCount: item.liveCount,
      shadowCount: item.shadowCount,
      avgPsrStrict: item.avgPsrStrict,
      avgDsrStrict: item.avgDsrStrict,
      proof: item.liveCount > 0
        ? `Live-Einsatz plus ${item.strictPassCount} strict-positive Treffer.`
        : item.shadowCount > 0
          ? `Shadow-Einsatz plus ${item.strictPassCount} strict-positive Treffer.`
          : item.strictPassCount > 0
            ? `${item.strictPassCount} strict-positive Treffer in der v4-final-Serie.`
            : `${item.nearPassCount} Near-Pass-As-ofs im Training.`,
    }));

  const trendLast = trendPoints[trendPoints.length - 1] || null;
  const quickAnswer = [
    `Aktuell sind ${tierCounts.super_stark} Experten super stark und ${tierCounts.stark} stark belegt.`,
    strongestExperts[0]
      ? `Der aktuell staerkste Einzel-Experte ist ${strongestExperts[0].candidateId} aus ${strongestExperts[0].family}.`
      : 'Aktuell gibt es noch keinen belastbaren Spitzenexperten.',
    `Im scored Daily-Slice sind heute ${scoredTodayAssetsTotal} Aktien direkt mit Expertenlogik auswertbar; Universe v7 kennt ${universeSymbolsTotal} Stocks fuer die Suche.`,
    'Wenn du sofort arbeiten willst: zuerst Top-10-Board anschauen, danach einzelne Aktie im Suchfeld pruefen.',
  ];

  const requestPlaybook = familyRows.slice(0, 5).map((item) => ({
    task: `${item.title}: ${item.bestFor}`,
    readiness: item.tierLabel,
    answer: item.todayUse,
    bestAgents: item.strongestCandidates,
    truth: item.evidence.join(' ') || 'Noch kein starker aktueller Nachweis.',
    inputWhere: item.inputWhere,
    askTemplate: item.askTemplate,
  }));

  return {
    summary: {
      expertsDefinedTotal: [...statsMap.values()].length,
      familiesTotal: familyTemplates.length,
      liveSlotsTotal: slotRows.filter((item) => item.state.startsWith('live')).length,
      shadowSlotsTotal: slotRows.filter((item) => item.state.startsWith('shadow')).length,
      retiredSlotsTotal: slotRows.filter((item) => item.state === 'retired').length,
      superStrongTotal: tierCounts.super_stark,
      strongTotal: tierCounts.stark,
      mediumTotal: tierCounts.mittel,
      weakTotal: tierCounts.schwach,
      veryWeakTotal: tierCounts.sehr_schwach,
      strongOrBetterTotal: tierCounts.super_stark + tierCounts.stark,
      releaseLaneScope: `Release-Lane heute: top3500 Deploy-Slice, ${Number(overnightManifest?.counts?.asof_dates_total || 0)} As-ofs.`,
      broaderStoreScope: `Breiterer Full-Store lokal vorhanden: ${Number(fullchunkManifest?.counts?.rows_total || 0).toLocaleString('en-US')} Zeilen, ${Number(fullchunkManifest?.counts?.asof_dates_total || 0)} As-ofs.`,
      universeSymbolsTotal,
      scoredTodayAssetsTotal,
      scoredCoveragePct: universeSymbolsTotal ? round((scoredTodayAssetsTotal / universeSymbolsTotal) * 100, 2) : 0,
      dayDeltaStrongOrBetter: trendLast ? deltaFrom(trendPoints, 1) : 0,
      weekDeltaStrongOrBetter: trendLast ? deltaFrom(trendPoints, 5) : 0,
      monthDeltaStrongOrBetter: trendLast ? deltaFrom(trendPoints, 20) : 0,
    },
    quickAnswer,
    tierSummary: TIER_ORDER.map((tier) => ({
      tier,
      label: TIER_LABELS[tier],
      count: tierCounts[tier],
      description:
        tier === 'super_stark'
          ? 'live oder mehrfach strict positiv belegt'
          : tier === 'stark'
            ? 'shadow oder mindestens einmal strict positiv'
            : tier === 'mittel'
              ? 'guter Trainingsnachweis, aber noch nicht stark genug'
              : tier === 'schwach'
                ? 'erst schwacher Hinweis, noch kein harter Beleg'
                : 'nur definiert, aktuell ohne belastbaren Nachweis',
    })),
    tierTrend: trendPoints,
    strongestExperts,
    families: familyRows,
    requestPlaybook,
  };
}

function registryRank(row) {
  return (
    (row.scoredToday ? 1_000_000_000 : 0) +
    ((STATUS_RANK[row.status] || 0) * 10_000_000) +
    (Number(row.barsCount || 0) * 10) +
    (row.lastTradeDate ? 1 : 0)
  );
}

function continentKeyForExchange(exchange, assetId = '') {
  const rawExchange = String(exchange || '').trim().toUpperCase();
  const assetPrefix = String(assetId || '').split(':')[0]?.trim().toUpperCase() || '';
  const candidates = [rawExchange, assetPrefix].filter(Boolean);
  for (const candidate of candidates) {
    for (const continent of CONTINENT_ORDER) {
      if (CONTINENT_EXCHANGES[continent].has(candidate)) {
        return continent;
      }
    }
  }
  return null;
}

function continentLabelForKey(continentKey) {
  return CONTINENT_LABELS[continentKey] || null;
}

function buildBrowseMaps(repoRoot, scoredAssetSet) {
  const browsePath = path.join(repoRoot, 'public/data/universe/v7/registry/registry.browse.json.gz');
  const browse = readGzipJson(browsePath);
  const records = Array.isArray(browse?.records)
    ? browse.records.filter((item) => ['STOCK', 'ETF'].includes(String(item?.type_norm || '').toUpperCase()))
    : [];
  const byCanonicalId = new Map();
  const bySymbolBest = new Map();
  for (const record of records) {
    const canonicalId = String(record.canonical_id || '');
    const symbol = String(record.symbol || '');
    const assetClass = String(record.type_norm || '').toUpperCase() === 'ETF' ? 'etf' : 'stock';
    const row = {
      canonicalId,
      assetId: canonicalId,
      symbol,
      assetClass,
      name: String(record.name || symbol),
      exchange: String(record.exchange || ''),
      continentKey: continentKeyForExchange(record.exchange, canonicalId),
      continentLabel: continentLabelForKey(continentKeyForExchange(record.exchange, canonicalId)),
      status: String(record.status || ''),
      barsCount: Number(record.bars_count || 0),
      lastTradeDate: String(record.last_trade_date || ''),
      scoredToday: scoredAssetSet.has(canonicalId),
    };
    if (canonicalId) byCanonicalId.set(canonicalId, row);
    if (!symbol) continue;
    const current = bySymbolBest.get(symbol);
    if (!current || registryRank(row) > registryRank(current)) {
      bySymbolBest.set(symbol, row);
    }
  }
  return {
    browsePath,
    byCanonicalId,
    searchIndex: [...bySymbolBest.values()]
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((item) => ({
        symbol: item.symbol,
        canonicalId: item.canonicalId,
        assetId: item.assetId,
        assetClass: item.assetClass,
        name: item.name,
        exchange: item.exchange,
        continentKey: item.continentKey,
        continentLabel: item.continentLabel,
        status: item.status,
        barsCount: item.barsCount,
        lastTradeDate: item.lastTradeDate,
        scoredToday: item.scoredToday,
      })),
  };
}

function locateLatestFeatureSlice(quantRoot) {
  const candidates = [
    {
      version: 'v4_q1panel_overnight',
      root: path.join(quantRoot, 'features/store/feature_store_version=v4_q1panel_overnight'),
      priority: 0,
    },
    {
      version: 'v4_q1panel_fullchunk_daily',
      root: path.join(quantRoot, 'features/store/feature_store_version=v4_q1panel_fullchunk_daily'),
      priority: 1,
    },
  ];
  const slices = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.root)) continue;
    const dates = fs.readdirSync(candidate.root)
      .filter((name) => name.startsWith('asof_date='))
      .sort();
    const latest = dates[dates.length - 1];
    if (!latest) continue;
    const latestDir = path.join(candidate.root, latest);
    const mtime = (() => {
      try { return fs.statSync(latestDir).mtimeMs; } catch { return 0; }
    })();
    slices.push({
      root: candidate.root,
      featureStoreVersion: candidate.version,
      asofDate: latest.replace('asof_date=', ''),
      parquetPath: path.join(candidate.root, latest, 'asset_class=*', '*.parquet'),
      priority: candidate.priority,
      mtime,
    });
  }
  slices.sort((a, b) => (
    String(b.asofDate).localeCompare(String(a.asofDate))
    || a.priority - b.priority
    || b.mtime - a.mtime
  ));
  return slices[0] || null;
}

function loadScoredRows(featureSlice) {
  if (!featureSlice?.parquetPath) return [];
  const sql = `
    select
      asset_id,
      regexp_extract(asset_id, '^[^:]+:(.*)$', 1) as symbol,
      lower(asset_class) as asset_class,
      asof_date,
      close_raw,
      ret_5d,
      ret_20d,
      macd_hist,
      rsi_14,
      boll_z_20,
      adv20_dollar,
      ewma_vol_20,
      round((
        (case when close_raw > sma_20 then 1.0 else 0.0 end) +
        (case when sma_20 > sma_50 then 1.0 else 0.0 end) +
        (case when sma_50 > sma_200 then 1.0 else 0.0 end)
      ) / 3.0, 6) as trend_gate
    from read_parquet(${sqlString(featureSlice.parquetPath)})
    where coalesce(has_missing_bars_lookback, false) = false
      and coalesce(ca_suspicious_flag, false) = false
  `;
  const rows = duckdbJson(sql).map((row) => ({
    ...row,
    asset_class: String(row.asset_class || 'stock').toLowerCase(),
    ret_20d: Number(row.ret_20d || 0),
    ret_5d: Number(row.ret_5d || 0),
    macd_hist: Number(row.macd_hist || 0),
    adv20_dollar: Number(row.adv20_dollar || 0),
    ewma_vol_20: Number(row.ewma_vol_20 || 0),
    rsi_14: Number(row.rsi_14 || 0),
    boll_z_20: Number(row.boll_z_20 || 0),
    trend_gate: Number(row.trend_gate || 0),
  }));
  const metricSpec = [
    ['ret_20d', 'z_ret_20d', (value) => value],
    ['ret_5d', 'z_ret_5d', (value) => value],
    ['macd_hist', 'z_macd_hist', (value) => value],
    ['adv20_dollar', 'z_liq', (value) => Math.log(Math.max(Number(value || 0), 1))],
    ['ewma_vol_20', 'z_vol_20', (value) => Number(value || 0)],
    ['rsi_14', 'z_rsi_14', (value) => Number(value || 0)],
    ['boll_z_20', 'z_boll_z_20', (value) => Number(value || 0)],
  ];
  for (const [sourceKey, zKey, transform] of metricSpec) {
    const series = rows.map((row) => transform(row[sourceKey]));
    const mean = series.reduce((sum, value) => sum + value, 0) / Math.max(series.length, 1);
    const variance = series.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(series.length, 1);
    const std = Math.sqrt(Math.max(variance, Number.EPSILON));
    rows.forEach((row, index) => {
      row[zKey] = round((series[index] - mean) / std, 6);
    });
  }
  return rows;
}

function selectDashboardExperts(familyTemplates, statsMap, latestRegistry) {
  const selected = [];
  const seen = new Set();
  const registryPriority = Object.values(latestRegistry?.championSlots || {})
    .map((item) => String(item?.candidate_id || ''))
    .filter((candidateId) => candidateId && CANDIDATE_DEFINITIONS[candidateId] && statsMap.has(candidateId));
  for (const candidateId of registryPriority) {
    if (seen.has(candidateId)) continue;
    const stat = statsMap.get(candidateId);
    selected.push(stat);
    seen.add(candidateId);
  }
  const familyBest = [];
  for (const family of familyTemplates) {
    const candidates = family.candidateIds
      .filter((candidateId) => CANDIDATE_DEFINITIONS[candidateId])
      .map((candidateId) => statsMap.get(candidateId))
      .filter(Boolean)
      .sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || (b.strengthScore - a.strengthScore));
    if (!candidates.length) continue;
    const best = candidates[0];
    if (family.family === 'VOL' && best.tier === 'sehr_schwach') continue;
    familyBest.push(best);
  }
  for (const stat of familyBest) {
    if (!seen.has(stat.candidateId)) {
      selected.push(stat);
      seen.add(stat.candidateId);
    }
  }
  const extras = [...statsMap.values()]
    .filter((item) => CANDIDATE_DEFINITIONS[item.candidateId] && !seen.has(item.candidateId))
    .sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || (b.strengthScore - a.strengthScore))
    .slice(0, 3);
  for (const item of extras) {
    selected.push(item);
    seen.add(item.candidateId);
  }
  return selected
    .sort((a, b) => (TIER_SCORE[b.tier] - TIER_SCORE[a.tier]) || (b.strengthScore - a.strengthScore))
    .slice(0, 8)
    .map((item) => ({
      candidateId: item.candidateId,
      family: item.family,
      tier: item.tier,
      tierLabel: item.tierLabel,
      title: CANDIDATE_DEFINITIONS[item.candidateId]?.title || item.candidateId,
      shortPurpose: CANDIDATE_DEFINITIONS[item.candidateId]?.shortPurpose || item.family,
    }));
}

function verdictForPercentile(percentile) {
  if (percentile >= 98) return { label: 'sehr guter Kauf', tone: 'good' };
  if (percentile >= 92) return { label: 'guter Kauf', tone: 'good' };
  if (percentile >= 80) return { label: 'interessant', tone: 'warn' };
  if (percentile >= 55) return { label: 'neutral', tone: 'info' };
  if (percentile >= 35) return { label: 'eher nein', tone: 'bad' };
  return { label: 'kein Kauf', tone: 'bad' };
}

function buildRegionalAggregateTop(opinionObjects) {
  const bySymbolBest = new Map();
  for (const asset of opinionObjects) {
    const strongOpinions = (asset.expertOpinions || [])
      .filter((item) => Number(item.percentile || 0) >= 92)
      .sort((a, b) => b.percentile - a.percentile);
    if (!strongOpinions.length || !asset.continentKey) continue;
    const topOpinions = strongOpinions.slice(0, 4);
    const avgPercentile = round(
      topOpinions.reduce((sum, item) => sum + Number(item.percentile || 0), 0) / Math.max(topOpinions.length, 1),
      2,
    );
    const candidate = {
      assetId: asset.assetId,
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      continentKey: asset.continentKey,
      continentLabel: asset.continentLabel,
      mentions: strongOpinions.length,
      experts: topOpinions.map((item) => item.candidateId),
      avgPercentile,
      reasons: topOpinions.slice(0, 3).map((item) => `${item.title || item.candidateId}: ${item.reason}`),
      overallVerdict: strongOpinions.length >= 4 ? 'starker Kontinent-Kandidat' : strongOpinions.length >= 2 ? 'klarer Kaufkandidat' : 'solider Kaufkandidat',
    };
    const symbolKey = String(candidate.symbol || candidate.assetId || '');
    const current = bySymbolBest.get(symbolKey);
    if (!current || candidate.mentions > current.mentions || (candidate.mentions === current.mentions && candidate.avgPercentile > current.avgPercentile)) {
      bySymbolBest.set(symbolKey, candidate);
    }
  }
  const rows = [...bySymbolBest.values()]
    .sort((a, b) => (b.mentions - a.mentions) || (b.avgPercentile - a.avgPercentile));
  return Object.fromEntries(
    CONTINENT_ORDER.map((continentKey) => [
      continentKey,
      {
        continentKey,
        continentLabel: continentLabelForKey(continentKey),
        top10: rows
          .filter((item) => item.continentKey === continentKey)
          .slice(0, 10),
      },
    ]),
  );
}

function buildMarketData({ quantRoot, repoRoot, familyTemplates, statsMap, latestRegistry, generatedAt }) {
  const featureSlice = locateLatestFeatureSlice(quantRoot);
  const scoredRows = loadScoredRows(featureSlice);
  const scoredAssetSet = new Set(scoredRows.map((item) => String(item.asset_id || '')));
  const browseMaps = buildBrowseMaps(repoRoot, scoredAssetSet);
  const selectedExperts = selectDashboardExperts(familyTemplates, statsMap, latestRegistry);
  const assetOpinions = new Map();
  const expertTop10 = [];

  for (const row of scoredRows) {
    const registry = browseMaps.byCanonicalId.get(String(row.asset_id || '')) || null;
    assetOpinions.set(String(row.asset_id || ''), {
      assetId: String(row.asset_id || ''),
      canonicalId: String(row.asset_id || ''),
      symbol: String(row.symbol || ''),
      assetClass: registry?.assetClass || String(row.asset_class || 'stock').toLowerCase(),
      name: registry?.name || String(row.symbol || ''),
      exchange: registry?.exchange || '',
      continentKey: registry?.continentKey || continentKeyForExchange(registry?.exchange, String(row.asset_id || '')),
      continentLabel: registry?.continentLabel || continentLabelForKey(continentKeyForExchange(registry?.exchange, String(row.asset_id || ''))),
      status: registry?.status || '',
      lastTradeDate: registry?.lastTradeDate || String(row.asof_date || ''),
      scoredToday: true,
      metrics: {
        closeRaw: Number(row.close_raw || 0),
        ret5d: Number(row.ret_5d || 0),
        ret20d: Number(row.ret_20d || 0),
        macdHist: Number(row.macd_hist || 0),
        rsi14: Number(row.rsi_14 || 0),
        bollZ20: Number(row.boll_z_20 || 0),
        trendGate: Number(row.trend_gate || 0),
        adv20Dollar: Number(row.adv20_dollar || 0),
      },
      expertOpinions: [],
    });
  }

  for (const expert of selectedExperts) {
    const def = CANDIDATE_DEFINITIONS[expert.candidateId];
    if (!def) continue;
    const scored = scoredRows
      .map((row) => ({
        assetId: String(row.asset_id || ''),
        score: def.score(row),
        row,
      }))
      .sort((a, b) => b.score - a.score);
    const denominator = Math.max(scored.length - 1, 1);
    for (let index = 0; index < scored.length; index += 1) {
      const item = scored[index];
      const percentile = round((1 - index / denominator) * 100, 2);
      const verdict = verdictForPercentile(percentile);
      const asset = assetOpinions.get(item.assetId);
      if (!asset) continue;
      asset.expertOpinions.push({
        candidateId: expert.candidateId,
        family: expert.family,
        title: expert.title,
        shortPurpose: expert.shortPurpose,
        tier: expert.tier,
        tierLabel: expert.tierLabel,
        score: round(item.score, 6),
        percentile,
        rank: index + 1,
        verdict: verdict.label,
        verdictTone: verdict.tone,
        reason: def.reason(item.row),
      });
    }
    const dedupedTop = [];
    const seenSymbols = new Set();
    for (const item of scored) {
      const asset = assetOpinions.get(item.assetId);
      const symbolKey = String(asset?.symbol || item.assetId || '');
      if (!symbolKey || seenSymbols.has(symbolKey)) continue;
      seenSymbols.add(symbolKey);
      const percentile = round((1 - dedupedTop.length / denominator) * 100, 2);
      dedupedTop.push({
        rank: dedupedTop.length + 1,
        assetId: item.assetId,
        symbol: asset?.symbol || '',
        assetClass: asset?.assetClass || 'stock',
        name: asset?.name || asset?.symbol || '',
        exchange: asset?.exchange || '',
        continentKey: asset?.continentKey || continentKeyForExchange(asset?.exchange, item.assetId),
        continentLabel: asset?.continentLabel || continentLabelForKey(asset?.continentKey || continentKeyForExchange(asset?.exchange, item.assetId)),
        percentile,
        verdict: verdictForPercentile(percentile).label,
        reason: def.reason(item.row),
      });
      if (dedupedTop.length >= 10) break;
    }
    expertTop10.push({
      candidateId: expert.candidateId,
      family: expert.family,
      title: expert.title,
      tier: expert.tier,
      tierLabel: expert.tierLabel,
      shortPurpose: expert.shortPurpose,
      top10: dedupedTop,
    });
  }

  const opinionObjects = [...assetOpinions.values()].map((asset) => {
    asset.expertOpinions.sort((a, b) => b.percentile - a.percentile);
    const buyVotes = asset.expertOpinions.filter((item) => item.percentile >= 92).length;
    const avoidVotes = asset.expertOpinions.filter((item) => item.percentile < 35).length;
    asset.overall = {
      buyVotes,
      avoidVotes,
      strongestExperts: asset.expertOpinions.slice(0, 3).map((item) => item.candidateId),
    };
    return asset;
  });

  const aggregateMap = new Map();
  for (const board of expertTop10) {
    for (const item of board.top10) {
      const current = aggregateMap.get(item.assetId) || {
        assetId: item.assetId,
        symbol: item.symbol,
        assetClass: item.assetClass || 'stock',
        name: item.name,
        exchange: item.exchange,
        continentKey: item.continentKey || continentKeyForExchange(item.exchange, item.assetId),
        continentLabel: item.continentLabel || continentLabelForKey(item.continentKey || continentKeyForExchange(item.exchange, item.assetId)),
        mentions: 0,
        experts: [],
        avgPercentile: 0,
        reasons: [],
      };
      current.mentions += 1;
      current.experts.push(board.candidateId);
      current.avgPercentile += Number(item.percentile || 0);
      if (current.reasons.length < 3) current.reasons.push(`${board.candidateId}: ${item.reason}`);
      aggregateMap.set(item.assetId, current);
    }
  }
  const aggregateRows = [...aggregateMap.values()]
    .map((item) => ({
      ...item,
      avgPercentile: round(item.avgPercentile / Math.max(item.mentions, 1), 2),
      overallVerdict: item.mentions >= 4 ? 'starker Konsens' : item.mentions >= 2 ? 'mehrfach bestaetigt' : 'einzelne Expertenchance',
    }))
    .sort((a, b) => (b.mentions - a.mentions) || (b.avgPercentile - a.avgPercentile));
  const aggregateTop10 = aggregateRows.slice(0, 20);
  const aggregateTopByContinent = buildRegionalAggregateTop(opinionObjects);

  return {
    schema: 'rv_quantlab_v4_daily_market_v1',
    generatedAt,
    featureSlice,
    summary: {
      searchUniverseSymbolsTotal: browseMaps.searchIndex.length,
      scoredTodayAssetsTotal: opinionObjects.length,
      selectedExpertsTotal: selectedExperts.length,
    },
    selectedExperts,
    searchIndex: browseMaps.searchIndex,
    assetOpinions: Object.fromEntries(opinionObjects.map((item) => [item.assetId, item])),
    expertTop10,
    aggregateTop10,
    aggregateTopByContinent,
    defaultAssetId: aggregateTop10[0]?.assetId || opinionObjects[0]?.assetId || null,
    sources: {
      registryBrowse: browseMaps.browsePath,
      featureSlice: featureSlice?.parquetPath || null,
    },
  };
}

export function buildExpertLayer({
  quantRoot,
  repoRoot,
  stagebReports,
  registryReports,
  latestRegistry,
  focus,
  overnightManifest,
  fullchunkManifest,
  generatedAt,
}) {
  const familyTemplates = getFamilyTemplates();
  const statsMap = buildStatsFromArtifacts({
    familyTemplates,
    stagebReports,
    registryReports,
    focus,
  });
  const marketData = buildMarketData({
    quantRoot,
    repoRoot,
    familyTemplates,
    statsMap,
    latestRegistry,
    generatedAt,
  });
  const agentReadiness = buildAgentReadiness({
    familyTemplates,
    statsMap,
    latestRegistry,
    focus,
    overnightManifest,
    fullchunkManifest,
    universeSymbolsTotal: Number(marketData.summary.searchUniverseSymbolsTotal || 0),
    scoredTodayAssetsTotal: Number(marketData.summary.scoredTodayAssetsTotal || 0),
    trendPoints: buildDailyTierTrend({
      familyTemplates,
      stagebReports,
      registryReports,
    }),
  });
  agentReadiness.marketCoverage = {
    universeSymbolsTotal: marketData.summary.searchUniverseSymbolsTotal,
    scoredTodayAssetsTotal: marketData.summary.scoredTodayAssetsTotal,
    selectedExpertsTotal: marketData.summary.selectedExpertsTotal,
  };
  return {
    agentReadiness,
    marketData,
  };
}
