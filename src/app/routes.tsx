import type { RouteObject } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CommandCenterPage } from "../features/command-center/CommandCenterPage";
import { ApplicationsPage } from "../features/applications/ApplicationsPage";
import { ApplicationDetailPage } from "../features/application-detail/ApplicationDetailPage";
import { ImportTrackerPage } from "../features/import-export/ImportTrackerPage";
import { UpdateInboxPage } from "../features/updates/UpdateInboxPage";

function Page({ title }: { title: string }) {
  return <section><h1>{title}</h1></section>;
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <CommandCenterPage /> },
      { path: "import", element: <ImportTrackerPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "applications/:id", element: <ApplicationDetailPage /> },
      { path: "updates", element: <UpdateInboxPage /> },
      { path: "prepare", element: <Page title="Prepare" /> },
      { path: "profile", element: <Page title="Profile" /> },
      { path: "settings", element: <Page title="Settings" /> },
    ],
  },
];
