You are Codex. Work in repo RubikVault/rubikvault-site on branch fix/seeder-missing-secret-debug.

Problem:
Some snapshots are written with meta.reason="MISSING_SECRET" but meta.ts/meta.generatedAt/meta.dataAt are null and there is no meta.snippet/meta.missingSecrets. This blocks debugging and freshness checks.

Goal (minimal changes):
A) In scripts/seeder.js, in the exact code path where it computes:
   const missingSecrets = listMissingSecrets(entry);
   if (missingSecrets.length) { ... }
ensure the snapshot written in this path ALWAYS includes:
- meta.ts = new Date().toISOString()
- meta.generatedAt = meta.ts
- meta.dataAt = meta.dataAt || meta.ts (fallback)
- meta.snippet = `missing ${missingSecrets.join(",")}`.slice(0,200)
- meta.missingSecrets = missingSecrets
- meta.entryKeys = { id, blockId, featureId, package } (omit undefined)
- meta.registrySource = actual registry source/path if known, else "unknown"

B) Add one log line ONLY if process.env.SEED_DEBUG_ENV === "1":
- registrySource
- entryKeys
- requiredSecrets raw
- per secret presence: {name, present: !!process.env[name], len: (process.env[name]||"").length}
- missingSecrets computed
Never print secret values.

C) Update .github/workflows/seed-package3.yml to add:
  SEED_DEBUG_ENV: "1"
in the job env (temporary debug).

Constraints:
- Touch only scripts/seeder.js and .github/workflows/seed-package3.yml
- No refactors, minimal diff
- No extra logs when SEED_DEBUG_ENV is not set

DoD:
- After running seed-package3 workflow, snapshots like public/data/snapshots/earnings-pressure-lite.json have non-null meta.ts and meta.snippet and meta.missingSecrets.
