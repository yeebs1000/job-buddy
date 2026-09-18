import { inflateSync } from "fflate";

export interface ZipLimits { compressed: number; uncompressed: number; entries: number; ratio: number; ratioMinimum?: number }

// Parse one canonical single-disk directory, then decode into fixed-size buffers.
// Never trust advertised lengths to let a decompressor grow its output buffer.
export function readBoundedZip(bytes: Uint8Array, limits: ZipLimits): Map<string, Uint8Array> {
  const fail = (code = "invalid-zip"): never => { throw new Error(code); };
  if (bytes.length > limits.compressed) fail("zip-compressed-too-large");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail();
  const count = view.getUint16(end + 10, true);
  const diskCount = view.getUint16(end + 8, true);
  const size = view.getUint32(end + 12, true);
  const directory = view.getUint32(end + 16, true);
  if (count === 65535 || diskCount === 65535 || size === 0xffffffff || directory === 0xffffffff) fail("zip64-not-supported");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || diskCount !== count || directory + size !== end) fail();
  if (count > limits.entries) fail("zip-too-many-entries");
  const entries: { name: string; start: number; compressed: number; length: number; method: number }[] = [];
  const names = new Set<string>();
  let at = directory;
  let localEnd = 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) fail();
    const flags = view.getUint16(at + 8, true), method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true), length = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    if ([compressed, length, local].includes(0xffffffff)) fail("zip64-not-supported");
    if (flags & 1) fail("zip-encryption-not-supported");
    if (flags & ~0x080e || ![0, 8].includes(method) || view.getUint16(at + 34, true)) fail();
    if (at + 46 + nameLength + extra + comment > end || local !== localEnd || local + 30 > directory || view.getUint32(local, true) !== 0x04034b50) fail();
    const localFlags = view.getUint16(local + 6, true);
    if (localFlags & 1) fail("zip-encryption-not-supported");
    if (localFlags !== flags || view.getUint16(local + 8, true) !== method || view.getUint16(local + 26, true) !== nameLength) fail();
    const start = local + 30 + nameLength + view.getUint16(local + 28, true);
    if (start + compressed > directory) fail();
    const rawName = bytes.subarray(at + 46, at + 46 + nameLength);
    if (!rawName.every((value, j) => value === bytes[local + 30 + j])) fail();
    const name = new TextDecoder("utf-8", { fatal: true }).decode(rawName).replaceAll("\\", "/");
    if (!name || name.includes("\0") || name.startsWith("/") || name.split("/").includes("..") || /^[A-Za-z]:/.test(name)) fail("zip-path-not-allowed");
    if (names.has(name)) fail();
    names.add(name);
    localEnd = start + compressed;
    if (flags & 8) {
      const signed = localEnd + 4 <= directory && view.getUint32(localEnd, true) === 0x08074b50;
      const descriptor = localEnd + (signed ? 4 : 0);
      if (descriptor + 12 > directory || view.getUint32(descriptor, true) !== view.getUint32(at + 16, true) || view.getUint32(descriptor + 4, true) !== compressed || view.getUint32(descriptor + 8, true) !== length) fail();
      localEnd = descriptor + 12;
    } else if (view.getUint32(local + 14, true) !== view.getUint32(at + 16, true) || view.getUint32(local + 18, true) !== compressed || view.getUint32(local + 22, true) !== length) fail();
    total += length;
    if (total > limits.uncompressed) fail("zip-uncompressed-too-large");
    if (length > (limits.ratioMinimum ?? 0) && length > Math.max(1, compressed) * limits.ratio) fail("zip-compression-ratio-too-high");
    if (method === 0 && compressed !== length) fail();
    entries.push({ name, start, compressed, length, method });
    at += 46 + nameLength + extra + comment;
  }
  if (at !== end || localEnd !== directory) fail();
  const result = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const input = bytes.subarray(entry.start, entry.start + entry.compressed);
    // The sentinel byte distinguishes forged undersized metadata from exact output.
    const data = entry.method === 0 ? input.slice() : inflateSync(input, { out: new Uint8Array(entry.length + 1) });
    if (data.length !== entry.length) fail("zip-size-mismatch");
    result.set(entry.name, data);
  }
  return result;
}
