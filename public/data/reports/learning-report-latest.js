window.__RV_LEARNING_REPORT__ = {
  "schema": "rubikvault_daily_learning_report_v2",
  "date": "2026-03-05",
  "generated_at": "2026-03-05T03:14:00.670Z",
  "start_date": "2026-02-26",
  "days_active": 8,
  "summary": {
    "features_tracked": 4,
    "total_predictions_today": 2503,
    "overall_status": "BOOTSTRAP — Noch keine Outcome-Daten"
  },
  "features": {
    "forecast": {
      "name": "Forecast System v3.0",
      "type": "price_direction_probability",
      "predictions_total": 100,
      "outcomes_resolved": 100,
      "accuracy_all": 0.39,
      "brier_all": 0.2765,
      "hit_rate_all": 0.39,
      "accuracy_7d": 0.39,
      "brier_7d": 0.2765,
      "hit_rate_7d": 0.39,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 2425,
      "source_meta": {
        "source": "forecast_latest_envelope",
        "asof": "2026-03-04",
        "fresh": false,
        "stale_days": 1
      }
    },
    "scientific": {
      "name": "Scientific Analyzer v9.1",
      "type": "setup_trigger_breakout",
      "predictions_total": 0,
      "outcomes_resolved": 0,
      "accuracy_all": null,
      "brier_all": null,
      "hit_rate_all": null,
      "accuracy_7d": null,
      "brier_7d": null,
      "hit_rate_7d": null,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 0,
      "source_meta": {
        "source": "scientific_summary",
        "asof": null,
        "fresh": false,
        "stale_days": null
      }
    },
    "elliott": {
      "name": "Elliott Waves DFMSIF v1.0",
      "type": "wave_direction_forecast",
      "predictions_total": 55,
      "outcomes_resolved": 55,
      "accuracy_all": 0.6182,
      "brier_all": 0.243,
      "hit_rate_all": 0.6182,
      "accuracy_7d": 0.6182,
      "brier_7d": 0.243,
      "hit_rate_7d": 0.6182,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 78,
      "source_meta": {
        "source": "marketphase_deep_summary",
        "asof": "2026-02-28",
        "fresh": false,
        "stale_days": 5
      }
    },
    "stock_analyzer": {
      "name": "Stock Analyzer",
      "type": "ranking_stability",
      "stability": null,
      "churn": null,
      "rankings_today": 0,
      "source_meta": {
        "source": "v7_stock_rows",
        "asof": null,
        "fresh": false,
        "stale_days": null
      }
    }
  },
  "weekly_comparison": {
    "forecast": {
      "this_week": 0.39,
      "last_week": null
    },
    "scientific": {
      "this_week": null,
      "last_week": null
    },
    "elliott": {
      "this_week": 0.6182,
      "last_week": null
    }
  },
  "history": [
    {
      "date": "2026-02-26",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": null,
      "stock_stability": null
    },
    {
      "date": "2026-02-27",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": null,
      "stock_stability": 1
    },
    {
      "date": "2026-03-02",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": null,
      "stock_stability": null
    },
    {
      "date": "2026-03-04",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": 0.6182,
      "stock_stability": null
    },
    {
      "date": "2026-03-05",
      "forecast_accuracy_7d": 0.39,
      "forecast_brier_7d": 0.2765,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": 0.6182,
      "stock_stability": null
    }
  ],
  "metrics": {
    "forecast_accuracy_7d": 0.39,
    "forecast_brier_7d": 0.2765,
    "scientific_accuracy_7d": null,
    "scientific_hit_rate_7d": null,
    "elliott_accuracy_7d": 0.6182,
    "stock_stability": null
  },
  "conviction_scores": [
    {
      "ticker": "INTC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4727,
      "conviction_score": 0.3151
    },
    {
      "ticker": "ASML",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4707,
      "conviction_score": 0.3138
    },
    {
      "ticker": "EA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4615,
      "conviction_score": 0.3077
    },
    {
      "ticker": "REGN",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.46,
      "conviction_score": 0.3067
    },
    {
      "ticker": "BIIB",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4576,
      "conviction_score": 0.305
    },
    {
      "ticker": "MU",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4349,
      "conviction_score": 0.2899
    },
    {
      "ticker": "CTAS",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4224,
      "conviction_score": 0.2816
    },
    {
      "ticker": "LRCX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4221,
      "conviction_score": 0.2814
    },
    {
      "ticker": "KDP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4205,
      "conviction_score": 0.2803
    },
    {
      "ticker": "KLAC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4161,
      "conviction_score": 0.2774
    },
    {
      "ticker": "PDD",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4155,
      "conviction_score": 0.277
    },
    {
      "ticker": "PCAR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4148,
      "conviction_score": 0.2766
    },
    {
      "ticker": "GOOG",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4121,
      "conviction_score": 0.2747
    },
    {
      "ticker": "GOOGL",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.412,
      "conviction_score": 0.2746
    },
    {
      "ticker": "CCEP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3911,
      "conviction_score": 0.2607
    },
    {
      "ticker": "MDLZ",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3707,
      "conviction_score": 0.2471
    },
    {
      "ticker": "DXCM",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3644,
      "conviction_score": 0.2429
    },
    {
      "ticker": "CDW",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3597,
      "conviction_score": 0.2398
    },
    {
      "ticker": "TTWO",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3496,
      "conviction_score": 0.233
    },
    {
      "ticker": "TEAM",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3411,
      "conviction_score": 0.2274
    },
    {
      "ticker": "TRI",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.34,
      "conviction_score": 0.2267
    },
    {
      "ticker": "MCHP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.478,
      "conviction_score": 0.1593
    },
    {
      "ticker": "ON",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4761,
      "conviction_score": 0.1587
    },
    {
      "ticker": "WBD",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4752,
      "conviction_score": 0.1584
    },
    {
      "ticker": "BKR",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4629,
      "conviction_score": 0.1543
    },
    {
      "ticker": "IDXX",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4407,
      "conviction_score": 0.1469
    },
    {
      "ticker": "GEHC",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4398,
      "conviction_score": 0.1466
    },
    {
      "ticker": "EXC",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4229,
      "conviction_score": 0.141
    },
    {
      "ticker": "APP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4181,
      "conviction_score": 0.1394
    },
    {
      "ticker": "AMAT",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4158,
      "conviction_score": 0.1386
    },
    {
      "ticker": "GILD",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4131,
      "conviction_score": 0.1377
    },
    {
      "ticker": "SHOP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4132,
      "conviction_score": 0.1377
    },
    {
      "ticker": "GFS",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4098,
      "conviction_score": 0.1366
    },
    {
      "ticker": "AMZN",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4087,
      "conviction_score": 0.1362
    },
    {
      "ticker": "CSX",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4081,
      "conviction_score": 0.136
    },
    {
      "ticker": "CHTR",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4076,
      "conviction_score": 0.1359
    },
    {
      "ticker": "SBUX",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4077,
      "conviction_score": 0.1359
    },
    {
      "ticker": "CRWD",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4056,
      "conviction_score": 0.1352
    },
    {
      "ticker": "QCOM",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4029,
      "conviction_score": 0.1343
    },
    {
      "ticker": "UBER",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3986,
      "conviction_score": 0.1329
    },
    {
      "ticker": "ADSK",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3983,
      "conviction_score": 0.1328
    },
    {
      "ticker": "INTU",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3917,
      "conviction_score": 0.1306
    },
    {
      "ticker": "NVDA",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3886,
      "conviction_score": 0.1295
    },
    {
      "ticker": "VRSK",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3881,
      "conviction_score": 0.1294
    },
    {
      "ticker": "COST",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3862,
      "conviction_score": 0.1287
    },
    {
      "ticker": "AVGO",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3824,
      "conviction_score": 0.1275
    },
    {
      "ticker": "ISRG",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3758,
      "conviction_score": 0.1253
    },
    {
      "ticker": "META",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3718,
      "conviction_score": 0.1239
    },
    {
      "ticker": "CTSH",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3685,
      "conviction_score": 0.1228
    },
    {
      "ticker": "ORLY",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3661,
      "conviction_score": 0.1221
    }
  ],
  "stock_forward_returns": null,
  "improvements_active": [
    "forecast_calibration_feedback",
    "forecast_adaptive_confidence",
    "scientific_signal_threshold_60",
    "scientific_setup_decay_10d",
    "elliott_quality_filter_top500",
    "stock_ema_smoothing_alpha03",
    "cross_feature_conviction",
    "scientific_atr_breakout_threshold"
  ]
};
