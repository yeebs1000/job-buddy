import { describe, expect, it, vi } from "vitest";
import { FxService } from "./FxService";

const now = () => Date.parse("2026-09-16T12:00:00Z");
const row = { base: "USD", quote: "SGD", date: "2026-09-16", rate: 1.2733 };
describe("FX reference comparisons", () => {
  it("uses a dated ECB rate and reuses it for an hour", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(row)));
    const service = new FxService(fetcher, now);
    expect(await service.quote("USD", "SGD")).toMatchObject({ ...row, retrievedAt: "2026-09-16T12:00:00.000Z" });
    await service.quote("USD", "SGD");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v2/providers/ecb/rate/USD/SGD");
  });
  it.each([{ date: "2025-09-16" }, { date: "2026-09-18" }, { date: "2026-02-30" }, { base: "HKD" }, { rate: -1 }])("rejects stale or mismatched source data %o", async (override) => {
    const service = new FxService(async () => new Response(JSON.stringify({ ...row, ...override })), now);
    await expect(service.quote("USD", "SGD")).rejects.toThrow();
  });
});
