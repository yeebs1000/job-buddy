import { describe, expect, it, vi } from "vitest";
import { BuddyPanel } from "./BuddyPanel";

describe("BuddyPanel", () => {
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
});
