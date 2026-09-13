import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseTracker } from "./parseTracker";

export function csv(text: string, name = "tracker.csv") { return new File([text], name, { type: "text/csv" }); }
export function workbook(rows: unknown[][]) {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Tracker");
  return new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "tracker.xlsx");
}
it("maps fresh graduate headings and normalizes dates, currencies, markets and stages", async () => {
  const preview = await parseTracker(workbook([["Company", "Title", "Status", "Date Applied", "Location", "Role Family", "Salary", "Pay Period", "Tags", "Contact", "Link", "Source"], ["Example Bank", "Analyst", "Interviewing", 46277, "Singapore", "Finance", "SGD 4,000–5,000", "monthly", "graduate; priority;graduate", "Alex", "https://example.com/job", "Campus"]]));
  expect(preview.rows[0].errors).toEqual([]);
  expect(preview.rows[0].normalized).toMatchObject({ company: "Example Bank", role: "Analyst", stage: "interview", market: "SG", appliedAt: "2026-09-12T00:00:00.000Z", recruiter: "Alex", jobUrl: "https://example.com/job", tags: ["graduate", "priority"], research: { salary: { minimum: 4000, maximum: 5000, currency: "SGD", period: "monthly" } } });
  expect(preview.rows[0].normalized.research?.companyRating).toBeUndefined();
  expect(preview.mapping).toContainEqual({ source: "Title", field: "role" });
});
it("retains physical row numbers, flags missing/invalid values and does not invent dates or markets", async () => {
  const preview = await parseTracker(csv("Company,Role,Stage,Date Applied,Market,Role Family\n\n,Engineer,Mystery,31/02/2026,Mars,software\nGood,Analyst,Applied,12/09/2026,HK,finance"));
  expect(preview.rows[0].sourceRow).toBe(3);
  expect(preview.rows[0].errors.join(" ")).toMatch(/company/i);
  expect(preview.rows[0].errors.join(" ")).toMatch(/stage/i);
  expect(preview.rows[0].errors.join(" ")).toMatch(/date/i);
  expect(preview.rows[0].errors.join(" ")).toMatch(/market/i);
  expect(preview.rows[0].included).toBe(false);
  expect(preview.rows[1].normalized.appliedAt).toBe("2026-09-12T00:00:00.000Z");
});
it("reports duplicates inside a file and against existing records without blocking inclusion", async () => {
  const preview = await parseTracker(csv("Company,Role,Stage,Date Applied,Market,Role Family,Source,Location\n Bank ,Analyst,Applied,2026-09-12,SG,finance,Campus,Singapore\nBANK, analyst ,Applied,2026-09-12,SG,finance,Campus,Singapore"), [{ company: "Bank", role: "Analyst", appliedAt: "2026-09-12T12:00:00Z" }]);
  expect(preview.rows[0].duplicateReasons.join(" ")).toMatch(/existing/i);
  expect(preview.rows[1].duplicateReasons.join(" ")).toMatch(/row 2/i);
  expect(preview.rows[1].included).toBe(false);
  expect(preview.rows[1].errors).toEqual([]);
});
it.each(["tracker.xls", "tracker.xlsm", "https://example.com/tracker.xlsx.txt"])("rejects unsupported type %s", async name => { await expect(parseTracker(csv("x", name))).rejects.toThrow(/xlsx.*csv/i); });
it("rejects empty input and malformed UTF-8", async () => {
  await expect(parseTracker(csv(""))).rejects.toThrow(/empty/i);
  await expect(parseTracker(new File([new Uint8Array([0xff, 0xfe, 0x61])], "bad.csv"))).rejects.toThrow(/UTF-8/i);
});
it("warns on unknown headers and unsafe links, and rejects workbook formula cells", async () => {
  const preview = await parseTracker(csv("Company,Role,Stage,Date Applied,Market,Role Family,Link,Other\nBank,Analyst,Rejected,2026-09-12,SG,finance,javascript:alert(1),text"));
  expect(preview.rows[0].normalized.jobUrl).toBeUndefined();
  expect(preview.rows[0].warnings.join(" ")).toMatch(/URL/i);
  expect(preview.rows[0].normalized.outcome).toBe("rejected");
  expect(preview.rows[0].errors.join(" ")).toMatch(/stage/i);
  expect(preview.mapping).toContainEqual({ source: "Other", field: null });
  const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([["Company"], ["Bank"]]); sheet.A2 = { t: "n", f: "1+1", v: 2 }; XLSX.utils.book_append_sheet(book, sheet, "Tracker");
  await expect(parseTracker(new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "formula.xlsx"))).rejects.toThrow(/formula/i);
});

it("handles the workbook's 1904 date system without shifting application dates", async () => {
  const book = XLSX.utils.book_new(); book.Workbook = { WBProps: { date1904: true } };
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Company", "Role", "Stage", "Date Applied", "Market", "Role Family", "Source", "Location"], ["Bank", "Analyst", "Review", 44815, "SG", "finance", "Campus", "Singapore"]]), "Tracker");
  const preview = await parseTracker(new File([XLSX.write(book, { type: "array", bookType: "xlsx" })], "mac.xlsx"));
  expect(preview.rows[0].normalized.appliedAt).toBe("2026-09-12T00:00:00.000Z");
});
it("rejects duplicate mappings, incomplete salary and invalid optional enums or booleans", async () => {
  await expect(parseTracker(csv("Company,Role,Title\nBank,Analyst,Analyst"))).rejects.toThrow(/same field/i);
  const preview = await parseTracker(csv("Company,Role,Stage,Date Applied,Market,Role Family,Salary,Priority,Archived\nBank,Analyst,Applied,2026-09-12,SG,finance,4000,urgent,maybe"));
  expect(preview.rows[0].errors.join(" ")).toMatch(/currency/i);
  expect(preview.rows[0].errors.join(" ")).toMatch(/priority/i);
  expect(preview.rows[0].errors.join(" ")).toMatch(/archived/i);
});

it.each([
  { source: "", location: "Singapore", message: /Source is required/i },
  { source: "Campus", location: "   ", message: /Location is required/i },
])("rejects blank required source/location without fabricating a fallback", async ({ source, location, message }) => {
  const preview = await parseTracker(csv(`Company,Role,Stage,Date Applied,Market,Role Family,Source,Location\nBank,Analyst,Applied,2026-09-12,SG,finance,${source},${location}`));
  expect(preview.rows[0].errors.join(" ")).toMatch(message);
  expect(preview.rows[0].included).toBe(false);
});
