import { describe, expect, it } from "vitest";
import { fixtureMailFailureCursor, fixtureMessages } from "../../fixtures/mail/messages";
import { FixtureMailAdapter } from "./FixtureMailAdapter";

describe("FixtureMailAdapter", () => {
  it("returns only messages after the supplied cursor", async () => {
    // Catches a cursor branch that replays the initial fixture set after a completed scan.
    const adapter = new FixtureMailAdapter(fixtureMessages);

    const first = await adapter.scan(null);
    const second = await adapter.scan(first.nextCursor);

    expect(adapter.source).toBe("simulated");
    expect(first.diagnostics).toEqual({ truncated: false, recoverySync: false, ignoredMessageCount: 0 });
    expect(first.messages.length).toBeGreaterThan(0);
    expect(second.messages).toEqual([]);
  });

  it("returns the fixture messages strictly after a partial cursor", async () => {
    // Catches an off-by-one cursor branch that includes the already processed envelope.
    const adapter = new FixtureMailAdapter(fixtureMessages);

    const result = await adapter.scan("fixture-mail-cursor-2");

    expect(result.messages.map((message) => message.providerMessageId)).toEqual([
      "mail-rejection-003",
      "mail-offer-004",
      "mail-conflicting-role-005",
      "mail-marketing-006",
      "mail-repeated-007",
      "mail-repeated-007",
    ]);
  });

  it("returns an empty result for the completed fixture cursor", async () => {
    // Catches a cursor branch that returns messages at or before the completed position.
    const adapter = new FixtureMailAdapter(fixtureMessages);

    const result = await adapter.scan("fixture-mail-cursor-8");

    expect(result).toMatchObject({ messages: [], nextCursor: "fixture-mail-cursor-8" });
  });

  it("surfaces the deterministic simulated adapter failure", async () => {
    // Catches a fixture adapter that hides provider failures as an empty successful scan.
    const adapter = new FixtureMailAdapter(fixtureMessages);

    await expect(adapter.scan(fixtureMailFailureCursor)).rejects.toThrow("Simulated mail adapter failure");
  });
});
