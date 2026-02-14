(function attachStockUiExtras(globalScope) {
  'use strict';

  var MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function parseIsoDate(value) {
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    var parsed = Date.parse(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function safeGet(obj, path, fallback) {
    if (!obj || !path) return fallback;
    var parts = Array.isArray(path) ? path : String(path).split('.');
    var cursor = obj;
    for (var i = 0; i < parts.length; i += 1) {
      if (cursor == null || typeof cursor !== 'object' || !(parts[i] in cursor)) {
        return fallback;
      }
      cursor = cursor[parts[i]];
    }
    return cursor == null ? fallback : cursor;
  }

  function normalizeBars(input) {
    if (!Array.isArray(input)) return [];
    var rows = [];
    for (var i = 0; i < input.length; i += 1) {
      var row = input[i] || {};
      var date = parseIsoDate(row.date);
      var rawClose = toNumber(row.close);
      var adjClose = toNumber(row.adjClose);
      if (adjClose == null) {
        adjClose = toNumber(row.adj_close);
      }
      var calcClose = adjClose != null ? adjClose : rawClose;
      if (!date || calcClose == null) continue;
      var factor = rawClose != null && rawClose !== 0 ? calcClose / rawClose : 1;
      var openRaw = toNumber(row.open);
      var highRaw = toNumber(row.high);
      var lowRaw = toNumber(row.low);
      rows.push({
        date: date,
        open: openRaw == null ? null : openRaw * factor,
        high: highRaw == null ? null : highRaw * factor,
        low: lowRaw == null ? null : lowRaw * factor,
        close: calcClose,
        raw_close: rawClose,
        adj_close: calcClose,
        volume: toNumber(row.volume),
        dividend: toNumber(row.dividend),
        split: toNumber(row.split)
      });
    }
    rows.sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });

    // Keep the last row for duplicate trading dates.
    var deduped = [];
    for (var j = 0; j < rows.length; j += 1) {
      if (!deduped.length || deduped[deduped.length - 1].date !== rows[j].date) {
        deduped.push(rows[j]);
      } else {
        deduped[deduped.length - 1] = rows[j];
      }
    }
    return deduped;
  }

  function toIndicatorMap(indicators) {
    var map = {};
    if (!Array.isArray(indicators)) return map;
    for (var i = 0; i < indicators.length; i += 1) {
      var item = indicators[i] || {};
      if (typeof item.id !== 'string') continue;
      map[item.id] = item.value;
    }
    return map;
  }

  function normalizeStockEnvelope(apiStockResp) {
    var payload = apiStockResp && typeof apiStockResp === 'object' ? apiStockResp : {};
    var metaNode = payload.meta && typeof payload.meta === 'object'
      ? payload.meta
      : payload.metadata && typeof payload.metadata === 'object'
        ? payload.metadata
        : {};
    var dataNode = payload.data && typeof payload.data === 'object' ? payload.data : {};

    var bars = normalizeBars(dataNode.bars);
    var latestBar = dataNode.latest_bar && typeof dataNode.latest_bar === 'object'
      ? dataNode.latest_bar
      : bars.length
        ? bars[bars.length - 1]
        : null;

    var status = String(metaNode.status || safeGet(payload, 'metadata.status', 'UNKNOWN')).toUpperCase();
    var hasError = Boolean(payload.error);
    var ok = !hasError && (status === 'OK' || status === 'FRESH' || status === 'PARTIAL' || status === 'PENDING' || status === 'STALE');

    return {
      ok: ok,
      meta: {
        status: status,
        as_of: metaNode.asOf || safeGet(metaNode, 'as_of', null) || safeGet(payload, 'metadata.as_of', null),
        data_date: metaNode.data_date || null,
        generated_at: metaNode.generated_at || safeGet(payload, 'metadata.published_at', null),
        provider: metaNode.provider || safeGet(payload, 'metadata.telemetry.provider.selected', null),
        source_chain: safeGet(payload, 'metadata.source_chain', null),
        freshness: metaNode.freshness || null,
        digest: safeGet(payload, 'metadata.digest', null)
      },
      data: {
        ticker: dataNode.ticker || null,
        name: dataNode.name || null,
        bars: bars,
        latest_bar: latestBar,
        change: dataNode.change || { abs: null, pct: null },
        indicators: Array.isArray(dataNode.indicators) ? dataNode.indicators : [],
        indicator_map: toIndicatorMap(Array.isArray(dataNode.indicators) ? dataNode.indicators : [])
      },
      error: payload.error || null
    };
  }

  function computeReturnByOffset(bars, offset) {
    if (!Array.isArray(bars) || bars.length <= offset) return null;
    var latest = bars[bars.length - 1];
    var reference = bars[bars.length - 1 - offset];
    if (!latest || !reference) return null;
    if (!Number.isFinite(latest.close) || !Number.isFinite(reference.close) || reference.close === 0) return null;
    return (latest.close - reference.close) / reference.close;
  }

  function computeReturns(inputBars, windows) {
    var bars = normalizeBars(inputBars);
    if (!bars.length) {
      return { d1: null, w1: null, m1: null, m3: null, ytd: null, y1: null, y5: null };
    }

    var ranges = Object.assign({ d1: 1, w1: 5, m1: 21, m3: 63, y1: 252, y5: 1260 }, windows || {});
    var latest = bars[bars.length - 1];
    var out = {
      d1: computeReturnByOffset(bars, ranges.d1),
      w1: computeReturnByOffset(bars, ranges.w1),
      m1: computeReturnByOffset(bars, ranges.m1),
      m3: computeReturnByOffset(bars, ranges.m3),
      y1: computeReturnByOffset(bars, ranges.y1),
      y5: computeReturnByOffset(bars, ranges.y5),
      ytd: null
    };

    var latestYear = Number(String(latest.date).slice(0, 4));
    var ytdBase = null;
    for (var i = 0; i < bars.length; i += 1) {
      var row = bars[i];
      var year = Number(String(row.date).slice(0, 4));
      if (year === latestYear && Number.isFinite(row.close) && row.close !== 0) {
        ytdBase = row;
        break;
      }
    }
    if (ytdBase && Number.isFinite(latest.close) && Number.isFinite(ytdBase.close) && ytdBase.close !== 0) {
      out.ytd = (latest.close - ytdBase.close) / ytdBase.close;
    }

    return out;
  }

  function buildDailyReturns(inputBars) {
    var bars = normalizeBars(inputBars);
    var rows = [];
    for (var i = 1; i < bars.length; i += 1) {
      var prev = bars[i - 1];
      var curr = bars[i];
      if (!prev || !curr) continue;
      if (!Number.isFinite(prev.close) || !Number.isFinite(curr.close) || prev.close === 0) continue;
      rows.push({ date: curr.date, ret: (curr.close - prev.close) / prev.close });
    }
    return rows;
  }

  function average(values) {
    if (!Array.isArray(values) || !values.length) return null;
    var sum = 0;
    for (var i = 0; i < values.length; i += 1) sum += values[i];
    return sum / values.length;
  }

  function computeDistribution(inputBars, windowDays) {
    var useWindow = Number.isFinite(Number(windowDays)) ? Number(windowDays) : 90;
    var returns = buildDailyReturns(inputBars);
    if (returns.length > useWindow) returns = returns.slice(returns.length - useWindow);

    var positives = [];
    var negatives = [];
    for (var i = 0; i < returns.length; i += 1) {
      if (returns[i].ret > 0) positives.push(returns[i].ret);
      if (returns[i].ret < 0) negatives.push(returns[i].ret);
    }

    var edges = [-Infinity, -0.05, -0.02, -0.01, 0, 0.01, 0.02, 0.05, Infinity];
    var labels = ['<=-5%', '-5..-2%', '-2..-1%', '-1..0%', '0..1%', '1..2%', '2..5%', '>=5%'];
    var bins = labels.map(function (label) {
      return { range: label, count: 0 };
    });

    for (var j = 0; j < returns.length; j += 1) {
      var value = returns[j].ret;
      for (var k = 0; k < edges.length - 1; k += 1) {
        if (value > edges[k] && value <= edges[k + 1]) {
          bins[k].count += 1;
          break;
        }
      }
    }

    return {
      window_days: useWindow,
      sample_size: returns.length,
      win_rate: returns.length ? positives.length / returns.length : null,
      avg_up: average(positives),
      avg_down: average(negatives),
      bins: bins
    };
  }

  function computeSeasonality(inputBars, years) {
    var bars = normalizeBars(inputBars);
    var yearWindow = Number.isFinite(Number(years)) ? Number(years) : 5;
    var returns = buildDailyReturns(bars);
    if (!returns.length) {
      return {
        years_used: 0,
        monthly: MONTH_LABELS.map(function (label, idx) {
          return { month: label, month_index: idx + 1, avg_return: null, sample_size: 0 };
        })
      };
    }

    var latestDate = new Date(returns[returns.length - 1].date + 'T00:00:00Z');
    var cutoff = new Date(Date.UTC(latestDate.getUTCFullYear() - yearWindow, latestDate.getUTCMonth(), latestDate.getUTCDate()));

    var buckets = Array.from({ length: 12 }, function () { return []; });
    var minYear = latestDate.getUTCFullYear();
    var maxYear = latestDate.getUTCFullYear();

    for (var i = 0; i < returns.length; i += 1) {
      var row = returns[i];
      var date = new Date(row.date + 'T00:00:00Z');
      if (date < cutoff) continue;
      var month = date.getUTCMonth();
      buckets[month].push(row.ret);
      var year = date.getUTCFullYear();
      if (year < minYear) minYear = year;
      if (year > maxYear) maxYear = year;
    }

    return {
      years_used: Math.max(0, maxYear - minYear + 1),
      monthly: MONTH_LABELS.map(function (label, idx) {
        return {
          month: label,
          month_index: idx + 1,
          avg_return: average(buckets[idx]),
          sample_size: buckets[idx].length
        };
      })
    };
  }

  function computeSupportResistance(inputBars, window) {
    var bars = normalizeBars(inputBars);
    if (!bars.length) {
      return {
        high_52w: null,
        low_52w: null,
        pivot: null,
        resistance_1: null,
        resistance_2: null,
        support_1: null,
        support_2: null,
        drawdown_from_52w_high: null,
        distance_to_52w_low: null
      };
    }

    var useWindow = Number.isFinite(Number(window)) ? Number(window) : 252;
    var slice = bars.length > useWindow ? bars.slice(bars.length - useWindow) : bars.slice();
    var latest = slice[slice.length - 1];
    var ref = slice.length > 1 ? slice[slice.length - 2] : latest;

    var highs = slice.map(function (row) { return Number.isFinite(row.high) ? row.high : row.close; });
    var lows = slice.map(function (row) { return Number.isFinite(row.low) ? row.low : row.close; });
    var high52w = highs.length ? Math.max.apply(null, highs) : null;
    var low52w = lows.length ? Math.min.apply(null, lows) : null;

    var pivot = Number.isFinite(ref.high) && Number.isFinite(ref.low) && Number.isFinite(ref.close)
      ? (ref.high + ref.low + ref.close) / 3
      : Number.isFinite(latest.close)
        ? latest.close
        : null;

    var range = Number.isFinite(ref.high) && Number.isFinite(ref.low) ? ref.high - ref.low : null;
    var r1 = pivot != null && Number.isFinite(ref.low) ? 2 * pivot - ref.low : null;
    var s1 = pivot != null && Number.isFinite(ref.high) ? 2 * pivot - ref.high : null;
    var r2 = pivot != null && Number.isFinite(range) ? pivot + range : null;
    var s2 = pivot != null && Number.isFinite(range) ? pivot - range : null;

    var drawdown = (high52w && latest.close) ? (latest.close - high52w) / high52w : null;
    var distanceLow = (low52w && latest.close) ? (latest.close - low52w) / low52w : null;

    return {
      high_52w: high52w,
      low_52w: low52w,
      pivot: pivot,
      resistance_1: r1,
      resistance_2: r2,
      support_1: s1,
      support_2: s2,
      drawdown_from_52w_high: drawdown,
      distance_to_52w_low: distanceLow
    };
  }

  function computeGapStats(inputBars, threshold, window) {
    var bars = normalizeBars(inputBars);
    var useThreshold = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.02;
    var useWindow = Number.isFinite(Number(window)) ? Number(window) : 252;
    if (bars.length < 3) {
      return {
        threshold: useThreshold,
        window_days: useWindow,
        gaps_detected: 0,
        fill_rate: null,
        recent_gaps: []
      };
    }

    var scanBars = bars.length > (useWindow + 5) ? bars.slice(bars.length - (useWindow + 5)) : bars;
    var gaps = [];

    for (var i = 1; i < scanBars.length; i += 1) {
      var prev = scanBars[i - 1];
      var curr = scanBars[i];
      if (!Number.isFinite(prev.close) || prev.close === 0 || !Number.isFinite(curr.open)) continue;

      var gapPct = (curr.open - prev.close) / prev.close;
      if (Math.abs(gapPct) < useThreshold) continue;

      var filled = false;
      var fillDays = null;
      for (var j = i; j < Math.min(scanBars.length, i + 6); j += 1) {
        var probe = scanBars[j];
        if (!Number.isFinite(probe.high) || !Number.isFinite(probe.low)) continue;
        if (probe.low <= prev.close && probe.high >= prev.close) {
          filled = true;
          fillDays = j - i;
          break;
        }
      }

      gaps.push({
        date: curr.date,
        gap_pct: gapPct,
        direction: gapPct > 0 ? 'up' : 'down',
        prev_close: prev.close,
        open: curr.open,
        filled_within_5d: filled,
        fill_days: fillDays
      });
    }

    var filledCount = gaps.filter(function (row) { return row.filled_within_5d; }).length;

    return {
      threshold: useThreshold,
      window_days: useWindow,
      gaps_detected: gaps.length,
      fill_rate: gaps.length ? filledCount / gaps.length : null,
      recent_gaps: gaps.slice(Math.max(0, gaps.length - 5))
    };
  }

  var api = {
    safeGet: safeGet,
    normalizeBars: normalizeBars,
    normalizeStockEnvelope: normalizeStockEnvelope,
    toIndicatorMap: toIndicatorMap,
    computeReturns: computeReturns,
    computeDistribution: computeDistribution,
    computeSeasonality: computeSeasonality,
    computeSupportResistance: computeSupportResistance,
    computeGapStats: computeGapStats
  };

  globalScope.RVStockUIExtras = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
