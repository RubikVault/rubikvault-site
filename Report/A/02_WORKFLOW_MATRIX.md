# Workflow Matrix (20/20 Coverage)

| Workflow | Purpose / Value | Overlap | Root cause evidence | Fix applied | Verification | Status |
|---|---|---|---|---|---|---|
| `ci-determinism.yml` | Determinism quality gate (MED) | Low | Historical fails in v10; latest sample success `21829656537` | None in v11 | GH history check | KEEP |
| `ci-gates.yml` | Core CI quality/budget gate (HIGH) | Low | Historical mixed rates; latest sample success `21829656562` | None in v11 | GH history check | KEEP |
| `ci-policy.yml` | Forecast policy check (MED) | Low | Latest success `21883064544` | None | GH history | KEEP |
| `cleanup-daily-snapshots.yml` | Maintenance cleanup (LOW) | Medium | Healthy | None | GH history | KEEP |
| `e2e-playwright.yml` | UI regression gate (MED) | Medium | Run `21829656565`: element not found + waitForResponse timeout | None yet | Log signature captured | REPAIR (P2) |
| `eod-history-refresh.yml` | Historical EOD backfill (MED/HIGH) | Low | Healthy | None | GH history | KEEP |
| `eod-latest.yml` | Core daily market data producer (HIGH) | Low | Prior fail `21844075239`: `expected=100 but fetched=0`; now green | Provider chain + never-empty + diagnostics | `21921265115` success | REPAIR -> GREEN |
| `forecast-daily.yml` | Daily forecast publish (HIGH) | Low | Prior fail `21766433410`: missing price data 80.7% | Upstream EOD rescue + writer concurrency | `21921267096` success | REPAIR -> GREEN |
| `forecast-monthly.yml` | Monthly report (MED) | Low | No active failure in v11 | Added permissions+concurrency | YAML + history | KEEP |
| `forecast-rollback.yml` | Manual rollback utility (MED) | Low | No recent runs | None | Inventory only | KEEP (manual) |
| `forecast-weekly.yml` | Weekly training/promotion (HIGH) | Low | No v11 fail evidence | Added concurrency hardening | YAML + history | KEEP |
| `monitor-prod.yml` | Production contract monitor (HIGH) | Low | Prior fail `21918758188`: curl 403 | WAF-safe repo contracts + optional remote mode | `21921263170` success | REPAIR -> GREEN |
| `ops-auto-alerts.yml` | Alerting automation (MED) | Low | Healthy | None | GH history | KEEP |
| `ops-daily.yml` | Ops snapshots/mission-control (HIGH) | Low | `21921377474`: `CF_API_TOKEN is missing` | Fail-loud preflight preserved | Failing with explicit reason | BLOCKED_EXTERNAL |
| `refresh-health-assets.yml` | Health artifact refresh (MED) | Medium | Prior ENOENT history in v10; now green | Seed fallback + concurrency | `21921271185` success | REPAIR -> GREEN |
| `scheduler-kick.yml` | Pipeline orchestrator trigger (HIGH) | Low | Prior fail `21919890642`: WAF 403 + Cloudflare challenge HTML | GitHub-native dispatch (no public endpoint POST) | `21921261343` success | REPAIR -> GREEN |
| `universe-refresh.yml` | Universe producer (MED/HIGH) | Low | Healthy/manual | Added concurrency | YAML + history | KEEP |
| `v3-finalizer.yml` | Publishes core snapshots (HIGH current-state) | Medium | Mixed historical failures | Guard/path fixes already applied | `21921485186` success | REPAIR -> GREEN |
| `v3-scrape-template.yml` | Upstream module scrape for v3 chain (HIGH current-state) | Medium | Historical ENOENT modules/universe and validation failures | Module fallback, artifact reuse, concurrency | Latest `21922258342` partial then fail in market-stats pipeline | REPAIR (ongoing) |
| `wp16-manual-market-prices.yml` | Manual emergency market-prices publish (LOW/MED) | High (overlaps v3 scrape) | `21922259282`: validation drop-threshold violated | Provider mode hardening; still gate-fails | Latest failure reproducible | BLOCKED_EXTERNAL_DATA_QUALITY / ARCHIVE-CANDIDATE |

## Notes
- `Ops Daily` and `WP16 Manual` are not unknown failures; both fail-loud with explicit signatures.
- `v3-scrape-template` has no unknown blocker left; remaining failure is in quality/finalization path after scrape succeeds.
