import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { waitForHttpFinish } from "../e2e-extension/httpPhaseWaiter";

describe("installed-extension HTTP phase waiter", () => {
  it("resolves only after the exact route finishes with the expected status", async () => {
    const server = new EventEmitter();
    const waiting = waitForHttpFinish(server, "/expected", 204, 100);
    finish(server, "/other", 204);
    finish(server, "/expected?query=1", 204);
    finish(server, "/expected", 204);
    await expect(waiting).resolves.toBeUndefined();
    expect(server.listenerCount("request")).toBe(0);
  });

  it("rejects immediately when the exact route finishes with an unexpected status", async () => {
    const server = new EventEmitter();
    const waiting = waitForHttpFinish(server, "/profile", 200, 100);
    finish(server, "/profile", 401);
    await expect(waiting).rejects.toThrow("/profile expected 200 but finished 401");
    expect(server.listenerCount("request")).toBe(0);
  });

  it("times out with route and observed-status metadata only", async () => {
    const server = new EventEmitter();
    const waiting = waitForHttpFinish(server, "/activity", 204, 10);
    finish(server, "/other", 500);
    await expect(waiting).rejects.toThrow("/activity did not finish within 10ms; observed statuses: none");
    expect(server.listenerCount("request")).toBe(0);
  });
});

function finish(server: EventEmitter, url: string, statusCode: number): void {
  const response = new EventEmitter() as EventEmitter & { statusCode: number };
  response.statusCode = statusCode;
  server.emit("request", { url }, response);
  response.emit("finish");
}
