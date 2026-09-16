import type ExcelJSTypes from "exceljs";
import { unzipSync } from "fflate";

export interface TrackerWorksheet { name: string; rows: unknown[][] }
export interface TrackerWorkbook { worksheets: TrackerWorksheet[]; date1904: boolean }

const maxCompressedBytes = 5 * 1024 * 1024;
const maxUncompressedBytes = 25 * 1024 * 1024;

export async function readTrackerWorkbook(bytes: Uint8Array): Promise<TrackerWorkbook> {
  inspectArchive(bytes);
  const entryNames = Object.keys(unzipSync(bytes)).map((name) => name.replaceAll("\\", "/").toLocaleLowerCase("en"));
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

function inspectArchive(bytes: Uint8Array): void {
  if (bytes.byteLength > maxCompressedBytes) throw new Error("Use a workbook smaller than 5 MB.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is not a valid .xlsx workbook.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  const entries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  let offset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || centralSize === 0xffffffff || offset === 0xffffffff) throw new Error("ZIP64 workbooks are not supported.");
  if (entries > 1_000 || offset + centralSize > bytes.byteLength) throw new Error("Workbook archive is too large or invalid.");
  let totalUncompressed = 0;
  const decoder = new TextDecoder();
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Workbook archive is invalid.");
    const flags = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replaceAll("\\", "/");
    const lower = name.toLocaleLowerCase("en");
    if (flags & 1) throw new Error("Encrypted workbooks are not supported.");
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("Workbook archive contains an unsafe path.");
    if (lower.endsWith("vbaproject.bin")) throw new Error("Macro content is not supported. Export a values-only workbook.");
    if (lower.includes("/externallinks/")) throw new Error("Workbook external links are not supported.");
    totalUncompressed += uncompressed;
    if (totalUncompressed > maxUncompressedBytes || uncompressed > 1_000_000 && compressed > 0 && uncompressed / compressed > 100) {
      throw new Error("Workbook archive has an unsafe compression ratio or is too large.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Workbook archive is invalid.");
}
