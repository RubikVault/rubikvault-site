export const LIVE_BLOCKS = {
  "rv-news-headlines": {
    blockId: "rv-news-headlines",
    blockType: "LIVE",
    expectedMinItems: 1,
    mirrorFiles: ["news"],
    computeDependencies: [],
    freshness: { liveMaxMinutes: 60, okMaxHoursWeekday: 6, okMaxHoursWeekend: 12 },
    trustDefault: "raw",
    cadence: "best_effort",
    emptyCopy: "No news items in the current window.",
    warnCopy: "News mirror is stale.",
    whyUnique: "RSS-only, mirror-cached headlines."
  },
  "rv-crypto-snapshot": {
    blockId: "rv-crypto-snapshot",
    blockType: "LIVE",
    expectedMinItems: 1,
    mirrorFiles: ["crypto-snapshot"],
    computeDependencies: [],
    freshness: { liveMaxMinutes: 120, okMaxHoursWeekday: 12, okMaxHoursWeekend: 12 },
    trustDefault: "raw",
    cadence: "hourly",
    emptyCopy: "Crypto snapshot mirror is empty.",
    warnCopy: "Crypto snapshot is stale.",
    whyUnique: "24/7 crypto snapshot via mirror."
  },
  "rv-news-intelligence": {
    blockId: "rv-news-intelligence",
    blockType: "LIVE",
    expectedMinItems: 1,
    mirrorFiles: ["news-intelligence"],
    computeDependencies: ["news"],
    freshness: { liveMaxMinutes: 120, okMaxHoursWeekday: 6, okMaxHoursWeekend: 12 },
    trustDefault: "derived",
    cadence: "hourly",
    emptyCopy: "News intelligence mirror is empty.",
    warnCopy: "News intelligence is stale.",
    whyUnique: "Narrative sentiment summary for key themes."
  },
  "rv-sentiment-barometer": {
    blockId: "rv-sentiment-barometer",
    blockType: "LIVE",
    expectedMinItems: 1,
    mirrorFiles: ["sentiment"],
    computeDependencies: ["news"],
    freshness: { liveMaxMinutes: 120, okMaxHoursWeekday: 6, okMaxHoursWeekend: 12 },
    trustDefault: "heuristic",
    cadence: "hourly",
    emptyCopy: "Sentiment barometer mirror is empty.",
    warnCopy: "Sentiment barometer is stale.",
    whyUnique: "Heuristic sentiment gauge from news."
  }
};
