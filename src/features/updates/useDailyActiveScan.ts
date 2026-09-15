import { useEffect, useRef } from "react";

const dayMs = 24 * 60 * 60 * 1_000;

export function isDailyScanEligible(input: {
  connected: boolean;
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSuccessfulScanAt?: string;
  now: string;
}): boolean {
  if (!input.connected || !input.enabled || !input.initialSyncCompleted || !input.lastSuccessfulScanAt) return false;
  const last = Date.parse(input.lastSuccessfulScanAt);
  const now = Date.parse(input.now);
  return Number.isFinite(last) && Number.isFinite(now) && now - last >= dayMs;
}

export function useDailyActiveScan(input: {
  connected: boolean;
  enabled: boolean;
  initialSyncCompleted: boolean;
  lastSuccessfulScanAt?: string;
  now: string;
  sessionKey: string;
  scan: () => Promise<unknown>;
}): void {
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (started.current === input.sessionKey || !isDailyScanEligible(input)) return;
    started.current = input.sessionKey;
    void input.scan().catch(() => undefined);
  }, [input]);
}
