import { z } from "zod";

export const backupByteLimit = 50 * 1024 * 1024;
const iterations = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const aad = encoder.encode("job-buddy:portable-backup:v1");
const envelopeSchema = z.object({
  format: z.literal("job-buddy"), version: z.literal(1),
  kdf: z.literal("PBKDF2-SHA256"), iterations: z.literal(iterations),
  salt: z.string().length(24), iv: z.string().length(16),
  ciphertext: z.string().min(24).max(backupByteLimit),
}).strict();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Invalid backup encoding.");
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (base64(bytes) !== value) throw new Error("Invalid backup encoding.");
  return bytes;
}
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations, salt }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBackup(payload: unknown, passphrase: string): Promise<Uint8Array<ArrayBuffer>> {
  if (passphrase.length < 12 || passphrase.length > 1024) throw new Error("Use a backup passphrase of 12–1024 characters.");
  const json = JSON.stringify(payload);
  if (json === undefined) throw new Error("Invalid backup payload.");
  const plaintext = encoder.encode(json);
  // Base64 overhead is part of the portable file limit.
  if (plaintext.byteLength > Math.floor((backupByteLimit - 1024) * 3 / 4)) throw new Error("Backup is too large.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, await derive(passphrase, salt), plaintext);
  return encoder.encode(JSON.stringify({ format: "job-buddy", version: 1, kdf: "PBKDF2-SHA256", iterations, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }));
}

export async function decryptBackup(bytes: Uint8Array, passphrase: string): Promise<unknown> {
  if (bytes.byteLength > backupByteLimit) throw new Error("Backup is too large (maximum 50 MiB).");
  if (!passphrase || passphrase.length > 1024) throw new Error("Enter the backup passphrase.");
  const envelope = envelopeSchema.parse(JSON.parse(decoder.decode(bytes)));
  const salt = unbase64(envelope.salt), iv = unbase64(envelope.iv), ciphertext = unbase64(envelope.ciphertext);
  if (salt.byteLength !== 16 || iv.byteLength !== 12 || ciphertext.byteLength < 16) throw new Error("Invalid backup envelope.");
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, await derive(passphrase, salt), ciphertext);
    if (plaintext.byteLength > backupByteLimit) throw new Error("Backup is too large.");
    return JSON.parse(decoder.decode(plaintext));
  } catch { throw new Error("Could not open backup. Check the passphrase and that the file is intact."); }
}
