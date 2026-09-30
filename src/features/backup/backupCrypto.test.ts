// @vitest-environment node
import { expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "./backupCrypto";

const password = "synthetic backup passphrase";
it("opens a multi-megabyte backup without exhausting the regular expression stack", async () => {
  const data = { text: "x".repeat(3 * 1024 * 1024) };
  expect(await decryptBackup(await encryptBackup(data, password), password)).toEqual(data);
});
it("round-trips data without exposing plaintext in the portable file", async () => {
  const bytes = await encryptBackup({ marker: "private fixture" }, password);
  expect(new TextDecoder().decode(bytes)).not.toContain("private fixture");
  expect(await decryptBackup(bytes, password)).toEqual({ marker: "private fixture" });
  await expect(decryptBackup(bytes, "incorrect")).rejects.toThrow();
});
it("rejects changed ciphertext and unrecognized envelope parameters", async () => {
  const bytes = await encryptBackup({ value: 7 }, password);
  const envelope = JSON.parse(new TextDecoder().decode(bytes));
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  await expect(decryptBackup(encode({ ...envelope, version: 2 }), password)).rejects.toThrow();
  await expect(decryptBackup(encode({ ...envelope, iterations: 1_000_000_000 }), password)).rejects.toThrow();
  await expect(decryptBackup(encode({ ...envelope, ciphertext: "AAAA" + envelope.ciphertext.slice(4) }), password)).rejects.toThrow();
});
it("bounds file and password inputs before expensive cryptography", async () => {
  await expect(decryptBackup(new Uint8Array(50 * 1024 * 1024 + 1), password)).rejects.toThrow(/large/i);
  await expect(decryptBackup(new Uint8Array([123]), password)).rejects.toThrow();
  await expect(encryptBackup({}, "short")).rejects.toThrow(/12/);
  await expect(encryptBackup({}, "a".repeat(1025))).rejects.toThrow();
});
