#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();
const OUT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/index_symbol_resolution_report.json');
const EXACT_INDEX_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/search/search_exact_by_symbol.json.gz');
const REGISTRY_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');

function nowIso() {
  return new Date().toISOString();
}

function normalizeTicker(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return s || null;
}

async function writeJsonAtomic(absPath, data) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, absPath);
}

async function readJson(absPath) {
  const raw = await fs.readFile(absPath, 'utf8');
  return JSON.parse(raw);
}

function extractSymbols(doc) {
  if (Array.isArray(doc)) {
    return [...new Set(doc
      .map((row) => normalizeTicker(row?.ticker || row?.symbol || row))
      .filter(Boolean))];
  }
  if (Array.isArray(doc?.symbols)) {
    return [...new Set(doc.symbols
      .map((row) => normalizeTicker(row?.ticker || row?.symbol || row))
      .filter(Boolean))];
  }
  return [];
}

async function readGzipJson(absPath) {
  const gz = await fs.readFile(absPath);
  const raw = zlib.gunzipSync(gz).toString('utf8');
  return JSON.parse(raw);
}

async function readRegistryBySymbol() {
  const gz = await fs.readFile(REGISTRY_PATH);
  const text = zlib.gunzipSync(gz).toString('utf8');
  const bySymbol = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const symbol = normalizeTicker(row?.symbol);
    if (!symbol) continue;
    const layer = String(row?.computed?.layer || row?.layer || 'L4_DEAD').toUpperCase();
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push({
      canonical_id: row?.canonical_id || null,
      layer
    });
  }
  return bySymbol;
}

function summarizeSet({ setName, symbols, bySymbolExact, bySymbolRegistry }) {
  const missing = [];
  const falseDead = [];

  for (const symbol of symbols) {
    const selected = bySymbolExact[symbol];
    if (!selected) {
      missing.push(symbol);
      continue;
    }
    const selectedLayer = String(selected?.layer || 'L4_DEAD').toUpperCase();
    if (selectedLayer !== 'L4_DEAD') continue;

    const variants = bySymbolRegistry.get(symbol) || [];
    const hasNonDead = variants.some((row) => String(row?.layer || 'L4_DEAD').toUpperCase() !== 'L4_DEAD');
    if (!hasNonDead) continue;

    const bestAlt = variants.find((row) => String(row?.layer || 'L4_DEAD').toUpperCase() !== 'L4_DEAD') || null;
    falseDead.push({
      symbol,
      selected: {
        canonical_id: selected?.canonical_id || null,
        layer: selectedLayer
      },
      better_variant: bestAlt
    });
  }

  return {
    set: setName,
    total: symbols.length,
    resolved_count: symbols.length - missing.length,
    missing_count: missing.length,
    false_dead_count: falseDead.length,
    missing_examples: missing.slice(0, 25),
    false_dead_examples: falseDead.slice(0, 25)
  };
}

async function main() {
  const [sp500Doc, nasdaq100Doc, dowDoc, exactDoc, registryBySymbol] = await Promise.all([
    readJson(path.join(REPO_ROOT, 'public/data/universe/sp500.json')),
    readJson(path.join(REPO_ROOT, 'public/data/universe/nasdaq100.json')),
    readJson(path.join(REPO_ROOT, 'public/data/universe/dowjones.json')),
    readGzipJson(EXACT_INDEX_PATH),
    readRegistryBySymbol()
  ]);

  const bySymbolExact = exactDoc?.by_symbol && typeof exactDoc.by_symbol === 'object'
    ? exactDoc.by_symbol
    : {};

  const reports = [
    summarizeSet({
      setName: 'sp500',
      symbols: extractSymbols(sp500Doc),
      bySymbolExact,
      bySymbolRegistry: registryBySymbol
    }),
    summarizeSet({
      setName: 'nasdaq100',
      symbols: extractSymbols(nasdaq100Doc),
      bySymbolExact,
      bySymbolRegistry: registryBySymbol
    }),
    summarizeSet({
      setName: 'dowjones',
      symbols: extractSymbols(dowDoc),
      bySymbolExact,
      bySymbolRegistry: registryBySymbol
    })
  ];

  const totals = reports.reduce((acc, item) => {
    acc.total += item.total;
    acc.missing += item.missing_count;
    acc.false_dead += item.false_dead_count;
    return acc;
  }, { total: 0, missing: 0, false_dead: 0 });

  const result = {
    schema: 'rv_v7_index_symbol_resolution_report_v1',
    generated_at: nowIso(),
    status: totals.missing === 0 && totals.false_dead === 0 ? 'PASS' : 'FAIL',
    totals,
    sets: reports
  };

  await writeJsonAtomic(OUT_PATH, result);
  process.stdout.write(`${JSON.stringify({ ok: result.status === 'PASS', out: path.relative(REPO_ROOT, OUT_PATH), totals })}\n`);

  if (result.status !== 'PASS') process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(err?.message || err) })}\n`);
  process.exit(1);
});

