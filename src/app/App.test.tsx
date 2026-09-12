import { render, screen } from "@testing-library/react";
import { App } from "./App";

it("renders the Job Buddy command center", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /application journey/i })).toBeInTheDocument();
});
