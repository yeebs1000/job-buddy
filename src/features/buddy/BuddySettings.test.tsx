import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultBuddyPreferences, type BuddyPreferences } from "../../domain/buddy";
import { BuddySettings } from "./BuddySettings";
import type { BuddyClient } from "./buddyClient";

describe("BuddySettings", () => {
  it("shows an expiring code and requires confirmation for automatic fill", async () => {
    const user = userEvent.setup();
    const client = fakeBuddyClient();
    const confirmAutomatic = vi.fn().mockReturnValue(true);
    render(<BuddySettings client={client} confirmAutomatic={confirmAutomatic} />);

    await user.click(await screen.findByRole("button", { name: "Pair browser extension" }));
    expect(screen.getByText("ABCDE-FGHJK")).toBeVisible();
    expect(screen.getByText(/expires in/i)).toBeVisible();
    await user.click(screen.getByRole("radio", { name: /^Automatic fill/ }));

    expect(confirmAutomatic).toHaveBeenCalledOnce();
    expect(client.savePreferences).toHaveBeenCalledWith({ mode: "automatic", paused: false, enabledDomains: [] });
  });

  it("can pause, clear metadata-only activity, and revoke pairing", async () => {
    const user = userEvent.setup();
    const client = fakeBuddyClient({ paired: true, origin: `chrome-extension://${"a".repeat(32)}`, pairedAt: "2026-09-16T02:00:00.000Z" });
    render(<BuddySettings client={client} confirmRevoke={() => true} />);

    await user.click(await screen.findByLabelText("Pause Buddy everywhere"));
    await user.click(screen.getByRole("button", { name: "Clear activity" }));
    await user.click(screen.getByRole("button", { name: "Revoke extension" }));

    expect(client.savePreferences).toHaveBeenCalledWith(expect.objectContaining({ paused: true }));
    expect(client.clearActivity).toHaveBeenCalledOnce();
    expect(client.revoke).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("No browser extension is paired.")).toBeVisible());
  });
});

function fakeBuddyClient(status: Awaited<ReturnType<BuddyClient["status"]>> = { paired: false }): BuddyClient & Record<"savePreferences" | "clearActivity" | "revoke", ReturnType<typeof vi.fn>> {
  let preferences: BuddyPreferences = structuredClone(defaultBuddyPreferences);
  return {
    status: vi.fn().mockResolvedValue(status),
    startPairing: vi.fn().mockResolvedValue({ code: "ABCDE-FGHJK", expiresAt: new Date(Date.now() + 300_000).toISOString() }),
    revoke: vi.fn().mockResolvedValue(undefined),
    getPreferences: vi.fn(async () => structuredClone(preferences)),
    savePreferences: vi.fn(async (next: BuddyPreferences) => { preferences = structuredClone(next); return preferences; }),
    listActivity: vi.fn().mockResolvedValue([{ id: "activity-1", fieldCategory: "contact", disposition: "filled", reason: "safe-high-confidence", mode: "automatic", adapter: "greenhouse", domain: "jobs.example", at: "2026-09-16T02:00:00.000Z" }]),
    clearActivity: vi.fn().mockResolvedValue(undefined),
    listCaptures: vi.fn().mockResolvedValue([]),
    deleteCapture: vi.fn().mockResolvedValue(undefined),
    listSalaryEvidence: vi.fn().mockResolvedValue([]),
    deleteSalaryEvidence: vi.fn().mockResolvedValue(undefined),
  };
}
