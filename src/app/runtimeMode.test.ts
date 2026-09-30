import { expect, it } from "vitest";
import { readRuntimeMode } from "./runtimeMode";

it("keeps existing installations on the companion unless web is explicit", () => {
  expect(readRuntimeMode(undefined)).toBe("companion");
  expect(readRuntimeMode("companion")).toBe("companion");
  expect(readRuntimeMode("web")).toBe("web");
});
it("rejects a mistyped mode rather than silently changing storage", () => {
  expect(() => readRuntimeMode("browser")).toThrow();
});
