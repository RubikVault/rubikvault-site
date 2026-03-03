window.__RV_LEARNING_REPORT__ = {
  "schema": "rubikvault_daily_learning_report_v2",
  "date": "2026-03-03",
  "generated_at": "2026-03-03T12:06:14.575Z",
  "start_date": "2026-02-26",
  "days_active": 6,
  "summary": {
    "features_tracked": 4,
    "total_predictions_today": 2569,
    "overall_status": "BOOTSTRAP — Noch keine Outcome-Daten"
  },
  "features": {
    "forecast": {
      "name": "Forecast System v3.0",
      "type": "price_direction_probability",
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
      "predictions_today": 2425,
      "source_meta": {
        "source": "forecast_latest_envelope",
        "asof": "2026-03-02",
        "fresh": false,
        "stale_days": 1
      }
    },
    "scientific": {
      "name": "Scientific Analyzer v9.1",
      "type": "setup_trigger_breakout",
      "predictions_total": 1,
      "outcomes_resolved": 1,
      "accuracy_all": 0,
      "brier_all": 0.2809,
      "hit_rate_all": 0,
      "accuracy_7d": 0,
      "brier_7d": 0.2809,
      "hit_rate_7d": 0,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 60,
      "source_meta": {
        "source": "scientific_summary",
        "asof": "2026-02-20",
        "fresh": false,
        "stale_days": 11
      }
    },
    "elliott": {
      "name": "Elliott Waves DFMSIF v1.0",
      "type": "wave_direction_forecast",
      "predictions_total": 78,
      "outcomes_resolved": 78,
      "accuracy_all": 0.5385,
      "brier_all": 0.2688,
      "hit_rate_all": 0.5385,
      "accuracy_7d": 0.5385,
      "brier_7d": 0.2688,
      "hit_rate_7d": 0.5385,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 84,
      "source_meta": {
        "source": "marketphase_deep_summary",
        "asof": "2026-02-28",
        "fresh": false,
        "stale_days": 3
      }
    },
    "stock_analyzer": {
      "name": "Stock Analyzer",
      "type": "ranking_stability",
      "stability": null,
      "churn": null,
      "rankings_today": 200,
      "source_meta": {
        "source": "v7_stock_rows",
        "asof": "2026-02-23",
        "fresh": false,
        "stale_days": 8
      }
    }
  },
  "weekly_comparison": {
    "forecast": {
      "this_week": null,
      "last_week": null
    },
    "scientific": {
      "this_week": 0,
      "last_week": null
    },
    "elliott": {
      "this_week": 0.5385,
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
      "date": "2026-02-28",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": null,
      "stock_stability": null
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
      "date": "2026-03-03",
      "forecast_accuracy_7d": null,
      "forecast_brier_7d": null,
      "scientific_accuracy_7d": 0,
      "scientific_hit_rate_7d": 0,
      "elliott_accuracy_7d": 0.5385,
      "stock_stability": null
    }
  ],
  "metrics": {
    "forecast_accuracy_7d": null,
    "forecast_brier_7d": null,
    "scientific_accuracy_7d": 0,
    "scientific_hit_rate_7d": 0,
    "elliott_accuracy_7d": 0.5385,
    "stock_stability": null
  },
  "conviction_scores": [
    {
      "ticker": "ABCB",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.5335,
      "conviction_score": 0.3557
    },
    {
      "ticker": "ADAM",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.5282,
      "conviction_score": 0.3521
    },
    {
      "ticker": "ACU",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.5238,
      "conviction_score": 0.3492
    },
    {
      "ticker": "ACGL",
      "direction": "bearish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4855,
      "conviction_score": 0.3236
    },
    {
      "ticker": "INTC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4824,
      "conviction_score": 0.3216
    },
    {
      "ticker": "WBD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4691,
      "conviction_score": 0.3127
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
      "avg_confidence": 0.4656,
      "conviction_score": 0.3104
    },
    {
      "ticker": "AMAT",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4645,
      "conviction_score": 0.3096
    },
    {
      "ticker": "ON",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4644,
      "conviction_score": 0.3096
    },
    {
      "ticker": "CSCO",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.46,
      "conviction_score": 0.3066
    },
    {
      "ticker": "MCHP",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4599,
      "conviction_score": 0.3066
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
      "avg_confidence": 0.4589,
      "conviction_score": 0.3059
    },
    {
      "ticker": "GEHC",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4362,
      "conviction_score": 0.2908
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
      "avg_confidence": 0.4362,
      "conviction_score": 0.2908
    },
    {
      "ticker": "COST",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4357,
      "conviction_score": 0.2904
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
      "avg_confidence": 0.4352,
      "conviction_score": 0.2901
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
      "avg_confidence": 0.4277,
      "conviction_score": 0.2851
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
      "avg_confidence": 0.42,
      "conviction_score": 0.28
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
      "avg_confidence": 0.4176,
      "conviction_score": 0.2784
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
      "avg_confidence": 0.4171,
      "conviction_score": 0.278
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
      "avg_confidence": 0.4169,
      "conviction_score": 0.2779
    },
    {
      "ticker": "TXN",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4166,
      "conviction_score": 0.2777
    },
    {
      "ticker": "ADI",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4103,
      "conviction_score": 0.2735
    },
    {
      "ticker": "GILD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.408,
      "conviction_score": 0.272
    },
    {
      "ticker": "SBUX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.4077,
      "conviction_score": 0.2718
    },
    {
      "ticker": "KHC",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 1,
      "avg_confidence": 0.3719,
      "conviction_score": 0.2479
    },
    {
      "ticker": "ACTG",
      "direction": "bearish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4877,
      "conviction_score": 0.1626
    },
    {
      "ticker": "ADCT",
      "direction": "bearish",
      "sources": [
        "forecast",
        "scientific"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4462,
      "conviction_score": 0.1487
    },
    {
      "ticker": "NXPI",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.441,
      "conviction_score": 0.147
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
      "avg_confidence": 0.4391,
      "conviction_score": 0.1464
    },
    {
      "ticker": "LIN",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4205,
      "conviction_score": 0.1402
    },
    {
      "ticker": "DXCM",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4173,
      "conviction_score": 0.1391
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
      "avg_confidence": 0.4144,
      "conviction_score": 0.1381
    },
    {
      "ticker": "CDW",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4143,
      "conviction_score": 0.1381
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
      "avg_confidence": 0.4134,
      "conviction_score": 0.1378
    },
    {
      "ticker": "PCAR",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4121,
      "conviction_score": 0.1374
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
      "avg_confidence": 0.4102,
      "conviction_score": 0.1367
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
      "avg_confidence": 0.4095,
      "conviction_score": 0.1365
    },
    {
      "ticker": "MELI",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.409,
      "conviction_score": 0.1363
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
      "avg_confidence": 0.4044,
      "conviction_score": 0.1348
    },
    {
      "ticker": "CDNS",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4041,
      "conviction_score": 0.1347
    },
    {
      "ticker": "SNPS",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4038,
      "conviction_score": 0.1346
    },
    {
      "ticker": "PAYX",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.4018,
      "conviction_score": 0.1339
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
      "avg_confidence": 0.3998,
      "conviction_score": 0.1333
    },
    {
      "ticker": "TTD",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3982,
      "conviction_score": 0.1327
    },
    {
      "ticker": "CSGP",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3962,
      "conviction_score": 0.1321
    },
    {
      "ticker": "AXON",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3951,
      "conviction_score": 0.1317
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
      "avg_confidence": 0.3928,
      "conviction_score": 0.1309
    },
    {
      "ticker": "TRI",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3915,
      "conviction_score": 0.1305
    },
    {
      "ticker": "XEL",
      "direction": "bearish",
      "sources": [
        "forecast",
        "elliott"
      ],
      "source_count": 2,
      "consensus_strength": 0.5,
      "avg_confidence": 0.3903,
      "conviction_score": 0.1301
    }
  ],
  "stock_forward_returns": {
    "top50_count": 50,
    "tracked": 0,
    "avg_market_return_today": 0.0139
  },
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
