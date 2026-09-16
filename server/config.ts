import { jobBuddyDesktopClientId } from "./gmail/desktopClient";

const host = "127.0.0.1" as const;
const port = 43117 as const;
const redirectUri = "http://127.0.0.1:43117/api/gmail/oauth/callback" as const;

export interface CompanionConfig {
  host: typeof host;
  port: typeof port;
  google: null | {
    clientId: string;
    clientSecret?: string;
    redirectUri: typeof redirectUri;
  };
  uiOrigins: readonly string[];
}

export function readCompanionConfig(env: NodeJS.ProcessEnv): CompanionConfig {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim() || jobBuddyDesktopClientId;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
  const clientType = env.GOOGLE_OAUTH_CLIENT_TYPE?.trim() || (env.GOOGLE_OAUTH_CLIENT_ID ? "web" : "desktop");
  const configuredRedirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || redirectUri;

  if (!["web", "desktop"].includes(clientType)) throw new Error("Google OAuth client type must be web or desktop");
  if ((clientType === "web" && Boolean(clientId) !== Boolean(clientSecret)) || (!clientId && clientSecret)) {
    throw new Error("Google OAuth client ID and secret must be configured together");
  }
  if (clientId && configuredRedirectUri !== redirectUri) {
    throw new Error("Google OAuth redirect URI must use the configured loopback callback");
  }

  return {
    host,
    port,
    google: clientId ? { clientId, ...(clientSecret ? { clientSecret } : {}), redirectUri } : null,
    uiOrigins: ["http://127.0.0.1:5173", "http://127.0.0.1:43117"],
  };
}
