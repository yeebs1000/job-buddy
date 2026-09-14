import { render, screen, within } from "@testing-library/react";
import { StageRail } from "./StageRail";

describe("StageRail", () => {
  it("labels the current stage and completed stages", () => {
    render(<StageRail stage="interview" outcome={null} />);

    expect(screen.getByRole("group", { name: "Application progress" })).toBeInTheDocument();
    expect(screen.getByText("Interview")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Applied").closest("li")).toHaveAttribute("data-state", "complete");
    expect(within(screen.getByText("Applied").closest("li")!).getByText(/Completed/)).toBeInTheDocument();
    expect(within(screen.getByText("Final").closest("li")!).getByText(/Upcoming/)).toBeInTheDocument();
  });

  it("renders every segment as rejected without erasing the rejection point", () => {
    render(<StageRail stage="assessment" outcome="rejected" rejectedAtStage="assessment" />);

    expect(screen.getByRole("group", { name: /rejected during assessment/i })).toHaveAttribute(
      "data-outcome",
      "rejected",
    );
    expect(screen.getByText("Assessment").closest("li")).toHaveAttribute("data-state", "rejected-at");
    expect(screen.getByText("Assessment")).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/Rejected at Assessment/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("labels a non-rejected terminal outcome without announcing active progress", () => {
    render(<StageRail stage="interview" outcome="withdrawn" />);

    expect(screen.getByRole("group", { name: "Withdrawn after Interview" })).toHaveAttribute("data-outcome", "withdrawn");
    expect(screen.getByText("Interview").closest("li")).toHaveAttribute("data-state", "terminal-at");
    expect(screen.getByText("Interview")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("group").querySelectorAll('[data-state="current"], [data-state="upcoming"], [data-state="complete"]')).toHaveLength(0);
    expect(screen.getByText(/Withdrawn at Interview/)).toBeInTheDocument();
  });

  it("keeps compact labels and state text available to assistive technology", () => {
    render(<StageRail compact outcome={null} stage="interview" />);

    expect(screen.getByText("Interview")).toHaveAttribute("aria-current", "step");
    expect(within(screen.getByText("Applied").closest("li")!).getByText(/Completed/)).toBeInTheDocument();
  });
});
