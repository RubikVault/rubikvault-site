#!/usr/bin/env node
import fs from 'node:fs/promises';

async function main() {
  const webhook = process.env.RV_ALERT_WEBHOOK || '';
  if (!webhook) {
    throw new Error('MISSING_SECRET:RV_ALERT_WEBHOOK');
  }

  const [reason = 'unknown', dp = 'unknown'] = process.argv.slice(2);
  const health = JSON.parse(await fs.readFile('public/data/v3/system/health.json', 'utf8'));

  const payload = {
    text: `RubikVault v3 alert: ${reason}`,
    run_id: health?.meta?.run_id || process.env.GITHUB_RUN_ID || null,
    dp,
    reason,
    health_url: process.env.RV_HEALTH_URL || '/data/v3/system/health.json',
    run_url: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null
  };

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ALERT_WEBHOOK_FAILED:${res.status}:${body.slice(0, 200)}`);
  }

  console.log('V3_ALERT_SENT');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
