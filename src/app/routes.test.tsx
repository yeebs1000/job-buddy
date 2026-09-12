import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { appRoutes } from "./routes";

const routes = [
  ["/", "Your application journey"],
  ["/applications", "Applications"],
  ["/applications/application-1", "Application details"],
  ["/updates", "Updates"],
  ["/prepare", "Prepare"],
  ["/profile", "Profile"],
  ["/settings", "Settings"],
] as const;

it("resolves every application route inside semantic shell navigation", () => {
  for (const [path, heading] of routes) {
    const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
    const view = render(<RouterProvider router={router} />);

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();

    view.unmount();
    cleanup();
  }
});
