#!/usr/bin/env node
import { parseArgs, runLayer } from './_lib/audit-core.mjs';
const doc = await runLayer('06-threshold-lint', parseArgs());
console.log(JSON.stringify({ status: doc.status, counts: doc.counts }, null, 2));
