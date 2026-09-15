import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { applicationRepository } from "../../db/applicationRepository";
import { jobBuddyDb } from "../../db/database";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { appRoutes } from "../../app/routes";
import { ApplicationDetailPage } from "./ApplicationDetailPage";

afterEach(async () => { cleanup(); vi.restoreAllMocks(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });
async function createApplication() {
  await applicationRepository.create({ ...sampleApplications[0], id: "a1", recruiter: "Alex at recruiting", notes: "Ask about the rotation programme.", stageEvents: [
    { id: "initial", applicationId: "a1", at: "2026-09-01T00:00:00Z", toStage: "applied", origin: "manual", accepted: true },
    { id: "review", applicationId: "a1", at: "2026-09-02T00:00:00Z", fromStage: "applied", toStage: "review", origin: "gmail", accepted: true, evidenceId: "mail-42" },
  ] });
}
function renderDetail(path = "/applications/a1", routes: RouteObject[] = [{ path: "/applications/:id", element: <ApplicationDetailPage /> }]) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

it("records a manual stage event and exposes undo", async () => {
  await createApplication(); const user = userEvent.setup(); render(<ApplicationDetailPage applicationId="a1" />);
  await user.selectOptions(await screen.findByLabelText("New stage"), "interview");
  await user.type(screen.getByLabelText("Update note"), "Recruiter confirmed the interview.");
  await user.click(screen.getByRole("button", { name: "Update stage" }));
  expect(await screen.findByText("Changed to Interview")).toBeVisible();
  expect(screen.getByRole("button", { name: "Undo change" })).toBeEnabled();
  expect(await applicationRepository.get("a1")).toMatchObject({ stage: "interview", outcome: null });
  expect((await applicationRepository.eventsFor("a1"))).toContainEqual(expect.objectContaining({ toStage: "interview", origin: "manual", accepted: true, note: "Recruiter confirmed the interview." }));
  await user.click(screen.getByRole("button", { name: "Undo change" }));
  await waitFor(() => expect(screen.getByLabelText("New stage")).toHaveValue("review"));
  expect(await applicationRepository.eventsFor("a1")).toHaveLength(4);
  expect(screen.getByText("Changed to Interview").closest("li")).toHaveTextContent("Reverted");
  expect(screen.getByText("Undo recorded")).toBeVisible();
});

it("undoes the first manual stage update back to no stage while retaining its history", async () => {
  await applicationRepository.create({ ...sampleApplications[0], id: "a1", stageEvents: [] });
  const user = userEvent.setup(); renderDetail();
  await user.selectOptions(await screen.findByLabelText("New stage"), "interview");
  await user.click(screen.getByRole("button", { name: "Update stage" }));
  expect(await screen.findByText("Changed to Interview")).toBeVisible();
  expect(screen.getByRole("button", { name: "Undo change" })).toBeEnabled();
  const [original] = await applicationRepository.eventsFor("a1");
  expect(original).toMatchObject({ toStage: "interview", origin: "manual", accepted: true });
  await user.click(screen.getByRole("button", { name: "Undo change" }));
  await waitFor(() => expect(screen.getByText("Changed to Interview").closest("li")).toHaveTextContent("Reverted"));
  expect(await applicationRepository.get("a1")).toMatchObject({ stage: null, outcome: null });
  expect(await applicationRepository.eventsFor("a1")).toEqual(expect.arrayContaining([
    { ...original, accepted: false },
    expect.objectContaining({ origin: "manual", accepted: true, revertsEventId: original.id }),
  ]));
  expect(screen.getByRole("group", { name: "Application progress" }).querySelector('[aria-current="step"]')).toBeNull();
  expect(screen.getByRole("button", { name: "Undo change" })).toBeDisabled();
});

it("requires explicit terminal confirmation, retains the reached stage and restores it on undo", async () => {
  await createApplication(); const user = userEvent.setup(); renderDetail();
  await user.selectOptions(await screen.findByLabelText("Outcome"), "rejected");
  await user.click(screen.getByRole("button", { name: "Record outcome" }));
  expect(await applicationRepository.get("a1")).toMatchObject({ stage: "review", outcome: null });
  await user.click(screen.getByRole("button", { name: "Cancel outcome" }));
  expect(screen.queryByRole("button", { name: "Confirm Rejected" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Record outcome" }));
  await user.click(screen.getByRole("button", { name: "Confirm Rejected" }));
  const rail = await screen.findByRole("group", { name: "Rejected during Review" });
  expect(rail).toHaveAttribute("data-outcome", "rejected");
  expect(rail.querySelectorAll('[data-state^="rejected"]')).toHaveLength(6);
  expect(await applicationRepository.get("a1")).toMatchObject({ stage: "review", outcome: "rejected" });
  expect(screen.getByLabelText("New stage")).toBeDisabled();
  const rejected = (await applicationRepository.eventsFor("a1")).find(e => e.outcome === "rejected")!;
  await user.click(screen.getByRole("button", { name: "Undo change" }));
  await waitFor(() => expect(screen.queryByRole("group", { name: "Rejected during Review" })).not.toBeInTheDocument());
  expect(await applicationRepository.get("a1")).toMatchObject({ stage: "review", outcome: null });
  expect(await jobBuddyDb.stageEvents.get(rejected.id)).toMatchObject({ accepted: false, outcome: "rejected" });
  const history = screen.getByRole("list", { name: "Stage history" });
  expect(within(history).getByText("Recorded Rejected").closest("li")).toHaveTextContent("Reverted");
  expect(screen.getByRole("group", { name: "Application progress" }).querySelector('[aria-current="step"]')).toHaveTextContent("Review");
});

it("orders activity by timestamp then identifier and shows source and evidence", async () => {
  await createApplication();
  await jobBuddyDb.stageEvents.bulkAdd([
    { id: "same-b", applicationId: "a1", at: "2026-09-03T00:00:00Z", origin: "import", accepted: false, toStage: "final" },
    { id: "same-a", applicationId: "a1", at: "2026-09-03T00:00:00Z", origin: "buddy", accepted: false, toStage: "assessment" },
  ]);
  renderDetail();
  const history = await screen.findByRole("list", { name: "Stage history" });
  expect(within(history).getAllByRole("listitem").map(li => li.querySelector("strong")?.textContent)).toEqual(["Changed to Applied", "Changed to Review", "Changed to Assessment", "Changed to Final"]);
  expect(within(history).getByText("Gmail")).toBeVisible();
  expect(within(history).getByText("Evidence: mail-42")).toBeVisible();
  expect(history.querySelector("time")).toHaveAttribute("datetime", "2026-09-01T00:00:00Z");
});

it("rejects a stage no-op without adding history", async () => {
  await createApplication(); const user = userEvent.setup(); renderDetail();
  await screen.findByLabelText("New stage");
  await user.click(screen.getByRole("button", { name: "Update stage" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a different stage");
  expect(await applicationRepository.eventsFor("a1")).toHaveLength(2);
});

it("shows load and persistence errors with a working retry", async () => {
  await createApplication(); const user = userEvent.setup();
  vi.spyOn(applicationRepository, "get").mockRejectedValueOnce(new Error("Unavailable"));
  renderDetail();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  await user.click(screen.getByRole("button", { name: "Retry loading" }));
  await user.selectOptions(await screen.findByLabelText("New stage"), "interview");
  vi.spyOn(applicationRepository, "appendEvent").mockRejectedValueOnce(new Error("Storage is full"));
  await user.click(screen.getByRole("button", { name: "Update stage" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Storage is full");
  expect((await applicationRepository.get("a1"))?.stage).toBe("review");
  await user.click(screen.getByRole("button", { name: "Update stage" }));
  expect(await screen.findByText("Changed to Interview")).toBeVisible();
});

it("renders the actual route parameter and useful available and unavailable sections", async () => {
  await createApplication(); renderDetail("/applications/a1", appRoutes);
  expect(await screen.findByRole("heading", { name: "Investment Analyst" })).toBeVisible();
  expect(screen.getByText("Alex at recruiting")).toBeVisible();
  expect(screen.getByText("Follow up")).toBeVisible();
  expect(screen.getByText(/SGD 4,800/)).toBeVisible();
  for (const section of ["Overview", "Contacts", "Deadlines & interviews", "Salary & company", "Activity"]) expect(screen.getByRole("heading", { name: section })).toBeVisible();
  const user = userEvent.setup();
  await user.click(screen.getByText("Job description"));
  expect(screen.getByText(/No job description/)).toBeVisible();
  await user.click(screen.getByText("Notes & documents"));
  expect(screen.getByText("Ask about the rotation programme.")).toBeVisible();
});

it.each(["https://careers.example.com/roles/graduate", "http://careers.example.com/roles/graduate"])("renders a persisted %s job URL as a safe external source link", async jobUrl => {
  await createApplication();
  await applicationRepository.update("a1", { jobUrl });
  renderDetail();

  expect(await screen.findByRole("link", { name: "Open job posting" })).toHaveAttribute("href", jobUrl);
  expect(screen.getByRole("link", { name: "Open job posting" })).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: "Open job posting" })).toHaveAttribute("rel", "noopener noreferrer");
});

it("renders a persisted safe meeting link for a deadline", async () => {
  await createApplication();
  await applicationRepository.update("a1", {
    deadlines: [{ id: "meeting", label: "Technical interview", at: "2026-09-20T06:00:00.000Z", completed: false, links: ["https://meet.example/interview"] }],
  });
  renderDetail();

  const meeting = await screen.findByRole("link", { name: "Open meeting link" });
  expect(meeting).toHaveAttribute("href", "https://meet.example/interview");
  expect(meeting).toHaveAttribute("target", "_blank");
  expect(meeting).toHaveAttribute("rel", "noopener noreferrer");
});

it.each(["javascript:alert(1)", "https://user:password@careers.example.com/role", "not a url"])("does not turn an unsafe persisted job URL into an external link: %s", async jobUrl => {
  await createApplication();
  await applicationRepository.update("a1", { jobUrl });
  renderDetail();

  await screen.findByRole("heading", { name: "Investment Analyst" });
  expect(screen.queryByRole("link", { name: "Open job posting" })).not.toBeInTheDocument();
  expect(screen.getByText("LinkedIn")).toBeVisible();
});

it("shows a loading state and a clear not-found state", async () => {
  renderDetail("/applications/missing");
  expect(screen.getByRole("status")).toHaveTextContent("Loading application");
  expect(await screen.findByRole("heading", { name: "Application not found" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to applications" })).toHaveAttribute("href", "/applications");
});
