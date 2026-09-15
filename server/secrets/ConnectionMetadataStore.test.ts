import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConnectionMetadataStore } from "./ConnectionMetadataStore";

describe("ConnectionMetadataStore", () => {
  let root: string;

  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "job-buddy-connection-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("round-trips only validated non-secret connection metadata", async () => {
    const store = new ConnectionMetadataStore(root);
    const metadata = {
      accountEmail: "graduate@example.com",
      connectedAt: "2026-09-15T08:00:00.000Z",
      state: "connected" as const,
    };

    await store.set(metadata);

    expect(await store.get()).toEqual(metadata);
    expect(await readFile(store.path, "utf8")).not.toMatch(/token|secret/i);
  });

  it("treats malformed or invalid metadata as disconnected without exposing its content", async () => {
    const store = new ConnectionMetadataStore(root);
    await writeFile(store.path, '{"accountEmail":"not-an-email","refreshToken":"secret"}', "utf8");

    await expect(store.get()).resolves.toBeNull();
  });

  it("deletes missing metadata idempotently", async () => {
    const store = new ConnectionMetadataStore(root);
    await expect(store.delete()).resolves.toBeUndefined();
  });
});
