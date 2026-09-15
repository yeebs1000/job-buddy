import { resolve } from "node:path";
import { readCompanionConfig } from "./config";
import { GmailConnectionService } from "./gmail/GmailConnectionService";
import { GmailSyncService } from "./gmail/GmailSyncService";
import { GmailTransport } from "./gmail/GmailTransport";
import { createCompanionServer } from "./http/createCompanionServer";
import { ConnectionMetadataStore } from "./secrets/ConnectionMetadataStore";
import { WindowsDpapiSecretStore } from "./secrets/WindowsDpapiSecretStore";

const config = readCompanionConfig(process.env);
const developmentOrigin = "http://127.0.0.1:5173";
const productionOrigin = "http://127.0.0.1:43117";
const uiOrigin = process.env.JOB_BUDDY_UI_ORIGIN === developmentOrigin ? developmentOrigin : productionOrigin;
const secrets = new WindowsDpapiSecretStore();
const metadata = new ConnectionMetadataStore();
const connection = new GmailConnectionService({ config, secrets, metadata });
const sync = new GmailSyncService(new GmailTransport(connection));
const server = createCompanionServer({
  services: { connection, sync },
  allowedOrigins: config.uiOrigins,
  uiOrigin,
  ...(uiOrigin === productionOrigin ? { staticDir: resolve("dist") } : {}),
});

server.listen(config.port, config.host, () => {
  console.log(`Job Buddy is available at ${uiOrigin}`);
});
