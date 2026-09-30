import { expect, it, vi } from "vitest";
import { extractPdfText } from "./pdfText";

it("extracts page text in document order with active PDF features disabled by the loader boundary", async () => {
  const loader = vi.fn().mockResolvedValue({ pageCount: 2, pages: ["Page one", "Page two"], attachments: [] });
  await expect(extractPdfText(new Uint8Array([1, 2, 3]), {
    sourceUrl: "https://www.censtatd.gov.hk/report.pdf",
    allowedHostname: "www.censtatd.gov.hk",
    loader,
  })).resolves.toBe("Page one\n\nPage two");
});

it("rejects non-allowlisted hosts, oversized files, too many pages, and attachments", async () => {
  const safeLoader = vi.fn().mockResolvedValue({ pageCount: 1, pages: ["safe"], attachments: [] });
  await expect(extractPdfText(new Uint8Array([1]), { sourceUrl: "https://evil.example/report.pdf", allowedHostname: "www.censtatd.gov.hk", loader: safeLoader })).rejects.toThrow("pdf-host-not-allowed");
  await expect(extractPdfText(new Uint8Array(25 * 1024 * 1024 + 1), { sourceUrl: "https://www.censtatd.gov.hk/report.pdf", allowedHostname: "www.censtatd.gov.hk", loader: safeLoader })).rejects.toThrow("pdf-too-large");
  await expect(extractPdfText(new Uint8Array([1]), { sourceUrl: "https://www.censtatd.gov.hk/report.pdf", allowedHostname: "www.censtatd.gov.hk", loader: vi.fn().mockResolvedValue({ pageCount: 501, pages: [], attachments: [] }) })).rejects.toThrow("pdf-too-many-pages");
  await expect(extractPdfText(new Uint8Array([1]), { sourceUrl: "https://www.censtatd.gov.hk/report.pdf", allowedHostname: "www.censtatd.gov.hk", loader: vi.fn().mockResolvedValue({ pageCount: 1, pages: ["safe"], attachments: ["payload"] }) })).rejects.toThrow("pdf-attachments-not-supported");
});
