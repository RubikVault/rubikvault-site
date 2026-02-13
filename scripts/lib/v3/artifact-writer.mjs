import fs from "node:fs/promises";
import path from "node:path";
import { stableStringify, writeJsonAtomic, writeNdjsonAtomic } from "./stable-io.mjs";
import { sha256File, sha256Text, writeGzipAtomic } from "./gzip-deterministic.mjs";

async function fileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

export async function writeJsonArtifact(rootDir, relPath, doc) {
  const absPath = path.join(rootDir, relPath);
  await writeJsonAtomic(absPath, doc);
  return {
    path: relPath,
    sha256: await sha256File(absPath),
    bytes: await fileSize(absPath)
  };
}

export async function writeNdjsonArtifact(rootDir, relPath, rows) {
  const absPath = path.join(rootDir, relPath);
  await writeNdjsonAtomic(absPath, rows);
  return {
    path: relPath,
    sha256: await sha256File(absPath),
    bytes: await fileSize(absPath)
  };
}

export async function writeGzipJsonArtifact(rootDir, relPath, doc) {
  const absPath = path.join(rootDir, relPath);
  const body = Buffer.from(stableStringify(doc), "utf8");
  const { bytes, sha256 } = await writeGzipAtomic(absPath, body);
  return {
    path: relPath,
    sha256,
    bytes
  };
}

export async function writeGzipNdjsonArtifact(rootDir, relPath, rows) {
  const absPath = path.join(rootDir, relPath);
  const body = Buffer.from(rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const { bytes, sha256 } = await writeGzipAtomic(absPath, body);
  return {
    path: relPath,
    sha256,
    bytes
  };
}

export function createManifest({ schema, runContext, quality = {}, lineage = {}, artifacts = [] }) {
  return {
    meta: {
      schema,
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      policy_commit: runContext.policyCommit,
      quality,
      lineage
    },
    artifacts
  };
}

export async function writeManifest(rootDir, relPath, manifestDoc) {
  const artifact = await writeJsonArtifact(rootDir, relPath, manifestDoc);
  return artifact;
}

export async function enforceBuildLimits(rootDir, relDir, buildPolicy) {
  const absDir = path.join(rootDir, relDir);
  let entries;
  try {
    entries = await fs.readdir(absDir);
  } catch {
    return;
  }

  const maxFiles = Number(buildPolicy?.limits?.max_file_count_per_publish_folder || 5000);
  if (entries.length > maxFiles) {
    throw new Error(`BUILD_LIMIT_EXCEEDED:file_count>${maxFiles} in ${relDir}`);
  }

  const maxBytes = Number(buildPolicy?.limits?.max_artifact_size_bytes || 52428800);
  for (const name of entries) {
    const absFile = path.join(absDir, name);
    const stat = await fs.stat(absFile);
    if (stat.isFile() && stat.size > maxBytes) {
      throw new Error(`BUILD_LIMIT_EXCEEDED:file_size>${maxBytes} for ${path.join(relDir, name)}`);
    }
  }
}

export function hashObject(doc) {
  return sha256Text(stableStringify(doc));
}
