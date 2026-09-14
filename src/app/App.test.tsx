import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { App } from "./App";
import { jobBuddyDb } from "../db/database";

afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("renders the Job Buddy command center", async () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /application journey/i })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Applications" })).toBeInTheDocument();
  expect(await screen.findByText("8 applications")).toBeInTheDocument();
});
