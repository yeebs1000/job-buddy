import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";

const MAX_ENTRIES = 20;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 100;

export function parseBoundedZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (archiveHasEncryptionFlag(bytes)) throw new Error("zip-encryption-not-supported");
  let extracted: Record<string, Uint8Array>;
  try { extracted = unzipSync(bytes); }
  catch (error) { throw new Error("invalid-zip", { cause: error }); }
  const entries = Object.entries(extracted);
  if (entries.length > MAX_ENTRIES) throw new Error("zip-too-many-entries");
  let total = 0;
  const result = new Map<string, Uint8Array>();
  for (const [name, data] of entries) {
    const normalized = name.replace(/\\/g, "/");
    if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "..") || /^[A-Za-z]:/.test(normalized)) throw new Error("zip-path-not-allowed");
    total += data.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error("zip-uncompressed-too-large");
    result.set(normalized, data);
  }
  if (bytes.byteLength > 0 && total / bytes.byteLength > MAX_COMPRESSION_RATIO) throw new Error("zip-compression-ratio-too-high");
  return result;
}

// Kept here so test archives use the exact same Uint8Array realm as fflate.
export function createZipFixture(entries: Record<string, string | Uint8Array>, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6): Uint8Array {
  const zippable: Zippable = Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, [typeof value === "string" ? strToU8(value) : value, { level }]]));
  return zipSync(zippable);
}

export function parseDelimitedText(input: string, delimiter: "\t" | ","): Record<string, string>[] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > MAX_ROWS + 1) throw new Error("table-too-large");
  if (!lines.length) return [];
  const headers = splitLine(lines[0], delimiter).map((header) => header.trim());
  if (headers.length > MAX_COLUMNS || new Set(headers).size !== headers.length || headers.some((header) => !header)) throw new Error("table-too-large");
  return lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    if (values.length > MAX_COLUMNS) throw new Error("table-too-large");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function splitLine(line: string, delimiter: "\t" | ","): string[] {
  if (delimiter === "\t") return line.split("\t").map(unquote);
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) { cells.push(cell); cell = ""; }
    else cell += character;
  }
  if (quoted) throw new Error("malformed-delimited-row");
  cells.push(cell);
  return cells;
}

function unquote(value: string): string {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value;
}

function archiveHasEncryptionFlag(bytes: Uint8Array): boolean {
  for (let index = 0; index + 8 <= bytes.length; index += 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x03 && bytes[index + 3] === 0x04) {
      const flags = bytes[index + 6] | (bytes[index + 7] << 8);
      if ((flags & 0x1) !== 0) return true;
    }
  }
  return false;
}
