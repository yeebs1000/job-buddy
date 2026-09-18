import { strToU8, zipSync, type Zippable } from "fflate";

import { readBoundedZip } from "../../../src/lib/boundedZip";

const MAX_ENTRIES = 20;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 100;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 100;

export function parseBoundedZip(bytes: Uint8Array): Map<string, Uint8Array> {
  return readBoundedZip(bytes, { compressed: 25 * 1024 * 1024, uncompressed: MAX_UNCOMPRESSED_BYTES, entries: MAX_ENTRIES, ratio: MAX_COMPRESSION_RATIO });
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
