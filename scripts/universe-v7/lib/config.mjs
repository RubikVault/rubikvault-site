import path from 'node:path';
import { REPO_ROOT, readJson } from './common.mjs';

export const DEFAULT_V7_CONFIG = path.join(REPO_ROOT, 'public/data/universe/v7/config/v7.config.json');

export async function loadV7Config(configPath = DEFAULT_V7_CONFIG) {
  const cfg = await readJson(configPath);
  return { configPath, cfg };
}

export function resolvePathMaybe(value) {
  if (!value || typeof value !== 'string') return null;
  if (path.isAbsolute(value)) return value;
  return path.join(REPO_ROOT, value);
}
