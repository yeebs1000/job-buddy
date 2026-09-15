import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { applicationRepository } from "../../db/applicationRepository";
import { createUpdateProposal, type UpdateProposalInput } from "../../domain/updateProposal";
import { fixtureMessages } from "../../fixtures/mail/messages";
import { FixtureMailAdapter } from "../../integrations/mail/FixtureMailAdapter";
import { CommandCenterPage } from "../command-center/CommandCenterPage";
import { appRoutes } from "../../app/routes";
import { updateRepository } from "./updateRepository";
import { UpdateInboxPage } from "./UpdateInboxPage";

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
    id: "proposal-1", status: "pending", createdAt: "2026-09-12T09:00:00Z",
    source: fixtureMessages[0],
    match: { applicationId: "application-1", confidence: 0.95, reasons: ["company", "role", "sender-domain"], conflicts: [] },
    classification: { confidence: 0.95, reasons: ["technical-interview-invitation"], evidenceExcerpt: fixtureMessages[0].excerpt,
      proposedStage: "interview", requiresApproval: true, interviewSubtype: "technical",
      deadlines: [{ id: "deadline-1", label: "Technical interview", at: "2026-09-13T06:00:00.000Z", completed: false }],
      links: ["https://meet.example/meridian-technical", "javascript:alert(1)"] },
    ...overrides,
  }));
}
function inbox() { return render(<MemoryRouter><UpdateInboxPage /></MemoryRouter>); }

it("shows source evidence and atomically applies edited stage and deadline, then displays them after remount", async () => {
  await proposal();
  const user = userEvent.setup();
  const view = inbox();
  expect(await screen.findByText("recruiting@meridianquant.example")).toBeVisible();
  expect(screen.getByText(/company, role, sender domain/i)).toBeVisible();
  expect(screen.getByText(/Match confidence: 95%/)).toBeVisible();
  expect(screen.getByText(/Classification confidence: 95%/)).toBeVisible();
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
  expect(document.activeElement).toBe(rejected);
  await waitFor(() => expect(Array.from(list.querySelectorAll("article")).at(-1)).toBe(rejectRow));

  const deferRow = within(list).getByRole("article", { name: /Defer message/ });
  const defer = within(deferRow).getByRole("button", { name: "Defer update" });
  defer.focus(); await user.keyboard("{Enter}");
  const deferred = await within(deferRow).findByText("Review result: Update deferred. You can review it later.");
  expect(deferred).toHaveAttribute("role", "status");
  expect(document.activeElement).toBe(deferred);

  const approveRow = within(list).getByRole("article", { name: /Approve message/ });
  const approve = within(approveRow).getByRole("button", { name: "Approve update" });
  approve.focus(); await user.keyboard("{Enter}");
  const approved = await within(approveRow).findByText("Review result: Update applied.");
  expect(approved).toHaveAttribute("role", "status");
  expect(document.activeElement).toBe(approved);
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
  await jobBuddyDb.activityEntries.add({ id: collisionId, proposalId: "proposal-1", applicationId: "application-1", at: "2026-09-01T00:00:00Z", action: "approved", automatic: false });
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
  const fixture = new FixtureMailAdapter([fixtureMessages[0]]);
  render(<MemoryRouter><CommandCenterPage mailAdapter={{ async scan(cursor) { await gate; return fixture.scan(cursor); } }} /></MemoryRouter>);
  await userEvent.selectOptions(await screen.findByLabelText("Scan mode"), "unrestricted");
  await userEvent.click(screen.getByRole("button", { name: "Scan now (simulated)" }));
  expect(await screen.findByRole("button", { name: "Scanning simulated mail…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(/Checking fictional messages/);
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
  expect(screen.getByText(/simulated mail/i)).toBeVisible();
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
  const fixture = new FixtureMailAdapter([fixtureMessages[0]]);
  const adapter = { async scan(cursor: string | null) { if (!failed) { failed = true; throw new Error("secret provider error"); } return fixture.scan(cursor); } };
  render(<MemoryRouter><CommandCenterPage mailAdapter={adapter} /></MemoryRouter>);
  const scan = await screen.findByRole("button", { name: "Scan now (simulated)" });
  expect(screen.getByLabelText("Scan mode")).toHaveValue("approval");
  await userEvent.click(scan);
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not be completed/i);
  expect(screen.queryByText(/secret provider error/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Retry simulated scan" }));
  expect(await screen.findByRole("link", { name: "Review 1 pending update" })).toBeVisible();
  expect(screen.getByText(/Last successful scan:/)).not.toHaveTextContent("Never");
  expect((await applicationRepository.get("application-1"))?.stage).toBe("applied");
  await userEvent.selectOptions(screen.getByLabelText("Scan mode"), "unrestricted");
  expect(screen.getByRole("alert")).toHaveTextContent(/automatically apply/i);
  expect(screen.getByRole("alert")).toHaveTextContent(/terminal/i);
});
