import { spawn } from "node:child_process";

export interface CommandRunner {
  run(input: { executable: string; args: string[]; stdin: string }): Promise<{ stdout: string }>;
}

export interface WindowsDpapiOptions {
  runner?: CommandRunner;
  platform?: NodeJS.Platform;
}

const protectScript = `Add-Type -AssemblyName System.Security;[Console]::InputEncoding=[Text.Encoding]::UTF8;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());$p=[System.Security.Cryptography.ProtectedData]::Protect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;
const unprotectScript = `Add-Type -AssemblyName System.Security;[Console]::InputEncoding=[Text.Encoding]::UTF8;$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());$p=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;

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

export class DpapiUnavailableError extends Error {
  readonly code = "platform-unsupported";

  constructor() {
    super("Windows current-user DPAPI is unavailable");
  }
}

function encodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function decodeBase64(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) throw new Error("Invalid DPAPI response");
  return Buffer.from(normalized, "base64");
}

export class WindowsDpapi {
  private readonly runner: CommandRunner;
  private readonly platform: NodeJS.Platform;

  constructor(options: WindowsDpapiOptions = {}) {
    this.runner = options.runner ?? new SpawnCommandRunner();
    this.platform = options.platform ?? process.platform;
  }

  isSupported(): boolean {
    return this.platform === "win32";
  }

  protect(plaintext: Buffer): Promise<Buffer> {
    return this.run(protectScript, plaintext);
  }

  unprotect(protectedBytes: Buffer): Promise<Buffer> {
    return this.run(unprotectScript, protectedBytes);
  }

  private async run(script: string, input: Buffer): Promise<Buffer> {
    if (!this.isSupported()) throw new DpapiUnavailableError();
    if (!input.byteLength) throw new Error("DPAPI input cannot be empty");
    const { stdout } = await this.runner.run({
      executable: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(script)],
      stdin: input.toString("base64"),
    });
    return decodeBase64(stdout);
  }
}
