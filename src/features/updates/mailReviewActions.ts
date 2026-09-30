import { z } from "zod";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import type { UpdateProposal } from "../../domain/updateProposal";
import { proposalFilterReason } from "./proposalRelevance";

const text = z.string().trim().min(1).max(200);
export const mailApplicationSchema = z.object({
  company: text, role: text, city: text,
  country: z.enum(["Singapore", "Hong Kong", "United States"]),
  discipline: z.enum(["finance", "software_it"]),
  appliedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }),
});
export type MailApplicationDetails = z.infer<typeof mailApplicationSchema>;

export function suggestedMailApplication(proposal: UpdateProposal) {
  const subject = (proposal.source.forwarded?.subject || proposal.source.subject).replace(/^(?:(?:fw|fwd|re):\s*)+/i, "");
  const body = proposal.source.excerpt.replace(/\s+/g, " ");
  const match = /^(?:thank you for applying (?:for|to)|update on your application for)\s+(.+)\s+at\s+(.+)$/i.exec(subject);
  const interest = /\b(?:interest in|apply for)\s+(?:the|our|a|an)\s+(.{2,200}?)\s+(?:position|role|job)\b/i.exec(body);
  const program = /\byour application for\s+(.{2,200}?)(?:[.!?](?=\s|$)|$)/i.exec(body);
  let role = (match?.[1] ?? interest?.[1] ?? program?.[1] ?? "").trim().slice(0, 200);
  // Use explicit employer text, never an ATS domain or the forwarding sender.
  const signature = /\b(?:kind regards|warm regards|sincerely|regards)[,!]?\s+(.{2,100}?)\s+Talent Acquisition(?:\s+Team)?\b/i.exec(body);
  const roleEmployer = /\b(?:position|role|job)\s+at\s+(.{2,100}?)(?:[.!?](?=\s|$)|$)/i.exec(body);
  const prefix = /^(.{2,100}?)\s*\|\s*(?:Action Required|Application|Thank you)\b/i.exec(subject);
  const company = (match?.[2] ?? roleEmployer?.[1] ?? signature?.[1] ?? prefix?.[1] ?? "").trim().slice(0, 200);
  // ponytail: only explicit supported market suffixes; unfamiliar locations stay blank for review.
  const location = /(?:\s*\(\s*|\s+[-–—]\s+)(Singapore|Hong Kong)\s*\)?$/i.exec(role);
  const country = location ? /^singapore$/i.test(location[1]) ? "Singapore" as const : "Hong Kong" as const : undefined;
  if (location) role = role.slice(0, location.index).trim();
  const discipline = /\b(?:equity|investment[s]?|portfolio|financial|finance|ETF|banking|wealth|asset management)\b/i.test(role) ? "finance" as const
    : /\b(?:software|developer|IT support|cybersecurity|data engineer)\b/i.test(role) ? "software_it" as const : undefined;
  return { role, company, ...(country ? { country, city: country } : {}), ...(discipline ? { discipline } : {}) };
}

// Creating an entry never accepts the email's inferred stage. The separate
// approval action keeps existing conflict, terminal-outcome and stale-edit checks.
export async function createApplicationForMail(proposalId: string, input: MailApplicationDetails) {
  const details = mailApplicationSchema.parse(input);
  return jobBuddyDb.transaction("rw", jobBuddyDb.updateProposals, jobBuddyDb.applications, jobBuddyDb.stageEvents, async () => {
    const proposal = await jobBuddyDb.updateProposals.get(proposalId);
    if (!proposal || proposal.classification.kind === "recruiter-outreach" || proposalFilterReason(proposal)
      || !["pending", "deferred"].includes(proposal.status)) throw new Error("This email is not available for application creation.");
    if (proposal.match.applicationId) throw new Error("This email is already linked. Select its existing application.");
    const canonical = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
    const duplicate = await jobBuddyDb.applications.filter(app => !app.archived && app.demoState !== "hidden"
      && canonical(app.company) === canonical(details.company) && canonical(app.role) === canonical(details.role)
      && app.location.country === details.country && canonical(app.location.city) === canonical(details.city)
      && app.appliedAt.slice(0, 10) === details.appliedDate).first();
    if (duplicate) throw new Error("A matching application already exists for this location and date. Select it from the Application list.");
    const application = await applicationRepository.create({
      id: JSON.stringify(["mail-application", proposalId]), company: details.company, role: details.role,
      discipline: details.discipline, location: { city: details.city, country: details.country },
      source: proposal.mailSource === "gmail" ? "Gmail (reviewed)" : "Email (reviewed)",
      appliedAt: `${details.appliedDate}T00:00:00.000Z`, tags: [], deadlines: [], stageEvents: [],
    });
    await jobBuddyDb.updateProposals.update(proposalId, { match: { ...proposal.match, applicationId: application.id,
      originalInference: proposal.match.originalInference ?? { applicationId: proposal.match.applicationId, confidence: proposal.match.confidence, reasons: proposal.match.reasons } } });
    return application;
  });
}

const opportunitySchema = z.object({ title: text, company: z.string().trim().max(200), location: z.string().trim().max(200) });
export async function saveMailOpportunity(proposalId: string, details: { title: string; company: string; location: string }) {
  const values = opportunitySchema.parse(details);
  await jobBuddyDb.transaction("rw", jobBuddyDb.updateProposals, async () => {
    const proposal = await jobBuddyDb.updateProposals.get(proposalId);
    if (!proposal || proposal.classification.kind !== "recruiter-outreach" || proposalFilterReason(proposal)) throw new Error("Only recruiter outreach can be saved as an opportunity.");
    if (proposal.opportunity) return;
    if (!["pending", "deferred"].includes(proposal.status)) throw new Error("This outreach has already been reviewed.");
    const now = new Date().toISOString();
    await jobBuddyDb.updateProposals.update(proposalId, { opportunity: { ...values, savedAt: now }, status: "approved", state: "approved", reviewedAt: now });
  });
}

export async function removeMailOpportunity(proposalId: string) {
  await jobBuddyDb.transaction("rw", jobBuddyDb.updateProposals, async () => {
    const proposal = await jobBuddyDb.updateProposals.get(proposalId);
    if (!proposal?.opportunity || proposal.classification.kind !== "recruiter-outreach") return;
    await jobBuddyDb.updateProposals.update(proposalId, { opportunity: undefined, status: "deferred", state: "deferred", reviewedAt: new Date().toISOString() });
  });
}
