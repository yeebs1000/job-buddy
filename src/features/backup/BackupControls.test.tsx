import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { BackupControls } from "./BackupControls";
import { emptyCandidateProfile } from "../../domain/profile";

vi.mock("../../app/runtimeMode", () => ({ isWebMode: true }));
beforeEach(async () => { await Promise.all(jobBuddyDb.tables.map(t => t.clear())); });
afterEach(cleanup);
it("requires a confirmed passphrase before creating a backup", async () => {
  render(<BackupControls />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Backup passphrase"), "synthetic long password");
  await user.type(screen.getByLabelText("Confirm passphrase"), "different password");
  await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/match/i);
});
it("requires preview before restore and rejects oversized files without reading them", async () => {
  render(<BackupControls />);
  const user = userEvent.setup({ applyAccept: false });
  const file = new File(["fixture"], "large.jobbuddy");
  Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 });
  await user.upload(screen.getByLabelText("Backup file"), file);
  expect(await screen.findByRole("alert")).toHaveTextContent(/50 MiB/);
  expect(screen.queryByRole("button", { name: "Restore workspace" })).not.toBeInTheDocument();
});
it("does not silently omit a profile that cannot be read", async () => {
  render(<BackupControls client={{ get: async () => { throw new Error("unavailable"); }, replace: async () => ({ profile: emptyCandidateProfile }), delete: async () => {} }} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Backup passphrase"), "synthetic long password");
  await user.type(screen.getByLabelText("Confirm passphrase"), "synthetic long password");
  await user.click(screen.getByRole("button", { name: "Download encrypted backup" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/profile.*could not be read/i);
  expect(screen.getByRole("checkbox", { name: /tracker-only/i })).not.toBeChecked();
});
