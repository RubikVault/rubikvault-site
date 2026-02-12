export default {
    "schema_version": "1.0",
    "providers_version": "v1",
    "notes": [
        "Prices are fetched EOD only.",
        "EODHD is the ONLY supported provider for equity EOD (history + latest).",
        "Legacy providers (alphavantage, twelvedata) are disabled for equities.",
        "Provider selection is config-driven. No source mixing per symbol per run."
    ],
    "eod_chain": {
        "primary": "eodhd",
        "secondary": "eodhd"
    },
    "providers": [
        {
            "id": "eodhd",
            "name": "EODHD",
            "alias": "E",
            "kind": "eodhd_eod",
            "base_url": "https://eodhd.com/api",
            "auth_env_var": "EODHD_API_KEY",
            "default_throttle_ms": 1000,
            "burst_cap": 5,
            "timeout_ms": 20000,
            "cooldown_minutes_default": 5,
            "min_delay_ms_default": 200,
            "jitter_ms_default": 500,
            "enabled": true,
            "role": "primary",
            "rate_limits": {
                "requests_per_day": 100000,
                "requests_per_minute": 1000
            }
        },
        {
            "id": "alphavantage",
            "name": "Alpha Vantage",
            "alias": "A",
            "kind": "alpha_vantage_eod",
            "base_url": "https://www.alphavantage.co/query",
            "auth_env_var": "ALPHAVANTAGE_API_KEY",
            "enabled": false,
            "role": "legacy_disabled",
            "note": "Disabled for equities — EODHD is SSOT"
        },
        {
            "id": "twelvedata",
            "name": "Twelve Data",
            "alias": "B",
            "kind": "twelve_data_eod",
            "base_url": "https://api.twelvedata.com",
            "auth_env_var": "TWELVEDATA_API_KEY",
            "enabled": false,
            "role": "legacy_disabled",
            "note": "Disabled for equities — EODHD is SSOT"
        }
    ],
    "chains": {
        "prices_eod": [
            {
                "id": "eodhd",
                "kind": "eodhd_eod",
                "enabled": true
            }
        ]
    }
};
