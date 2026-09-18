const messages = {
  "gmail-scan-superseded": "This scan stopped because the Gmail connection or another scan changed. Refresh to use the current connection; no stale batch was saved.",
  "gmail-timeout": "Google took too long to respond after automatic retries. Completed batches were saved; retry to resume the scan.",
  "gmail-network-error": "The local companion lost its connection to Google after automatic retries. Check your network, then retry to resume.",
  "gmail-response-invalid": "The Gmail scan returned data Job Buddy could not validate. Completed batches were kept; no final scan cursor was advanced.",
  "gmail-normalization-failed": "Job Buddy could not process a Gmail message. Completed batches were kept; no final scan cursor was advanced.",
  "gmail-companion-unreachable": "The browser lost contact with the local companion. Check it is running, then retry to resume your scan.",
  "gmail-local-save-failed": "Gmail was reached, but Job Buddy could not save this batch in your browser. Keep this tab open and check available browser storage before retrying. Earlier batches were kept.",
  "gmail-scan-expired": "The scan checkpoint expired or the companion restarted. Scan again to restart safely; already saved messages will not be duplicated.",
  "gmail-companion-error": "The local companion could not complete this scan. Restart the companion and retry; saved batches were kept.",
  "gmail-rate-limited": "Google temporarily limited Gmail requests. Please wait a minute, then retry. If this continues, check the Gmail API quota in Google Cloud. Your scan cursor was not advanced.",
  "gmail-access-denied": "Google denied Gmail access. Check Gmail API access in Google Cloud, then reconnect Gmail in Settings.",
  "reconnect-required": "Gmail authorization expired or was revoked. Reconnect Gmail in Settings, then scan again.",
  "initial-consent-required": "The first Gmail scan needs confirmation. Choose Scan last 90 days in Settings.",
  "gmail-scan-busy": "A Gmail scan is already running. Let it finish before starting another scan.",
  "gmail-request-failed": "Gmail could not be reached or returned an invalid response. Check your connection and retry; your scan cursor was not advanced.",
} as const;

export function gmailScanErrorCode(value: unknown): keyof typeof messages | undefined {
  return typeof value === "string" && Object.hasOwn(messages, value) ? value as keyof typeof messages : undefined;
}

export function gmailScanErrorMessage(code: unknown): string {
  return messages[gmailScanErrorCode(code) ?? "gmail-request-failed"];
}

export class GmailScanError extends Error {
  readonly code: keyof typeof messages;
  constructor(code: unknown) {
    super(gmailScanErrorMessage(code));
    this.code = gmailScanErrorCode(code) ?? "gmail-request-failed";
  }
}
