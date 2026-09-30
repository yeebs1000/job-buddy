import type { MailScanState } from "./updateRepository";

export function MailScanProgress({ state }: { state?: MailScanState }) {
  if (!state?.progress) return null;
  const { processed, total } = state.progress;
  return <div role="status" className="mail-scan-progress">
    <progress aria-label="Gmail messages checked" value={processed} max={Math.max(total, 1)} />
    <span>{state.error ? "Scan interrupted · " : state.rechecking ? "Rechecking older mail · " : ""}Checked {processed} of {total} messages{state.continuationToken ? " · Progress saved locally" : ""}.</span>
  </div>;
}
