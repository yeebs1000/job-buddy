import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { RoleMatchForm } from "./RoleMatchForm";

it("requires explicit confirmation and separates reusable title mapping consent", async () => {
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(<RoleMatchForm title="Platform Wizard" market="US" onConfirm={onConfirm} />);

  expect(screen.getByRole("button", { name: "Confirm role mapping" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Official role match"), "software-engineer");
  await user.click(screen.getByLabelText("I confirm this role mapping"));
  await user.click(screen.getByLabelText("Use this title mapping for future applications"));
  await user.click(screen.getByRole("button", { name: "Confirm role mapping" }));

  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ canonicalRole: "software-engineer", sourceOccupationCode: "15-1252", overridden: true }), true);
});

it("reuses an explicitly saved title mapping", async () => {
  const onConfirm = vi.fn();
  const user = userEvent.setup();
  render(<RoleMatchForm title="Platform Wizard" market="US" overrides={[{
    id: "saved-alias", market: "US", normalizedTitle: "platform wizard", canonicalRole: "data-engineer",
    sourceOccupationCode: "15-1243", createdAt: "2026-09-16T00:00:00.000Z",
  }]} onConfirm={onConfirm} />);

  expect(screen.getByLabelText("Official role match")).toHaveValue("data-engineer");
  await user.click(screen.getByLabelText("I confirm this role mapping"));
  await user.click(screen.getByRole("button", { name: "Confirm role mapping" }));

  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ canonicalRole: "data-engineer", ruleId: "alias:saved-alias" }), false);
});
