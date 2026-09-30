import { expect, it, vi } from "vitest";
// @ts-expect-error Directly runnable ESM script.
import { manageSearxng } from "./searxng.mjs";

it("starts only the project search service and keeps the generated secret out of arguments and output", () => {
  const run = vi.fn().mockReturnValue({ status: 0, stdout: "linux\n" });
  const report = vi.fn();
  expect(manageSearxng("start", { run, report, env: {} })).toBe(0);
  const calls = run.mock.calls;
  expect(calls[0][1]).toEqual(["info", "--format", "{{.OSType}}"]);
  const [, args, options] = calls[1];
  expect(args.slice(-2)).toEqual(["up", "--detach"]);
  expect(args).toContain("--file");
  expect(args[2].replaceAll("\\", "/")).toMatch(/infra\/searxng\/compose.yaml$/);
  expect(options.shell).toBe(false);
  expect(options.env.SEARXNG_SECRET).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(args)).not.toContain(options.env.SEARXNG_SECRET);
  expect(JSON.stringify(report.mock.calls)).not.toContain(options.env.SEARXNG_SECRET);
});

it("explains a missing runtime and never attempts compose or a system install", () => {
  const run = vi.fn().mockReturnValue({ status: null, error: new Error("ENOENT") });
  const report = vi.fn();
  expect(manageSearxng("start", { run, report, env: {} })).toBe(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(report.mock.calls.flat().join(" ")).toMatch(/Docker Desktop/);
});

it.each([["stop", ["stop"]], ["status", ["ps"]]])("%s does not remove research or container volumes", (action, expected) => {
  const run = vi.fn().mockReturnValue({ status: 0, stdout: "linux\n" });
  expect(manageSearxng(action, { run, report: vi.fn(), env: {} })).toBe(0);
  expect(run.mock.calls[1][1].slice(3)).toEqual(expected);
});

it("propagates compose failure and rejects unknown commands without execution", () => {
  const run = vi.fn().mockReturnValueOnce({ status: 0, stdout: "linux\n" }).mockReturnValueOnce({ status: 1 });
  expect(manageSearxng("start", { run, report: vi.fn(), env: {} })).toBe(1);
  run.mockClear();
  expect(manageSearxng("delete", { run, report: vi.fn(), env: {} })).toBe(1);
  expect(run).not.toHaveBeenCalled();
});

it("requires Linux containers rather than launching on a Windows engine", () => {
  const run = vi.fn().mockReturnValue({ status: 0, stdout: "windows\n" });
  const report = vi.fn();
  expect(manageSearxng("start", { run, report, env: {} })).toBe(1);
  expect(run).toHaveBeenCalledTimes(1);
  expect(report.mock.calls.flat().join(" ")).toMatch(/Linux containers/);
});
