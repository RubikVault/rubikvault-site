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

TREE_PUBLIC_MAXDEPTH3_FILES:
{{tree_public_files}}

TREE_SCRIPTS_MAXDEPTH4_FILES:
{{tree_scripts_files}}

PACKAGE_JSON_PRESENT: {{package_json_present}}
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

const pwd = process.cwd();
const gitTop = run("git rev-parse --show-toplevel", { allowFail: true });
ensureRepo(gitTop);
ensureNodeVersion();

const root = gitTop || pwd;
const mirrorsDir = path.join(root, "public", "mirrors");
ensureExists(mirrorsDir, "Repo has no public/mirrors; audit can't run");
ensureExists(path.join(root, "package.json"), "STOP: package.json missing");

const mirrorFiles = fs
  .readdirSync(mirrorsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => `public/mirrors/${f}`);

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
  tree_public_files: run("find public -maxdepth 3 -type f -print || true", { allowFail: true }) || "n/a",
  tree_scripts_files: run("find scripts -maxdepth 4 -type f -print || true", { allowFail: true }) || "n/a",
  package_json_present: yesNo(fs.existsSync(path.join(root, "package.json")))
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
