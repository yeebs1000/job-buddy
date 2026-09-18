import { describe, expect, it } from "vitest";
import { strToU8 as encode, zipSync } from "fflate";
import { extractDocxText, validateResumeFile } from "./resumeText";
// TextEncoder belongs to Node's realm in JSDOM; ZIP input must use the test realm.
const strToU8 = (value: string) => new Uint8Array(encode(value));

const document = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alex Chen</w:t></w:r></w:p><w:p><w:r><w:t>alex@example.com</w:t></w:r></w:p></w:body></w:document>';
describe("local resume files", () => {
  it("extracts Word text without rendering markup or following relationships", () => {
    const bytes = zipSync({ "word/document.xml": strToU8(document), "word/_rels/document.xml.rels": strToU8('<Relationships Target="https://example.com/private"/>') });
    expect(extractDocxText(bytes)).toBe("Alex Chen\nalex@example.com");
  });
  it("includes header contact details", () => {
    const bytes = zipSync({ "word/document.xml": strToU8(document), "word/header1.xml": strToU8(document.replace("Alex Chen", "Header Name")) });
    expect(extractDocxText(bytes)).toContain("Header Name");
  });
  it("rejects invalid, active-content and oversized archives", () => {
    expect(() => extractDocxText(new Uint8Array([1, 2]))).toThrow();
    expect(() => extractDocxText(zipSync({ "word/document.xml": strToU8(document), "word/vbaProject.bin": new Uint8Array([1]) }))).toThrow(/macro/i);
    expect(() => extractDocxText(zipSync({ "word/document.xml": strToU8(document.replace("Alex Chen", "A".repeat(5_000_001))) }))).toThrow(/large/i);
    expect(() => extractDocxText(zipSync({ "word/document.xml": strToU8('<!DOCTYPE test><broken>') }))).toThrow();
  });
  it("rejects unsupported formats, empty files and files above 5 MB", () => {
    expect(() => validateResumeFile({ name: "resume.doc", size: 12 })).toThrow(/PDF or DOCX/);
    expect(() => validateResumeFile({ name: "resume.pdf", size: 0 })).toThrow(/empty/);
    expect(() => validateResumeFile({ name: "resume.pdf", size: 6_000_000 })).toThrow(/5 MB/);
  });
});
