import ExcelJS from "exceljs";

export interface ValuesWorksheet { name: string; rows: unknown[][] }

export async function readValuesOnlyWorkbook(bytes: Uint8Array): Promise<ValuesWorksheet[]> {
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("workbook-too-large");
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try { await workbook.xlsx.load(arrayBuffer); }
  catch (error) { throw new Error("invalid-or-encrypted-workbook", { cause: error }); }
  if (workbook.worksheets.length > 20) throw new Error("workbook-too-large");

  return workbook.worksheets.map((worksheet) => {
    if (worksheet.rowCount > 100_000 || worksheet.columnCount > 100 || worksheet.actualColumnCount > 100) throw new Error("workbook-too-large");
    const rows: unknown[][] = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const values: unknown[] = [];
      for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
        values.push(cellValue(row.getCell(columnNumber).value));
      }
      while (values.at(-1) === null) values.pop();
      rows.push(values);
    }
    return { name: worksheet.name, rows };
  });
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) throw new Error("workbook-formulas-not-supported");
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  if (typeof value === "object" && "text" in value && "hyperlink" in value) throw new Error("workbook-external-links-not-supported");
  throw new Error("workbook-unsupported-cell");
}
