import { describe, expect, it, vi } from "vitest";
import { mountContentRuntime } from "./content";

describe("content runtime", () => {
  it("mounts one Buddy instance and reads pairing state through the worker", async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, type: "status", paired: false });

    const first = await mountContentRuntime({ document, sendMessage });
    const second = await mountContentRuntime({ document, sendMessage });

    expect(first).toBe(second);
    expect(document.querySelectorAll("[data-job-buddy='panel']")).toHaveLength(1);
    expect(sendMessage).toHaveBeenCalledWith({ version: 1, type: "status" });
  });
});
