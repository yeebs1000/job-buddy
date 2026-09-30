import { BrowserRouter, useRoutes } from "react-router-dom";
import { appRoutes } from "./routes";
import { useEffect, useState } from "react";
import { prepareLiveWorkspace } from "../db/liveWorkspace";

function AppRoutes() {
  return useRoutes(appRoutes);
}

export function App() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (state !== "loading") return;
    let active = true;
    prepareLiveWorkspace().then(() => { if (active) setState("ready"); }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, [state]);
  if (state === "error") return <main><h1>Your tracker could not be opened</h1><p>No records were deleted. Please retry.</p><button onClick={() => setState("loading")}>Retry</button></main>;
  if (state !== "ready") return <main aria-busy="true"><p role="status">Opening your local tracker…</p></main>;
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
