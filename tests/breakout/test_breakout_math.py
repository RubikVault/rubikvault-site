import unittest

from scripts.breakout_compute.lib.breakout_math import (
    compute_component_scores,
    first_touch_outcome,
    stable_event_id,
)


class BreakoutMathTest(unittest.TestCase):
    def test_event_id_is_stable_and_joinable(self):
        self.assertEqual(
            stable_event_id("US:AAPL", "2026-04-27", "breakout_scoring_v1.2"),
            "US:AAPL|2026-04-27|breakout_scoring_v1.2",
        )

    def test_component_score_has_no_probability_or_state(self):
        score = compute_component_scores(
            {
                "distance_to_resistance_atr": 0.1,
                "price_position_20d_range": 0.95,
                "rvol_percentile_asset_252d": 0.9,
                "rvol_percentile_sector_252d": 0.92,
                "atr_compression_percentile_252d": 0.2,
                "sector_relative_strength_63d": 0.8,
                "liquidity_score": 0.9,
                "regime_multiplier": 1.0,
            },
            {
                "weights": {
                    "structure": 0.30,
                    "volume": 0.25,
                    "compression": 0.15,
                    "relative_strength": 0.15,
                    "liquidity": 0.10,
                    "regime": 0.05,
                },
                "clamps": {"regime_multiplier_min": 0.70, "regime_multiplier_max": 1.15},
                "reason_thresholds": {
                    "high_volume_percentile": 0.80,
                    "compressed_atr_percentile_max": 0.35,
                    "relative_strength_min": 0.65,
                    "liquidity_min": 0.60,
                },
            },
        )
        self.assertGreater(score["final_signal_score"], 0.7)
        self.assertIn("near_resistance", score["_reasons"])
        self.assertNotIn("probability", score)
        self.assertNotIn("state", score)

    def test_first_touch_outcome_prefers_stop_when_same_bar_ambiguous(self):
        out = first_touch_outcome(
            [{"open_raw": 100, "high_raw": 103, "low_raw": 98, "close_raw": 101}],
            entry_price=100,
            atr=1,
            horizon=10,
            target_atr=2,
            stop_atr=1,
            gap_event_threshold_atr=2,
        )
        self.assertEqual(out["first_touch"], "stop")
        self.assertTrue(out["stop_hit"])
        self.assertFalse(out["target_hit"])


if __name__ == "__main__":
    unittest.main()
