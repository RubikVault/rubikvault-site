# Tooling Gaps

## Missing Tools
- `madge` - Not installed. Using fallback grep/rg for import graph.
- `tree` - May not be available. Using `find` fallback.

## Available Tools
- `rg` (ripgrep) - Available
- `jq` - Available
- `node` - Available
- `git` - Available
- `find` - Available

## Workarounds
- Import graph: Collected via `rg --json` on import/require patterns
- File tree: Using `find` with depth limits
