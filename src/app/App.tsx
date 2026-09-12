import { BrowserRouter, useRoutes } from "react-router-dom";
import { appRoutes } from "./routes";

function AppRoutes() {
  return useRoutes(appRoutes);
}

export function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
