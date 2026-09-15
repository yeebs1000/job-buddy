import { describe, expect, it } from "vitest";
import { OAuthAttemptStore } from "./OAuthAttemptStore";

describe("OAuthAttemptStore", () => {
  it("creates PKCE material and consumes callback state exactly once", () => {
    const attempts = new OAuthAttemptStore();
    const attempt = attempts.create("2026-09-15T08:00:00.000Z");

    expect(attempt.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.codeChallenge).not.toBe(attempt.codeVerifier);
    expect(attempts.consume(attempt.state, "2026-09-15T08:09:59.000Z")).toEqual(attempt);
    expect(attempts.consume(attempt.state, "2026-09-15T08:09:59.000Z")).toBeNull();
  });

  it("deletes and rejects attempts aged ten minutes or more", () => {
    const attempts = new OAuthAttemptStore();
    const attempt = attempts.create("2026-09-15T08:00:00.000Z");

    expect(attempts.consume(attempt.state, "2026-09-15T08:10:00.000Z")).toBeNull();
    expect(attempts.consume(attempt.state, "2026-09-15T08:00:01.000Z")).toBeNull();
  });
});
