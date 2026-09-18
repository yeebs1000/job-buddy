import { afterEach, expect, it, vi } from "vitest";
import { gmailClient, GmailSetupError } from "./gmailClient";

afterEach(() => vi.unstubAllGlobals());

it.each(["setup-managed", "disconnect-required", "connection-busy"])("provides actionable, allowlisted setup feedback for %s", async (code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "UNTRUSTED" } }), { status: 409 })));
  await expect(gmailClient.configureDesktopClient("123-test.apps.googleusercontent.com")).rejects.toBeInstanceOf(GmailSetupError);
});

it("does not display arbitrary server error text", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "unknown", message: "PRIVATE" } }), { status: 500 })));
  await expect(gmailClient.configureDesktopClient("123-test.apps.googleusercontent.com")).rejects.toThrow("The local Gmail companion could not complete this request");
});
