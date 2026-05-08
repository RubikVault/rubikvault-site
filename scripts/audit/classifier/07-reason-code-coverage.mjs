#!/usr/bin/env node
import { parseArgs, runLayer } from './_lib/audit-core.mjs';
const doc = await runLayer('07-reason-code-coverage', parseArgs());
console.log(JSON.stringify({ status: doc.status, counts: doc.counts }, null, 2));
