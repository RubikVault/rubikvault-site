=== DIAGNOSIS: v3-finalizer ===

## Workflow File
.github/workflows/v3-finalizer.yml

## Script Paths
          node scripts/aggregator/finalize.mjs 2>&1
            node scripts/wp16/guard-market-prices.mjs
✅ EXISTS: scripts/aggregator/finalize.mjs
✅ EXISTS: scripts/wp16/guard-market-prices.mjs

## Node Version
          node-version: "20"

## Permissions
    permissions:
      contents: write
      actions: read
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

## Secrets Used
          token: ${{ secrets.GITHUB_TOKEN }}

## Concurrency
    concurrency:
      group: rv-finalizer
      cancel-in-progress: true
    
    permissions:

## Recent Failure
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526415Z ##[group]Run set +e  # Disable exit on error for this step
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5526908Z [36;1mset +e  # Disable exit on error for this step[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736537Z [36;1m  echo "❌ ERROR: Finalizer failed with exit code $FINALIZER_EXIT"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.5736967Z [36;1m  echo "Check the logs above for detailed error information"[0m
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6251148Z ERROR: Failed to load registry: ENOENT: no such file or directory, open '/home/runner/work/rubikvault-site/rubikvault-site/public/data/registry/modules.json'
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6304870Z ##[error]Process completed with exit code 1.
finalize	UNKNOWN STEP	2026-02-09T23:06:00.6370883Z [36;1mecho "- Status: failure" >> $GITHUB_STEP_SUMMARY[0m
