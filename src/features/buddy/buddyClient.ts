import { z } from "zod";
import {
  buddyActivityEntrySchema,
  buddyPreferencesSchema,
  pendingCaptureSchema,
  type BuddyActivityEntry,
  type BuddyPreferences,
  type PendingCapture,
} from "../../domain/buddy";

const buddyStatusSchema = z.discriminatedUnion("paired", [
  z.object({ paired: z.literal(false) }).strict(),
  z.object({ paired: z.literal(true), origin: z.string(), pairedAt: z.string().datetime() }).strict(),
]);
const pairingStartSchema = z.object({ code: z.string(), expiresAt: z.string().datetime() }).strict();
const preferencesResponseSchema = z.object({ preferences: buddyPreferencesSchema }).strict();
const activityResponseSchema = z.object({ activity: z.array(buddyActivityEntrySchema) }).strict();
const capturesResponseSchema = z.object({ captures: z.array(pendingCaptureSchema) }).strict();

export type BuddyStatus = z.infer<typeof buddyStatusSchema>;

export interface BuddyClient {
  status(): Promise<BuddyStatus>;
  startPairing(): Promise<{ code: string; expiresAt: string }>;
  revoke(): Promise<void>;
  getPreferences(): Promise<BuddyPreferences>;
  savePreferences(preferences: BuddyPreferences): Promise<BuddyPreferences>;
  listActivity(): Promise<BuddyActivityEntry[]>;
  clearActivity(): Promise<void>;
  listCaptures(): Promise<PendingCapture[]>;
  deleteCapture(id: string): Promise<void>;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error("buddy-request-failed");
  return response;
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  return (await request(path, init)).json();
}

const jsonHeaders = { accept: "application/json", "content-type": "application/json" };

export const buddyClient: BuddyClient = {
  async status() {
    return buddyStatusSchema.parse(await requestJson("/api/buddy/status", { headers: { accept: "application/json" } }));
  },
  async startPairing() {
    return pairingStartSchema.parse(await requestJson("/api/buddy/pairing/start", { method: "POST", headers: jsonHeaders, body: "{}" }));
  },
  async revoke() {
    await request("/api/buddy/pairing", { method: "DELETE", headers: jsonHeaders, body: "{}" });
  },
  async getPreferences() {
    return preferencesResponseSchema.parse(await requestJson("/api/buddy/preferences", { headers: { accept: "application/json" } })).preferences;
  },
  async savePreferences(preferences) {
    return preferencesResponseSchema.parse(await requestJson("/api/buddy/preferences", { method: "PUT", headers: jsonHeaders, body: JSON.stringify(preferences) })).preferences;
  },
  async listActivity() {
    return activityResponseSchema.parse(await requestJson("/api/buddy/activity", { headers: { accept: "application/json" } })).activity;
  },
  async clearActivity() {
    await request("/api/buddy/activity", { method: "DELETE", headers: jsonHeaders, body: "{}" });
  },
  async listCaptures() {
    return capturesResponseSchema.parse(await requestJson("/api/buddy/captures", { headers: { accept: "application/json" } })).captures;
  },
  async deleteCapture(id) {
    await request(`/api/buddy/captures/${encodeURIComponent(id)}`, { method: "DELETE", headers: jsonHeaders, body: "{}" });
  },
};
