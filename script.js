(() => {
  "use strict";

  // ---- RV_ADD namespace (additive) ----
  const RV_ADD = {
    cfg: {
      newsPollMs: 90000,
      filter: "all",
      maxShow: 10,
      dev: new URLSearchParams(location.search).get("dev") === "true"
    },
    state: {
      isFetchingNews: false,
      lastMeta: null,
      lastItems: []
    },

    els: {
      status: null,
      refreshBtn: null,
      newsUpdated: null,
      newsList: null,
      cheatUpdated: null,
      heat: null
    },

    init() {
      this.els.status = document.getElementById("rv-add-status");
      this.els.refreshBtn = document.getElementById("rv-add-refresh");
      this.els.newsUpdated = document.getElementById("rv-add-news-updated");
      this.els.newsList = document.getElementById("rv-add-news-list");
      this.els.cheatUpdated = document.getElementById("rv-add-cheat-updated");
      this.els.heat = document.getElementById("rv-add-heat");

      // If the add-zone isn't present, do nothing (keeps site safe)
      if (!this.els.newsList || !this.els.status) return;

      this.els.refreshBtn?.addEventListener("click", () => {
        this.fetchNews({ nocache: true }).catch(() => {});
      });

      // Pause polling in background tabs
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          this.fetchNews({ nocache: false }).catch(() => {});
        }
      });

      // Initial load + polling
      this.fetchNews({ nocache: false }).catch(() => {});
      setInterval(() => {
        if (!document.hidden) this.fetchNews({ nocache: false }).catch(() => {});
      }, this.cfg.newsPollMs);
    },

    async fetchNews({ nocache }) {
      if (this.state.isFetchingNews) return;
      this.state.isFetchingNews = true;

      try {
        const qs = new URLSearchParams();
        qs.set("filter", this.cfg.filter);
        if (nocache) qs.set("nocache", "1");

        const res = await fetch(`/api/news?${qs.toString()}`, { method: "GET" });
        if (!res.ok) throw new Error(`news_http_${res.status}`);

        const data = await res.json();
        this.state.lastMeta = data.meta || null;
        this.state.lastItems = Array.isArray(data.items) ? data.items : [];

        this.renderNews();
        this.renderCheatHeatmap();
      } catch (e) {
        this.setStatus("SOURCE DOWN", "down");
        if (this.cfg.dev) console.error("RV_ADD news error:", e);
        this.renderNewsError();
      } finally {
        this.state.isFetchingNews = false;
      }
    },

    setStatus(text, mode) {
      const meta = this.state.lastMeta;
      const cached = meta && meta.cached === true;

      let dotClass = "live";
      if (mode === "down") dotClass = "down";
      else if (cached) dotClass = "cached";

      const pill = `
        <span class="rv-add-pill">
          <span class="rv-add-pill-dot ${dotClass}"></span>
          ${this.escape(text)}
        </span>
      `;

      this.els.status.innerHTML = pill;
    },

    renderNews() {
      const meta = this.state.lastMeta;
      const items = this.state.lastItems.slice(0, this.cfg.maxShow);

      const generatedAt = meta?.generatedAt ? new Date(meta.generatedAt) : null;
      const timeStr = generatedAt ? generatedAt.toLocaleTimeString() : "—";

      const cached = meta?.cached === true;
      this.setStatus(cached ? "CACHED" : "LIVE", "ok");

      if (this.els.newsUpdated) {
        this.els.newsUpdated.textContent = `Updated: ${timeStr}`;
      }
      if (this.els.cheatUpdated) {
        this.els.cheatUpdated.textContent = `Updated: ${timeStr}`;
      }

      this.els.newsList.innerHTML = items.map((it) => {
        const title = this.escape(it.title || "");
        const link = this.escape(it.url || "#");
        const source = this.escape(it.source || "source");
        const when = this.timeAgo(it.publishedAt);

        return `
          <li class="rv-add-item">
            <a href="${link}" target="_blank" rel="noopener noreferrer">
              <div class="rv-add-item-title">${title}</div>
              <div class="rv-add-item-meta">
                <span>${source}</span>
                <span>•</span>
                <span>${when}</span>
              </div>
            </a>
          </li>
        `;
      }).join("");
    },

    renderNewsError() {
      if (!this.els.newsList) return;
      this.els.newsList.innerHTML = `
        <li class="rv-add-item">
          <div class="rv-add-item-title">No data right now.</div>
          <div class="rv-add-item-meta">
            <span>Either sources are down or blocked.</span>
            <span>Try again later.</span>
          </div>
        </li>
      `;
    },

    renderCheatHeatmap() {
      if (!this.els.heat) return;

      // Deterministic "narrative heatmap": keyword frequency in titles
      const titles = this.state.lastItems.map((x) => String(x.title || "")).join(" ").toLowerCase();

      const KEYWORDS = [
        "inflation","cpi","ppi","rates","fed","ecb","boe","yield","bond","recession",
        "earnings","guidance","revenue","profit","downgrade","upgrade","merger",
        "bitcoin","ethereum","solana","etf","hack","regulation","sec","spot"
      ];

      const scored = KEYWORDS.map((k) => {
        const re = new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "g");
        const count = (titles.match(re) || []).length;
        return { k, count };
      }).filter(x => x.count > 0);

      scored.sort((a, b) => b.count - a.count);

      const top = scored.slice(0, 18);
      if (!top.length) {
        this.els.heat.innerHTML = `<span class="rv-add-small">No strong narratives detected in the last batch.</span>`;
        return;
      }

      this.els.heat.innerHTML = top.map(x => {
        return `<span class="rv-add-heat-tag">${this.escape(x.k)} • ${x.count}</span>`;
      }).join("");
    },

    timeAgo(iso) {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return `${s}s ago`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 48) return `${h}h ago`;
      const days = Math.floor(h / 24);
      return `${days}d ago`;
    },

    escape(s) {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => RV_ADD.init());
  } else {
    RV_ADD.init();
  }
})();