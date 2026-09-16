import { afterEach, expect, it, vi } from "vitest";
import { connectGmailPopup, isGmailConnectionInProgress } from "./gmailPopup";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=state";
function setup() {
  const popup = { opener: window, document: { title: "" }, location: { replace: vi.fn() }, close: vi.fn(), closed: false };
  const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  const client = { startPopup: vi.fn(async () => ({ authorizationUrl, popupId: "a".repeat(48) })), popupResult: vi.fn(async () => "connected" as const) };
  return { popup, open, client };
}

it("opens synchronously, isolates the opener and confirms the attempt before syncing", async () => {
  const { popup, open, client } = setup();
  let synced = false;
  const connection = connectGmailPopup(client, { onConnected: async () => { expect(isGmailConnectionInProgress()).toBe(true); synced = true; } });
  expect(open).toHaveBeenCalledOnce();
  await connection;
  expect(popup.opener).toBeNull();
  expect(popup.location.replace).toHaveBeenCalledWith(authorizationUrl);
  expect(client.popupResult).toHaveBeenCalledWith("a".repeat(48), expect.anything());
  expect(synced).toBe(true);
  expect(popup.close).toHaveBeenCalled();
  expect(isGmailConnectionInProgress()).toBe(false);
});

it("does not start OAuth when the browser blocks the popup", async () => {
  const { open, client } = setup(); open.mockReturnValue(null);
  await expect(connectGmailPopup(client, { onConnected: async () => undefined })).rejects.toMatchObject({ code: "blocked" });
  expect(client.startPopup).not.toHaveBeenCalled();
});

it("does not confuse an existing connection or isolated window with new authorization", async () => {
  vi.useFakeTimers();
  const { popup, client } = setup(); popup.closed = true;
  client.popupResult = vi.fn().mockResolvedValueOnce("pending").mockResolvedValueOnce("connected");
  const onConnected = vi.fn(async () => undefined);
  const promise = connectGmailPopup(client, { onConnected });
  await vi.advanceTimersByTimeAsync(500);
  expect(onConnected).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  await promise;
  expect(onConnected).toHaveBeenCalledOnce();
});

it.each(["error", "expired"])("never syncs for a %s receipt", async (result) => {
  const { client } = setup(); client.popupResult = vi.fn().mockResolvedValue(result);
  const onConnected = vi.fn(async () => undefined);
  await expect(connectGmailPopup(client, { onConnected })).rejects.toBeInstanceOf(Error);
  expect(onConnected).not.toHaveBeenCalled();
});

it("stops polling and closes the popup when the user stops waiting", async () => {
  vi.useFakeTimers();
  const { popup, client } = setup(); client.popupResult = vi.fn().mockResolvedValue("pending");
  const controller = new AbortController(); const onConnected = vi.fn(async () => undefined);
  const promise = connectGmailPopup(client, { signal: controller.signal, onConnected });
  const rejected = expect(promise).rejects.toMatchObject({ code: "stopped" });
  await vi.advanceTimersByTimeAsync(100);
  controller.abort(); await rejected;
  const calls = client.popupResult.mock.calls.length;
  await vi.advanceTimersByTimeAsync(5000);
  expect(client.popupResult).toHaveBeenCalledTimes(calls);
  expect(onConnected).not.toHaveBeenCalled();
  expect(popup.close).toHaveBeenCalled();
});

it("times out an abandoned popup and allows retry", async () => {
  vi.useFakeTimers();
  const { client } = setup(); client.popupResult = vi.fn().mockResolvedValue("pending");
  const promise = connectGmailPopup(client, { onConnected: async () => undefined });
  const rejected = expect(promise).rejects.toMatchObject({ code: "timeout" });
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  await rejected;
  expect(isGmailConnectionInProgress()).toBe(false);
});

it("rejects a non-Google authorization URL without navigating", async () => {
  const { popup, client } = setup();
  client.startPopup.mockResolvedValue({ authorizationUrl: "https://evil.example", popupId: "a".repeat(48) });
  await expect(connectGmailPopup(client, { onConnected: async () => undefined })).rejects.toBeInstanceOf(Error);
  expect(popup.location.replace).not.toHaveBeenCalled();
});
