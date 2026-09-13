import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { applicationRepository } from "../../db/applicationRepository";
import { savedViewRepository } from "../../db/viewRepository";
import { ApplicationsPage } from "./ApplicationsPage";

afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });
function renderPage(path = "/applications") {
  const router = createMemoryRouter([{ path: "/applications", element: <ApplicationsPage /> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
async function ready() { await screen.findByRole("link", { name: "Investment Analyst" }); }

it("composes search and market filters and clears them", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "analyst");
  await user.selectOptions(screen.getByLabelText("Market filter"), "HK");
  expect(screen.getByRole("link", { name: "Risk Analyst" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Investment Analyst" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByRole("link", { name: "Investment Analyst" })).toBeInTheDocument();
});

it("persists keyboard-friendly inline stage, priority and tag edits", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.selectOptions(screen.getByLabelText("Stage for Aurora Ledger Pte Ltd"), "interview");
  await waitFor(async () => expect((await applicationRepository.get("app-aurora-applied"))?.stage).toBe("interview"));
  await waitFor(() => expect(screen.getByLabelText("Priority for Aurora Ledger Pte Ltd")).toBeEnabled());
  await user.selectOptions(screen.getByLabelText("Priority for Aurora Ledger Pte Ltd"), "high");
  await waitFor(() => expect(screen.getByLabelText("Tags for Aurora Ledger Pte Ltd")).toBeEnabled());
  const tags = screen.getByLabelText("Tags for Aurora Ledger Pte Ltd");
  await user.clear(tags); await user.type(tags, "priority, graduate, priority{Enter}");
  await waitFor(async () => expect(await applicationRepository.get("app-aurora-applied")).toMatchObject({ priority: "high", tags: ["priority", "graduate"] }));
  const application = await applicationRepository.get("app-aurora-applied");
  expect(application?.stageEvents).toContainEqual(expect.objectContaining({ toStage: "interview", origin: "manual", accepted: true }));
  expect(screen.getByLabelText("Stage for Riverbank Partners")).toBeDisabled();
});

it("applies bulk updates only to selected visible rows and archives them", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.click(screen.getByLabelText("Select Aurora Ledger Pte Ltd"));
  await user.click(screen.getByLabelText("Select Circuit Harbour Ltd"));
  await user.selectOptions(screen.getByLabelText("Bulk priority"), "high");
  await user.click(screen.getByRole("button", { name: "Set priority" }));
  await waitFor(async () => expect((await applicationRepository.get("app-circuit-review"))?.priority).toBe("high"));
  await waitFor(() => expect(screen.getByLabelText("Bulk stage")).toBeEnabled());
  await user.selectOptions(screen.getByLabelText("Bulk stage"), "assessment");
  await user.click(screen.getByRole("button", { name: "Set stage" }));
  await waitFor(async () => expect((await applicationRepository.get("app-circuit-review"))?.stage).toBe("assessment"));
  await waitFor(() => expect(screen.getByLabelText("Bulk tag")).toBeEnabled());
  await user.type(screen.getByLabelText("Bulk tag"), "shortlist");
  await user.click(screen.getByRole("button", { name: "Add tag" }));
  await waitFor(async () => expect((await applicationRepository.get("app-aurora-applied"))?.tags).toContain("shortlist"));
  await waitFor(() => expect(screen.getByRole("button", { name: "Archive selected" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Archive selected" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Investment Analyst" })).not.toBeInTheDocument());
  expect((await applicationRepository.get("app-pine-assessment"))?.archived).not.toBe(true);
  await user.click(screen.getByText("More filters"));
  await user.click(screen.getByLabelText("Include archived"));
  expect(await screen.findByRole("link", { name: "Investment Analyst" })).toBeInTheDocument();
});

it("restores saved filters, sorting and columns without overwriting an edited reserved view", async () => {
  await savedViewRepository.save({ id: "default-active-interviews", name: "My edited interviews", filters: { markets: ["HK"] }, sort: [{ id: "company", desc: true }], visibleColumns: ["role", "company", "stage"] });
  const user = userEvent.setup(); renderPage(); await ready();
  await user.selectOptions(screen.getByLabelText("Saved view"), "default-active-interviews");
  expect(screen.getByLabelText("Market filter")).toHaveValue(["HK"]);
  expect(screen.queryByRole("columnheader", { name: /Industry/ })).not.toBeInTheDocument();
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Pine Street Capital");
  await user.type(screen.getByLabelText("View name"), "HK focus");
  await user.click(screen.getByRole("button", { name: "Save view" }));
  await waitFor(async () => expect((await savedViewRepository.list()).some(v => v.name === "HK focus")).toBe(true));
  cleanup(); renderPage(); await ready();
  const saved = (await savedViewRepository.list()).find(v => v.name === "HK focus")!;
  await user.selectOptions(screen.getByLabelText("Saved view"), saved.id);
  expect(screen.getByLabelText("Market filter")).toHaveValue(["HK"]);
  expect(screen.queryByRole("columnheader", { name: /Industry/ })).not.toBeInTheDocument();
  expect((await savedViewRepository.get("default-active-interviews"))?.name).toBe("My edited interviews");
  expect((await savedViewRepository.list()).filter(v => v.id.startsWith("default-"))).toHaveLength(5);
});

it("opens the new query form and persists a research-free application and initial event", async () => {
  const user = userEvent.setup(); const router = renderPage("/applications?new=1"); await ready();
  const form = within(screen.getByRole("form", { name: "New application" }));
  await user.type(form.getByLabelText("Company"), "New Company");
  await user.type(form.getByLabelText("Role"), "Cloud Graduate");
  await user.type(form.getByLabelText("Industry"), "Technology");
  await user.selectOptions(form.getByLabelText("Market"), "HK");
  await user.selectOptions(form.getByLabelText("Role family"), "cloud");
  await user.selectOptions(form.getByLabelText("Work arrangement"), "hybrid");
  await user.type(form.getByLabelText("Source"), "Referral");
  await user.clear(form.getByLabelText("Applied date")); await user.type(form.getByLabelText("Applied date"), "2026-09-10");
  await user.selectOptions(form.getByLabelText("Stage"), "review");
  await user.selectOptions(form.getByLabelText("Priority"), "high");
  await user.type(form.getByLabelText("Tags"), "graduate, cloud");
  await user.click(form.getByRole("button", { name: "Create application" }));
  expect(await screen.findByRole("link", { name: "Cloud Graduate" })).toBeInTheDocument();
  const created = (await applicationRepository.list()).find(a => a.company === "New Company")!;
  expect(created).toMatchObject({ market: "HK", roleFamily: "cloud", industry: "Technology", workArrangement: "hybrid", source: "Referral", priority: "high", tags: ["graduate", "cloud"], stage: "review" });
  expect(created.research).toBeUndefined();
  expect(created.stageEvents).toEqual([expect.objectContaining({ applicationId: created.id, toStage: "review", accepted: true, origin: "manual", at: "2026-09-10T00:00:00.000Z" })]);
  expect(router.state.location.search).toBe("");
  await waitFor(() => expect(screen.queryByRole("form", { name: "New application" })).not.toBeInTheDocument());
});

it("closing creation clears only its query flag without writing an application", async () => {
  const user = userEvent.setup(); const router = renderPage("/applications?new=1&context=keep"); await ready();
  await user.click(screen.getByRole("button", { name: "Cancel creation" }));
  expect(router.state.location.search).toBe("?context=keep");
  expect(await applicationRepository.list()).toHaveLength(8);
});

it("sorts stages in journey order and priority in low-to-high order", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.click(screen.getByRole("button", { name: "Stage" }));
  const rows = screen.getAllByRole("row").slice(1);
  expect(rows[0]).toHaveTextContent("Aurora Ledger Pte Ltd");
  expect(rows[1]).toHaveTextContent(/Circuit Harbour|Lantern Loop|Riverbank/);
  await user.click(screen.getByRole("button", { name: "Priority" }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Lantern Loop Studio");
});

it("shows last activity after a non-stage edit", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.selectOptions(screen.getByLabelText("Priority for Aurora Ledger Pte Ltd"), "high");
  await waitFor(() => expect(screen.getByLabelText("Priority for Aurora Ledger Pte Ltd")).toBeEnabled());
  const row = screen.getByRole("link", { name: "Investment Analyst" }).closest("tr")!;
  expect(row.querySelector('[data-column="lastActivity"]')).toHaveTextContent(new Date().toISOString().slice(0, 10));
});

it("rolls back bulk stage changes when selection contains a terminal application", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.click(screen.getByLabelText("Select Aurora Ledger Pte Ltd"));
  await user.click(screen.getByLabelText("Select Riverbank Partners"));
  await user.click(screen.getByRole("button", { name: "Set stage" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Closed applications cannot change stage");
  expect((await applicationRepository.get("app-aurora-applied"))?.stage).toBe("applied");
  expect((await applicationRepository.get("app-river-rejected"))?.outcome).toBe("rejected");
});

it("clears hidden selections when filters change", async () => {
  const user = userEvent.setup(); renderPage(); await ready();
  await user.click(screen.getByLabelText("Select Aurora Ledger Pte Ltd"));
  await user.selectOptions(screen.getByLabelText("Market filter"), "HK");
  expect(screen.queryByRole("button", { name: "Archive selected" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByLabelText("Select Aurora Ledger Pte Ltd")).not.toBeChecked();
});
