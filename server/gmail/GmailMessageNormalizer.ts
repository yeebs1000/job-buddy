import { isSafeExternalHttpsUrl } from "../../src/domain/jobUrl";
import type { MailEnvelope } from "../../src/integrations/mail/MailAdapter";
import type { GmailMessage, GmailMessagePart } from "./gmailTypes";

const maxDepth = 12;
const maxDecodedBytes = 1_000_000;
const maxExcerptCharacters = 600;
const maxLinks = 10;

interface Traversal {
  plain: string[];
  html: string[];
  linkSources: string[];
  decodedBytes: number;
  invalid: boolean;
}

function decodeBase64url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value) || value.length % 4 === 1) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

function traverse(part: GmailMessagePart, depth: number, traversal: Traversal): void {
  if (traversal.invalid) return;
  if (depth > maxDepth) {
    traversal.invalid = true;
    return;
  }

  const mimeType = part.mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  if ((mimeType === "text/plain" || mimeType === "text/html") && part.body?.data !== undefined) {
    if (typeof part.body.size === "number" && part.body.size > maxDecodedBytes) {
      traversal.invalid = true;
      return;
    }
    const decoded = decodeBase64url(part.body.data);
    if (!decoded || traversal.decodedBytes + decoded.byteLength > maxDecodedBytes) {
      traversal.invalid = true;
      return;
    }
    traversal.decodedBytes += decoded.byteLength;
    const text = decoded.toString("utf8");
    if (text.includes("\uFFFD")) {
      traversal.invalid = true;
      return;
    }
    traversal.linkSources.push(text);
    (mimeType === "text/plain" ? traversal.plain : traversal.html).push(text);
  }

  if (part.parts) {
    for (const child of part.parts) traverse(child, depth + 1, traversal);
  }
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      const point = Number.parseInt(lower.slice(2), 16);
      return Number.isInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    if (lower.startsWith("#")) {
      const point = Number.parseInt(lower.slice(1), 10);
      return Number.isInteger(point) && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return named[lower] ?? entity;
  });
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<!--[^]*?(?:-->|$)/g, " ")
    .replace(/<(script|style)\b[^>]*>[^]*?(?:<\/\1\s*>|$)/gi, " ")
    .replace(/<(?:br\b[^>]*|\/(?:div|p|tr)\s*)>/gi, "\n")
    .replace(/<(?:div|p|tr)\b[^>]*>/gi, "")
    .replace(/<[^>]*>/g, " "));
}

function forwardedContent(text: string, subject: string): { text: string; forwarded?: MailEnvelope["forwarded"] } {
  // Only unwrap explicit forwards, never ordinary reply history. Quoted sender
  // identities remain unverified display context and do not replace Gmail headers.
  if (!/^\s*(?:fw|fwd):/i.test(subject) && !/^-+\s*Forwarded message\s*-+|^Begin forwarded message:/im.test(text)) return { text };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex(line => /^\s*From:\s*.+@/i.test(line));
  if (start < 0) return { text };
  const fields = new Map<string, string>();
  let lastField = "";
  let end = start;
  for (; end < lines.length; end++) {
    const line = lines[end];
    const field = /^\s*(From|Sent|Date|To|Cc|Bcc|Subject):\s*(.*)$/i.exec(line);
    if (field) { lastField = field[1].toLowerCase(); fields.set(lastField, field[2]); }
    else if (!line.trim()) {
      // HTML may separate header rows with blank lines. A blank line followed
      // by non-header text ends the block, even when the body is indented.
      while (end + 1 < lines.length && !lines[end + 1].trim()) end++;
      if (!/^\s*(?:From|Sent|Date|To|Cc|Bcc|Subject):/i.test(lines[end + 1] ?? "") && fields.has("subject") && fields.has("to")) { end++; break; }
    }
    else if (/^[\t ]+\S/.test(line) && lastField) fields.set(lastField, `${fields.get(lastField)} ${line.trim()}`);
    else break;
  }
  const from = sender(fields.get("from") ?? "");
  if (!from || !fields.has("subject") || !fields.has("to") || (!fields.has("date") && !fields.has("sent"))) return { text };
  const body = lines.slice(end).join("\n").trim();
  if (!body) return { text };
  return { text: body, forwarded: { fromAddress: from.fromAddress.slice(0, 320), subject: normalizeWhitespace(fields.get("subject")!).slice(0, 300) } };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function excerpt(value: string): string {
  return Array.from(normalizeWhitespace(value)).slice(0, maxExcerptCharacters).join("");
}

function header(part: GmailMessagePart, name: string): string | null {
  const found = part.headers?.find((candidate) => candidate.name?.toLowerCase() === name.toLowerCase());
  return typeof found?.value === "string" ? normalizeWhitespace(found.value) : null;
}

function sender(value: string): Pick<MailEnvelope, "fromName" | "fromAddress"> | null {
  const angle = value.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>$/);
  const address = (angle?.[2] ?? value.match(/[^\s<>]+@[^\s<>]+/)?.[0])?.replace(/[>,;]+$/g, "").toLowerCase();
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  const name = angle?.[1].trim().replace(/^['"]|['"]$/g, "");
  return { fromAddress: address, ...(name ? { fromName: name } : {}) };
}

function receivedAt(internalDate: string): string | null {
  if (!/^\d+$/.test(internalDate)) return null;
  const milliseconds = Number(internalDate);
  if (!Number.isFinite(milliseconds)) return null;
  try {
    const iso = new Date(milliseconds).toISOString();
    return Date.parse(iso) === milliseconds ? iso : null;
  } catch {
    return null;
  }
}

function links(sources: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const decoded = decodeEntities(source);
    for (const match of decoded.matchAll(/https:\/\/[^\s<>"']+/gi)) {
      const candidate = match[0].replace(/[),.;:!?]+$/g, "");
      if (!seen.has(candidate) && isSafeExternalHttpsUrl(candidate)) {
        seen.add(candidate);
        result.push(candidate);
        if (result.length === maxLinks) return result;
      }
    }
  }
  return result;
}

export function normalizeGmailMessage(message: GmailMessage): MailEnvelope | null {
  if (!message.id || !message.payload || !message.internalDate) return null;
  const from = header(message.payload, "From");
  const subject = header(message.payload, "Subject");
  const parsedSender = from ? sender(from) : null;
  const timestamp = receivedAt(message.internalDate);
  if (!parsedSender || !subject || !timestamp) return null;

  const traversal: Traversal = { plain: [], html: [], linkSources: [], decodedBytes: 0, invalid: false };
  traverse(message.payload, 0, traversal);
  if (traversal.invalid) return null;
  const evidence = traversal.plain.length
    ? traversal.plain.join(" ")
    : traversal.html.map(htmlToText).join(" ");
  const content = forwardedContent(evidence, subject);
  const boundedExcerpt = excerpt(content.text);
  if (!boundedExcerpt) return null;

  return {
    providerMessageId: message.id,
    ...(message.threadId ? { threadId: message.threadId } : {}),
    ...parsedSender,
    subject,
    receivedAt: timestamp,
    excerpt: boundedExcerpt,
    ...(content.forwarded ? { forwarded: content.forwarded } : {}),
    links: links(traversal.linkSources),
  };
}
