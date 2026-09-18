import type ExcelJSTypes from "exceljs";
import { readBoundedZip } from "../../lib/boundedZip";

export interface TrackerWorksheet { name: string; rows: unknown[][] }
export interface TrackerWorkbook { worksheets: TrackerWorksheet[]; date1904: boolean }

const maxCompressedBytes = 5 * 1024 * 1024;
const maxUncompressedBytes = 25 * 1024 * 1024;

export async function readTrackerWorkbook(bytes: Uint8Array): Promise<TrackerWorkbook> {
  const entries = readBoundedZip(bytes, { compressed: maxCompressedBytes, uncompressed: maxUncompressedBytes, entries: 1000, ratio: 100, ratioMinimum: 1_000_000 });
  const entryNames = [...entries.keys()].map((name) => name.replaceAll("\\", "/").toLocaleLowerCase("en"));
  if (entryNames.some((name) => name.endsWith("vbaproject.bin"))) throw new Error("Macro content is not supported. Export a values-only workbook.");
  if (entryNames.some((name) => name.includes("/externallinks/"))) throw new Error("Workbook external links are not supported.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  try { await workbook.xlsx.load(arrayBuffer); }
  catch (error) { throw new Error("Could not read this .xlsx workbook; it may be invalid or encrypted.", { cause: error }); }
  if (workbook.worksheets.length > 20) throw new Error("Use at most 20 worksheets per workbook.");

  const worksheets = workbook.worksheets.map((worksheet) => {
    if (worksheet.rowCount > 2_001 || worksheet.columnCount > 100 || worksheet.actualColumnCount > 100) {
      throw new Error("Use at most 2,000 rows and 100 columns per sheet.");
    }
    const rows: unknown[][] = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row: unknown[] = [];
      for (let columnNumber = 1; columnNumber <= worksheet.columnCount; columnNumber += 1) {
        row.push(valueOnly(worksheet.getCell(rowNumber, columnNumber).value));
      }
      while (row.length && (row.at(-1) === null || row.at(-1) === "")) row.pop();
      rows.push(row);
    }
    return { name: worksheet.name, rows };
  });
  return { worksheets, date1904: Boolean(workbook.properties.date1904) };
}

export async function writeTrackerWorkbook(rows: readonly (readonly unknown[])[]): Promise<ArrayBuffer> {
  if (rows.length > 2_001 || rows.some((row) => row.length > 100)) throw new Error("Use at most 2,000 rows and 100 columns per sheet.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Job Buddy";
  workbook.created = new Date(0);
  workbook.modified = new Date(0);
  const worksheet = workbook.addWorksheet("Applications");
  for (const row of rows) worksheet.addRow([...row] as ExcelJSTypes.CellValue[]);
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  const output = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(output);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function valueOnly(value: ExcelJSTypes.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && ("formula" in value || "sharedFormula" in value)) throw new Error("Workbook formulas are not supported. Export values only.");
  if (typeof value === "object" && "hyperlink" in value) throw new Error("Workbook external links are not supported.");
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  throw new Error("Workbook contains an unsupported cell value.");
}
