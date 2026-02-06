/**
 * Rate Limiter Helper - Token Bucket with Concurrency Control
 * 
 * Implements EODHD rate limiting per RUNBLOCK requirements:
 * - max_inflight = 3
 * - token bucket rate = 2 req/sec, bucket_size = 5
 * - 429/5xx handling with backoff
 */

/**
 * @typedef {Object} RateLimiterStats
 * @property {number} requests_total
 * @property {number} http_429_count
 * @property {number} http_5xx_count
 * @property {number} avg_latency_ms
 */

export class RateLimiter {
    constructor(options = {}) {
        this.maxInflight = options.maxInflight ?? 3;
        this.tokenRate = options.tokenRate ?? 2;        // tokens/sec
        this.bucketSize = options.bucketSize ?? 5;
        this.maxRetries = options.maxRetries ?? 5;
        this.maxBackoff = options.maxBackoff ?? 60000;  // 60s

        // State
        this.tokens = this.bucketSize;
        this.lastRefill = Date.now();
        this.inflight = 0;
        this.queue = [];

        // Stats
        this.stats = {
            requests_total: 0,
            http_429_count: 0,
            http_5xx_count: 0,
            latencies: []
        };
    }

    /**
     * Refill tokens based on elapsed time
     */
    _refillTokens() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000;
        const newTokens = elapsed * this.tokenRate;
        this.tokens = Math.min(this.bucketSize, this.tokens + newTokens);
        this.lastRefill = now;
    }

    /**
     * Wait for a token and inflight slot
     */
    async acquire() {
        return new Promise(resolve => {
            const tryAcquire = () => {
                this._refillTokens();

                if (this.tokens >= 1 && this.inflight < this.maxInflight) {
                    this.tokens -= 1;
                    this.inflight += 1;
                    resolve();
                } else {
                    // Wait and retry
                    const waitMs = this.tokens < 1
                        ? Math.ceil((1 - this.tokens) / this.tokenRate * 1000)
                        : 100;
                    setTimeout(tryAcquire, Math.min(waitMs, 500));
                }
            };
            tryAcquire();
        });
    }

    /**
     * Release an inflight slot
     */
    release() {
        this.inflight = Math.max(0, this.inflight - 1);
    }

    /**
     * Execute a fetch with rate limiting and retry
     * @param {Function} fetchFn - Async function that returns Response
     * @param {Object} options
     * @returns {Promise<{ok: boolean, data?: any, status?: number, error?: string}>}
     */
    async execute(fetchFn, options = {}) {
        const maxRetries = options.maxRetries ?? this.maxRetries;
        let attempts = 0;
        let lastError = null;

        while (attempts < maxRetries) {
            await this.acquire();
            const startTime = Date.now();
            this.stats.requests_total++;

            try {
                const response = await fetchFn();
                const latency = Date.now() - startTime;
                this.stats.latencies.push(latency);

                if (response.ok) {
                    this.release();
                    const data = await response.json();
                    return { ok: true, data, status: response.status };
                }

                // Handle rate limiting
                if (response.status === 429) {
                    this.stats.http_429_count++;
                    this.release();

                    const retryAfter = response.headers.get('Retry-After');
                    const waitMs = retryAfter
                        ? Math.min(parseInt(retryAfter, 10) * 1000, 120000)
                        : Math.min(Math.pow(2, attempts) * 1000, this.maxBackoff);

                    await this._sleep(waitMs);
                    attempts++;
                    continue;
                }

                // Handle server errors
                if (response.status >= 500) {
                    this.stats.http_5xx_count++;
                    this.release();

                    const waitMs = Math.min(Math.pow(2, attempts) * 1000, this.maxBackoff);
                    await this._sleep(waitMs);
                    attempts++;
                    continue;
                }

                // Client error (4xx except 429) - don't retry
                this.release();
                return { ok: false, status: response.status, error: `HTTP ${response.status}` };

            } catch (err) {
                this.release();
                lastError = err.message;

                // Network errors - retry with backoff
                const waitMs = Math.min(Math.pow(2, attempts) * 1000, this.maxBackoff);
                await this._sleep(waitMs);
                attempts++;
            }
        }

        return { ok: false, error: lastError || `Max retries (${maxRetries}) exceeded` };
    }

    /**
     * Get statistics
     * @returns {RateLimiterStats}
     */
    getStats() {
        const avgLatency = this.stats.latencies.length > 0
            ? Math.round(this.stats.latencies.reduce((a, b) => a + b, 0) / this.stats.latencies.length)
            : null;

        return {
            requests_total: this.stats.requests_total,
            http_429_count: this.stats.http_429_count,
            http_5xx_count: this.stats.http_5xx_count,
            avg_latency_ms: avgLatency
        };
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default RateLimiter;
