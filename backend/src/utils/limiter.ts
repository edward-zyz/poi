export class RateLimiter {
  private lastInvocation = 0;
  private readonly minIntervalMs: number;

  constructor(requestsPerMinute: number) {
    if (!Number.isFinite(requestsPerMinute) || requestsPerMinute <= 0) {
      this.minIntervalMs = 0;
    } else {
      this.minIntervalMs = Math.ceil(60000 / requestsPerMinute);
    }
  }

  async wait(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      return;
    }

    const now = Date.now();
    const scheduled = Math.max(this.lastInvocation + this.minIntervalMs, now);
    const delay = scheduled - now;

    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.lastInvocation = scheduled;
  }
}
