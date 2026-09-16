import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { GmailConnectionStatus } from "../../src/domain/mail";
import type { BuddyActivityEntry, BuddyPreferences, PendingCapture, PendingSalaryEvidence } from "../../src/domain/buddy";
import type { CandidateProfile, ProfileSelection } from "../../src/domain/profile";
import type { GmailScanResponse } from "../gmail/GmailSyncService";
import { z } from "zod";
import { marketSchema, type Market } from "../../src/domain/research";

interface ConnectionServicePort {
  status(): Promise<GmailConnectionStatus>;
  start(): Promise<{ authorizationUrl: string }>;
  complete(input: { code: string; state: string }): Promise<void>;
  disconnect(): Promise<{ revocationConfirmed: boolean }>;
}

interface SyncServicePort {
  scan(input: { cursor: string | null; initialSyncConfirmed: boolean }): Promise<GmailScanResponse>;
}

interface ProfileServicePort {
  status(): Promise<{ platformSupported: boolean; hasProfile: boolean }>;
  read(): Promise<CandidateProfile>;
  replace(input: unknown): Promise<CandidateProfile>;
  select(paths: readonly string[]): Promise<ProfileSelection>;
  delete(): Promise<void>;
}

interface BuddyServicePort {
  pairStart(): { code: string; expiresAt: string };
  pairComplete(input: { code: string; origin: string }): Promise<{ token: string }>;
  revoke(): Promise<void>;
  status(): Promise<{ paired: false } | { paired: true; origin: string; pairedAt: string }>;
  getPreferences(): Promise<BuddyPreferences>;
  setPreferences(input: unknown): Promise<BuddyPreferences>;
  listActivity(): Promise<BuddyActivityEntry[]>;
  clearActivity(): Promise<void>;
  listCaptures(): Promise<PendingCapture[]>;
  deleteCapture(id: string): Promise<void>;
  selectProfile(auth: { token: string; origin: string }, paths: readonly string[]): Promise<ProfileSelection>;
  readPreferences(auth: { token: string; origin: string }): Promise<BuddyPreferences>;
  updateExtensionPreference(auth: { token: string; origin: string }, input: unknown): Promise<BuddyPreferences>;
  appendActivity(auth: { token: string; origin: string }, input: unknown): Promise<void>;
  addCapture(auth: { token: string; origin: string }, input: unknown): Promise<PendingCapture>;
  listSalaryEvidence(): Promise<PendingSalaryEvidence[]>;
  deleteSalaryEvidence(id: string): Promise<void>;
  addSalaryEvidence(auth: { token: string; origin: string }, input: unknown): Promise<PendingSalaryEvidence>;
}

interface ResearchServicePort {
  status(): Promise<Array<{ market: Market; activeReleaseId?: string; activatedAt?: string; quarantineCount: number; latestQuarantinePath?: string }>>;
  refresh(market?: Market): Promise<Array<{ market: Market; ok: boolean; releaseId?: string; error?: string }>>;
  lookup(query: { market: Market; canonicalRole: string; metroCode?: string; state?: string }): Promise<unknown>;
}

export interface CompanionServerServices {
  connection: ConnectionServicePort;
  sync: SyncServicePort;
  profile: ProfileServicePort;
  buddy: BuddyServicePort;
  research?: ResearchServicePort;
}

export interface CompanionServerOptions {
  services: CompanionServerServices;
  allowedOrigins: readonly string[];
  uiOrigin: string;
  staticDir?: string;
}

class HttpInputError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

const maxBodyBytes = 16 * 1024;
const maxProfileBodyBytes = 128 * 1024;

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
}

function json(response: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(response);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function allowedOrigin(request: IncomingMessage, options: CompanionServerOptions): string | null {
  const origin = request.headers.origin;
  return typeof origin === "string" && options.allowedOrigins.includes(origin) ? origin : null;
}

function noContent(response: ServerResponse): void {
  applySecurityHeaders(response);
  response.statusCode = 204;
  response.end();
}

function extensionOrigin(request: IncomingMessage): string | null {
  const origin = request.headers.origin;
  return typeof origin === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ? origin : null;
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization) : null;
  if (!match) throw new HttpInputError(401, "unauthorized");
  return match[1];
}

async function readJson(request: IncomingMessage, limit = maxBodyBytes): Promise<Record<string, unknown>> {
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) throw new HttpInputError(415, "json-required");
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > limit) throw new HttpInputError(413, "body-too-large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) throw new HttpInputError(413, "body-too-large");
    chunks.push(buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpInputError(400, "invalid-json");
  }
}

function safeError(error: unknown): { status: number; code: string } {
  if (error instanceof HttpInputError) return error;
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "internal-error";
  const statuses: Record<string, number> = {
    "initial-consent-required": 409,
    "missing-config": 409,
    "platform-unsupported": 501,
    "invalid-state": 400,
    "offline-access-required": 409,
    "reconnect-required": 409,
    "request-failed": 502,
    "invalid-history": 502,
    "invalid-profile": 400,
    "invalid-pairing": 400,
    "unauthorized": 401,
    "confirmation-required": 409,
    "invalid-preference": 400,
    "research-unavailable": 503,
    "invalid-research-query": 400,
    "source-refresh-failed": 502,
    "insufficient-evidence": 404,
  };
  return { status: statuses[code] ?? 500, code: code in statuses ? code : "internal-error" };
}

async function serveStatic(request: IncomingMessage, response: ServerResponse, staticDir: string): Promise<boolean> {
  if (request.method !== "GET") return false;
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const decoded = decodeURIComponent(pathname);
  const requested = extname(decoded) ? resolve(staticDir, `.${decoded}`) : resolve(staticDir, "index.html");
  const root = resolve(staticDir);
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) return false;
  try {
    const body = await readFile(requested);
    const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
    applySecurityHeaders(response);
    response.statusCode = 200;
    response.setHeader("content-type", contentTypes[extname(requested)] ?? "application/octet-stream");
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

export function createCompanionServer(options: CompanionServerOptions) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const origin = allowedOrigin(request, options);
      const buddyPath = url.pathname.startsWith("/api/buddy/");
      const pairedOrigin = buddyPath ? extensionOrigin(request) : null;
      const responseOrigin = origin ?? pairedOrigin;
      if (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") {
        if (buddyPath ? !responseOrigin : !origin) throw new HttpInputError(403, "origin-not-allowed");
        response.setHeader("access-control-allow-origin", responseOrigin!);
        response.setHeader("vary", "Origin");
      } else if (responseOrigin) {
        response.setHeader("access-control-allow-origin", responseOrigin);
        response.setHeader("vary", "Origin");
      }

      if (request.method === "OPTIONS" && buddyPath && pairedOrigin) {
        const requestedMethod = request.headers["access-control-request-method"]?.toUpperCase() ?? "";
        const requestedHeaders = (request.headers["access-control-request-headers"] ?? "")
          .split(",")
          .map((header) => header.trim().toLowerCase())
          .filter(Boolean);
        const allowedMethods = ["GET", "POST", "PUT", "DELETE"];
        const allowedHeaders = new Set(["authorization", "content-type"]);
        if (!allowedMethods.includes(requestedMethod) || requestedHeaders.some((header) => !allowedHeaders.has(header))) {
          throw new HttpInputError(403, "origin-not-allowed");
        }
        response.setHeader("access-control-allow-methods", allowedMethods.join(", "));
        response.setHeader("access-control-allow-headers", "authorization, content-type");
        response.setHeader("access-control-max-age", "600");
        noContent(response);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/gmail/status") {
        const status = await options.services.connection.status();
        json(response, 200, {
          state: status.state,
          ...(status.accountEmail ? { accountEmail: status.accountEmail } : {}),
          platformSupported: status.platformSupported,
          ...(status.lastError ? { lastError: status.lastError } : {}),
        });
        return;
      }
      if (url.pathname.startsWith("/api/research/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        const research = options.services.research;
        if (!research) throw new HttpInputError(503, "research-unavailable");
        if (request.method === "GET" && url.pathname === "/api/research/status") {
          const markets = (await research.status()).map(({ latestQuarantinePath: _, ...status }) => status);
          json(response, 200, { markets });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/research/refresh") {
          const parsed = z.object({ market: marketSchema.optional() }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-research-query");
          const results = await research.refresh(parsed.data.market);
          if (results.length && results.every((result) => !result.ok)) throw new HttpInputError(502, "source-refresh-failed");
          json(response, 200, { results });
          return;
        }
        if (request.method === "POST" && url.pathname === "/api/research/lookup") {
          const parsed = z.object({
            market: marketSchema,
            canonicalRole: z.string().trim().min(1).max(100),
            metroCode: z.string().trim().min(1).max(20).optional(),
            state: z.string().trim().min(2).max(50).optional(),
          }).strict().safeParse(await readJson(request));
          if (!parsed.success) throw new HttpInputError(400, "invalid-research-query");
          const result = await research.lookup(parsed.data);
          if (result && typeof result === "object" && "status" in result && result.status === "insufficient_evidence") throw new HttpInputError(404, "insufficient-evidence");
          json(response, 200, result);
          return;
        }
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/oauth/start") {
        await readJson(request);
        json(response, 200, await options.services.connection.start());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/gmail/oauth/callback") {
        try {
          const code = url.searchParams.get("code") ?? "";
          const state = url.searchParams.get("state") ?? "";
          await options.services.connection.complete({ code, state });
          response.statusCode = 302;
          response.setHeader("location", `${options.uiOrigin}/settings?gmail=connected`);
        } catch {
          response.statusCode = 302;
          response.setHeader("location", `${options.uiOrigin}/settings?gmail=error`);
        }
        applySecurityHeaders(response);
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/scan") {
        const body = await readJson(request);
        const cursor = body.cursor;
        const initialSyncConfirmed = body.initialSyncConfirmed;
        if (!(cursor === null || typeof cursor === "string") || typeof initialSyncConfirmed !== "boolean") throw new HttpInputError(400, "invalid-scan-request");
        json(response, 200, await options.services.sync.scan({ cursor, initialSyncConfirmed }));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/gmail/disconnect") {
        await readJson(request);
        json(response, 200, await options.services.connection.disconnect());
        return;
      }
      if (url.pathname === "/api/profile") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        if (request.method === "GET") {
          const status = await options.services.profile.status();
          json(response, 200, {
            ...status,
            profile: status.platformSupported ? await options.services.profile.read() : null,
          });
          return;
        }
        if (request.method === "PUT") {
          const profile = await options.services.profile.replace(await readJson(request, maxProfileBodyBytes));
          json(response, 200, { profile });
          return;
        }
        if (request.method === "DELETE") {
          await readJson(request);
          await options.services.profile.delete();
          applySecurityHeaders(response);
          response.statusCode = 204;
          response.end();
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/api/buddy/status") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, await options.services.buddy.status());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/pairing/start") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        json(response, 200, options.services.buddy.pairStart());
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/pairing/complete") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        if (typeof body.code !== "string") throw new HttpInputError(400, "invalid-pairing");
        json(response, 200, await options.services.buddy.pairComplete({ code: body.code, origin: pairedOrigin }));
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/buddy/pairing") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        await options.services.buddy.revoke();
        noContent(response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/buddy/profile/select") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const token = bearerToken(request);
        const body = await readJson(request);
        if (!Array.isArray(body.paths) || !body.paths.every((path) => typeof path === "string") || body.paths.length > 100) throw new HttpInputError(400, "invalid-profile-selection");
        json(response, 200, { selection: await options.services.buddy.selectProfile({ token, origin: pairedOrigin }, body.paths) });
        return;
      }
      if (url.pathname === "/api/buddy/preferences") {
        if (request.method === "GET") {
          if (origin) json(response, 200, { preferences: await options.services.buddy.getPreferences() });
          else if (pairedOrigin) json(response, 200, { preferences: await options.services.buddy.readPreferences({ token: bearerToken(request), origin: pairedOrigin }) });
          else throw new HttpInputError(403, "origin-not-allowed");
          return;
        }
        if (request.method === "PUT") {
          const body = await readJson(request);
          if (origin) json(response, 200, { preferences: await options.services.buddy.setPreferences(body) });
          else if (pairedOrigin) json(response, 200, { preferences: await options.services.buddy.updateExtensionPreference({ token: bearerToken(request), origin: pairedOrigin }, body) });
          else throw new HttpInputError(403, "origin-not-allowed");
          return;
        }
      }
      if (url.pathname === "/api/buddy/activity") {
        if (request.method === "GET") {
          if (!origin) throw new HttpInputError(403, "origin-not-allowed");
          json(response, 200, { activity: await options.services.buddy.listActivity() });
          return;
        }
        if (request.method === "POST") {
          if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
          const body = await readJson(request);
          await options.services.buddy.appendActivity({ token: bearerToken(request), origin: pairedOrigin }, body.activity);
          noContent(response);
          return;
        }
        if (request.method === "DELETE") {
          if (!origin) throw new HttpInputError(403, "origin-not-allowed");
          await readJson(request);
          await options.services.buddy.clearActivity();
          noContent(response);
          return;
        }
      }
      if (url.pathname === "/api/buddy/captures" && request.method === "GET") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, { captures: await options.services.buddy.listCaptures() });
        return;
      }
      if (url.pathname === "/api/buddy/captures" && request.method === "POST") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        json(response, 201, { capture: await options.services.buddy.addCapture({ token: bearerToken(request), origin: pairedOrigin }, body.capture) });
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/buddy/captures/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        const id = decodeURIComponent(url.pathname.slice("/api/buddy/captures/".length));
        if (!id || id.length > 200 || id.includes("/")) throw new HttpInputError(400, "invalid-capture-id");
        await options.services.buddy.deleteCapture(id);
        noContent(response);
        return;
      }
      if (url.pathname === "/api/buddy/salary-evidence" && request.method === "GET") {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        json(response, 200, { evidence: await options.services.buddy.listSalaryEvidence() });
        return;
      }
      if (url.pathname === "/api/buddy/salary-evidence" && request.method === "POST") {
        if (!pairedOrigin) throw new HttpInputError(403, "origin-not-allowed");
        const body = await readJson(request);
        json(response, 201, { evidence: await options.services.buddy.addSalaryEvidence({ token: bearerToken(request), origin: pairedOrigin }, body.evidence) });
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/buddy/salary-evidence/")) {
        if (!origin) throw new HttpInputError(403, "origin-not-allowed");
        await readJson(request);
        const id = decodeURIComponent(url.pathname.slice("/api/buddy/salary-evidence/".length));
        if (!id || id.length > 200 || id.includes("/")) throw new HttpInputError(400, "invalid-salary-evidence-id");
        await options.services.buddy.deleteSalaryEvidence(id);
        noContent(response);
        return;
      }
      if (options.staticDir && await serveStatic(request, response, options.staticDir)) return;
      json(response, 404, { error: { code: "not-found" } });
    } catch (error) {
      const safe = safeError(error);
      if (safe.status === 403) response.removeHeader("access-control-allow-origin");
      json(response, safe.status, { error: { code: safe.code } });
    }
  });
}
