import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const TEMPLATE = `Audit Reality Snapshot

REPO_ROOT: {{pwd}}
TOPLEVEL: {{git_toplevel}}
BRANCH: {{git_branch}}
GIT_SHA: {{git_sha}}
GIT_STATUS_PORCELAIN:
{{git_status}}

NODE_VERSION: {{node_version}}
NPM_VERSION: {{npm_version}}

MIRRORS_DIR_EXISTS: {{mirrors_exists}}
MIRRORS_DIR: {{mirrors_dir}}

MIRROR_FILES:
{{mirror_files}}

FEATURES_DIR_EXISTS: {{features_exists}}
SCRIPTS_DIR_EXISTS: {{scripts_exists}}
FUNCTIONS_DIR_EXISTS: {{functions_exists}}

HTML_FEATURE_COUNT: {{html_feature_count}}
HTML_FEATURE_SAMPLE:
{{html_feature_sample}}

MIRROR_FEATURE_COUNT: {{mirror_feature_count}}
MIRROR_FEATURE_SAMPLE:
{{mirror_feature_sample}}

DRIFT_HTML_NOT_IN_MIRRORS:
{{drift_html_missing}}

DRIFT_MIRRORS_NOT_IN_HTML:
{{drift_mirror_missing}}

TREE_PUBLIC_MAXDEPTH3_FILES:
{{tree_public_files}}

TREE_SCRIPTS_MAXDEPTH4_FILES:
{{tree_scripts_files}}

PACKAGE_JSON_PRESENT: {{package_json_present}}

ISSUES DETECTED:
{{issues_detected}}
`;

function run(cmd, { allowFail = false } = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (allowFail) {
      const msg = String(error?.stdout || error?.stderr || error?.message || "").trim();
      return msg || "ERROR";
    }
    throw error;
  }
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function ensureRepo(root) {
  if (!root) {
    console.error("STOP: not a git repo");
    process.exit(1);
  }
}

function ensureNodeVersion() {
  const major = Number((process.versions.node || "0").split(".")[0]);
  if (Number.isNaN(major) || major < 20) {
    console.error("STOP: Node < 20");
    process.exit(1);
  }
}

function ensureExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    console.error(message);
    process.exit(1);
  }
}

function extractHtmlFeatures(rootDir) {
  const htmlPaths = [
    path.join(rootDir, "public", "index.html"),
    path.join(rootDir, "index.html")
  ];
  const htmlPath = htmlPaths.find((candidate) => fs.existsSync(candidate));
  if (!htmlPath) return [];
  const html = fs.readFileSync(htmlPath, "utf8");
  const regex = /data-rv-feature="([^"]+)"/g;
  const found = new Set();
  let match;
  while ((match = regex.exec(html))) {
    const raw = match[1];
    if (raw) found.add(raw.trim());
  }
  return [...found];
}

function extractMirrorFeatures(mirrorsDir) {
  if (!fs.existsSync(mirrorsDir)) return [];
  return fs
    .readdirSync(mirrorsDir)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !["manifest.json", "_health.json"].includes(f))
    .map((f) => f.replace(/\.json$/, ""));
}

function formatIssue(severity, message) {
  return `- [${severity}] ${message}`;
}

const pwd = process.cwd();
const gitTop = run("git rev-parse --show-toplevel", { allowFail: true });
ensureRepo(gitTop);
ensureNodeVersion();

const root = gitTop || pwd;
const mirrorsDir = path.join(root, "public", "data", "snapshots");
ensureExists(mirrorsDir, "Repo has no public/data/snapshots; audit can't run");
ensureExists(path.join(root, "package.json"), "STOP: package.json missing");

const mirrorFilesAll = fs
  .readdirSync(mirrorsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => `public/data/snapshots/${f}`);
const mirrorFiles = mirrorFilesAll.slice(0, 10);
const htmlFeatures = extractHtmlFeatures(root);
const mirrorFeatures = extractMirrorFeatures(mirrorsDir);
const htmlMissing = htmlFeatures.filter((id) => !mirrorFeatures.includes(id));
const mirrorMissing = mirrorFeatures.filter((id) => !htmlFeatures.includes(id));
const issues = [];

if (!fs.existsSync(path.join(root, "public", "data", "feature-registry.v1.json"))) {
  issues.push(formatIssue("WARN", "feature-registry.v1.json missing (registry-first audit will fall back to discovery)"));
}
if (htmlMissing.length) {
  issues.push(
    formatIssue(
      "WARN",
      `HTML features missing snapshots: count=${htmlMissing.length} sample=${htmlMissing.slice(0, 10).join(", ")}`
    )
  );
}
if (mirrorMissing.length) {
  issues.push(
    formatIssue(
      "WARN",
      `Snapshots not in HTML: count=${mirrorMissing.length} sample=${mirrorMissing.slice(0, 10).join(", ")}`
    )
  );
}
if (!issues.length) {
  issues.push(formatIssue("INFO", "none"));
}

const data = {
  pwd: run("pwd", { allowFail: true }),
  git_toplevel: gitTop,
  git_branch: run("git branch --show-current", { allowFail: true }),
  git_sha: run("git log -1 --format=%H", { allowFail: true }),
  git_status: run("git status --porcelain", { allowFail: true }),
  node_version: run("node --version", { allowFail: true }),
  npm_version: run("npm --version", { allowFail: true }) || "missing",
  mirrors_exists: yesNo(fs.existsSync(mirrorsDir)),
  mirrors_dir: fs.existsSync(mirrorsDir) ? mirrorsDir : "n/a",
  mirror_files: mirrorFiles.length ? mirrorFiles.join("\n") : "none",
  features_exists: yesNo(fs.existsSync(path.join(root, "features"))),
  scripts_exists: yesNo(fs.existsSync(path.join(root, "scripts"))),
  functions_exists: yesNo(fs.existsSync(path.join(root, "functions"))),
  html_feature_count: htmlFeatures.length,
  html_feature_sample: htmlFeatures.length ? htmlFeatures.slice(0, 20).join("\n") : "none",
  mirror_feature_count: mirrorFeatures.length,
  mirror_feature_sample: mirrorFeatures.length ? mirrorFeatures.slice(0, 20).join("\n") : "none",
  drift_html_missing: htmlMissing.length ? htmlMissing.slice(0, 20).join("\n") : "none",
  drift_mirror_missing: mirrorMissing.length ? mirrorMissing.slice(0, 20).join("\n") : "none",
  tree_public_files: run("find public -maxdepth 3 -type f -print || true", { allowFail: true }) || "n/a",
  tree_scripts_files: run("find scripts -maxdepth 4 -type f -print || true", { allowFail: true }) || "n/a",
  package_json_present: yesNo(fs.existsSync(path.join(root, "package.json"))),
  issues_detected: issues.join("\n")
};

let output = TEMPLATE;
Object.entries(data).forEach(([key, value]) => {
  const safe = value === "" ? "" : String(value);
  output = output.replace(new RegExp(`{{${key}}}`, "g"), safe);
});

const outDir = path.join(root, "scripts", "audit");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "REALITY.md"), output);
console.log("Wrote scripts/audit/REALITY.md");
