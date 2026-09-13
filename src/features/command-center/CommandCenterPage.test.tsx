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
