// @vitest-environment node
import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readBoundedZip } from "./boundedZip";

const limits = { compressed: 4096, uncompressed: 64, entries: 3, ratio: 100 };

it("rejects prototype-reserved entry names before rebuilding the validated archive", () => {
  const bytes = zipSync({ "entry.bin": strToU8("safe") });
  const view = new DataView(bytes.buffer);
  const central = view.getUint32(bytes.length - 6, true);
  bytes.set(strToU8("__proto__"), 30);
  bytes.set(strToU8("__proto__"), central + 46);
  expect(() => readBoundedZip(bytes, limits)).toThrow("zip-path-not-allowed");
});

it("enforces total output budget and fixed-buffer overflow with small fixtures", () => {
  const bytes = zipSync({ "a": strToU8("a".repeat(40)), "b": strToU8("b".repeat(40)) });
  expect(() => readBoundedZip(bytes, limits)).toThrow("zip-uncompressed-too-large");
  const forged = zipSync({ "a": strToU8("a".repeat(2048)) });
  const view = new DataView(forged.buffer);
  const central = view.getUint32(forged.length - 6, true);
  view.setUint32(22, 16, true);
  view.setUint32(central + 24, 16, true);
  expect(() => readBoundedZip(forged, limits)).toThrow("zip-size-mismatch");
});

it("rejects local data and central directory entries outside their bounds", () => {
  for (const kind of ["local", "name", "offset"]) {
    const bytes = zipSync({ "a": strToU8("data") });
    const view = new DataView(bytes.buffer);
    const central = view.getUint32(bytes.length - 6, true);
    if (kind === "local") { view.setUint32(18, 999, true); view.setUint32(central + 20, 999, true); }
    if (kind === "name") view.setUint16(central + 28, 65535, true);
    if (kind === "offset") view.setUint32(central + 42, central, true);
    expect(() => readBoundedZip(bytes, limits)).toThrow();
  }
});

it("supports stored files and signed streaming data descriptors", () => {
  const base = zipSync({ "a": strToU8("hello") }, { level: 0 });
  expect(new TextDecoder().decode(readBoundedZip(base, limits).get("a"))).toBe("hello");
  const original = new DataView(base.buffer);
  const central = original.getUint32(base.length - 6, true);
  const bytes = new Uint8Array(base.length + 16);
  bytes.set(base.subarray(0, central)); bytes.set(base.subarray(central), central + 16);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, 8, true); view.setUint16(central + 16 + 8, 8, true);
  view.setUint32(central, 0x08074b50, true);
  for (let i = 0; i < 3; i++) {
    view.setUint32(central + 4 + i * 4, original.getUint32(14 + i * 4, true), true);
    view.setUint32(14 + i * 4, 0, true);
  }
  view.setUint32(bytes.length - 6, central + 16, true);
  expect(new TextDecoder().decode(readBoundedZip(bytes, limits).get("a"))).toBe("hello");
});
