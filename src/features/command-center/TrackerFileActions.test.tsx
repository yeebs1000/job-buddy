import "fake-indexeddb/auto";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TrackerFileActions } from "./TrackerFileActions";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { sampleApplications } from "../../fixtures/sampleApplications";
const download = vi.hoisted(() => vi.fn());
vi.mock("../import-export/exportTracker", () => ({ downloadTracker: download }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  download.mockReset();
});
afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });
it("previews and confirms an Excel-compatible file without leaving the dashboard", async () => {
  const imported = vi.fn();
  render(<MemoryRouter><TrackerFileActions onImported={imported} /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Import Excel" }));
  const file = new File(["Company,Role,Market,Stage,Date Applied,Source,Location,Role Family\nTest Employer,Analyst,SG,Applied,2026-09-20,Referral,Singapore,Finance"], "tracker.csv", { type: "text/csv" });
  await userEvent.upload(await screen.findByLabelText("Tracker file"), file);
  await userEvent.click(await screen.findByRole("button", { name: "Confirm import (1)" }));
  await waitFor(() => expect(imported).toHaveBeenCalledTimes(1));
  expect((await applicationRepository.list())[0].company).toBe("Test Employer");
  expect(screen.getByRole("dialog", { name: "Import Excel" })).toBeVisible();
});
it("exports all applications including archived records", async () => {
  await applicationRepository.create({ ...sampleApplications[0], archived: true });
  render(<MemoryRouter><TrackerFileActions /></MemoryRouter>);
  await userEvent.click(screen.getByRole("button", { name: "Export all to Excel" }));
  await waitFor(() => expect(download).toHaveBeenCalledWith([expect.objectContaining({ archived: true })], "xlsx", "all"));
});
