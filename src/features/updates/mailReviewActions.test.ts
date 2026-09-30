import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { applicationRepository } from "../../db/applicationRepository";
import { updateRepository } from "./updateRepository";
import { createApplicationForMail, removeMailOpportunity, saveMailOpportunity, suggestedMailApplication } from "./mailReviewActions";
import type { UpdateProposal } from "../../domain/updateProposal";

const details = { company: "Example Capital", role: "Associate", country: "Singapore" as const, city: "Singapore", discipline: "finance" as const, appliedDate: "2026-09-17" };
const receipt: UpdateProposal = { id: "receipt", status: "pending", mailSource: "gmail", createdAt: "2026-09-17T00:00:00Z",
  source: { providerMessageId: "receipt", fromAddress: "example@myworkday.com", subject: "Thank you for applying for Associate at Example Capital", excerpt: "We received your application.", receivedAt: "2026-09-17T00:00:00Z", links: [] },
  match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: [] },
  classification: { proposedStage: "applied", confidence: .9, reasons: ["application-confirmation"], evidenceExcerpt: "We received your application.", requiresApproval: true, deadlines: [], links: [] } };
afterEach(async () => { vi.restoreAllMocks(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("suggests employer and role from a forwarded confirmation without making up location", () => {
  expect(suggestedMailApplication({ ...receipt, source: { ...receipt.source, subject: "Fwd: message", forwarded: { subject: receipt.source.subject, fromAddress: "example@myworkday.com" } } })).toEqual({ role: "Associate", company: "Example Capital" });
});

it("prefills Workday body details instead of treating Workday or the forwarding sender as the employer", () => {
  const source = { ...receipt.source, subject: "Fwd: Thank You for Your Application!", fromAddress: "candidate@example.test", excerpt: "Dear candidate, Thank you for your interest in the Equity Research – Analyst/Associate, Greater China Technology Hardware (Hong Kong) position. We will give careful consideration to your application by reviewing the details you provided against the position criteria. Kind Regards, Morgan Stanley Talent Acquisition.", forwarded: { fromAddress: "ms@myworkday.com", subject: "Thank You for Your Application!" } };
  expect(suggestedMailApplication({ ...receipt, source })).toMatchObject({ company: "Morgan Stanley", role: "Equity Research – Analyst/Associate, Greater China Technology Hardware", city: "Hong Kong", country: "Hong Kong", discipline: "finance" });
});

it("extracts the specific BlackRock program and its location from a reminder", () => {
  expect(suggestedMailApplication({ ...receipt, source: { ...receipt.source, subject: "BlackRock | Action Required: Complete Your Application", excerpt: "Thank you for your interest in BlackRock - we noticed that you have not yet completed your application for 2027 Full-Time Analyst Program - Investments - Portfolio Management - Singapore. As a reminder, submit your pre-interview assessment within 5 calendar days of receiving the invitation." } })).toMatchObject({ company: "BlackRock", role: "2027 Full-Time Analyst Program - Investments - Portfolio Management", city: "Singapore", country: "Singapore", discipline: "finance" });
});

it("does not borrow an employer office address or forwarding identity as the role location", () => {
  expect(suggestedMailApplication({ ...receipt, source: { ...receipt.source, excerpt: "Our headquarters are in Singapore. Contact our Hong Kong team." } })).toEqual({ company: "Example Capital", role: "Associate" });
});

it("links a stage-free entry once and preserves the original unmatched inference", async () => {
  await updateRepository.create(receipt);
  const application = await createApplicationForMail(receipt.id, details);
  expect(application.stage).toBeNull();
  expect(await updateRepository.get(receipt.id)).toMatchObject({ status: "pending", match: { applicationId: application.id, originalInference: { applicationId: null, confidence: 0, reasons: ["unmatched"] } } });
  await expect(createApplicationForMail(receipt.id, details)).rejects.toThrow(/already linked/);
  expect(await jobBuddyDb.applications.count()).toBe(1);
});

it("blocks duplicate company and role entries from another email", async () => {
  await updateRepository.create(receipt);
  await createApplicationForMail(receipt.id, details);
  await updateRepository.create({ ...receipt, id: "second" });
  await expect(createApplicationForMail("second", details)).rejects.toThrow(/already exists/);
  expect((await updateRepository.get("second"))?.match.applicationId).toBeNull();
  expect(await jobBuddyDb.applications.count()).toBe(1);
});

it("rolls back application creation if linking the email cannot be saved", async () => {
  await updateRepository.create(receipt);
  vi.spyOn(jobBuddyDb.updateProposals, "update").mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(createApplicationForMail(receipt.id, details)).rejects.toThrow("Storage unavailable");
  expect(await jobBuddyDb.applications.count()).toBe(0);
  expect((await updateRepository.get(receipt.id))?.match.applicationId).toBeNull();
});

it.each(["location", "date", "archived"])("allows a distinct application with the same employer and title (%s)", async difference => {
  await updateRepository.create(receipt);
  const first = await createApplicationForMail(receipt.id, details);
  if (difference === "archived") await applicationRepository.update(first.id, { archived: true });
  await updateRepository.create({ ...receipt, id: "second" });
  await createApplicationForMail("second", { ...details, ...(difference === "location" ? { country: "Hong Kong", city: "Hong Kong" } : difference === "date" ? { appliedDate: "2026-09-18" } : {}) });
  expect(await jobBuddyDb.applications.count()).toBe(2);
});

it("rejects invalid dates before creating any records", async () => {
  await updateRepository.create(receipt);
  await expect(createApplicationForMail(receipt.id, { ...details, appliedDate: "2026-02-30" })).rejects.toThrow();
  expect(await jobBuddyDb.applications.count()).toBe(0);
});

it("saves outreach idempotently outside the application pipeline and preserves evidence on removal", async () => {
  const outreach: UpdateProposal = { ...receipt, source: { ...receipt.source, subject: "Consultant opportunity", excerpt: "I am reaching out regarding a Consultant opportunity. Your profile could be a strong fit." }, classification: { kind: "recruiter-outreach", confidence: .7, reasons: ["personal-recruiter-outreach"], evidenceExcerpt: "I am reaching out regarding a Consultant opportunity.", requiresApproval: true, deadlines: [], links: [] } };
  await updateRepository.create(outreach);
  await expect(createApplicationForMail(outreach.id, details)).rejects.toThrow(/not available/);
  const values = { title: "Consultant", company: "", location: "Shanghai, China" };
  await saveMailOpportunity(outreach.id, values);
  const saved = await updateRepository.get(outreach.id);
  await saveMailOpportunity(outreach.id, values);
  expect(await updateRepository.get(outreach.id)).toEqual(saved);
  expect(await applicationRepository.list()).toEqual([]);
  await removeMailOpportunity(outreach.id);
  expect(await updateRepository.get(outreach.id)).toMatchObject({ source: outreach.source, status: "deferred" });
  expect((await updateRepository.get(outreach.id))?.opportunity).toBeUndefined();
});
