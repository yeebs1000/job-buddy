import { z } from "zod";
import { candidateProfileSchema } from "../../domain/profile";
import { applicationStages, deriveApplicationState } from "../../domain/stage";
import { isSafeExternalHttpsUrl, isSafeExternalJobUrl } from "../../domain/jobUrl";
import { currencySchema, marketSchema, payPeriodSchema, roleAliasOverrideSchema, salaryEstimateSnapshotSchema, salaryObservationSchema } from "../../domain/research";
import { discoveredJobSchema } from "../../domain/discovery";
import { webSalarySnapshotSchema } from "../../domain/webSalary";
import { companyRatingEvidenceSchema } from "../../domain/companyRating";

const id = z.string().min(1).max(2048);
const text = z.string().max(4000);
const time = z.string().datetime({ offset: true });
const date = z.union([time, z.iso.date()]);
const url = z.string().max(2048).refine(isSafeExternalHttpsUrl, "Unsafe link");
// Preserve links already accepted by the tracker importer; never rewrite their scheme.
const jobUrl = z.string().max(2048).refine(isSafeExternalJobUrl, "Unsafe job link");
const stage = z.enum(applicationStages);
const outcome = z.enum(["rejected", "withdrawn", "expired", "offer_declined", "offer_accepted", "hired"]);
const subtype = z.enum(["phone", "video", "technical", "case", "onsite", "final"]);
const source = z.enum(["gmail", "simulated"]);
const confidence = z.number().min(0).max(1);
const strings = text.array().max(1000);
const links = url.array().max(100);
const deadline = z.object({ id, label: text, at: time, completed: z.boolean(), links: links.optional() }).strict();
const event = z.object({ id, applicationId: id, at: time, fromStage: stage.optional(), toStage: stage.optional(), outcome: outcome.optional(), origin: z.enum(["manual", "import", "buddy", "gmail", "system"]), accepted: z.boolean(), evidenceId: id.optional(), confidence: confidence.optional(), note: text.optional(), revertsEventId: id.optional() }).strict();
const application = z.object({
  id, demoState: z.enum(["hidden", "retained"]).optional(), company: text.min(1), role: text.min(1), discipline: z.enum(["finance", "software_it"]),
  industry: text.optional(), roleFamily: z.enum(["finance", "software", "data", "cybersecurity", "cloud", "IT"]).optional(), market: marketSchema.optional(),
  workArrangement: z.enum(["onsite", "hybrid", "remote"]).optional(), priority: z.enum(["low", "normal", "high"]).optional(),
  recruiter: text.optional(), jobUrl: jobUrl.optional(), notes: z.string().max(100_000).optional(), archived: z.boolean().optional(), unreadUpdate: z.boolean().optional(), missingData: z.boolean().optional(), followUpAt: date.optional(),
  location: z.object({ city: text, country: z.enum(["Singapore", "Hong Kong", "United States"]), state: text.optional(), metroCode: text.optional() }).strict(),
  source: text, appliedAt: date, tags: strings, interviewSubtype: subtype.optional(), deadlines: deadline.array().max(1000), targetStage: stage.optional(),
  research: z.object({
    salary: z.object({ minimum: z.number().finite().nonnegative(), maximum: z.number().finite().nonnegative().optional(), currency: currencySchema, period: payPeriodSchema }).strict().refine(r => r.maximum === undefined || r.maximum >= r.minimum).optional(),
    companyRating: z.object({ score: z.number().finite().nonnegative(), outOf: z.number().finite().positive(), source: text }).strict().refine(r => r.score <= r.outOf).optional(),
  }).strict().optional(),
  stage: stage.nullable(), outcome: outcome.nullable(), updatedAt: time,
}).strict();
const inference = z.object({ applicationId: id.nullable(), confidence, reasons: strings }).strict();
const proposal = z.object({
  id, demoHidden: z.boolean().optional(), status: z.enum(["pending", "approved", "rejected", "deferred"]), state: z.enum(["pending", "approved", "rejected", "deferred"]), mailSource: source,
  source: z.object({ providerMessageId: id, threadId: id.optional(), fromName: text.optional(), fromAddress: z.string().max(320), subject: text, receivedAt: time, excerpt: text, links,
    forwarded: z.object({ fromAddress: z.string().max(320), subject: text }).strict().optional(),
  }).strict(),
  match: inference.extend({ conflicts: strings, originalInference: inference.optional() }).strict(),
  classification: z.object({ kind: z.literal("recruiter-outreach").optional(), confidence, reasons: strings, evidenceExcerpt: text, proposedStage: stage.optional(), proposedOutcome: outcome.optional(), interviewSubtype: subtype.optional(), deadlines: deadline.array().max(1000), links, requiresApproval: z.boolean() }).strict(),
  createdAt: time, reviewedAt: time.optional(), relevanceOverride: z.literal("manual-review").optional(),
  opportunity: z.object({ title: text, company: text, location: text, savedAt: time }).strict().optional(),
}).strict().refine(p => p.state === p.status && (p.classification.requiresApproval || (!p.classification.proposedOutcome && !p.match.conflicts.length)), "Invalid approval state");

const filters = z.object({
  search: text.optional(), markets: strings.optional(), roleFamilies: strings.optional(), industries: strings.optional(), workArrangements: strings.optional(), companies: strings.optional(), sources: strings.optional(), stages: stage.array().optional(), outcomes: z.union([outcome, z.literal("active")]).array().optional(), priorities: strings.optional(), tags: strings.optional(),
  appliedFrom: z.iso.date().optional(), appliedTo: z.iso.date().optional(), deadlineFrom: z.iso.date().optional(), deadlineTo: z.iso.date().optional(),
  salaryMin: z.number().finite().optional(), salaryMax: z.number().finite().optional(), currency: text.optional(), salaryPeriod: text.optional(),
  unreadUpdate: z.boolean().optional(), missingData: z.boolean().optional(), followUpDue: z.boolean().optional(), includeArchived: z.boolean().optional(),
}).strict();

export const tableSchemas = {
  applications: application.array().max(100_000), stageEvents: event.array().max(100_000),
  deadlines: deadline.extend({ applicationId: id, proposalId: id, kind: z.enum(["deadline", "interview"]), interviewSubtype: subtype.optional(), links }).strict().array().max(100_000),
  salaryObservations: salaryObservationSchema.array().max(100_000), salaryEstimateSnapshots: salaryEstimateSnapshotSchema.array().max(100_000), roleAliasOverrides: roleAliasOverrideSchema.array().max(100_000),
  savedViews: z.object({ id, name: text, filters, sort: z.union([z.object({ id, desc: z.boolean() }).strict().array().max(100), z.object({ field: id, direction: z.enum(["asc", "desc"]) }).strict()]), visibleColumns: id.array().max(100) }).strict().array().max(100_000),
  updateProposals: proposal.array().max(100_000),
  processedMessages: z.object({ id, processedAt: time, proposalId: id.optional() }).strict().array().max(100_000),
  activityEntries: z.object({ id, proposalId: id, applicationId: id.nullable(), at: time, action: z.enum(["approved", "rejected", "deferred"]), automatic: z.boolean(), mailSource: source }).strict().array().max(100_000),
};
export const workspaceTableNames = Object.keys(tableSchemas) as (keyof typeof tableSchemas)[];
const tableName = z.enum(workspaceTableNames);
const metadataRecord = z.object({ key: id, value: z.string().max(2_000_000) }).strict();
const preferences = z.object({ selectedSource: source, initialSyncCompleted: z.boolean(), dailyActiveScanEnabled: z.boolean(), automationMode: z.enum(["approval", "unrestricted"]) }).strict();

export function portableMetadata(record: { key: string; value: string }): { key: string; value: string } | null {
  if (record.key === "gmail-preferences:v1") {
    preferences.parse(JSON.parse(record.value));
    return { key: record.key, value: JSON.stringify({ selectedSource: "gmail", initialSyncCompleted: false, dailyActiveScanEnabled: false, automationMode: "approval" }) };
  }
  if (record.key === "discovery-shortlist:v1") {
    const jobs = discoveredJobSchema.extend({ savedAt: time }).array().max(500).parse(JSON.parse(record.value));
    unique(jobs, "shortlist");
    return { key: record.key, value: JSON.stringify(jobs) };
  }
  if (record.key === "discovery-board:v1") return { key: record.key, value: url.parse(record.value) };
  if (record.key.startsWith("web-salary:")) {
    const snapshot = webSalarySnapshotSchema.parse(JSON.parse(record.value));
    if (record.key !== `web-salary:${snapshot.id}`) throw new Error("Research key mismatch.");
    return { key: record.key, value: JSON.stringify(snapshot) };
  }
  if (record.key.startsWith("company-rating:")) {
    const rating = companyRatingEvidenceSchema.parse(JSON.parse(record.value));
    if (record.key !== `company-rating:${rating.id}`) throw new Error("Research key mismatch.");
    return { key: record.key, value: JSON.stringify(rating) };
  }
  return null;
}

const schema = z.object({
  version: z.literal(1), exportedAt: time,
  manifest: z.object({ counts: z.record(tableName, z.number().int().nonnegative().max(100_000)), profileIncluded: z.boolean() }).strict(),
  tables: z.object(tableSchemas).strict(), metadata: metadataRecord.array().max(100_000), profile: candidateProfileSchema.nullable(),
}).strict();
export type WorkspaceBackup = z.infer<typeof schema>;

function unique(records: { id: string }[], name: string) {
  if (new Set(records.map(r => r.id)).size !== records.length) throw new Error(`Duplicate IDs in ${name}.`);
}
/** Check raw keys before schema parsing/normalization can discard them. */
function checkJson(value: unknown, depth = 0, path: string[] = []): void {
  if (depth > 30) throw new Error("Backup nesting is too deep.");
  if (typeof value === "string" && value.length > 2_000_000) throw new Error("Backup field is too large.");
  if (Array.isArray(value) && value.length > 100_000) throw new Error("Too many backup records.");
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Unsafe backup key.");
    const legacyJobLink = path.length === 3 && path[0] === "tables" && path[1] === "applications" && key === "jobUrl";
    if (/url$/i.test(key) && typeof item === "string" && !(legacyJobLink ? isSafeExternalJobUrl(item) : isSafeExternalHttpsUrl(item))) throw new Error("Unsafe backup link.");
    checkJson(item, depth + 1, [...path, key]);
  }
}

export function parseWorkspaceBackup(input: unknown): WorkspaceBackup {
  checkJson(input);
  const backup = schema.parse(input);
  let count = backup.metadata.length + (backup.profile ? 1 : 0);
  for (const name of workspaceTableNames) {
    const records = backup.tables[name];
    count += records.length;
    unique(records, name);
    if (backup.manifest.counts[name] !== records.length) throw new Error("Backup counts do not match.");
  }
  if (count > 100_000) throw new Error("Too many backup records.");
  if (backup.manifest.profileIncluded !== Boolean(backup.profile)) throw new Error("Profile manifest mismatch.");
  const appIds = new Set(backup.tables.applications.map(a => a.id));
  const proposalIds = new Set(backup.tables.updateProposals.map(p => p.id));
  const eventIds = new Set(backup.tables.stageEvents.map(e => e.id));
  const requireRef = (value: string | null | undefined, set: Set<string>) => { if (value && !set.has(value)) throw new Error("Backup contains a missing reference."); };
  const eventsByApp = new Map<string, z.infer<typeof event>[]>();
  for (const e of backup.tables.stageEvents) {
    requireRef(e.applicationId, appIds); requireRef(e.revertsEventId, eventIds);
    const events = eventsByApp.get(e.applicationId) ?? []; events.push(e); eventsByApp.set(e.applicationId, events);
  }
  for (const a of backup.tables.applications) { unique(a.deadlines, "application deadlines"); Object.assign(a, deriveApplicationState(eventsByApp.get(a.id) ?? [])); }
  for (const p of backup.tables.updateProposals) {
    requireRef(p.match.applicationId, appIds);
    requireRef(p.match.originalInference?.applicationId, appIds);
    unique(p.classification.deadlines, "proposal deadlines");
  }
  for (const record of [...backup.tables.deadlines, ...backup.tables.activityEntries]) { requireRef(record.applicationId, appIds); requireRef(record.proposalId, proposalIds); }
  for (const record of backup.tables.processedMessages) requireRef(record.proposalId, proposalIds);
  for (const record of [...backup.tables.salaryObservations, ...backup.tables.salaryEstimateSnapshots]) requireRef(record.applicationId, appIds);
  const keys = new Set<string>();
  backup.metadata = backup.metadata.map(record => {
    if (keys.has(record.key)) throw new Error("Duplicate metadata key."); keys.add(record.key);
    // Inspect metadata JSON too; its schema must not conceal unsafe keys/links.
    if (record.key !== "discovery-board:v1") checkJson(JSON.parse(record.value));
    const portable = portableMetadata(record);
    if (!portable) throw new Error("Unsupported backup metadata.");
    if (record.key.startsWith("web-salary:")) requireRef(record.key.slice(11), appIds);
    if (record.key.startsWith("company-rating:")) requireRef(record.key.slice(15), appIds);
    return portable;
  });
  return backup;
}
