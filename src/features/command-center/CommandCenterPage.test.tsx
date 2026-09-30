import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { CommandCenterPage } from "./CommandCenterPage";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { defaultGmailPreferences } from "../settings/gmailPreferences";
import { jobBuddyDb } from "../../db/database";
import { GmailMailAdapter } from "../../integrations/mail/GmailMailAdapter";
import { gmailPreferences } from "../settings/gmailPreferences";
import { updateRepository } from "../updates/updateRepository";

const { list, seedDemoData } = vi.hoisted(() => ({ list: vi.fn(), seedDemoData: vi.fn() }));

vi.mock("../../db/applicationRepository", () => ({ applicationRepository: { list } }));
vi.mock("../../db/seed", () => ({ seedDemoData }));

function renderPage() {
  return render(<MemoryRouter><CommandCenterPage /></MemoryRouter>);
}

it("offers a bounded recheck that fetches older mail without resetting incremental history", async () => {
  list.mockResolvedValue([]);
  await updateRepository.saveScanState("gmail", { cursor: "saved-history" });
  const requests: Array<string | null> = [];
  const gmailAdapter = new GmailMailAdapter(async input => {
    requests.push(input.cursor);
    if (!input.initialSyncConfirmed) throw new Error("Missing bounded-scan consent");
    return { source: "gmail", messages: [], nextCursor: "latest-history", scannedAt: "2026-09-17T00:00:00Z", diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } };
  });
  render(<MemoryRouter><CommandCenterPage gmailAdapter={gmailAdapter} gmailStatus={{ state: "connected", platformSupported: true }} initialPreferences={{ ...defaultGmailPreferences, selectedSource: "gmail", initialSyncCompleted: true }} /></MemoryRouter>);
  await userEvent.click(await screen.findByText("Missing an email or application update?"));
  await userEvent.click(screen.getByRole("button", { name: "Recheck recent emails" }));
  await waitFor(() => expect(requests).toEqual([null]));
  await waitFor(async () => expect((await updateRepository.getScanState("gmail")).lastSuccessfulScanAt).toBeDefined());
  expect((await updateRepository.getScanState("gmail")).cursor).toBe("saved-history");
});

beforeEach(() => {
  list.mockReset();
  seedDemoData.mockReset();
  seedDemoData.mockResolvedValue(undefined);
});

it("directs an empty tracker toward real records without sample seeding", async () => {
  list.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByRole("heading", { name: "Start your tracker" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import Excel" })).toBeEnabled();
  expect(screen.getByRole("link", { name: "Add application" })).toHaveAttribute("href", "/applications?new=1");
  expect(screen.queryByRole("button", { name: "Load sample data" })).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Connect Gmail" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByLabelText("Scan mode")).not.toBeInTheDocument();
});

it("puts a connected inbox before manual tracker setup even with no applications", async () => {
  list.mockResolvedValue([]);
  const adapter = new GmailMailAdapter(async () => ({ source: "gmail", messages: [], nextCursor: "after-scan", scannedAt: "2026-09-25T00:00:00Z", diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } }));
  render(<MemoryRouter><CommandCenterPage gmailAdapter={adapter} gmailStatus={{ state: "connected", platformSupported: true }} initialPreferences={{ ...defaultGmailPreferences }} /></MemoryRouter>);
  const scan = await screen.findByRole("region", { name: "Live Gmail scan" });
  const manual = screen.getByRole("link", { name: "Add application" });
  expect(scan.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Scan last 90 days" }));
  await waitFor(async () => expect((await updateRepository.getScanState("gmail")).lastSuccessfulScanAt).toBeDefined());
  expect(screen.getByRole("link", { name: /Review .* pending update/ })).toHaveAttribute("href", "/updates");
});

it("shows source labels and rejected row semantics", async () => {
  list.mockResolvedValue(sampleApplications);
  renderPage();

  await screen.findByText("Aurora Ledger Pte Ltd");
  expect(screen.getAllByText("Source: LinkedIn").length).toBeGreaterThan(0);
  expect(screen.getByTestId("application-row-app-river-rejected")).toHaveAttribute("data-outcome", "rejected");
  expect(screen.getByLabelText(/rejected during review/i)).toBeInTheDocument();
  expect(screen.getByText("Stage: Applied")).toBeVisible();
  expect(screen.getByText("Rejected at Review")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Refresh research" })).toHaveLength(sampleApplications.length);
});

it("does not seed demo records while reading the tracker", async () => {
  list.mockResolvedValue([]);
  renderPage();

  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(seedDemoData).not.toHaveBeenCalled();
});

it("keeps three stable skeleton rows visible while applications load", () => {
  list.mockReturnValue(new Promise(() => {}));
  renderPage();

  expect(screen.getByRole("region", { name: "Loading applications" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getAllByTestId("loading-skeleton")).toHaveLength(3);
});

it("offers inline research for a new manual application", async () => {
  list.mockResolvedValue([{ ...sampleApplications[0], research: undefined }]);
  renderPage();
  expect(await screen.findByRole("button", { name: "Review sources" })).toHaveAttribute("aria-expanded", "false");
});

it("renders a safe meeting link for the next deadline", async () => {
  list.mockResolvedValue([{ ...sampleApplications[0], deadlines: [{ id: "meeting", label: "Technical interview", at: "2026-09-20T06:00:00.000Z", completed: false, links: ["https://meet.example/interview"] }] }]);
  renderPage();

  const meeting = await screen.findByRole("link", { name: "Open meeting link" });
  expect(meeting).toHaveAttribute("href", "https://meet.example/interview");
  expect(meeting).toHaveAttribute("target", "_blank");
  expect(meeting).toHaveAttribute("rel", "noopener noreferrer");
});

afterEach(async () => {
  cleanup();
  await jobBuddyDb.delete();
  await jobBuddyDb.open();
});

it("never falls back to demo when a live scan fails", async () => {
  list.mockResolvedValue(sampleApplications);
  const gmailScan = vi.fn().mockRejectedValue(new Error("private live failure"));
  const fixtureScan = vi.fn().mockResolvedValue({ messages: [], nextCursor: "fixture-1", scannedAt: "2026-09-15T08:00:00.000Z" });
  const gmailAdapter: MailAdapter = { source: "gmail", scan: gmailScan };
  const fixtureAdapter: MailAdapter = { source: "simulated", scan: fixtureScan };
  render(<MemoryRouter><CommandCenterPage
    gmailAdapter={gmailAdapter}
    fixtureAdapter={fixtureAdapter}
    gmailStatus={{ state: "connected", accountEmail: "user@example.com", platformSupported: true }}
    initialPreferences={{ ...defaultGmailPreferences, selectedSource: "gmail", initialSyncCompleted: true }}
  /></MemoryRouter>);

  await userEvent.click(await screen.findByRole("button", { name: /scan Gmail now/i }));

  await waitFor(() => expect(gmailScan).toHaveBeenCalledTimes(1));
  expect(fixtureScan).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toHaveTextContent(/Gmail scan could not be completed/i);
});

it("can recover a failed first scan from the dashboard with explicit bounded-scan consent", async () => {
  list.mockResolvedValue([]);
  const preferences = { ...defaultGmailPreferences, selectedSource: "gmail" as const, dailyActiveScanEnabled: true };
  await gmailPreferences.save(preferences);
  const gmailAdapter = new GmailMailAdapter(async input => {
    if (input.cursor === null && !input.initialSyncConfirmed) throw new Error("initial-consent-required");
    return { source: "gmail", messages: [], nextCursor: "123", scannedAt: "2026-09-17T00:00:00Z", diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 } };
  });
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ state: "connected", platformSupported: true }));
  try {
    render(<MemoryRouter><CommandCenterPage gmailAdapter={gmailAdapter} /></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Scan last 90 days" }));
    await waitFor(async () => expect((await updateRepository.getScanState("gmail")).cursor).toBe("123"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Scan Gmail now" })).toBeEnabled());
    expect(await gmailPreferences.get()).toMatchObject({ initialSyncCompleted: true, dailyActiveScanEnabled: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Scan mode"), "unrestricted");
    await waitFor(async () => expect(await gmailPreferences.get()).toMatchObject({ automationMode: "unrestricted", initialSyncCompleted: true, dailyActiveScanEnabled: true }));
  } finally { fetcher.mockRestore(); }
});

it("uses canonical state for an unsorted rejection history and labels other terminal outcomes", async () => {
  const rejected = {
    ...sampleApplications[0],
    id: "repository-id-9",
    company: "Chronological Capital",
    stageEvents: [
      { id: "repo-event-001", applicationId: "repository-id-9", at: "2026-09-04T09:00:00Z", toStage: "review" as const, origin: "manual" as const, accepted: true },
      { id: "repo-event-999", applicationId: "repository-id-9", at: "2026-09-02T09:00:00Z", toStage: "applied" as const, origin: "manual" as const, accepted: true },
      { id: "repo-event-010", applicationId: "repository-id-9", at: "2026-09-05T09:00:00Z", outcome: "rejected" as const, origin: "manual" as const, accepted: true },
    ],
  };
  const withdrawn = { ...sampleApplications[1], id: "withdrawn-id", company: "Closed Loop", stageEvents: [{ id: "closed-stage", applicationId: "withdrawn-id", at: "2026-09-02T09:00:00Z", toStage: "interview" as const, outcome: "withdrawn" as const, origin: "manual" as const, accepted: true }] };
  list.mockResolvedValue([rejected, withdrawn]);
  renderPage();

  expect(await screen.findByText("Rejected at Review")).toBeVisible();
  expect(screen.getByTestId("application-row-repository-id-9")).toHaveTextContent("Rejected at Review");
  expect(screen.getByLabelText("Rejected during Review")).toBeInTheDocument();
  expect(screen.getByTestId("application-row-withdrawn-id")).toHaveTextContent("Outcome: Withdrawn at Interview");
  expect(screen.getByLabelText("Withdrawn after Interview")).toBeInTheDocument();
});

it.each([
  { research: { salary: { minimum: 4000, currency: "SGD" as const, period: "monthly" as const } }, available: /4,000.*monthly/, absent: "Company rating unavailable" },
  { research: { companyRating: { score: 4.2, outOf: 5, source: "Graduate survey" } }, available: /4.2\/5/, absent: "Salary unavailable" },
])("labels imported research as unverified", async ({ research }) => {
  list.mockResolvedValue([{ ...sampleApplications[0], research }]);
  renderPage();
  expect(await screen.findByText(/Imported \/ unverified/)).toBeVisible();
});
