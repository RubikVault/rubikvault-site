export const AUTHORITY_SCHEMA_VERSIONS = Object.freeze({
  state_db: 1,
  metrics: 'rv.pipeline_authority.metrics.v1',
  run_projection: 'rv.pipeline_authority.run_projection.v1',
  gate_registry: 'rv.pipeline_authority.gate_registry.v1',
  step_registry: 'rv.pipeline_authority.step_registry.v1',
  readiness_contracts: 'rv.pipeline_authority.readiness_contracts.v1',
  market_calendar_policy: 'rv.pipeline_authority.market_calendar_policy.v1',
  provider_lag_policy: 'rv.pipeline_authority.provider_lag_policy.v1',
  latest_pointer: 'rv.pipeline_authority.latest_pointer.v1',
});

export const AUTHORITATIVE_RELEASE_STATE_SCHEMAS = new Set(['rv_release_state_v3']);
export const LEGACY_RELEASE_STATE_SCHEMAS = new Set(['rv_release_state_v1']);
