// @vitest-environment node
import ExcelJS from "exceljs";
import { strToU8, unzipSync, zipSync } from "fflate";
import { expect, it } from "vitest";
import { readTrackerWorkbook, writeTrackerWorkbook } from "./excelWorkbook";

it("round-trips values without formulas", async () => {
  const bytes = await writeTrackerWorkbook([["Company", "Role"], ["Example", "Engineer"]]);
  await expect(readTrackerWorkbook(new Uint8Array(bytes))).resolves.toMatchObject({
    worksheets: [{ name: "Applications", rows: [["Company", "Role"], ["Example", "Engineer"]] }],
  });
});

it("rejects a formula even when a cached value exists", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tracker");
  sheet.getCell("A1").value = { formula: "HYPERLINK(\"https://evil.example\")", result: "open" };
  const bytes = await workbook.xlsx.writeBuffer();
  await expect(readTrackerWorkbook(new Uint8Array(bytes))).rejects.toThrow(/formula/i);
});

it("rejects macro and extreme-compression entries before workbook parsing", async () => {
  const valid = new Uint8Array(await writeTrackerWorkbook([["Company", "Role"]]));
  const entries = unzipSync(valid);
  const macroWorkbook = zipSync({ ...entries, "xl/vbaProject.bin": strToU8("macro") });
  expect(Object.keys(unzipSync(macroWorkbook))).toContain("xl/vbaProject.bin");
  await expect(readTrackerWorkbook(macroWorkbook)).rejects.toThrow(/macro/i);
  await expect(readTrackerWorkbook(zipSync({ ...entries, "xl/media/bomb.bin": new Uint8Array(2_000_000) }, { level: 9 }))).rejects.toThrow(/compression|large/i);
});
