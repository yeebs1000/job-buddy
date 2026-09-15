import type { Page, Route } from "@playwright/test";
import type { GmailConnectionStatus } from "../../src/domain/mail";

export interface FakeGmailScanResponse {
  source: "gmail";
  messages: Array<{
    providerMessageId: string;
    threadId?: string;
    fromName?: string;
    fromAddress: string;
    subject: string;
    receivedAt: string;
    excerpt: string;
    links: string[];
  }>;
  nextCursor: string;
  scannedAt: string;
  diagnostics: { truncated: boolean; recoverySync: boolean; ignoredMessageCount: number };
}

export const liveInterviewScan: FakeGmailScanResponse = {
  source: "gmail",
  messages: [{
    providerMessageId: "gmail-live-interview-1",
    threadId: "gmail-live-thread-1",
    fromName: "Taylor Ng",
    fromAddress: "taylor.ng@circuitharbour.example",
    subject: "Technical interview invitation — Software Engineer",
    receivedAt: "2026-09-12T06:00:00.000Z",
    excerpt: "Circuit Harbour Ltd would like to invite you to a technical interview on 2026-09-13 at 2:00 PM SGT.",
    links: ["https://meet.example/circuit-technical"],
  }],
  nextCursor: "gmail-history-101",
  scannedAt: "2026-09-12T06:05:00.000Z",
  diagnostics: { truncated: false, recoverySync: false, ignoredMessageCount: 0 },
};

export class FakeGmailApi {
  private status: GmailConnectionStatus = { state: "unconfigured", platformSupported: true, lastError: "missing-config" };
  private readonly scans: FakeGmailScanResponse[] = [];
  disconnected = false;

  constructor(private readonly page: Page) {}

  setStatus(status: GmailConnectionStatus): void { this.status = status; }
  queueScan(result: FakeGmailScanResponse): void { this.scans.push(result); }

  async install(): Promise<void> {
    await this.page.route("**/api/gmail/**", (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/gmail/status" && method === "GET") return this.json(route, this.status);
    if (path === "/api/gmail/scan" && method === "POST") {
      const result = this.scans.shift();
      if (!result) return this.unexpected(route, method, path);
      return this.json(route, result);
    }
    if (path === "/api/gmail/disconnect" && method === "POST") {
      this.disconnected = true;
      this.status = { state: "disconnected", platformSupported: true };
      return this.json(route, { revocationConfirmed: true });
    }
    if (path === "/api/gmail/oauth/start" && method === "POST") {
      return this.json(route, { authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=fake" });
    }
    return this.unexpected(route, method, path);
  }

  private json(route: Route, body: unknown): Promise<void> {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  }

  private unexpected(route: Route, method: string, path: string): Promise<void> {
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: `Unexpected fake Gmail request: ${method} ${path}` }) });
  }
}
