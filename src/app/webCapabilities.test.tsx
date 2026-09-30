import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsPage } from "../features/settings/SettingsPage";
import { CommandCenterPage } from "../features/command-center/CommandCenterPage";
import { DiscoveryPage } from "../features/discovery/DiscoveryPage";
import { ResearchPanel } from "../features/research/ResearchPanel";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { UpdateInboxPage } from "../features/updates/UpdateInboxPage";
import { sampleApplications } from "../fixtures/sampleApplications";
import { jobBuddyDb } from "../db/database";

vi.mock("./runtimeMode", () => ({ isWebMode: true }));
beforeEach(async () => {
  await Promise.all(jobBuddyDb.tables.map(t => t.clear()));
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No API")));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lets a fresh web workspace browse default views without persisting records", async () => {
  render(<MemoryRouter><ApplicationsPage /></MemoryRouter>);
  expect(await screen.findByRole("option", { name: "Active Interviews" })).toBeInTheDocument();
  expect(await jobBuddyDb.savedViews.count()).toBe(0);
});

it("does not offer desktop setup or pair an extension in web settings", async () => {
  render(<SettingsPage />);
  expect(await screen.findByText(/Gmail.*not available in this web build/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: /pair browser/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("loads the dashboard without probing Gmail or the companion", async () => {
  render(<MemoryRouter><CommandCenterPage /></MemoryRouter>);
  expect(await screen.findByText("Start your tracker")).toBeVisible();
  expect(await screen.findByText(/Gmail.*not available in this web build/i)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not send an empty web inbox to unavailable scan controls", async () => {
  render(<MemoryRouter><UpdateInboxPage /></MemoryRouter>);
  expect(await screen.findByText(/Gmail scanning is not available in this web build/i)).toBeVisible();
  expect(screen.queryByRole("link", { name: "Open scan controls" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps discovery shortlist usable while hosted discovery is unavailable", async () => {
  render(<DiscoveryPage />);
  expect(await screen.findByText(/Job search.*not available in this web build/i)).toBeVisible();
  expect(screen.getByRole("button", { name: "Find open roles" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps saved research visible without extension polling or live research actions", async () => {
  render(<ResearchPanel application={sampleApplications[0]} />);
  expect(await screen.findByText(/Live salary research.*not available in this web build/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Find company salary evidence" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
