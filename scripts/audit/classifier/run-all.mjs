#!/usr/bin/env node
import { parseArgs, runAll } from './_lib/audit-core.mjs';
const { summary } = await runAll(parseArgs());
console.log(JSON.stringify({ status: summary.status, tier1: summary.tier1, output_dir: summary.output_dir }, null, 2));
