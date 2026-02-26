#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable, Any

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    read_json,
    stable_hash_file,
    stable_hash_obj,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--quant-root", default=DEFAULT_QUANT_ROOT)
    p.add_argument("--stage-b-run-id", default="", help="Default: latest q1stageb_* run")
    p.add_argument("--score-epsilon", type=float, default=0.01)
    p.add_argument("--promote-on-empty", action="store_true", default=True)
    p.add_argument("--no-promote-on-empty", dest="promote_on_empty", action="store_false")
    return p.parse_args(list(argv))


def _latest_stage_b_run(quant_root: Path) -> str:
    runs_root = quant_root / "runs"
    cands = [p for p in runs_root.iterdir() if p.is_dir() and p.name.startswith("run_id=q1stageb_")]
    if not cands:
        raise FileNotFoundError(f"no q1stageb runs under {runs_root}")
    cands.sort(key=lambda p: p.stat().st_mtime_ns)
    return cands[-1].name.split("=", 1)[1]


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS runs_stage_b_q1 (
          run_id TEXT PRIMARY KEY,
          generated_at TEXT NOT NULL,
          stage_a_run_id TEXT,
          ok INTEGER NOT NULL,
          exit_code INTEGER NOT NULL,
          reason TEXT,
          report_path TEXT NOT NULL,
          report_hash TEXT NOT NULL,
          stage_b_candidates_total INTEGER,
          stage_b_survivors_total INTEGER,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stage_b_candidates_q1 (
          run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          q1_registry_score REAL,
          stage_b_pass INTEGER NOT NULL,
          dsr_proxy REAL,
          psr_proxy REAL,
          ic_5d_oos_mean REAL,
          oos_sharpe_proxy_mean REAL,
          turnover_proxy_mean REAL,
          maxdd_proxy_pct_mean REAL,
          cpcv_light_sharpe_min REAL,
          cpcv_light_neg_sharpe_share REAL,
          metrics_json TEXT NOT NULL,
          PRIMARY KEY (run_id, candidate_id)
        );

        CREATE TABLE IF NOT EXISTS champion_state_q1 (
          slot TEXT PRIMARY KEY,
          champion_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          q1_registry_score REAL,
          source_stage_b_run_id TEXT NOT NULL,
          state TEXT NOT NULL,
          promoted_at TEXT NOT NULL,
          metrics_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidate_registry_state_q1 (
          candidate_id TEXT PRIMARY KEY,
          family TEXT,
          state TEXT NOT NULL,
          source_stage_b_run_id TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          reason_codes_json TEXT NOT NULL,
          q1_registry_score REAL,
          champion_id TEXT,
          metrics_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promotion_decisions_q1 (
          decision_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          champion_before_id TEXT,
          challenger_candidate_id TEXT,
          champion_after_id TEXT,
          reason_codes_json TEXT NOT NULL,
          summary_metrics_json TEXT NOT NULL,
          artifacts_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promotion_events_q1 (
          event_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          event_type TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          old_champion_id TEXT,
          new_champion_id TEXT,
          candidate_id TEXT,
          delta_metrics_json TEXT NOT NULL,
          artifacts_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidate_state_events_q1 (
          event_id TEXT PRIMARY KEY,
          ts TEXT NOT NULL,
          stage_b_run_id TEXT NOT NULL,
          candidate_id TEXT NOT NULL,
          family TEXT,
          prev_state TEXT,
          new_state TEXT NOT NULL,
          reason_codes_json TEXT NOT NULL,
          details_json TEXT NOT NULL
        );
        """
    )
    conn.commit()


def _append_jsonl(path: Path, rec: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def _norm01(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    x = (value - lo) / (hi - lo)
    return 0.0 if x < 0 else 1.0 if x > 1 else float(x)


def _candidate_score(row: dict[str, Any]) -> float:
    dsr = float(row.get("dsr_proxy") or 0.0)
    psr = float(row.get("psr_proxy") or 0.0)
    sharpe = float(row.get("oos_sharpe_proxy_mean") or 0.0)
    ic5 = float(row.get("ic_5d_oos_mean") or 0.0)
    turnover = float(row.get("turnover_proxy_mean") or 0.0)
    maxdd = float(row.get("maxdd_proxy_pct_mean") or 0.0)
    cpcv_min = float(row.get("cpcv_light_sharpe_min") or 0.0)

    sharpe_norm = _norm01(sharpe, 0.0, 0.25)
    ic_norm = _norm01(ic5, 0.0, 0.08)
    turnover_norm = 1.0 - _norm01(turnover, 0.0, 4.0)
    maxdd_norm = 1.0 - _norm01(maxdd, 0.0, 25.0)
    cpcv_norm = _norm01(cpcv_min, -0.05, 0.10)
    score = (
        0.30 * dsr
        + 0.20 * psr
        + 0.15 * sharpe_norm
        + 0.10 * ic_norm
        + 0.10 * turnover_norm
        + 0.10 * maxdd_norm
        + 0.05 * cpcv_norm
    )
    return round(float(score), 6)


def _read_stage_b_candidates(stage_b_light_report: dict[str, Any]) -> tuple[pl.DataFrame, pl.DataFrame]:
    artifacts = stage_b_light_report.get("artifacts") or {}
    cand_path = Path(str(artifacts.get("stage_b_light_candidates") or ""))
    surv_path = Path(str(artifacts.get("survivors_B_light") or ""))
    if not cand_path.exists():
        raise FileNotFoundError(f"missing stage_b_light_candidates.parquet: {cand_path}")
    if not surv_path.exists():
        raise FileNotFoundError(f"missing survivors_B_light.parquet: {surv_path}")
    return pl.read_parquet(cand_path), pl.read_parquet(surv_path)


def _load_current_champion(conn: sqlite3.Connection) -> dict[str, Any] | None:
    cur = conn.execute(
        "SELECT champion_id,candidate_id,family,q1_registry_score,source_stage_b_run_id,state,promoted_at,metrics_json "
        "FROM champion_state_q1 WHERE slot='default'"
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "champion_id": row[0],
        "candidate_id": row[1],
        "family": row[2],
        "q1_registry_score": row[3],
        "source_stage_b_run_id": row[4],
        "state": row[5],
        "promoted_at": row[6],
        "metrics": json.loads(row[7]),
    }


def _load_candidate_states(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    cur = conn.execute(
        "SELECT candidate_id,family,state,source_stage_b_run_id,updated_at,reason_codes_json,q1_registry_score,champion_id "
        "FROM candidate_registry_state_q1"
    )
    out: dict[str, dict[str, Any]] = {}
    for row in cur.fetchall():
        cid = str(row[0] or "")
        if not cid:
            continue
        try:
            reasons = json.loads(row[5]) if row[5] else []
        except Exception:
            reasons = []
        out[cid] = {
            "candidate_id": cid,
            "family": row[1],
            "state": row[2],
            "source_stage_b_run_id": row[3],
            "updated_at": row[4],
            "reason_codes": reasons,
            "q1_registry_score": row[6],
            "champion_id": row[7],
        }
    return out


def _write_promotion_index(registry_root: Path, decisions_path: Path, events_path: Path) -> Path:
    def _scan(path: Path) -> list[dict[str, Any]]:
        rows = []
        if not path.exists():
            return rows
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                ts = str(rec.get("ts") or "")
                rows.append({"ts": ts, "day": ts[:10] if len(ts) >= 10 else "unknown"})
        return rows

    decs = _scan(decisions_path)
    evs = _scan(events_path)
    by_day: dict[str, dict[str, int]] = {}
    for r in decs:
        d = by_day.setdefault(r["day"], {"decisions": 0, "events": 0})
        d["decisions"] += 1
    for r in evs:
        d = by_day.setdefault(r["day"], {"decisions": 0, "events": 0})
        d["events"] += 1
    index_obj = {
        "schema": "quantlab_q1_promotion_index_v1",
        "generated_at": utc_now_iso(),
        "artifacts": {
            "promotion_decisions_ndjson": str(decisions_path),
            "promotion_events_ndjson": str(events_path),
        },
        "counts": {
            "decisions_total": len(decs),
            "events_total": len(evs),
            "days_total": len(by_day),
        },
        "by_day": [{"day": k, **v} for k, v in sorted(by_day.items())],
    }
    out = registry_root / "promotion_index.json"
    atomic_write_json(out, index_obj)
    return out


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    stage_b_run_id = args.stage_b_run_id or _latest_stage_b_run(quant_root)
    run_dir = quant_root / "runs" / f"run_id={stage_b_run_id}"
    stage_b_run_report_path = run_dir / "stage_b_q1_run_report.json"
    if not stage_b_run_report_path.exists():
        raise SystemExit(f"FATAL: missing stage_b_q1_run_report.json: {stage_b_run_report_path}")

    stage_b_run_report = read_json(stage_b_run_report_path)
    if not bool(stage_b_run_report.get("ok")):
        raise SystemExit("FATAL: Stage-B Q1 run report not ok")

    artifacts = stage_b_run_report.get("artifacts") or {}
    stage_b_light_report_path = Path(str(artifacts.get("stage_b_light_report") or ""))
    if not stage_b_light_report_path.exists():
        raise SystemExit(f"FATAL: missing stage_b_light_report: {stage_b_light_report_path}")
    stage_b_light_report = read_json(stage_b_light_report_path)

    candidates_df, survivors_light_df = _read_stage_b_candidates(stage_b_light_report)
    survivors_df = survivors_light_df
    selected_survivors_source = "stage_b_light"
    stage_b_q1_survivors_path = Path(str((artifacts.get("survivors_B_q1") or "")))
    if stage_b_q1_survivors_path.exists():
        try:
            survivors_df = pl.read_parquet(stage_b_q1_survivors_path)
            selected_survivors_source = "stage_b_q1_final"
        except Exception:
            selected_survivors_source = "stage_b_light_fallback_read_error"
    if "q1_registry_score" not in candidates_df.columns:
        candidates_df = candidates_df.with_columns(
            pl.struct(pl.all()).map_elements(lambda r: _candidate_score(r), return_dtype=pl.Float64).alias("q1_registry_score")
        )
    if "q1_registry_score" not in survivors_df.columns:
        survivors_df = survivors_df.with_columns(
            pl.struct(pl.all()).map_elements(lambda r: _candidate_score(r), return_dtype=pl.Float64).alias("q1_registry_score")
        )

    candidates_df = candidates_df.sort(
        ["stage_b_q1_light_pass", "q1_registry_score", "dsr_proxy", "psr_proxy", "candidate_id"],
        descending=[True, True, True, True, False],
    )
    survivors_df = survivors_df.sort(["q1_registry_score", "dsr_proxy", "psr_proxy", "candidate_id"], descending=[True, True, True, False])

    registry_root = quant_root / "registry"
    registry_root.mkdir(parents=True, exist_ok=True)
    db_path = registry_root / "experiments.db"
    conn = sqlite3.connect(db_path)
    _ensure_schema(conn)

    now = utc_now_iso()
    run_hash = stable_hash_file(stage_b_run_report_path)
    counts = (stage_b_run_report.get("counts") or {})
    b_light_counts = counts.get("stage_b_light") or {}
    conn.execute(
        """
        INSERT OR REPLACE INTO runs_stage_b_q1
        (run_id, generated_at, stage_a_run_id, ok, exit_code, reason, report_path, report_hash,
         stage_b_candidates_total, stage_b_survivors_total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            stage_b_run_id,
            str(stage_b_run_report.get("generated_at") or now),
            str(stage_b_run_report.get("stage_a_run_id") or ""),
            1,
            int(stage_b_run_report.get("exit_code") or 0),
            str(stage_b_run_report.get("reason") or "ok"),
            str(stage_b_run_report_path),
            run_hash,
            int(b_light_counts.get("stage_b_candidates_total") or candidates_df.height),
            int(b_light_counts.get("survivors_B_light_total") or survivors_df.height),
            now,
        ),
    )

    # Upsert candidates
    conn.execute("DELETE FROM stage_b_candidates_q1 WHERE run_id=?", (stage_b_run_id,))
    for row in candidates_df.to_dicts():
        metrics_json = json.dumps(row, sort_keys=True, ensure_ascii=False)
        conn.execute(
            """
            INSERT INTO stage_b_candidates_q1 (
              run_id,candidate_id,family,q1_registry_score,stage_b_pass,dsr_proxy,psr_proxy,ic_5d_oos_mean,
              oos_sharpe_proxy_mean,turnover_proxy_mean,maxdd_proxy_pct_mean,cpcv_light_sharpe_min,
              cpcv_light_neg_sharpe_share,metrics_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                stage_b_run_id,
                str(row.get("candidate_id") or ""),
                str(row.get("family") or ""),
                float(row.get("q1_registry_score") or 0.0),
                1 if bool(row.get("stage_b_q1_light_pass")) else 0,
                float(row.get("dsr_proxy") or 0.0),
                float(row.get("psr_proxy") or 0.0),
                float(row.get("ic_5d_oos_mean") or 0.0),
                float(row.get("oos_sharpe_proxy_mean") or 0.0),
                float(row.get("turnover_proxy_mean") or 0.0),
                float(row.get("maxdd_proxy_pct_mean") or 0.0),
                float(row.get("cpcv_light_sharpe_min") or 0.0),
                float(row.get("cpcv_light_neg_sharpe_share") or 0.0),
                metrics_json,
            ),
        )

    current = _load_current_champion(conn)
    prev_candidate_states = _load_candidate_states(conn)
    top_survivor = survivors_df.head(1).to_dicts()[0] if survivors_df.height > 0 else None

    decision = "NO_PROMOTION"
    reason_codes: list[str] = []
    event: dict[str, Any] | None = None
    champion_before_id = current["champion_id"] if current else None
    champion_after_id = champion_before_id
    challenger_candidate_id = str(top_survivor.get("candidate_id")) if top_survivor else None

    if top_survivor is None:
        reason_codes.extend(["STAGE_B_SURVIVORS_EMPTY", "NO_STAGE_B_SURVIVORS"])
    elif current is None:
        reason_codes.append("STAGE_B_SURVIVOR_PRESENT")
        if args.promote_on_empty:
            decision = "PROMOTE"
            reason_codes.append("NO_EXISTING_CHAMPION")
        else:
            reason_codes.append("NO_EXISTING_CHAMPION_PROMOTION_DISABLED")
    else:
        reason_codes.extend(["STAGE_B_SURVIVOR_PRESENT", "CURRENT_CHAMPION_PRESENT"])
        challenger_score = float(top_survivor.get("q1_registry_score") or 0.0)
        champion_score = float(current.get("q1_registry_score") or 0.0)
        if str(current.get("candidate_id")) == str(top_survivor.get("candidate_id")):
            decision = "NO_PROMOTION"
            reason_codes.append("CHAMPION_ALREADY_TOP_SURVIVOR")
        elif challenger_score >= champion_score + float(args.score_epsilon):
            decision = "PROMOTE"
            reason_codes.extend(["Q1_REGISTRY_SCORE_IMPROVED", "SCORE_EPSILON_MET"])
        else:
            decision = "NO_PROMOTION"
            reason_codes.extend(["SCORE_IMPROVEMENT_BELOW_EPSILON", "SCORE_EPSILON_NOT_MET"])

    if decision == "PROMOTE" and top_survivor is not None:
        champ_payload = {
            "schema": "quantlab_q1_champion_state_v1",
            "generated_at": now,
            "champion_id": f"q1champ_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'candidate_id': top_survivor.get('candidate_id'), 'ts': now})[:12]}",
            "candidate_id": str(top_survivor.get("candidate_id")),
            "family": str(top_survivor.get("family") or ""),
            "q1_registry_score": float(top_survivor.get("q1_registry_score") or 0.0),
            "source_stage_b_run_id": stage_b_run_id,
            "state": "live",
            "promoted_at": now,
            "metrics": top_survivor,
        }
        champion_after_id = champ_payload["champion_id"]
        conn.execute(
            """
            INSERT OR REPLACE INTO champion_state_q1
            (slot, champion_id, candidate_id, family, q1_registry_score, source_stage_b_run_id, state, promoted_at, metrics_json)
            VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                champ_payload["champion_id"],
                champ_payload["candidate_id"],
                champ_payload["family"],
                champ_payload["q1_registry_score"],
                champ_payload["source_stage_b_run_id"],
                champ_payload["state"],
                champ_payload["promoted_at"],
                json.dumps(champ_payload["metrics"], sort_keys=True, ensure_ascii=False),
            ),
        )
        champions_dir = registry_root / "champions"
        atomic_write_json(champions_dir / "current_champion.json", champ_payload)
        hist_name = f"{now.replace(':','').replace('-','')}_{champ_payload['candidate_id'].replace('/','_')}.json"
        atomic_write_json(champions_dir / "history" / hist_name, champ_payload)
        event = {
            "schema": "quantlab_q1_promotion_event_v1",
            "event_id": f"ev_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'decision': decision, 'ts': now})[:16]}",
            "ts": now,
            "event_type": "PROMOTION",
            "stage_b_run_id": stage_b_run_id,
            "old_champion_id": champion_before_id,
            "new_champion_id": champion_after_id,
            "candidate_id": champ_payload["candidate_id"],
            "reason_codes": list(reason_codes),
            "delta_metrics": {
                "old_q1_registry_score": float(current.get("q1_registry_score") or 0.0) if current else None,
                "new_q1_registry_score": float(champ_payload["q1_registry_score"]),
            },
            "artifacts": {
                "stage_b_q1_run_report": str(stage_b_run_report_path),
                "stage_b_light_report": str(stage_b_light_report_path),
            },
        }
        conn.execute(
            """
            INSERT OR REPLACE INTO promotion_events_q1
            (event_id, ts, event_type, stage_b_run_id, old_champion_id, new_champion_id, candidate_id, delta_metrics_json, artifacts_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event["event_id"],
                event["ts"],
                event["event_type"],
                event["stage_b_run_id"],
                event.get("old_champion_id"),
                event.get("new_champion_id"),
                event.get("candidate_id"),
                    json.dumps(event.get("delta_metrics") or {}, sort_keys=True, ensure_ascii=False),
                    json.dumps(event.get("artifacts") or {}, sort_keys=True, ensure_ascii=False),
                ),
            )

    decision_rec = {
        "schema": "quantlab_q1_promotion_decision_v1",
        "decision_id": f"dec_{stable_hash_obj({'stage_b_run_id': stage_b_run_id, 'ts': now, 'decision': decision})[:16]}",
        "ts": now,
        "stage_b_run_id": stage_b_run_id,
        "decision": decision,
        "champion_before_id": champion_before_id,
        "challenger_candidate_id": challenger_candidate_id,
        "champion_after_id": champion_after_id,
        "reason_codes": reason_codes,
        "summary_metrics": {
            "stage_b_candidates_total": int(candidates_df.height),
            "stage_b_survivors_B_light_total": int(survivors_df.height),
            "challenger_q1_registry_score": (float(top_survivor.get("q1_registry_score")) if top_survivor else None),
            "champion_q1_registry_score_before": (float(current.get("q1_registry_score")) if current else None),
            "score_epsilon": float(args.score_epsilon),
            "state_before": (str(current.get("state")) if current else None),
            "state_after": ("live" if decision == "PROMOTE" and top_survivor is not None else (str(current.get("state")) if current else None)),
        },
        "artifacts": {
            "stage_b_q1_run_report": str(stage_b_run_report_path),
            "stage_b_light_report": str(stage_b_light_report_path),
        },
    }

    conn.execute(
        """
        INSERT OR REPLACE INTO promotion_decisions_q1
        (decision_id, ts, stage_b_run_id, decision, champion_before_id, challenger_candidate_id, champion_after_id,
         reason_codes_json, summary_metrics_json, artifacts_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            decision_rec["decision_id"],
            decision_rec["ts"],
            decision_rec["stage_b_run_id"],
            decision_rec["decision"],
            decision_rec.get("champion_before_id"),
            decision_rec.get("challenger_candidate_id"),
            decision_rec.get("champion_after_id"),
            json.dumps(decision_rec.get("reason_codes") or [], sort_keys=True, ensure_ascii=False),
            json.dumps(decision_rec.get("summary_metrics") or {}, sort_keys=True, ensure_ascii=False),
            json.dumps(decision_rec.get("artifacts") or {}, sort_keys=True, ensure_ascii=False),
        ),
    )

    # Candidate registry state (Q1): maintain live/shadow/retired view for the latest observed Stage-B candidate set.
    live_candidate_id = None
    live_champion_id = None
    if decision == "PROMOTE" and top_survivor is not None:
        live_candidate_id = str(top_survivor.get("candidate_id") or "")
        live_champion_id = champion_after_id
    elif current is not None:
        live_candidate_id = str(current.get("candidate_id") or "")
        live_champion_id = str(current.get("champion_id") or "")

    survivor_ids = set(str(x) for x in (survivors_df.get_column("candidate_id").to_list() if "candidate_id" in survivors_df.columns else []))
    state_rows: list[dict[str, Any]] = []
    for row in candidates_df.to_dicts():
        cid = str(row.get("candidate_id") or "")
        if not cid:
            continue
        is_stage_b_pass = bool(row.get("stage_b_q1_light_pass"))
        if live_candidate_id and cid == live_candidate_id:
            state = "live"
            state_reasons = ["CURRENT_LIVE_CHAMPION"]
            if decision == "PROMOTE":
                state_reasons.append("PROMOTED_IN_THIS_RUN")
        elif cid in survivor_ids:
            state = "shadow"
            state_reasons = ["STAGE_B_LIGHT_SURVIVOR"]
        else:
            state = "retired"
            state_reasons = ["STAGE_B_LIGHT_FAIL" if not is_stage_b_pass else "NOT_SELECTED_IN_SURVIVOR_CAP"]
        state_rows.append(
            {
                "candidate_id": cid,
                "family": str(row.get("family") or ""),
                "state": state,
                "source_stage_b_run_id": stage_b_run_id,
                "updated_at": now,
                "reason_codes_json": json.dumps(state_reasons, sort_keys=True, ensure_ascii=False),
                "q1_registry_score": float(row.get("q1_registry_score") or 0.0),
                "champion_id": live_champion_id if state == "live" else None,
                "metrics_json": json.dumps(row, sort_keys=True, ensure_ascii=False),
            }
        )
    for srow in state_rows:
        conn.execute(
            """
            INSERT OR REPLACE INTO candidate_registry_state_q1
            (candidate_id, family, state, source_stage_b_run_id, updated_at, reason_codes_json, q1_registry_score, champion_id, metrics_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                srow["candidate_id"],
                srow["family"],
                srow["state"],
                srow["source_stage_b_run_id"],
                srow["updated_at"],
                srow["reason_codes_json"],
                srow["q1_registry_score"],
                srow["champion_id"],
                srow["metrics_json"],
            ),
        )
    # Candidate state transition events (audit trail for demotions/promotions/retirements).
    candidate_state_events: list[dict[str, Any]] = []
    for srow in state_rows:
        cid = str(srow["candidate_id"])
        prev = prev_candidate_states.get(cid)
        prev_state = str(prev.get("state")) if prev else None
        new_state = str(srow["state"])
        if prev_state == new_state:
            continue
        transition_reason_codes = []
        try:
            transition_reason_codes.extend(json.loads(srow["reason_codes_json"]))
        except Exception:
            pass
        if prev_state is None:
            event_type = "STATE_DISCOVERED"
            transition_reason_codes.append("FIRST_OBSERVED_IN_CANDIDATE_REGISTRY")
        elif prev_state == "live" and new_state == "shadow":
            event_type = "DEMOTION_TO_SHADOW"
            transition_reason_codes.append("LIVE_CANDIDATE_NOT_RESELECTED_AS_CHAMPION")
        elif prev_state == "live" and new_state == "retired":
            event_type = "DEMOTION_TO_RETIRED"
            transition_reason_codes.append("LIVE_CANDIDATE_FAILED_OR_NOT_SURVIVOR")
        elif prev_state == "shadow" and new_state == "live":
            event_type = "PROMOTION_TO_LIVE"
            transition_reason_codes.append("SELECTED_AS_LIVE_CHAMPION")
        elif prev_state == "retired" and new_state == "shadow":
            event_type = "REVIVED_TO_SHADOW"
            transition_reason_codes.append("REENTERED_STAGE_B_SURVIVORS")
        else:
            event_type = "STATE_TRANSITION"
        ev = {
            "schema": "quantlab_q1_candidate_state_event_v1",
            "event_id": f"csev_{stable_hash_obj({'cid': cid, 'ts': now, 'from': prev_state, 'to': new_state, 'run': stage_b_run_id})[:20]}",
            "ts": now,
            "stage_b_run_id": stage_b_run_id,
            "event_type": event_type,
            "candidate_id": cid,
            "family": srow.get("family"),
            "prev_state": prev_state,
            "new_state": new_state,
            "reason_codes": sorted(set(str(x) for x in transition_reason_codes if x)),
            "details": {
                "source_stage_b_run_id": stage_b_run_id,
                "q1_registry_score": srow.get("q1_registry_score"),
                "champion_id": srow.get("champion_id"),
                "prev_source_stage_b_run_id": (prev or {}).get("source_stage_b_run_id"),
            },
        }
        candidate_state_events.append(ev)
        conn.execute(
            """
            INSERT OR REPLACE INTO candidate_state_events_q1
            (event_id, ts, stage_b_run_id, candidate_id, family, prev_state, new_state, reason_codes_json, details_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ev["event_id"],
                ev["ts"],
                ev["stage_b_run_id"],
                ev["candidate_id"],
                ev.get("family"),
                ev.get("prev_state"),
                ev["new_state"],
                json.dumps(ev.get("reason_codes") or [], sort_keys=True, ensure_ascii=False),
                json.dumps(ev.get("details") or {}, sort_keys=True, ensure_ascii=False),
            ),
        )
    conn.commit()

    ledgers_dir = registry_root / "ledgers"
    decisions_path = ledgers_dir / "promotion_decisions.ndjson"
    events_path = ledgers_dir / "promotion_events.ndjson"
    candidate_state_events_path = ledgers_dir / "candidate_state_events.ndjson"
    _append_jsonl(decisions_path, decision_rec)
    if event:
        _append_jsonl(events_path, event)
    for ev in candidate_state_events:
        _append_jsonl(candidate_state_events_path, ev)
    promotion_index_path = _write_promotion_index(registry_root, decisions_path, events_path)

    out_dir = quant_root / "runs" / f"run_id=q1registry_{stage_b_run_id}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_out = {
        "schema": "quantlab_q1_registry_update_report_v1",
        "generated_at": now,
        "ok": True,
        "exit_code": 0,
        "stage_b_run_id": stage_b_run_id,
        "decision": decision_rec,
        "event_written": bool(event),
        "counts": {
            "stage_b_candidates_total": int(candidates_df.height),
            "stage_b_survivors_B_light_total": int(survivors_light_df.height),
            "stage_b_survivors_selected_total": int(survivors_df.height),
            "stage_b_survivors_selected_source": selected_survivors_source,
            "candidate_registry_states_written": int(len(state_rows)),
            "candidate_state_events_written": int(len(candidate_state_events)),
            "candidate_registry_state_counts": {
                "live": sum(1 for r in state_rows if r["state"] == "live"),
                "shadow": sum(1 for r in state_rows if r["state"] == "shadow"),
                "retired": sum(1 for r in state_rows if r["state"] == "retired"),
            },
            "candidate_state_event_type_counts": {
                k: sum(1 for e in candidate_state_events if e["event_type"] == k)
                for k in sorted({e["event_type"] for e in candidate_state_events})
            },
        },
        "artifacts": {
            "registry_db": str(db_path),
            "promotion_decisions_ndjson": str(decisions_path),
            "promotion_events_ndjson": str(events_path),
            "candidate_state_events_ndjson": str(candidate_state_events_path),
            "promotion_index": str(promotion_index_path),
            "stage_b_q1_run_report": str(stage_b_run_report_path),
            "stage_b_light_report": str(stage_b_light_report_path),
            "stage_b_survivors_selected": str(stage_b_q1_survivors_path if stage_b_q1_survivors_path.exists() else Path(str((stage_b_light_report.get('artifacts') or {}).get('survivors_B_light') or ''))),
        },
        "hashes": {
            "stage_b_q1_run_report_hash": stable_hash_file(stage_b_run_report_path),
            "stage_b_light_report_hash": stable_hash_file(stage_b_light_report_path),
            "promotion_index_hash": stable_hash_file(promotion_index_path),
        },
    }
    report_path = out_dir / "q1_registry_update_report.json"
    atomic_write_json(report_path, report_out)

    print(f"stage_b_run_id={stage_b_run_id}")
    print(f"decision={decision_rec['decision']}")
    print(f"report={report_path}")
    print(f"registry_db={db_path}")
    print(f"ok=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
