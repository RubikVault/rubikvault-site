#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const OUT_DIR = path.join(ROOT, "reports", "v3", "forensics");

const PATH_REGEX = /public\/data(?:\/[A-Za-z0-9._-]+)*/g;
const SCRIPT_CMD_REGEX = /(?:^|\s)(?:node|bash|sh)\s+(scripts\/[A-Za-z0-9._\/-]+)/g;
const WRITE_HINT_REGEX = /(writeJson|writeManifest|writeGzip|writeNdjson|writeFile|appendFile|rsync|cp\s|mv\s|rename\()/;

async function readDirRecursive(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readDirRecursive(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function uniqSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function extractPathsFromLine(line) {
  const matches = line.match(PATH_REGEX) || [];
  return uniqSorted(matches);
}

function extractWritePaths(content) {
  const lines = content.split(/\r?\n/);
  const found = [];
  for (const line of lines) {
    if (!WRITE_HINT_REGEX.test(line)) continue;
    found.push(...extractPathsFromLine(line));
  }
  return uniqSorted(found);
}

function extractInvokedScripts(line) {
  const scripts = [];
  for (const match of line.matchAll(SCRIPT_CMD_REGEX)) {
    scripts.push(match[1]);
  }
  return scripts;
}

function addPathProducer(map, dataPath, producer) {
  if (!map.has(dataPath)) {
    map.set(dataPath, []);
  }
  map.get(dataPath).push(producer);
}

function isConcreteArtifactPath(dataPath) {
  if (!dataPath.startsWith("public/data/v3/")) return false;
  if (dataPath.endsWith("-")) return false;
  const base = dataPath.split("/").pop() || "";
  return (
    base.endsWith(".json") ||
    base.endsWith(".ndjson") ||
    base.endsWith(".ndjson.gz") ||
    base.endsWith(".gz")
  );
}

function canonicalProducerKey(producer) {
  return `${producer.kind}:${producer.file}:${producer.line ?? 0}`;
}

async function build() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const workflowFiles = (await fs.readdir(WORKFLOW_DIR))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => path.join(WORKFLOW_DIR, f))
    .sort((a, b) => a.localeCompare(b));

  const scriptFiles = (await readDirRecursive(SCRIPTS_DIR))
    .filter((f) => /\.(mjs|js|sh|zsh|ts)$/.test(f))
    .sort((a, b) => a.localeCompare(b));

  const scriptWrites = new Map();
  for (const scriptFile of scriptFiles) {
    const content = await fs.readFile(scriptFile, "utf8");
    const writes = extractWritePaths(content);
    if (writes.length > 0) {
      scriptWrites.set(rel(scriptFile), writes);
    }
  }

  const workflowToScripts = new Map();
  const workflowInlinePaths = new Map();
  for (const workflowFile of workflowFiles) {
    const content = await fs.readFile(workflowFile, "utf8");
    const lines = content.split(/\r?\n/);
    const invoked = [];
    const inlinePaths = [];

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const scripts = extractInvokedScripts(line);
      for (const scriptPath of scripts) {
        invoked.push({ script: scriptPath, line: lineNo });
      }
      const paths = WRITE_HINT_REGEX.test(line) ? extractPathsFromLine(line) : [];
      for (const dataPath of paths) {
        inlinePaths.push({ path: dataPath, line: lineNo });
      }
    });

    if (invoked.length > 0) workflowToScripts.set(rel(workflowFile), invoked);
    if (inlinePaths.length > 0) workflowInlinePaths.set(rel(workflowFile), inlinePaths);
  }

  const pathToProducers = new Map();

  for (const [scriptFile, writes] of scriptWrites.entries()) {
    for (const dataPath of writes) {
      addPathProducer(pathToProducers, dataPath, {
        kind: "script",
        file: scriptFile,
      });
    }
  }

  for (const [workflowFile, inlinePaths] of workflowInlinePaths.entries()) {
    for (const item of inlinePaths) {
      addPathProducer(pathToProducers, item.path, {
        kind: "workflow-inline",
        file: workflowFile,
        line: item.line,
      });
    }
  }

  for (const [workflowFile, invoked] of workflowToScripts.entries()) {
    for (const call of invoked) {
      const writes = scriptWrites.get(call.script) || [];
      for (const dataPath of writes) {
        addPathProducer(pathToProducers, dataPath, {
          kind: "workflow-script",
          file: workflowFile,
          line: call.line,
          script: call.script,
        });
      }
    }
  }

  const pathToProducersObj = {};
  const publishPaths = [];

  for (const dataPath of uniqSorted(Array.from(pathToProducers.keys()))) {
    const rawProducers = pathToProducers.get(dataPath) || [];
    const dedup = new Map();
    for (const producer of rawProducers) {
      dedup.set(canonicalProducerKey(producer), producer);
    }
    const producers = Array.from(dedup.values()).sort((a, b) => {
      const ak = canonicalProducerKey(a);
      const bk = canonicalProducerKey(b);
      return ak.localeCompare(bk);
    });

    pathToProducersObj[dataPath] = producers;
    publishPaths.push({
      path: dataPath,
      producerCount: producers.length,
      producers,
    });
  }

  const v3Collisions = publishPaths
    .filter((entry) => isConcreteArtifactPath(entry.path))
    .map((entry) => {
      const workflowScript = entry.producers.filter((p) => p.kind === "workflow-script");
      const workflowInline = entry.producers.filter((p) => p.kind === "workflow-inline");
      const scriptOnly = entry.producers.filter((p) => p.kind === "script");

      let effective = [];
      if (workflowScript.length > 0) {
        const uniq = new Map();
        for (const p of workflowScript) {
          uniq.set(`${p.file}:${p.script || ""}`, p);
        }
        effective = Array.from(uniq.values());
      } else if (scriptOnly.length > 0) {
        const uniq = new Map();
        for (const p of scriptOnly) {
          uniq.set(p.file, p);
        }
        effective = Array.from(uniq.values());
      }

      if (workflowInline.length > 0) {
        const uniqInline = new Map();
        for (const p of workflowInline) {
          uniqInline.set(`${p.file}:${p.line || 0}`, p);
        }
        effective.push(...Array.from(uniqInline.values()));
      }

      return {
        path: entry.path,
        effectiveProducers: effective,
      };
    })
    .filter((entry) => entry.effectiveProducers.length > 1)
    .map((entry) => ({
      path: entry.path,
      producerCount: entry.effectiveProducers.length,
      producers: entry.effectiveProducers,
    }));

  const now = new Date().toISOString();

  const producersMapDoc = {
    generatedAt: now,
    workflowScripts: Object.fromEntries(
      Array.from(workflowToScripts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([wf, inv]) => [wf, inv.sort((a, b) => a.line - b.line)]),
    ),
    workflowInlinePublicDataRefs: Object.fromEntries(
      Array.from(workflowInlinePaths.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([wf, refs]) => [wf, refs.sort((a, b) => a.line - b.line)]),
    ),
    scriptWrites: Object.fromEntries(
      Array.from(scriptWrites.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    ),
    pathToProducers: pathToProducersObj,
  };

  const publishPathsDoc = {
    generatedAt: now,
    totalPaths: publishPaths.length,
    paths: publishPaths,
  };

  const collisionsDoc = {
    generatedAt: now,
    namespace: "public/data/v3/**",
    collisions: v3Collisions,
  };

  await fs.writeFile(
    path.join(OUT_DIR, "producers-map.json"),
    `${JSON.stringify(producersMapDoc, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "publish-paths.json"),
    `${JSON.stringify(publishPathsDoc, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(OUT_DIR, "collisions.json"),
    `${JSON.stringify(collisionsDoc, null, 2)}\n`,
    "utf8",
  );

  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/producers-map.json`);
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/publish-paths.json`);
  console.log(`Wrote ${path.relative(ROOT, OUT_DIR)}/collisions.json`);
  console.log(`v3 collisions: ${v3Collisions.length}`);
}

build().catch((error) => {
  console.error("build-v3-forensics failed:", error.message);
  process.exitCode = 1;
});
