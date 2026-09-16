// Each caller constructs a URL from a fixed provider origin and validated identifiers.
export async function fetchPublicJson(url: string, fetcher: typeof fetch = fetch, maximumBytes = 4_000_000): Promise<unknown> {
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(response.status === 429 ? "provider-rate-limited" : "provider-unavailable");
  if (Number(response.headers.get("content-length")) > maximumBytes) throw new Error("provider-response-too-large");
  if (!response.body) throw new Error("provider-empty-response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) throw new Error("provider-response-too-large");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
