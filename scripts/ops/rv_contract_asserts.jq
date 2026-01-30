# Common helpers

def is_obj: type == "object";
def is_str: type == "string" and length > 0;
def is_bool: type == "boolean";
def has_str($k): (.[$k] | is_str);
def has_bool($k): (.[$k] | is_bool);

def manifest_assert:
  is_obj and has_str("schema_version") and has_str("build_id") and has_str("manifest_ref");

def mission_control_assert:
  is_obj
  and .schema_version == "3.0"
  and (.meta.status | is_str)
  and (.data.opsBaseline | is_obj)
  and (.data.opsBaseline.truthChain | is_obj)
  and ((.data.opsBaseline.truthChain.nasdaq100.steps | type) == "array")
  and ((.data.opsBaseline.truthChain.nasdaq100.steps | length) >= 6)
  and ((.data.opsBaseline.truthChain.nasdaq100.first_blocker | type) == "object" or .data.opsBaseline.truthChain.nasdaq100.first_blocker == null)
  and (.data.opsBaseline.runtime.schedulerExpected | is_bool)
  and (.data.opsBaseline.runtime.schedulerExpectedReason | is_str);

def debug_probe_assert($module):
  is_obj
  and ((.schema_version | type) == "string" or .schema_version == null)
  and (.debug == true)
  and (.module == $module)
  and ((.served_from | type) == "string")
  and (.served_from == "ASSET" or .served_from == "RUNTIME" or .served_from == "KV" or .served_from == "MAINTENANCE")
  and ((.asset_status | type) == "string")
  and (.asset_status == "HIT" or .asset_status == "MISS" or .asset_status == "ERROR")
  and (.proof_chain | is_obj)
  and (.proof_summary | is_str)
  and (.ok | type == "boolean")
  and (.meta.status | is_str);

def render_plan_asset_assert:
  is_obj
  and (.schema_version | is_str)
  and (.schema_version == "3.0");

def render_plan_snapshot_assert:
  is_obj
  and (.schema_version | is_str)
  and (.schema_version == "3.0");

def render_plan_state_assert:
  is_obj
  and (.schema_version | is_str)
  and (.schema_version == "3.0")
  and ((.module | type) == "string")
  and (.module == "render-plan")
  and ((.status | type) == "string")
  and (.status == "ok");
