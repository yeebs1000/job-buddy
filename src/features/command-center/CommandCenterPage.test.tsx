import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { CommandCenterPage } from "./CommandCenterPage";

const { list, seedDemoData } = vi.hoisted(() => ({ list: vi.fn(), seedDemoData: vi.fn() }));

vi.mock("../../db/applicationRepository", () => ({ applicationRepository: { list } }));
vi.mock("../../db/seed", () => ({ seedDemoData }));

function renderPage() {
  return render(<MemoryRouter><CommandCenterPage /></MemoryRouter>);
}

beforeEach(() => {
  list.mockReset();
  seedDemoData.mockReset();
  seedDemoData.mockResolvedValue(undefined);
});

it("directs an empty tracker toward import, adding an application, or sample data", async () => {
  list.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByRole("heading", { name: "Start your tracker" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Import tracker" })).toHaveAttribute("href", "/import");
  expect(screen.getByRole("link", { name: "Add application" })).toHaveAttribute("href", "/applications?new=1");
  expect(screen.getByRole("button", { name: "Load sample data" })).toBeInTheDocument();
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
  expect(screen.getByRole("link", { name: "Open preparation" })).toHaveAttribute("href", "/prepare");
});

it("seeds once before reading the tracker", async () => {
  list.mockResolvedValue([]);
  renderPage();

  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(seedDemoData.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]);
});

it("keeps three stable skeleton rows visible while applications load", () => {
  list.mockReturnValue(new Promise(() => {}));
  renderPage();

  expect(screen.getByRole("region", { name: "Loading applications" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getAllByTestId("loading-skeleton")).toHaveLength(3);
});

it("shows unavailable research for a new manual application", async () => {
  list.mockResolvedValue([{ ...sampleApplications[0], research: undefined }]);
  renderPage();
  expect(await screen.findByText("Research unavailable")).toBeVisible();
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
])("renders independently optional salary and rating observations", async ({ research, available, absent }) => {
  list.mockResolvedValue([{ ...sampleApplications[0], research }]);
  renderPage();
  expect(await screen.findByText(available)).toHaveTextContent(absent);
});
