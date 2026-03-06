window.__RV_LEARNING_REPORT__ = {
  "schema": "rubikvault_daily_learning_report_v2",
  "date": "2026-03-06",
  "generated_at": "2026-03-06T03:12:47.133Z",
  "start_date": "2026-02-26",
  "days_active": 9,
  "summary": {
    "features_tracked": 4,
    "total_predictions_today": 5483,
    "overall_status": "BOOTSTRAP — Noch keine Outcome-Daten"
  },
  "features": {
    "forecast": {
      "name": "Forecast System v3.0",
      "type": "price_direction_probability",
      "predictions_total": 200,
      "outcomes_resolved": 200,
      "accuracy_all": 0.37,
      "brier_all": 0.2757,
      "hit_rate_all": 0.37,
      "accuracy_7d": 0.37,
      "brier_7d": 0.2757,
      "hit_rate_7d": 0.37,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 2425,
      "source_meta": {
        "source": "forecast_latest_envelope",
        "asof": "2026-03-06",
        "fresh": true,
        "stale_days": 0
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
      "predictions_today": 1558,
      "source_meta": {
        "source": "scientific_snapshot",
        "asof": "2026-03-05",
        "fresh": false,
        "stale_days": 1
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
      "predictions_today": 1500,
      "source_meta": {
        "source": "marketphase_per_symbol",
        "asof": "2026-03-05",
        "fresh": false,
        "stale_days": 1
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
      "this_week": 0.38,
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
    },
    {
      "date": "2026-03-06",
      "forecast_accuracy_7d": 0.37,
      "forecast_brier_7d": 0.2757,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": 0.6182,
      "stock_stability": null
    }
  ],
  "metrics": {
    "forecast_accuracy_7d": 0.37,
    "forecast_brier_7d": 0.2757,
    "scientific_accuracy_7d": null,
    "scientific_hit_rate_7d": null,
    "elliott_accuracy_7d": 0.6182,
    "stock_stability": null
  },
  "conviction_scores": [
    {
      "ticker": "ERAS",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.7551,
      "conviction_score": 0.7551
    },
    {
      "ticker": "ALMS",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.7324,
      "conviction_score": 0.7324
    },
    {
      "ticker": "TERN",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.7127,
      "conviction_score": 0.7127
    },
    {
      "ticker": "BIOA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6916,
      "conviction_score": 0.6916
    },
    {
      "ticker": "PRAX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6693,
      "conviction_score": 0.6693
    },
    {
      "ticker": "PVLA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.666,
      "conviction_score": 0.666
    },
    {
      "ticker": "CELC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6647,
      "conviction_score": 0.6647
    },
    {
      "ticker": "OLMA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6451,
      "conviction_score": 0.6451
    },
    {
      "ticker": "COGT",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.643,
      "conviction_score": 0.643
    },
    {
      "ticker": "ARWR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6392,
      "conviction_score": 0.6392
    },
    {
      "ticker": "CRVS",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6313,
      "conviction_score": 0.6313
    },
    {
      "ticker": "FET",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6305,
      "conviction_score": 0.6305
    },
    {
      "ticker": "NEOG",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6278,
      "conviction_score": 0.6278
    },
    {
      "ticker": "AGX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6254,
      "conviction_score": 0.6254
    },
    {
      "ticker": "EB",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6229,
      "conviction_score": 0.6229
    },
    {
      "ticker": "DNTH",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.622,
      "conviction_score": 0.622
    },
    {
      "ticker": "PL",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6212,
      "conviction_score": 0.6212
    },
    {
      "ticker": "OMER",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6177,
      "conviction_score": 0.6177
    },
    {
      "ticker": "LBRT",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6156,
      "conviction_score": 0.6156
    },
    {
      "ticker": "CGON",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6139,
      "conviction_score": 0.6139
    },
    {
      "ticker": "GOLD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6062,
      "conviction_score": 0.6062
    },
    {
      "ticker": "GLUE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6049,
      "conviction_score": 0.6049
    },
    {
      "ticker": "NHC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6049,
      "conviction_score": 0.6049
    },
    {
      "ticker": "MRNA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6036,
      "conviction_score": 0.6036
    },
    {
      "ticker": "PKST",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6035,
      "conviction_score": 0.6035
    },
    {
      "ticker": "NESR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6032,
      "conviction_score": 0.6032
    },
    {
      "ticker": "BORR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6013,
      "conviction_score": 0.6013
    },
    {
      "ticker": "KMT",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6005,
      "conviction_score": 0.6005
    },
    {
      "ticker": "MAZE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5999,
      "conviction_score": 0.5999
    },
    {
      "ticker": "NWPX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5997,
      "conviction_score": 0.5997
    },
    {
      "ticker": "FIGS",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5971,
      "conviction_score": 0.5971
    },
    {
      "ticker": "TNK",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5963,
      "conviction_score": 0.5963
    },
    {
      "ticker": "APGE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5957,
      "conviction_score": 0.5957
    },
    {
      "ticker": "GLDD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5954,
      "conviction_score": 0.5954
    },
    {
      "ticker": "ANDE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5945,
      "conviction_score": 0.5945
    },
    {
      "ticker": "ATNI",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5937,
      "conviction_score": 0.5937
    },
    {
      "ticker": "DX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5934,
      "conviction_score": 0.5934
    },
    {
      "ticker": "INSW",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5933,
      "conviction_score": 0.5933
    },
    {
      "ticker": "BKTI",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5927,
      "conviction_score": 0.5927
    },
    {
      "ticker": "BKD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5922,
      "conviction_score": 0.5922
    },
    {
      "ticker": "DAN",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.592,
      "conviction_score": 0.592
    },
    {
      "ticker": "IVR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5907,
      "conviction_score": 0.5907
    },
    {
      "ticker": "HSHP",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5903,
      "conviction_score": 0.5903
    },
    {
      "ticker": "ECPG",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5897,
      "conviction_score": 0.5897
    },
    {
      "ticker": "TCMD",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5897,
      "conviction_score": 0.5897
    },
    {
      "ticker": "SYRE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5895,
      "conviction_score": 0.5895
    },
    {
      "ticker": "MG",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5893,
      "conviction_score": 0.5893
    },
    {
      "ticker": "ANAB",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5885,
      "conviction_score": 0.5885
    },
    {
      "ticker": "NVRI",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5871,
      "conviction_score": 0.5871
    },
    {
      "ticker": "ORKA",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5858,
      "conviction_score": 0.5858
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
