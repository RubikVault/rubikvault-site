# Quant v4.0 Runbook Index (Living)

Status: local working documentation for the Quant v4.0 buildout (private/local-first).

Current focus (as of latest update):
- Stocks+ETFs Q1 backbone is running (full panels, Stage A, Stage B Q1-light).
- Q1 registry/champion base (SQLite + decision/event ledgers) now exists locally.
- Phase A is wired into the local daily wrapper (optional/guardrailed) and now verified in a full integrated run.
- Stage-B Q1 now writes a stricter final survivor set (`survivors_B_q1`) via prep/light intersection and Registry consumes it.
- Next critical path: promote Phase A real-delta mode into regular scheduled use + continue Stage B de-proxying (CPCV/DSR/PSR).
- Overnight compute sweeps are now supported via a resumable local orchestrator (`run_overnight_q1_training_sweep.py`).

Purpose:
- Preserve target architecture, current implementation status, and exact next steps.
- Allow continuation without chat context.
- Give other AIs a precise handoff without touching the wrong system paths.

Documents in this folder:
- `01-target-state-and-rules.md`
  - v4.0 target architecture, hard rules, scope boundaries, and implementation principles.
- `02-current-state-and-implementation-log.md`
  - what is already implemented, exact artifact paths, known gaps, and update protocol.
- `03-critical-path-10-day-plan.md`
  - concrete day-by-day plan for the fastest path to a useful v4.0 system on Stocks+ETFs.

Related docs (already in repo):
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/rubikvault-audit-remediation-v2.0-final.md`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/ui-ideas-v7-data-handoff.md`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/v2-resume-next-steps.md`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/docs/runbooks/v2-phase1-checklist.md`

Quant work status policy (important):
- Quant data/training artifacts are local/private first.
- Do not assume Quant files are merge-ready for `main`.
- Website/UI work and Quant work must remain separated unless explicitly bridged by small reviewed PRs.

Update discipline (mandatory):
- After each meaningful Quant change, update:
  - `02-current-state-and-implementation-log.md` (facts, paths, counts, new artifacts)
  - `03-critical-path-10-day-plan.md` (what moved from planned -> done/in-progress)
- If an external LLM/code review audit is evaluated, record verdict + fixes/deferred items in `02-current-state-and-implementation-log.md`.
- Keep exact artifact paths absolute so other AIs can continue without repo archaeology.
