import { expect, it } from "vitest";
import { OAuthPopupStore } from "./OAuthPopupStore";

it("invalidates abandoned popups without changing completed receipts", () => {
  const store = new OAuthPopupStore();
  const pending = store.create("pending", "origin");
  const connected = store.create("done", "origin");
  store.finish("done", "connected");
  store.invalidatePending();
  expect(store.result(pending, "origin")).toBe("error");
  expect(store.claim("pending")).toBe(false);
  expect(store.result(connected, "origin")).toBe("connected");
});

it("correlates completion to one attempt and its initiating origin", () => {
  const store = new OAuthPopupStore();
  const first = store.create("state-a", "http://127.0.0.1:5173");
  const second = store.create("state-b", "http://127.0.0.1:5173");
  expect(store.result(first, "http://127.0.0.1:5173")).toBe("pending");
  expect(store.result(first, "http://127.0.0.1:43117")).toBe("expired");
  store.finish("state-a", "connected");
  expect(store.result(first, "http://127.0.0.1:5173")).toBe("connected");
  expect(store.result(second, "http://127.0.0.1:5173")).toBe("pending");
  store.finish("state-a", "error");
  expect(store.result(first, "http://127.0.0.1:5173")).toBe("connected");
});

it("expires receipts and bounds abandoned sessions", () => {
  let now = 0;
  const store = new OAuthPopupStore(() => now);
  const id = store.create("state", "origin");
  for (let i = 1; i < 32; i++) store.create(`state-${i}`, "origin");
  expect(() => store.create("overflow", "origin")).toThrow();
  now = 10 * 60_000;
  expect(store.result(id, "origin")).toBe("expired");
  expect(store.find("state")).toBeUndefined();
  expect(() => store.create("fresh", "origin")).not.toThrow();
});

it("claims a pending callback once so duplicate requests cannot race its result", () => {
  const store = new OAuthPopupStore();
  const id = store.create("state", "origin");
  expect(store.claim("state")).toBe(true);
  expect(store.claim("state")).toBe(false);
  expect(store.result(id, "origin")).toBe("pending");
  store.finish("state", "connected");
  expect(store.claim("state")).toBe(false);
  expect(store.claim("unknown")).toBe(false);
});
