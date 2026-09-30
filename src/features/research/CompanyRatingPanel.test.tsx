import "fake-indexeddb/auto";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, it, expect, vi } from "vitest";
import { CompanyRatingPanel } from "./CompanyRatingPanel";
import { companyRatingRepository } from "./companyRatingRepository";
import { sampleApplications } from "../../fixtures/sampleApplications";
import { jobBuddyDb } from "../../db/database";
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await jobBuddyDb.delete(); await jobBuddyDb.open(); });
it("restores saved rating evidence and reviewed values without a search", async () => {
  const app = sampleApplications[0];
  await companyRatingRepository.save({ id: app.id, company: app.company, provider: "Employee Survey", score: 3.7, outOf: 5, reviewCount: 321, confirmed: true, savedAt: "2026-09-26T00:00:00.000Z", retrievedAt: "2026-09-25T00:00:00.000Z", title: "Saved employee survey", url: "https://example.com/reviews", excerpt: "A saved excerpt that remains reviewable offline." });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<CompanyRatingPanel application={app} />);
  expect(await screen.findByText("A saved excerpt that remains reviewable offline.")).toBeVisible();
  expect(screen.getByLabelText("Rating provider")).toHaveValue("Employee Survey");
  expect(screen.getByLabelText("Rating score")).toHaveValue(3.7);
  expect(screen.getByLabelText("Review count (if stated)")).toHaveValue(321);
  expect(fetcher).not.toHaveBeenCalled();
});
it("requires explicit review before saving a suggested rating", async () => {
  const application = { ...sampleApplications[0], company: "Acme" };
  render(<CompanyRatingPanel application={application} initialSearch={{ requestId: "one", query: { company: "Acme", role: "Analyst", location: "Hong Kong" }, result: { searchedAt: "2026-09-26T00:00:00.000Z", results: [{ title: "Acme", url: "https://example.com/reviews", excerpt: "Acme employee reviews 4.2 out of 5", retrievedAt: "2026-09-26T00:00:00.000Z" }] } }} />);
  const save = await screen.findByRole("button", { name: "Save company rating" });
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(save);
  await waitFor(async () => expect((await companyRatingRepository.get(application.id))?.score).toBe(4.2));
});
