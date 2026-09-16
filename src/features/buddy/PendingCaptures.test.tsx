import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { PendingCapture } from "../../domain/buddy";
import type { BuddyClient } from "./buddyClient";
import { PendingCaptures } from "./PendingCaptures";

const pending: PendingCapture = {
  id: "capture-1", company: "Summit Pay", role: "Engineer", location: "Singapore",
  sourceUrl: "https://jobs.example/roles/42", platform: "greenhouse",
  detectedAt: "2026-09-16T02:00:00.000Z", completionId: "confirmation-1",
};

it("lets the user correct metadata before importing and deletes only after success", async () => {
  const client = {
    listCaptures: vi.fn().mockResolvedValue([pending]),
    deleteCapture: vi.fn().mockResolvedValue(undefined),
  } as unknown as BuddyClient;
  const capture = vi.fn().mockResolvedValue({ applicationId: "application-1", created: true });
  render(<PendingCaptures client={client} capture={capture} />);

  const role = await screen.findByLabelText("Role");
  await userEvent.clear(role);
  await userEvent.type(role, "Software Engineer");
  await userEvent.click(screen.getByRole("button", { name: "Add to tracker" }));

  expect(capture).toHaveBeenCalledWith(pending, expect.objectContaining({ role: "Software Engineer", country: "Singapore", discipline: "software_it" }));
  await waitFor(() => expect(client.deleteCapture).toHaveBeenCalledWith(pending.id));
  expect(screen.getByText(/scan Gmail now above/i)).toBeVisible();
});

it("keeps a pending capture when the tracker write fails", async () => {
  const client = {
    listCaptures: vi.fn().mockResolvedValue([pending]),
    deleteCapture: vi.fn(),
  } as unknown as BuddyClient;
  render(<PendingCaptures client={client} capture={vi.fn().mockRejectedValue(new Error("write failed"))} />);

  await userEvent.click(await screen.findByRole("button", { name: "Add to tracker" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("could not be added");
  expect(client.deleteCapture).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Role")).toHaveValue("Engineer");
});
