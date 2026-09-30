import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { appRoutes } from "./routes";
import { jobBuddyDb } from "../db/database";
import { seedDemoData } from "../db/seed";

const routes = [
  ["/", "Application command center"],
  ["/applications", "Applications"],
  ["/applications/app-aurora-applied", "Investment Analyst"],
  ["/updates", "Updates"],
  ["/prepare", "Prepare"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it.each(routes)("opens %s inside semantic shell navigation", async (path, heading) => {
  await seedDemoData();
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
  // Cold lazy imports are transformed on demand by the test runner.
  expect(await screen.findByRole("heading", { name: heading }, { timeout: 5_000 })).toBeInTheDocument();
});
