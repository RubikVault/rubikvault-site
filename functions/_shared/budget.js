class RequestBudget {
  constructor(max = 40) {
    this.max = Number.isFinite(max) ? max : 40;
    this.used = 0;
  }

  remaining() {
    return Math.max(0, this.max - this.used);
  }

  async fetch(url, options = {}) {
    if (this.used >= this.max) {
      const error = {
        code: "LIMIT_SUBREQUESTS",
        message: "Budget exceeded",
        details: { used: this.used, max: this.max }
      };
      throw error;
    }
    this.used += 1;
    const headers = {
      Accept: "*/*",
      ...(options.headers || {}),
      ...(options.userAgent ? { "User-Agent": options.userAgent } : {})
    };
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      headers: response.headers
    };
  }
}

export { RequestBudget };
