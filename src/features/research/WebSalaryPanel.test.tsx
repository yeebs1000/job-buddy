import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { jobBuddyDb } from "../../db/database";
import { WebSalaryPanel } from "./WebSalaryPanel";
import { SalarySummary } from "../command-center/SalarySummary";
import { webSalaryRepository } from "./webSalaryRepository";
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });

it("requires source review, persists a range, and displays it on the dashboard", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ searchedAt: "2026-09-19T00:00:00.000Z", results: [{ title: "Salary report", url: "https://example.com/pay", excerpt: "SGD 60,000–90,000 annual base salary", retrievedAt: "2026-09-19T00:00:00.000Z" }] })));
  vi.stubGlobal("fetch", fetcher);
  const app = sampleApplications[0];
  const panel = render(<WebSalaryPanel application={app} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Search web salaries" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Search web salaries" }));
  expect(await screen.findByLabelText("Detected salary figures")).toHaveTextContent(/60,000.*90,000/);
  await userEvent.click(await screen.findByText(/Review source · Salary report/));
  expect(screen.queryByRole("button", { name: "Save range to dashboard" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(/limited confidence/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Save range to dashboard" }));
  await screen.findByText(/This range now appears/);
  expect((await webSalaryRepository.get(app.id))?.evidence).toHaveLength(1);
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(Object.keys(payload).sort()).toEqual(["company", "location", "role"]);
  panel.unmount();
  render(<MemoryRouter><SalarySummary application={app} /></MemoryRouter>);
  expect(await screen.findByRole("button", { name: "Review sources" })).toBeVisible();
  expect(await screen.findByText(/60,000.*90,000/)).toBeVisible();
});

it("says when job links contain no pay figures instead of implying an estimate was found", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ searchedAt: "2026-09-29T00:00:00.000Z", results: [{ title: "Careers at Example", url: "https://example.com/jobs", excerpt: "Find our open positions and apply online.", retrievedAt: "2026-09-29T00:00:00.000Z" }] })));
  render(<WebSalaryPanel application={sampleApplications[0]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Search web salaries" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Search web salaries" }));
  expect(await screen.findByText(/No usable salary figures were found/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Save range to dashboard" })).not.toBeInTheDocument();
});

it("keeps existing research when provider setup is missing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "web-search-unconfigured" } }), { status: 503 })));
  render(<WebSalaryPanel application={sampleApplications[0]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Search web salaries" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Search web salaries" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Tavily API key in Settings");
  expect(within(screen.getByRole("region")).queryByRole("button", { name: "Save range to dashboard" })).not.toBeInTheDocument();
});
