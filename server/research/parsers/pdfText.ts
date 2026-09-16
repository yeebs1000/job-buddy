export interface LoadedPdfText {
  pageCount: number;
  pages: string[];
  attachments: string[];
}

export type PdfTextLoader = (bytes: Uint8Array) => Promise<LoadedPdfText>;

export async function extractPdfText(bytes: Uint8Array, options: {
  sourceUrl: string;
  allowedHostname: string;
  loader?: PdfTextLoader;
}): Promise<string> {
  const source = new URL(options.sourceUrl);
  if (source.protocol !== "https:" || source.hostname !== options.allowedHostname || source.username || source.password) throw new Error("pdf-host-not-allowed");
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error("pdf-too-large");
  const loaded = await (options.loader ?? loadPdfSafely)(bytes);
  if (loaded.pageCount > 500 || loaded.pages.length > 500) throw new Error("pdf-too-many-pages");
  if (loaded.attachments.length) throw new Error("pdf-attachments-not-supported");
  if (loaded.pages.length !== loaded.pageCount) throw new Error("pdf-page-count-mismatch");
  return loaded.pages.join("\n\n");
}

async function loadPdfSafely(bytes: Uint8Array): Promise<LoadedPdfText> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parameters = {
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableAutoFetch: true,
    disableStream: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0];
  const loadingTask = pdfjs.getDocument(parameters);
  const document = await loadingTask.promise;
  try {
    if (document.numPages > 500) return { pageCount: document.numPages, pages: [], attachments: [] };
    const attachments = await document.getAttachments();
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      pages.push(content.items.flatMap((item) => "str" in item ? [item.str] : []).join(" "));
      page.cleanup();
    }
    return { pageCount: document.numPages, pages, attachments: attachments ? Object.keys(attachments) : [] };
  } finally {
    await document.destroy();
  }
}
