# Scenario Matrix

| Scenario | Check/Type | Result | Details |
|---|---|---|---|
| S0 | api_stock | PASS | OK |
| S0 | mission_control | PASS | OK |
| S0 | ui_trace | PASS | OK |
| S1 | api_stock_debug | PASS | OK |
| S2_TRACE_BASE_INTEGRITY | winning_path_relative+base_match | FAIL | path=/api/stock?ticker=UBER base_url=https://cf4b6652.rubikvault-site.pages.dev base_match=false |
| S3_CONTRACT_CONSISTENCY | OPS_P6_OK | FAIL | {"checked_path":"data.latest_bar","required_fields":["date","close","volume"],"per_ticker":{"UBER":{"ok":false,"missing_fields":[],"type_errors":["date_format"],"sample_values":null},"TEAM":{"ok":false,"missing_fields":[],"type_errors":["date_format"],"sample_values":null},"WBD":{"ok":false,"missing |
| S4_DEGRADE_SIM | degrade_mode | NOT_AVAILABLE | no degrade toggle detected |
