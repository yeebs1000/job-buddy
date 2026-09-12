import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { CommandCenterPage } from "./CommandCenterPage";

const { list, seedDemoData } = vi.hoisted(() => ({ list: vi.fn(), seedDemoData: vi.fn() }));

vi.mock("../../db/applicationRepository", () => ({ applicationRepository: { list } }));
vi.mock("../../db/seed", () => ({ seedDemoData }));

beforeEach(() => {
  list.mockReset();
  seedDemoData.mockReset();
  seedDemoData.mockResolvedValue(undefined);
});

it("directs an empty tracker toward import, adding an application, or sample data", async () => {
  list.mockResolvedValue([]);
  render(<CommandCenterPage />);

  expect(await screen.findByRole("heading", { name: "Start your tracker" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import tracker" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add application" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load sample data" })).toBeInTheDocument();
});

it("shows source labels and rejected row semantics", async () => {
  list.mockResolvedValue(sampleApplications);
  render(<CommandCenterPage />);

  await screen.findByText("Aurora Ledger Pte Ltd");
  expect(screen.getAllByText("Source: LinkedIn").length).toBeGreaterThan(0);
  expect(screen.getByTestId("application-row-app-river-rejected")).toHaveAttribute("data-outcome", "rejected");
  expect(screen.getByLabelText(/rejected during review/i)).toBeInTheDocument();
});

it("seeds once before reading the tracker", async () => {
  list.mockResolvedValue([]);
  render(<CommandCenterPage />);

  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(seedDemoData.mock.invocationCallOrder[0]).toBeLessThan(list.mock.invocationCallOrder[0]);
});
