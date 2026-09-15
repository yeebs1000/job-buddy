import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SecretKey, SecretStore } from "./SecretStore";

export interface CommandRunner {
  run(input: { executable: string; args: string[]; stdin: string }): Promise<{ stdout: string }>;
}

export interface WindowsDpapiSecretStoreOptions {
  root?: string;
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
}

const protectScript = `Add-Type -AssemblyName System.Security;[Console]::InputEncoding=[Text.Encoding]::UTF8;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());$p=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;
const unprotectScript = `Add-Type -AssemblyName System.Security;[Console]::InputEncoding=[Text.Encoding]::UTF8;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;

function encodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function defaultRoot(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable");
  return join(localAppData, "JobBuddy");
}

class SpawnCommandRunner implements CommandRunner {
  async run({ executable, args, stdin }: { executable: string; args: string[]; stdin: string }): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.once("error", () => reject(new Error("DPAPI helper could not start")));
      child.once("exit", (code) => code === 0 ? resolve({ stdout }) : reject(new Error("DPAPI helper failed")));
      child.stdin.end(stdin);
    });
  }
}

function decodeBase64(value: string, label: string): Buffer {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw new Error(`Invalid ${label} response`);
  return Buffer.from(normalized, "base64");
}

export class WindowsDpapiSecretStore implements SecretStore {
  readonly tokenPath: string;
  private readonly runner: CommandRunner;
  private readonly platform: NodeJS.Platform;

  constructor(options: WindowsDpapiSecretStoreOptions = {}) {
    const root = options.root ?? defaultRoot();
    this.tokenPath = join(root, "secrets", "gmail-refresh-token.bin");
    this.runner = options.runner ?? new SpawnCommandRunner();
    this.platform = options.platform ?? process.platform;
  }

  isSupported(): boolean {
    return this.platform === "win32";
  }

  async get(key: SecretKey): Promise<string | null> {
    this.assertSupported();
    this.assertKey(key);
    let protectedBytes: Buffer;
    try {
      protectedBytes = await readFile(this.tokenPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("Protected Gmail credential could not be read");
    }
    const { stdout } = await this.runDpapi("unprotect", protectedBytes.toString("base64"));
    return decodeBase64(stdout, "DPAPI").toString("utf8");
  }

  async set(key: SecretKey, value: string): Promise<void> {
    this.assertSupported();
    this.assertKey(key);
    if (!value) throw new Error("Refresh token cannot be empty");
    const { stdout } = await this.runDpapi("protect", Buffer.from(value, "utf8").toString("base64"));
    const protectedBytes = decodeBase64(stdout, "DPAPI");
    const directory = dirname(this.tokenPath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.tokenPath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(protectedBytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, this.tokenPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async delete(key: SecretKey): Promise<void> {
    this.assertSupported();
    this.assertKey(key);
    await rm(this.tokenPath, { force: true });
  }

  private assertSupported(): void {
    if (!this.isSupported()) throw new Error("Windows current-user DPAPI is required for persistent Gmail credentials");
  }

  private assertKey(key: SecretKey): void {
    if (key !== "gmail-refresh-token") throw new Error("Unsupported secret key");
  }

  private runDpapi(operation: "protect" | "unprotect", stdin: string): Promise<{ stdout: string }> {
    const command = operation === "protect" ? protectScript : unprotectScript;
    return this.runner.run({
      executable: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(command)],
      stdin,
    });
  }
}
