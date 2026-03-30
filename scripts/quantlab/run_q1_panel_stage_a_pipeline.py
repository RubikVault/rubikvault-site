#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.quantlab.q1_common import (  # noqa: E402
    DEFAULT_QUANT_ROOT,
    atomic_write_json,
    build_q1_panel_stagea_pipeline_run_id,
    build_stagea_artifact_suffix,
    build_stagea_time_splits_run_id,
    read_json,
    resolve_panel_asof_end_date,
    stable_hash_file,
    utc_now_iso,
)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument('--quant-root', default=DEFAULT_QUANT_ROOT)
    p.add_argument('--python', default=str(Path.cwd() / 'quantlab' / '.venv' / 'bin' / 'python'))
    p.add_argument('--snapshot-id', required=True)
    p.add_argument('--asset-classes', default='stock,etf')
    p.add_argument('--lookback-calendar-days', type=int, default=420)
    p.add_argument('--panel-calendar-days', type=int, default=60)
    p.add_argument('--min-bars', type=int, default=200)
    p.add_argument('--panel-max-assets', type=int, default=5000)
    p.add_argument('--feature-store-version', default='v4_q1panel_runs')
    p.add_argument('--panel-output-tag', default='panel')
    p.add_argument('--asof-end-date', default='')
    p.add_argument('--top-liquid-n', type=int, default=3000)
    p.add_argument('--fold-count', type=int, default=3)
    p.add_argument('--test-days', type=int, default=5)
    p.add_argument('--embargo-days', type=int, default=2)
    p.add_argument('--min-train-days', type=int, default=8)
    p.add_argument('--survivors-max', type=int, default=24)
    p.add_argument('--candidate-profile', choices=['core8', 'core16', 'core24'], default='core24')
    p.add_argument('--fixed-universe-path', default='')
    return p.parse_args(list(argv))


def _run(cmd: list[str]) -> tuple[int, float]:
    t0 = time.time()
    r = subprocess.run(cmd, check=False)
    return r.returncode, time.time() - t0


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    quant_root = Path(args.quant_root).resolve()
    py = args.python
    build_script = REPO_ROOT / 'scripts/quantlab/build_feature_store_q1_panel.py'
    cheap_script = REPO_ROOT / 'scripts/quantlab/run_cheap_gate_stage_a_time_splits_q1.py'

    panel_tag = args.panel_output_tag or f"panel_{args.panel_max_assets or 'full'}"
    panel_cmd = [
        py, str(build_script),
        '--quant-root', str(quant_root),
        '--snapshot-id', args.snapshot_id,
        '--asset-classes', args.asset_classes,
        '--lookback-calendar-days', str(args.lookback_calendar_days),
        '--panel-calendar-days', str(args.panel_calendar_days),
        '--min-bars', str(args.min_bars),
        '--max-assets', str(args.panel_max_assets),
        '--feature-store-version', args.feature_store_version,
        '--output-tag', panel_tag,
    ]
    rc_panel, panel_elapsed = _run(panel_cmd)
    if rc_panel != 0:
        raise SystemExit(rc_panel)

    panel_manifest_path = quant_root / 'features' / 'store' / f'feature_store_version={args.feature_store_version}' / 'feature_panel_manifest.json'
    panel_manifest = read_json(panel_manifest_path)
    panel_ranges = panel_manifest.get('ranges') or {}
    asof_resolution = resolve_panel_asof_end_date(
        requested_asof_end_date=args.asof_end_date,
        panel_max_asof_date=str(panel_ranges.get('panel_max_asof_date') or ''),
    )
    asof_end = str(asof_resolution.get('effective_asof_end_date') or '')
    if not asof_end:
        raise SystemExit('FATAL: unable to resolve asof_end_date from panel manifest')
    part_glob_hint = str(((panel_manifest.get('artifacts') or {}).get('part_glob_hint')) or f'part-{panel_tag}.parquet')
    cheap_run_suffix = build_stagea_artifact_suffix(
        panel_output_tag=panel_tag,
        top_liquid_n=int(args.top_liquid_n),
        fold_count=int(args.fold_count),
        profile_payload={
            'feature_store_version': str(args.feature_store_version),
            'snapshot_id': str(args.snapshot_id),
            'asset_classes': str(args.asset_classes),
            'panel_output_tag': panel_tag,
            'part_glob': part_glob_hint,
            'panel_calendar_days': int(args.panel_calendar_days),
            'panel_max_assets': int(args.panel_max_assets),
            'top_liquid_n': int(args.top_liquid_n),
            'fold_count': int(args.fold_count),
            'test_days': int(args.test_days),
            'embargo_days': int(args.embargo_days),
            'min_train_days': int(args.min_train_days),
            'survivors_max': int(args.survivors_max),
            'candidate_profile': str(args.candidate_profile),
        },
    )

    cheap_cmd = [
        py, str(cheap_script),
        '--quant-root', str(quant_root),
        '--feature-store-version', args.feature_store_version,
        '--asof-end-date', asof_end,
        '--asset-classes', args.asset_classes,
        '--panel-output-tag', panel_tag,
        '--panel-asof-days', str(args.panel_calendar_days),
        '--top-liquid-n', str(args.top_liquid_n),
        '--fold-count', str(args.fold_count),
        '--test-days', str(args.test_days),
        '--embargo-days', str(args.embargo_days),
        '--min-train-days', str(args.min_train_days),
        '--survivors-max', str(args.survivors_max),
        '--candidate-profile', str(args.candidate_profile),
        '--part-glob', part_glob_hint,
        '--run-id-suffix', cheap_run_suffix,
    ]
    if args.fixed_universe_path:
        cheap_cmd.extend(['--fixed-universe-path', args.fixed_universe_path])
    rc_cheap, cheap_elapsed = _run(cheap_cmd)
    if rc_cheap != 0:
        raise SystemExit(rc_cheap)

    cheap_run_id = build_stagea_time_splits_run_id(asof_end, run_suffix=cheap_run_suffix)
    cheap_out_dir = quant_root / 'runs' / f'run_id={cheap_run_id}' / 'outputs'
    cheap_report_path = cheap_out_dir / 'cheap_gate_A_time_splits_report.json'
    folds_manifest_path = cheap_out_dir / 'folds_manifest.json'
    cheap_report = read_json(cheap_report_path)
    folds_manifest = read_json(folds_manifest_path)

    run_id = build_q1_panel_stagea_pipeline_run_id(asof_end, run_suffix=cheap_run_suffix)
    out_dir = quant_root / 'runs' / f'run_id={run_id}'
    out_dir.mkdir(parents=True, exist_ok=True)
    manifests_dir = out_dir / 'manifests'
    manifests_dir.mkdir(parents=True, exist_ok=True)
    panel_manifest_copy = manifests_dir / 'feature_panel_manifest.json'
    cheap_report_copy = manifests_dir / 'cheap_gate_A_time_splits_report.json'
    folds_manifest_copy = manifests_dir / 'folds_manifest.json'
    shutil.copy2(panel_manifest_path, panel_manifest_copy)
    shutil.copy2(cheap_report_path, cheap_report_copy)
    shutil.copy2(folds_manifest_path, folds_manifest_copy)
    run_report = {
        'schema': 'quantlab_q1_panel_stagea_pipeline_run_v1',
        'generated_at': utc_now_iso(),
        'run_id': run_id,
        'snapshot_id': args.snapshot_id,
        'feature_store_version': args.feature_store_version,
        'panel_output_tag': panel_tag,
        'asof_end_date': asof_end,
        'steps': [
            {'name': 'build_feature_store_q1_panel', 'ok': True, 'elapsed_sec': round(panel_elapsed, 3), 'cmd': panel_cmd},
            {'name': 'run_cheap_gate_stage_a_time_splits_q1', 'ok': True, 'elapsed_sec': round(cheap_elapsed, 3), 'cmd': cheap_cmd},
        ],
        'artifacts': {
            'panel_manifest': str(panel_manifest_path),
            'cheap_gate_report': str(cheap_report_path),
            'folds_manifest': str(folds_manifest_path),
            'panel_manifest_copy': str(panel_manifest_copy),
            'cheap_gate_report_copy': str(cheap_report_copy),
            'folds_manifest_copy': str(folds_manifest_copy),
        },
        'references': {
            'panel_counts': (panel_manifest.get('counts') or {}),
            'panel_ranges': panel_ranges,
            'panel_scan_plan': (panel_manifest.get('scan_plan') or {}),
            'panel_part_glob_hint': part_glob_hint,
            'panel_output_tag': panel_tag,
            'cheap_gate_run_id': cheap_run_id,
            'cheap_gate_run_id_suffix': cheap_run_suffix,
            'requested_asof_end_date': str(asof_resolution.get('requested_asof_end_date') or ''),
            'effective_asof_end_date': str(asof_resolution.get('effective_asof_end_date') or ''),
            'panel_max_asof_date': str(asof_resolution.get('panel_max_asof_date') or ''),
            'asof_end_was_clamped_to_panel_max': bool(asof_resolution.get('asof_end_was_clamped_to_panel_max')),
            'asof_end_clamp_reason': str(asof_resolution.get('asof_end_clamp_reason') or ''),
            'cheap_gate_counts': (cheap_report.get('counts') or {}),
            'cheap_gate_candidate_profile': str((cheap_report.get('method') or {}).get('candidate_profile') or args.candidate_profile),
            'folds_config': (folds_manifest.get('config') or {}),
        },
        'hashes': {
            'panel_manifest_hash': stable_hash_file(panel_manifest_copy),
            'cheap_gate_report_hash': stable_hash_file(cheap_report_copy),
            'folds_manifest_hash': stable_hash_file(folds_manifest_copy),
        },
        'notes': [
            'Q1 productive runner for multi-asof panel + Stage A time-split gate.',
            'Uses part-glob to isolate panel artifacts by output tag within shared feature-store-version.',
            (
                f"Requested asof_end_date was clamped to panel_max_asof_date={asof_end}."
                if bool(asof_resolution.get('asof_end_was_clamped_to_panel_max'))
                else 'Requested asof_end_date is feasible within the current panel manifest.'
            ),
        ],
    }
    report_path = out_dir / 'q1_panel_stagea_run_report.json'
    atomic_write_json(report_path, run_report)
    print(f'run_id={run_id}')
    print(f'report={report_path}')
    print(f"effective_asof_end_date={run_report['references'].get('effective_asof_end_date')}")
    print(f"panel_rows={run_report['references']['panel_counts'].get('rows_total')}")
    print(f"survivors_A={run_report['references']['cheap_gate_counts'].get('survivors_A_total')}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
