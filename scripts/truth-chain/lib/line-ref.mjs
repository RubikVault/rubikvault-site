import { readFileSync } from 'node:fs';

export function findLineRefs(filePath, pattern, { context = 0, limit = 5 } = {}) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (regex.test(lines[i])) {
      const start = Math.max(0, i - context);
      const end = Math.min(lines.length, i + context + 1);
      const snippet = lines.slice(start, end).join('\n');
      matches.push({
        line: i + 1,
        text: lines[i],
        snippet
      });
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

export function firstLineRef(filePath, pattern) {
  const matches = findLineRefs(filePath, pattern, { context: 0, limit: 1 });
  if (!matches.length) {
    const p = pattern instanceof RegExp ? pattern.toString() : String(pattern);
    throw new Error(`LineRef not found: ${p} in ${filePath}`);
  }
  return matches[0];
}
