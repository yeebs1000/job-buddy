import type { RouteObject } from "react-router-dom";
import { AppShell } from "../components/AppShell";

function Page({ title }: { title: string }) {
  return <section><h1>{title}</h1></section>;
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Page title="Your application journey" /> },
      { path: "applications", element: <Page title="Applications" /> },
      { path: "applications/:id", element: <Page title="Application details" /> },
      { path: "updates", element: <Page title="Updates" /> },
      { path: "prepare", element: <Page title="Prepare" /> },
      { path: "profile", element: <Page title="Profile" /> },
      { path: "settings", element: <Page title="Settings" /> },
    ],
  },
];
