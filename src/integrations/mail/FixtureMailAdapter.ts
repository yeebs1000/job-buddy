import type { MailAdapter, MailEnvelope, MailScanResult } from "./MailAdapter";
import { fixtureMailFailureCursor, fixtureMailScannedAt } from "../../fixtures/mail/messages";

export const fixtureMailAdapterStatus = {
  provider: "fixture",
  mode: "simulated",
  credentialsRequired: false,
} as const;

const cursorPrefix = "fixture-mail-cursor-";

export class FixtureMailAdapter implements MailAdapter {
  readonly status = fixtureMailAdapterStatus;

  constructor(private readonly messages: readonly MailEnvelope[]) {}

  async scan(cursor: string | null): Promise<MailScanResult> {
    if (cursor === fixtureMailFailureCursor) {
      throw new Error("Simulated mail adapter failure");
    }

    const startIndex = cursor === null ? 0 : this.cursorIndex(cursor);
    return {
      messages: this.messages.slice(startIndex).map((message) => ({ ...message, links: [...message.links] })),
      nextCursor: `${cursorPrefix}${this.messages.length}`,
      scannedAt: fixtureMailScannedAt,
    };
  }

  private cursorIndex(cursor: string): number {
    const index = Number.parseInt(cursor.slice(cursorPrefix.length), 10);
    if (!cursor.startsWith(cursorPrefix) || !Number.isInteger(index) || index < 0 || index > this.messages.length) {
      throw new Error("Unknown simulated mail cursor");
    }
    return index;
  }
}
