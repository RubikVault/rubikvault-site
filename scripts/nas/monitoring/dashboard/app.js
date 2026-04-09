(function () {
  const payload = window.MONITORING_DATA || {};
  const daily = payload.daily || null;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const events = Array.isArray(payload.events) ? payload.events : [];
  const hotWindows = Array.isArray(payload.hotWindows) ? payload.hotWindows : [];
  const reports = Array.isArray(payload.reports) ? payload.reports : [];

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
      return;
    }

    hotWindows.forEach((entry) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${entry.window || "n/a"}</strong>
        <span>${entry.message || ""}</span>
        <span class="muted mono">${(entry.topProcesses || []).join(" | ") || "keine korrelierten Repo-Prozesse"}</span>
      `;
      hotList.appendChild(li);
    });

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

  function makeChart(canvasId, label, values, color) {
    const node = byId(canvasId);
    if (!node || !window.Chart) return;
    new window.Chart(node, {
      type: "line",
      data: {
        labels: historyLabels(history),
        datasets: [{
          label,
          data: values,
          borderColor: color,
          backgroundColor: color + "33",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.24,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#172128",
              boxWidth: 10
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#5f6a6f", maxTicksLimit: 8 },
            grid: { color: "rgba(23, 33, 40, 0.08)" }
          },
          y: {
            ticks: { color: "#5f6a6f" },
            grid: { color: "rgba(23, 33, 40, 0.08)" }
          }
        }
      }
    });
  }

  function renderCharts() {
    const diskColumns = Object.keys(history[0] || {}).filter((key) => key.startsWith("disk_") && key.endsWith("_temp_c"));
    makeChart("cpu-chart", "Load 15", history.map((row) => Number(row.load15 || 0)), "#0f6d78");
    makeChart("ram-chart", "RAM %", history.map((row) => Number(row.ram_pct || 0)), "#bb3e2f");
    makeChart("volume-chart", "Volume %", history.map((row) => Number(row.volume_used_pct || 0)), "#d38a18");

    const diskNode = byId("disk-chart");
    if (!diskNode || !window.Chart) return;
    const datasets = diskColumns.map((column, index) => {
      const palette = ["#28724c", "#0f6d78", "#bb3e2f", "#7b4b94"];
      return {
        label: column.replace(/^disk_/, "").replace(/_temp_c$/, ""),
        data: history.map((row) => Number(row[column] || 0)),
        borderColor: palette[index % palette.length],
        backgroundColor: palette[index % palette.length] + "22",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.24,
        fill: false
      };
    });

    new window.Chart(diskNode, {
      type: "line",
      data: {
        labels: historyLabels(history),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#172128", boxWidth: 10 }
          }
        },
        scales: {
          x: {
            ticks: { color: "#5f6a6f", maxTicksLimit: 8 },
            grid: { color: "rgba(23, 33, 40, 0.08)" }
          },
          y: {
            ticks: { color: "#5f6a6f" },
            grid: { color: "rgba(23, 33, 40, 0.08)" }
          }
        }
      }
    });
  }

  renderStatus();
  renderLists();
  renderCharts();
})();
