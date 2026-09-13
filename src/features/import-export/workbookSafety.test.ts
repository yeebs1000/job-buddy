import { afterEach, expect, it, vi } from "vitest";
import type { WorkBook } from "xlsx";
import { parseTracker } from "./parseTracker";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("xlsx", async importOriginal => ({ ...await importOriginal<typeof import("xlsx")>(), read }));
afterEach(() => { read.mockReset(); });
const localFile = () => new File([new Uint8Array([0x50, 0x4b])], "tracker.xlsx");

it("rejects parsed workbook VBA bytes before considering application rows", async () => {
  const book: WorkBook = { SheetNames: [], Sheets: {}, vbaraw: new Uint8Array([1, 2, 3]) };
  read.mockReturnValue(book);
  await expect(parseTracker(localFile())).rejects.toThrow("Macro content is not supported");
});

it.each(["A1:A2002", "A1:CC2"])("rejects an oversized parsed worksheet %s", async range => {
  read.mockReturnValue({ SheetNames: ["Tracker"], Sheets: { Tracker: { "!ref": range } } } satisfies WorkBook);
  await expect(parseTracker(localFile())).rejects.toThrow(/2,000 rows and 80 columns/);
});
