export type AiErrorKind = "auth" | "rate-limit" | "throttled" | "unavailable" | "config" | "invalid" | "refusal" | "unverified";

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    /** For "throttled": how long the provider asked us to wait. */
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "AiError";
  }

  /**
   * Errors that make further calls in this run pointless. "throttled" (a short per-minute
   * limit) is not one of them: the caller waits and continues.
   */
  get stopsRun(): boolean {
    return this.kind === "auth" || this.kind === "rate-limit" || this.kind === "unavailable" || this.kind === "config";
  }
}
