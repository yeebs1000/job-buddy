import { describe, expect, it, vi } from "vitest";
import { BuddyPanel } from "./BuddyPanel";

describe("BuddyPanel", () => {
  it("selects only empty safe fields with the bulk action and labels overwrites", () => {
    const panel = new BuddyPanel(document.body);
    panel.render({ state: "review", mode: "approval", matched: 3, manual: 0, autoFilled: 0, fields: [
      { id: "first", label: "First name", risk: "safe", preview: "Alex" },
      { id: "email", label: "Email", risk: "safe", preview: "alex@example.com", existingValue: true },
      { id: "salary", label: "Salary", risk: "review", preview: "90000" },
    ] });
    panel.expand();
    expect(panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.disabled).toBe(true);
    panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="select-safe"]')!.click();
    expect([...panel.shadowRoot.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value)).toEqual(["first"]);
    expect(panel.shadowRoot.querySelector<HTMLButtonElement>('[data-action="fill-approved"]')!.disabled).toBe(false);
    expect(panel.shadowRoot.textContent).toContain("Replaces an existing answer");
  });
  it("mounts an accessible collapsed Buddy with isolated reduced-motion styles", () => {
    const panel = new BuddyPanel(document.body);
    panel.render({ state: "fields-found", matched: 6, review: 2, manual: 1 });

    expect(panel.host.getAttribute("data-job-buddy")).toBe("panel");
    expect(panel.shadowRoot.querySelector('[aria-label="Open Job Buddy"]')).toBeTruthy();
    expect(panel.shadowRoot.querySelector("style")?.textContent).toContain("prefers-reduced-motion");
  });

  it("moves between corners and collapses on Escape", () => {
    const panel = new BuddyPanel(document.body);
    panel.setCorner("left");
    panel.expand();
    panel.shadowRoot.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(panel.host.dataset.corner).toBe("left");
    expect(panel.expanded).toBe(false);
  });

  it("submits an unpaired code through a callback without placing it in a URL", async () => {
    const onPair = vi.fn().mockResolvedValue(undefined);
    const panel = new BuddyPanel(document.body, { onPair });
    panel.render({ state: "unpaired" });
    panel.expand();
    const input = panel.shadowRoot.querySelector<HTMLInputElement>('input[name="pairing-code"]')!;
    input.value = "ABCDE-FGHJK";
    panel.shadowRoot.querySelector<HTMLFormElement>("form")!.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    expect(onPair).toHaveBeenCalledWith("ABCDE-FGHJK");
    expect(panel.shadowRoot.querySelector("a")?.getAttribute("href") ?? "").not.toContain("ABCDE-FGHJK");
  });

  it("requires explicit field selection before approval-mode filling", () => {
    const onFillApproved = vi.fn();
    const panel = new BuddyPanel(document.body, { onFillApproved });
    panel.render({
      state: "review",
      mode: "approval",
      matched: 2,
      manual: 1,
      autoFilled: 0,
      fields: [
        { id: "first-name", label: "First name", risk: "safe" },
        { id: "salary", label: "Expected salary", risk: "review", preview: "80000" },
      ],
    });
    panel.expand();

    panel.shadowRoot.querySelector<HTMLInputElement>('input[value="first-name"]')!.click();
    panel.shadowRoot.querySelector<HTMLButtonElement>("button[data-action='fill-approved']")!.click();

    expect(onFillApproved).toHaveBeenCalledWith(["first-name"]);
    expect(panel.shadowRoot.textContent).toContain("Buddy never submits applications");
    expect(panel.shadowRoot.textContent).toContain("Review answer: 80000");
  });

  it("requires an explicit send action for a confirmed application capture", () => {
    const onSendCapture = vi.fn();
    const panel = new BuddyPanel(document.body, { onSendCapture });
    panel.render({ state: "capture", company: "Summit Pay", role: "Software Engineer", location: "Singapore" });
    panel.expand();

    expect(onSendCapture).not.toHaveBeenCalled();
    panel.shadowRoot.querySelector<HTMLButtonElement>("button[data-action='send-capture']")!.click();

    expect(onSendCapture).toHaveBeenCalledOnce();
  });

  it("allows correction and explicitly sends normalized salary evidence", () => {
    const onSendSalaryEvidence = vi.fn();
    const panel = new BuddyPanel(document.body, { onSendSalaryEvidence });
    panel.render({ state: "salary-evidence", evidence: {
      id: "salary-1", market: "US", currency: "USD", period: "annual", minimum: 120_000, maximum: 165_000,
      sourceUrl: "https://jobs.example/role", evidenceExcerpt: "$120,000 to $165,000 a year", detectedAt: "2026-09-16T01:00:00.000Z",
    } });
    panel.expand();

    expect(onSendSalaryEvidence).not.toHaveBeenCalled();
    const minimum = panel.shadowRoot.querySelector<HTMLInputElement>('input[name="salary-minimum"]')!;
    minimum.value = "125000";
    minimum.dispatchEvent(new Event("input", { bubbles: true }));
    panel.shadowRoot.querySelector<HTMLButtonElement>('button[data-action="add-salary-evidence"]')!.click();

    expect(onSendSalaryEvidence).toHaveBeenCalledWith(expect.objectContaining({ minimum: 125_000, maximum: 165_000 }));
  });
});
