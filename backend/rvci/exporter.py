from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def build_envelope(
    feature: str,
    meta: Dict[str, Any],
    data: Dict[str, Any],
    ok: bool = True,
    warnings: List[str] | None = None,
    error: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return {
        "ok": bool(ok),
        "feature": feature,
        "meta": meta,
        "data": data,
        "warnings": warnings or [],
        "error": error,
    }


def write_top_file(
    base_dir: Path,
    name: str,
    feature: str,
    meta: Dict[str, Any],
    items: List[Dict[str, Any]],
    warnings: List[str],
) -> Path:
    payload = build_envelope(
        feature=feature,
        meta=meta,
        data={"items": items},
        ok=meta.get("status") != "ERROR",
        warnings=warnings,
        error=None if meta.get("status") != "ERROR" else {"code": meta.get("reason"), "message": "RVCI error"},
    )
    path = base_dir / f"{name}.json"
    _write_json_atomic(path, payload)
    return path


def write_health(
    base_dir: Path,
    payload: Dict[str, Any],
) -> Path:
    path = base_dir / "health.json"
    _write_json_atomic(path, payload)
    return path


def write_universe_meta(base_dir: Path, payload: Dict[str, Any]) -> Path:
    path = base_dir / "universe_meta.json"
    _write_json_atomic(path, payload)
    return path


def write_latest(base_dir: Path, payload: Dict[str, Any]) -> Path:
    # Ensure rvci_latest.json always includes data.paths (UI requires it even when ok=false)
    try:
        if isinstance(payload, dict):
            data = payload.get('data')
            if not isinstance(data, dict):
                data = {}
                payload['data'] = data
            paths = data.get('paths')
            if not isinstance(paths, dict):
                data['paths'] = {
                    'short': 'data/rvci/rvci_top_short.json',
                    'mid': 'data/rvci/rvci_top_mid.json',
                    'long': 'data/rvci/rvci_top_long.json',
                    'triggers': 'data/rvci/rvci_triggers.json',
                    'health': 'data/rvci/health.json',
                }
    except Exception:
        pass

    path = base_dir.parent / "rvci_latest.json"
    _write_json_atomic(path, payload)
    return path
