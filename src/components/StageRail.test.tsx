import { render, screen } from "@testing-library/react";
import { StageRail } from "./StageRail";

describe("StageRail", () => {
  it("labels the current stage and completed stages", () => {
    render(<StageRail stage="interview" outcome={null} />);

    expect(screen.getByRole("group", { name: "Application progress" })).toBeInTheDocument();
    expect(screen.getByText("Interview")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Applied").closest("li")).toHaveAttribute("data-state", "complete");
  });

  it("renders every segment as rejected without erasing the rejection point", () => {
    render(<StageRail stage="assessment" outcome="rejected" rejectedAtStage="assessment" />);

    expect(screen.getByRole("group", { name: /rejected during assessment/i })).toHaveAttribute(
      "data-outcome",
      "rejected",
    );
    expect(screen.getByText("Assessment").closest("li")).toHaveAttribute("data-state", "rejected-at");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
