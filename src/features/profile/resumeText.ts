import { strFromU8, Unzip, UnzipInflate } from "fflate";

const maxFileBytes = 5 * 1024 * 1024;
const maxXmlBytes = 5_000_000;
const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

interface PdfTextItem { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }

export function reconstructPdfText(items: readonly (PdfTextItem | { type: string })[]): string {
  const rows: { y: number; height: number; items: PdfTextItem[] }[] = [];
  for (const item of items) {
    // Word emits empty EOL markers at the *next* baseline. They are not blank paragraphs.
    if (!("str" in item) || !item.str.trim()) continue;
    const y = item.transform[5];
    let row = rows.at(-1);
    if (!row || Math.abs(row.y - y) > 2) {
      row = { y, height: item.height || 10, items: [] };
      rows.push(row);
    }
    row.items.push(item);
    row.height = Math.max(row.height, item.height);
  }
  let text = "";
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (index) {
      const previous = rows[index - 1];
      text += Math.abs(previous.y - row.y) > Math.max(previous.height, row.height) * 1.8 ? "\n\n" : "\n";
    }
    let previous: PdfTextItem | undefined;
    for (const item of row.items.sort((a, b) => a.transform[4] - b.transform[4])) {
      if (previous) {
        const gap = item.transform[4] - (previous.transform[4] + previous.width);
        const height = Math.max(item.height, previous.height, 1);
        if (gap > height * 2) text += "\t";
        else if (gap > height * .15 && !/\s$/.test(previous.str) && !/^\s/.test(item.str)) text += " ";
      }
      text += item.str;
      previous = item;
      if (text.length > 100_000) throw new Error("PDF text is too large. Paste the relevant text instead.");
    }
  }
  return text.trim();
}

export function validateResumeFile(file: Pick<File, "name" | "size">): "pdf" | "docx" {
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (extension !== "pdf" && extension !== "docx") throw new Error("Choose a PDF or DOCX file, or paste your resume text below.");
  if (!file.size) throw new Error("This file is empty. Choose another file or paste resume text.");
  if (file.size > maxFileBytes) throw new Error("Choose a resume smaller than 5 MB, or paste the relevant text.");
  return extension;
}

function readable(text: string): string {
  if (!text.trim()) throw new Error("No readable text found. Scanned or image-only resumes need OCR elsewhere; paste their text below instead.");
  if (text.length > 100_000) throw new Error("Resume text is too large. Paste at most 100,000 characters instead.");
  return text.trim();
}

export function extractDocxText(bytes: Uint8Array): string {
  if (bytes.length > maxFileBytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("This is not a valid DOCX file.");
  const parts = new Map<string, string>();
  let count = 0;
  let expanded = 0;
  const seen = new Set<string>();
  const unzip = new Unzip((file) => {
    const name = file.name;
    if (++count > 1000 || seen.has(name) || name.includes("\\") || name.startsWith("/") || name.split("/").includes("..")) throw new Error("Invalid DOCX archive.");
    seen.add(name);
    if (/vbaproject|\.bin$/i.test(name)) throw new Error("Macro or embedded binary content is not supported. Export a plain DOCX or PDF.");
    if (!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)) return;
    if ((file.originalSize ?? 0) > maxXmlBytes) throw new Error("DOCX text is too large.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error("Could not decompress this DOCX file.");
      expanded += chunk.length;
      length += chunk.length;
      if (expanded > maxXmlBytes) throw new Error("DOCX text is too large.");
      chunks.push(chunk);
      if (!final) return;
      const data = new Uint8Array(length);
      let offset = 0;
      for (const item of chunks) { data.set(item, offset); offset += item.length; }
      const xml = strFromU8(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsupported XML declarations in this DOCX file.");
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.getElementsByTagName("parsererror").length) throw new Error("Could not read this DOCX file.");
      const paragraphs = Array.from(document.getElementsByTagNameNS(wordNamespace, "p"));
      const text = paragraphs.map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "*")).map((node) => {
        if (node.localName === "t") return node.textContent ?? "";
        if (node.localName === "tab") return "\t";
        if (node.localName === "br" || node.localName === "cr") return "\n";
        return "";
      }).join("")).join("\n");
      parts.set(name, text);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  // Small compressed chunks bound each decompression step, even if ZIP size headers lie.
  for (let offset = 0; offset < bytes.length; offset += 128) unzip.push(bytes.subarray(offset, offset + 128), offset + 128 >= bytes.length);
  if (!parts.has("word/document.xml")) throw new Error("DOCX document text is missing or incomplete.");
  const headers = [...parts].filter(([name]) => name.includes("/header")).map(([, text]) => text);
  const footers = [...parts].filter(([name]) => name.includes("/footer")).map(([, text]) => text);
  return readable([...headers, parts.get("word/document.xml"), ...footers].join("\n"));
}

export async function readResumeFile(file: File, signal: AbortSignal): Promise<string> {
  const format = validateResumeFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  if (format === "docx") return extractDocxText(bytes);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("This is not a valid PDF. Choose another file or paste text.");
  const pdfjs = await import("pdfjs-dist");
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).href;
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false, disableAutoFetch: true, disableStream: true });
  let timedOut = false;
  const cancel = () => { void task.destroy(); };
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 15_000);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const document = await task.promise;
    if (document.numPages > 20) throw new Error("Use a PDF with at most 20 pages, or paste the relevant text.");
    let text = "";
    for (let index = 1; index <= document.numPages; index++) {
      signal.throwIfAborted();
      const page = await document.getPage(index);
      try {
        const content = await page.getTextContent();
        text += reconstructPdfText(content.items) + "\n\n";
        if (text.length > 100_000) throw new Error("PDF text is too large. Paste the relevant text instead.");
      } finally { page.cleanup(); }
    }
    return readable(text);
  } catch (error) {
    signal.throwIfAborted();
    if (timedOut) throw new Error("PDF reading took too long. Try a simpler file or paste text.");
    if (error instanceof Error && /at most 20|too large|No readable/.test(error.message)) throw error;
    throw new Error("Could not read this PDF. It may be encrypted or damaged. Try another file or paste text.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
