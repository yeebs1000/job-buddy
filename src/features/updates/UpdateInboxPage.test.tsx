import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { applicationRepository } from "../../db/applicationRepository";
import { createUpdateProposal, type UpdateProposalInput } from "../../domain/updateProposal";
import { fixtureMessages } from "../../fixtures/mail/messages";
import { FixtureMailAdapter } from "../../integrations/mail/FixtureMailAdapter";
import { CommandCenterPage } from "../command-center/CommandCenterPage";
import { appRoutes } from "../../app/routes";
import { updateRepository } from "./updateRepository";
import { UpdateInboxPage } from "./UpdateInboxPage";

const technicalInterviewMail = {
  ...fixtureMessages[0],
  threadId: "thread-meridian-quant",
  fromName: "Meridian Quant Recruiting",
  fromAddress: "recruiting@meridianquant.example",
  subject: "Technical interview invitation — Quantitative Analyst",
  excerpt: "Meridian Quant would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.",
  links: ["https://meet.example/meridian-technical"],
};

beforeEach(async () => {
  await jobBuddyDb.metadata.put({ key: "demo-seeded-v1", value: "true" });
  await applicationRepository.create({
    id: "application-1", company: "Meridian Quant", role: "Quantitative Analyst",
    recruiter: "recruiting@meridianquant.example", discipline: "finance",
    location: { city: "Singapore", country: "Singapore" }, source: "manual",
    appliedAt: "2026-09-01T00:00:00Z", tags: [], deadlines: [],
    stageEvents: [{ id: "initial", applicationId: "application-1", at: "2026-09-01T00:00:00Z", toStage: "applied", origin: "manual", accepted: true }],
  });
});
afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

async function proposal(overrides: Partial<UpdateProposalInput> = {}) {
  await updateRepository.create(createUpdateProposal({
    id: "proposal-1", status: "pending", mailSource: "simulated", createdAt: "2026-09-12T09:00:00Z",
    source: technicalInterviewMail,
    match: { applicationId: "application-1", confidence: 0.95, reasons: ["company", "role", "sender-domain"], conflicts: [] },
    classification: { confidence: 0.95, reasons: ["technical-interview-invitation"], evidenceExcerpt: technicalInterviewMail.excerpt,
      proposedStage: "interview", requiresApproval: true, interviewSubtype: "technical",
      deadlines: [{ id: "deadline-1", label: "Technical interview", at: "2026-09-13T06:00:00.000Z", completed: false }],
      links: ["https://meet.example/meridian-technical", "javascript:alert(1)"] },
    ...overrides,
  }));
}
function inbox() { return render(<MemoryRouter><UpdateInboxPage /></MemoryRouter>); }

it("explains unmatched approval and creates a reviewed draft without applying the email until approved", async () => {
  await proposal({ match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: [] } });
  const user = userEvent.setup(); inbox();
  expect(await screen.findByText(/select an application or create one/i)).toBeVisible();
  expect(screen.getByRole("button", { name: "Approve update" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Create application & review" }));
  await user.type(screen.getByLabelText("Company"), "Example Analytics");
  await user.type(screen.getByLabelText("Job title"), "Research Analyst");
  await user.selectOptions(screen.getByLabelText("Country / market"), "Singapore");
  await user.type(screen.getByLabelText("City"), "Singapore");
  await user.selectOptions(screen.getByLabelText("Role discipline"), "finance");
  await user.click(screen.getByRole("button", { name: "Save application & review update" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Approve update" })).toBeEnabled());
  const saved = (await applicationRepository.list()).find(app => app.company === "Example Analytics")!;
  expect(saved.stage).toBeNull();
  expect((await updateRepository.get("proposal-1"))?.status).toBe("pending");
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  await waitFor(async () => expect((await applicationRepository.get(saved.id))?.stage).toBe("interview"));
});

it("creates the screenshot application from prefilled email details without retyping them", async () => {
  await proposal({ match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: [] },
    source: { ...technicalInterviewMail, subject: "BlackRock | Action Required: Complete Your Application", excerpt: "We noticed that you have not yet completed your application for 2027 Full-Time Analyst Program - Investments - Portfolio Management - Singapore. To complete your application you must submit your pre-interview assessment within 5 calendar days of receiving the invitation." },
    classification: { confidence: .85, reasons: ["assessment-invitation"], evidenceExcerpt: "Complete your pre-interview assessment", proposedStage: "assessment", requiresApproval: true, deadlines: [], links: [] } });
  const user = userEvent.setup(); inbox();
  await user.click(await screen.findByRole("button", { name: "Create application & review" }));
  expect(screen.getByLabelText("Company")).toHaveValue("BlackRock");
  expect(screen.getByLabelText("Job title")).toHaveValue("2027 Full-Time Analyst Program - Investments - Portfolio Management");
  expect(screen.getByLabelText("Country / market")).toHaveValue("Singapore");
  expect(screen.getByLabelText("City")).toHaveValue("Singapore");
  expect(screen.getByLabelText("Role discipline")).toHaveValue("finance");
  await user.click(screen.getByRole("button", { name: "Save application & review update" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Approve update" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  await waitFor(async () => expect((await applicationRepository.list()).find(app => app.company === "BlackRock")).toMatchObject({ stage: "assessment", location: { city: "Singapore", country: "Singapore" } }));
});

it("saves outreach as an opportunity visible in Command Center without creating an application", async () => {
  await proposal({ match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: [] },
    source: { ...technicalInterviewMail, subject: "Senior Consultant opportunity - Shanghai", excerpt: "I am reaching out regarding a Senior Consultant opportunity. Your profile could be a strong fit." },
    classification: { kind: "recruiter-outreach", confidence: .7, reasons: ["personal-recruiter-outreach"], evidenceExcerpt: "Opportunity", deadlines: [], links: [], requiresApproval: true } });
  const user = userEvent.setup(); const view = inbox();
  await user.click(await screen.findByRole("button", { name: "Save to Command Center" }));
  await user.type(screen.getByLabelText("Opportunity location"), "Shanghai, China");
  await user.click(screen.getByRole("button", { name: "Save opportunity" }));
  expect(await screen.findByRole("link", { name: "Command Center opportunities" })).toBeVisible();
  expect(await applicationRepository.list()).toHaveLength(1);
  expect(await updateRepository.listPending()).toHaveLength(0);
  // Opportunities must also remain reachable for a new user with no applications.
  await jobBuddyDb.applications.clear();
  view.unmount();
  render(<MemoryRouter><CommandCenterPage mailAdapter={new FixtureMailAdapter([])} /></MemoryRouter>);
  expect(await screen.findByRole("heading", { name: "Opportunities — not applied" })).toBeVisible();
  expect(await screen.findByText("Shanghai, China")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Remove from Command Center" }));
  await waitFor(() => expect(screen.queryByText("Shanghai, China")).not.toBeInTheDocument());
  expect((await updateRepository.get("proposal-1"))?.status).toBe("deferred");
});

it("shows recruiter outreach without application stage controls and lets users dismiss it", async () => {
  await proposal({ source: { ...technicalInterviewMail, subject: "Senior Consultant opportunity", excerpt: "I am reaching out regarding a Senior Consultant opportunity. Your background could be a strong fit." },
    classification: { kind: "recruiter-outreach", confidence: 0.7, reasons: ["personal-recruiter-outreach"], evidenceExcerpt: "A potential role", deadlines: [], links: [], requiresApproval: true } });
  inbox();
  expect(await screen.findByText("Recruiter outreach", { exact: true })).toBeVisible();
  expect(screen.queryByLabelText("Proposed stage")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Approve update" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Dismiss outreach" }));
  await waitFor(async () => expect((await updateRepository.get("proposal-1"))?.status).toBe("rejected"));
  expect((await applicationRepository.get("application-1"))?.stage).toBe("applied");
});

it("rechecks saved pending news, excludes it from badges, and lets users restore it without deleting evidence", async () => {
  await proposal({ mailSource: "gmail", source: { ...technicalInterviewMail, fromAddress: "noreply@news.bloomberg.com", subject: "News alert: A consulting offer", excerpt: "A consulting offer was made to a third party." } });
  const original = await updateRepository.get("proposal-1");
  expect(await updateRepository.listPending()).toHaveLength(0);
  const view = inbox();
  expect(await screen.findByRole("button", { name: /show filtered.*1/i })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "News alert: A consulting offer" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /show filtered.*1/i }));
  expect(await screen.findByRole("heading", { name: "News alert: A consulting offer" })).toBeVisible();
  expect(screen.getByText(/newsletter sender/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve update" })).not.toBeInTheDocument();
  expect(await updateRepository.get("proposal-1")).toEqual(original);
  await userEvent.click(screen.getByRole("button", { name: "Restore for manual review" }));
  await waitFor(async () => expect(await updateRepository.listPending()).toHaveLength(1));
  expect((await updateRepository.get("proposal-1"))?.classification.requiresApproval).toBe(true);
  expect((await updateRepository.get("proposal-1"))?.classification.proposedStage).toBeUndefined();
  expect((await updateRepository.get("proposal-1"))?.classification.deadlines).toEqual([]);
  view.unmount(); inbox();
  expect(await screen.findByRole("button", { name: "Approve update" })).toBeVisible();
});

it("does not hide approved history even when its source now fails the relevance rules", async () => {
  await proposal({ status: "approved", mailSource: "gmail", source: { ...technicalInterviewMail, fromAddress: "noreply@news.bloomberg.com", subject: "Previously approved news", excerpt: "A subscription offer." } });
  inbox();
  expect(await screen.findByRole("heading", { name: "Previously approved news" })).toBeVisible();
  expect((await updateRepository.get("proposal-1"))?.status).toBe("approved");
});

it("shows source evidence and atomically applies edited stage and deadline, then displays them after remount", async () => {
  await proposal();
  const user = userEvent.setup();
  const view = inbox();
  expect(await screen.findByText("recruiting@meridianquant.example")).toBeVisible();
  expect(screen.getByText("Demo")).toBeVisible();
  expect(screen.getByText(/company, role, sender domain/i)).toBeVisible();
  expect(screen.getByText("Match: Suggested application")).toBeVisible();
  expect(screen.getByText(/not a measured probability/i)).toBeVisible();
  expect(screen.queryByText(/confidence:.*%/i)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /meet.example/ })).toHaveAttribute("href", "https://meet.example/meridian-technical");
  expect(screen.queryByRole("link", { name: /javascript/ })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Proposed stage"), "final");
  await user.clear(screen.getByLabelText("Deadline 1 date and time"));
  await user.type(screen.getByLabelText("Deadline 1 date and time"), "2026-09-20T14:00:00+08:00");
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  expect(await screen.findByText("Update applied.")).toBeVisible();
  expect(await applicationRepository.get("application-1")).toMatchObject({ stage: "final", deadlines: [{ at: "2026-09-20T06:00:00.000Z" }] });
  expect(await jobBuddyDb.deadlines.count()).toBe(1);
  view.unmount(); inbox();
  expect(await screen.findByText(/Saved deadline: Technical interview/)).toHaveTextContent("2026-09-20T06:00:00.000Z");
  expect(screen.getByText(/Proposed stage: Final/)).toBeVisible();
});

it.each([['Reject update', 'rejected'], ['Defer update', 'deferred']] as const)("%s preserves application and deadline history", async (button, status) => {
  await proposal(); const before = await applicationRepository.get("application-1");
  inbox(); await userEvent.click(await screen.findByRole("button", { name: button }));
  await waitFor(async () => expect((await updateRepository.get("proposal-1"))?.status).toBe(status));
  expect(await applicationRepository.get("application-1")).toEqual(before);
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  if (status === "deferred") expect(screen.getByRole("button", { name: "Approve update" })).toBeVisible();
});

it("retains a rejected extracted deadline as evidence without writing it to the application", async () => {
  await proposal();
  inbox();
  await userEvent.click(await screen.findByRole("button", { name: "Reject update" }));

  expect(await screen.findByText(/Extracted deadline — not applied: Technical interview/)).toBeVisible();
  expect((await applicationRepository.get("application-1"))?.deadlines).toEqual([]);
});

it("labels retained matching evidence as the original inference after selecting another application", async () => {
  await applicationRepository.create({
    id: "application-2", company: "Other Company", role: "Other role", discipline: "finance",
    location: { city: "Singapore", country: "Singapore" }, source: "manual", appliedAt: "2026-09-01T00:00:00Z", tags: [], deadlines: [], stageEvents: [],
  });
  await proposal();
  inbox();
  await userEvent.selectOptions(await screen.findByLabelText("Application"), "application-2");

  expect(screen.getByText("Original match: Suggested application")).toBeVisible();
  expect(screen.getByText(/Original inference: company, role, sender domain/i)).toBeVisible();
});

it("persists original inference labels after approving a different application and reloading", async () => {
  await applicationRepository.create({
    id: "application-2", company: "Other Company", role: "Other role", discipline: "finance",
    location: { city: "Singapore", country: "Singapore" }, source: "manual", appliedAt: "2026-09-01T00:00:00Z", tags: [], deadlines: [], stageEvents: [],
  });
  await proposal();
  const view = inbox();
  await userEvent.selectOptions(await screen.findByLabelText("Application"), "application-2");
  await userEvent.click(screen.getByRole("button", { name: "Approve update" }));
  expect(await screen.findByText("Update applied.")).toBeVisible();

  view.unmount(); inbox();
  expect(await screen.findByText("Original match: Suggested application")).toBeVisible();
  expect(screen.getByText(/Original inference: company, role, sender domain/i)).toBeVisible();
  expect((await updateRepository.get("proposal-1"))?.match).toMatchObject({ applicationId: "application-2", originalInference: { applicationId: "application-1", confidence: 0.95, reasons: ["company", "role", "sender-domain"] } });
});

it("requires selecting a persisted application for unmatched evidence", async () => {
  await proposal({ match: { applicationId: null, confidence: 0, reasons: ["unmatched"], conflicts: ["ambiguous"] } });
  inbox();
  const approve = await screen.findByRole("button", { name: "Approve update" });
  expect(approve).toBeDisabled();
  expect(screen.getByText(/ambiguous/i)).toBeVisible();
  await userEvent.selectOptions(screen.getByLabelText("Application"), "application-1");
  await userEvent.click(approve);
  expect(await screen.findByText("Update applied.")).toBeVisible();
  expect((await updateRepository.get("proposal-1"))?.match.applicationId).toBe("application-1");
});

it("rechecks a live application conflict before approval and requires inline confirmation", async () => {
  await proposal({ match: { applicationId: "application-1", confidence: 0.95, reasons: ["company"], conflicts: ["ambiguous"] } });
  inbox();
  expect(await screen.findByText(/Scan-time conflicts: ambiguous/)).toBeVisible();
  await applicationRepository.appendEvent({
    id: "later-manual-final", applicationId: "application-1", at: "2026-09-14T00:00:00Z",
    fromStage: "applied", toStage: "final", origin: "manual", accepted: true,
  });
  expect(await screen.findByText(/Current application conflicts: stage not forward/)).toBeVisible();
  expect(screen.getByText(/Current application stage: Final/)).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Approve update" }));
  const confirmation = await screen.findByRole("alertdialog", { name: "Approve conflicting update?" });
  expect((await updateRepository.get("proposal-1"))?.status).toBe("pending");
  expect((await applicationRepository.get("application-1"))?.stage).toBe("final");
  await userEvent.click(within(confirmation).getByRole("button", { name: "Approve update" }));
  expect(await screen.findByText("Update applied.")).toBeVisible();
});

it("shows stale-review guidance and leaves the proposal pending when approval loses its transaction token", async () => {
  await proposal();
  const rejection = vi.spyOn(updateRepository, "approveProposal").mockRejectedValueOnce(new Error("This application changed while you were reviewing it. Refresh and confirm the current state before approving."));
  inbox();

  await userEvent.click(await screen.findByRole("button", { name: "Approve update" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Review the current state and confirm again.");
  expect((await updateRepository.get("proposal-1"))?.status).toBe("pending");
  rejection.mockRestore();
});

it("keeps keyboard focus on the reviewed row result after multi-row actions reorder the inbox", async () => {
  await proposal({ id: "proposal-reject", source: { ...fixtureMessages[0], providerMessageId: "reject", subject: "Reject message", receivedAt: "2026-09-15T09:00:00Z" } });
  await proposal({ id: "proposal-defer", source: { ...fixtureMessages[0], providerMessageId: "defer", subject: "Defer message", receivedAt: "2026-09-14T09:00:00Z" } });
  await proposal({ id: "proposal-approve", source: { ...fixtureMessages[0], providerMessageId: "approve", subject: "Approve message", receivedAt: "2026-09-13T09:00:00Z" } });
  inbox();
  const user = userEvent.setup();
  const list = await screen.findByRole("region", { name: "Mail update proposals" });

  const rejectRow = within(list).getByRole("article", { name: /Reject message/ });
  const reject = within(rejectRow).getByRole("button", { name: "Reject update" });
  reject.focus(); await user.keyboard("{Enter}");
  const rejected = await within(rejectRow).findByText("Review result: Update rejected.");
  expect(rejected).toHaveAttribute("role", "status");
  await waitFor(() => expect(document.activeElement).toBe(rejected));
  await waitFor(() => expect(Array.from(list.querySelectorAll("article")).at(-1)).toBe(rejectRow));

  const deferRow = within(list).getByRole("article", { name: /Defer message/ });
  const defer = within(deferRow).getByRole("button", { name: "Defer update" });
  defer.focus(); await user.keyboard("{Enter}");
  const deferred = await within(deferRow).findByText("Review result: Update deferred. You can review it later.");
  expect(deferred).toHaveAttribute("role", "status");
  await waitFor(() => expect(document.activeElement).toBe(deferred));

  const approveRow = within(list).getByRole("article", { name: /Approve message/ });
  const approve = within(approveRow).getByRole("button", { name: "Approve update" });
  approve.focus(); await user.keyboard("{Enter}");
  const approved = await within(approveRow).findByText("Review result: Update applied.");
  expect(approved).toHaveAttribute("role", "status");
  await waitFor(() => expect(document.activeElement).toBe(approved));
});

it("requires an explicit approve confirmation before applying an edited terminal outcome", async () => {
  await proposal(); inbox(); const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText("Proposed outcome"), "rejected");
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  const confirmation = screen.getByRole("alertdialog", { name: "Approve terminal update?" });
  expect((await applicationRepository.get("application-1"))?.outcome).toBeNull();
  await user.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Approve update" }));
  expect(await screen.findByText("Update applied.")).toBeVisible();
  expect((await applicationRepository.get("application-1"))?.outcome).toBe("rejected");
});

it.each(["2026-09-20T14:00", "2026-02-31T14:00:00+08:00"])("rejects invalid deadline %s without changing stored data", async (date) => {
  await proposal(); inbox(); const user = userEvent.setup();
  await user.clear(await screen.findByLabelText("Deadline 1 date and time"));
  await user.type(screen.getByLabelText("Deadline 1 date and time"), date);
  await user.click(screen.getByRole("button", { name: "Approve update" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/timezone/i);
  expect((await updateRepository.get("proposal-1"))?.status).toBe("pending");
});

it("rolls back a failed approval, shows safe feedback, and permits retry", async () => {
  await proposal();
  const collisionId = JSON.stringify(["mail-action", "proposal-1", "approved"]);
  await jobBuddyDb.activityEntries.add({ id: collisionId, proposalId: "proposal-1", applicationId: "application-1", at: "2026-09-01T00:00:00Z", action: "approved", automatic: false, mailSource: "simulated" });
  inbox();
  await userEvent.click(await screen.findByRole("button", { name: "Approve update" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not be saved/i);
  expect((await applicationRepository.get("application-1"))?.stage).toBe("applied");
  expect(await jobBuddyDb.deadlines.count()).toBe(0);
  await jobBuddyDb.activityEntries.delete(collisionId);
  await userEvent.click(screen.getByRole("button", { name: "Approve update" }));
  expect(await screen.findByText("Update applied.")).toBeVisible();
  expect((await applicationRepository.get("application-1"))?.stage).toBe("interview");
});

it("shows scan progress and refreshes the command center deadline after unrestricted simulation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fixture = new FixtureMailAdapter([technicalInterviewMail]);
  render(<MemoryRouter><CommandCenterPage mailAdapter={{ source: "simulated", async scan(cursor) { await gate; return fixture.scan(cursor); } }} /></MemoryRouter>);
  await userEvent.selectOptions(await screen.findByLabelText("Scan mode"), "unrestricted");
  await userEvent.click(screen.getByRole("button", { name: "Scan demo inbox" }));
  expect(await screen.findByRole("button", { name: "Scanning demo inbox…" })).toBeDisabled();
  expect(screen.getAllByRole("status").some((status) => /Checking fictional messages/.test(status.textContent ?? ""))).toBe(true);
  expect(screen.getByLabelText("Scan mode")).toBeDisabled();
  release();
  expect(await screen.findByText(/Overdue: Technical interview|Today: Technical interview|Tomorrow: Technical interview|Due .+: Technical interview/)).toBeVisible();
  expect((await applicationRepository.get("application-1"))?.stage).toBe("interview");
  expect(screen.getByRole("link", { name: "Review 0 pending updates" })).toBeVisible();
});

it("shows stable skeletons before the empty inbox and links to a simulated scan", async () => {
  inbox();
  expect(screen.getByRole("region", { name: "Loading updates" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getAllByTestId("update-skeleton")).toHaveLength(3);
  expect(await screen.findByRole("heading", { name: "No updates yet" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open scan controls" })).toHaveAttribute("href", "/");
  expect(screen.getByText(/Connect Gmail and scan/i)).toBeVisible();
});

it("updates the navigation pending badge when a proposal is reviewed", async () => {
  await proposal();
  render(<RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: ["/updates"] })} />);
  expect(await screen.findByRole("link", { name: "Updates, 1 pending" })).toBeVisible();
  await userEvent.click(await screen.findByRole("button", { name: "Reject update" }));
  expect(await screen.findByRole("link", { name: "Updates, 0 pending" })).toBeVisible();
});

it("retries a failed simulated scan safely and keeps approval as the default mode", async () => {
  let failed = false;
  const fixture = new FixtureMailAdapter([technicalInterviewMail]);
  const adapter = { source: "simulated" as const, async scan(cursor: string | null) { if (!failed) { failed = true; throw new Error("secret provider error"); } return fixture.scan(cursor); } };
  render(<MemoryRouter><CommandCenterPage mailAdapter={adapter} /></MemoryRouter>);
  const scan = await screen.findByRole("button", { name: "Scan demo inbox" });
  expect(screen.getByLabelText("Scan mode")).toHaveValue("approval");
  await userEvent.click(scan);
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not be completed/i);
  expect(screen.queryByText(/secret provider error/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry demo scan" }));
  expect(await screen.findByRole("link", { name: "Review 1 pending update" })).toBeVisible();
  await waitFor(() => expect(screen.getByText(/Last successful scan:/)).not.toHaveTextContent("Never"));
  expect((await applicationRepository.get("application-1"))?.stage).toBe("applied");
  await userEvent.selectOptions(screen.getByLabelText("Scan mode"), "unrestricted");
  expect(screen.getByRole("alert")).toHaveTextContent(/automatically apply/i);
  expect(screen.getByRole("alert")).toHaveTextContent(/terminal/i);
});
