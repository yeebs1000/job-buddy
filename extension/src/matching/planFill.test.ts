import { describe, expect, it } from "vitest";
import type { DetectedField } from "../../../src/domain/buddy";
import { planFill } from "./planFill";

const fields: DetectedField[] = [
  field("given-name", "identity.givenName", "safe", 1),
  field("salary", "preferences.salarySGDAnnual", "review", 0.95),
  field("resume", undefined, "manual", 1),
  field("submit", undefined, "manual", 1),
  { ...field("existing", "contact.email", "safe", 1), currentValuePresent: true },
  field("uncertain", "links.portfolio", "safe", 0.85),
];
const selections = {
  "identity.givenName": "Alex",
  "preferences.salarySGDAnnual": 120000,
  "contact.email": "alex@example.com",
  "links.portfolio": "https://example.com",
};
const snapshots = Object.fromEntries(fields.map((item) => [item.id, { fingerprint: `original-${item.id}`, currentValuePresent: item.currentValuePresent }]));

describe("planFill", () => {
  it("reviews every fillable field in approval mode until selected", () => {
    const decisions = planFill({ mode: "approval", paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshots, approvedFieldIds: [] });
    expect(decisions.find((item) => item.fieldId === "given-name")?.action).toBe("review");
    expect(decisions.find((item) => item.fieldId === "resume")?.action).toBe("manual");
  });

  it("fills explicitly approved safe and review fields but never manual fields", () => {
    const decisions = planFill({ mode: "approval", paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshots, approvedFieldIds: ["given-name", "salary", "resume", "existing"] });
    expect(decisions.find((item) => item.fieldId === "given-name")?.action).toBe("fill");
    expect(decisions.find((item) => item.fieldId === "salary")?.action).toBe("fill");
    expect(decisions.find((item) => item.fieldId === "resume")?.action).toBe("manual");
    expect(decisions.find((item) => item.fieldId === "existing")?.action).toBe("fill");
  });

  it("automatically fills only empty safe high-confidence unchanged fields", () => {
    const decisions = planFill({ mode: "automatic", paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshots });
    expect(decisions.filter((item) => item.action === "fill").map((item) => item.fieldId)).toEqual(["given-name"]);
    expect(decisions.find((item) => item.fieldId === "salary")?.action).toBe("review");
    expect(decisions.find((item) => item.fieldId === "submit")?.action).toBe("manual");
    expect(decisions.find((item) => item.fieldId === "existing")?.action).toBe("review");
    expect(decisions.find((item) => item.fieldId === "uncertain")?.action).toBe("review");
  });

  it("blocks every field while paused or when the DOM fingerprint changed", () => {
    const paused = planFill({ mode: "automatic", paused: true, fields, selections, expectedSnapshots: snapshots, currentSnapshots: snapshots });
    expect(paused.every((item) => item.action === "blocked")).toBe(true);
    const changed = { ...snapshots, "given-name": { fingerprint: "replacement", currentValuePresent: false } };
    const decisions = planFill({ mode: "automatic", paused: false, fields, selections, expectedSnapshots: snapshots, currentSnapshots: changed });
    expect(decisions.find((item) => item.fieldId === "given-name")?.action).toBe("blocked");
  });
});

function field(id: string, canonicalPath: DetectedField["canonicalPath"], risk: DetectedField["risk"], confidence: number): DetectedField {
  return { id, label: id, kind: "text", required: false, currentValuePresent: false, canonicalPath, confidence, risk, reason: "fixture" };
}
