import type { Application } from "./application";
import type { ApplicationOutcome, ApplicationStage } from "./stage";

export type NormalizedApplication = Omit<Application, "id" | "stageEvents"> & { stage: ApplicationStage | null; outcome: ApplicationOutcome | null };
export interface ImportRow {
  sourceRow: number;
  normalized: NormalizedApplication;
  errors: string[];
  warnings: string[];
  duplicateReasons: string[];
  included: boolean;
  result?: "imported" | "failed";
  applicationId?: string;
  importError?: string;
}
export interface ImportPreview {
  filename: string;
  mapping: { source: string; field: string | null }[];
  warnings: string[];
  rows: ImportRow[];
}
