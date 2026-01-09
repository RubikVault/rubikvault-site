# Smoke Tests (Phase 0)

## JSON Envelope Smoke
```bash
rv_smoke_json_envelope() {
  local base="${1:-https://rubikvault.com}"
  curl -fsS "$base/api/top-movers?debug=1" \
    | jq '{ok, feature, metaStatus:.meta.status, itemsType:(.data.items|type)}'
}
```

Expected:
- `metaStatus` is a string
- `itemsType` is `"array"`

## og-image Passthrough Smoke
```bash
rv_smoke_og() {
  local base="${1:-https://rubikvault.com}"
  curl -sS -D - "$base/api/og-image?symbol=AAPL" -o /dev/null | sed -n '1,10p'
}
```

Expected:
- `HTTP/2 200`
- `Content-Type: image/svg+xml`

## Snapshot Smoke
```bash
rv_smoke_snapshot() {
  local base="${1:-https://rubikvault.com}"
  curl -fsS "$base/data/snapshots/us-yield-curve.json" | jq '{blockId, metaStatus:.meta.status, items:(.data.items|length)}'
  curl -fsS "$base/data/snapshots/sector-rotation.json" | jq '{blockId, metaStatus:.meta.status, items:(.data.items|length)}'
}
```

## Ops Dashboard
- `https://rubikvault.com/ops/usage.html`
