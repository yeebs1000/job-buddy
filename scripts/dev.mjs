import { spawn } from "node:child_process";

const npmEntryPoint = process.env.npm_execpath;
if (!npmEntryPoint) throw new Error("Start development with npm run dev");
const children = ["dev:web", "dev:server"].map((script) => spawn(
  process.execPath,
  [npmEntryPoint, "run", script],
  {
    stdio: "inherit",
    env: { ...process.env, ...(script === "dev:server" ? { JOB_BUDDY_UI_ORIGIN: "http://127.0.0.1:5173" } : {}) },
  },
));

let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(signal));
}

for (const child of children) {
  child.once("error", () => {
    process.exitCode = 1;
    stop();
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      process.exitCode = code ?? (signal ? 1 : 0);
      stop();
    }
  });
}
