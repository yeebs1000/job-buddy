import type { BuddyMode, DetectedField, FillDecision } from "../../../src/domain/buddy";
import type { ProfileSelection } from "../../../src/domain/profile";

export interface FieldSnapshot {
  fingerprint: string;
  currentValuePresent: boolean;
}

export interface PlanFillInput {
  mode: BuddyMode;
  paused: boolean;
  fields: readonly DetectedField[];
  selections: ProfileSelection;
  expectedSnapshots: Readonly<Record<string, FieldSnapshot>>;
  currentSnapshots: Readonly<Record<string, FieldSnapshot>>;
  approvedFieldIds?: readonly string[];
}

export function planFill(input: PlanFillInput): FillDecision[] {
  const approved = new Set(input.approvedFieldIds ?? []);
  return input.fields.map((field) => {
    if (input.paused) return decision(field.id, "blocked", "buddy-paused");
    if (field.risk === "manual") return decision(field.id, "manual", "manual-only-field");
    if (!field.canonicalPath || input.selections[field.canonicalPath] === undefined) return decision(field.id, "review", "missing-or-unresolved-profile-value");
    const expected = input.expectedSnapshots[field.id];
    const current = input.currentSnapshots[field.id];
    if (!expected || !current || expected.fingerprint !== current.fingerprint || expected.currentValuePresent !== current.currentValuePresent) {
      return decision(field.id, "blocked", "field-changed-since-scan");
    }
    if (input.mode === "approval") return approved.has(field.id) ? decision(field.id, "fill", "user-approved") : decision(field.id, "review", "approval-required");
    if (field.currentValuePresent) return decision(field.id, "review", "existing-value-requires-approval");
    if (field.risk !== "safe" || field.confidence < 0.9) return decision(field.id, "review", "guardrail-requires-approval");
    return decision(field.id, "fill", "safe-high-confidence");
  });
}

function decision(fieldId: string, action: FillDecision["action"], reason: string): FillDecision {
  return { fieldId, action, reason };
}
