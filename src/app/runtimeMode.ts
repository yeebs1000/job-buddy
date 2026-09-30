export function readRuntimeMode(value: unknown): "companion" | "web" {
  if (value === undefined || value === "companion") return "companion";
  if (value === "web") return "web";
  throw new Error("Invalid Job Buddy runtime mode. Choose companion or web.");
}

export const isWebMode = readRuntimeMode(import.meta.env.VITE_APP_MODE ?? (import.meta.env.MODE === "web" ? "web" : undefined)) === "web";
