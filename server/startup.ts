export function companionListenError(error: unknown, port: number): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return code === "EADDRINUSE"
    ? `Job Buddy could not start because port ${port} is already in use. Close the other Job Buddy companion, then retry npm.cmd run dev.`
    : "Job Buddy could not start its local companion. Retry npm.cmd run dev.";
}
