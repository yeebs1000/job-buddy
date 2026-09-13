import "fake-indexeddb/auto";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { appRoutes } from "./routes";
import { jobBuddyDb } from "../db/database";
import { seedDemoData } from "../db/seed";

const routes = [
  ["/", "Your application journey"],
  ["/applications", "Applications"],
  ["/applications/app-aurora-applied", "Investment Analyst"],
  ["/updates", "Updates"],
  ["/prepare", "Prepare"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

afterEach(async () => { cleanup(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("resolves every application route inside semantic shell navigation", async () => {
  await seedDemoData();
  for (const [path, heading] of routes) {
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
    const view = render(<RouterProvider router={router} />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();

    view.unmount();
    cleanup();
  }
});
