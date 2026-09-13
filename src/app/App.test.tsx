import { render, screen, within } from "@testing-library/react";
import { App } from "./App";

it("renders the Job Buddy command center", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /application journey/i })).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Applications" })).toBeInTheDocument();
});
