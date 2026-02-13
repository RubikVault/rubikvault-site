# 09_LIMITATIONS

## UNAVAILABLE / PARTIAL VERIFICATIONS

1) Cloudflare dashboard internals (deployment settings, KV namespace attachment UI)
- Status: UNAVAILABLE from repo-only + HTTP audit surface.
- Evidence used instead: wrangler binding declarations and runtime debug payloads.

2) Browser-rendered UI screenshots
- Status: UNAVAILABLE in this terminal-only audit.
- Evidence used instead: source-code fetch/render path analysis + endpoint probes + HTML payload checks.

3) Preview base selection certainty
- Status: PARTIAL.
- Chosen `PREVIEW_BASE` came from current known Pages deployment context and successful reachability checks.
- Additional known preview URLs were documented separately to prevent accidental base mixing.

4) Dynamic endpoint hash parity
- Status: PARTIAL by design.
- Dynamic endpoints include timestamps/request-time metadata; hash differences were classified as cache/dynamic drift unless semantic fields mismatched.

5) Safe-to-delete certainty
- Status: PARTIAL.
- This audit provides negative reference scans for candidates but did not execute deletion dry-runs or deployment canary checks.

## IMPACT OF LIMITATIONS
- None of the above limitations blocks the core P0 conclusions (Elliott parity break; marketphase JSON contract break), which are directly evidenced by deployed payloads and UI code references.
