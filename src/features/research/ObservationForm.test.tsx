import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ObservationForm } from "./ObservationForm";

it("defaults a private offer to non-reusable and emits validated evidence", async () => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<ObservationForm applicationId="a1" market="US" canonicalRole="software-engineer" onAdd={onAdd} now={() => Date.parse("2026-09-16T00:00:00.000Z")} />);

  await user.selectOptions(screen.getByLabelText("Evidence type"), "offer");
  expect(screen.getByLabelText("Reuse in market estimates")).not.toBeChecked();
  await user.type(screen.getByLabelText("Minimum salary"), "120000");
  await user.type(screen.getByLabelText("Maximum salary"), "160000");
  await user.click(screen.getByRole("button", { name: "Add salary evidence" }));

  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
    applicationId: "a1", provenance: "offer", currency: "USD", period: "annual",
    minimum: 120000, maximum: 160000, reusable: false,
  }));
});
