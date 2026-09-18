import ExcelJS from "exceljs";
import { expect, it, vi } from "vitest";
import { readValuesOnlyWorkbook } from "./excel";

it("rejects inconsistent archive counts before ExcelJS loads", async () => {
  const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("Wages").addRow(["safe"]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(bytes.length - 12, 1, true);
  const load = vi.spyOn(workbook.xlsx.constructor.prototype, "load");
  try {
    await expect(readValuesOnlyWorkbook(bytes)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  } finally { load.mockRestore(); }
});

it("reads bounded values-only workbooks", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Wages");
  sheet.addRows([["Occupation", "Median"], ["Software developers", 6800]]);

  expect(await readValuesOnlyWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()))).toEqual([
    { name: "Wages", rows: [["Occupation", "Median"], ["Software developers", 6800]] },
  ]);
});

it("rejects formulas and unsafe workbook dimensions", async () => {
  const formulaBook = new ExcelJS.Workbook();
  const formulaSheet = formulaBook.addWorksheet("Wages");
  formulaSheet.getCell("A1").value = { formula: "1+1", result: 2 };
  await expect(readValuesOnlyWorkbook(new Uint8Array(await formulaBook.xlsx.writeBuffer()))).rejects.toThrow("workbook-formulas-not-supported");

  const wideBook = new ExcelJS.Workbook();
  const wideSheet = wideBook.addWorksheet("Wide");
  wideSheet.getCell(1, 101).value = "too wide";
  await expect(readValuesOnlyWorkbook(new Uint8Array(await wideBook.xlsx.writeBuffer()))).rejects.toThrow("workbook-too-large");
});

it("rejects more than twenty sheets", async () => {
  const workbook = new ExcelJS.Workbook();
  for (let index = 0; index < 21; index += 1) workbook.addWorksheet(`Sheet ${index}`);
  await expect(readValuesOnlyWorkbook(new Uint8Array(await workbook.xlsx.writeBuffer()))).rejects.toThrow("workbook-too-large");
});
