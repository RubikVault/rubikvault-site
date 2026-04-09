(function () {
  const payload = window.MONITORING_DATA || {};
  const daily = payload.daily || null;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const hotWindows = Array.isArray(payload.hotWindows) ? payload.hotWindows : [];
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const charts = new Map();

  function byId(id) {
    return document.getElementById(id);
  }

  function levelClass(level) {
    const value = String(level || "unknown").toLowerCase();
    if (value === "ok") return "ok";
    if (value === "warn") return "warn";
    if (value === "crit") return "crit";
    return "unknown";
  }

  function fmtNumber(value, digits = 1) {
    if (value == null || value === "") return "n/a";
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    return num.toFixed(digits);
  }

  function fmtDate(value) {
    if (!value) return "Keine Daten";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("de-DE");
  }

  function createMetric(label, value) {
    const box = document.createElement("div");
    box.className = "metric";
    box.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    return box;
  }

  function emptyNode(canvasId) {
    return byId(`${canvasId}-empty`);
  }

  function setChartEmpty(canvasId, message) {
    const canvas = byId(canvasId);
    const empty = emptyNode(canvasId);
    if (canvas) {
      canvas.hidden = true;
    }
    if (empty) {
      empty.hidden = false;
      empty.textContent = message;
    }
    const chart = charts.get(canvasId);
    if (chart) {
      chart.destroy();
      charts.delete(canvasId);
    }
  }

  function setChartReady(canvasId) {
    const canvas = byId(canvasId);
    const empty = emptyNode(canvasId);
    if (canvas) {
      canvas.hidden = false;
    }
    if (empty) {
      empty.hidden = true;
    }
  }

  function renderStatus() {
    byId("generated-at").textContent = fmtDate(payload.generatedAt || daily?.generated_at);
    const status = String(daily?.overall_status || "UNKNOWN").toUpperCase();
    const pill = byId("status-pill");
    pill.textContent = status;
    pill.className = `status-pill is-${levelClass(status)}`;
    byId("summary-text").textContent = daily?.summary || "Noch keine Snapshot-Daten vorhanden.";

    const metrics = byId("today-metrics");
    metrics.innerHTML = "";
    metrics.appendChild(createMetric("CPU", `${fmtNumber(daily?.system?.load_15, 2)} / ${daily?.system?.cpu_status || "n/a"}`));
    metrics.appendChild(createMetric("RAM", `${fmtNumber(daily?.ram?.used_pct, 1)} % / ${daily?.ram?.status || "n/a"}`));
    metrics.appendChild(createMetric("Volume", `${fmtNumber(daily?.storage?.used_pct, 1)} % / ${daily?.storage?.status || "n/a"}`));
    metrics.appendChild(createMetric("RAID", `${daily?.raid?.status || "n/a"}`));
  }

  function renderLists() {
    const eventsList = byId("events-list");
    eventsList.innerHTML = "";
    if (!events.length) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Keine Events</strong><span class="muted">Es liegen noch keine Event-Daten vor.</span>`;
      eventsList.appendChild(li);
    } else {
      events.slice(0, 18).forEach((event) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="level ${levelClass(event.level)}">${event.level || "INFO"}</div>
          <strong>${event.message || "-"}</strong>
          <time>${fmtDate(event.timestamp)}</time>
        `;
        eventsList.appendChild(li);
      });
    }

    const hotList = byId("hot-windows");
    hotList.innerHTML = "";
    if (!hotWindows.length) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Keine Hotspots</strong><span class="muted">Noch keine wiederkehrenden Repo-/Job-Fenster erkannt.</span>`;
      hotList.appendChild(li);
    } else {
      hotWindows.forEach((entry) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <strong>${entry.window || "n/a"}</strong>
          <span>${entry.message || ""}</span>
          <span class="muted mono">${(entry.topProcesses || []).join(" | ") || "keine korrelierten Repo-Prozesse"}</span>
        `;
        hotList.appendChild(li);
      });
    }

    const reportsList = byId("reports-list");
    reportsList.innerHTML = "";
    if (!reports.length) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>Keine Reports</strong><span class="muted">Noch keine Daily- oder Weekly-Reports vorhanden.</span>`;
      reportsList.appendChild(li);
    } else {
      reports.forEach((report) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div class="level ${levelClass(report.kind === "weekly" ? "ok" : daily?.overall_status || "unknown")}">${report.kind === "weekly" ? "WEEKLY" : "DAILY"}</div>
          <a href="${report.href}">${report.label}</a>
          <span class="muted mono">${report.file}</span>
        `;
        reportsList.appendChild(li);
      });
    }
  }

  function historyLabels(rows) {
    return rows.map((row) => String(row.timestamp || "").slice(5, 16).replace("T", " "));
  }

  function normalizedSeries(values) {
    return values.map((value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    });
  }

  function baseChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 120,
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: "#172128",
            boxWidth: 10,
            usePointStyle: true
          }
        }
      },
      layout: {
        padding: {
          top: 4,
          right: 10,
          bottom: 0,
          left: 0
        }
      },
      scales: {
        x: {
          ticks: { color: "#5f6a6f", maxTicksLimit: 8, maxRotation: 0 },
          grid: { color: "rgba(23, 33, 40, 0.08)" }
        },
        y: {
          ticks: { color: "#5f6a6f" },
          grid: { color: "rgba(23, 33, 40, 0.08)" }
        }
      }
    };
  }

  function makeChart(canvasId, label, values, color) {
    const node = byId(canvasId);
    if (!node || !window.Chart) return;
    const labels = historyLabels(history);
    const series = normalizedSeries(values);
    const visiblePoints = series.filter((value) => value != null);
    if (labels.length < 2 || visiblePoints.length < 2) {
      setChartEmpty(canvasId, "Zu wenig Verlauf fuer einen Chart.");
      return;
    }

    setChartReady(canvasId);
    const existing = charts.get(canvasId);
    if (existing) {
      existing.destroy();
    }

    const chart = new window.Chart(node, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label,
          data: series,
          borderColor: color,
          backgroundColor: color + "33",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.24,
          fill: true
        }]
      },
      options: baseChartOptions()
    });
    charts.set(canvasId, chart);
  }

  function renderCharts() {
    const diskColumns = Object.keys(history[0] || {}).filter((key) => key.startsWith("disk_") && key.endsWith("_temp_c"));
    makeChart("cpu-chart", "Load 15", history.map((row) => Number(row.load15 || 0)), "#0f6d78");
    makeChart("ram-chart", "RAM %", history.map((row) => Number(row.ram_pct || 0)), "#bb3e2f");
    makeChart("volume-chart", "Volume %", history.map((row) => Number(row.volume_used_pct || 0)), "#d38a18");

    const diskNode = byId("disk-chart");
    if (!diskNode || !window.Chart) return;
    if (!diskColumns.length || history.length < 2) {
      setChartEmpty("disk-chart", "Keine Disk-Temperaturdaten vorhanden.");
      return;
    }
    const datasets = diskColumns.map((column, index) => {
      const palette = ["#28724c", "#0f6d78", "#bb3e2f", "#7b4b94"];
      return {
        label: column.replace(/^disk_/, "").replace(/_temp_c$/, ""),
        data: normalizedSeries(history.map((row) => row[column])),
        borderColor: palette[index % palette.length],
        backgroundColor: palette[index % palette.length] + "22",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.24,
        fill: false
      };
    });

    if (!datasets.some((dataset) => dataset.data.filter((value) => value != null).length > 1)) {
      setChartEmpty("disk-chart", "Keine Disk-Temperaturdaten vorhanden.");
      return;
    }

    setChartReady("disk-chart");
    const existing = charts.get("disk-chart");
    if (existing) {
      existing.destroy();
    }

    const chart = new window.Chart(diskNode, {
      type: "line",
      data: {
        labels: historyLabels(history),
        datasets
      },
      options: baseChartOptions()
    });
    charts.set("disk-chart", chart);
  }

  renderStatus();
  renderLists();
  renderCharts();
})();
