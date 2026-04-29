#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_INPUT_DIR = path.join(ROOT, 'public/data/hist-probs');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'public/data/hist-probs-public');

function parseArgs(argv) {
  const options = {
    inputDir: process.env.RV_HIST_PROBS_INPUT_DIR || DEFAULT_INPUT_DIR,
    outputDir: process.env.RV_HIST_PROBS_PUBLIC_DIR || DEFAULT_OUTPUT_DIR,
    shardCount: Math.max(1, Number(process.env.RV_HIST_PROBS_PUBLIC_SHARDS || 256)),
    maxEvents: Math.max(1, Number(process.env.RV_HIST_PROBS_PUBLIC_MAX_EVENTS || 12)),
    maxProfiles: Math.max(0, Number(process.env.RV_HIST_PROBS_PUBLIC_MAX_PROFILES || 0)),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--input-dir' && next) {
      options.inputDir = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--input-dir=')) {
      options.inputDir = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--output-dir' && next) {
      options.outputDir = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg.startsWith('--shards=')) {
      options.shardCount = Math.max(1, Number(arg.split('=')[1]) || options.shardCount);
    } else if (arg.startsWith('--max-events=')) {
      options.maxEvents = Math.max(1, Number(arg.split('=')[1]) || options.maxEvents);
    } else if (arg.startsWith('--max-profiles=')) {
      options.maxProfiles = Math.max(0, Number(arg.split('=')[1]) || 0);
    }
  }
  return options;
}

function shardIndex(key, count) {
  const hash = createHash('sha256').update(String(key || '').toUpperCase()).digest();
  return hash.readUInt32BE(0) % count;
}

function shardName(index) {
  return `${String(index).padStart(3, '0')}.json`;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(doc)}\n`, 'utf8');
}

function compactHorizon(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['n', 'win_rate', 'avg_return', 'mae', 'mfe', 'max_drawdown']) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) out[key] = Number(number.toFixed(key === 'n' ? 0 : 6));
  }
  return Object.keys(out).length ? out : null;
}

function eventScore(event) {
  if (!event || typeof event !== 'object') return 0;
  return Number(event.h20d?.n || 0) * 4
    + Number(event.h60d?.n || 0) * 2
    + Number(event.h5d?.n || 0)
    + Number(event.h120d?.n || 0);
}

function compactProfile(doc, tickerFromFile, maxEvents) {
  const ticker = String(doc?.ticker || tickerFromFile || '').trim().toUpperCase();
  if (!ticker || !doc?.events || typeof doc.events !== 'object') return null;
  const events = {};
  const selected = Object.entries(doc.events)
    .filter(([, value]) => value && typeof value === 'object')
    .sort((left, right) => eventScore(right[1]) - eventScore(left[1]))
    .slice(0, maxEvents);
  for (const [eventName, eventValue] of selected) {
    const compact = {};
    for (const horizon of ['h5d', 'h20d', 'h60d', 'h120d']) {
      const horizonValue = compactHorizon(eventValue[horizon]);
      if (horizonValue) compact[horizon] = horizonValue;
    }
    if (Object.keys(compact).length) events[eventName] = compact;
  }
  if (!Object.keys(events).length) return null;
  return {
    ticker,
    latest_date: doc.latest_date || doc.as_of || null,
    computed_at: doc.computed_at || null,
    bars_count: Number.isFinite(Number(doc.bars_count)) ? Number(doc.bars_count) : null,
    events,
    source: 'hist_probs_public_projection',
  };
}

function listProfileFiles(inputDir) {
  if (!fs.existsSync(inputDir)) return [];
  const files = [];
  const stack = [inputDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const base = path.basename(entry.name, '.json').toLowerCase();
        if (!['run-summary', 'status-summary', 'regime-daily'].includes(base)) files.push(full);
      }
    }
  }
  return files;
}

function main() {
  const options = parseArgs(process.argv);
  const generatedAt = new Date().toISOString();
  const files = listProfileFiles(options.inputDir);
  const shards = Array.from({ length: options.shardCount }, () => ({}));
  let read = 0;
  let written = 0;
  let skipped = 0;
  for (const filePath of files) {
    if (options.maxProfiles > 0 && written >= options.maxProfiles) break;
    read += 1;
    const doc = readJson(filePath);
    const ticker = path.basename(filePath, '.json');
    const compact = compactProfile(doc, ticker, options.maxEvents);
    if (!compact) {
      skipped += 1;
      continue;
    }
    const index = shardIndex(compact.ticker, options.shardCount);
    shards[index][compact.ticker] = compact;
    written += 1;
  }

  fs.rmSync(options.outputDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(options.outputDir, 'shards'), { recursive: true });
  const shardStats = [];
  for (let i = 0; i < shards.length; i += 1) {
    const rel = `shards/${shardName(i)}`;
    const full = path.join(options.outputDir, rel);
    writeJson(full, shards[i]);
    shardStats.push({ shard: rel, rows: Object.keys(shards[i]).length, bytes: fs.statSync(full).size });
  }
  const latest = {
    schema: 'rv.hist_probs_public_latest.v1',
    generated_at: generatedAt,
    shard_count: options.shardCount,
    max_events_per_profile: options.maxEvents,
    profile_count: written,
    skipped_count: skipped,
    source: 'public/data/hist-probs',
    shards_path: 'shards',
  };
  writeJson(path.join(options.outputDir, 'latest.json'), latest);
  writeJson(path.join(options.outputDir, 'manifest.json'), {
    schema: 'rv.hist_probs_public_manifest.v1',
    generated_at: generatedAt,
    input_files_read: read,
    ...latest,
    shard_stats: shardStats,
  });
  console.log(JSON.stringify({
    ok: true,
    output: path.relative(ROOT, options.outputDir),
    profiles: written,
    skipped,
    shards: options.shardCount,
    max_shard_bytes: Math.max(0, ...shardStats.map((item) => item.bytes)),
  }));
}

main();
