import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { ImportTrackerPage } from "./ImportTrackerPage";
import { confirmImport } from "./confirmImport";
import { parseTracker } from "./parseTracker";

const content = "Company,Role,Stage,Date Applied,Market,Role Family\nExample Bank,Analyst,Interview,2026-09-12,SG,finance\nOther Bank,Analyst,Applied,2026-09-11,HK,finance\n,Engineer,Applied,2026-09-10,SG,software";
function file(value = content) { return new File([value], "tracker.csv", { type: "text/csv" }); }
function renderPage() { render(<MemoryRouter><ImportTrackerPage /></MemoryRouter>); return userEvent.setup(); }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("previews mapping and row errors, supports exclusion, and only writes on confirmation", async () => {
  const user = renderPage();
  expect(screen.getByRole("button", { name: /confirm import/i })).toBeDisabled();
  await user.upload(screen.getByLabelText("Tracker file"), file());
  await screen.findByText("Example Bank");
  expect(await applicationRepository.list()).toEqual([]);
  expect(screen.getByText(/1 invalid/i)).toBeInTheDocument();
  expect(screen.getByLabelText("Include row 4")).toBeDisabled();
  await user.click(screen.getByLabelText("Include row 3"));
  await user.click(screen.getByRole("button", { name: /confirm import/i }));
  await screen.findByText(/1 imported/i);
  const saved = await applicationRepository.list(); expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ company: "Example Bank", stage: "interview", stageEvents: [expect.objectContaining({ accepted: true, origin: "import", toStage: "interview", applicationId: saved[0].id })] });
  expect(screen.getByLabelText("Include row 2")).toBeDisabled();
  expect(screen.getByRole("button", { name: /confirm import/i })).toBeDisabled();
});
it("lets users keep duplicate rows intentionally and import selected rows only once", async () => {
  const user = renderPage();
  await user.upload(screen.getByLabelText("Tracker file"), file("Company,Role,Stage,Date Applied,Market,Role Family\nBank,Analyst,Applied,2026-09-12,SG,finance\nBank,Analyst,Applied,2026-09-12,SG,finance"));
  await screen.findByText(/Matches row 2/i);
  expect(screen.getByLabelText("Include row 3")).not.toBeChecked();
  await user.click(screen.getByLabelText("Include row 3"));
  await user.click(screen.getByRole("button", { name: /confirm import/i }));
  await screen.findByText(/2 imported/i); expect(await applicationRepository.list()).toHaveLength(2);
});
it("keeps row-level success and failure visible and retries only failed rows", async () => {
  const realCreate = applicationRepository.create.bind(applicationRepository); let fail = true;
  vi.spyOn(applicationRepository, "create").mockImplementation(async input => { if (input.company === "Other Bank" && fail) throw new Error("Storage unavailable"); return realCreate(input); });
  const user = renderPage(); await user.upload(screen.getByLabelText("Tracker file"), file()); await screen.findByText("Example Bank");
  await user.click(screen.getByRole("button", { name: /confirm import/i }));
  await screen.findByText(/Storage unavailable/i);
  expect(await applicationRepository.list()).toHaveLength(1);
  expect(screen.getByText(/1 imported.*1 failed/i)).toBeInTheDocument();
  fail = false; await user.click(screen.getByRole("button", { name: /confirm import/i }));
  await waitFor(async () => expect(await applicationRepository.list()).toHaveLength(2));
});
it("shows file errors and can recover with a valid local file", async () => {
  const user = renderPage(); await user.upload(screen.getByLabelText("Tracker file"), file(""));
  expect(await screen.findByRole("alert")).toHaveTextContent(/empty/i);
  expect(screen.getByRole("button", { name: /confirm import/i })).toBeDisabled();
  await user.upload(screen.getByLabelText("Tracker file"), file()); await screen.findByText("Example Bank");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("uses the repository transaction to roll back an application when its event collides", async () => {
  const preview = await parseTracker(file());
  preview.rows[0].applicationId = "collision";
  await jobBuddyDb.stageEvents.add({ id: "import-event-collision", applicationId: "unrelated", at: "2026-09-12T00:00:00Z", accepted: true, origin: "manual", toStage: "applied" });
  preview.rows[1].included = false;
  const result = await confirmImport(preview);
  expect(result.rows[0].result).toBe("failed");
  expect(await jobBuddyDb.applications.get("collision")).toBeUndefined();
  expect(await jobBuddyDb.stageEvents.count()).toBe(1);
});

it("lets a reviewer inspect salary-only and contact data using readable field labels", async () => {
  const user = renderPage();
  await user.upload(screen.getByLabelText("Tracker file"), file("Company,Role,Stage,Date Applied,Market,Role Family,Salary,Currency,Pay Period,Contact\nBank,Analyst,Applied,2026-09-12,SG,finance,4000,SGD,monthly,Alex"));
  await screen.findByText("Bank");
  await user.click(screen.getByRole("button", { name: "View row 2 fields" }));
  expect(screen.getByText("SGD 4,000 / monthly")).toBeVisible();
  expect(within(screen.getByRole("table")).getByText("Contact", { exact: true })).toBeVisible();
  expect(screen.getByText("Alex", { exact: true })).toBeVisible();
});

it("imports an explicit not-started state without fabricating a reached stage", async () => {
  const preview = await parseTracker(file("Company,Role,Stage,Date Applied,Market,Role Family\nBank,Analyst,Not started,2026-09-12,SG,finance"));
  expect(preview.rows[0].errors).toEqual([]);
  const result = await confirmImport(preview);
  expect(result.rows[0].result).toBe("imported");
  const saved = await applicationRepository.list();
  expect(saved[0]).toMatchObject({ stage: null, outcome: null, stageEvents: [expect.objectContaining({ origin: "import", accepted: true })] });
});
