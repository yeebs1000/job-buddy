import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.doUnmock("xlsx"); vi.resetModules(); });

it("imports and exports CSV even when SheetJS cannot be loaded", async () => {
  vi.resetModules();
  vi.doMock("xlsx", () => { throw new Error("SheetJS was loaded on the CSV path"); });
  const { parseTracker } = await import("./parseTracker");
  const { exportTracker } = await import("./exportTracker");
  const preview = await parseTracker(new File(["Company,Role,Stage,Date Applied,Market,Role Family,Source,Location\nBank,Analyst,Applied,2026-09-12,SG,finance,Campus,Singapore"], "tracker.csv"));
  expect(preview.rows[0].errors).toEqual([]);
  const { stage, outcome, ...normalized } = preview.rows[0].normalized;
  const bytes = await exportTracker([{ ...normalized, id: "a1", stageEvents: [{ id: "e1", applicationId: "a1", at: normalized.appliedAt, toStage: stage!, ...(outcome ? { outcome } : {}), accepted: true, origin: "import" }] }], "csv");
  expect(new TextDecoder().decode(bytes)).toContain("Bank");
});

it("loads SheetJS only when an XLSX operation is requested", async () => {
  vi.resetModules();
  vi.doMock("xlsx", () => { throw new Error("SheetJS unavailable"); });
  const { exportTracker } = await import("./exportTracker");
  await expect(exportTracker([], "xlsx")).rejects.toThrow();
});
