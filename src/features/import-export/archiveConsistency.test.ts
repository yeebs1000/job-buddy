// @vitest-environment node
import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import { readTrackerWorkbook, writeTrackerWorkbook } from "./excelWorkbook";
import { readValuesOnlyWorkbook } from "../../../server/research/parsers/excel";
import { readBoundedZip } from "../../lib/boundedZip";

it("both workbook readers consume only the validated archive, not a second archive hidden in its comment", async () => {
  const safe = new Uint8Array(await writeTrackerWorkbook([["Validated"]]));
  const hidden = new Uint8Array(await writeTrackerWorkbook([["Unvalidated"]]));
  // The guard honours the outer comment length; JSZip chooses the last EOCD
  // even when that inner record's comment length does not reach EOF.
  new DataView(safe.buffer).setUint16(safe.length - 2, hidden.length + 1, true);
  const bytes = new Uint8Array(safe.length + hidden.length + 1);
  bytes.set(safe); bytes.set(hidden, safe.length);
  const entries = readBoundedZip(bytes, { compressed: 100_000, uncompressed: 100_000, entries: 100, ratio: 100 });
  expect(new TextDecoder().decode(entries.get("xl/sharedStrings.xml"))).toContain("Validated");
  const unchecked = new ExcelJS.Workbook();
  await unchecked.xlsx.load(bytes.buffer);
  expect(unchecked.worksheets[0].getCell("A1").value).toBe("Unvalidated");

  expect((await readTrackerWorkbook(bytes)).worksheets[0].rows).toEqual([["Validated"]]);
  expect((await readValuesOnlyWorkbook(bytes))[0].rows).toEqual([["Validated"]]);
});
