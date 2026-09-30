import type { RouteObject } from "react-router-dom";
import { lazy } from "react";
import { AppShell } from "../components/AppShell";
import { CommandCenterPage } from "../features/command-center/CommandCenterPage";
const ApplicationsPage = lazy(() => import("../features/applications/ApplicationsPage").then(module => ({ default: module.ApplicationsPage })));
const ApplicationDetailPage = lazy(() => import("../features/application-detail/ApplicationDetailPage").then(module => ({ default: module.ApplicationDetailPage })));
const ImportTrackerPage = lazy(() => import("../features/import-export/ImportTrackerPage").then(module => ({ default: module.ImportTrackerPage })));
const UpdateInboxPage = lazy(() => import("../features/updates/UpdateInboxPage").then(module => ({ default: module.UpdateInboxPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then(module => ({ default: module.SettingsPage })));
const ProfilePage = lazy(() => import("../features/profile/ProfilePage").then(module => ({ default: module.ProfilePage })));
const DiscoveryPage = lazy(() => import("../features/discovery/DiscoveryPage").then(module => ({ default: module.DiscoveryPage })));

function Page({ title }: { title: string }) {
  return <section><h1>{title}</h1><p>Interview preparation is planned for V2. For now, save interview details and notes with each application.</p></section>;
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <CommandCenterPage /> },
      { path: "import", element: <ImportTrackerPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "discover", element: <DiscoveryPage /> },
      { path: "applications/:id", element: <ApplicationDetailPage /> },
      { path: "updates", element: <UpdateInboxPage /> },
      { path: "prepare", element: <Page title="Prepare" /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
];
