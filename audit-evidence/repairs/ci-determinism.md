=== DIAGNOSIS: ci-determinism ===

## Workflow File
.github/workflows/ci-determinism.yml

## Script Paths
No scripts found

## Node Version
          node-version: '20'

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
concurrency:
  group: forecast-determinism-${{ github.ref }}
  cancel-in-progress: true

env:

## Recent Failure
determinism-check	Run Determinism Tests	2026-02-08T22:33:03.8310502Z # fail 0
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6319305Z     params: { missingProperty: 'generated_at' },
determinism-check	Validate Registry Schema	2026-02-08T22:33:04.6535583Z ##[error]Process completed with exit code 1.
