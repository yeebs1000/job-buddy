import { createHash, randomBytes } from "node:crypto";

export interface OAuthAttempt {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: string;
}

const lifetimeMs = 10 * 60 * 1_000;

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export class OAuthAttemptStore {
  private readonly attempts = new Map<string, OAuthAttempt>();

  clear(): void { this.attempts.clear(); }

  create(now = new Date().toISOString()): OAuthAttempt {
    if (!Number.isFinite(Date.parse(now))) throw new Error("Invalid OAuth attempt timestamp");
    const state = base64url(randomBytes(32));
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(createHash("sha256").update(codeVerifier, "ascii").digest());
    const attempt = { state, codeVerifier, codeChallenge, createdAt: now };
    this.attempts.set(state, attempt);
    return attempt;
  }

  consume(state: string, now = new Date().toISOString()): OAuthAttempt | null {
    const attempt = this.attempts.get(state);
    if (!attempt) return null;
    this.attempts.delete(state);
    const age = Date.parse(now) - Date.parse(attempt.createdAt);
    return Number.isFinite(age) && age >= 0 && age < lifetimeMs ? attempt : null;
  }
}
