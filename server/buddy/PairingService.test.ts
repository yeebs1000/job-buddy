import { describe, expect, it } from "vitest";
import type { PairingMetadata, PairingMetadataStore } from "./BuddyStore";
import { PairingService } from "./PairingService";

const NOW = Date.parse("2026-09-16T02:00:00.000Z");
const EXTENSION_ORIGIN = `chrome-extension://${"a".repeat(32)}`;

describe("PairingService", () => {
  it("uses one code once, binds the extension origin, and stores only a token hash", async () => {
    const store = new MemoryPairingStore();
    const service = pairing(store);
    const { code } = service.start();

    const paired = await service.complete({ code, origin: EXTENSION_ORIGIN });

    expect(await store.getPairing()).toEqual(expect.objectContaining({
      origin: EXTENSION_ORIGIN,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(await store.getPairing())).not.toContain(paired.token);
    await expect(service.complete({ code, origin: EXTENSION_ORIGIN })).rejects.toMatchObject({ code: "invalid-pairing" });
    await expect(service.authorize(paired.token, EXTENSION_ORIGIN)).resolves.toBe(true);
    await expect(service.authorize(paired.token, `chrome-extension://${"b".repeat(32)}`)).resolves.toBe(false);
  });

  it("expires pending codes after five minutes", async () => {
    const store = new MemoryPairingStore();
    let now = NOW;
    const service = pairing(store, () => now);
    const { code } = service.start();
    now += 5 * 60_000 + 1;

    await expect(service.complete({ code, origin: EXTENSION_ORIGIN })).rejects.toMatchObject({ code: "invalid-pairing" });
    expect(await store.getPairing()).toBeNull();
  });

  it("rotates and revokes tokens", async () => {
    const store = new MemoryPairingStore();
    const service = pairing(store);
    const first = await service.complete({ code: service.start().code, origin: EXTENSION_ORIGIN });
    const second = await service.complete({ code: service.start().code, origin: EXTENSION_ORIGIN });

    expect(await service.authorize(first.token, EXTENSION_ORIGIN)).toBe(false);
    expect(await service.authorize(second.token, EXTENSION_ORIGIN)).toBe(true);
    await service.revoke();
    expect(await service.authorize(second.token, EXTENSION_ORIGIN)).toBe(false);
    expect(await service.status()).toEqual({ paired: false });
  });

  it("rejects non-extension origins", async () => {
    const service = pairing(new MemoryPairingStore());
    const { code } = service.start();

    await expect(service.complete({ code, origin: "https://jobs.example" })).rejects.toMatchObject({ code: "invalid-pairing" });
  });
});

function pairing(store: PairingMetadataStore, now: () => number = () => NOW) {
  let byte = 0;
  return new PairingService({
    store,
    now,
    randomBytes(size) {
      const buffer = Buffer.alloc(size);
      for (let index = 0; index < size; index += 1) buffer[index] = byte++ % 256;
      return buffer;
    },
  });
}

class MemoryPairingStore implements PairingMetadataStore {
  private metadata: PairingMetadata | null = null;
  async getPairing() { return this.metadata && structuredClone(this.metadata); }
  async savePairing(metadata: PairingMetadata) { this.metadata = structuredClone(metadata); }
  async clearPairing() { this.metadata = null; }
}
