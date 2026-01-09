# Blocks 26-43 (Package 3)

Purpose: Snapshot-only blocks 26-43. External calls happen only in the seeder. Runtime reads static snapshots.

## Block specs

26 - Earnings Pressure Lite
- id: earnings-pressure-lite
- provider: fmp
- requiredSecrets: FMP_API_KEY
- cadence: 6h
- maxRequestsPerRun: 1
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR snapshot on missing secret or provider error

27 - Insider Activity Lite
- id: insider-activity-lite
- provider: sec
- requiredSecrets: SEC_API_KEY
- cadence: 6h
- maxRequestsPerRun: 1
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR snapshot on missing secret or provider error

28 - Options Skew Lite
- id: options-skew-lite
- provider: finnhub
- requiredSecrets: FINNHUB_API_KEY
- cadence: 6h
- maxRequestsPerRun: 1
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR snapshot on missing secret or provider error

29 - Gamma Exposure Lite
- id: gamma-exposure-lite
- provider: internal
- cadence: 6h
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if options-skew-lite missing

30 - Flow Anomaly Lite
- id: flow-anomaly-lite
- provider: internal
- cadence: 6h
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if market-breadth missing

31 - Sentiment Lite
- id: sentiment-lite
- provider: marketaux
- requiredSecrets: MARKETAUX_API_KEY
- cadence: 6h
- maxRequestsPerRun: 1
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR snapshot on missing secret or provider error

32 - Social Velocity Lite
- id: social-velocity-lite
- provider: internal
- cadence: 6h
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if sentiment-lite missing

33 - Analyst Revision Lite
- id: analyst-revision-lite
- provider: fmp
- requiredSecrets: FMP_API_KEY
- cadence: 6h
- maxRequestsPerRun: 1
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR snapshot on missing secret or provider error

34 - Macro Risk Score
- id: macro-risk-score
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if macro snapshots missing

35 - Tail Risk Watch
- id: tail-risk-watch
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if vol/credit missing

36 - Liquidity Stress Watch
- id: liquidity-stress-watch
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if liquidity/credit missing

37 - Regime Fracture Alert
- id: regime-fracture-alert
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if regime/breadth missing

38 - Catalyst Calendar Lite
- id: catalyst-calendar-lite
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if earnings/macro snapshots missing

39 - Cross Asset Divergence
- id: cross-asset-divergence
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if FX/yield/sector snapshots missing

40 - Systemic Risk Lite
- id: systemic-risk-lite
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if stress or macro missing

41 - Weekly Market Brief
- id: weekly-market-brief
- provider: internal
- cadence: weekly
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if summary snapshots missing

42 - Alpha Radar Lite
- id: alpha-radar-lite
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 1, allowDegradedWrite true
- fallback: ERROR if momentum or trend missing

43 - Master Market Dashboard
- id: master-market-dashboard
- provider: internal
- cadence: daily
- maxRequestsPerRun: 0
- poison guard: minItems 12, allowDegradedWrite true
- fallback: ERROR if no snapshots available
