interface RequestEmitter {
  on(event: "request", listener: RequestListener): unknown;
  off(event: "request", listener: RequestListener): unknown;
}

type RequestListener = (request: { url?: string }, response: { statusCode: number; once(event: "finish", callback: () => void): unknown }) => void;

export function waitForHttpFinish(server: RequestEmitter, path: string, expectedStatus: number, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const observed: number[] = [];
    const finish = (error?: Error) => {
      clearTimeout(timer);
      server.off("request", listener);
      if (error) reject(error); else resolve();
    };
    const listener: RequestListener = (request, response) => {
      if (request.url !== path) return;
      response.once("finish", () => {
        observed.push(response.statusCode);
        finish(response.statusCode === expectedStatus ? undefined : new Error(`${path} expected ${expectedStatus} but finished ${response.statusCode}`));
      });
    };
    const timer = setTimeout(() => finish(new Error(`${path} did not finish within ${timeoutMs}ms; observed statuses: ${observed.join(",") || "none"}`)), timeoutMs);
    server.on("request", listener);
  });
}
