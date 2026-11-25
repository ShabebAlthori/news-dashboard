export type AiErrorKind = "auth" | "rate-limit" | "unavailable" | "config" | "invalid" | "refusal" | "unverified";

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }

  /** Errors that make further calls in this run pointless. */
  get stopsRun(): boolean {
    return this.kind === "auth" || this.kind === "rate-limit" || this.kind === "unavailable" || this.kind === "config";
  }
}
