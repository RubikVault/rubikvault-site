#!/usr/bin/env node
import { parseArgs, runLayer } from './_lib/audit-core.mjs';
const doc = await runLayer('08-canbuy-gate-cliff', parseArgs());
console.log(JSON.stringify({ status: doc.status, counts: doc.counts }, null, 2));
