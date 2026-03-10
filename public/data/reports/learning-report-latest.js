window.__RV_LEARNING_REPORT__ = {
  "schema": "rubikvault_daily_learning_report_v2",
  "date": "2026-03-10",
  "generated_at": "2026-03-10T03:10:51.847Z",
  "start_date": "2026-02-26",
  "days_active": 13,
  "summary": {
    "features_tracked": 4,
    "total_predictions_today": 5332,
    "overall_status": "BOOTSTRAP — Noch keine Outcome-Daten"
  },
  "features": {
    "forecast": {
      "name": "Forecast System v3.0",
      "type": "price_direction_probability",
      "predictions_total": 2625,
      "outcomes_resolved": 2625,
      "accuracy_all": 0.5223,
      "brier_all": 0.2431,
      "hit_rate_all": 0.5223,
      "accuracy_7d": 0.5223,
      "brier_7d": 0.2431,
      "hit_rate_7d": 0.5223,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 2425,
      "source_meta": {
        "source": "forecast_latest_envelope",
        "asof": "2026-03-09",
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
      "predictions_today": 1407,
      "source_meta": {
        "source": "scientific_snapshot",
        "asof": "2026-03-09",
        "fresh": false,
        "stale_days": 1
      }
    },
    "elliott": {
      "name": "Elliott Waves DFMSIF v1.0",
      "type": "wave_direction_forecast",
      "predictions_total": 217,
      "outcomes_resolved": 217,
      "accuracy_all": 0.5161,
      "brier_all": 0.2781,
      "hit_rate_all": 0.5161,
      "accuracy_7d": 0.5161,
      "brier_7d": 0.2781,
      "hit_rate_7d": 0.5161,
      "trend_accuracy": "no_data",
      "trend_brier": "no_data",
      "predictions_today": 1500,
      "source_meta": {
        "source": "marketphase_per_symbol",
        "asof": "2026-03-09",
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
      "this_week": 0.4512,
      "last_week": null
    },
    "scientific": {
      "this_week": null,
      "last_week": null
    },
    "elliott": {
      "this_week": 0.5792,
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
    },
    {
      "date": "2026-03-07",
      "forecast_accuracy_7d": 0.5223,
      "forecast_brier_7d": 0.2431,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": 0.5252,
      "stock_stability": null
    },
    {
      "date": "2026-03-10",
      "forecast_accuracy_7d": 0.5223,
      "forecast_brier_7d": 0.2431,
      "scientific_accuracy_7d": null,
      "scientific_hit_rate_7d": null,
      "elliott_accuracy_7d": 0.5161,
      "stock_stability": null
    }
  ],
  "metrics": {
    "forecast_accuracy_7d": 0.5223,
    "forecast_brier_7d": 0.2431,
    "scientific_accuracy_7d": null,
    "scientific_hit_rate_7d": null,
    "elliott_accuracy_7d": 0.5161,
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
      "avg_confidence": 0.7533,
      "conviction_score": 0.7533
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
      "avg_confidence": 0.7239,
      "conviction_score": 0.7239
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
      "avg_confidence": 0.7051,
      "conviction_score": 0.7051
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
      "avg_confidence": 0.6829,
      "conviction_score": 0.6829
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
      "avg_confidence": 0.6717,
      "conviction_score": 0.6717
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
      "avg_confidence": 0.6602,
      "conviction_score": 0.6602
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
      "avg_confidence": 0.6339,
      "conviction_score": 0.6339
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
      "avg_confidence": 0.6298,
      "conviction_score": 0.6298
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
      "avg_confidence": 0.6268,
      "conviction_score": 0.6268
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
      "avg_confidence": 0.6258,
      "conviction_score": 0.6258
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
      "avg_confidence": 0.6231,
      "conviction_score": 0.6231
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
      "avg_confidence": 0.6209,
      "conviction_score": 0.6209
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
      "avg_confidence": 0.6191,
      "conviction_score": 0.6191
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
      "avg_confidence": 0.6187,
      "conviction_score": 0.6187
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
      "avg_confidence": 0.6098,
      "conviction_score": 0.6098
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
      "avg_confidence": 0.6075,
      "conviction_score": 0.6075
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
      "avg_confidence": 0.6057,
      "conviction_score": 0.6057
    },
    {
      "ticker": "CENX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.6054,
      "conviction_score": 0.6054
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
      "avg_confidence": 0.6026,
      "conviction_score": 0.6026
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
      "avg_confidence": 0.5976,
      "conviction_score": 0.5976
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
      "avg_confidence": 0.5972,
      "conviction_score": 0.5972
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
      "avg_confidence": 0.5963,
      "conviction_score": 0.5963
    },
    {
      "ticker": "KW",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.596,
      "conviction_score": 0.596
    },
    {
      "ticker": "SPHR",
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
      "ticker": "AMRX",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5939,
      "conviction_score": 0.5939
    },
    {
      "ticker": "ATLO",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5939,
      "conviction_score": 0.5939
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
      "avg_confidence": 0.5936,
      "conviction_score": 0.5936
    },
    {
      "ticker": "LINC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5932,
      "conviction_score": 0.5932
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
      "ticker": "SYRE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5901,
      "conviction_score": 0.5901
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
      "avg_confidence": 0.5882,
      "conviction_score": 0.5882
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
      "avg_confidence": 0.5879,
      "conviction_score": 0.5879
    },
    {
      "ticker": "PINE",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5877,
      "conviction_score": 0.5877
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
      "avg_confidence": 0.5873,
      "conviction_score": 0.5873
    },
    {
      "ticker": "HP",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5872,
      "conviction_score": 0.5872
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
      "avg_confidence": 0.5859,
      "conviction_score": 0.5859
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
      "avg_confidence": 0.585,
      "conviction_score": 0.585
    },
    {
      "ticker": "OIS",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5824,
      "conviction_score": 0.5824
    },
    {
      "ticker": "NATR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5817,
      "conviction_score": 0.5817
    },
    {
      "ticker": "OVBC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5816,
      "conviction_score": 0.5816
    },
    {
      "ticker": "DSGN",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5813,
      "conviction_score": 0.5813
    },
    {
      "ticker": "PKBK",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5812,
      "conviction_score": 0.5812
    },
    {
      "ticker": "ISTR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5811,
      "conviction_score": 0.5811
    },
    {
      "ticker": "ARR",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5809,
      "conviction_score": 0.5809
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
      "avg_confidence": 0.5809,
      "conviction_score": 0.5809
    },
    {
      "ticker": "HAL",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5808,
      "conviction_score": 0.5808
    },
    {
      "ticker": "NKSH",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5803,
      "conviction_score": 0.5803
    },
    {
      "ticker": "MRBK",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5802,
      "conviction_score": 0.5802
    },
    {
      "ticker": "SMC",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5796,
      "conviction_score": 0.5796
    },
    {
      "ticker": "PUMP",
      "direction": "bullish",
      "sources": [
        "forecast",
        "scientific",
        "elliott"
      ],
      "source_count": 3,
      "consensus_strength": 1,
      "avg_confidence": 0.5793,
      "conviction_score": 0.5793
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
