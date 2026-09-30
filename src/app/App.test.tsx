import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { App } from "./App";
import { jobBuddyDb } from "../db/database";

afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("opens a live-only empty tracker without seeding samples", async () => {
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Start your tracker" })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Applications" })).toBeInTheDocument();
  expect(await jobBuddyDb.applications.count()).toBe(0);
});
