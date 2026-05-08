#!/usr/bin/env node
import { parseArgs, runLayer } from './_lib/audit-core.mjs';
const doc = await runLayer('05-coverage-distribution', parseArgs());
console.log(JSON.stringify({ status: doc.status, counts: doc.counts, flags: doc.flags?.length || 0 }, null, 2));
