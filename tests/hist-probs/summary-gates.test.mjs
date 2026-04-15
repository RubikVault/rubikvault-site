import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');

describe('hist-probs summary gates', () => {
  it('keeps zero coverage as a blocking system-status condition', () => {
    const systemPath = path.join(ROOT, 'public/data/reports/system-status-latest.json');
    const doc = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
    const zeroCoverage = doc?.steps?.hist_probs?.status_detail?.coverage?.zero_coverage_guard === true;
    if (!zeroCoverage) return;
    assert.equal(doc?.summary?.blocking_severity, 'critical');
    assert.equal(doc?.summary?.coverage_ready, false);
  });
});
