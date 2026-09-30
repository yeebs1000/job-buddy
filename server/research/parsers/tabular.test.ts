// @vitest-environment node
import { expect, it } from "vitest";
import { createZipFixture, parseBoundedZip, parseDelimitedText } from "./tabular";

it.each(["counts", "directory-size", "local-size", "forged-sizes", "multi-disk", "truncated", "method"])("rejects %s archive metadata before extraction", (kind) => {
  const archive = createZipFixture({ "one.txt": "hello".repeat(100), "two.txt": "world" });
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const end = archive.length - 22;
  const central = view.getUint32(end + 16, true);
  if (kind === "counts") view.setUint16(end + 10, 1, true);
  if (kind === "directory-size") view.setUint32(end + 12, 1, true);
  if (kind === "local-size") view.setUint32(22, 1, true);
  if (kind === "forged-sizes") { view.setUint32(22, 1, true); view.setUint32(central + 24, 1, true); }
  if (kind === "multi-disk") view.setUint16(end + 4, 1, true);
  if (kind === "method") view.setUint16(8, 99, true);
  expect(() => parseBoundedZip(kind === "truncated" ? archive.subarray(0, archive.length - 1) : archive)).toThrow();
});

it("parses a bounded tab-delimited table", () => {
  expect(parseDelimitedText("A\tB\n1\t2\n3\t4", "\t")).toEqual([
    { A: "1", B: "2" },
    { A: "3", B: "4" },
  ]);
});

it("extracts a safe archive", () => {
  const archive = createZipFixture({ "oes.txt": "A\tB\n1\t2" });
  const parsed = parseBoundedZip(archive);
  expect([...parsed.keys()]).toEqual(["oes.txt"]);
  expect(new TextDecoder().decode(parsed.get("oes.txt"))).toContain("A\tB");
});

it("rejects encrypted, traversing, excessive, or suspiciously compressed archives", () => {
  const encrypted = createZipFixture({ "oes.txt": "safe" });
  encrypted[6] |= 1;
  expect(() => parseBoundedZip(encrypted)).toThrow("zip-encryption-not-supported");
  expect(() => parseBoundedZip(createZipFixture({ "../evil.txt": "bad" }))).toThrow("zip-path-not-allowed");
  const many = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`${index}.txt`, "x"]));
  expect(() => parseBoundedZip(createZipFixture(many))).toThrow("zip-too-many-entries");
  expect(() => parseBoundedZip(createZipFixture({ "bomb.txt": new Uint8Array(200_000) }, 9))).toThrow("zip-compression-ratio-too-high");
});

it("rejects ZIP64 markers before decompression", () => {
  const archive = createZipFixture({ "oes.txt": "safe" });
  const eocd = findSignature(archive, [0x50, 0x4b, 0x05, 0x06]);
  archive[eocd + 10] = 0xff; archive[eocd + 11] = 0xff;
  expect(() => parseBoundedZip(archive)).toThrow("zip64-not-supported");
});

it("rejects tables beyond the row or column boundary", () => {
  expect(() => parseDelimitedText(Array.from({ length: 100_002 }, () => "a").join("\n"), "\t")).toThrow("table-too-large");
  expect(() => parseDelimitedText(`${Array.from({ length: 101 }, (_, index) => `h${index}`).join("\t")}\nrow`, "\t")).toThrow("table-too-large");
});

function findSignature(bytes: Uint8Array, signature: number[]): number {
  for (let index = bytes.length - signature.length; index >= 0; index -= 1) {
    if (signature.every((value, offset) => bytes[index + offset] === value)) return index;
  }
  throw new Error("signature-not-found");
}
