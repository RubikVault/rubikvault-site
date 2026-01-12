from __future__ import annotations

from typing import Dict, List, Set


def evaluate_coverage(tiers: Dict[str, List[str]], received: Set[str]) -> dict:
    tier_a = set(tiers.get("A") or [])
    tier_b = set(tiers.get("B") or [])

    received_a = sorted(tier_a.intersection(received))
    received_b = sorted(tier_b.intersection(received))

    missing_a = sorted(tier_a.difference(received))
    missing_b = sorted(tier_b.difference(received))

    coverage_a = (len(received_a) / len(tier_a) * 100) if tier_a else 0.0
    coverage_b = (len(received_b) / len(tier_b) * 100) if tier_b else 0.0

    tier_status_a = "complete" if coverage_a >= 95 else "degraded"
    if not tier_b:
        tier_status_b = "skipped"
    else:
        tier_status_b = "complete" if coverage_b >= 80 else "partial"

    status = "LIVE" if tier_status_a == "complete" else "DEGRADED_COVERAGE"
    reason = "OK" if tier_status_a == "complete" else "DEGRADED_COVERAGE"

    return {
        "status": status,
        "reason": reason,
        "tierStatus": {"A": tier_status_a, "B": tier_status_b},
        "coveragePct": round(coverage_a, 2),
        "universe": {
            "expected": len(tier_a),
            "received": len(received_a),
            "missing": len(missing_a),
        },
        "missing": {"A": missing_a, "B": missing_b},
        "coverageB": round(coverage_b, 2),
    }
