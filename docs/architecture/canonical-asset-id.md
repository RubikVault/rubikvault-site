# Canonical Asset ID

Stock Analyzer storage keys use the existing `{REGION}:{TICKER}` canonical ID format, for example `US:AAPL`, `US:BRK-B`, and `AS:AALB`.

## Rules

- Canonical IDs are uppercase exact keys.
- Query aliases must resolve through `public/data/symbol-resolve.v1.lookup.json`, `public/data/universe/v7/search/search_exact_by_symbol.json.gz`, or the canonical ID itself.
- `BRK-B` and `BRK.B` are distinct assets when both exist.
- Ambiguous aliases are omitted from page-core alias shards unless the resolver lookup already defines an exact mapping.

## Forbidden Normalization

Do not convert punctuation while resolving page-core aliases:

- no `replace('.', ':')`
- no `replace('-', '.')`
- no fallback from `BRK-B` to `BRK.B`
- no fallback from `BRK.B` to `BRK-B`

The legacy `findRecord` fallback in `functions/api/_shared/data-interface.js` is not allowed in `page-core-reader.js`.

## Protected Test Aliases

These aliases must stay exact:

- `BRK-B -> US:BRK-B`
- `BRK.B -> US:BRK.B`
- `BF-B -> US:BF-B`
- `BF.B -> US:BF.B`
- `AAPL -> US:AAPL`
