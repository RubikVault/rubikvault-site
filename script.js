const $ = (sel) => document.querySelector(sel);

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n)}%`;
}

async function loadQuotes() {
  const hint = $("#quotesHint");
  hint.textContent = "Loading…";

  const tickers = ["AAPL", "MSFT", "NVDA", "TSLA"];
  const url = `/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    for (const t of tickers) {
      const q = data?.quotes?.[t];
      const valEl = document.querySelector(`[data-quote="${t}"]`);
      const chgEl = document.querySelector(`[data-change="${t}"]`);
      if (!valEl || !chgEl) continue;

      if (!q) {
        valEl.textContent = "—";
        chgEl.textContent = "—";
        chgEl.classList.remove("good", "bad");
        continue;
      }

      valEl.textContent = q.price !== null ? fmtNum(q.price) : "—";
      chgEl.textContent = q.changePct !== null ? fmtPct(q.changePct) : "—";
      chgEl.classList.remove("good", "bad");
      if (q.changePct !== null) {
        chgEl.classList.add(q.changePct >= 0 ? "good" : "bad");
      }
    }

    hint.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    hint.textContent = `Quotes error: ${e.message}`;
  }
}

function buildTickerItems(items) {
  // Duplizieren => “Endlos”-Scroll ohne Jump
  const safe = items.slice(0, 12);
  const doubled = safe.concat(safe);

  const track = $("#newsTrack");
  track.innerHTML = "";
  for (const it of doubled) {
    const span = document.createElement("span");
    span.className = "ticker-item";
    const a = document.createElement("a");
    a.href = it.link || "#";
    a.target = "_blank";
    a.rel = "nofollow noopener";
    a.textContent = it.title || "—";
    span.appendChild(a);
    track.appendChild(span);
  }
}

async function loadNews() {
  const hint = $("#newsHint");
  hint.textContent = "Loading…";

  try {
    const res = await fetch("/api/news", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) throw new Error("No items returned");

    buildTickerItems(items);
    hint.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    hint.textContent = `News error: ${e.message}`;
    buildTickerItems([{ title: "News currently unavailable (API error).", link: "#" }]);
  }
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/service-worker.js");
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();

  $("#refreshQuotes")?.addEventListener("click", loadQuotes);
  $("#refreshNews")?.addEventListener("click", loadNews);

  loadQuotes();
  loadNews();
  registerSW();
});