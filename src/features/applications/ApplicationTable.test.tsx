import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { SortingState } from "@tanstack/react-table";
import type { Application, ResearchSnapshot } from "../../domain/application";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { ApplicationTable, defaultVisibleColumns } from "./ApplicationTable";

function renderTable(applications: Application[]) {
  function Table() {
    const [sorting, onSort] = useState<SortingState>([]);
    return <ApplicationTable applications={applications} sorting={sorting} onSort={onSort} visibleColumns={defaultVisibleColumns} selected={[]} onSelect={() => {}} onUpdate={async () => {}} onStage={async () => {}} busy={false} />;
  }
  render(<MemoryRouter><Table /></MemoryRouter>);
}

function salaryApplication(role: string, salary?: ResearchSnapshot["salary"]): Application {
  return { ...sampleApplications[0], id: role, role, research: salary ? { salary, companyRating: { score: 4, outOf: 5, source: "Test" } } : undefined };
}

it("sorts salary amounts across thousands boundaries in both directions", async () => {
  const user = userEvent.setup();
  renderTable([4800, 10000, 900, 1000].map(minimum => salaryApplication(String(minimum), { minimum, currency: "SGD", period: "monthly" })));
  await user.click(screen.getByRole("button", { name: "Salary" }));
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["900", "1000", "4800", "10000"]);
  expect(screen.getByText("SGD 10,000 / monthly")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Salary ↑" }));
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["10000", "4800", "1000", "900"]);
});

it("groups salary sorting by currency and period without converting or treating unavailable salary as zero", async () => {
  const user = userEvent.setup();
  renderTable([
    salaryApplication("SG monthly", { minimum: 900, currency: "SGD", period: "monthly" }),
    salaryApplication("Unavailable"),
    salaryApplication("HK monthly", { minimum: 12000, currency: "HKD", period: "monthly" }),
    salaryApplication("SG annual", { minimum: 48000, currency: "SGD", period: "annual" }),
  ]);
  await user.click(screen.getByRole("button", { name: "Salary" }));
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["HK monthly", "SG annual", "SG monthly", "Unavailable"]);
  await user.click(screen.getByRole("button", { name: "Salary ↑" }));
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual(["SG monthly", "SG annual", "HK monthly", "Unavailable"]);
});

it("shows the follow-up action and date when it precedes outstanding deadlines or is the only action", () => {
  renderTable([
    { ...sampleApplications[0], id: "only-follow-up", role: "Follow-up only", followUpAt: "2026-09-12", deadlines: [] },
    { ...sampleApplications[0], id: "early-follow-up", role: "Earlier follow-up", followUpAt: "2026-09-12" },
    { ...sampleApplications[0], id: "early-deadline", role: "Earlier deadline", followUpAt: "2026-09-20", deadlines: [{ id: "assessment", label: "Assessment", at: "2026-09-14", completed: false }] },
  ]);
  for (const role of ["Follow-up only", "Earlier follow-up"]) {
    const row = screen.getByRole("link", { name: role }).closest("tr")!;
    expect(row.querySelector('[data-column="nextAction"]')).toHaveTextContent("Follow up");
    expect(row.querySelector('[data-column="deadline"]')).toHaveTextContent("2026-09-12");
  }
  const row = screen.getByRole("link", { name: "Earlier deadline" }).closest("tr")!;
  expect(row.querySelector('[data-column="nextAction"]')).toHaveTextContent("Assessment");
  expect(row.querySelector('[data-column="deadline"]')).toHaveTextContent("2026-09-14");
});
