# 04 Policies Created and Hashes

All hashes are embedded in-policy (`policy_hash`) and validated at runtime by `scripts/forecast/v6/run_daily_v6.mjs:111-117`.

## Hash Inventory
- `policies/forecast/v6/policy.v6.json:4` `sha256:fd620f078615504381c14daee769021fc3ad9a003c8096b7d4c697f09b374d9d`
- `policies/forecast/v6/feature_policy.v6.json:4` `sha256:b87f87cb01f2357311538b780e7d6ecc0c89c611b0d873e70ef803cd33d45073`
- `policies/forecast/v6/feature_store_policy.v6.json:4` `sha256:45aacc1eb49201cf60313d76b6b1fa1a1141424627e755d896c43caf2b4addfe`
- `policies/forecast/v6/split_policy.v6.json:4` `sha256:97bebc757e1b245474eb47b3a331a82c62d264ba264635579c8726436ea8846b`
- `policies/forecast/v6/outcome_policy.v6.0.json:4` `sha256:f8c9357d8055f2d88249ecb234ca73b2b40ec46e2674cc09ebdbafd57128c0d2`
- `policies/forecast/v6/corporate_actions_policy.v6.json:4` `sha256:b4f9d11f83ebf23fe0f81991a369acc928c9d756a7e674301ae7489167b9a90e`
- `policies/forecast/v6/calibration_policy.v6.json:4` `sha256:5c3db13145727f62aae1b4e94f44fd2a8d089cd3d22e61cd3c43d25ef29c834b`
- `policies/forecast/v6/moe_policy.v6.json:4` `sha256:273b22bc80fc1ab46994fcf2051d38360a5b424dde033808b49dab74be312743`
- `policies/forecast/v6/moe_state_policy.v6.json:4` `sha256:16f033b00a12467d472568c14bc0dd8db8e4bc00f0151064a088148c146d9e96`
- `policies/forecast/v6/monitoring_policy.v6.json:4` `sha256:e60f0c81004d02257ff463c2f073a093e7442f59a84ba50fbe1a166e782b419b`
- `policies/forecast/v6/promotion_policy.v6.json:4` `sha256:6566f9ac4e9f1acce24a3c9257709a9a7d6d824e68b742ca13d8373cd8a68e9c`
- `policies/forecast/v6/feasibility_policy.v6.json:4` `sha256:844c9f6b61bfb95cfac46d3b9fd4cced8a4c0b6745f22a6e6df47cee8697af6d`
- `policies/forecast/v6/secrecy_policy.v6.json:4` `sha256:6cc4a4c782427f087a99e55d102df296e4be20867082593082868e1f106a44e1`
- `policies/forecast/v6/memory_policy.v6.json:4` `sha256:58df09061e0ad81fed7536f8b7f984795a4a5a4b6dfb16a283a6ae8d7cb9592b`
- `policies/forecast/v6/disaster_recovery_policy.v6.json:4` `sha256:07fc34c8e19a1007186a97c79ae18a906dec1d9b7807a282923f92aa97f29177`
- `policies/forecast/v6/trading_calendar_policy.v6.json:4` `sha256:850c3a0669becf0a23c630027398b469d9df3b21a34a8e0697ffca0514f389ea`
- `policies/forecast/v6/stratification_fallback_policy.v6.json:4` `sha256:bb880c93089810bc58d2572fc30cb17caca8ea59c47e5789584b4ea216464564`

## Model Card Hash/Policy Binding
- `mirrors/forecast/models/champion/model_card.v6.json:6-24` records policy hash map in model metadata.
- `mirrors/forecast/models/champion/model_card.v6.json:27-31` stores vault-based weight reference (no absolute path).
