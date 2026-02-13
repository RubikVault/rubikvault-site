=== DIAGNOSIS: e2e-playwright ===

## Workflow File
.github/workflows/e2e-playwright.yml

## Script Paths
No scripts found

## Node Version
          node-version: '20'

## Permissions
Default (read-only)

## Secrets Used
None

## Concurrency
❌ NOT SET

## Recent Failure
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7254139Z     Error: [2mexpect([22m[31mlocator[39m[2m).[22mtoHaveAttribute[2m([22m[32mexpected[39m[2m)[22m failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7257145Z     Error: element(s) not found
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7262573Z        8 |   await expect(bridge).toHaveAttribute('data-baseline', /ok|pending|fail/);
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7265935Z     Error Context: test-results/ops-ops-render-stamp-goes-ok/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7267809Z     Error: page.waitForResponse: Test timeout of 20000ms exceeded.
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7271782Z     Error Context: test-results/ops-ops-truth-chain-sections-render/error-context.md
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7272200Z   2 failed
ops-e2e	UNKNOWN STEP	2026-02-09T14:48:54.7490702Z ##[error]Process completed with exit code 1.
