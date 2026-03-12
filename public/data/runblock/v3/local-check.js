window.__RUNBLOCK_V3_LOCAL_CHECK__ = {
  "generated_at": "2026-03-12T17:19:49.899Z",
  "status": "PASS",
  "summary": {
    "runblock_tests_green": true,
    "sample_pipeline_green": true,
    "weekly_model_wired": true,
    "snapshot_persisted": true,
    "audit_logs_persisted": true,
    "elliott_v1_v2_gates_wired": true,
    "explainability_enforced": true,
    "forecast_model_type_missing_blocks": true
  },
  "test_summary": {
    "exit_code": 0,
    "pass": 51,
    "fail": 0,
    "stderr": ""
  },
  "scripts_summary": {
    "preflight_exit_code": 0,
    "daily_exit_code": 0,
    "weekly_exit_code": 0,
    "leakage_ci_exit_code": 0,
    "shadow_exit_code": 0,
    "audit_replay_exit_code": 0
  },
  "pipeline": {
    "ticker": "MALLPLAZA.SN",
    "global_state": "GREEN",
    "halted": false,
    "halt_reason": null,
    "snapshot_id": "c47814fc-f8d2-4830-b590-783301fe700b",
    "snapshot_path": "/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/v3/snapshots/2026-03-02/MALLPLAZA.SN_c47814fc-f8d2-4830-b590-783301fe700b.json",
    "decision_log_count": 3,
    "incident_count": 0,
    "effective_regime_tag": "RANGE",
    "scientific_state": "ACTIVE",
    "forecast_state": "ACTIVE",
    "elliott_state": "PASSIVE"
  },
  "artifacts": {
    "yaml_configs": [
      {
        "path": "config/runblock/pipeline_config.yaml",
        "present": true
      },
      {
        "path": "config/runblock/regime_config.yaml",
        "present": true
      },
      {
        "path": "config/runblock/promotion_config.yaml",
        "present": true
      },
      {
        "path": "config/runblock/liquidity_buckets.yaml",
        "present": true
      },
      {
        "path": "config/runblock/audit_config.yaml",
        "present": true
      },
      {
        "path": "config/runblock/fallback_config.yaml",
        "present": true
      }
    ],
    "scripts": [
      {
        "path": "scripts/runblock/preflight-checks.mjs",
        "present": true
      },
      {
        "path": "scripts/runblock/daily-regime-run.mjs",
        "present": true
      },
      {
        "path": "scripts/runblock/weekly-regime-run.mjs",
        "present": true
      },
      {
        "path": "scripts/runblock/shadow-canary-evaluation.mjs",
        "present": true
      },
      {
        "path": "scripts/runblock/audit-replay.mjs",
        "present": true
      },
      {
        "path": "scripts/runblock/leakage-ci.mjs",
        "present": true
      }
    ],
    "docs": [
      {
        "path": "docs/runblock-v3/architecture.md",
        "present": true
      },
      {
        "path": "docs/runblock-v3/operational-runbook.md",
        "present": true
      },
      {
        "path": "docs/runblock-v3/config-fields.md",
        "present": true
      },
      {
        "path": "docs/runblock-v3/state-transitions.md",
        "present": true
      },
      {
        "path": "docs/runblock-v3/audit-replay.md",
        "present": true
      }
    ]
  },
  "latest_outputs": {
    "preflight": {
      "generated_at": "2026-03-12T17:19:49.564Z",
      "status": "PASS",
      "pipeline_order_ok": true,
      "loaded_configs": [
        "pipeline_config",
        "regime_config",
        "promotion_config",
        "liquidity_buckets",
        "audit_config",
        "fallback_config"
      ],
      "missing_artifacts": []
    },
    "daily_regime": {
      "generated_at": "2026-03-12T17:19:49.643Z",
      "ticker": "MALLPLAZA.SN",
      "market_data": {
        "vix": 18,
        "vix_prev": 17,
        "sp500_5d_return": 1.2,
        "hy_spread_delta_bp": 4
      },
      "result": {
        "regime": "NORMAL",
        "breached": [],
        "confidence": 0.9
      }
    },
    "weekly_regime": {
      "generated_at": "2026-03-12T17:19:49.714Z",
      "ticker": "MALLPLAZA.SN",
      "weekly_feature_count": 6,
      "result": {
        "regime_tag": "RANGE",
        "regime_confidence": 0.9689102590590317,
        "regime_version": "runblock.v3",
        "shift_detected": true,
        "fallback_used": false,
        "fallback_reason": null,
        "min_global_state": null
      }
    },
    "leakage_ci": {
      "generated_at": "2026-03-12T17:19:49.761Z",
      "status": "PASS",
      "leakage": {
        "pass": true,
        "violations": []
      },
      "purge_embargo": {
        "pass": true,
        "violations": []
      }
    },
    "shadow": {
      "generated_at": "2026-03-12T17:19:49.831Z",
      "shadow_mode_min_days": 14,
      "blockers": [],
      "decision": {
        "promote": true,
        "reason": "net_return_and_brier_improved"
      },
      "champion": {
        "net_return_after_costs": 0.021,
        "brier_score": 0.22,
        "calibration_error": 0.04
      },
      "challenger": {
        "net_return_after_costs": 0.036,
        "brier_score": 0.19,
        "calibration_error": 0.032
      }
    },
    "audit_replay": {
      "generated_at": "2026-03-12T17:19:49.892Z",
      "status": "PASS",
      "log_path": "/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/v3/audit/decisions/2026-03-12/MALLPLAZA.SN_f9d439e9-02a2-4395-8e9c-20f4666606c9.json",
      "snapshot_path": "/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/v3/snapshots/2026-03-02/MALLPLAZA.SN_c47814fc-f8d2-4830-b590-783301fe700b.json",
      "replay": {
        "ticker": "MALLPLAZA.SN",
        "feature_name": "elliott",
        "snapshot_id": "c47814fc-f8d2-4830-b590-783301fe700b",
        "feature_hash": "8cc9cf7a0d13c80fe004052da3c6f62a5d80977b7ee6a04a647845347de8e961",
        "regime_tag": "RANGE",
        "global_system_state": "GREEN",
        "dependency_trace": {
          "source_data_versions": {
            "primary_feed": "sample.primary.v1",
            "secondary_feed": "sample.secondary.v1"
          },
          "feature_versions": {
            "runblock": "runblock.v3.features"
          },
          "rule_versions": {
            "runblock": "runblock.v3.rules"
          },
          "regime_version": "runblock.v3",
          "model_version": {
            "scientific": "scientific.rf.v3",
            "forecast": "forecast.xgb.v3",
            "elliott": "elliott.passive.v1"
          },
          "calibration_version": {
            "scientific": "scientific.cal.v3",
            "forecast": "forecast.cal.v3"
          },
          "cost_model_version": "runblock.cost.v3",
          "ui_payload_version": "runblock.ui.v3"
        },
        "prediction_payload": {
          "model_version": "elliott.passive.v1",
          "has_directional_score": false,
          "invalidation_delay_days": 1,
          "confluence_hit_rate": 0.56,
          "flip_frequency": 0.18,
          "passive_structure_map": "Range floor holding with upside alternatives intact.",
          "fib_confluence_zones": [
            "104.5-105.3",
            "108.8-109.4"
          ],
          "invalidation_levels": [
            "99.2"
          ],
          "timeframe_conflict_score": 0.21,
          "alternative_structure_hypotheses": [
            "extended wave-B range"
          ],
          "confluence_score": 0.58,
          "structural_confidence": 0.62,
          "request_directional": false,
          "reason_codes": [
            "V1_PASSIVE_ONLY"
          ],
          "state": "PASSIVE",
          "directional_score": null,
          "direction_label": null,
          "no_directional": true,
          "gate": {
            "allowed": true,
            "mode": "PASSIVE",
            "no_directional": true,
            "reason_codes": [
              "V1_PASSIVE_ONLY"
            ]
          }
        },
        "snapshot_features": {
          "close": 124.83,
          "volume": 298000,
          "adv_usd": 37199340,
          "regime_fast": "NORMAL",
          "regime_weekly": "RANGE",
          "regime_confidence": 0.9689102590590317,
          "data_quality_state": "PASS"
        }
      }
    }
  },
  "local_links": {
    "page_file": "/Users/michaelpuchowezki/Dev/rubikvault-site/public/runblock-v3-local-check.html",
    "data_file": "/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/runblock/v3/local-check.json"
  }
};
