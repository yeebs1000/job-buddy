import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";
import type { PairingMetadataStore } from "./BuddyStore";

export interface PairingServiceOptions {
  store: PairingMetadataStore;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}

interface PendingPairing {
  normalizedCode: string;
  expiresAt: number;
}

class PairingError extends Error {
  readonly code = "invalid-pairing";

  constructor() {
    super("Pairing could not be completed");
  }
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const extensionOriginPattern = /^chrome-extension:\/\/[a-p]{32}$/;

export class PairingService {
  private readonly store: PairingMetadataStore;
  private readonly now: () => number;
  private readonly randomBytes: (size: number) => Buffer;
  private pending: PendingPairing | null = null;

  constructor(options: PairingServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
  }

  start(): { code: string; expiresAt: string } {
    const normalizedCode = this.generateCode(10);
    const expiresAt = this.now() + 5 * 60_000;
    this.pending = { normalizedCode, expiresAt };
    return { code: `${normalizedCode.slice(0, 5)}-${normalizedCode.slice(5)}`, expiresAt: new Date(expiresAt).toISOString() };
  }

  async complete(input: { code: string; origin: string }): Promise<{ token: string }> {
    const pending = this.pending;
    if (!pending || pending.expiresAt < this.now() || !extensionOriginPattern.test(input.origin)) {
      if (pending && pending.expiresAt < this.now()) this.pending = null;
      throw new PairingError();
    }
    const normalizedInput = input.code.replace(/-/g, "").trim().toUpperCase();
    if (!secureEqual(normalizedInput, pending.normalizedCode)) throw new PairingError();
    this.pending = null;
    const token = this.randomBytes(32).toString("base64url");
    await this.store.savePairing({
      origin: input.origin,
      tokenHash: hashToken(token),
      pairedAt: new Date(this.now()).toISOString(),
    });
    return { token };
  }

  async authorize(token: string, origin: string): Promise<boolean> {
    if (!extensionOriginPattern.test(origin) || !token) return false;
    const metadata = await this.store.getPairing();
    return Boolean(metadata && metadata.origin === origin && secureEqual(hashToken(token), metadata.tokenHash));
  }

  async revoke(): Promise<void> {
    this.pending = null;
    await this.store.clearPairing();
  }

  async status(): Promise<{ paired: false } | { paired: true; origin: string; pairedAt: string }> {
    const metadata = await this.store.getPairing();
    return metadata ? { paired: true, origin: metadata.origin, pairedAt: metadata.pairedAt } : { paired: false };
  }

  private generateCode(length: number): string {
    let result = "";
    const ceiling = Math.floor(256 / alphabet.length) * alphabet.length;
    while (result.length < length) {
      for (const byte of this.randomBytes(16)) {
        if (byte >= ceiling) continue;
        result += alphabet[byte % alphabet.length];
        if (result.length === length) break;
      }
    }
    return result;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
