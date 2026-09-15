import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { MailAdapter } from "../../integrations/mail/MailAdapter";
import { runMailScan, type MailScanMode } from "./runMailScan";
import { updateRepository } from "./updateRepository";

export function useMailScan(adapter: MailAdapter, mode: MailScanMode = "approval") {
  const state = useLiveQuery(() => updateRepository.getScanState(adapter.source), [adapter.source]);
  const pending = useLiveQuery(() => updateRepository.listPending(), []);
  const [activeScans, setActiveScans] = useState(0);

  async function scan() {
    setActiveScans((count) => count + 1);
    try { return await runMailScan({ adapter, mode }); }
    finally { setActiveScans((count) => count - 1); }
  }

  return { state, pending: pending ?? [], isScanning: activeScans > 0, scan };
}
