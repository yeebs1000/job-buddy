import { resolve } from "node:path";
import { BuddyService } from "./buddy/BuddyService";
import { BuddyStore } from "./buddy/BuddyStore";
import { PairingService } from "./buddy/PairingService";
import { readCompanionConfig } from "./config";
import { GmailConnectionService } from "./gmail/GmailConnectionService";
import { GmailSyncService } from "./gmail/GmailSyncService";
import { GmailTransport } from "./gmail/GmailTransport";
import { createCompanionServer } from "./http/createCompanionServer";
import { ProfileService } from "./profile/ProfileService";
import { WindowsDpapiProfileVault } from "./profile/WindowsDpapiProfileVault";
import { ConnectionMetadataStore } from "./secrets/ConnectionMetadataStore";
import { WindowsDpapiSecretStore } from "./secrets/WindowsDpapiSecretStore";
import { ResearchCache } from "./research/ResearchCache";
import { ResearchService } from "./research/ResearchService";
import { SingaporeMomAdapter } from "./research/adapters/SingaporeMomAdapter";
import { HongKongCsdAdapter } from "./research/adapters/HongKongCsdAdapter";
import { UnitedStatesBlsAdapter } from "./research/adapters/UnitedStatesBlsAdapter";
import { DiscoveryService } from "./discovery/DiscoveryService";
import { FxService } from "./research/FxService";
import { DesktopClientStore } from "./gmail/DesktopClientStore";

const desktopClientStore = new DesktopClientStore();
const environmentConfig = readCompanionConfig(process.env);
const config = environmentConfig.google ? environmentConfig : readCompanionConfig(process.env, await desktopClientStore.get());
const developmentOrigin = "http://127.0.0.1:5173";
const productionOrigin = "http://127.0.0.1:43117";
const uiOrigin = process.env.JOB_BUDDY_UI_ORIGIN === developmentOrigin ? developmentOrigin : productionOrigin;
const secrets = new WindowsDpapiSecretStore();
const metadata = new ConnectionMetadataStore();
const connection = new GmailConnectionService({ config, secrets, metadata, saveDesktopClientId: (id) => desktopClientStore.save(id) });
const sync = new GmailSyncService(new GmailTransport(connection));
const profile = new ProfileService(new WindowsDpapiProfileVault());
const buddyStore = new BuddyStore();
const buddy = new BuddyService({ pairing: new PairingService({ store: buddyStore }), profile, store: buddyStore });
const research = new ResearchService({
  cache: new ResearchCache(),
  sources: [new SingaporeMomAdapter(), new HongKongCsdAdapter(), new UnitedStatesBlsAdapter()],
});
const server = createCompanionServer({
  services: { connection, sync, profile, buddy, research, discovery: new DiscoveryService(), fx: new FxService() },
  allowedOrigins: config.uiOrigins,
  uiOrigin,
  ...(uiOrigin === productionOrigin ? { staticDir: resolve("dist") } : {}),
});

server.listen(config.port, config.host, () => {
  console.log(`Job Buddy is available at ${uiOrigin}`);
});
