# RUNBLOCK v3.0 Audit Replay

Audit replay reconstructs a prediction from:

- immutable decision log
- immutable snapshot
- dependency trace

Replay entry points:

- `npm run runblock:audit:replay`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/runblock/v3/audit-replay-latest.json`

Replay contract:

1. Load the decision log
2. Resolve `snapshot_id`
3. Resolve snapshot features and versions
4. Verify `feature_hash`
5. Inspect `dependency_trace`
6. Reconstruct prediction context without mutable live state

Append-only rule:

- The original decision record is never overwritten
- Realized outcome must be appended as a follow-up record
- Incident records are separate immutable events
