/// <reference types="node" />
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jobBuddyDb } from "../../db/database";
import { ProfilePage } from "./ProfilePage";

vi.mock("../../app/runtimeMode", () => ({ isWebMode: true }));
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("API unavailable")));
  await Promise.all(jobBuddyDb.tables.map(t => t.clear()));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("saves and reloads a profile without a companion and describes browser storage", async () => {
  const user = userEvent.setup();
  const first = render(<ProfilePage />);
  await user.type(await screen.findByLabelText("First name"), "Browser Person");
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(screen.getAllByText("Profile saved locally.").length).toBeGreaterThan(0));
  first.unmount();
  render(<ProfilePage />);
  expect(await screen.findByLabelText("First name")).toHaveValue("Browser Person");
  expect(screen.queryByText(/Windows account/)).not.toBeInTheDocument();
  expect(screen.getByText(/clearing site data/i)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});

it("blocks editing a damaged browser profile and does not suggest starting a server", async () => {
  await jobBuddyDb.browserProfiles.put({ id: "candidate", version: 1, revision: "broken", iv: new Uint8Array(12), ciphertext: new ArrayBuffer(20) });
  render(<ProfilePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/not been replaced/);
  expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  expect(screen.queryByText(/Start the local companion/)).not.toBeInTheDocument();
  expect(await jobBuddyDb.browserProfiles.count()).toBe(1);
});
