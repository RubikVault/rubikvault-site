# B2 Contracts and Schemas — v2.1 Lawbook Audit

## Summary Endpoint Contract (`/api/mission-control/summary`)

### v2.1 Normative Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MissionControlSummary",
  "type": "object",
  "required": ["ok", "meta", "data"],
  "properties": {
    "ok": { "type": "boolean" },
    "schema_version": { "const": "3.0" },
    "meta": {
      "type": "object",
      "required": ["status", "generated_at", "data_date", "provider"],
      "properties": {
        "status": { "type": "string", "enum": ["fresh", "stale", "error", "pending", "closed"] },
        "reason": { "type": ["string", "null"] },
        "generated_at": { "type": "string", "format": "date-time" },
        "data_date": { "type": "string" },
        "provider": { "type": "string" }
      }
    },
    "data": {
      "type": "object",
      "required": ["system", "health"],
      "properties": {
        "system": { "$ref": "#/definitions/SystemHealth" },
        "health": {
          "type": "object",
          "properties": {
            "system": { "$ref": "#/definitions/SystemHealth" }
          }
        },
        "cards": {
          "type": "object",
          "properties": {
            "system": { "$ref": "#/definitions/SystemHealth" }
          }
        }
      }
    }
  },
  "definitions": {
    "SystemHealth": {
      "type": "object",
      "required": ["status", "reason"],
      "properties": {
        "status": { "type": "string" },
        "reason": { "type": "string" },
        "checks": { "type": "array" },
        "action": { "type": "object" }
      }
    }
  }
}
```

### Contract Compliance Evidence

| Field | Required | Present | Value | Status |
|-------|----------|---------|-------|--------|
| `ok` | ✅ | ✅ | `true` | PASS |
| `schema_version` | ✅ | ✅ | `"3.0"` | PASS |
| `meta.status` | ✅ | ✅ | `"fresh"` | PASS |
| `meta.generated_at` | ✅ | ✅ | ISO timestamp | PASS |
| `meta.data_date` | ✅ | ✅ | Date string | PASS |
| `meta.provider` | ✅ | ✅ | String | PASS |
| `data.system` | ✅ | ✅ | Object | PASS |
| `data.system.status` | ✅ | ✅ | `"STALE"` | PASS |
| `data.system.reason` | ✅ | ✅ | `"PENDING"` | PASS |
| `data.health.system` | Alias | ✅ | Bit-identical | PASS |
| `data.cards.system` | Alias | ✅ | Bit-identical | PASS |

### Optional Fields (Not Required)

| Field | Present | Notes |
|-------|---------|-------|
| `meta.ok` | ❌ | Not referenced by any consumer |
| `meta.http_status` | ❌ | Not referenced by any consumer |

**Recommendation**: Mark as `OPTIONAL` in v2.1 spec. No implementation needed.

---

## Stock Endpoint Contract (`/api/stock`)

### Required Fields
| Field | Type | Present | Value |
|-------|------|---------|-------|
| `ok` | boolean | ✅ | `true` |
| `meta.status` | string | ✅ | `"fresh"` |
| `data.latest_bar.date` | string | ✅ | `"2026-02-04"` |
| `data.latest_bar.close` | number | ✅ | `73.92` |
| `data.latest_bar.volume` | number | ✅ | `62829558` |

**Verdict**: PASS

---

## Schema File Locations

| Schema | Path | Exists |
|--------|------|--------|
| Summary | `schemas/api/mission-control.summary.schema.json` | ❌ (proposed) |
| Stock | `schemas/api/stock.schema.json` | ❌ (proposed) |
| ops_health policy | `policies/ops_health.json` | ✅ |

---

## Gaps Summary

| Priority | Gap | Recommendation |
|----------|-----|----------------|
| P1 | No schema validation in CI | Add schema file + ajv validation step |
| P2 | meta.ok/meta.http_status undefined | Document as optional (no consumer) |
