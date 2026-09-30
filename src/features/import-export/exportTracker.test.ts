import { expect, it } from "vitest";
import type { Application } from "../../domain/application";
import { exportTracker } from "./exportTracker";
import { parseTracker } from "./parseTracker";

const application: Application = { id: "private-id", company: "银行, Bank", role: "Graduate Analyst", discipline: "finance", industry: "Banking", roleFamily: "finance", market: "HK", location: { city: "Central", country: "Hong Kong" }, source: "Campus", appliedAt: "2026-09-12T08:32:00.000Z", priority: "high", workArrangement: "hybrid", recruiter: "Alex", jobUrl: "https://example.com/job", notes: "Line one\nLine two", tags: ["graduate", "priority"], archived: true, unreadUpdate: true, missingData: false, interviewSubtype: "case", followUpAt: "2026-09-20T10:00:00.000Z", targetStage: "offer", deadlines: [{ id: "secret-deadline-id", at: "2026-09-18T10:00:00.000Z", label: "Interview", completed: false }, { id: "d2", at: "2026-09-14T08:00:00.000Z", label: "Assessment", completed: true }], research: { salary: { minimum: 30000, maximum: 35000, currency: "HKD", period: "monthly" }, companyRating: { score: 4.2, outOf: 5, source: "Graduate survey" } }, stageEvents: [{ id: "secret-event-id", applicationId: "private-id", at: "2026-09-13T08:00:00Z", toStage: "interview", outcome: "rejected", accepted: true, origin: "manual", note: "secret-history" }] };
it.each(["csv", "xlsx"] as const)("round-trips standard fields in %s, excluding internal identifiers and history", async format => {
  const bytes = await exportTracker([application], format);
  const preview = await parseTracker(new File([bytes], `roundtrip.${format}`));
  expect(preview.rows[0].errors).toEqual([]);
  const { id: _id, stageEvents: _events, deadlines, ...standard } = application;
  expect(preview.rows[0].normalized).toMatchObject({ ...standard, stage: "interview", outcome: "rejected" });
  expect(preview.rows[0].normalized.deadlines.map(({ id: _id, ...rest }) => rest)).toEqual(deadlines.map(({ id: _id, ...rest }) => rest));
  expect(JSON.stringify(preview)).not.toMatch(/private-id|secret-event-id|secret-history|secret-deadline-id/);
});
it("round-trips salary-only and rating-only research without inventing missing observations", async () => {
  for (const research of [{ salary: application.research!.salary }, { companyRating: application.research!.companyRating }]) {
    const preview = await parseTracker(new File([await exportTracker([{ ...application, research }], "csv")], "partial.csv"));
    expect(preview.rows[0].errors).toEqual([]); expect(preview.rows[0].normalized.research).toEqual(research);
  }
});
it("neutralizes CSV spreadsheet formulas while restoring literal text on reimport", async () => {
  const bytes = await exportTracker([{ ...application, company: "=1+1", notes: "@SUM(1,2)" }], "csv");
  expect(new TextDecoder().decode(bytes)).toContain("'=1+1");
  const preview = await parseTracker(new File([bytes], "safe.csv"));
  expect(preview.rows[0].normalized.company).toBe("=1+1");
  expect(preview.rows[0].normalized.notes).toBe("@SUM(1,2)");
});

it("preserves notes whitespace and literal apostrophe prefixes through CSV", async () => {
  const preview = await parseTracker(new File([await exportTracker([{ ...application, company: "'=literal", notes: "  First line\n\tSecond line  " }], "csv")], "literal.csv"));
  expect(preview.rows[0].normalized.company).toBe("'=literal");
  expect(preview.rows[0].normalized.notes).toBe("  First line\n\tSecond line  ");
});

it("round-trips an application with all prior stage events undone", async () => {
  const preview = await parseTracker(new File([await exportTracker([{ ...application, stageEvents: application.stageEvents.map(e => ({ ...e, accepted: false })) }], "csv")], "undone.csv"));
  expect(preview.rows[0].errors).toEqual([]);
  expect(preview.rows[0].normalized).toMatchObject({ stage: null, outcome: null });
});

it.each(["csv", "xlsx"] as const)("round-trips a tag containing a semicolon in %s while keeping ordinary tags semicolon-separated", async format => {
  const bytes = await exportTracker([{ ...application, tags: ["R&D; quant", "priority"] }], format);
  const preview = await parseTracker(new File([bytes], `semicolon.${format}`));

  expect(preview.rows[0].errors).toEqual([]);
  expect(preview.rows[0].normalized.tags).toEqual(["R&D; quant", "priority"]);
  if (format === "csv") expect(new TextDecoder().decode(bytes)).toContain("R%26D%3B%20quant;priority");
});
