import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import type { Application } from "../../domain/application";
import type { CpiPoint, SalaryBenchmark } from "../../domain/research";
import { researchRepository } from "./researchRepository";
import { ResearchPanel } from "./ResearchPanel";

const application: Application = {
  id: "us-application", company: "Example Inc", role: "Software Engineer", discipline: "software_it",
  market: "US", roleFamily: "software", industry: "Technology", workArrangement: "hybrid", priority: "high",
  location: { city: "San Francisco", state: "CA", metroCode: "missing", country: "United States" },
  source: "Company careers", appliedAt: "2026-09-01T00:00:00.000Z", tags: [], deadlines: [], stageEvents: [],
  research: { salary: { minimum: 110000, maximum: 140000, currency: "USD", period: "annual" } },
};

const benchmark: SalaryBenchmark = {
  id: "us-state", releaseId: "us-2025", market: "US", currency: "USD", period: "annual",
  sourceOccupationCode: "15-1252", sourceOccupationLabel: "Software Developers", canonicalRole: "software-engineer",
  geographyLevel: "state", geographyCode: "CA", geographyLabel: "California",
  p25: 120000, p50: 145000, p75: 165000, referencePeriod: "2025-05",
  compensationScope: "Annual occupational wage", sourceUrl: "https://www.bls.gov/oes/",
};
const cpiPoints: CpiPoint[] = [
  { id: "old", source: "BLS CPI-U", sourceUrl: "https://www.bls.gov/cpi/", market: "US", period: "2025-05", index: 320, baseLabel: "1982-84=100", retrievedAt: "2026-09-16T00:00:00.000Z" },
  { id: "new", source: "BLS CPI-U", sourceUrl: "https://www.bls.gov/cpi/", market: "US", period: "2026-08", index: 331, baseLabel: "1982-84=100", retrievedAt: "2026-09-16T00:00:00.000Z" },
];

afterEach(async () => { cleanup(); vi.restoreAllMocks(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("researches a U.S. role, explains state fallback, and saves an immutable snapshot", async () => {
  const client = {
    lookup: vi.fn().mockResolvedValue({ releaseId: "us-2025", benchmark, cpiPoints, retrievedAt: "2026-09-16T00:00:00.000Z", fallback: "state" }),
    refresh: vi.fn(), status: vi.fn(),
  };
  const user = userEvent.setup();
  render(<ResearchPanel application={application} client={client} now={() => Date.parse("2026-09-16T00:00:00.000Z")} />);

  expect(screen.getByText(/Legacy saved salary — source unavailable/)).toBeVisible();
  await user.click(screen.getByLabelText("I confirm this role mapping"));
  await user.click(screen.getByRole("button", { name: "Confirm role mapping" }));
  await user.click(screen.getByRole("button", { name: "Research salary" }));

  expect(await screen.findByText("State benchmark used because metro data was unavailable.")).toBeVisible();
  const result = await screen.findByRole("region", { name: "Salary estimate" });
  expect(within(result).getByText(/Equivalent in 2026-08 prices:/)).toBeVisible();
  expect(within(result).getByText(/USD 120,000–165,000 \/ year/)).toBeVisible();
  expect(within(result).getByRole("link", { name: "Open official salary source" })).toHaveAttribute("href", "https://www.bls.gov/oes/");
  await user.click(screen.getByRole("button", { name: "Save research snapshot" }));
  await waitFor(async () => expect(await researchRepository.listSnapshots(application.id)).toHaveLength(1));
});

it("shows insufficient evidence without inventing a range and keeps the prior snapshot after refresh failure", async () => {
  const client = {
    lookup: vi.fn().mockRejectedValue(Object.assign(new Error("stale-cache"), { code: "stale-cache" })),
    refresh: vi.fn().mockRejectedValue(new Error("offline")), status: vi.fn(),
  };
  const user = userEvent.setup();
  render(<ResearchPanel application={{ ...application, research: undefined }} client={client} now={() => Date.parse("2026-09-16T00:00:00.000Z")} />);
  await user.click(screen.getByLabelText("I confirm this role mapping"));
  await user.click(screen.getByRole("button", { name: "Confirm role mapping" }));
  await user.click(screen.getByRole("button", { name: "Research salary" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/insufficient official evidence/i);
  expect(screen.queryByRole("region", { name: "Salary estimate" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Refresh official sources" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/could not refresh/i);
});

it("imports explicitly confirmed browser salary evidence into the current application", async () => {
  const evidence = { id: "salary-browser", market: "US" as const, currency: "USD" as const, period: "annual" as const,
    minimum: 125_000, maximum: 160_000, sourceUrl: "https://jobs.example/role", evidenceExcerpt: "$125,000-$160,000 annual",
    detectedAt: "2026-09-16T01:00:00.000Z" };
  const salaryEvidenceClient = { listSalaryEvidence: vi.fn().mockResolvedValue([evidence]), deleteSalaryEvidence: vi.fn().mockResolvedValue(undefined) };
  const client = { lookup: vi.fn(), refresh: vi.fn(), status: vi.fn() };
  const user = userEvent.setup();
  render(<ResearchPanel application={application} client={client} salaryEvidenceClient={salaryEvidenceClient} now={() => Date.parse("2026-09-16T02:00:00.000Z")} />);

  await user.click(screen.getByLabelText("I confirm this role mapping"));
  await user.click(screen.getByRole("button", { name: "Confirm role mapping" }));
  await user.click(await screen.findByRole("button", { name: "Import salary evidence" }));

  await waitFor(async () => expect(await researchRepository.listObservations(application.id)).toEqual([
    expect.objectContaining({ id: "salary-browser", applicationId: application.id, provenance: "job_posting", reusable: true, canonicalRole: "software-engineer" }),
  ]));
  expect(salaryEvidenceClient.deleteSalaryEvidence).toHaveBeenCalledWith("salary-browser");
});
