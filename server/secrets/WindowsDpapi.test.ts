import { describe, expect, it, vi } from "vitest";
import { WindowsDpapi, type CommandRunner } from "./WindowsDpapi";

describe("WindowsDpapi", () => {
  it("round-trips bytes through fixed PowerShell commands and standard input", async () => {
    const run = vi.fn<CommandRunner["run"]>(async ({ stdin }) => {
      const transformed = Buffer.from(stdin, "base64").map((byte) => byte ^ 0xa5);
      return { stdout: Buffer.from(transformed).toString("base64") };
    });
    const dpapi = new WindowsDpapi({ runner: { run }, platform: "win32" });
    const plaintext = Buffer.from("profile-canary", "utf8");

    const protectedBytes = await dpapi.protect(plaintext);
    const restored = await dpapi.unprotect(protectedBytes);

    expect(restored.toString("utf8")).toBe("profile-canary");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.every(([request]) => request.executable === "powershell.exe")).toBe(true);
    expect(run.mock.calls.flatMap(([request]) => request.args).join(" ")).not.toContain("profile-canary");
    expect(run.mock.calls.every(([request]) => {
      const encoded = request.args.at(-1) ?? "";
      return Buffer.from(encoded, "base64").toString("utf16le").includes("DataProtectionScope]::CurrentUser");
    })).toBe(true);
  });

  it("rejects malformed helper output instead of treating it as protected data", async () => {
    const dpapi = new WindowsDpapi({
      runner: { run: vi.fn().mockResolvedValue({ stdout: "not base64!" }) },
      platform: "win32",
    });

    await expect(dpapi.protect(Buffer.from("profile-canary"))).rejects.toThrow("Invalid DPAPI response");
  });

  it("refuses to operate outside Windows", async () => {
    const dpapi = new WindowsDpapi({ runner: { run: vi.fn() }, platform: "darwin" });

    expect(dpapi.isSupported()).toBe(false);
    await expect(dpapi.protect(Buffer.from("profile-canary"))).rejects.toMatchObject({ code: "platform-unsupported" });
  });
});
