import { roleFamilies, type Application } from "../../domain/application";
import { parsePendingCapture, type PendingCapture } from "../../domain/buddy";
import { applicationRepository } from "../../db/applicationRepository";

export interface CaptureEdits {
  company: string;
  role: string;
  country: "Singapore" | "Hong Kong" | "United States";
  city: string;
  state?: string;
  discipline: Application["discipline"];
  industry: string;
  roleFamily: NonNullable<Application["roleFamily"]>;
  source: string;
  appliedDate: string;
}

export async function captureApplication(pendingInput: PendingCapture, editsInput: CaptureEdits): Promise<{ applicationId: string; created: boolean }> {
  const pending = parsePendingCapture(pendingInput);
  const edits = validateEdits(editsInput);
  const existing = await applicationRepository.findByCanonicalJob({ company: edits.company, role: edits.role, jobUrl: pending.sourceUrl });
  if (existing) return { applicationId: existing.id, created: false };

  const applicationId = `buddy-${stableHash(`${edits.company}\0${edits.role}\0${pending.sourceUrl}`)}`;
  const appliedAt = new Date(`${edits.appliedDate}T00:00:00.000Z`).toISOString();
  const event = {
    id: `buddy-applied-${applicationId}`,
    applicationId,
    at: appliedAt,
    toStage: "applied" as const,
    origin: "buddy" as const,
    accepted: true,
  };
  try {
    await applicationRepository.create({
      id: applicationId,
      company: edits.company,
      role: edits.role,
      discipline: edits.discipline,
      industry: edits.industry,
      roleFamily: edits.roleFamily,
      market: edits.country === "Singapore" ? "SG" : edits.country === "Hong Kong" ? "HK" : "US",
      location: { city: edits.city, country: edits.country, ...(edits.state ? { state: edits.state } : {}) },
      source: edits.source,
      jobUrl: pending.sourceUrl,
      appliedAt,
      tags: ["buddy"],
      priority: "normal",
      deadlines: [],
      stageEvents: [event],
    });
  } catch (error) {
    const raced = await applicationRepository.findByCanonicalJob({ company: edits.company, role: edits.role, jobUrl: pending.sourceUrl });
    if (raced) return { applicationId: raced.id, created: false };
    throw error;
  }
  return { applicationId, created: true };
}

function validateEdits(input: CaptureEdits): CaptureEdits {
  const text = (value: unknown, maximum = 300) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : undefined;
  const company = text(input.company);
  const role = text(input.role);
  const city = text(input.city);
  const state = text(input.state, 100);
  const industry = text(input.industry, 160);
  const source = text(input.source, 160);
  const country = input.country === "Singapore" || input.country === "Hong Kong" || input.country === "United States" ? input.country : undefined;
  const discipline = input.discipline === "finance" || input.discipline === "software_it" ? input.discipline : undefined;
  const roleFamily = roleFamilies.includes(input.roleFamily) ? input.roleFamily : undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.appliedDate) ? new Date(`${input.appliedDate}T00:00:00.000Z`) : new Date(Number.NaN);
  if (!company || !role || !city || !industry || !source || !country || (country === "United States" && !state) || !discipline || !roleFamily || Number.isNaN(date.getTime())) throw new Error("invalid-capture-metadata");
  return { company, role, city, ...(state ? { state } : {}), industry, source, country, discipline, roleFamily, appliedDate: input.appliedDate };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
