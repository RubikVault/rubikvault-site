const TIMEZONE = "America/New_York";

const timeEl = document.getElementById("rv-ny-time");
const countdownEl = document.getElementById("rv-market-countdown");
const labelEl = document.querySelector("[data-rv-market-label]");
const ledEl = document.querySelector("[data-rv-led]");

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hour12: false,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function getNyParts(date = new Date()) {
  const parts = formatter.formatToParts(date);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function secondsSinceMidnight({ hour, minute, second }) {
  return hour * 3600 + minute * 60 + second;
}

function formatClock({ hour, minute, second }) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function computeMarketState(parts) {
  const weekdayIndex = WEEKDAY_INDEX[parts.weekday] ?? 0;
  const secondsNow = secondsSinceMidnight(parts);
  const preStart = 4 * 3600;
  const openTime = 9 * 3600 + 30 * 60;
  const closeTime = 16 * 3600;

  const isWeekday = weekdayIndex >= 1 && weekdayIndex <= 5;
  if (isWeekday && secondsNow >= openTime && secondsNow < closeTime) {
    return {
      state: "open",
      label: "Open",
      countdown: closeTime - secondsNow,
      countdownLabel: "closes in"
    };
  }

  if (isWeekday && secondsNow >= preStart && secondsNow < openTime) {
    return {
      state: "pre",
      label: "Pre",
      countdown: openTime - secondsNow,
      countdownLabel: "opens in"
    };
  }

  let daysToOpen = 0;
  if (isWeekday) {
    if (secondsNow < openTime) {
      daysToOpen = 0;
    } else {
      daysToOpen = weekdayIndex === 5 ? 3 : 1;
    }
  } else {
    daysToOpen = weekdayIndex === 6 ? 2 : 1;
  }

  const countdown = daysToOpen * 86400 + (openTime - secondsNow);
  return {
    state: "closed",
    label: "Closed",
    countdown,
    countdownLabel: "opens in"
  };
}

function updateClock() {
  if (!timeEl || !countdownEl || !labelEl || !ledEl) return;
  const parts = getNyParts();
  timeEl.textContent = `NY: ${formatClock(parts)}`;

  const market = computeMarketState(parts);
  ledEl.setAttribute("data-rv-led", market.state);
  labelEl.textContent = market.label;
  countdownEl.textContent = `${market.countdownLabel} ${formatDuration(market.countdown)}`;
}

updateClock();
setInterval(updateClock, 1000);
