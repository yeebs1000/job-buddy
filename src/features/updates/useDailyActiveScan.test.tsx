import { StrictMode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isDailyScanEligible, useDailyActiveScan } from "./useDailyActiveScan";

describe("useDailyActiveScan", () => {
  it("starts one Gmail scan when the last success is at least 24 hours old", async () => {
    const scan = vi.fn().mockResolvedValue(undefined);
    const props = {
      connected: true,
      enabled: true,
      initialSyncCompleted: true,
      lastSuccessfulScanAt: "2026-09-14T07:59:59.000Z",
      now: "2026-09-15T08:00:00.000Z",
      sessionKey: "gmail:user@example.com",
      scan,
    };
    const { rerender } = renderHook((input) => useDailyActiveScan(input), { initialProps: props, wrapper: StrictMode });

    await waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    rerender(props);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("does not scan while disconnected, disabled, recent, or before initial consent", () => {
    const baseline = { connected: true, enabled: true, initialSyncCompleted: true, lastSuccessfulScanAt: "2026-09-14T08:00:01.000Z", now: "2026-09-15T08:00:00.000Z" };
    expect(isDailyScanEligible(baseline)).toBe(false);
    expect(isDailyScanEligible({ ...baseline, lastSuccessfulScanAt: "2026-09-14T07:59:59.000Z", connected: false })).toBe(false);
    expect(isDailyScanEligible({ ...baseline, lastSuccessfulScanAt: "2026-09-14T07:59:59.000Z", enabled: false })).toBe(false);
    expect(isDailyScanEligible({ ...baseline, lastSuccessfulScanAt: "2026-09-14T07:59:59.000Z", initialSyncCompleted: false })).toBe(false);
  });
});
