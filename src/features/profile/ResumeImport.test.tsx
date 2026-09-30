import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { emptyCandidateProfile } from "../../domain/profile";
import { ResumeImport } from "./ResumeImport";
import { readResumeFile } from "./resumeText";

vi.mock("./resumeText", () => ({ readResumeFile: vi.fn() }));

describe("resume file lifecycle", () => {
  it("replaces a previously broken section only after explicit opt-in", async () => {
    const initial = { ...structuredClone(emptyCandidateProfile), education: [{ degree: "Old broken entry" }], experience: [{ title: "Keep my role" }] };
    const onApply = vi.fn();
    render(<ResumeImport profile={initial} onApply={onApply} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Paste resume text"), "EDUCATION\nExample University\nBSc Computing");
    await user.click(screen.getByRole("button", { name: "Review extracted details" }));
    const replace = screen.getByRole("checkbox", { name: /Replace existing education/ });
    expect(replace).not.toBeChecked();
    await user.click(replace);
    await user.click(screen.getByRole("button", { name: "Apply selected details" }));
    expect(onApply.mock.calls[0][0].education).toEqual([{ institution: "Example University", degree: "BSc Computing" }]);
    expect(onApply.mock.calls[0][0].experience).toEqual(initial.experience);
    expect(initial.education).toEqual([{ degree: "Old broken entry" }]);
  });

  it("aborts pending file parsing on close without applying a late result", async () => {
    let finish!: (value: string) => void;
    vi.mocked(readResumeFile).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onApply = vi.fn();
    const view = render(<ResumeImport profile={structuredClone(emptyCandidateProfile)} onApply={onApply} onClose={() => view.unmount()} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Choose resume file"), new File(["%PDF-test"], "resume.pdf", { type: "application/pdf" }));
    expect(screen.getByRole("status")).toHaveTextContent("Reading locally");
    const signal = vi.mocked(readResumeFile).mock.calls.at(-1)![1];
    await user.click(screen.getByRole("button", { name: "Cancel import" }));
    expect(signal.aborted).toBe(true);
    await act(async () => { finish("Late Name\nlate@example.com"); });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps the paste fallback usable when file parsing fails", async () => {
    vi.mocked(readResumeFile).mockRejectedValueOnce(new Error("Could not read this PDF."));
    render(<ResumeImport profile={structuredClone(emptyCandidateProfile)} onApply={vi.fn()} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText("Choose resume file"), new File(["bad"], "resume.pdf", { type: "application/pdf" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not read this PDF");
    expect(screen.getByLabelText("Choose resume file")).toHaveValue("");
    await user.type(screen.getByLabelText("Paste resume text"), "alex@example.com");
    await user.click(screen.getByRole("button", { name: "Review extracted details" }));
    expect(screen.getByRole("checkbox", { name: "Include Email" })).toBeChecked();
  });
});
