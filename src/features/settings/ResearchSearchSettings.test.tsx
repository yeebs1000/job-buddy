import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { ResearchSearchSettings } from "./ResearchSearchSettings";
import { StrictMode } from "react";
afterEach(cleanup);
const empty = { configured: false, platformSupported: true, usage: { month: "2026-09", used: 0, limit: 1000 as const } };
it("ignores an obsolete initial status failure in StrictMode", async () => {
  const client = { status: vi.fn().mockRejectedValueOnce(new Error("Old status failure")).mockResolvedValue(empty), saveKey: vi.fn(), removeKey: vi.fn() };
  render(<StrictMode><ResearchSearchSettings client={client} /></StrictMode>);
  await screen.findByLabelText("Tavily API key");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("saves without reading the key back or silently starting research", async () => {
  let state = empty;
  const client = { status: async () => state, saveKey: async () => (state = { ...empty, configured: true }), removeKey: async () => (state = empty) };
  render(<ResearchSearchSettings client={client} />);
  const input = await screen.findByLabelText("Tavily API key");
  await userEvent.type(input, "tvly-synthetic-only");
  await userEvent.click(screen.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(screen.getByRole("status")).toHaveTextContent(/not yet verified/i);
  await userEvent.click(screen.getByRole("button", { name: "Remove key" }));
  expect(await screen.findByRole("status")).toHaveTextContent(/removed/i);
});
it("shows storage failures without claiming a successful save", async () => {
  const client = { status: async () => empty, saveKey: vi.fn().mockRejectedValue(new Error("Safe storage unavailable")), removeKey: async () => empty };
  render(<ResearchSearchSettings client={client} />);
  await userEvent.type(await screen.findByLabelText("Tavily API key"), "tvly-synthetic-only");
  await userEvent.click(screen.getByRole("button", { name: "Save key" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Safe storage unavailable");
  expect(screen.getByRole("button", { name: "Remove key" })).toBeDisabled();
});
it("does not offer key entry without supported secure storage", async () => {
  const client = { status: async () => ({ ...empty, platformSupported: false }), saveKey: vi.fn(), removeKey: vi.fn() };
  render(<ResearchSearchSettings client={client} />);
  expect(await screen.findByText(/secure storage is unavailable/i)).toBeVisible();
  expect(screen.queryByLabelText("Tavily API key")).not.toBeInTheDocument();
});
