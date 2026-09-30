import { randomBytes } from "node:crypto";

type PopupResult = "pending" | "connected" | "error" | "client-config";
interface PopupSession { id: string; origin: string; createdAt: number; result: PopupResult; processing: boolean; }

// Ephemeral receipts contain no tokens or email data. OAuth state/PKCE validation
// still belongs to GmailConnectionService; a receipt only reports its outcome.
export class OAuthPopupStore {
  private sessions = new Map<string, PopupSession>();
  constructor(private now = Date.now) {}
  private prune() {
    for (const [state, session] of this.sessions) {
      if (this.now() - session.createdAt >= 10 * 60_000) this.sessions.delete(state);
    }
  }
  create(state: string, origin: string): string {
    this.prune();
    if (!state || this.sessions.has(state) || this.sessions.size >= 32) throw new Error("popup-session-unavailable");
    const id = randomBytes(24).toString("hex");
    this.sessions.set(state, { id, origin, createdAt: this.now(), result: "pending", processing: false });
    return id;
  }
  find(state: string) { this.prune(); return this.sessions.get(state); }
  invalidatePending(): void {
    for (const session of this.sessions.values()) {
      if (session.result === "pending") session.result = "error";
    }
  }
  claim(state: string): boolean {
    const session = this.find(state);
    if (!session || session.result !== "pending" || session.processing) return false;
    session.processing = true;
    return true;
  }
  finish(state: string, result: "connected" | "error" | "client-config") {
    const session = this.find(state);
    if (session?.result === "pending") session.result = result;
  }
  result(id: string, origin: string): PopupResult | "expired" {
    this.prune();
    return [...this.sessions.values()].find((session) => session.id === id && session.origin === origin)?.result ?? "expired";
  }
}
