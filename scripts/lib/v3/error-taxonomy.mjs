export function classifyError(error, policyDoc) {
  const message = String(error?.message || error || "unknown_error");
  const lower = message.toLowerCase();

  const taxonomy = policyDoc?.taxonomy || {};

  const matchAny = (terms = []) =>
    terms.some((term) => lower.includes(String(term).toLowerCase()));

  if (matchAny(["429", "timeout", "network", "5xx", "temporar"])) {
    return {
      kind: "transient",
      subtype: taxonomy.transient?.find((x) => lower.includes(x.replace("http_", ""))) || "network",
      action: "retry"
    };
  }

  if (matchAny(["auth", "api_key", "api key", "forbidden", "blocked endpoint", "policy"])) {
    const subtype =
      lower.includes("blocked") || lower.includes("endpoint")
        ? "endpoint_blocked"
        : lower.includes("forbidden")
          ? "auth_invalid"
          : "auth_missing";
    return {
      kind: "permanent",
      subtype,
      action: policyDoc?.actions?.auth_missing || "circuit_open"
    };
  }

  if (matchAny(["schema", "coverage", "stale", "adjust"])) {
    let subtype = "schema_violation";
    if (lower.includes("coverage")) subtype = "coverage_gap";
    if (lower.includes("stale")) subtype = "stale_data";
    if (lower.includes("adjust")) subtype = "adjustment_error";
    return {
      kind: "data_quality",
      subtype,
      action: policyDoc?.actions?.[subtype] || "discard_batch_use_last_good"
    };
  }

  return {
    kind: "transient",
    subtype: "network",
    action: "retry"
  };
}

export function shouldOpenCircuit(history = [], classification, policyDoc) {
  const openAfter = policyDoc?.circuit_rules?.open_after || {};
  const needed = Number(openAfter[classification.kind] || 1);
  const recent = history.slice(-needed);
  if (recent.length < needed) return false;
  return recent.every((item) => item.kind === classification.kind);
}

export function shouldCloseCircuit(successHistory = [], policyDoc) {
  const cfg = policyDoc?.circuit_rules?.close_after || {};
  const needed = Number(cfg.successful_runs || 2);
  if (successHistory.length < needed) return false;
  return successHistory.slice(-needed).every(Boolean);
}
