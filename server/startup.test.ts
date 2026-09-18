import { describe, expect, it } from "vitest";
import { companionListenError } from "./startup";

describe("companion startup errors", () => {
  it("identifies an occupied configured port without suggesting that its listener be killed", () => {
    const message = companionListenError(Object.assign(new Error("bind failed"), { code: "EADDRINUSE" }), 43117);
    expect(message).toContain("port 43117 is already in use");
    expect(message).toContain("Close the other Job Buddy companion");
    expect(message).not.toMatch(/kill|taskkill|terminate/i);
  });

  it("does not expose arbitrary operating-system error details", () => {
    expect(companionListenError(new Error("private path and provider detail"), 43117)).toBe("Job Buddy could not start its local companion. Retry npm.cmd run dev.");
  });
});
