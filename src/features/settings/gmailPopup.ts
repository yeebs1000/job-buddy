import type { GmailSettingsClient } from "./gmailClient";

let connecting = false;
export function isGmailConnectionInProgress() { return connecting; }
export class GmailPopupError extends Error {
  constructor(readonly code: "blocked" | "stopped" | "timeout" | "authorization" | "connection" | "client-config") { super(code); }
}

function wait(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new GmailPopupError("stopped")); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 1000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function connectGmailPopup(client: Pick<GmailSettingsClient, "startPopup" | "popupResult">, options: {
  signal?: AbortSignal;
  prepare?: () => Promise<void>;
  onConnected: () => Promise<void>;
  onWindowClosed?: () => void;
}): Promise<void> {
  if (connecting) throw new GmailPopupError("connection");
  // Open during the click, before any awaited network/storage call.
  const popup = window.open("about:blank", "_blank", "popup=yes,width=520,height=680");
  if (!popup) throw new GmailPopupError("blocked");
  connecting = true;
  const controller = new AbortController();
  const stop = () => controller.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) stop();
  let timedOut = false;
  let closedReported = false;
  const timer = window.setTimeout(() => { timedOut = true; stop(); }, 10 * 60_000);
  const close = () => { try { popup.close(); } catch { /* A provider may isolate its browsing context. */ } };
  const check = () => { if (controller.signal.aborted) throw new GmailPopupError(timedOut ? "timeout" : "stopped"); };
  try {
    // No cross-window messages are needed; deny the remote page opener access.
    popup.opener = null;
    popup.document.title = "Connecting Gmail — Job Buddy";
    check();
    await options.prepare?.();
    check();
    const { authorizationUrl, popupId } = await client.startPopup(controller.signal);
    check();
    const url = new URL(authorizationUrl);
    if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" || url.username || url.password) throw new GmailPopupError("connection");
    popup.location.replace(url.toString());
    while (true) {
      check();
      const result = await client.popupResult(popupId, controller.signal);
      check();
      if (result === "connected") {
        clearTimeout(timer); close();
        await options.onConnected();
        return;
      }
      if (result === "client-config") throw new GmailPopupError("client-config");
      if (result === "error" || result === "expired") throw new GmailPopupError(result === "expired" ? "timeout" : "authorization");
      // COOP can make a live popup appear closed. Never treat that as proof of
      // denial or success; continue checking the exact server-side receipt.
      if (popup.closed && !closedReported) { closedReported = true; options.onWindowClosed?.(); }
      await wait(controller.signal);
    }
  } catch (error) {
    check();
    throw error instanceof GmailPopupError ? error : new GmailPopupError("connection");
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener("abort", stop);
    close(); connecting = false;
  }
}
