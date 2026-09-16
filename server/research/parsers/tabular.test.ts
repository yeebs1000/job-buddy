// @vitest-environment node
import { expect, it } from "vitest";
import { createZipFixture, parseBoundedZip, parseDelimitedText } from "./tabular";

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

it("rejects tables beyond the row or column boundary", () => {
  expect(() => parseDelimitedText(Array.from({ length: 100_002 }, () => "a").join("\n"), "\t")).toThrow("table-too-large");
  expect(() => parseDelimitedText(`${Array.from({ length: 101 }, (_, index) => `h${index}`).join("\t")}\nrow`, "\t")).toThrow("table-too-large");
});
